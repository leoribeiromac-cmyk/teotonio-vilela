// MUROS DE CONTENÇÃO, DE PONTA A PONTA — no app de verdade, no navegador.
//
// O teste de dados (tests/muros-contencao.test.js) prova que a matriz fecha
// com o contrato. Este prova o caminho inteiro: pacote que a planilha ainda
// não tem aparece na tela de lançamento, o RDO lançado em METRO DE MURO vira
// consumo por item contratual na prévia de medição, e a prévia bate com a
// Planilha Geral — inclusive nos cinco códigos que o capítulo 10.0 divide
// com outros capítulos.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   npx playwright install chromium    (uma vez)
//   node tests/muros-medicao.ui.test.js
const { chromium } = require('playwright');
const path = require('path');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

global.window = {};
require(path.join(__dirname, '..', 'dados', 'teotonio-muros.js'));
const MUROS = global.window.OBRAS_COMPLEMENTO['teotonio'];

// Quantidades do capítulo 10.0 (coluna "Aditamento" da Planilha Geral).
const CONTRATO = {
  '169': 940.01, '169-A': 2193.35, '170': 3133.36, '171': 130490.07,
  '172': 2193.352, '173': 1565.02, '174': 54.32275, '175': 1227.355,
  '176': 27902, '177': 311.78675, '177-A': 49.63525, '177-B': 234.56375,
  '177-C': 7655, '177-D': 27.85, '177-E': 16.60, '177-F': 1.70,
  '177-G': 147, '177-H': 266.59875, '177-I': 27.225, '177-J': 625.01,
};

// ------------------------------------------------------- planilha de mentira
const GID = { cronograma: '565093066', pacotes: '386002450', coeficientes: '1962881430',
              rdoavanco: '1906961773', rdodiario: '1234324544' };

const PACOTES_BASE = [
  'ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status,Observação',
  'P26,Pav. Flexível,BGS,m²,17389,40,Ativo,Espessura 15cm',
  'P25,Pav. Flexível,Rachão,m²,3598,40,Ativo,Espessura 60cm',
].join('\r\n');

// A matriz que já existe usa os MESMOS códigos do capítulo do muro (05-48-00
// e 05-20-00) sem nº de item. É exatamente a colisão que a prévia tem de
// separar — por isso os dois pacotes acima entram no teste.
const COEF_BASE = [
  'Pacote ID,Pacote Nome,Item Contratual,Descrição Item,Unid Item,Coef,Unid Coef,Tipo',
  'P26,BGS,05-48-00,Brita graduada simples,M3,"0,15",m³/m²,Manual',
  'P25,Rachão,05-20-00,Fundação de rachão,M3,"0,6",m³/m²,Manual',
].join('\r\n');

