// O QUE A REVISÃO DA v70 ACHOU NO SERVIDOR — e que tem de ficar fechado.
//
// Cada caso foi lido (ou reproduzido) no Code.gs de verdade antes da correção:
//   • as LEITURAS não conferiam a obra: quem só tem o Ranário lia as notas, as
//     viagens e as horas de máquina da Teotônio; `nfListar` sem obra devolvia
//     as notas de TODAS as obras;
//   • a firma arquivada (arquivar e ler a imagem) só conferia o perfil;
//   • o e-mail "RDO ASSINADO" saía de novo para a lista inteira a cada
//     depósito de um dia antigo, porque o registro de envios é aparado;
//   • o admin que trocava a própria senha continuava com as OUTRAS sessões
//     dele valendo (o celular perdido seguia dentro);
//   • comparado letra por letra, o admin que entrou em minúsculas tirava o
//     próprio acesso;
//   • a medição fechada nunca gravou quem fechou nem quando, e a competência
//     que a planilha guarda como data não casava mais;
//   • a nota sem obra escrita (Teotônio) era regravada como de outra obra;
//   • o XML da nota dentro de um JSON ia inteiro para o leitor de XML;
//   • o id do RDO Diário dava a volta depois do D9999.
//
// Como rodar:  node tests/revisao-v70-servidor.test.js
const { criar } = require('./servidor-falso.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};
const j = o => JSON.stringify(o);

// sessões: tok-<usuario>-<perfil>; o usuário "rita" só tem o Ranário
function servidor(props) {
  const S = criar({ props: Object.assign({ EXIGIR_TOKEN: 'true' }, props || {}) });
  const base = S.ctx.sessaoDoToken;
  S.ctx.sessaoDoToken = t => {
    const s = base(t);
    if (s && s.usuario === 'rita') s.obras = ['ranario'];
    return s;
  };
  S.ctx.responder = resp => resp;          // o roteador devolve o objeto, sem embrulho
  S.ctx.hashSenha = s => 'hash:' + s;      // (o digest do ambiente falso não devolve nada)
  // datas no formato pedido, no fuso do teste (UTC)
  S.ctx.Utilities.formatDate = (d, tz, f) => f === 'yyyy-MM' ? new Date(d).toISOString().slice(0, 7) : new Date(d).toISOString().slice(0, 10);
  S.pedir = p => S.ctx.rotear({ parameter: p });
  return S;
}

console.log('AS LEITURAS TAMBÉM SÃO DA OBRA');
{
  const S = servidor();
  S.aba('NotasFiscais', [['id', 'obra', 'fornecedor', 'valor', 'dataEmissao', 'dataEntrada'],
    ['n1', 'teotonio', 'Pedreira X', 1000, '2026-10-01', '2026-10-02'],
    ['n2', 'ranario', 'Usina Y', 2000, '2026-10-03', '2026-10-04'],
    ['n3', '', 'Fornecedor antigo', 300, '2026-01-10', '2026-01-11']]);
  S.aba('EstoqueSaidas', [['id', 'obra', 'data', 'material', 'qtd']]);
  const RITA = 'tok-rita-engenharia', LEO = 'tok-leo-engenharia';
  ['nfListar', 'bfListar', 'equipListar', 'equipUltimos', 'equipApontamentos'].forEach(acao => {
    const r = S.pedir({ action: acao, obra: 'teotonio', token: RITA });
    ok(acao + ': quem só tem o Ranário não lê a Teotônio', r && r.ok === false && r.error === 'SEM_ACESSO_A_OBRA', j(r).slice(0, 120));
  });
  const dela = S.pedir({ action: 'nfListar', obra: 'ranario', token: RITA });
  ok('e lê a obra dela', dela.ok === true && dela.notas.length === 1 && dela.notas[0].id === 'n2', j(dela).slice(0, 160));
  const semObra = S.pedir({ action: 'nfListar', obra: '', token: LEO });
  ok('nfListar sem obra não devolve as notas de todas as obras (em branco é Teotônio)',
     semObra.ok === true && semObra.notas.map(n => n.id).join(',') === 'n1,n3', semObra.notas && semObra.notas.map(n => n.id).join(','));
}

console.log('\nA FIRMA ARQUIVADA É DA OBRA QUE ASSINA');
{
  const S = servidor();
  const a = S.ctx.rdoFirmaArquivar({ token: 'tok-rita-engenharia', papel: 'engenheiro', nome: 'Qualquer Um', assinatura: 'data:image/png;base64,AAAA' });
  ok('engenharia de outra obra não arquiva firma na Teotônio', a.ok === false && a.error === 'SEM_ACESSO_A_OBRA' && !S.props.RDO_FIRMA_ARQUIVADA, j(a));
  const l = S.ctx.rdoFirmasArquivadasLer({ token: 'tok-rita-engenharia' });
  ok('nem lê a imagem da firma do engenheiro', l.ok === false && l.error === 'SEM_ACESSO_A_OBRA', j(l).slice(0, 120));
}

console.log('\nO "RDO ASSINADO" NÃO SAI DE NOVO PARA O DIA ANTIGO');
{
  const DIA = '2026-06-10';
  const CAB = ['id', 'obra', 'data', 'papel', 'rotulo', 'nome', 'email', 'token', 'status', 'convidadoEm',
               'assinadoEm', 'assinatura', 'nomeAssinante', 'documento', 'agente', 'observacao', 'origem'];
  const S = servidor();
  S.aba('RDO_Assinaturas', [CAB,
    ['a1', 'teotonio', DIA, 'engenheiro', 'Engenheiro', 'Márcio', 'm@x', 'token-do-engenheiro-xxxxxxxx', 'assinada', '', DIA + ' 06:30:00', 'drive_id:f1', 'Márcio', '', '', '', 'arquivada'],
    ['a2', 'teotonio', DIA, 'fiscalizacao', 'Fiscalização', 'Fiscal', 'f@x', 'token-do-fiscal-xxxxxxxxxxxx', 'assinada', '', DIA + ' 15:00:00', 'drive_id:f2', 'Fulano', '', '', '', 'link']]);
  let enviados = 0;
  S.ctx.MailApp = { getRemainingDailyQuota: () => 100, sendEmail: () => { enviados++; } };
  S.ctx.rdoAssinantes = () => [{ papel: 'engenheiro' }, { papel: 'fiscalizacao' }];
  S.ctx.rdoFirmasCompletas_ = () => true;
  S.ctx.rdoEmailDestinatarios = () => ['a@x', 'b@x'];
  S.ctx.rdoPdfArquivo_ = () => ({ getBlob: () => ({ setName: () => ({}) }) });
  S.ctx.rdoDiarioDaData_ = () => ({ numero_rdo: 7 });
  S.ctx.rdoAssinCodigo_ = () => 'ABCD';
  S.ctx.rdoObraNome_ = () => 'Teotônio';
  S.ctx.rdoDiaSemana_ = () => 'quarta-feira';

  let r = S.ctx.rdoEnviarAssinadoSePronto_('teotonio', DIA, 2);
  const as = S.abas.RDO_Assinaturas, iM = () => as.dados[0].indexOf('assinadoEnviadoEm');
  ok('a primeira vez manda, e marca o envio na própria linha da assinatura',
     r.ok && !r.pulado && enviados === 1 && iM() !== -1 && !!as.dados[1][iM()] && !!as.dados[2][iM()], j([r, enviados, as.dados[0]]));
  // o registro é aparado: o dia antigo sai dele
  S.props.RDO_ASSINADO_LOG = '{}';
  r = S.ctx.rdoEnviarAssinadoSePronto_('teotonio', DIA, 2);
  ok('com o dia fora do registro (aparado), o depósito seguinte NÃO manda de novo', r.ok && /já enviado/.test(r.pulado || '') && enviados === 1, j([r, enviados]));
  // reabrir solta a marca: quando as firmas entrarem de novo, a via nova vai
  S.ctx.rdoReabrirAssinaturas_('teotonio', DIA, S.ctx.rdoFirmasDePessoa_('teotonio', DIA), { usuario: 'leo', perfil: 'engenharia' });
  ok('reabrir o RDO solta a marca', !as.dados[1][iM()] && !as.dados[2][iM()], j([as.dados[1][iM()], as.dados[2][iM()]]));
}

console.log('\nUSUÁRIOS');
{
  const usuarios = () => JSON.stringify({ Leo: { senha: 'h1', perfil: 'admin', obras: '*' },
                                          Bia: { senha: 'h2', perfil: 'admin', obras: '*' },
                                          ana: { senha: 'h3', perfil: 'campo', obras: '*' } });
  const sess = u => JSON.stringify({ u, p: 'admin', em: Date.now() });
  let S = servidor({ USUARIOS: usuarios(), 'SES_tok-Leo-admin': sess('Leo'), 'SES_celular-perdido': sess('Leo'), 'SES_da-ana': sess('ana') });
  let r = S.ctx.usuarioSalvar({ token: 'tok-Leo-admin', nome: 'Leo', nomeAntigo: 'Leo', perfil: 'admin', senha: 'senhaNova1' });
  ok('o admin troca a própria senha: as OUTRAS sessões dele caem', r.ok === true && r.sessoesDerrubadas === 1 && !('SES_celular-perdido' in S.props), j([r, Object.keys(S.props)]));
  ok('a sessão em uso continua (ele não perde a tela), e a dos outros não é tocada', ('SES_tok-Leo-admin' in S.props) && ('SES_da-ana' in S.props));

  S = servidor({ USUARIOS: usuarios() });
  r = S.ctx.usuarioSalvar({ token: 'tok-leo-admin', nome: 'Leo', nomeAntigo: 'Leo', perfil: 'campo' });
  ok('quem entrou como "leo" não tira o acesso de admin do próprio "Leo"', r.ok === false && r.error === 'AUTO_REBAIXA', j(r));
  r = S.ctx.usuarioExcluir({ token: 'tok-leo-admin', nome: 'Leo' });
  ok('nem apaga o próprio usuário', r.ok === false && r.error === 'AUTO_EXCLUSAO', j(r));
}

console.log('\nMEDIÇÃO FECHADA');
{
  const S = servidor();
  S.aba('Medicoes', [['id', 'obra', 'competencia', 'fechadaEm', 'fechadaPor', 'itens', 'observacao', 'reaberta', 'reabertaEm', 'reabertaPor']]);
  let r = S.ctx.medicaoFechar({ token: 'tok-leo-engenharia', obra: 'teotonio', competencia: '2026-10', itens: '[]' });
  const m = S.abas.Medicoes.dados, c = n => m[0].indexOf(n);
  ok('fechar grava QUEM fechou e QUANDO', r.ok === true && m[1][c('fechadaPor')] === 'leo' &&
     Object.prototype.toString.call(m[1][c('fechadaEm')]) === '[object Date]', j(m[1]));
  ok('a competência vai marcada como texto', m[1][c('competencia')] === "'2026-10", j(m[1][c('competencia')]));
  const lista = S.ctx.medicaoListar('teotonio');
  ok('e a listagem devolve "2026-10"', lista.medicoes.length === 1 && lista.medicoes[0].competencia === '2026-10', j(lista.medicoes));
  // a célula que a planilha converteu em data (1º de outubro, no fuso do teste)
  m[1][c('competencia')] = new Date('2026-10-01T12:00:00Z');
  r = S.ctx.medicaoFechar({ token: 'tok-leo-engenharia', obra: 'teotonio', competencia: '2026-10', itens: '[]' });
  ok('competência guardada como DATA ainda é a mesma: não fecha em dobro', r.ok === false && r.error === 'JA_FECHADA' && m.length === 2, j(r));
  ok('e a listagem a devolve como "2026-10"', S.ctx.medicaoListar('teotonio').medicoes[0].competencia === '2026-10');
  r = S.ctx.medicaoReabrir({ token: 'tok-leo-engenharia', obra: 'teotonio', competencia: '2026-10' });
  ok('e reabre', r.ok === true && m[1][c('reaberta')] === 'sim', j(r));
}

console.log('\nMIÚDOS');
{
  const S = servidor();
  const cab = ['id', 'obra', 'usuario', 'criadoem'];
  let r = S.ctx.regravarNaObra_(cab, ['n3', '', 'wallace', ''], ['n3', 'ranario', 'rita', ''], 'ranario');
  ok('nota sem obra escrita é da Teotônio: outra obra não a regrava', r && r.error === 'OUTRA_OBRA', j(r));
  r = S.ctx.regravarNaObra_(cab, ['n3', '', 'wallace', ''], ['n3', 'teotonio', 'leo', ''], 'teotonio');
  ok('a própria Teotônio regrava', r === null);

  const xml = '<nfeProc><NFe><infNFe Id="NFe1"></infNFe></NFe></nfeProc>';
  ok('XML cru volta como está', S.ctx.nfeAcharXML(xml) === xml);
  ok('XML dentro de um JSON é tirado de dentro, não vai o JSON inteiro', S.ctx.nfeAcharXML(JSON.stringify({ status: 'ok', xml })) === xml,
     String(S.ctx.nfeAcharXML(JSON.stringify({ status: 'ok', xml }))).slice(0, 60));

  const ids = n => [['id']].concat(n.map(x => [x]));
  ok('o id do diário continua D0013 depois do D0012', S.ctx.gerarIdDiario(ids(['D0001', 'D0012']), 0) === 'D0013');
  ok('e não dá a volta depois do D9999', S.ctx.gerarIdDiario(ids(['D9999']), 0) === 'D10000', S.ctx.gerarIdDiario(ids(['D9999']), 0));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
