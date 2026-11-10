// A MAQUETE DA PISTA E O RELEVO DO RITMO (js/ui/iso.js), no Painel.
//
// Dois desenhos em volume, feitos de SVG, que leem o MESMO dado do resto do
// Painel. O que este teste segura:
//
//   MAQUETE — cada estaca sobe até a etapa mais avançada lançada nela, e só
//   pelos degraus que a obra TEM; o percentual de cada etapa é acumulado
//   (quem chegou à base já passou pela drenagem); o mês escolhido no Painel
//   mostra a pista como estava no fim dele; a frente escolhida mostra só as
//   etapas dela; muro e urbanismo não sobem a pista.
//
//   RITMO — o ganho de cada dia fecha com o número grande do Painel; chuva
//   vem do RDO Diário; dia útil sem registro é contado; tocar num dia leva
//   aos lançamentos DELE.
//
// Como rodar:  node tests/maquete-ritmo.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const hoje = new Date();
// dois meses atrás e mês passado, sempre no dia 15: nunca caem no mês corrente
const dA = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 15));
const dB = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 15));
const mesA = dA.slice(0, 7);

const PAC = H.csv([
  ['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'],
  ['P01', 'Demolição', 'Demolição de pavimento', 'm²', '1000', '100', 'Ativo', ''],
  ['P02', 'Drenagem', 'Tubo de concreto Ø600', 'm', '500', '50', 'Ativo', ''],
  ['P03', 'Pav. Flexível', 'BGTC - base', 'm³', '400', '40', 'Ativo', ''],
  ['P04', 'Pav. Flexível', 'SMA - Capa de rolamento', 't', '300', '30', 'Ativo', ''],
  ['P05', 'Muros de Contenção', 'Muro D - fuste', 'm', '100', '2', 'Ativo', ''],
]);
const CAB = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador', 'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
const L = (id, data, pid, qtd, est) => [id, data, pid, qtd, est, 'Equipe 1', 'Wallace', 'Diurno', '', '', 'Wallace', data + 'T12:00:00Z', 'teotonio'];
const RDO = H.csv([CAB,
  L('r1', dA, 'P01', '100', 'E100 a E104 (CB)'),
  L('r2', dA, 'P02', '50', 'E102 (CB)'),
  L('r3', dA, 'P03', '40', 'E103 a E104 (CB)'),
  L('r4', dA, 'P04', '30', 'E210 (BC)'),
  L('r5', dA, 'P05', '2', 'E220 (BC)'),
  L('r6', dB, 'P04', '30', 'E100 (CB)'),
]);
const DIARIO = H.csv([
  ['id', 'Data', 'Apontador_Diurno', 'Apontador_Noturno', 'Clima_Manha', 'Clima_Tarde', 'Clima_Noite', 'obra'],
  ['d1', dA, 'Wallace', '', 'Bom', 'Bom', '', 'teotonio'],
  ['d2', dB, 'Wallace', '', 'Bom', 'Chuva', '', 'teotonio'],
]);

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, pacotes: PAC, rdo: RDO, diario: DIARIO, coeficientes: '' });
  await s.ir('executivo');
  await s.p.waitForTimeout(600);

  console.log('A MAQUETE: A PISTA POR CAMADA');
  const m = await s.p.evaluate(() => {
    const card = document.getElementById('trechoCard');
    const D = MAQ.D;
    const col = (eixo, n) => {
      let c = null;
      D.cenas.forEach(ce => ce.pistas.forEach(p => { if (p.eixo.id === eixo) p.cols.forEach(x => { if (x.num === n) c = x; }); }));
      return c;
    };
    return {
      modo: card && card.dataset.modo,
      titulo: card && card.querySelector('.card-title-lg').textContent,
      etapas: D.etapas.map(e => e.nome + ':' + e.n + ':' + e.pc),
      total: D.total, comEtapa: D.comEtapa,
      niveis: [col('CB', 100).nivel, col('CB', 101).nivel, col('CB', 102).nivel, col('CB', 103).nivel, col('CB', 104).nivel,
               col('CB', 105).nivel, col('BC', 210).nivel, col('BC', 220).nivel],
      muroLanc: col('BC', 220).n,
      toques: card.querySelectorAll('.iso-hit').length,
      grupos: card.querySelectorAll('.iso-l').length,
      chips: card.querySelectorAll('.maq-chip').length,
      cenaAntiga: card.querySelectorAll('.scene-3d').length,
    };
  });
  ok('o cartão do trecho abre no modo Camadas', m.modo === 'camadas' && /pista por camada/.test(m.titulo), JSON.stringify([m.modo, m.titulo]));
  ok('só as etapas que a obra TEM viram degrau (4, e não as 10 da escada)',
     m.etapas.length === 4 && m.etapas.map(e => e.split(':')[0]).join('|') === 'Demolição|Drenagem e redes|Base|Capa / placa', m.etapas.join(' '));
  ok('a estaca sobe até a etapa mais alta lançada nela, pelos degraus de baixo',
     JSON.stringify(m.niveis) === '[4,1,2,3,3,0,4,0]', JSON.stringify(m.niveis));
  ok('o percentual de cada etapa é ACUMULADO sobre todas as 87 estacas',
     m.total === 87 && m.etapas.join(' ') === 'Demolição:6:7 Drenagem e redes:5:6 Base:4:5 Capa / placa:2:2', m.total + ' → ' + m.etapas.join(' '));
  ok('muro lançado não sobe a pista (mas a estaca sabe que tem lançamento)', m.niveis[7] === 0 && m.muroLanc === 1 && m.comEtapa === 6, JSON.stringify([m.muroLanc, m.comEtapa]));
  ok('cada estaca tem a sua área de toque', m.toques === 87, m.toques);
  ok('as camadas das duas pistas foram desenhadas', m.grupos === 8 && m.chips === 4 && m.cenaAntiga === 0, JSON.stringify([m.grupos, m.chips, m.cenaAntiga]));

  console.log('\nTOCAR NUMA ETAPA E NUMA ESTACA');
  await s.p.click('#maqLegenda .maq-chip:nth-child(3)');     // Base
  const r = await s.p.evaluate(() => ({
    apagadas: document.querySelectorAll('#maqBox .iso-l.apagada').length,
    acesas: [...document.querySelectorAll('#maqBox .iso-l:not(.apagada)')].map(g => g.getAttribute('data-e')).join(','),
    pressionado: document.querySelector('#maqLegenda .maq-chip[aria-pressed="true"] span').textContent,
  }));
  ok('tocar "Base" na legenda deixa só essa camada acesa', r.apagadas === 6 && r.acesas === '2,2' && r.pressionado === 'Base', JSON.stringify(r));
  await s.p.click('#maqLegenda .maq-chip:nth-child(3)');
  ok('tocar de novo solta o realce', await s.p.evaluate(() => document.querySelectorAll('#maqBox .iso-l.apagada').length === 0));

  await s.p.evaluate(() => maqSelecionar('BC:210'));
  const d = await s.p.evaluate(() => ({
    txt: document.getElementById('maqDetalhe').textContent,
    botoes: [...document.querySelectorAll('#maqDetalhe button')].map(b => b.textContent.trim()),
    marcada: document.querySelectorAll('#maqBox .iso-hit.on').length,
  }));
  ok('a estaca tocada diz até onde chegou e quando foi o último lançamento',
     /E210/.test(d.txt) && /Capa \/ placa/.test(d.txt) && /1 lançamento/.test(d.txt) && d.marcada === 1, d.txt);
  ok('e oferece os lançamentos dela e o modelo 3D', d.botoes.join('|') === 'Ver lançamentos|Ver no modelo 3D', d.botoes.join('|'));
  await s.p.evaluate(() => maqSelecionar('BC:220'));
  ok('estaca só com muro: diz que há lançamento, mas não de etapa da pista',
     /nenhum de etapa da pista/.test(await s.p.evaluate(() => document.getElementById('maqDetalhe').textContent)));
  await s.p.evaluate(() => maqSelecionar('BC:210'));
  await s.p.click('#maqDetalhe button');                       // Ver lançamentos
  await s.p.waitForTimeout(500);
  const h = await s.p.evaluate(() => ({
    pagina: STATE.currentPage, filtro: HIST_FILTRO.estaca,
    linhas: document.querySelectorAll('#page tbody tr[data-id]').length,
  }));
  ok('"Ver lançamentos" abre o Histórico filtrado na estaca', h.pagina === 'historico' && h.filtro === 'BC:210' && h.linhas === 1, JSON.stringify(h));

  console.log('\nO FILTRO DO PAINEL MANDA NA MAQUETE');
  await s.p.evaluate(() => { limparHistFiltro && limparHistFiltro(); });
  await s.ir('executivo');
  await s.p.evaluate(mes => atualizarFiltro('mes', mes), mesA);
  await s.p.waitForTimeout(700);
  const fm = await s.p.evaluate(() => ({
    etapas: MAQ.D.etapas.map(e => e.nome + ':' + e.n).join(' '),
    sub: document.querySelector('#trechoCard .card-title-sub').textContent,
  }));
  ok('com um mês escolhido, a pista é a do FIM daquele mês (a capa lançada depois não aparece)',
     fm.etapas === 'Demolição:6 Drenagem e redes:4 Base:3 Capa / placa:1', fm.etapas);
  ok('e o subtítulo diz até que dia', /até \d\d\/\d\d\/\d\d/.test(fm.sub), fm.sub);
  await s.p.evaluate(() => { atualizarFiltro('mes', ''); });
  await s.p.waitForTimeout(500);
  await s.p.evaluate(() => { atualizarFiltro('frente', 'Drenagem'); });
  await s.p.waitForTimeout(700);
  const ff = await s.p.evaluate(() => MAQ.D.etapas.map(e => e.nome + ':' + e.n).join(' ') + ' / ' + MAQ.D.comEtapa);
  ok('com uma frente escolhida, só as etapas DELA', ff === 'Drenagem e redes:1 / 1', ff);
  await s.p.evaluate(() => { atualizarFiltro('frente', 'Muros de Contenção'); });
  await s.p.waitForTimeout(700);
  const fmuro = await s.p.evaluate(() => {
    const c = document.getElementById('trechoCard');
    return { modo: c && c.dataset.modo, seletor: c ? c.querySelectorAll('.curva-hz-btn').length : -1, cena: c ? c.querySelectorAll('.scene-3d').length : -1 };
  });
  ok('frente sem etapa de pista (muro): o cartão volta a ser o de atividade, sem seletor',
     fmuro.modo === 'atividade' && fmuro.seletor === 0 && fmuro.cena === 1, JSON.stringify(fmuro));
  await s.p.evaluate(() => { atualizarFiltro('frente', ''); });
  await s.p.waitForTimeout(700);

  console.log('\nTROCAR DE MODO');
  await s.p.click('#trechoCard .curva-hz-btn:nth-child(2)');   // Atividade
  const t1 = await s.p.evaluate(() => {
    const c = document.getElementById('trechoCard');
    return { modo: c.dataset.modo, cena: c.querySelectorAll('.scene-3d').length, maq: c.querySelectorAll('.maq').length,
             guardado: localStorage.getItem('teotonio_trecho_modo'), curva: !!document.getElementById('curvaS') };
  });
  ok('"Atividade" troca só o cartão (a Curva S continua na tela)', t1.modo === 'atividade' && t1.cena === 1 && t1.maq === 0 && t1.curva, JSON.stringify(t1));
  await s.ir('historico'); await s.ir('executivo'); await s.p.waitForTimeout(500);
  ok('a escolha fica guardada no aparelho', t1.guardado === 'atividade' &&
     await s.p.evaluate(() => document.getElementById('trechoCard').dataset.modo === 'atividade'));
  await s.p.click('#trechoCard .curva-hz-btn:nth-child(1)');
  ok('e "Camadas" traz a maquete de volta', await s.p.evaluate(() => document.querySelectorAll('#trechoCard .maq').length === 1));

  console.log('\nO RITMO DIA A DIA');
  const rt = await s.p.evaluate(([a, b]) => {
    const D = RIT.D, dia = i => D.dias.filter(x => x.iso === i)[0];
    const A = dia(a), B = dia(b);
    return {
      soma: D.soma, painel: STATE.dashData.metricsAcum.current,
      a: A && { v: A.v, n: A.n, chuva: A.chuva, rdo: A.rdo }, b: B && { v: B.v, n: B.n, chuva: B.chuva, rdo: B.rdo },
      semRdo: D.semRdo, vazios: document.querySelectorAll('#ritBox .rit-dia.vazio').length,
      chuvas: document.querySelectorAll('#ritBox .rit-chuva').length,
      dias: D.dias.length, toques: document.querySelectorAll('#ritBox .iso-hit').length,
      futuros: D.dias.filter(x => x.futuro).length,
      resumo: document.querySelector('#ritBox .rit-resumo').textContent,
    };
  }, [dA, dB]);
  ok('a soma dos blocos fecha com o avanço do Painel', rt.painel > 0 && Math.abs(rt.soma - rt.painel) < 1e-9, rt.soma + ' × ' + rt.painel);
  ok('o dia com cinco lançamentos conta os cinco', rt.a && rt.a.n === 5 && rt.a.v > 0 && rt.a.rdo && !rt.a.chuva, JSON.stringify(rt.a));
  ok('a chuva do dia vem do RDO Diário', rt.b && rt.b.chuva && rt.b.n === 1 && rt.chuvas === 1, JSON.stringify([rt.b, rt.chuvas]));
  ok('dia útil sem RDO nem lançamento é contado e marcado', rt.semRdo > 50 && rt.vazios === rt.semRdo, rt.semRdo + ' × ' + rt.vazios);
  ok('26 semanas, e o que ainda não aconteceu não é desenhado', rt.dias === 182 && rt.toques === 182 - rt.futuros, JSON.stringify([rt.dias, rt.toques, rt.futuros]));
  ok('o resumo traz os dias com lançamento', /^2dias com lançamento/.test(rt.resumo), rt.resumo.slice(0, 60));

  await s.p.evaluate(b => ritSelecionar(b), dB);
  const rd = await s.p.evaluate(() => ({
    txt: document.getElementById('ritDetalhe').textContent,
    botoes: [...document.querySelectorAll('#ritDetalhe button')].map(x => x.textContent.trim()).join('|'),
  }));
  ok('o dia tocado mostra o ganho, os lançamentos e a chuva', /p\.p\./.test(rd.txt) && /1 lançamento/.test(rd.txt) && /chuva/.test(rd.txt), rd.txt);
  ok('e leva aos lançamentos e ao RDO do dia', rd.botoes === 'Ver lançamentos|Abrir o RDO do dia', rd.botoes);
  await s.p.click('#ritDetalhe button');
  await s.p.waitForTimeout(500);
  const rh = await s.p.evaluate(() => ({ pagina: STATE.currentPage, data: HIST_FILTRO.data, linhas: document.querySelectorAll('#page tbody tr[data-id]').length }));
  ok('"Ver lançamentos" abre o Histórico no dia tocado', rh.pagina === 'historico' && rh.data === dB && rh.linhas === 1, JSON.stringify(rh));

  console.log('\nOBRA SEM ESTACA DE PISTA E SEM ERRO');
  await s.p.evaluate(() => { limparHistFiltro && limparHistFiltro(); });
  await s.ir('executivo');
  await s.p.evaluate(() => maqSelecionar('CB:100'));
  await s.p.evaluate(() => trocarObra('ruas-de-terra'));
  await s.p.waitForFunction(() => STATE.loaded === true && OBRA.id === 'ruas-de-terra', null, { timeout: 30000 }).catch(() => {});
  await s.ir('executivo'); await s.p.waitForTimeout(600);
  const outra = await s.p.evaluate(() => ({ obra: OBRA.id, sel: MAQ.sel, pagina: !!document.querySelector('#page .exec-hero, #page .card, #page .empty') }));
  ok('trocar de obra não deixa a estaca da outra selecionada', outra.obra === 'ruas-de-terra' && outra.sel === null && outra.pagina, JSON.stringify(outra));

  ok('nenhum erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
