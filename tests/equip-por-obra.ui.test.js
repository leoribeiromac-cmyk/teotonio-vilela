// O módulo de Equipamentos nasceu no app da Teotônio e tem backend próprio,
// que NÃO separa por obra. Quando o sistema virou multi-obra, a tela veio
// junto para todas: quem abria o Ranário encontrava o menu, o cartão da
// Central de Campo e — pior — o painel com a frota e as horas da Teotônio,
// como se fossem da obra aberta. Hora de máquina é medição; dado de uma
// obra dentro da outra é medição errada.
//
// A régua que este teste cobra: a tela só existe na obra que declara a URL
// do backend no cadastro (`equipamentos` no OBRAS_CFG / dados/<obra>.js), e
// o cache lido pela Central de Campo e pela apresentação é ZERADO ao trocar
// de obra — nem menu, nem cartão, nem dado atravessam.
//
// Como rodar:
//   node tests/equip-por-obra.ui.test.js   (o harness sobe o servidor sozinho)
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' } });
  const { p } = s;

  console.log('NA TEOTÔNIO — a obra que TEM o módulo');

  const teo = await p.evaluate(() => ({
    obra: OBRA.id,
    podeVer: podeVer('equip'),
    menu: !!document.querySelector('.nav-item[data-page="equip"]'),
    urlCfg: String(OBRA.equipamentos || ''),
  }));
  ok('a obra ativa é a Teotônio', teo.obra === 'teotonio', teo.obra);
  ok('podeVer(equip) libera a tela', teo.podeVer === true);
  ok('o menu lateral mostra Equipamentos', teo.menu);
  ok('a URL do backend vem do cadastro da obra', /^https:\/\/script\.google\.com\//.test(teo.urlCfg), teo.urlCfg);

  await s.ir('equip');
  await p.waitForSelector('#apontamentoForm', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(400);
  const telaTeo = await p.evaluate(() => ({
    form: !!document.getElementById('apontamentoForm'),
    espelho: Array.isArray(EQUIP.equipamentos) && Array.isArray(EQUIP.locadoras),
  }));
  ok('a tela abre com o formulário de apontamento', telaTeo.form);
  ok('o espelho da frota existe (a apresentação lê EQUIP.equipamentos)', telaTeo.espelho);
  ok('a tela buscou as listas NA URL do cadastro',
     s.chamadas.some(c => c.acao === 'listas' && c.url.indexOf(teo.urlCfg) === 0),
     s.chamadas.filter(c => c.acao === 'listas').map(c => c.url.slice(0, 80)).join(' | ') || 'nenhuma chamada listas');

  // Simula o painel já aberto — é assim que a Central de Campo e a
  // apresentação recebem os apontamentos do módulo.
  await p.evaluate(() => {
    EQUIP.carregado = true;
    EQUIP.apontamentos = [{ data: getLocalISODate(new Date()), equipamento: 'Escavadeira CAT 320', horas: '9.0', status: 'OperandoNormalmente' }];
  });
  await s.ir('executivo');
  // navigate() troca a tela com animação (transitionTo, 160ms): esperar o
  // elemento, não um tempo fixo — senão se lê a tela ANTERIOR.
  await p.waitForSelector('.cc-grid', { timeout: 10000 });
  const ccTeo = await p.evaluate(() => (document.querySelector('.cc-grid') || {}).textContent || '');
  ok('a Central de Campo mostra o cartão de equipamentos', /Equipamentos/.test(ccTeo), ccTeo.slice(0, 120));
  ok('… com o apontamento de hoje contado', /1 apontamento/.test(ccTeo), ccTeo.slice(0, 120));

  console.log('\nNO RANÁRIO — obra SEM o módulo');
  const antes = s.chamadas.length;   // daqui em diante, nada de equip pode ser chamado
  await p.evaluate(() => trocarObra('ranario'));
  await p.waitForTimeout(600);

  await p.waitForSelector('.cc-grid', { timeout: 10000 });
  const ran = await p.evaluate(() => ({
    obra: OBRA.id,
    podeVer: podeVer('equip'),
    menu: !!document.querySelector('.nav-item[data-page="equip"]'),
    cache: { carregado: EQUIP.carregado, n: EQUIP.apontamentos.length },
    cc: (document.querySelector('.cc-grid') || {}).textContent || '',
  }));
  ok('a troca levou ao Ranário', ran.obra === 'ranario', ran.obra);
  ok('podeVer(equip) fecha a tela', ran.podeVer === false);
  ok('o menu lateral NÃO mostra Equipamentos', !ran.menu);
  ok('a Central de Campo existe e NÃO promete a tela que não há aqui',
     ran.cc.length > 0 && !/Equipamentos/.test(ran.cc), ran.cc.slice(0, 120));
  ok('o cache de apontamentos da Teotônio foi zerado', ran.cache.carregado === false && ran.cache.n === 0, JSON.stringify(ran.cache));

  // Chegar por fora do menu (estado guardado, link antigo, console) também
  // não pode abrir a frota da Teotônio dentro do Ranário.
  const forcada = await p.evaluate(() => {
    STATE.currentPage = 'equip';
    render();
    return {
      form: !!document.getElementById('apontamentoForm'),
      texto: (document.getElementById('page') || {}).textContent || '',
    };
  });
  ok('forçar a navegação não abre o formulário', !forcada.form);
  ok('… e a tela explica que é a OBRA que não tem o módulo', /não tem apontamento de equipamentos/i.test(forcada.texto), forcada.texto.slice(0, 160));

  const equipDepois = s.chamadas.slice(antes).filter(c => ['listas', 'relatorio', 'ultimos'].indexOf(c.acao) !== -1);
  ok('nenhuma chamada ao backend de equipamentos depois da troca', equipDepois.length === 0, JSON.stringify(equipDepois.map(c => c.acao)));

  console.log('\nDE VOLTA À TEOTÔNIO');
  await p.evaluate(() => trocarObra('teotonio'));
  await p.waitForTimeout(600);
  const volta = await p.evaluate(() => ({
    menu: !!document.querySelector('.nav-item[data-page="equip"]'),
    podeVer: podeVer('equip'),
  }));
  ok('o menu volta a mostrar Equipamentos', volta.menu && volta.podeVer);
  await s.ir('equip');
  const telaVolta = await p.waitForSelector('#apontamentoForm', { timeout: 10000 })
    .then(() => true).catch(() => false);
  ok('e a tela volta a abrir normalmente', telaVolta);

  ok('sem erro de página no caminho todo', s.erros.length === 0, s.erros[0]);

  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
