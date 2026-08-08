// As duas listas do Histórico são tabelas de nove colunas. Num aparelho de
// 390 px elas ficavam com 1268 px de largura dentro de um cartão que rolava de
// lado — e ninguém rola de lado dentro de um cartão. Na prática, tudo depois
// da quarta coluna não existia para quem usa o app no canteiro: quantidade,
// estaca, equipe, apontador, e os botões de editar, apagar, visualizar e
// gerar PDF.
//
// No celular cada linha agora vira um cartão. Este teste cobra que:
//   • nada passe da largura da tela, nas duas abas;
//   • os botões de ação estejam VISÍVEIS e do tamanho de um dedo;
//   • o cabeçalho da tabela não vire um cartão vazio;
//   • e que no computador a tabela continue sendo tabela.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/historico-mobile.ui.test.js
const { chromium } = require('playwright');

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

const DIAS = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];
const PACOTES = [
  ['P01', 'Estrutura de Concreto Armado', 'Concreto estrutural do decantador', 'm³', 1000],
  ['P02', 'Terraplenagem e Drenagem', 'Aterro compactado', 'm³', 9000],
];
const csvPacotes = ['ID,Frente,Pacote,Unidade Física,Qtd Estimada,Status,Observação']
  .concat(PACOTES.map(p => p.join(',') + ',Ativo,')).join('\n');

