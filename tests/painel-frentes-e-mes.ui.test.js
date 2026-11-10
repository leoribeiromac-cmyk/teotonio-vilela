// O PAINEL NÃO SE DESMENTE: FRENTES, MÊS NO FILTRO E DIAS IMPRODUTIVOS.
//
// O que a revisão achou, todos na mesma tela que mostra o número grande certo:
//   • "Avançaram nos últimos 7 dias" somava o lançamento cru — a frente que
//     lançou por cima de um pacote JÁ CHEIO aparecia liderando o ritmo;
//   • a frente 100% concluída ficava para sempre em "Merecem atenção";
//   • o filtro de frente casava o Pacote_ID letra por letra (" p02 " sumia do
//     número ao clicar no cartão da frente);
//   • com um MÊS no filtro, o avanço de cada frente e os concluídos saíam
//     fatiados pelo mês (Demolição concluída aparecia com 0%), e "há quantos
//     dias a frente não lança" era contado até HOJE com os lançamentos só do mês;
//   • o nome da frente ia cru para o topo;
//   • o ajuste de avanço do escritório contava como serviço do dia nos Dias
//     Improdutivos (o dia de chuva parado saía "produtivo").
//
// Como rodar:  node tests/painel-frentes-e-mes.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = new Date();
const HOJE = iso(hoje);
const A10 = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 10));   // dois meses atrás
const B05 = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 5));    // mês passado
const B20 = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 20));
const B12 = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 12));
const MES_B = B05.slice(0, 7);
const diasNoMesB = new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();

const FRENTE_XSS = 'Sinalização<i id=xss>';
const PAC = H.csv([['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'],
  ['P01', 'Demolição', 'Demolição de pavimento', 'm²', '100', '10', 'Ativo', ''],
  ['P02', 'Drenagem', 'Tubo de concreto', 'm', '100', '10', 'Ativo', ''],
  ['P03', 'Pav. Flexível', 'BGTC - base', 'm³', '100', '10', 'Ativo', ''],
  ['P04', FRENTE_XSS, 'Pintura horizontal', 'm²', '100', '10', 'Ativo', '']]);
