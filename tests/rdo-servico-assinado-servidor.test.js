// O SERVIÇO DO DIA É PARTE DO RDO ASSINADO — o servidor, com planilha falsa.
//
// A firma do fiscal é o aceite do documento inteiro, e o PDF oficial traz os
// SERVIÇOS do dia. A trava "assinado só muda reaberto" estava só no RDO
// Diário: lançar, corrigir ou apagar um serviço depois da firma passava, e o
// desenho seguinte punha a firma por cima de serviços que quem assinou não viu.
//
//   • DEPOIS da firma (dada por pessoa — a arquivada do engenheiro não conta):
//     addBatchRDO, updateRDO e deleteRDO recusam com RDO_ASSINADO; reabrir é
//     do escritório, cancela a firma com link novo e esquece o "RDO ASSINADO".
//   • ANTES da firma: o dia ganha `revisao` nova (o PDF guardado fica para
//     trás e a firma não entra nele) e vai para a lista dos depósitos velhos,
//     que a varredura repõe; o depósito com a revisão do dia tira da lista.
//   • Ajuste de avanço, outra obra e dia sem RDO Diário não passam por isso.
//   • O lote reenviado pela fila (mesmo clientId) continua "já salvo".
//   • Apagar o RDO Diário leva o PDF depositado junto, confere a obra da
//     LINHA e guarda a linha inteira na Auditoria.
//   • rdoFoto diz se a foto entrou na linha (`anexada`).
//
// Como rodar:  node tests/rdo-servico-assinado-servidor.test.js
const { criar } = require('./servidor-falso.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const ASSINADO = '2026-09-22', ABERTO = '2026-09-23', SEM_DIARIO = '2026-09-24';
const CAB_AV = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador', 'Turno',
                'Observações', 'foto_link', 'usuario', 'timestamp', 'obra', 'clientId'];
const CAB_DI = ['id', 'data', 'obra', 'numero_rdo', 'apontador_diurno', 'apontador_noturno', 'clima_manha',
                'usuario', 'revisao'];
const CAB_AS = ['id', 'obra', 'data', 'papel', 'rotulo', 'nome', 'email', 'token', 'status', 'convidadoEm',
                'assinadoEm', 'assinatura', 'nomeAssinante', 'documento', 'agente', 'observacao', 'origem'];

function montar() {
  const S = criar({ props: { EXIGIR_TOKEN: 'true',
    RDO_ASSINADO_LOG: JSON.stringify({ ['teotonio|' + ASSINADO]: '2026-09-23 10:00' }) } });
  S.aba('RDO_Avanco', [CAB_AV,
    ['s1', ASSINADO, 'P01', 10, 'E120 (CB)', 'Eq', 'Wallace', 'Diurno', '', '', 'wallace', '', 'teotonio', 'c-s1'],
    ['s2', ABERTO, 'P01', 20, 'E121 (CB)', 'Eq', 'Wallace', 'Diurno', '', '', 'wallace', '', 'teotonio', 'c-s2'],
    ['s3', ASSINADO, 'RAN-1', 5, 'E4', 'Eq', 'Wallace', 'Diurno', '', '', 'wallace', '', 'ranario', 'c-s3'],
  ]);
  S.aba('RDO_Diario', [CAB_DI,
    ['D0001', ASSINADO, 'teotonio', 1, 'Wallace', '', 'Bom', 'wallace', 'rAAA'],
    ['D0002', ABERTO, 'teotonio', 2, 'Wallace', '', 'Bom', 'wallace', 'rBBB'],
    ['D0003', ASSINADO, 'ranario', 1, 'Wallace', '', 'Bom', 'wallace', 'rCCC'],
  ]);
  S.aba('RDO_Assinaturas', [CAB_AS,
    ['a1', 'teotonio', ASSINADO, 'engenheiro', 'Engenheiro', 'Márcio', 'm@x', 'token-do-engenheiro-assinado', 'assinada', '', '2026-09-23 06:30:00', 'drive_id:f1', 'Márcio', '', '', '', 'arquivada'],
    ['a2', 'teotonio', ASSINADO, 'fiscalizacao', 'Fiscalização', 'Fiscal', 'f@x', 'token-do-fiscal-dia-assinado', 'assinada', '', '2026-09-23 15:00:00', 'drive_id:f2', 'Fulano Fiscal', '', '', '', 'link'],
    ['a3', 'teotonio', ABERTO, 'engenheiro', 'Engenheiro', 'Márcio', 'm@x', 'token-do-engenheiro-dia-aberto', 'assinada', '', '2026-09-24 06:30:00', 'drive_id:f1', 'Márcio', '', '', '', 'arquivada'],
    ['a4', 'teotonio', ABERTO, 'fiscalizacao', 'Fiscalização', 'Fiscal', 'f@x', 'token-do-fiscal-dia-aberto-xx', 'pendente', '', '', '', '', '', '', '', ''],
  ]);
  // o PDF depositado de cada dia (o Drive, só o que estas funções usam)
  const PDFS = {};
  const pdf = (obra, iso, desc) => (PDFS[obra + '|' + iso] = {
    lixo: false, _desc: desc || '', getId: () => 'pdf-' + iso, isTrashed() { return this.lixo; },
    getDescription() { return this._desc; }, setDescription(d) { this._desc = d; }, setSharing() { return this; },
    setTrashed(v) { this.lixo = v; if (v) delete PDFS[obra + '|' + iso]; },
  });
  S.ctx.rdoPdfArquivo_ = (obra, iso) => PDFS[obra + '|' + iso] || null;
  return Object.assign(S, { PDFS, pdf });
}
const col = (aba, nome) => aba.dados[0].indexOf(nome);
const linhaPorId = (aba, id) => aba.dados.find(l => l[0] === id);
const lote = (id, data, extra) => JSON.stringify([Object.assign(
  { id, data, pacote_id: 'P01', quantidade: 7, local_estaca: 'E122 (CB)', turno: 'Diurno', obra: 'teotonio' }, extra || {})]);
