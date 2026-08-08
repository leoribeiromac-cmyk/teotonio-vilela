// A prancha do executivo da Teotônio deixou de ser PDF e virou pirâmide de
// quadrados. O que estes testes protegem:
//
//  • ABRIR É BARATO. A folha inteira ampliada tem 835 quadrados / ~13 MB;
//    abrir a tela pode custar algumas dezenas de KB, não isso. Se alguém
//    quebrar a escolha de nível ou o recorte do que está visível, o app
//    volta a baixar a prancha toda no 4G do canteiro — e esse é exatamente
//    o problema que a pirâmide veio resolver.
//  • PAPEL EM BRANCO NÃO VIRA PEDIDO. 393 dos 952 quadrados do nível mais
//    fino são só papel; o manifesto diz quais existem. Um 404 aqui significa
//    que o bitmap e os arquivos saíram de sincronia.
//  • APROXIMAR TROCA DE NÍVEL. É o que garante que a cota de 2,9 pt fica
//    legível em vez de borrada.
//  • A FOLHA NÃO ESCAPA DA CAIXA por mais que se arraste.
//  • GIRAR reenquadra — sem isso, uma folha 3,3× mais larga que alta fica
//    numa tira de 2 cm no celular em pé.
//
// Como rodar:  node tests/projetos-prancha.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8124;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
const encerrar = () => { try { srv.kill(); } catch (e) { } };
process.on('exit', encerrar);

