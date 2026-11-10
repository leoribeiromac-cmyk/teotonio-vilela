// O SERVIÇO DO DIA É PARTE DO RDO — no app de verdade, com o Code.gs de verdade.
//
// O PDF oficial traz os serviços do dia. Dois defeitos saíam daí:
//   • o PDF guardado para o e-mail das 6h30 (e para o link do fiscal) era o
//     de quando o turno foi salvo — o serviço lançado depois não entrava;
//   • lançar, corrigir ou apagar serviço depois da firma do fiscal passava, e
//     o desenho seguinte punha a firma em cima do que ele não viu.
//
// Aqui:
//   • o apontador que lança num dia assinado é barrado, e NADA do que ele
//     preencheu se perde (nem vai para a fila como se fosse falta de sinal);
//   • o escritório é perguntado, reabre, e o convite sai de novo;
//   • no dia ainda não assinado, o serviço entra, a linha do dia vem com a
//     revisão nova e o PDF é redepositado desenhado DELA;
//   • corrigir e apagar no Histórico passam pela mesma porta;
//   • dois lotes salvos em seguida continuam os dois na tela, mesmo com o CSV
//     publicado ainda sem eles (sumia o primeiro, e o apontador relançava).
//
// Como rodar:  node tests/rdo-servico-assinado.ui.test.js
const H = require('./harness.js');
const { criar } = require('./servidor-falso.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dia = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const ASSINADO = dia(1), ABERTO = dia(2), ASSINADO2 = dia(3);

const PAC = H.csv([['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'],
  ['P01', 'Pav. Flexível', 'BGTC - base', 'm³', '1000', '100', 'Ativo', '']]);
const CAB_AV = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador', 'Turno',
                'Observações', 'foto_link', 'usuario', 'timestamp', 'obra', 'clientId'];
const SERVICOS = [
  ['s1', ASSINADO, 'P01', '10', 'E120 (CB)', 'Eq', 'Wallace', 'Diurno', '', '', 'wallace', '', 'teotonio', 'c-s1'],
  ['s2', ABERTO, 'P01', '20', 'E121 (CB)', 'Eq', 'Wallace', 'Diurno', '', '', 'wallace', '', 'teotonio', 'c-s2'],
  ['s3', ASSINADO2, 'P01', '30', 'E122 (CB)', 'Eq', 'Wallace', 'Diurno', '', '', 'wallace', '', 'teotonio', 'c-s3'],
];
const CAB_DI = ['id', 'data', 'obra', 'numero_rdo', 'apontador_diurno', 'apontador_noturno', 'clima_manha', 'clima_tarde',
                'tem_turno_noturno', 'efetivo_json', 'equipamentos_json', 'usuario', 'revisao'];
const DIARIOS = [
  ['D0001', ASSINADO, 'teotonio', 1, 'Wallace', '', 'Bom', 'Bom', 'false', '{}', '{}', 'wallace', 'rAAA'],
  ['D0002', ABERTO, 'teotonio', 2, 'Wallace', '', 'Bom', 'Bom', 'false', '{}', '{}', 'wallace', 'rBBB'],
  ['D0003', ASSINADO2, 'teotonio', 3, 'Wallace', '', 'Bom', 'Bom', 'false', '{}', '{}', 'wallace', 'rCCC'],
];
const CAB_AS = ['id', 'obra', 'data', 'papel', 'rotulo', 'nome', 'email', 'token', 'status', 'convidadoEm',
                'assinadoEm', 'assinatura', 'nomeAssinante', 'documento', 'agente', 'observacao', 'origem'];
const firma = (id, data) => [id, 'teotonio', data, 'fiscalizacao', 'Fiscalização', 'Fiscal', 'f@x',
  'token-do-fiscal-' + id + '-xxxxxxxx', 'assinada', '', data + ' 15:00:00', 'drive_id:f', 'Fulano Fiscal', '', '', '', 'link'];