const CAMPO = 'tok-wallace-campo', ENG = 'tok-leo-engenharia', ADM = 'tok-adm-admin';

console.log('LANÇAR SERVIÇO NUM DIA JÁ ASSINADO');
{
  const S = montar(), av = S.abas.RDO_Avanco, di = S.abas.RDO_Diario, as = S.abas.RDO_Assinaturas;
  let r = S.ctx.addBatchRDO(lote('n1', ASSINADO), 'c-n1', CAMPO);
  ok('o apontador é recusado com RDO_ASSINADO, e nada é gravado',
     r.ok === false && r.error === 'RDO_ASSINADO' && r.data === ASSINADO && /Fulano Fiscal/.test(r.mensagem) && av.dados.length === 4, JSON.stringify(r));
  ok('a mensagem manda pedir ao escritório', /escritório reabre/.test(r.mensagem), r.mensagem);
  r = S.ctx.addBatchRDO(lote('s1', ASSINADO), 'c-s1', CAMPO);
  ok('o lote que JÁ tinha entrado e é reenviado pela fila continua "já salvo"', r.ok === true && r.duplicate === true, JSON.stringify(r));
  r = S.ctx.addBatchRDO(lote('n2', ASSINADO, { turno: 'Ajuste' }), 'c-n2', ENG);
  ok('ajuste de avanço não é serviço do dia: entra sem reabrir e sem mexer na revisão',
     r.ok === true && r.inserted === 1 && !Object.keys(r.dias || {}).length && linhaPorId(di, 'D0001')[col(di, 'revisao')] === 'rAAA', JSON.stringify(r));
  r = S.ctx.addBatchRDO(lote('n3', ASSINADO, { obra: 'ranario', pacote_id: 'RAN-1' }), 'c-n3', CAMPO);
  ok('a outra obra, no mesmo dia, não tem nada a ver com a firma', r.ok === true && r.inserted === 1 &&
     linhaPorId(di, 'D0003')[col(di, 'revisao')] === 'rCCC', JSON.stringify(r));
  r = S.ctx.addBatchRDO(lote('n4', ASSINADO), 'c-n4', CAMPO, '1');
  ok('reabrir não é do apontador', r.ok === false && r.error === 'SEM_PERMISSAO' && !linhaPorId(av, 'n4'), JSON.stringify(r));
  r = S.ctx.addBatchRDO(lote('n5', ASSINADO), 'c-n5', ENG, '1');
  const fis = as.dados.find(l => l[0] === 'a2'), eng = as.dados.find(l => l[0] === 'a1');
  ok('o escritório reabre: o serviço entra e a firma do fiscal volta a pendente, com link novo',
     r.ok === true && r.reaberto === 1 && !!linhaPorId(av, 'n5') &&
     fis[col(as, 'status')] === 'pendente' && fis[col(as, 'token')] !== 'token-do-fiscal-dia-assinado' && fis[col(as, 'assinatura')] === '', JSON.stringify([r.reaberto, fis]));
  ok('a firma arquivada do engenheiro fica', eng[col(as, 'status')] === 'assinada' && eng[col(as, 'token')] === 'token-do-engenheiro-assinado');
  ok('o "RDO ASSINADO" do dia é esquecido (a via nova vai para todos)', !JSON.parse(S.props.RDO_ASSINADO_LOG)['teotonio|' + ASSINADO]);
  const nova = linhaPorId(di, 'D0001')[col(di, 'revisao')];
  ok('o dia ganha revisão nova, e ela volta na resposta para o app desenhar o PDF dela',
     nova !== 'rAAA' && r.dias[ASSINADO] && r.dias[ASSINADO].revisao === nova && r.dias[ASSINADO].numero_rdo === 1, JSON.stringify(r.dias));
  ok('a reabertura fica na Auditoria', S.auditoria.some(a => a[2] === 'reabrirRDOAssinado'));
}

