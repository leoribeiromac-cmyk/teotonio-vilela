// AS PORTAS DO SERVIDOR QUE A REVISÃO ACHOU ABERTAS — e que têm de ficar fechadas.
//
// Cada caso aqui foi reproduzido no Code.gs de verdade antes da correção:
//   • o nome "constructor" entrava como engenharia em todas as obras (a
//     "senha" era o texto da função herdada do Object);
//   • apagar com um ID que não existe mais levava o ÚNICO RDO que sobrou no dia;
//   • apagar o RDO assinado e lançar de novo furava a regra "assinado só muda
//     reaberto" (as firmas continuavam valendo na linha nova);
//   • `{"obra":"ranario","OBRA":"teotonio"}` passava pela porta do Ranário e
//     gravava na Teotônio;
//   • a parte com o nome de outro apontador trocava a parte dele, calada;
//   • "apagar por prefixo" com o prefixo em branco apagava a aba inteira;
//   • o botão "Enviar para assinatura" aceitava o RDO de HOJE, e o gatilho de
//     amanhã achava "já enviado".
//
// Roda sem dependência externa:  node tests/seguranca-servidor.test.js
const { criar } = require('./servidor-falso');

let falhas = 0;
const t = (nome, fn) => {
  try { fn(); console.log('  ✓ ' + nome); }
  catch (e) { falhas++; console.log('  ✗ ' + nome + '  → ' + (e && e.message ? e.message : e)); }
};
const eq = (a, b, msg) => {
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'esperava ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
};
const verdade = (c, msg) => { if (!c) throw new Error(msg || 'esperava verdadeiro'); };

const DIA = '2026-09-22';
const CAB_ASSIN = ['id', 'obra', 'data', 'papel', 'rotulo', 'nome', 'email', 'token', 'status',
  'convidadoEm', 'assinadoEm', 'assinatura', 'nomeAssinante', 'documento', 'agente', 'observacao', 'origem'];
const CAB_DIARIO = ['id', 'data', 'apontador_diurno', 'apontador_noturno', 'encarregado',
  'clima_manha', 'clima_tarde', 'clima_noite', 'visitas', 'ocorrencias', 'observacoes_gerais',
  'tem_turno_noturno', 'efetivo_json', 'equipamentos_json', 'usuario', 'obra', 'numero_rdo',
  'paralisacoes_json', 'paralisado_motivo'];
const linhaDia = (id, extra) => {
  const b = Object.assign({ id, data: DIA, apontador_diurno: 'Wallace', clima_manha: 'Bom', clima_tarde: 'Bom',
    ocorrencias: 'o que o fiscal viu', tem_turno_noturno: 'false', efetivo_json: '{}', equipamentos_json: '{}',
    usuario: 'wallace', obra: 'teotonio', numero_rdo: 100, paralisacoes_json: '{}' }, extra || {});
  return CAB_DIARIO.map(c => b[c] === undefined ? '' : b[c]);
};

console.log('\nAS PORTAS DO SERVIDOR\n');

console.log('Login');
const USUARIOS = JSON.stringify({ leonardo: { senha: 'abc123', perfil: 'admin', obras: '*' } });
t('nome herdado do Object (constructor, toString, __proto__…) não entra com senha nenhuma', () => {
  const S = criar({ props: { USUARIOS } });
  S.ctx.sessaoCriar = () => 'tok-intruso-admin';
  ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'].forEach(nome => {
    [String(Object.prototype[nome] || 'x'), 'function Object() { [native code] }', 'x', '[object Object]'].forEach(senha => {
      const r = S.ctx.loginUsuario(nome, senha);
      verdade(!r.ok, `"${nome}" entrou com "${senha.slice(0, 30)}": ` + JSON.stringify(r));
    });
  });
});
t('quem está no cadastro continua entrando', () => {
  const S = criar({ props: { USUARIOS } });
  S.ctx.sessaoCriar = () => 'tok-leonardo-admin';
  const r = S.ctx.loginUsuario('leonardo', 'abc123');
  verdade(r.ok && r.perfil === 'admin', JSON.stringify(r));
  verdade(!S.ctx.loginUsuario('leonardo', 'errada').ok, 'entrou com a senha errada');
});
t('digitar o próprio hash guardado não entra', () => {
  const hash = 'a'.repeat(64);
  const S = criar({ props: { USUARIOS: JSON.stringify({ wallace: { senha: hash, perfil: 'campo' } }) } });
  S.ctx.sessaoCriar = () => 'tok-wallace';
  verdade(!S.ctx.loginUsuario('wallace', hash).ok, 'o hash serviu de senha');
});