function servidor() {
  const S = criar({ props: { EXIGIR_TOKEN: 'true' } });
  S.aba('RDO_Avanco', [CAB_AV, ...SERVICOS]);
  S.aba('RDO_Diario', [CAB_DI, ...DIARIOS]);
  S.aba('RDO_Assinaturas', [CAB_AS, firma('a1', ASSINADO), firma('a3', ASSINADO2)]);
  S.ctx.rdoPdfArquivo_ = () => null;
  return S;
}
const copia = o => JSON.parse(JSON.stringify(o));
function gasDe(S, token, depositos, convites) {
  return (acao, p) => {
    if (acao === 'addBatchRDO') return copia(S.ctx.addBatchRDO(p.batch, p.clientId, token, p.reabrir));
    if (acao === 'updateRDO') return copia(S.ctx.updateRDO(p.payload, token, p.reabrir));
    if (acao === 'deleteRDO') return copia(S.ctx.deleteRDO(p.id, token, p.reabrir));
    if (acao === 'rdoPdfDoDia') { depositos.push({ data: p.data, revisao: p.revisao, pdf: String(p.pdf || '').length }); return { ok: true }; }
    if (acao === 'rdoEnviarParaAssinatura') { convites.push(p.data); return { ok: true, enviados: 2, para: ['f@x'] }; }
    if (acao === 'rdoAssinaturasDoDia') return { ok: true, assinaturas: [], assinadas: 0, noDeposito: -1 };
    if (acao === 'rdoAssinadosPendentes') return { ok: true, pendentes: [] };
    return { ok: true };
  };
}
const col = (aba, nome) => aba.dados[0].indexOf(nome);
const montar = (p, data, qtd) => p.evaluate(([dt, q]) => {
  const fx = eixoPorId(eixoPadrao());
  STATE.draft.data = dt;
  STATE.draft.apontador = 'Wallace';
  STATE.draft.turno = 'Diurno';
  STATE.draft.servicos = [{ frente: 'Pav. Flexível', pacoteId: 'P01', sentido: eixoPadrao(), estacaIni: 'E' + (fx.ini + 5),
    estacaFim: 'E' + (fx.ini + 6), lado: '', quantidade: q, area: '', espCm: '', equipe: 'Equipe teste', observacao: '' }];
  STATE.draft.outrosServicos = [];
}, [data, qtd]);
const toasts = p => p.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map(e => e.textContent).join(' | '));
const csvs = { pacotes: PAC, rdo: H.csv([CAB_AV, ...SERVICOS]), diario: H.csv([CAB_DI, ...DIARIOS]), coeficientes: '' };