const CAB = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador', 'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
const L = (id, data, pid, qtd, turno) => [id, data, pid, qtd, 'E120 (CB)', 'Eq', turno === 'Ajuste' ? 'Ajuste' : 'Wallace', turno || 'Diurno', '', '', 'wallace', '', 'teotonio'];
const RDO = H.csv([CAB,
  L('r1', A10, 'P01', '100'),          // Demolição: concluída há dois meses
  L('r2', B05, 'P03', '100'),          // Pavimento: cheio no mês passado
  L('r3', B20, ' p02 ', '40'),         // Drenagem, com o id digitado torto
  L('r4', HOJE, 'P02', '20'),          // Drenagem hoje
  L('r5', HOJE, 'P03', '80'),          // Pavimento hoje, por cima do pacote já cheio
  L('r6', B12, 'P02', '5', 'Ajuste'),  // ajuste do escritório num dia parado por chuva
]);
const PARADA = JSON.stringify({ diurno: [{ motivo: 'Chuva', inicio: '07:00', fim: '17:00' }], noturno: [] });
const DIARIO = H.csv([['id', 'Data', 'Apontador_Diurno', 'Apontador_Noturno', 'Clima_Manha', 'Clima_Tarde', 'Clima_Noite', 'paralisacoes_json', 'obra'],
  ['d1', B12, 'Wallace', '', 'Chuva', 'Chuva', '', PARADA, 'teotonio']]);

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, pacotes: PAC, rdo: RDO, diario: DIARIO, coeficientes: '' });
  const p = s.p;
  await s.ir('executivo'); await p.waitForTimeout(600);

  console.log('AS FRENTES, SEM FILTRO');
  const a = await p.evaluate(() => ({
    destaques: STATE.dashData.fa.destaques.map(d => d.frente + ':' + (d.valor * 100).toFixed(1)),
    atencao: STATE.dashData.fa.atencao.map(x => x.frente + ':' + x.dias), total: STATE.dashData.fa.atencaoTotal,
    topo: STATE.dashData.metricsAcum.current,
  }));
  // (hoje a Drenagem ganha 15 de 100 — o ajuste de 5 já estava lá — = 1,5 de 40 dias-equivalentes)
  ok('quem lançou por cima do pacote já cheio NÃO aparece como destaque da semana',
     a.destaques.length === 1 && /^Drenagem:/.test(a.destaques[0]), a.destaques.join(' '));
  // (a Teotônio traz também a frente dos muros, do complemento do cadastro — nunca lançada aqui)
  ok('frente concluída não fica em "merecem atenção": só as que nunca lançaram',
     a.atencao.some(x => /^Sinalização.*:null$/.test(x)) && !a.atencao.some(x => /^(Demolição|Pav\. Flexível|Drenagem)/.test(x)), a.atencao.join(' | '));

  console.log('\nO FILTRO DE FRENTE');
  await p.evaluate(() => atualizarFiltro('frente', 'Drenagem')); await p.waitForTimeout(700);
  const f = await p.evaluate(() => ({ topo: STATE.dashData.metricsAcum.current, rdos: STATE.dashData.rdosAtivos.length }));
  ok('o lançamento com o id digitado " p02 " continua contando quando a frente é escolhida',
     f.rdos === 3 && Math.abs(f.topo - 0.65) < 1e-9, JSON.stringify(f));
  await p.evaluate(f => atualizarFiltro('frente', f), FRENTE_XSS); await p.waitForTimeout(700);
  ok('o nome da frente vai escapado para o topo', await p.evaluate(() => !document.getElementById('xss') &&
     /Sinalização<i id=xss>/.test(document.querySelector('.hero-period').textContent)));
  await p.evaluate(() => atualizarFiltro('frente', '')); await p.waitForTimeout(500);

  console.log('\nCOM O MÊS PASSADO NO FILTRO');
  await p.evaluate(m => atualizarFiltro('mes', m), MES_B); await p.waitForTimeout(800);
  const m = await p.evaluate(() => ({
    texto: document.getElementById('page').innerText.replace(/\s+/g, ' '),
    atencao: STATE.dashData.fa.atencao.map(x => x.frente.slice(0, 9) + ':' + x.dias),
    destaques: STATE.dashData.fa.destaques.map(d => d.frente),
  }));
  ok('a Demolição, concluída antes do mês, aparece com 100% (e não 0%)', /Demolição[^%]{0,120}100,0%/.test(m.texto), (m.texto.match(/Demolição[^%]{0,120}%/) || [''])[0]);
  ok('e os concluídos contam o que estava pronto até o fim do mês', /2 já concluídos/.test(m.texto), (m.texto.match(/\d+ já concluído\w*/) || [''])[0]);
  ok('"há quantos dias não lança" é contado até o FIM do mês, não até hoje',
     m.atencao.indexOf('Drenagem:' + (diasNoMesB - 20)) !== -1, m.atencao.join(' | ') + ' (esperava Drenagem:' + (diasNoMesB - 20) + ')');
  ok('e a frente concluída continua fora da lista', !m.atencao.some(x => /^Demoli/.test(x)), m.atencao.join(' | '));
  await p.evaluate(() => atualizarFiltro('mes', '')); await p.waitForTimeout(500);

  console.log('\nDIAS IMPRODUTIVOS');
  const di = await p.evaluate(([mes, dia]) => {
    const r = calcDiasImprodutivos(mes), x = r.dias.filter(d => d.iso === dia || d.data === dia)[0] || r.dias[+dia.slice(8) - 1];
    return x ? { servicos: x.servicos, improdutivo: x.improdutivo, util: x.util } : null;
  }, [MES_B, B12]);
  ok('o ajuste de avanço não conta como serviço do dia', di && di.servicos === 0, JSON.stringify(di));
  // (o dia 12 pode cair em fim de semana ou feriado — 12/10, por exemplo —, e aí não é dia útil)
  if (di && di.util) ok('e o dia parado por chuva continua improdutivo', di.improdutivo === true, JSON.stringify(di));

  ok('nenhum erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