const csvEsc = v => /[",\r\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

// RDO com TODOS os pacotes de muro a 100% — é o cenário em que a prévia tem
// de reproduzir o contrato inteiro. Junto vai um lançamento de BGS do
// pavimento (P26), que consome o MESMO código 05-48-00 do item 177-A do muro:
// é essa colisão que a prévia tem de mostrar em duas linhas.
function rdoCompleto() {
  const cab = 'id,Data,Pacote_ID,Quantidade,Local_Estaca,Equipe,Apontador,Turno,obra';
  const linha = (id, pid, q) =>
    [id, '2026-09-10', pid, String(q).replace('.', ','), '', 'Sena', 'Wallace', 'Diurno', 'teotonio']
      .map(csvEsc).join(',');
  return [cab, ...MUROS.pacotes.map((p, i) => linha('r' + i, p.id, p.qtd)),
          linha('rbgs', 'P26', 1000)].join('\r\n');
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1380, height: 900 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  let pacotesCSV = PACOTES_BASE;      // trocável entre os cenários
  let rdoCSV = 'id,Data,Pacote_ID,Quantidade,obra';

  await p.route('**://docs.google.com/**', route => {
    const gid = new URL(route.request().url()).searchParams.get('gid');
    const corpo = gid === GID.pacotes      ? pacotesCSV
                : gid === GID.coeficientes ? COEF_BASE
                : gid === GID.rdoavanco    ? rdoCSV
                : '';
    route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: corpo });
  });
  await p.route('**://script.google.com/**', route => {
    const u = new URL(route.request().url());
    const cb = u.searchParams.get('callback');
    const acao = u.searchParams.get('action');
    const corpo = acao === 'login' ? { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' }
                : acao === 'usuariosNomes' ? { ok: true, usuarios: ['Leonardo'] }
                : { ok: true };
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(corpo)})` });
  });

  const recarregar = () => p.evaluate(() => carregarTudo());

  // =============================================================== CENÁRIO 1
  console.log('A PLANILHA NÃO TEM OS MUROS — O APP TEM');
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  // STATE é `const` no escopo do script, não vive em window — daí o typeof.
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded, null, { timeout: 15000 });

  const cad = await p.evaluate(() => ({
    pacotes: STATE.pacotes.map(x => getCSVField(x, 'ID')),
    frentes: [...new Set(STATE.pacotes.map(x => getCSVField(x, 'Frente')))],
    coefs: STATE.coeficientes.length,
    qtdP37A: num(getCSVField(STATE.pacotes.find(x => getCSVField(x, 'ID') === 'P37A'), 'Qtd Estimada')),
    prodP39C: produtividadeDe('P39C'),
  }));
  ok('os 13 pacotes de muro entraram', MUROS.pacotes.every(m => cad.pacotes.includes(m.id)),
    JSON.stringify(MUROS.pacotes.map(m => m.id).filter(id => !cad.pacotes.includes(id))));
  ok('e os 2 da planilha continuam lá', ['P25', 'P26'].every(id => cad.pacotes.includes(id)));
  ok('a frente nova aparece', cad.frentes.includes('Muro de Contenção'), JSON.stringify(cad.frentes));
  ok('2 + 67 coeficientes', cad.coefs === 2 + MUROS.coeficientes.length, cad.coefs);
  ok('quantidade quebrada chega inteira (42,25 e não 4225)', Math.abs(cad.qtdP37A - 42.25) < 1e-9, cad.qtdP37A);
  ok('produtividade quebrada também (2,5 e não 25)', Math.abs(cad.prodP39C - 2.5) < 1e-9, cad.prodP39C);

  // =============================================================== CENÁRIO 2
  console.log('\nLANÇADO EM METRO DE MURO, MEDIDO POR ITEM CONTRATUAL');
  rdoCSV = rdoCompleto();
  await recarregar();
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.rdoavanco.length > 0, null, { timeout: 15000 });

  const consumo = await p.evaluate(() => {
    const av = calcularAvancoPorPacote();
    return {
      itens: Object.values(calcularConsumoItens(av)).map(x =>
        ({ item: x.item, plan: x.itemPlanilha, qtd: x.consumido })),
      avancoMuroE: av['P39C'] ? av['P39C'].pct : null,
    };
  });
  ok('o Muro E — fuste marca 100%', Math.abs(consumo.avancoMuroE - 1) < 1e-9, consumo.avancoMuroE);

  const porItem = {};
  consumo.itens.forEach(x => { if (x.plan) porItem[x.plan] = x.qtd; });
  Object.keys(CONTRATO).forEach(it => {
    const d = porItem[it];
    const rel = d == null ? 1 : Math.abs(d - CONTRATO[it]) / Math.max(CONTRATO[it], 1e-9);
    ok(`item ${it} → ${CONTRATO[it]}`, rel < 1e-4, d == null ? 'não saiu na prévia' : d.toFixed(4));
  });

  // A colisão de código: 05-48-00 tem de sair em DUAS linhas — a do muro
  // (item 177-A) e a do pavimento, que não tem nº de item.
  const brita = consumo.itens.filter(x => x.item === '05-48-00');
  ok('05-48-00 sai separado: muro e pavimento em linhas distintas', brita.length === 2,
    JSON.stringify(brita));
  ok('e a linha do muro traz o nº do item', brita.some(x => x.plan === '177-A'), JSON.stringify(brita));

  // =============================================================== CENÁRIO 3
  console.log('\nDEPOIS DE COLAR AS LINHAS NA PLANILHA, NADA DUPLICA');
  const daPlanilha = MUROS.pacotes.slice(0, 3).map(m =>
    [m.id, m.frente, m.pacote, m.un, String(m.qtd).replace('.', ','),
     String(m.produtividade).replace('.', ','), 'Ativo', 'veio da planilha'].map(csvEsc).join(','));
  pacotesCSV = [PACOTES_BASE, ...daPlanilha].join('\r\n');
  rdoCSV = 'id,Data,Pacote_ID,Quantidade,obra';
  await recarregar();
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.pacotes.some(x => getCSVField(x, 'Observação') === 'veio da planilha'),
    null, { timeout: 15000 });

  const dep = await p.evaluate(() => STATE.pacotes.map(x => ({
    id: getCSVField(x, 'ID'), obs: getCSVField(x, 'Observação') })));
  const conta = id => dep.filter(x => x.id === id).length;
  ok('P37A não duplicou', conta('P37A') === 1, conta('P37A'));
  ok('e é a versão da PLANILHA que ficou',
    dep.find(x => x.id === 'P37A').obs === 'veio da planilha',
    dep.find(x => x.id === 'P37A').obs);
  ok('os pacotes que a planilha ainda não tem seguem vindo do app', conta('P39C') === 1);
  ok('total continua 15 (2 + 13)', dep.length === 15, dep.length);

  // =============================================================== CENÁRIO 4
  console.log('\nA TELA DE LANÇAMENTO');
  // A tela de lançamento exige login (podeVer('rdo')).
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 5000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(600);
  const tela = await p.evaluate(() => {
    const sel = [...document.querySelectorAll('select[data-field="frente"]')][0];
    return { frentes: sel ? [...sel.options].map(o => o.textContent.trim()) : [] };
  });
  ok('"Muro de Contenção" está no seletor de frente',
    tela.frentes.includes('Muro de Contenção'), JSON.stringify(tela.frentes));

  const icone = await p.evaluate(() => ({
    escolhido: icFrente('Muro de Contenção'),
    existe: !!ICONES['fMuroContencao'],
    slug: frenteSlug('Muro de Contenção'),
  }));
  ok('icFrente() escolhe o ícone do muro', icone.escolhido === 'fMuroContencao', icone.escolhido);
  ok('e o ícone existe mesmo', icone.existe);
  ok('a tag da frente tem classe própria', icone.slug === 'Muro', icone.slug);

  const etapa = await p.evaluate(() => ({
    doFuste: etapaAnteriorDe('P39C'),
    daPrimeira: etapaAnteriorDe('P39A'),
    doPavRigido: etapaAnteriorDe('P30C'),
    deUmSemEtapa: etapaAnteriorDe('P26'),
  }));
  ok('a etapa anterior do fuste é a sapata', etapa.doFuste === 'P39B', etapa.doFuste);
  ok('a primeira etapa não tem anterior', etapa.daPrimeira === null, etapa.daPrimeira);
  ok('pacote sem etapas não inventa anterior', etapa.deUmSemEtapa === null, etapa.deUmSemEtapa);

  ok('nenhum erro de JS no caminho todo', err.length === 0, JSON.stringify(err.slice(0, 3)));

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
