// A CURVA S SOB FILTRO DE MÊS, E O TETO POR PACOTE.
//
// Dois defeitos moravam no mesmo gráfico, e os dois faziam a obra parecer
// outra coisa do que era:
//
// 1) BASES DIFERENTES NO MESMO GRÁFICO. O filtro de mês jogava fora todo
//    lançamento de fora do mês, então o "Realizado" recomeçava do ZERO no
//    dia 1º. Só que o "Previsto (cronograma)" vem de `calcCurvaPrevista`,
//    que nunca soube do filtro e seguia acumulando desde o início da obra.
//    Medido em junho/25: 8% de realizado contra 62% de previsto. QUALQUER
//    mês escolhido pintava a obra como desesperadamente atrasada, e o
//    "status vs cronograma" repetia o erro em número vermelho.
//    Agora o mês é uma JANELA: o acumulado corre do início da obra até o
//    fim do mês escolhido, e o mês só estreita o eixo.
//
// 2) A CURVA NÃO TINHA TETO. O número grande do painel limita cada pacote
//    a 100% (`Math.min(pct, 1)`), mas `calcCumulativoDia` somava cru. Com
//    pacote entregue acima do previsto — rotina em obra, é o que vira
//    aditivo — as duas contas discordavam NA MESMA TELA (64,0% no topo,
//    75,9% na ponta da curva), e a linha podia passar de 100%.
//
// Os números aqui são conferidos por INVARIANTE, não por valor fixo: a
// Teotônio recebe o complemento dos muros (dados/teotonio-muros.js), então
// o denominador do avanço não é o dos pacotes deste arquivo.
//
// Como rodar:  node tests/curva-s-periodo.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};
const perto = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;

const pacotes = H.csv([
  ['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'],
  ['P01', 'Drenagem', 'Rede de drenagem', 'm', H.pt(1000), H.pt(10), 'Ativo', ''],
  ['P02', 'Pavimento', 'Base', 'm²', H.pt(1000), H.pt(10), 'Ativo', ''],
]);

const cab = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador',
             'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
const lin = (id, data, pid, qtd) =>
  [id, data, pid, H.pt(qtd), 'E100+0', 'Equipe 1', 'Wallace', 'Diurno', '', '', 'Wallace',
   data + 'T12:00:00Z', 'teotonio'];

// maio: P01 chega a 100%. junho: P01 recebe MAIS (o excedente não pode contar)
// e P02 vai a 50%.
const rdoComEstouro = H.csv([cab,
  lin('r1', '2025-05-10', 'P01', 1000),
  lin('r2', '2025-06-12', 'P01', 1000),
  lin('r3', '2025-06-20', 'P02', 500),
]);
// o mesmo cenário SEM o estouro: o lançamento de junho no P01 não existe
const rdoSemEstouro = H.csv([cab,
  lin('r1', '2025-05-10', 'P01', 1000),
  lin('r3', '2025-06-20', 'P02', 500),
]);

const comum = { logar: { usuario: 'Leonardo', perfil: 'admin' }, pacotes,
                coeficientes: H.gerarCoeficientes(2, 1), diario: H.gerarDiario({ linhas: 3 }) };

const LER = () => {
  const g = window.meuGraficoCurvaS;
  const serie = n => {
    if (!g) return null;
    const d = g.data.datasets.find(x => (x.label || '').toLowerCase().startsWith(n));
    if (!d) return null;
    const pts = {};
    let primeiro = null, ultimo = null, max = -Infinity;
    d.data.forEach((y, i) => {
      if (y === null || y === undefined) return;
      const dia = g.data.labels[i];
      pts[dia] = y;
      if (primeiro === null) primeiro = { dia, y };
      ultimo = { dia, y };
      if (y > max) max = y;
    });
    return { pts, primeiro, ultimo, max };
  };
  const txt = sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : ''; };
  return {
    painel: parseFloat(txt('.hero-value').replace('%', '').replace(',', '.')),
    metaLbl: txt('.hero-gap-lbl'),
    eixo: g ? [g.data.labels[0], g.data.labels[g.data.labels.length - 1]] : null,
    realizado: serie('realizado'),
    previsto: serie('previsto'),
  };
};