console.log('\nApagar o RDO do dia');
t('um ID que não existe mais NÃO leva o único RDO que sobrou no dia', () => {
  const S = criar();
  S.aba('RDO_Diario', [CAB_DIARIO, linhaDia('D0200')]);
  S.aba('RDO_Assinaturas', [CAB_ASSIN]);
  const r = S.ctx.deleteRDODiario('D0199', DIA, 'tok-chefe-admin', 'teotonio');
  verdade(!r.ok && r.naoEncontrado, JSON.stringify(r));
  eq(S.abas.RDO_Diario.dados.length, 2, 'apagou a linha que sobrou');
});
t('o RDO ASSINADO não se apaga (apagar e lançar de novo furava a trava)', () => {
  const S = criar();
  S.aba('RDO_Diario', [CAB_DIARIO, linhaDia('D0200')]);
  S.aba('RDO_Assinaturas', [CAB_ASSIN,
    ['A2', 'teotonio', DIA, 'fiscalizacao', 'Fiscal', 'Rita', 'r@x', 'tok-fis', 'assinada',
     '2026-09-23 08:00:00', '2026-09-23 15:00:00', 'drive_id:F', 'Rita Fiscal', '', '', '', 'link']]);
  const r = S.ctx.deleteRDODiario('D0200', DIA, 'tok-chefe-admin', 'teotonio');
  eq(r.error, 'RDO_ASSINADO', JSON.stringify(r));
  eq(S.abas.RDO_Diario.dados.length, 2, 'apagou o RDO assinado');
});
t('sem assinatura, o RDO certo continua saindo pelo ID', () => {
  const S = criar();
  S.aba('RDO_Diario', [CAB_DIARIO, linhaDia('D0200')]);
  S.aba('RDO_Assinaturas', [CAB_ASSIN]);
  const r = S.ctx.deleteRDODiario('D0200', DIA, 'tok-chefe-admin', 'teotonio');
  verdade(r.ok, JSON.stringify(r));
  eq(S.abas.RDO_Diario.dados.length, 1);
});

console.log('\nA obra de cada linha do lote');
t('"obra" e "OBRA" no mesmo item não passam pela porta de uma obra e gravam na outra', () => {
  const S = criar();
  S.aba('RDO_Avanco', [['id', 'data', 'obra', 'pacote_id', 'quantidade', 'usuario']]);
  S.ctx.sessaoDoToken = tk => tk === 'tok-rana' ? { usuario: 'rana', perfil: 'campo', obras: ['ranario'] } : null;
  const r = S.ctx.addBatchRDO(JSON.stringify([
    { id: 'x1', data: DIA, obra: 'ranario', OBRA: 'teotonio', pacote_id: 'P01', quantidade: 5 }]), 'c1', 'tok-rana');
  const linhas = S.abas.RDO_Avanco.dados.slice(1);
  verdade(!linhas.some(l => /teotonio/i.test(String(l[2]))), 'gravou na Teotônio: ' + JSON.stringify(linhas));
  verdade(!r.ok || linhas.every(l => /ranario/i.test(String(l[2]))), JSON.stringify(r));
});

console.log('\nAs partes do dia (várias frentes no mesmo turno)');
const CAB_PARTES = CAB_DIARIO;
const enviarParte = (S, p, tok, de) => S.ctx.upsertRDODiario({ action: 'updateRDODiario', obra: 'ruas-de-terra', data: DIA,
  contribuicao: JSON.stringify(Object.assign({ turno: 'diurno', clima: {}, efetivo: { padrao: {} }, equipamentos: { padrao: {} },
    paralisacoes: [], visitas: '', ocorrencias: '', observacoes: '' }, p)), contribuicao_de: de || '', token: tok }, true);
/* Com EXIGIR_TOKEN desligado (modo de implantação) o servidor trata todo
   mundo como admin, por desenho: as portas por pessoa valem em produção. */