console.log('\nANTES DA FIRMA: O PDF GUARDADO FICA PARA TRÁS');
{
  const S = montar(), di = S.abas.RDO_Diario;
  let r = S.ctx.addBatchRDO(lote('n1', ABERTO), 'c-n1', CAMPO);
  const nova = linhaPorId(di, 'D0002')[col(di, 'revisao')];
  ok('o serviço entra, e o dia ganha revisão nova', r.ok === true && nova !== 'rBBB' && r.dias[ABERTO].revisao === nova, JSON.stringify(r));
  ok('o dia entra na lista dos depósitos velhos', !!JSON.parse(S.props.RDO_DEPOSITO_VELHO)['teotonio|' + ABERTO], S.props.RDO_DEPOSITO_VELHO);
  ok('a firma do fiscal não entra no PDF de antes (a revisão dele não é mais a do dia)',
     S.ctx.rdoRevisoesDoDia_('teotonio', ABERTO).indexOf('rBBB') === -1);
  r = S.ctx.addBatchRDO(lote('n2', SEM_DIARIO), 'c-n2', CAMPO);
  ok('dia sem RDO Diário não tem PDF para ficar para trás: nada é marcado',
     r.ok === true && !Object.keys(r.dias).length && !JSON.parse(S.props.RDO_DEPOSITO_VELHO)['teotonio|' + SEM_DIARIO], JSON.stringify(r.dias));

  // a varredura enxerga o dia; o depósito com a revisão do dia o tira da lista
  S.ctx.rdoAssinantes = () => [{ papel: 'engenheiro' }, { papel: 'fiscalizacao' }];
  S.ctx.rdoPdfAssinaturasNoDeposito_ = () => 1;
  const pend = S.ctx.rdoAssinadosPendentes({ obra: 'teotonio' });
  const item = (pend.pendentes || []).find(x => x.data === ABERTO);
  ok('a varredura dos aparelhos recebe o dia como desatualizado', pend.ok && item && item.desatualizado === true, JSON.stringify(pend));
  S.ctx.rdoDepositoVelhoSoltar_('teotonio', ABERTO);
  ok('e ele sai da lista quando o depósito chega', !JSON.parse(S.props.RDO_DEPOSITO_VELHO)['teotonio|' + ABERTO]);
}