const filtrarMes = (mes) => {
  const sel = document.querySelector('.filter-bar select');
  sel.value = mes;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
};

(async () => {
  // ============================================================ com estouro
  const s = await H.abrir(Object.assign({}, comum, { rdo: rdoComEstouro }));
  await s.ir('executivo');
  await s.p.waitForTimeout(1200);

  console.log('\n── obra toda ──');
  const geral = await s.p.evaluate(LER);
  ok('a curva termina no mesmo número do painel',
     geral.realizado && perto(geral.realizado.ultimo.y, geral.painel, 0.15),
     geral.realizado ? `painel ${geral.painel}% · curva ${geral.realizado.ultimo.y}%` : 'sem série');
  ok('o realizado nunca passa de 100%',
     geral.realizado && geral.realizado.max <= 100.01,
     geral.realizado ? 'máx ' + geral.realizado.max + '%' : 'sem série');

  const acumFimDeMaio = geral.realizado ? geral.realizado.pts['2025-05-31'] : null;

  console.log('\n── filtrado em junho/2025 ──');
  await s.p.evaluate(filtrarMes, '2025-06');
  await s.p.waitForTimeout(1500);
  const jun = await s.p.evaluate(LER);

  ok('o eixo estreita para o mês',
     jun.eixo && jun.eixo[0] === '2025-06-01' && jun.eixo[1] === '2025-06-30', JSON.stringify(jun.eixo));
  ok('o realizado NÃO recomeça do zero no dia 1º',
     jun.realizado && jun.realizado.primeiro.y > 1,
     jun.realizado ? 'primeiro ponto ' + jun.realizado.primeiro.y + '%' : 'sem série');
  ok('o 1º de junho continua de onde maio parou',
     jun.realizado && perto(jun.realizado.primeiro.y, acumFimDeMaio, 0.15),
     jun.realizado ? `junho abre em ${jun.realizado.primeiro.y}% · maio fechou em ${acumFimDeMaio}%` : 'sem série');
  ok('realizado e previsto ficam na mesma base (o previsto não fica sozinho lá em cima)',
     jun.realizado && jun.previsto &&
       Math.abs(jun.previsto.primeiro.y - jun.realizado.primeiro.y) < 60,
     jun.realizado && jun.previsto
       ? `realizado ${jun.realizado.primeiro.y}% · previsto ${jun.previsto.primeiro.y}%` : 'sem série');
  ok('o painel mostra o acumulado até o fim do mês, e a curva termina nele',
     jun.realizado && perto(jun.realizado.ultimo.y, jun.painel, 0.15),
     jun.realizado ? `painel ${jun.painel}% · curva ${jun.realizado.ultimo.y}%` : 'sem série');
  ok('a meta do cronograma é lida na data de referência, não em "hoje"',
     /até\s*30\/06\/25/.test(jun.metaLbl), jun.metaLbl);
  ok('o acumulado de junho é maior que o de maio', jun.painel > acumFimDeMaio,
     `junho ${jun.painel}% · maio ${acumFimDeMaio}%`);
  ok('nenhum erro de JS (com estouro)', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  // ============================================================ sem estouro
  // O TETO: entregar 200% de um pacote tem de dar o MESMO avanço que
  // entregar 100% dele. Se a conta não tiver teto, este cenário fica menor.
  console.log('\n── teto por pacote ──');
  const s2 = await H.abrir(Object.assign({}, comum, { rdo: rdoSemEstouro }));
  await s2.ir('executivo');
  await s2.p.waitForTimeout(1200);
  const semEstouro = await s2.p.evaluate(LER);

  ok('entregar 200% de um pacote dá o mesmo avanço que entregar 100%',
     perto(semEstouro.painel, geral.painel, 0.05),
     `com estouro ${geral.painel}% · sem estouro ${semEstouro.painel}%`);
  ok('e a curva também não se move com o excedente',
     semEstouro.realizado && geral.realizado &&
       perto(semEstouro.realizado.ultimo.y, geral.realizado.ultimo.y, 0.05),
     semEstouro.realizado && geral.realizado
       ? `com ${geral.realizado.ultimo.y}% · sem ${semEstouro.realizado.ultimo.y}%` : 'sem série');
  ok('nenhum erro de JS (sem estouro)', s2.erros.length === 0, s2.erros.slice(0, 3).join(' | '));
  await s2.fechar();

  // ============================================ botões de horizonte
  // Os botões "Obra toda / 12 meses / 3 meses" são os filtros DA CURVA, e
  // não mexiam no eixo: medida a obra em 72,9%, o recorte de 3 meses
  // desenhava realizado de 72,9 a 72,9 contra previsto de 100 a 100 numa
  // régua de 0 a 100 — duas retas paralelas onde nada acontecia.
  console.log('\n── os botões de horizonte ──');
  const s3 = await H.abrir(Object.assign({}, comum, { rdo: H.gerarRDO({ linhas: 2000, dias: 500 }) }));
  await s3.ir('executivo');
  await s3.p.waitForTimeout(1300);

  const janela = async (hz) => {
    await s3.p.evaluate(h => { STATE.curvaHorizonte = h; STATE.filtros.mes = ''; transitionTo(render); }, hz);
    await s3.p.waitForTimeout(900);
    await s3.p.evaluate(() => montarGraficos());
    await s3.p.waitForTimeout(700);
    return s3.p.evaluate(() => {
      const g = window.meuGraficoCurvaS;
      const el = document.getElementById('curvaLeitura');
      return { min: g.options.scales.y.min, max: g.options.scales.y.max,
               dias: g.data.labels.length,
               leitura: el ? el.textContent.replace(/\s+/g, ' ').trim() : '',
               fill: JSON.stringify(g.data.datasets[1].fill) };
    });
  };

  const obra = await janela('obra');
  ok('na obra toda a régua vai de 0 a 100', obra.min === 0 && obra.max === 100,
     `${obra.min}–${obra.max}`);

  const doze = await janela('12m');
  ok('em 12 meses a régua se fecha na janela', doze.min > 0 || doze.max < 100,
     `${doze.min}–${doze.max}`);

  const tres = await janela('3m');
  ok('em 3 meses a régua se fecha na janela', tres.min > 0 || tres.max < 100,
     `${tres.min}–${tres.max}`);
  ok('e a janela de 3 meses é mais apertada que a de 12',
     (tres.max - tres.min) <= (doze.max - doze.min),
     `3m ${tres.max - tres.min} · 12m ${doze.max - doze.min}`);
  ok('a janela de 3 meses tem menos dias que a de 12', tres.dias < doze.dias,
     `${tres.dias} vs ${doze.dias}`);

  // a faixa entre as duas linhas é o que mostra a distância sem precisar ler
  ok('a faixa entre realizado e previsto é pintada', /"target":0/.test(obra.fill), obra.fill);

  // a leitura em palavras
  ok('sem recorte, a leitura diz o estado de hoje',
     /cronograma hoje/.test(obra.leitura), obra.leitura);
  ok('com recorte, a leitura diz o que mudou NO PERÍODO',
     /No período/.test(tres.leitura) && /distância para o cronograma/.test(tres.leitura),
     tres.leitura);
  ok('e a leitura traz as duas pontas da distância',
     /→/.test(tres.leitura), tres.leitura);

  ok('nenhum erro de JS nos horizontes', s3.erros.length === 0, s3.erros.slice(0, 3).join(' | '));
  await s3.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
