// A Galeria baixava TODAS as fotos ao abrir, cada uma em resolução cheia.
// Estes testes provam que agora ela busca só o que entra na tela, e em
// miniatura — e que ampliar continua trazendo a foto de verdade.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   npx playwright install chromium    (uma vez)
//   node tests/galeria.ui.test.js
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const N_FOTOS = 60;
const KB = (n) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.round(n * 1024 * 4 / 3));

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1380, height: 900 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  let pedidos = [];               // {fileId, mini} de cada obterFoto
  let servidorTemMini = true;     // desligável para simular backend não republicado
  await p.route('**://script.google.com/**', (route) => {
    const u = new URL(route.request().url());
    const acao = u.searchParams.get('action');
    const cb = u.searchParams.get('callback');
    let corpo;
    if (acao === 'login') corpo = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo'] };
    else if (acao === 'obterFoto') {
      const querMini = u.searchParams.get('mini') === '1';
      const fileId = u.searchParams.get('fileId');
      pedidos.push({ fileId, mini: querMini });
      const devolveMini = querMini && servidorTemMini;
      corpo = devolveMini
        ? { ok: true, mini: true, dataUri: KB(20) }
        : { ok: true, mini: false, dataUri: KB(250) };   // backend antigo nem manda `mini`
      if (!servidorTemMini) delete corpo.mini;
    }
    else corpo = { ok: true };
    route.fulfill({ status: 200, contentType: 'application/javascript',
                    body: `${cb}(${JSON.stringify(corpo)})` });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 5000 });
  await p.evaluate(async () => {
    document.getElementById('loginUserSelect').value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(500);

  const semearFotos = (n) => p.evaluate((qtd) => {
    STATE.rdoavanco = Array.from({ length: qtd }, (_, i) => ({
      ID: 'r' + i, Data: '2026-07-' + String((i % 28) + 1).padStart(2, '0'),
      Turno: 'Diurno', Pacote_Nome: 'Pavimentação CBUQ', Pacote_ID: 'P26',
      Local_Estaca: 'E1' + (100 + i), Quantidade: '12', Unidade: 'm2',
      Apontador: 'Wallace', foto_link: 'drive_id:FOTO' + i
    }));
  }, n);
  const limparCache = () => p.evaluate(async () => {
    _fotoMemCache.clear();
    const d = await idbAbrir();
    await new Promise(res => {
      const t = d.transaction(IDB_STORE, 'readwrite');
      t.objectStore(IDB_STORE).clear(); t.oncomplete = res; t.onerror = res;
    });
  });

  await semearFotos(N_FOTOS);
  pedidos = [];
  await p.evaluate(() => navigate('galeria'));
  await p.waitForSelector('[id^="galbox-"]', { timeout: 8000 });
  await p.waitForTimeout(2500);

  console.log('SÓ BUSCA O QUE ESTÁ NA TELA');
  const naTela = await p.evaluate(() => {
    const alt = innerHeight;
    return [...document.querySelectorAll('[id^="galbox-"]')]
      .filter(d => { const r = d.getBoundingClientRect(); return r.top < alt && r.bottom > 0; }).length;
  });
  ok('a tela mostra menos quadros do que o total', naTela > 0 && naTela < N_FOTOS,
    naTela + ' de ' + N_FOTOS);
  ok('não baixou as ' + N_FOTOS + ' fotos', pedidos.length < N_FOTOS, pedidos.length + ' chamadas');
  ok('baixou o que está à vista (com a margem de adiantamento)',
    pedidos.length >= naTela, pedidos.length + ' chamadas para ' + naTela + ' na tela');

  console.log('\nE PEDE MINIATURA, NÃO A FOTO INTEIRA');
  ok('toda chamada da galeria pede mini', pedidos.length > 0 && pedidos.every(x => x.mini),
    JSON.stringify(pedidos.slice(0, 3)));
  // a galeria ordena da foto mais NOVA para a mais velha: o primeiro quadro
  // da tela não é FOTO0. Pega o id do que realmente foi desenhado primeiro.
  const primeiro = await p.evaluate(() =>
    (document.querySelector('[id^="galbox-"]') || {}).id.slice(7));
  ok('a miniatura fica em chave própria do cache',
    await p.evaluate(async (id) => !!(await fotoLer('mini:' + id)), primeiro), primeiro);
  ok('e não é confundida com a foto cheia',
    await p.evaluate(async (id) => !(await fotoLer(id)), primeiro));

  console.log('\nROLAR CARREGA O RESTO');
  const antes = pedidos.length;
  await p.evaluate(() => { const c = document.getElementById('page').parentElement;
    (c && c.scrollHeight > c.clientHeight ? c : document.scrollingElement).scrollTop = 99999; });
  await p.waitForTimeout(2500);
  ok('rolar até o fim pede as que faltavam', pedidos.length > antes,
    antes + ' → ' + pedidos.length);
  ok('e nenhuma foto é pedida duas vezes',
    new Set(pedidos.map(x => x.fileId)).size === pedidos.length,
    pedidos.length + ' chamadas, ' + new Set(pedidos.map(x => x.fileId)).size + ' fotos');

  console.log('\nAMPLIAR TRAZ A FOTO DE VERDADE');
  pedidos = [];
  await p.evaluate((id) => ampliarFoto(id, 'CBUQ'), primeiro);
  await p.waitForTimeout(150);
  ok('abre na hora com a miniatura, sem esperar a rede',
    await p.evaluate(() => { const i = document.getElementById('fotoAmp');
      return !!i && i.style.display !== 'none' && !!i.src; }));
  await p.waitForTimeout(1500);
  ok('pediu a foto CHEIA', pedidos.length === 1 && pedidos[0].mini === false,
    JSON.stringify(pedidos));
  ok('e a janela terminou mostrando a cheia',
    await p.evaluate(() => (document.getElementById('fotoAmp') || {}).src?.length > 100000));
  await p.evaluate(() => { const j = document.getElementById('fotoAmp');
    if (j) j.parentElement.remove(); });

  console.log('\nO CACHE DE MEMÓRIA TEM TETO');
  ok('não guarda mais que o limite',
    await p.evaluate(() => _fotoMemCache.size <= FOTO_MEM_MAX),
    await p.evaluate(() => _fotoMemCache.size + ' de ' + FOTO_MEM_MAX));

  console.log('\nCOM O BACKEND AINDA NÃO REPUBLICADO');
  servidorTemMini = false;
  await limparCache();
  pedidos = [];
  await p.evaluate(() => { STATE.currentPage = 'executivo'; render(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => navigate('galeria'));
  await p.waitForSelector('[id^="galbox-"]', { timeout: 8000 });
  // a tela pode ter ficado rolada da etapa anterior: volta ao topo
  await p.evaluate(() => { const c = document.getElementById('page').parentElement;
    (c && c.scrollHeight > c.clientHeight ? c : document.scrollingElement).scrollTop = 0; });
  await p.waitForTimeout(2500);
  ok('a galeria continua aparecendo', await p.evaluate(() =>
    [...document.querySelectorAll('[id^="gal-"]')].some(i => i.style.display === 'block')));
  ok('e a tela AVISA que falta republicar o Code.gs', await p.evaluate(() => {
    const c = document.getElementById('galAvisoServidor');
    return !!c && c.style.display !== 'none' && /tamanho cheio/.test(c.textContent);
  }));
  // uma que REALMENTE carregou nesta rodada
  const prim2 = await p.evaluate(() =>
    ([...document.querySelectorAll('[id^="gal-"]')].find(i => i.style.display === 'block') || {}).id.slice(4));
  ok('a cheia recebida vira também a miniatura do cache',
    await p.evaluate(async (id) => !!(await fotoLer('mini:' + id)), prim2), prim2);
  ok('e é guardada como cheia, para ampliar não baixar de novo',
    await p.evaluate(async (id) => !!(await fotoLer(id)), prim2));
  const antesAmp = pedidos.length;
  await p.evaluate((id) => ampliarFoto(id, 'CBUQ'), prim2);
  await p.waitForTimeout(900);
  ok('ampliar não vai ao servidor quando a cheia já está aqui',
    pedidos.length === antesAmp, (pedidos.length - antesAmp) + ' chamada(s) a mais');

  console.log('\n--- ERROS DE JS (' + err.length + ') ---');
  [...new Set(err)].slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || err.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await b.close();
  process.exit(falhas || err.length ? 1 : 0);
})();
