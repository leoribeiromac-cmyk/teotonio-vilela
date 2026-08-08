// O service worker serve js/ e dados/ CACHE-PRIMEIRO, e o index.html vem
// REDE-PRIMEIRO. Sem `?v=` nas tags <script>, o aparelho abria o index NOVO
// junto com os módulos do dia anterior — e correções já publicadas
// simplesmente não rodavam no celular de quem já usava o app.
//
// Este teste monta uma cópia do app numa pasta temporária, publica uma versão
// "ANTIGA", esquenta o cache do service worker com ela, publica a "NOVA" e
// confere que a página não fica com um pé em cada versão.
//
// Como rodar:  node tests/sw-versao.ui.test.js
//   (sobe o próprio servidor numa porta separada; não depende do 8099)
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const D = path.join(os.tmpdir(), 'teotonio-sw-versao');
const PORTA = 8123;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// ---------- monta a cópia de trabalho ----------
fs.rmSync(D, { recursive: true, force: true });
fs.mkdirSync(D, { recursive: true });
for (const f of ['index.html', 'sw.js', 'manifest.json', 'favicon.svg', 'js', 'dados', 'vendor']) {
  const o = path.join(RAIZ, f);
  if (fs.existsSync(o)) fs.cpSync(o, path.join(D, f), { recursive: true });
}
// marca de versão no índice e no módulo, para saber qual está rodando
fs.writeFileSync(path.join(D, 'js/nf/notas.js'),
  "window.__MARCA_NOTAS='ANTIGA';\n" + fs.readFileSync(path.join(D, 'js/nf/notas.js'), 'utf8'));
fs.writeFileSync(path.join(D, 'index.html'),
  fs.readFileSync(path.join(D, 'index.html'), 'utf8')
    .replace('<script src="js/ui/icones.js',
             "<script>window.__MARCA_INDEX='ANTIGA';</script>\r\n<script src=\"js/ui/icones.js"));

const V_ANTIGA = (fs.readFileSync(path.join(D, 'index.html'), 'utf8').match(/\?v=(\d+)/) || [])[1];
const V_NOVA = String(Number(V_ANTIGA) + 1);

function publicar(marca) {
  const v = marca === 'ANTIGA' ? V_ANTIGA : V_NOVA;
  fs.writeFileSync(path.join(D, 'js/nf/notas.js'),
    fs.readFileSync(path.join(D, 'js/nf/notas.js'), 'utf8')
      .replace(/window\.__MARCA_NOTAS='[^']*';/, "window.__MARCA_NOTAS='" + marca + "';"));
  fs.writeFileSync(path.join(D, 'index.html'),
    fs.readFileSync(path.join(D, 'index.html'), 'utf8')
      .replace(/window\.__MARCA_INDEX='[^']*';/, "window.__MARCA_INDEX='" + marca + "';")
      .replace(/\?v=\d+/g, '?v=' + v));
  fs.writeFileSync(path.join(D, 'sw.js'),
    fs.readFileSync(path.join(D, 'sw.js'), 'utf8')
      .replace(/const VERSAO = '[^']*'/, "const VERSAO = 'teste-" + marca + "'"));
}

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: D, stdio: 'ignore' });
const encerrar = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', encerrar);

(async () => {
  console.log('DESCOMPASSO DE VERSÕES ENTRE index.html E js/');
  ok('o index.html do repositório versiona os scripts', !!V_ANTIGA, 'não achei ?v= nas tags');
  if (!V_ANTIGA) { encerrar(); process.exit(1); }

  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  await p.route('**://script.google.com/**', r => {
    const cb = new URL(r.request().url()).searchParams.get('callback');
    r.fulfill({ status: 200, contentType: 'application/javascript', body: cb + '({"ok":true})' });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  publicar('ANTIGA');
  await p.goto('http://localhost:' + PORTA + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  // Na PRIMEIRA visita a página ainda não é controlada pelo service worker,
  // então os <script> não passam por ele e nada é cacheado. Recarrega até a
  // versão ANTIGA estar de fato guardada — que é a situação de quem já usa
  // o app há dias, e a única em que o descompasso aparece.
  let quente = false;
  for (let i = 0; i < 12 && !quente; i++) {
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1200);
    quente = await p.evaluate(async (v) => {
      for (const n of await caches.keys()) {
        const r = await (await caches.open(n)).match(location.origin + '/js/nf/notas.js?v=' + v);
        if (r) return (await r.text()).indexOf("__MARCA_NOTAS='ANTIGA'") > -1;
      }
      return false;
    }, V_ANTIGA);
  }
  ok('a versão ANTIGA fica guardada no cache do service worker', quente);

  publicar('NOVA');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(() => ({ index: window.__MARCA_INDEX, notas: window.__MARCA_NOTAS }));
  ok('o index.html novo chegou', r.index === 'NOVA', r.index);
  ok('e o js/nf/notas.js veio JUNTO, na mesma versão', r.notas === 'NOVA',
    'index=' + r.index + ' notas=' + r.notas);

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.');
  await b.close();
  encerrar();
  process.exit(falhas ? 1 : 0);
})();
