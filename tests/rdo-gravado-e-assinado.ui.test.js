// O PDF OFICIAL SAI DO QUE ESTÁ GRAVADO, E O RDO ASSINADO NÃO MUDA CALADO
// — o app de verdade falando com o Code.gs de verdade (servidor-falso).
//
//   • O PDF depositado depois de salvar sai da linha que o servidor devolve:
//     com o número do RDO já no primeiro depósito (antes ia "RDO Nº —", porque
//     o CSV publicado leva minutos para ver a gravação).
//   • O que está no formulário e não foi salvo NÃO entra no PDF oficial.
//   • RDO que a fiscalização já assinou: o Salvar é recusado. O escritório
//     pode reabrir (as firmas são canceladas e o convite sai de novo); o
//     apontador não — e o que ele digitou fica guardado no aparelho.
//
// Como rodar:  node tests/rdo-gravado-e-assinado.ui.test.js
const H = require('./harness.js');
const { criar } = require('./servidor-falso.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const h = new Date();
const ONTEM = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1));
const CAB = ['id', 'Data', 'apontador_diurno', 'apontador_noturno', 'clima_manha', 'clima_tarde', 'clima_noite',
  'visitas', 'ocorrencias', 'observacoes_gerais', 'tem_turno_noturno', 'efetivo_json', 'equipamentos_json',
  'paralisacoes_json', 'paralisado_motivo', 'obra', 'numero_rdo', 'usuario'];
const CAB_ASSIN = ['id', 'obra', 'data', 'papel', 'rotulo', 'nome', 'email', 'token', 'status',
  'convidadoEm', 'assinadoEm', 'assinatura', 'nomeAssinante', 'documento', 'agente', 'observacao', 'origem'];

const S = criar();
// o RDO 41 já existe (outro dia): o de ontem nasce 42
S.aba('RDO_Diario', [CAB.map(c => c.toLowerCase()),
  ['D0001', '2026-01-05', 'Wallace', '', 'Bom', 'Bom', '', '', '', '', 'false', '{}', '{}', '{}', '', 'teotonio', 41, 'w']]);
S.aba('RDO_Assinaturas', [CAB_ASSIN]);

const depositos = [], envios = [], gravacoes = [];
let perfilDaSessao = 'admin';
const pdfTexto = b64 => Buffer.from(String(b64 || '').replace(/^data:[^,]*,/, ''), 'base64').toString('latin1');