// Uma pinça de verdade não dá para pedir ao Playwright; estes são os mesmos
// eventos que o navegador manda quando dois dedos encostam na tela.
async function pincar(p, alvo, de, para) {
  await p.evaluate(({ sel, de, para }) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (tipo, id, x, y) => el.dispatchEvent(new PointerEvent(tipo, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 1,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    ev('pointerdown', 1, cx - de / 2, cy); ev('pointerdown', 2, cx + de / 2, cy);
    for (let k = 1; k <= 6; k++) {
      const d = de + (para - de) * (k / 6);
      ev('pointermove', 1, cx - d / 2, cy); ev('pointermove', 2, cx + d / 2, cy);
    }
    ev('pointerup', 1, cx - para / 2, cy); ev('pointerup', 2, cx + para / 2, cy);
  }, { sel: alvo, de, para });
  await p.waitForTimeout(300);
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // Celular em pé: é onde a prancha é lida de verdade.
  const ctx = await b.newContext({
    viewport: { width: 412, height: 900 }, deviceScaleFactor: 3,
    hasTouch: true, isMobile: true,
  });
  const p = await ctx.newPage();

  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t);
  });

  const quadrados = [];        // {url, status, bytes}
  p.on('response', async (r) => {
    const u = r.url();
    if (!/\/projetos\/.+\.webp$/.test(u)) return;
    let bytes = 0;
    try { bytes = (await r.body()).length; } catch (_) { }
    quadrados.push({ url: u.replace(BASE, ''), status: r.status(), bytes });
  });

  await p.route('**://script.google.com/**', (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback');
    route.fulfill({ status: 200, contentType: 'application/javascript', body: cb + '({"ok":true})' });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);

  console.log('\nA PRANCHA ABRE');
  await p.evaluate(() => navigate('projetos'));
  await p.waitForSelector('.proj-quadrado', { timeout: 15000 });
  await p.waitForTimeout(900);

  const man = await p.evaluate(() => ({
    tile: VISOR.man.tile, lg: VISOR.man.larguraPt, at: VISOR.man.alturaPt,
    niveis: VISOR.niveis.length, bytes: VISOR.man.bytes,
    totalQuadrados: VISOR.niveis.reduce((s, n) => {
      let t = 0;
      for (let i = 0; i < n.rows * n.cols; i++) if (n.mapa[i >> 3] & (0x80 >> (i & 7))) t++;
      return s + t;
    }, 0),
  }));
  ok('o manifesto da pirâmide carregou', man.niveis > 3, JSON.stringify(man));
  ok('a folha tem o tamanho da prancha A1 recortada', man.lg > 2000 && man.at > 600,
    man.lg + ' x ' + man.at + ' pt');

  ok('só uma prancha: a lista de seleção some', await p.evaluate(() => !document.querySelector('.proj-lista')));

  const naAbertura = quadrados.slice();
  const kb = naAbertura.reduce((s, q) => s + q.bytes, 0) / 1024;
  ok('abrir custa uma fração da pirâmide',
    kb < 900 && kb > 5,
    kb.toFixed(0) + ' KB de ' + (man.bytes / 1048576).toFixed(1) + ' MB (' +
    naAbertura.length + ' de ' + man.totalQuadrados + ' quadrados)');

  ok('nenhum quadrado pedido em vão (papel em branco não é arquivo)',
    naAbertura.every(q => q.status === 200),
    JSON.stringify(naAbertura.filter(q => q.status !== 200).slice(0, 4)));

  const nivelAbertura = await p.evaluate(() => {
    const vivos = VISOR.niveis.map((n, i) => (n.quadrados.size ? i : -1)).filter(i => i >= 0);
    return { vivos, s: VISOR.s, fit: VISOR.fit };
  });
  ok('a folha inteira abre num nível grosso, não no mais fino',
    Math.max(...nivelAbertura.vivos) <= man.niveis - 3, JSON.stringify(nivelAbertura));
  ok('e abre enquadrada (100%)', Math.abs(nivelAbertura.s - nivelAbertura.fit) < 1e-6,
    nivelAbertura.s + ' vs ' + nivelAbertura.fit);

  console.log('\nAPROXIMAR');
  await pincar(p, '.proj-mapa', 60, 640);
  await p.waitForTimeout(800);
  const apos = await p.evaluate(() => ({
    s: VISOR.s, fit: VISOR.fit, max: VISOR.max,
    vivos: VISOR.niveis.map((n, i) => (n.quadrados.size ? i : -1)).filter(i => i >= 0),
  }));
  ok('a pinça amplia de verdade', apos.s > nivelAbertura.s * 3,
    (apos.s / apos.fit).toFixed(1) + '× o enquadramento');
  ok('e a pirâmide desce para um nível mais fino',
    Math.max(...apos.vivos) > Math.max(...nivelAbertura.vivos), JSON.stringify(apos.vivos));
  ok('o nível grosso continua ali por baixo, para não abrir buraco branco',
    apos.vivos.includes(Math.min(2, man.niveis - 1)), JSON.stringify(apos.vivos));
  ok('o zoom respeita o teto (nada de ampliar borrão)', apos.s <= apos.max + 1e-9,
    apos.s + ' / ' + apos.max);

  // Ir do panorama à leitura de cota atravessa três níveis de uma vez. O que
  // se cobra aqui é que o gasto seja o da VISTA FINAL (uma tela cheia de
  // quadrados do nível fino), e não os níveis do caminho baixados para serem
  // descartados — nem, muito menos, a pirâmide inteira.
  const novos = quadrados.slice(naAbertura.length);
  const kbPinca = novos.reduce((s, q) => s + q.bytes, 0) / 1024;
  ok('e ampliar até o talo custa uma tela de quadrados, não a pirâmide',
    novos.length < 45 && kbPinca < 750,
    novos.length + ' quadrados / ' + kbPinca.toFixed(0) + ' KB de ' +
    (man.bytes / 1048576).toFixed(1) + ' MB');

  console.log('\nARRASTAR');
  const antesDrag = await p.evaluate(() => ({ tx: VISOR.tx, ty: VISOR.ty }));
  await p.mouse.move(200, 400);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(200 - i * 22, 400);
  await p.mouse.up();
  await p.waitForTimeout(500);
  const depoisDrag = await p.evaluate(() => ({ tx: VISOR.tx, ty: VISOR.ty }));
  ok('arrastar anda pela prancha', Math.abs(depoisDrag.tx - antesDrag.tx) > 40,
    'tx ' + antesDrag.tx.toFixed(0) + ' -> ' + depoisDrag.tx.toFixed(0));

  // Puxão longo para fora: a folha tem de parar na borda da caixa.
  await p.evaluate(() => { VISOR.tx += 90000; VISOR.ty += 90000; visorAplicar(); });
  const escapou = await p.evaluate(() => {
    const m = VISOR.man, a = VISOR.rot * Math.PI / 180, co = Math.cos(a), se = Math.sin(a);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    [[0, 0], [m.larguraPt, 0], [m.larguraPt, m.alturaPt], [0, m.alturaPt]].forEach(q => {
      const px = VISOR.tx + VISOR.s * (q[0] * co - q[1] * se);
      const py = VISOR.ty + VISOR.s * (q[0] * se + q[1] * co);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    });
    return { x0, y0, x1, y1, cx: VISOR.cx, cy: VISOR.cy };
  });
  ok('a folha não escapa da caixa',
    escapou.x0 <= 1 && escapou.y0 <= 1 && escapou.x1 >= escapou.cx - 1 && escapou.y1 >= escapou.cy - 1,
    JSON.stringify(escapou));

  console.log('\nBOTÕES');
  await p.evaluate(() => prachaAjustar());
  await p.waitForTimeout(600);
  const ajustado = await p.evaluate(() => ({ s: VISOR.s, fit: VISOR.fit, rotulo: document.getElementById('projZoom').textContent }));
  ok('"Ajustar" volta a enquadrar a folha', Math.abs(ajustado.s - ajustado.fit) < ajustado.fit * 0.02,
    ajustado.s + ' vs ' + ajustado.fit);
  ok('e o rótulo mostra 100%', ajustado.rotulo === '100%', ajustado.rotulo);

  // Folha 3,3× mais larga que alta numa caixa em pé: deitada, "cabe na
  // largura" vira "cabe na altura" e a prancha cresce ~1,6× (mais ainda em
  // tela cheia). É por isso que ela ABRE deitada no celular.
  const emPe = await p.evaluate(() => {
    const m = VISOR.man;
    return {
      rot: VISOR.rot, giroManual: VISOR.giroManual,
      reto: Math.min(VISOR.cx / m.larguraPt, VISOR.cy / m.alturaPt),
      deitado: Math.min(VISOR.cx / m.alturaPt, VISOR.cy / m.larguraPt),
    };
  });
  ok('no celular em pé a prancha abre DEITADA, sozinha', emPe.rot === 90, String(emPe.rot));
  ok('e deitada mostra bem mais desenho', emPe.deitado > emPe.reto * 1.4,
    emPe.reto.toFixed(3) + ' -> ' + emPe.deitado.toFixed(3));
  ok('mas isso ainda não conta como escolha de quem lê', emPe.giroManual === false);

  await p.evaluate(() => prachaGirar());
  await p.waitForTimeout(300);
  const giro = await p.evaluate(() => ({ rot: VISOR.rot, fit: VISOR.fit, s: VISOR.s, manual: VISOR.giroManual }));
  ok('"Girar" vira mais 90°', giro.rot === 180, String(giro.rot));
  ok('e a partir daí a orientação é escolha de quem lê', giro.manual === true);
  ok('o giro já entra enquadrado', Math.abs(giro.s - giro.fit) < giro.fit * 0.02);
  await p.evaluate(() => { prachaGirar(); prachaGirar(); });
  ok('quatro giros voltam ao começo', (await p.evaluate(() => VISOR.rot)) === 0);
  await p.evaluate(() => { prachaGirar(); });   // devolve a folha deitada

  console.log('\nTELA CHEIA');
  const altaAntes = await p.evaluate(() => VISOR.cy);
  await p.evaluate(() => prachaTelaCheia());
  await p.waitForTimeout(400);
  const cheia = await p.evaluate(() => ({
    classe: !!document.querySelector('.proj-visor.cheia'), cy: VISOR.cy,
    travado: document.body.classList.contains('proj-cheia-ativa'),
  }));
  ok('tela cheia cresce a área do desenho', cheia.classe && cheia.cy > altaAntes,
    altaAntes + ' -> ' + cheia.cy);
  ok('e trava a rolagem da página atrás', cheia.travado);
  await p.evaluate(() => prachaTelaCheia());
  await p.waitForTimeout(300);
  ok('sair da tela cheia devolve a página', await p.evaluate(() =>
    !document.querySelector('.proj-visor.cheia') && !document.body.classList.contains('proj-cheia-ativa')));

  console.log('\nSAIR E VOLTAR');
  await p.evaluate(() => { VISOR.s = VISOR.fit * 4; visorAplicar(); });
  const guardado = await p.evaluate(() => ({ s: VISOR.s, tx: VISOR.tx, ty: VISOR.ty }));
  await p.evaluate(() => navigate('galeria'));
  await p.waitForTimeout(500);
  ok('sair da tela desmonta o visor', await p.evaluate(() => VISOR.folha === null));
  await p.evaluate(() => navigate('projetos'));
  await p.waitForSelector('.proj-quadrado', { timeout: 10000 });
  await p.waitForTimeout(600);
  const voltou = await p.evaluate(() => ({ s: VISOR.s, tx: VISOR.tx, ty: VISOR.ty }));
  ok('voltar devolve o mesmo pedaço da prancha que se estava lendo',
    Math.abs(voltou.s - guardado.s) < 1e-6 && Math.abs(voltou.tx - guardado.tx) < 1,
    JSON.stringify(guardado) + ' -> ' + JSON.stringify(voltou));

  console.log('\nO QUE NÃO PODE MAIS APARECER');
  const html = await p.evaluate(() => document.body.innerHTML);
  ok('as cinco pranchas de urbanismo saíram do cadastro', !/urbanismo-10\d/.test(html));
  ok('nenhum erro de página', err.length === 0, err.slice(0, 3).join(' | '));

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.');
  await b.close();
  encerrar();
  process.exit(falhas ? 1 : 0);
})();