const N_SERV = 12;
const linhas = [];
for (let i = 1; i <= N_SERV; i++) {
  const p = PACOTES[i % 2];
  linhas.push(['A' + String(i).padStart(3, '0'), DIAS[i % 5], p[1], p[0], p[2],
    `E${100 + i} a E${130 + i} (CB)`, (12.5 * i).toFixed(2), p[3],
    i % 3 === 0 ? 'Noturno' : 'Diurno',
    'Equipe de Estrutura e Formas — Subempreiteira Alfa Construções Ltda',
    'Carlos Eduardo Apontador', 'Concretagem liberada após vistoria', 'teotonio']);
}
const csvAvanco = ['ID,Data,Frente,Pacote_ID,Pacote_Nome,Local_Estaca,Quantidade,Unidade,Turno,Equipe,Apontador,Observacao,Obra']
  .concat(linhas.map(l => l.map(v => (/[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(','))).join('\n');

const csvDiario = ['ID,Data,Clima_Manha,Clima_Tarde,Clima_Noite,Efetivo_JSON,Equipamentos_JSON,Ocorrencias,Observacoes_Gerais,Apontador_Diurno,Apontador_Noturno,Obra']
  .concat(DIAS.map((dia, i) => ['D' + String(i + 1).padStart(4, '0'), dia, 'Bom', 'Bom', i % 2 ? 'Chuva' : 'Bom',
    JSON.stringify({ padrao_diurno: { pedreiro: 8 + i, servente: 12 }, padrao_noturno: { pedreiro: 3 } }),
    JSON.stringify({ padrao_diurno: { veiculo_leve: 2 }, padrao_noturno: {} }),
    '', '', 'Carlos Apontador', 'Marina Apontadora', 'teotonio',
  ].map(v => (/[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(','))).join('\n');

async function abrir(navegador, largura, altura, celular) {
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    isMobile: !!celular, hasTouch: !!celular, deviceScaleFactor: celular ? 2 : 1,
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.route('**docs.google.com/**', rota => {
    const u = rota.request().url();
    const corpo = /1234324544/.test(u) ? csvDiario
                : /1906961773/.test(u) ? csvAvanco
                : /386002450/.test(u) ? csvPacotes : '';
    rota.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: corpo });
  });
  await p.route('**script.google*.com/**', rota => {
    const u = new URL(rota.request().url());
    const cb = u.searchParams.get('callback');
    const acao = u.searchParams.get('action') || '';
    let c = { ok: true };
    if (acao === 'login') c = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') c = { ok: true, usuarios: ['Leonardo'] };
    rota.fulfill({ status: 200, contentType: 'application/javascript',
                   body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1100);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 10000 });
  await p.evaluate(async () => {
    document.getElementById('loginUserSelect').value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(700);
  await p.evaluate(() => navigate('historico'));
  await p.waitForTimeout(900);
  return { p, erros };
}

// Um elemento só serve de verdade se estiver DENTRO da largura da tela e for
// grande o bastante para um dedo.
const alcancaveis = (p, sel) => p.evaluate((s) => {
  const W = window.innerWidth;
  return [...document.querySelectorAll(s)].map(e => {
    const r = e.getBoundingClientRect();
    return { txt: (e.textContent || '').trim().slice(0, 14), l: Math.round(r.left),
             d: Math.round(r.right), h: Math.round(r.height),
             dentro: r.left >= -1 && r.right <= W + 1, alto: r.height >= 38 };
  });
}, sel);

const estouro = (p, sel) => p.evaluate((s) => {
  const W = window.innerWidth;
  const fora = [];
  document.querySelectorAll(s).forEach(e => {
    const r = e.getBoundingClientRect();
    if (!r.width) return;
    if (r.right > W + 2 || r.left < -2)
      fora.push((e.tagName + '.' + (typeof e.className === 'string' ? e.className : '')).slice(0, 44)
                + ' [' + Math.round(r.left) + '…' + Math.round(r.right) + ']');
  });
  return { W, doc: document.documentElement.scrollWidth, fora: fora.slice(0, 4) };
}, sel);

(async () => {
  const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  console.log('HISTÓRICO NO CELULAR — 390×844');
  const { p, erros } = await abrir(navegador, 390, 844, true);

  // ---------- aba Serviços ----------
  const s1 = await estouro(p, '#page *');
  ok('Serviços: nada passa da largura da tela', s1.fora.length === 0 && s1.doc <= s1.W,
     s1.fora.join(' | ') || ('página com ' + s1.doc + 'px'));

  const cartoes = await p.evaluate(() => document.querySelectorAll('.t-cartoes tbody tr').length);
  ok('Serviços: uma linha vira um cartão', cartoes >= 12, cartoes + ' cartões');

  const vazios = await p.evaluate(() =>
    [...document.querySelectorAll('.t-cartoes thead tr')]
      .filter(tr => tr.getBoundingClientRect().height > 0).length);
  ok('Serviços: o cabeçalho da tabela não vira cartão vazio', vazios === 0, vazios + ' cartão(ões) fantasma');

  const acoesServ = await alcancaveis(p, '.t-cartoes .celula-acoes button');
  ok('Serviços: editar e apagar estão na tela', acoesServ.length > 0 && acoesServ.every(b => b.dentro),
     JSON.stringify(acoesServ.filter(b => !b.dentro).slice(0, 2)));
  ok('Serviços: e do tamanho de um dedo', acoesServ.every(b => b.alto),
     JSON.stringify(acoesServ.filter(b => !b.alto).slice(0, 2)));

  const rotulados = await p.evaluate(() =>
    ['ID', 'DATA', 'TURNO', 'QUANTIDADE', 'ESTACA', 'EQUIPE', 'APONTADOR']
      .filter(r => ![...document.querySelectorAll('.t-cartoes tbody tr:first-child td')]
        .some(td => (td.getAttribute('data-rot') || '').toUpperCase() === r)));
  ok('Serviços: cada campo do cartão vem com seu rótulo', rotulados.length === 0,
     'sem rótulo: ' + rotulados.join(', '));

  // a linha de edição continua abrindo, e ocupa o cartão inteiro
  await p.evaluate(() => histEditarServico(0));
  await p.waitForTimeout(400);
  const edicao = await p.evaluate(() => {
    const r = document.getElementById('hist-edit-row-0');
    const b = r.getBoundingClientRect();
    return { aberta: r.style.display !== 'none', larg: Math.round(b.width), W: window.innerWidth };
  });
  ok('Serviços: a edição abre e cabe na tela',
     edicao.aberta && edicao.larg <= edicao.W + 1, JSON.stringify(edicao));
  const s2 = await estouro(p, '#page *');
  ok('Serviços: nem com a edição aberta algo escapa', s2.fora.length === 0, s2.fora.join(' | '));

  // ---------- aba RDOs Diários ----------
  await p.evaluate(() => setHistoricoTab('diarios'));
  await p.waitForTimeout(800);

  const d1 = await estouro(p, '#page *');
  ok('RDOs: nada passa da largura da tela', d1.fora.length === 0 && d1.doc <= d1.W,
     d1.fora.join(' | ') || ('página com ' + d1.doc + 'px'));

  const acoesRdo = await alcancaveis(p, '.t-cartoes .celula-acoes button');
  ok('RDOs: ver, editar e gerar PDF estão na tela',
     acoesRdo.length >= 15 && acoesRdo.every(b => b.dentro),
     acoesRdo.length + ' botões; fora: ' + JSON.stringify(acoesRdo.filter(b => !b.dentro).slice(0, 2)));
  ok('RDOs: e do tamanho de um dedo', acoesRdo.every(b => b.alto),
     JSON.stringify(acoesRdo.filter(b => !b.alto).slice(0, 2)));
  ok('RDOs: os botões dizem o que fazem, não só o ícone',
     ['Ver', 'Editar', 'PDF'].every(t => acoesRdo.some(b => b.txt.includes(t))),
     JSON.stringify(acoesRdo.slice(0, 3).map(b => b.txt)));

  const caixas = await alcancaveis(p, '.rdo-check');
  ok('RDOs: a caixa de seleção do lote está na tela',
     caixas.length >= 5 && caixas.every(c => c.dentro), caixas.length + ' caixas');

  ok('sem erro de página', erros.length === 0, erros[0]);
  await p.context().close();

  // ---------- no computador continua sendo tabela ----------
  console.log('\nHISTÓRICO NO COMPUTADOR — 1440×900');
  const desk = await abrir(navegador, 1440, 900, false);
  const tabela = await desk.p.evaluate(() => {
    const t = document.querySelector('.t-cartoes');
    const th = t.querySelector('thead');
    return { display: getComputedStyle(t).display, cabecalho: getComputedStyle(th).display };
  });
  ok('a tabela continua tabela', tabela.display === 'table' && tabela.cabecalho !== 'none',
     JSON.stringify(tabela));
  ok('sem erro de página no computador', desk.erros.length === 0, desk.erros[0]);
  await desk.p.context().close();

  await navegador.close();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