console.log('\nCORRIGIR E APAGAR SERVIÇO');
{
  const S = montar(), av = S.abas.RDO_Avanco, di = S.abas.RDO_Diario;
  let r = S.ctx.updateRDO(JSON.stringify({ id: 's1', quantidade: 99 }), ENG);
  ok('corrigir a quantidade de um serviço do dia assinado é recusado', r.ok === false && r.error === 'RDO_ASSINADO' &&
     linhaPorId(av, 's1')[col(av, 'Quantidade')] === 10, JSON.stringify(r));
  r = S.ctx.updateRDO(JSON.stringify({ id: 's2', data: ASSINADO }), ENG);
  ok('MOVER um serviço para o dia assinado também', r.ok === false && r.error === 'RDO_ASSINADO' && linhaPorId(av, 's2')[col(av, 'Data')] === ABERTO, JSON.stringify(r));
  r = S.ctx.updateRDO(JSON.stringify({ id: 's2', quantidade: 25 }), ENG);
  ok('no dia ainda não assinado a correção entra e o dia ganha revisão nova',
     r.ok === true && linhaPorId(av, 's2')[col(av, 'Quantidade')] === 25 && r.dias[ABERTO] &&
     r.dias[ABERTO].revisao === linhaPorId(di, 'D0002')[col(di, 'revisao')] && r.dias[ABERTO].revisao !== 'rBBB', JSON.stringify(r));
  r = S.ctx.updateRDO(JSON.stringify({ id: 's1', quantidade: 99 }), ENG, '1');
  ok('com o escritório reabrindo, a correção do dia assinado entra', r.ok === true && r.reaberto === 1 &&
     linhaPorId(av, 's1')[col(av, 'Quantidade')] === 99, JSON.stringify(r));

  const T = montar(), av2 = T.abas.RDO_Avanco;
  r = T.ctx.deleteRDO('s1', ADM);
  ok('apagar serviço de dia assinado é recusado — até para o admin', r.ok === false && r.error === 'RDO_ASSINADO' && !!linhaPorId(av2, 's1'), JSON.stringify(r));
  r = T.ctx.deleteRDO('s2', ADM);
  ok('no dia aberto apaga, e o dia ganha revisão nova', r.ok === true && !linhaPorId(av2, 's2') && r.dias[ABERTO] && r.dias[ABERTO].revisao !== 'rBBB', JSON.stringify(r));
  r = T.ctx.deleteRDO('s3', ADM);
  ok('serviço de outra obra: apaga sem tocar em RDO nenhum', r.ok === true && !Object.keys(r.dias).length, JSON.stringify(r));
  r = T.ctx.deleteRDO('s1', ADM, '1');
  ok('reaberto pelo escritório, o serviço do dia assinado sai', r.ok === true && r.reaberto === 1 && !linhaPorId(av2, 's1'), JSON.stringify(r));
}

console.log('\nAPAGAR O RDO DIÁRIO');
{
  const S = montar(), di = S.abas.RDO_Diario;
  S.pdf('teotonio', ABERTO, 'RDO nº 2 — ' + ABERTO + ' — assinaturas: 1 — revisao: rBBB');
  // sessão que só enxerga a Teotônio
  const soTeotonio = 'tok-ana-admin';
  const real = S.ctx.sessaoDoToken;
  S.ctx.sessaoDoToken = t => (t === soTeotonio ? { usuario: 'ana', perfil: 'admin', obras: ['teotonio'] } : real(t));
  let r = S.ctx.deleteRDODiario('D0003', '', soTeotonio, '');
  ok('sem `obra` no pedido, quem só tem a Teotônio NÃO apaga o diário do Ranário',
     r.ok === false && r.error === 'SEM_ACESSO_A_OBRA' && !!linhaPorId(di, 'D0003'), JSON.stringify(r));
  r = S.ctx.deleteRDODiario('D0002', ABERTO, ADM, 'teotonio');
  ok('o dia apagado leva o PDF depositado junto (o gatilho das 6h30 não manda RDO apagado)',
     r.ok === true && !linhaPorId(di, 'D0002') && !S.PDFS['teotonio|' + ABERTO], JSON.stringify(r));
  const aud = S.auditoria.find(a => a[2] === 'deleteRDODiario');
  ok('a linha apagada vai INTEIRA para a Auditoria, com a obra dela',
     aud && aud[3] === 'teotonio' && /"apontador_diurno":"Wallace"/.test(aud[5]) && /"revisao":"rBBB"/.test(aud[5]), aud && JSON.stringify(aud));
  ok('e a retirada do PDF também fica registrada', S.auditoria.some(a => a[2] === 'rdoPdfRetirado'));
}

console.log('\nA FOTO DIZ SE ENTROU NA LINHA');
{
  const S = montar();
  S.ctx.gravarFotoNoDrive_ = () => ({ arquivo: { getId: () => 'foto1' }, reaproveitada: false });
  S.ctx.DriveApp = { getFoldersByName: () => ({ hasNext: () => true, next: () => ({}) }) };
  const foto = 'data:image/jpeg;base64,AAAA';
  let r = S.ctx.rdoFoto({ id: 's2', obra: 'teotonio', foto, token: CAMPO });
  ok('serviço que existe: a foto entra na linha', r.ok === true && r.anexada === true &&
     /drive_id:foto1/.test(linhaPorId(S.abas.RDO_Avanco, 's2')[col(S.abas.RDO_Avanco, 'foto_link')]), JSON.stringify(r));
  r = S.ctx.rdoFoto({ id: 'ainda-na-fila', obra: 'teotonio', foto, token: CAMPO });
  ok('serviço que ainda não subiu: a resposta avisa que NÃO anexou', r.ok === true && r.anexada === false, JSON.stringify(r));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
