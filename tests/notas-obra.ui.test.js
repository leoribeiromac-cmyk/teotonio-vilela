// A tela de Notas tem de mostrar SEMPRE as notas da obra aberta — e ter um
// filtro para trocar sem sair da tela. Antes o adaptador devolvia a Teotônia
// fixa: nota lançada com o Ranário aberto ia carimbada como Teotônio, e a
// lista era a mesma em qualquer obra.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   npx playwright install chromium    (uma vez)
//   node tests/notas-obra.ui.test.js
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// o servidor falso guarda uma nota por obra, e devolve SÓ as da obra pedida
const NOTAS = {
  teotonio: [{ id: 'nt1', clientId: 'nt1', obra: 'teotonio', numero: '1001', dataEmissao: '2026-07-01',
               dataEntrada: '2026-07-02', razaoSocial: 'Fornecedor da Teotonio', vTotal: 500,
               status: 'Recebida', usuario: 'Leonardo', itens: '[]' }],
  ranario:  [{ id: 'nr1', clientId: 'nr1', obra: 'ranario', numero: '2002', dataEmissao: '2026-07-03',
               dataEntrada: '2026-07-04', razaoSocial: 'Fornecedor do Ranario', vTotal: 800,
               status: 'Recebida', usuario: 'Leonardo', itens: '[]' }]
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  const pedidos = [];       // {acao, obra} de cada chamada ao servidor
  const responder = (params) => {
    const acao = params.action;
    pedidos.push({ acao, obra: params.obra || '' });
    if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo'] };
    if (acao === 'login') return { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 'tok', obras: '*' };
    if (acao === 'nfListar') return { ok: true, notas: NOTAS[params.obra] || [], saidas: [] };
    if (acao === 'nfSalvar') return { ok: true, id: params.id };
    return { ok: true };
  };
  await p.route('**://script.google.com/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const params = {};
    u.searchParams.forEach((v, k) => params[k] = v);
    if (req.method() === 'POST') {
      (req.postData() || '').split('&').forEach(par => {
        const [k, v] = par.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
      });
    }
    const corpo = responder(params);
    if (params.callback) {
      return route.fulfill({ status: 200, contentType: 'application/javascript',
                             body: `${params.callback}(${JSON.stringify(corpo)})` });
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);

  // entra como admin (a tela de Notas exige login)
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 5000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(600);

  console.log('A OBRA ATIVA MANDA');
  ok('o adaptador acompanha a obra aberta, não é mais fixo',
    await p.evaluate(() => obra().id === OBRA.id));

  await p.evaluate(() => navigate('notas'));
  await p.waitForTimeout(900);

  ok('a tela pede as notas DA OBRA ABERTA',
    pedidos.some(x => x.acao === 'nfListar' && x.obra === 'teotonio'),
    JSON.stringify(pedidos.filter(x => x.acao === 'nfListar')));

  let tela = await p.evaluate(() => document.getElementById('page').textContent);
  ok('mostra a nota da Teotônio', /Fornecedor da Teotonio/.test(tela));
  ok('não mostra a nota do Ranário', !/Fornecedor do Ranario/.test(tela));

  console.log('\nO FILTRO DE OBRA');
  ok('a faixa de obra aparece na tela de Notas',
    await p.evaluate(() => !!document.querySelector('.nf-obra')));
  const opcoes = await p.evaluate(() =>
    [...document.querySelectorAll('#nfObraSel option')].map(o => o.value));
  ok('o filtro traz as três obras', opcoes.length === 3, JSON.stringify(opcoes));
  ok('e vem marcado na obra aberta',
    await p.evaluate(() => document.getElementById('nfObraSel').value === OBRA.id));

  pedidos.length = 0;
  await p.evaluate(() => trocarObra('ranario', { manterTela: true }));
  await p.waitForTimeout(1200);

  ok('trocar pelo filtro NÃO joga a pessoa para o painel',
    await p.evaluate(() => STATE.currentPage) === 'notas',
    await p.evaluate(() => STATE.currentPage));
  ok('a obra ativa mudou', await p.evaluate(() => OBRA.id) === 'ranario');
  ok('e a tela buscou as notas do Ranário',
    pedidos.some(x => x.acao === 'nfListar' && x.obra === 'ranario'),
    JSON.stringify(pedidos.filter(x => x.acao === 'nfListar')));

  tela = await p.evaluate(() => document.getElementById('page').textContent);
  ok('agora mostra a nota do Ranário', /Fornecedor do Ranario/.test(tela));
  ok('e some com a da Teotônio', !/Fornecedor da Teotonio/.test(tela));

  console.log('\nAS NOTAS DE CADA OBRA FICAM SEPARADAS NO APARELHO');
  const guardado = await p.evaluate(() => ({
    teotonio: JSON.parse(localStorage.getItem('gestor:nf:teotonio') || '[]').map(n => n.numero),
    ranario:  JSON.parse(localStorage.getItem('gestor:nf:ranario')  || '[]').map(n => n.numero)
  }));
  ok('cada obra tem a sua chave', guardado.teotonio.join() === '1001' && guardado.ranario.join() === '2002',
    JSON.stringify(guardado));

  console.log('\nTROCAR PELA BARRA LATERAL SEGUE INDO AO PAINEL');
  await p.evaluate(() => trocarObra('teotonio'));
  await p.waitForTimeout(500);
  ok('sem manterTela, volta ao Painel Executivo',
    await p.evaluate(() => STATE.currentPage) === 'executivo',
    await p.evaluate(() => STATE.currentPage));

  console.log('\nUSUÁRIO RESTRITO A UMA OBRA');
  await p.evaluate(() => {
    localStorage.setItem('teotonio_obras_permitidas_v1', JSON.stringify(['ranario']));
    trocarObra('ranario');
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => navigate('notas'));
  await p.waitForTimeout(700);
  ok('com uma obra só, a faixa vira aviso e não seletor',
    await p.evaluate(() => !!document.querySelector('.nf-obra') && !document.getElementById('nfObraSel')));
  ok('e diz de qual obra é a lista',
    /Notas de/.test(await p.evaluate(() => document.querySelector('.nf-obra').textContent)));

  console.log('\n--- ERROS DE JS (' + err.length + ') ---');
  [...new Set(err)].slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || err.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await b.close();
  process.exit(falhas || err.length ? 1 : 0);
})();
