// O MESMO DIA, A MESMA RESPOSTA — no app de verdade.
//
// A tela do RDO dizia, lado a lado, duas coisas sobre o mesmo dia:
// o cartão "NOTURNO — Já enviado por Guilherme" e, na lista dos 14 dias, o
// N em aberto. E, em cima da lista, "Nenhum dia útil em aberto".
// A planilha tinha duas linhas para o dia (ver
// rdo-diario-duplicado-servidor.test.js): o cartão lia a primeira, a lista a
// última. E o Histórico acendia duplicata que "resolver" não resolvia — o
// oficial ficava só naquele navegador.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/rdo-dia-coerente.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Os dias úteis (sem domingo) antes de hoje, do mais recente para trás.
const passados = [];
for (let i = 1; passados.length < 13; i++) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
  if (i > 13) break;
  if (d.getDay() !== 0) passados.push(iso(d));
}
const DIA_REPETIDO = passados[0];   // duas linhas: a 1ª com D+N, a 2ª só com D
const DIA_SO_D = passados[1];       // só o diurno — um turno em aberto de verdade
const DIA_ATRASADO = passados[2];   // sem N no aparelho, com N na planilha

const ef = (d, n) => JSON.stringify({ padrao_diurno: d || {}, padrao_noturno: n || {},
  customIndireto_diurno: [], customDireto_diurno: [], customIndireto_noturno: [], customDireto_noturno: [] });
const CAB = ['id', 'Data', 'apontador_diurno', 'apontador_noturno', 'clima_manha', 'clima_tarde', 'clima_noite',
  'ocorrencias', 'tem_turno_noturno', 'efetivo_json', 'equipamentos_json', 'obra', 'numero_rdo'];
const LINHAS = [];
// Os outros dias da janela, completos — para o resumo só ter o que interessa.
passados.slice(3).forEach((d, i) => LINHAS.push(['D0' + (500 + i), d, 'Wallace', 'Guilherme', 'Bom', 'Bom', 'Bom', '', 'true', ef({ Servente: 8 }, { Servente: 5 }), '{}', 'teotonio', 500 + i]));
LINHAS.push(['D0601', DIA_REPETIDO, 'Wallace', 'Guilherme', 'Bom', 'Bom', 'Chuvoso', 'vala aberta', 'true', ef({ Servente: 8 }, { Servente: 5 }), '{}', 'teotonio', 601]);
LINHAS.push(['D0602', DIA_SO_D, 'Wallace', '', 'Bom', 'Bom', 'Bom', '', 'false', ef({ Servente: 8 }), '{}', 'teotonio', 602]);
LINHAS.push(['D0603', DIA_ATRASADO, 'Wallace', 'Guilherme', 'Bom', 'Bom', 'Nublado', '', 'true', ef({ Servente: 8 }, { Servente: 4 }), '{}', 'teotonio', 603]);
LINHAS.push(['D0604', DIA_REPETIDO, 'Wallace', '', 'Nublado', 'Bom', 'Bom', 'caminhão atrasou', 'false', ef({ Servente: 9 }), '{}', 'teotonio', 604]);
const diario = H.csv([CAB].concat(LINHAS));

