// A tela de Equipamentos existe em TODAS as obras — mas cada obra fala com
// o SEU backend e vê só a própria frota:
//
//   • a Teotônio segue no Apps Script LEGADO do app de campo (URL no campo
//     `equipamentos` do cadastro dela) — nada muda para quem já aponta lá;
//   • as demais obras falam com o backend principal (Code.gs), que separa
//     as abas de equipamentos pela coluna `obra`.
//
// Antes, o módulo inteiro era o da Teotônio: quem abria o Ranário via o
// menu, o cartão da Central de Campo e o painel com a frota e as horas da
// Teotônio — e podia até apontar nela. Este teste cobra a regra nova de
// ponta a ponta na interface: item presente nas duas obras, backend certo
// em cada uma, e o cache zerado na troca para nada atravessar.
//
// Como rodar:
//   node tests/equip-por-obra.ui.test.js   (o harness sobe o servidor sozinho)
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// O que cada backend devolve — nomes bem diferentes, para um vazamento
// aparecer no texto da tela na hora.
const EQ_TEO = [{ nome: 'Escavadeira Teotônio', tipo: 'Linha Amarela', vinculo: 'Locado', locadora: 'Locarma' }];
const EQ_RAN = [{ nome: 'Motoniveladora Ranário', tipo: 'Linha Amarela', vinculo: 'Próprio', locadora: '' }];
const AP_TEO = [{ carimbo: 't1', data: '2026-08-13', turno: 'Diurno', equipamento: 'Escavadeira Teotônio',
  operador: 'C. Melo', horas: '9', status: 'OperandoNormalmente', combustivel: '80', horimInicial: '10', horimFinal: '19', observacoes: '' }];
