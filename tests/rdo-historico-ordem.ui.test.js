// O HISTÓRICO DE RDOs SAI EM ORDEM CRONOLÓGICA
//
// A lista vinha na ordem em que as linhas caíram na planilha (o `reverse()`
// de sempre), que é a ordem de LANÇAMENTO. Como o RDO atrasado é digitado
// depois, ele subia para o topo: numa lista real apareciam 03/09, 02/09,
// 30/08, 29/08, 23/08, 16/08 e só então 01/09 — o dia 16/08 acima do 01/09
// porque foi digitado por último.
//
// Isso não é só feio. Quem confere RDO lê por data, e é o BURACO no meio da
// sequência que denuncia o dia que ficou sem relatório; fora de ordem, o
// buraco não aparece em lugar nenhum.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/rdo-historico-ordem.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// A planilha do jeito que ela fica de verdade: fora de ordem de data, porque
// a ordem dela é a de digitação. Os IDs seguem o lançamento (D0161 é de 01/09
// e foi digitado ANTES dos D0162..D0165, que são de agosto).
const CAB = ['id', 'Data', 'Turno', 'Clima_Manha', 'Clima_Tarde', 'Clima_Noite',
             'Efetivo', 'Equipamentos', 'Ocorrencias', 'Servicos', 'Apontador', 'obra'];
const LINHAS = [
  ['D0161', '2026-09-01'],   // lançado antes dos de agosto
  ['D0162', '2026-08-16'],   // dias atrasados, digitados depois
  ['D0163', '2026-08-23'],
  ['D0164', '2026-08-29'],
  ['D0165', '2026-08-30'],
  ['D0166', '2026-09-02'],
  ['D0169', '2026-09-03'],
  ['D0131', ''],             // sem data legível na planilha
  ['D0132', '2026-08-24'],
  ['D0133', '2026-08-24'],   // duplicata do mesmo dia
];
const diario = H.csv([CAB].concat(LINHAS.map(([id, data]) =>
  [id, data, 'Diurno', 'Bom', 'Bom', 'Bom', 'Pedreiro: 4', '', '', 'Execução de base', 'Wallace', 'teotonio'])));

(async () => {
  const s = await H.abrir({ diario, logar: { usuario: 'Leonardo', perfil: 'admin' } });
  await s.ir('historico');
  await s.p.waitForTimeout(400);
  // a aba de RDOs Diários
  await s.p.evaluate(() => setHistoricoTab('diarios'));
  await s.p.waitForTimeout(500);

  // lê a tabela como ela aparece na tela: a coluna do ID e a da data
  const linhas = await s.p.evaluate(() =>
    [...document.querySelectorAll('table.t-cartoes tbody tr')].map(tr => {
      const c = tr.querySelectorAll('td');
      return { data: (c[1] || {}).textContent.trim(), id: (c[2] || {}).textContent.trim() };
    }));

  console.log('A TABELA NA TELA');
  ok('as dez linhas aparecem', linhas.length === 10, JSON.stringify(linhas));

  // dd/mm/aa → aaaa-mm-dd, para comparar como data e não como texto
  const iso = t => {
    const m = String(t).match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    return m ? (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2] + '-' + m[1] : '';
  };
  const datas = linhas.map(l => iso(l.data));
  const comData = datas.filter(Boolean);

  console.log('\nORDEM CRONOLÓGICA, DA MAIS RECENTE PARA A MAIS ANTIGA');
  const ordenadas = [...comData].sort().reverse();
  ok('nenhuma data aparece fora de lugar',
    comData.join(',') === ordenadas.join(','),
    'na tela: ' + comData.join(' ') + '\n      esperado: ' + ordenadas.join(' '));

  ok('o RDO mais recente abre a lista', comData[0] === '2026-09-03', comData[0]);

  // o caso que denunciou o problema: 16/08 estava ACIMA de 01/09
  const pos = d => datas.indexOf(d);
  ok('o dia lançado atrasado (16/08) fica ABAIXO do 01/09, onde é o lugar dele',
    pos('2026-08-16') > pos('2026-09-01'),
    '16/08 na linha ' + pos('2026-08-16') + ', 01/09 na linha ' + pos('2026-09-01'));

  console.log('\nOS CASOS DE BORDA');
  ok('as duas duplicatas do mesmo dia ficam lado a lado',
    Math.abs(pos('2026-08-24') - datas.lastIndexOf('2026-08-24')) === 1,
    JSON.stringify(datas));

  ok('o RDO sem data legível vai para o FIM, não some no meio',
    linhas[linhas.length - 1].id === 'D0131',
    'última linha: ' + JSON.stringify(linhas[linhas.length - 1]));

  console.log('\nO FILTRO DE MÊS NÃO DESEMBARALHA NADA');
  await s.p.evaluate(() => setHistDiarioFiltro('mes', '2026-08'));
  await s.p.waitForTimeout(400);
  const agosto = await s.p.evaluate(() =>
    [...document.querySelectorAll('table.t-cartoes tbody tr')]
      .map(tr => (tr.querySelectorAll('td')[1] || {}).textContent.trim()));
  const agostoISO = agosto.map(iso).filter(Boolean);
  ok('só agosto aparece', agostoISO.length === 6 && agostoISO.every(d => d.startsWith('2026-08')),
    JSON.stringify(agostoISO));
  ok('e também em ordem', agostoISO.join(',') === [...agostoISO].sort().reverse().join(','),
    JSON.stringify(agostoISO));

  ok('nenhum erro de página', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.');
  await s.fechar();
  process.exit(falhas ? 1 : 0);
})();