t('mandar a parte com o nome de OUTRA pessoa não troca a parte dela', () => {
  const S = criar({ props: { EXIGIR_TOKEN: 'true' } });
  S.aba('RDO_Diario', [CAB_PARTES]);
  S.ctx.mapaChuvaAposGravar_ = () => {};
  verdade(enviarParte(S, { apontador: 'João', efetivo: { padrao: { servente: '8' } }, ocorrencias: 'Rua A: base' }, 'tok-joaoa').ok);
  const r = enviarParte(S, { apontador: 'joao', efetivo: { padrao: { servente: '3' } }, ocorrencias: 'Rua B: guia' }, 'tok-joaob');
  eq(r.error, 'PARTE_DE_OUTRO', JSON.stringify(r));
  const l = S.abas.RDO_Diario.dados[1];
  verdade(/Rua A/.test(l[CAB_PARTES.indexOf('ocorrencias')]), 'a ocorrência do João sumiu');
});
t('a engenharia corrige a parte alheia — e não vira dona dela', () => {
  const S = criar({ props: { EXIGIR_TOKEN: 'true' } });
  S.aba('RDO_Diario', [CAB_PARTES]);
  S.ctx.mapaChuvaAposGravar_ = () => {};
  enviarParte(S, { apontador: 'João', efetivo: { padrao: { servente: '8' } } }, 'tok-joaoa');
  const r = enviarParte(S, { apontador: 'joao', efetivo: { padrao: { servente: '9' } } }, 'tok-chefe-engenharia');
  verdade(r.ok, JSON.stringify(r));
  const partes = JSON.parse(S.abas.RDO_Diario.dados[1][S.abas.RDO_Diario.dados[0].indexOf('contribuicoes_json')] || '{}');
  const p = Object.values((partes.diurno) || {})[0] || {};
  eq(String(p.usuario).toLowerCase(), 'joaoa', 'quem corrigiu virou dono');
});

console.log('\nA imagem da nota e a medição');
t('a imagem mandada com o id de uma nota de OUTRA obra não troca a prova dela', () => {
  const S = criar();
  S.ctx.Utilities.newBlob = () => ({});
  S.ctx.Utilities.base64Decode = () => [1];
  S.aba('NotasFiscais', [['id', 'clientid', 'obra', 'numero', 'driveid'], ['nt1', 'nt1', 'teotonio', '1001', 'drvOriginal']]);
  let mexeuNoDrive = false;
  S.ctx.nfPastaDaNota = () => { mexeuNoDrive = true;
    return { getFilesByName: () => ({ hasNext: () => false }), createFile: () => ({ setSharing() {}, getId: () => 'novo' }) }; };
  const r = S.ctx.nfImagem({ foto: 'data:image/jpeg;base64,AAAA', id: 'nt1', obra: 'ranario', numero: '1001' });
  eq(r.error, 'OUTRA_OBRA', JSON.stringify(r));
  verdade(!mexeuNoDrive, 'chegou a gravar no Drive');
  eq(S.abas.NotasFiscais.dados[1][4], 'drvOriginal', 'trocou a prova da nota');
});
t('fechar a medição, mexer nas máquinas e na imagem da nota passam pela porta da obra', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');
  const lista = (/var POR_OBRA = \[([\s\S]*?)\];/.exec(src) || [])[1] || '';
  ['medicaoFechar', 'medicaoReabrir', 'equipCadastrar', 'locadoraCadastrar', 'equipDesativar', 'nfImagem']
    .forEach(a => verdade(lista.indexOf("'" + a + "'") !== -1, a + ' fora do POR_OBRA'));
});

console.log('\nApagar por prefixo de ID');
t('prefixo em branco, curto ou que não é data não apaga nada', () => {
  const S = criar();
  S.aba('RDO_Avanco', [['id', 'data', 'obra'], ['20260922-1', DIA, 'teotonio'], ['20260923-1', '2026-09-23', 'teotonio']]);
  ['', '   ', 'abc', '2026', null].forEach(px => {
    const r = S.ctx.apagarPorPrefixoId(px, 'tok-chefe-admin');
    verdade(!r.ok, JSON.stringify(px) + ' passou: ' + JSON.stringify(r));
  });
  eq(S.abas.RDO_Avanco.dados.length, 3, 'linhas apagadas');
});

console.log('\nEnviar para assinatura');
t('o RDO de HOJE não sai pelo botão (o dia não acabou; o gatilho de amanhã pularia)', () => {
  const S = criar({ props: { EXIGIR_TOKEN: 'true' } });
  const hoje = new Date().toISOString().slice(0, 10);
  const r = S.ctx.rdoEnviarParaAssinatura({ obra: 'teotonio', data: hoje, token: 'tok-chefe-engenharia' });
  verdade(!r.ok && /hoje/i.test(r.error || ''), JSON.stringify(r));
});

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