(async () => {
  const s = await H.abrir({ diario, logar: { usuario: 'Leonardo', perfil: 'admin' } });
  await s.ir('rdodiario');
  await s.p.evaluate(d => abrirDiarioNaData(d), DIA_REPETIDO);
  await s.p.waitForTimeout(600);

  const tela = await s.p.evaluate((dia) => {
    const linha = [...document.querySelectorAll('.dia-linha')].find(b => (b.getAttribute('onclick') || '').includes(dia));
    const pills = linha ? [...linha.querySelectorAll('.dia-pill')].map(p => p.className) : [];
    return {
      resumo: (document.querySelector('.dias-rdo .card-title-sub') || {}).textContent || '',
      pillD: pills[0] || '', pillN: pills[1] || '',
      noturno: (document.querySelector('.btn-turno-noturno .btn-turno-status') || {}).textContent || '',
      diurno: (document.querySelector('.btn-turno-diurno .btn-turno-status') || {}).textContent || '',
      v4: { ef: DIARIO_V4.diurno.efetivo.Servente, efN: DIARIO_V4.noturno.efetivo.Servente, clima: DIARIO_V4.clima_noite }
    };
  }, DIA_REPETIDO);

  console.log('O DIA REPETIDO NA PLANILHA');
  ok('o cartão do noturno diz enviado por Guilherme', /Guilherme/.test(tela.noturno), tela.noturno);
  ok('e a lista dos 14 dias diz o MESMO (N preenchido)', / ok/.test(' ' + tela.pillN) && !/falta/.test(tela.pillN), tela.pillN);
  ok('o diurno vem da versão mais nova (a 2ª linha)', tela.v4.ef === 9, JSON.stringify(tela.v4));
  ok('o noturno vem da linha que o tem', tela.v4.efN === 5 && tela.v4.clima === 'Chuvoso', JSON.stringify(tela.v4));

  console.log('\nO RESUMO DA LISTA NÃO SE DESMENTE');
  const dd = DIA_SO_D.slice(8, 10) + '/' + DIA_SO_D.slice(5, 7);
  ok('o dia com o noturno esquecido aparece no resumo', /1\s*turno em aberto/.test(tela.resumo) && tela.resumo.includes(dd + ' N'), tela.resumo);
  ok('e não diz mais "nenhum em aberto"', !/Nenhum/.test(tela.resumo), tela.resumo);

  console.log('\nO APARELHO QUE NÃO VIU O NOTURNO');
  // O celular do apontador do dia, aberto desde cedo: DIARIO_V4 sem noturno.
  await s.p.evaluate((dia) => {
    DIARIO_V4 = defaultDiarioV4(dia);
    DIARIO_V4.diurno.apontador = 'Wallace';
    DIARIO_V4.diurno.preenchido = true;
    DIARIO_TURNO_ATIVO = null;
    render();
  }, DIA_ATRASADO);
  await s.p.waitForTimeout(400);
  const card = await s.p.evaluate(() => (document.querySelector('.btn-turno-noturno .btn-turno-status') || {}).textContent || '');
  ok('o cartão já mostra o noturno que outro aparelho enviou', /Guilherme/.test(card), card);

  s.chamadas.length = 0;
  await s.p.evaluate(() => { selecionarTurnoV4('diurno'); });
  await s.p.waitForTimeout(400);
  await s.p.evaluate(() => { DIARIO_V4.diurno.ocorrencias = 'ajuste do diurno'; return salvarDiarioV4(); });
  await s.p.waitForTimeout(600);
  const envio = s.chamadas.find(c => /RDODiario/.test(c.acao || ''));
  ok('o ajuste do diurno sobe COM o noturno, não em branco',
    envio && envio.params.apontador_noturno === 'Guilherme' && envio.params.clima_noite === 'Nublado',
    envio ? JSON.stringify({ n: envio.params.apontador_noturno, c: envio.params.clima_noite }) : 'nada enviado');
  ok('e com o efetivo do noturno', envio && JSON.parse(envio.params.efetivo_json).padrao_noturno.Servente === 4,
    envio && envio.params.efetivo_json);

  console.log('\nO HISTÓRICO: UNIFICAR RESOLVE PARA TODO MUNDO');
  await s.ir('historico');
  await s.p.evaluate(() => setHistoricoTab('diarios'));
  await s.p.waitForTimeout(400);
  const antes = await s.p.evaluate(d => rdosDaData(d).length, DIA_REPETIDO);
  ok('o dia repetido tem duas linhas', antes === 2, antes);
  s.chamadas.length = 0;
  await s.p.evaluate(d => resolverDuplicata(d), DIA_REPETIDO);
  await s.p.waitForTimeout(300);
  const temBotao = await s.p.evaluate(() => !!document.getElementById('btnUnificarRDO'));
  ok('a janela de duplicata oferece Unificar', temBotao);
  await s.p.click('#btnUnificarRDO');
  await s.p.waitForTimeout(600);
  const pedido = s.chamadas.find(c => c.acao === 'mesclarRDODiario');
  ok('pede ao servidor para unir aquele dia, daquela obra',
    pedido && pedido.params.data === DIA_REPETIDO && pedido.params.obra === 'teotonio', pedido && JSON.stringify(pedido.params));
  const depois = await s.p.evaluate(d => {
    const l = rdosDaData(d);
    return { n: l.length, id: l[0] && getCSVField(l[0], 'id'), not: l[0] && getCSVField(l[0], 'apontador_noturno'),
             oc: l[0] && getCSVField(l[0], 'ocorrencias') };
  }, DIA_REPETIDO);
  ok('a tela fica com uma linha só, com os dois turnos', depois.n === 1 && depois.not === 'Guilherme', JSON.stringify(depois));
  ok('com a identidade da linha mais antiga', depois.id === 'D0601', depois.id);
  ok('e sem perder texto de nenhuma das duas', /vala aberta/.test(depois.oc) && /caminhão atrasou/.test(depois.oc), depois.oc);

  ok('nenhum erro de página', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.');
  await s.fechar();
  process.exit(falhas ? 1 : 0);
})();