const AP_RAN = [
  { carimbo: 'r1', data: '2026-08-13', turno: 'Diurno', equipamento: 'Motoniveladora Ranário',
    operador: 'A. Costa', horas: '9', status: 'OperandoNormalmente', combustivel: '80', horimInicial: '100', horimFinal: '109', observacoes: '' },
  { carimbo: 'r2', data: '2026-08-12', turno: 'Diurno', equipamento: 'Motoniveladora Ranário',
    operador: 'A. Costa', horas: '8', status: 'OperandoNormalmente', combustivel: '75', horimInicial: '92', horimFinal: '100', observacoes: '' },
];

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' } });
  const { p } = s;

  const URL_LEGADO = await p.evaluate(() => OBRAS_CFG.teotonio.equipamentos);
  const URL_PRINCIPAL = await p.evaluate(() => OBRAS_CFG.teotonio.appsScript);
  ok('o cadastro da Teotônio declara o backend legado', /^https:\/\/script\.google\.com\//.test(URL_LEGADO), URL_LEGADO);
  ok('e ele NÃO é o backend principal', URL_LEGADO !== URL_PRINCIPAL);

  // O harness responde JSONP para tudo; o módulo de equipamentos usa fetch
  // puro e espera JSON. Esta rota entra NA FRENTE (LIFO) e atende só as
  // ações de equipamentos, cada backend com a sua frota; o resto cai no
  // harness (route.fallback).
  const equipChamadas = [];
  await p.route('**://script.google.com/**', async route => {
    const u = new URL(route.request().url());
    const acao = u.searchParams.get('action') || '';
    const DE_EQUIP = ['listas', 'ultimos', 'relatorio', 'equipListar', 'equipUltimos', 'equipApontamentos'];
    if (DE_EQUIP.indexOf(acao) === -1) return route.fallback();
    const legado = u.toString().indexOf(URL_LEGADO) === 0;
    equipChamadas.push({ acao, obra: u.searchParams.get('obra') || '', legado });
    let corpo;
    if (acao === 'listas' || acao === 'equipListar') {
      corpo = { ok: true, equipamentos: legado ? EQ_TEO : EQ_RAN, locadoras: [] };
    } else {
      corpo = { ok: true, apontamentos: legado ? AP_TEO : AP_RAN };
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });

  const esperaDropdown = nome => p.waitForFunction(n => {
    const sel = document.getElementById('equipamento');
    return sel && [...sel.options].some(o => o.value === n);
  }, nome, { timeout: 10000 }).then(() => true).catch(() => false);

  const esperaPainel = txt => p.waitForFunction(t => {
    const c = document.getElementById('painelCorpo');
    return c && c.textContent.indexOf(t) !== -1;
  }, txt, { timeout: 10000 }).then(() => true).catch(() => false);

  console.log('NA TEOTÔNIO — backend legado do app de campo');

  await s.ir('equip');
  await p.waitForSelector('#apontamentoForm', { timeout: 10000 });
  ok('a tela abre e a frota vem do backend LEGADO', await esperaDropdown('Escavadeira Teotônio'));
  const chTeo = equipChamadas.filter(c => c.acao === 'listas' || c.acao === 'equipListar');
  ok('a chamada de listas foi para o legado, no protocolo legado',
     chTeo.length > 0 && chTeo.every(c => c.legado && c.acao === 'listas'), JSON.stringify(chTeo));

  await p.evaluate(() => EQ.abrirPainel());
  ok('o painel mostra as horas da Teotônio', await esperaPainel('Escavadeira Teotônio'));
  const cacheTeo = await p.evaluate(() => ({ carregado: EQUIP.carregado, n: EQUIP.apontamentos.length }));
  ok('o cache guarda os apontamentos da Teotônio', cacheTeo.carregado === true && cacheTeo.n === 1, JSON.stringify(cacheTeo));
  await p.evaluate(() => EQ.fechar('painelModal'));

  console.log('\nNO RANÁRIO — mesmo item de menu, backend PRINCIPAL');

  await p.evaluate(() => trocarObra('ranario'));
  await p.waitForSelector('.cc-grid', { timeout: 10000 });

  const ran = await p.evaluate(() => ({
    obra: OBRA.id,
    menu: !!document.querySelector('.nav-item[data-page="equip"]'),
    cache: { carregado: EQUIP.carregado, n: EQUIP.apontamentos.length },
    cc: (document.querySelector('.cc-grid') || {}).textContent || '',
  }));
  ok('a troca levou ao Ranário', ran.obra === 'ranario', ran.obra);
  ok('o item Equipamentos CONTINUA no menu', ran.menu);
  ok('a Central de Campo mantém o cartão de equipamentos', /Equipamentos/.test(ran.cc), ran.cc.slice(0, 120));
  ok('mas o cache da Teotônio foi zerado na troca', ran.cache.carregado === false && ran.cache.n === 0, JSON.stringify(ran.cache));

  equipChamadas.length = 0;
  await s.ir('equip');
  await p.waitForSelector('#apontamentoForm', { timeout: 10000 });
  ok('a tela abre igual, com o formulário de apontamento', true);
  ok('a frota agora é a do Ranário', await esperaDropdown('Motoniveladora Ranário'));
  const vazouDropdown = await p.evaluate(() =>
    [...document.getElementById('equipamento').options].some(o => o.value === 'Escavadeira Teotônio'));
  ok('e a da Teotônio NÃO aparece no formulário', !vazouDropdown);
  const chRan = equipChamadas.filter(c => c.acao === 'listas' || c.acao === 'equipListar');
  ok('a chamada foi para o backend principal, com a obra',
     chRan.length > 0 && chRan.every(c => !c.legado && c.acao === 'equipListar' && c.obra === 'ranario'),
     JSON.stringify(chRan));

  await p.evaluate(() => EQ.abrirPainel());
  ok('o painel mostra as horas do Ranário', await esperaPainel('Motoniveladora Ranário'));
  const painelRan = await p.evaluate(() => ({
    texto: document.getElementById('painelCorpo').textContent,
    n: EQUIP.apontamentos.length,
  }));
  ok('sem nenhuma hora da Teotônio no meio', painelRan.texto.indexOf('Escavadeira Teotônio') === -1);
  ok('o cache agora é o do Ranário', painelRan.n === 2, painelRan.n + ' apontamento(s)');
  const chRel = equipChamadas.filter(c => ['relatorio', 'equipApontamentos'].indexOf(c.acao) !== -1);
  ok('o relatório também saiu no dialeto principal, com a obra',
     chRel.length > 0 && chRel.every(c => !c.legado && c.acao === 'equipApontamentos' && c.obra === 'ranario'),
     JSON.stringify(chRel));
  await p.evaluate(() => EQ.fechar('painelModal'));

  console.log('\nDE VOLTA À TEOTÔNIO');

  equipChamadas.length = 0;
  await p.evaluate(() => trocarObra('teotonio'));
  await p.waitForSelector('.cc-grid', { timeout: 10000 });
  const volta = await p.evaluate(() => ({ carregado: EQUIP.carregado, n: EQUIP.apontamentos.length }));
  ok('o cache do Ranário não atravessa de volta', volta.carregado === false && volta.n === 0, JSON.stringify(volta));
  await s.ir('equip');
  await p.waitForSelector('#apontamentoForm', { timeout: 10000 });
  ok('a frota volta a ser a da Teotônio', await esperaDropdown('Escavadeira Teotônio'));
  const chVolta = equipChamadas.filter(c => c.acao === 'listas' || c.acao === 'equipListar');
  ok('de novo no backend legado', chVolta.length > 0 && chVolta.every(c => c.legado && c.acao === 'listas'), JSON.stringify(chVolta));

  ok('sem erro de página no caminho todo', s.erros.length === 0, s.erros[0]);

  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
