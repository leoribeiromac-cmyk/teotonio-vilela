// Verifica o caminho do login no navegador, com o Apps Script FALSO:
// intercepta script.google.com e responde o JSONP na hora, para medir o que
// o app faz — e o que ele deixou de fazer.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   npx playwright install chromium    (uma vez)
//   node tests/login.ui.test.js
//
// Se o Chromium estiver em outro lugar, ajuste `executablePath` abaixo ou
// tire a opção para o Playwright usar o dele.
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  const chamadas = [];
  let atrasoServidor = 0;
  await p.route('**://script.google.com/**', async (route) => {
    const u = new URL(route.request().url());
    const acao = u.searchParams.get('action');
    const cb = u.searchParams.get('callback');
    chamadas.push(acao);
    let corpo;
    if (acao === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo', 'Wallace', 'Guilherme'] };
    else if (acao === 'login') corpo = { ok: true, usuario: u.searchParams.get('usuario'),
                                         perfil: 'admin', token: 'tok-falso', obras: '*' };
    else corpo = { ok: true };
    if (atrasoServidor) await new Promise(r => setTimeout(r, atrasoServidor));
    route.fulfill({ status: 200, contentType: 'application/javascript',
                    body: `${cb}(${JSON.stringify(corpo)})` });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);

  console.log('LISTA DE NOMES — quantas voltas ao servidor');
  ok('busca os nomes uma vez na abertura',
    chamadas.filter(a => a === 'usuariosNomes').length === 1,
    JSON.stringify(chamadas));

  chamadas.length = 0;
  // zera a janela anti-rajada para a abertura de login abaixo contar do zero
  await p.evaluate(() => { _usuariosNomesBuscadoEm = 0; });
  for (let i = 0; i < 4; i++) {
    await p.evaluate(() => navigate('rdo'));
    await p.waitForTimeout(250);
    await p.evaluate(() => navigate('executivo'));
    await p.waitForTimeout(150);
  }
  /* A tela de login SEMPRE revalida a lista em segundo plano — mesmo fresca.
     Era o contrário (economizar a chamada), e o efeito em obra foi: o admin
     cadastrava o apontador num aparelho e o nome levava até 12 h para
     aparecer no dropdown do celular do apontador. O dropdown continua
     abrindo na hora com a lista guardada; a chamada só o atualiza.
     A rajada (4 aberturas em ~1,6 s) tem de virar UMA busca: a janela de
     5 s segura os renders duplicados sem atrasar quem abre para entrar. */
  ok('abrir o login revalida a lista mesmo fresca — e a rajada vira UMA busca',
    chamadas.filter(a => a === 'usuariosNomes').length === 1,
    JSON.stringify(chamadas));

  ok('a lista fresca fica gravada com carimbo',
    await p.evaluate(() => !!localStorage.getItem(CONFIG.ls.usuariosUIEm)));

  const velho = await p.evaluate(() => {
    localStorage.setItem(CONFIG.ls.usuariosUIEm, String(Date.now() - 13 * 60 * 60 * 1000));
    return usuariosNomesEstaoFrescos();
  });
  ok('depois de 12 h ela volta a ser buscada', velho === false, velho);

  console.log('\nBOTÃO ENTRAR — o clique tem de dar sinal na hora');
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 5000 });
  atrasoServidor = 1200;                      // servidor lento de propósito

  chamadas.length = 0;
  const antes = await p.evaluate(() => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    fazerLogin();                              // sem await: quero ver o estado NO ATO
    const b = document.getElementById('loginBtn');
    return { texto: b.textContent.trim(), travado: b.disabled };
  });
  ok('o botão avisa "Entrando…" imediatamente', /Entrando/.test(antes.texto), antes.texto);
  ok('e fica travado enquanto espera', antes.travado === true);

  // segundo clique durante a espera não pode disparar outro login
  await p.evaluate(() => { fazerLogin(); fazerLogin(); });
  await p.waitForTimeout(2500);
  ok('três cliques na espera viram UM login só',
    chamadas.filter(a => a === 'login').length === 1, JSON.stringify(chamadas));

  const depois = await p.evaluate(() => ({
    logado: STATE.usuarioLogado, token: localStorage.getItem(CONFIG.ls.token) }));
  ok('o login conclui normalmente', depois.logado === 'Leonardo' && depois.token === 'tok-falso',
    JSON.stringify(depois));

  console.log('\nSENHA ERRADA — o botão tem de voltar ao normal');
  await p.evaluate(() => { try { fazerLogout(); } catch (e) {} });
  await p.waitForTimeout(500);
  await p.unroute('**://script.google.com/**');
  await p.route('**://script.google.com/**', (route) => {
    const u = new URL(route.request().url());
    const cb = u.searchParams.get('callback');
    const corpo = u.searchParams.get('action') === 'login'
      ? { ok: false, error: 'CREDENCIAIS_INVALIDAS' } : { ok: true };
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(corpo)})` });
  });
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 5000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'errada';
    await fazerLogin();
  });
  const solto = await p.evaluate(() => {
    const b = document.getElementById('loginBtn');
    return { texto: b.textContent.trim(), travado: b.disabled };
  });
  ok('volta a dizer "Entrar"', /Entrar$/.test(solto.texto), solto.texto);
  ok('e destrava para tentar de novo', solto.travado === false);

  console.log('\n--- ERROS DE JS (' + err.length + ') ---');
  [...new Set(err)].slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || err.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await b.close();
  process.exit(falhas || err.length ? 1 : 0);
})();