(async () => {
  console.log('O APONTADOR E O DIA JÁ ASSINADO');
  {
    const S = servidor(), depositos = [], convites = [];
    const s = await H.abrir(Object.assign({ logar: { usuario: 'Wallace', perfil: 'campo' },
      gas: gasDe(S, 'tok-wallace-campo', depositos, convites) }, csvs));
    const p = s.p;
    await s.ir('rdo'); await p.waitForTimeout(500);
    await montar(p, ASSINADO, '7');
    // (o formulário pergunta outras coisas — data passada, por exemplo; só conta a pergunta de REABRIR)
    await p.evaluate(() => { window.__perguntou = 0; window.confirm = (m) => { if (/Reabrir/.test(String(m))) window.__perguntou++; return true; }; });
    await p.evaluate(() => salvarRDO());
    await p.waitForTimeout(900);
    const t = await toasts(p);
    const st = await p.evaluate(() => ({ qtd: STATE.draft.servicos[0].quantidade, fila: outboxLer().length, perguntou: window.__perguntou,
      pagina: STATE.currentPage, botao: (document.getElementById('btnSalvarRDO') || {}).disabled }));
    ok('o servidor recusa e o aviso diz o porquê e a quem pedir', /já foi assinado/.test(t) && /Fulano Fiscal/.test(t) && /escritório/.test(t), t.slice(0, 260));
    ok('nada foi gravado', S.abas.RDO_Avanco.dados.length === 4, S.abas.RDO_Avanco.dados.length);
    ok('o que ele preencheu continua na tela, e NÃO foi para a fila como falta de sinal',
       st.qtd === '7' && st.fila === 0 && st.pagina === 'rdo' && !st.botao, JSON.stringify(st));
    ok('o apontador não é perguntado se quer reabrir', st.perguntou === 0, st.perguntou);

    console.log('\nNO DIA AINDA NÃO ASSINADO, O PDF ACOMPANHA O SERVIÇO');
    await montar(p, ABERTO, '8');
    await p.evaluate(() => salvarRDO());
    await p.waitForFunction(() => STATE.currentPage === 'historico', null, { timeout: 8000 }).catch(() => {});
    const di = S.abas.RDO_Diario, nova = di.dados.find(l => l[0] === 'D0002')[col(di, 'revisao')];
    ok('o serviço entrou e o dia ganhou revisão nova no servidor', S.abas.RDO_Avanco.dados.length === 5 && nova !== 'rBBB', nova);
    const local = await p.evaluate(d => String(getCSVField(linhaDoDiaRDO(d), 'revisao') || ''), ABERTO);
    ok('o app guarda a linha do dia como ficou (o CSV ainda traz a revisão velha)', local === nova, local + ' × ' + nova);
    for (let i = 0; i < 60 && !depositos.length; i++) await p.waitForTimeout(250);
    ok('o PDF do dia é redepositado sozinho', depositos.length === 1 && depositos[0].data === ABERTO && depositos[0].pdf > 5000, JSON.stringify(depositos));
    ok('desenhado da linha NOVA (é a revisão dela que amarra a firma)', depositos[0] && depositos[0].revisao === nova, depositos[0] && depositos[0].revisao);

    console.log('\nDOIS LOTES EM SEGUIDA, COM O CSV AINDA SEM ELES');
    await s.ir('rdo'); await p.waitForTimeout(400);
    await montar(p, dia(0), '3');
    await p.evaluate(() => salvarRDO());
    await p.waitForFunction(() => STATE.currentPage === 'historico', null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(2200);                       // a carga agendada (CSV velho) já passou
    await p.evaluate(() => carregarTudo({ fundo: true }));
    await p.waitForTimeout(600);
    const naTela = await p.evaluate(() => STATE.rdoavanco.filter(r => /^(7|8|3)(,0+)?$/.test(String(getCSVField(r, 'Quantidade')))).length);
    ok('os dois serviços salvos continuam no aparelho depois de duas cargas', naTela === 2 &&
       await p.evaluate(() => STATE.rdoavanco.length) === 5, naTela + ' / ' + await p.evaluate(() => STATE.rdoavanco.length));

    console.log('\nAPAGAR NO HISTÓRICO, DIA ASSINADO');
    await p.evaluate(() => { limparHistFiltro(); });
    await s.ir('historico'); await p.waitForTimeout(400);
    await p.evaluate(() => { window.__perguntas = []; window.confirm = (m) => { window.__perguntas.push(m); return true; }; });
    // a linha que guarda o ID é a de edição (hist-edit-row-N); os botões ficam na linha de cima, pelo N
    await p.evaluate(() => {
      const n = document.querySelector('#page tbody tr[data-id="s1"]').id.replace('hist-edit-row-', '');
      document.querySelector('#page button[onclick="histDeletarServico(' + n + ')"]').click();
    });
    await p.waitForTimeout(900);
    const ta = await toasts(p);
    ok('o apontador não apaga serviço de dia assinado, e o aviso explica', /não foi apagado/.test(ta) && /escritório/.test(ta) &&
       !!S.abas.RDO_Avanco.dados.find(l => l[0] === 's1') && await p.evaluate(() => STATE.rdoavanco.some(r => getCSVField(r, 'ID') === 's1')), ta.slice(-220));
    ok('nenhum erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
    await s.fechar();
  }

  console.log('\nO ESCRITÓRIO REABRE');
  {
    const S = servidor(), depositos = [], convites = [];
    const s = await H.abrir(Object.assign({ logar: { usuario: 'Leo', perfil: 'engenharia' },
      gas: gasDe(S, 'tok-leo-engenharia', depositos, convites) }, csvs));
    const p = s.p;
    await s.ir('rdo'); await p.waitForTimeout(500);
    await montar(p, ASSINADO, '9');
    await p.evaluate(() => { window.__perguntas = []; window.confirm = (m) => { if (/Reabrir/.test(String(m))) window.__perguntas.push(m); return true; }; });
    await p.evaluate(() => salvarRDO());
    await p.waitForFunction(() => STATE.currentPage === 'historico', null, { timeout: 8000 }).catch(() => {});
    const perg = await p.evaluate(() => window.__perguntas);
    const lotes = s.chamadas.filter(c => c.acao === 'addBatchRDO');
    const as = S.abas.RDO_Assinaturas, fis = as.dados.find(l => l[0] === 'a1');
    ok('o escritório é perguntado antes de reabrir', perg.length === 1 && /Reabrir o RDO/.test(perg[0]) && /link novo/.test(perg[0]), JSON.stringify(perg));
    ok('e o segundo envio vai com a decisão dele', lotes.length === 2 && !lotes[0].params.reabrir && lotes[1].params.reabrir === '1', lotes.map(l => l.params.reabrir).join(','));
    ok('o serviço entra e a firma do fiscal volta a pendente', S.abas.RDO_Avanco.dados.length === 5 && fis[col(as, 'status')] === 'pendente', fis[col(as, 'status')]);
    for (let i = 0; i < 60 && !convites.length; i++) await p.waitForTimeout(250);
    ok('o RDO reaberto é redepositado e o convite sai de novo', convites.length === 1 && convites[0] === ASSINADO &&
       depositos.some(d => d.data === ASSINADO), JSON.stringify([convites, depositos.map(d => d.data)]));

    console.log('\nCORRIGIR NO HISTÓRICO');
    await p.evaluate(() => { limparHistFiltro(); });
    await s.ir('historico'); await p.waitForTimeout(400);
    await p.evaluate(() => { window.__perguntas = []; });
    const idx = await p.evaluate(() => {
      const n = +document.querySelector('#page tbody tr[data-id="s3"]').id.replace('hist-edit-row-', '');
      document.getElementById('hedit-toggle-' + n).click();
      return n;
    });
    await p.fill('#hedit-qtd-' + idx, '45');
    await p.click('#hedit-btn-' + idx);
    await p.waitForTimeout(1200);
    const av = S.abas.RDO_Avanco, s3 = av.dados.find(l => l[0] === 's3');
    const perg2 = await p.evaluate(() => window.__perguntas);
    const upd = s.chamadas.filter(c => c.acao === 'updateRDO');
    ok('a correção num dia assinado pergunta e reabre', perg2.length === 1 && /gravar a correção/.test(perg2[0]) &&
       upd.length === 2 && upd[1].params.reabrir === '1' && String(s3[col(av, 'Quantidade')]) === '45', JSON.stringify([perg2.length, upd.length, s3[col(av, 'Quantidade')]]));
    ok('e a tela mostra o valor corrigido', await p.evaluate(() =>
       num(getCSVField(STATE.rdoavanco.find(r => getCSVField(r, 'ID') === 's3'), 'Quantidade')) === 45));
    ok('nenhum erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
    await s.fechar();
  }

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