(async () => {
  const s = await H.abrir({
    diario: H.csv([CAB]),
    logar: { usuario: 'Leonardo', perfil: 'admin' },
    gas: (acao, params) => {
      if (acao === 'updateRDODiario' || acao === 'addRDODiario') {
        params.token = 'tok-leo-' + perfilDaSessao;
        gravacoes.push(Object.assign({}, params));
        return JSON.parse(JSON.stringify(S.ctx.upsertRDODiario(params, acao === 'updateRDODiario')));
      }
      if (acao === 'rdoPdfDoDia') { depositos.push(params); return { ok: true }; }
      if (acao === 'rdoEnviarParaAssinatura') { envios.push(params); return { ok: true, para: ['a@x'] }; }
      if (acao === 'rdoAssinaturasDoDia') {
        const linhas = JSON.parse(JSON.stringify(S.ctx.rdoAssinLinhasDoDia_('teotonio', params.data)));
        return { ok: true, assinaturas: linhas.map(l => ({ papel: l.papel, rotulo: l.rotulo, nome: l.nome,
          status: l.status, origem: l.origem, assinadoEm: l.assinadoEm, nomeAssinante: l.nomeAssinante })),
          noDeposito: depositos.length ? 1 : -1 };
      }
      return { ok: true };
    },
  });
  const p = s.p;
  // os PDFs e os envios desta página são disparados sozinhos: o teste espera por eles
  const esperar = async (cond, ms = 15000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await p.waitForTimeout(150); };

  console.log('O PDF OFICIAL SAI DO QUE ESTÁ GRAVADO');
  await s.ir('rdodiario');
  await p.evaluate(d => { DIARIO_V4 = abrirDiaV4(d); DIARIO_TURNO_ATIVO = 'diurno'; render(); }, ONTEM);
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    DIARIO_V4.diurno.apontador = 'Wallace';
    DIARIO_V4.diurno.ocorrencias = 'GRAVADO123';
    saveDiarioV4(DIARIO_V4);
    return salvarDiarioV4();
  });
  await esperar(() => depositos.length > 0);
  const dep = depositos[0] || {};
  ok('salvar deposita o PDF do dia', depositos.length === 1, depositos.length);
  ok('já com o número do RDO — o CSV ainda nem viu a gravação', String(dep.numero_rdo) === '42', dep.numero_rdo);
  ok('e com o que foi gravado', pdfTexto(dep.pdf).includes('GRAVADO123'));

  // mexe no formulário e NÃO salva
  await p.evaluate(() => { DIARIO_TURNO_ATIVO = 'diurno'; DIARIO_V4.diurno.ocorrencias = 'RASCUNHO999'; saveDiarioV4(DIARIO_V4); });
  const pdf2 = await p.evaluate(async d => { const r = await gerarPDFDiario(d, { entregar: 'base64' }); return r && r.base64; }, ONTEM);
  ok('o que está no formulário e não foi salvo não entra no PDF oficial',
     pdfTexto(pdf2).includes('GRAVADO123') && !pdfTexto(pdf2).includes('RASCUNHO999'));

  console.log('\nO RDO ASSINADO NÃO MUDA CALADO');
  // a fiscalização assinou pelo link
  S.abas.RDO_Assinaturas.dados.push(['A2', 'teotonio', ONTEM, 'fiscalizacao', 'Fiscal', 'Rita', 'r@x',
    'tok-fis-0123456789abcdef', 'assinada', ONTEM + ' 08:00:00', ONTEM + ' 15:00:00', 'drive_id:F', 'Rita Fiscal', '', '', '', 'link']);

  // o APONTADOR tenta salvar: recusado, sem pergunta, e o rascunho fica
  perfilDaSessao = 'apontador';
  S.props.EXIGIR_TOKEN = 'true';
  let perguntas = 0;
  const contar = d => { perguntas++; d.dismiss(); };
  p.on('dialog', contar);
  await p.evaluate(() => { STATE.perfilLogado = 'apontador'; return salvarDiarioV4(); });
  await p.waitForTimeout(400);
  const apont = await p.evaluate(d => ({ rasc: !!loadDiarioV4(d),
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ') }), ONTEM);
  p.off('dialog', contar);
  const linhaServ = () => { const d = S.abas.RDO_Diario.dados, c = n => d[0].indexOf(n);
    return d.slice(1).find(l => String(l[c('data')]).slice(0, 10) === ONTEM)[c('ocorrencias')]; };
  ok('o apontador não grava por cima do RDO assinado', linhaServ() === 'GRAVADO123', linhaServ());
  ok('e é avisado que só o escritório reabre, sem pergunta', perguntas === 0 && /escritório/.test(apont.toast), apont.toast.slice(0, 200));
  ok('e o que ele digitou fica guardado no aparelho', apont.rasc);

  // o ESCRITÓRIO salva: pergunta, reabre, grava, e o convite sai de novo
  perfilDaSessao = 'admin';
  let pergunta = '';
  p.once('dialog', d => { pergunta = d.message(); d.accept(); });
  const nDep = depositos.length;
  await p.evaluate(() => { STATE.perfilLogado = 'admin'; return salvarDiarioV4(); });
  await esperar(() => envios.length > 0);
  delete S.props.EXIGIR_TOKEN;
  ok('o escritório é perguntado se reabre', /assinado/i.test(pergunta) && /Rita Fiscal/.test(pergunta), pergunta);
  ok('e a segunda gravação vai com reabrir', gravacoes[gravacoes.length - 1].reabrir === '1');
  ok('a alteração entra', linhaServ() === 'RASCUNHO999', linhaServ());
  const A = S.abas.RDO_Assinaturas.dados, c = n => A[0].indexOf(n);
  const fiscal = A.find(l => l[c('papel')] === 'fiscalizacao');
  ok('a firma do fiscal é cancelada, com link novo', fiscal[c('status')] === 'pendente' &&
     fiscal[c('token')] !== 'tok-fis-0123456789abcdef', fiscal[c('status')]);
  ok('o PDF de novo é depositado SEM a firma cancelada', depositos.length > nDep &&
     Number(depositos[depositos.length - 1].assinaturas || 0) === 0, JSON.stringify(depositos.slice(nDep).map(d => d.assinaturas)));
  ok('e o convite sai de novo para quem assinou', envios.length === 1 && envios[0].data === ONTEM);

  ok('nenhum erro de página', s.erros.length === 0, s.erros.slice(0, 3).join(' ; '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
