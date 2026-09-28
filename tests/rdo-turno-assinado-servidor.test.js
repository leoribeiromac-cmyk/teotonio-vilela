// UM TURNO NÃO DESFAZ O OUTRO, O TEXTO É DO TURNO, E O RDO ASSINADO NÃO MUDA CALADO
// — o servidor, com uma planilha falsa.
//
//   • O aparelho que salva o diurno manda o noturno EM BRANCO (não o que ele
//     viu horas atrás): a correção que outro aparelho fez no noturno fica.
//   • Visitas, ocorrências e observações têm uma coluna por turno. A coluna
//     juntada (a do PDF) é refeita delas — corrigir a ocorrência do diurno
//     TROCA a ocorrência, em vez de somá-la à errada.
//   • Linha de antes das colunas por turno não perde o texto que tinha.
//   • RDO que alguém já assinou pelo link: gravar por cima é recusado
//     (RDO_ASSINADO). Reabrir é do escritório e cancela as firmas, com link
//     novo; a firma arquivada do engenheiro não conta como "alguém assinou".
//   • A gravação devolve a linha como ficou, com a `revisao` — é dela que o
//     app desenha o PDF oficial.
//
// Como rodar:  node tests/rdo-turno-assinado-servidor.test.js
const vm = require('vm');
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

function Aba(cab, linhas) {
  const dados = [cab.slice(), ...linhas.map(l => l.slice())];
  const rng = (r, c, nr, nc) => ({
    setValue(v) {
      while (dados.length < r) dados.push(new Array(dados[0].length).fill(''));
      while (dados[r - 1].length < c) dados[r - 1].push('');
      dados[r - 1][c - 1] = v;
    },
    getValues() {
      const out = [];
      for (let i = 0; i < (nr || 1); i++) {
        const row = [];
        for (let j = 0; j < (nc || 1); j++) row.push((dados[r - 1 + i] || [])[c - 1 + j] ?? '');
        out.push(row);
      }
      return out;
    },
    setValues(v) {
      v.forEach((row, i) => {
        const alvo = r - 1 + i;
        while (dados.length <= alvo) dados.push(new Array(dados[0].length).fill(''));
        row.forEach((val, j) => {
          while (dados[alvo].length <= c - 1 + j) dados[alvo].push('');
          dados[alvo][c - 1 + j] = val;
        });
      });
    }
  });
  return {
    dados,
    getLastColumn: () => dados[0].length,
    getLastRow: () => dados.length,
    getDataRange: () => ({ getValues: () => dados.map(l => l.slice()) }),
    appendRow(l) { dados.push(l.slice()); },
    deleteRow(r) { dados.splice(r - 1, 1); },
    getRange: rng,
  };
}

const CAB = ['id', 'data', 'apontador_diurno', 'apontador_noturno', 'encarregado',
  'clima_manha', 'clima_tarde', 'clima_noite', 'visitas', 'ocorrencias', 'observacoes_gerais',
  'tem_turno_noturno', 'efetivo_json', 'equipamentos_json', 'usuario', 'obra', 'numero_rdo',
  'paralisacoes_json', 'paralisado_motivo'];
const CAB_ASSIN = ['id', 'obra', 'data', 'papel', 'rotulo', 'nome', 'email', 'token', 'status',
  'convidadoEm', 'assinadoEm', 'assinatura', 'nomeAssinante', 'documento', 'agente', 'observacao', 'origem'];

let ABAS, PROPS;
const AUDITORIA = [];
function planilhaNova(linhas, assinaturas) {
  ABAS = { RDO_Diario: Aba(CAB, linhas || []), RDO_Assinaturas: Aba(CAB_ASSIN, assinaturas || []) };
  PROPS = { RDO_ASSINADO_LOG: JSON.stringify({ 'teotonio|2026-09-22': '2026-09-23 10:00' }) };
  AUDITORIA.length = 0;
}

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: n => ABAS[n] || null,
    insertSheet: n => (ABAS[n] = Aba([], []))
  }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: (d) => new Date(d).toISOString().slice(0, 10), sleep() {},
               getUuid: () => 'u' + Math.random(), DigestAlgorithm: {}, computeDigest: () => { throw new Error('x'); } },
  Session: { getScriptTimeZone: () => 'UTC', getEffectiveUser: () => ({ getEmail: () => 'x' }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k, v) => { PROPS[k] = String(v); },
    deleteProperty: k => { delete PROPS[k]; }, getProperties: () => ({ ...PROPS }) }) },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  DriveApp: {}, UrlFetchApp: {}, MailApp: {}, ScriptApp: {}, XmlService: {}
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });
ctx.registrarAuditoria = function () { AUDITORIA.push([].slice.call(arguments)); };
// quem está logado: o token é o perfil, para o teste escolher
ctx.sessaoDoToken = tok => tok ? { usuario: 'u-' + tok, perfil: tok } : null;
ctx.perfilDoToken = tok => tok || '';
ctx.usuarioDoToken = tok => tok ? 'u-' + tok : '';
ctx.sessaoPodeNaObra = () => true;
ctx.mapaChuvaAposGravar_ = () => {};

const cab = () => ABAS.RDO_Diario.dados[0];
const col = n => cab().indexOf(n);
const linhasDe = (data) => ABAS.RDO_Diario.dados.slice(1).filter(l => String(l[col('data')]).slice(0, 10) === data);
const v = (l, c) => l[col(c)];
const DIA = '2026-09-22';

// O que o salvarDiarioV4 de agora manda ao salvar UM turno: o outro em branco.
function turno(t, o) {
  const base = { action: 'updateRDODiario', obra: 'teotonio', data: DIA, encarregado: '' };
  if (t === 'diurno') {
    Object.assign(base, { apontador_diurno: 'Wallace', apontador_noturno: '', clima_manha: 'Bom', clima_tarde: 'Bom',
      visitas_diurno: '', ocorrencias_diurno: '', obs_diurno: '',
      efetivo_json: JSON.stringify({ padrao_diurno: { Servente: 8 }, customIndireto_diurno: [], customDireto_diurno: [] }),
      equipamentos_json: JSON.stringify({ padrao_diurno: {}, custom_diurno: [] }),
      paralisacoes_json: JSON.stringify({ diurno: [] }) });
  } else {
    Object.assign(base, { apontador_diurno: '', apontador_noturno: 'Guilherme', clima_noite: 'Bom', tem_turno_noturno: 'true',
      visitas_noturno: '', ocorrencias_noturno: '', obs_noturno: '',
      efetivo_json: JSON.stringify({ padrao_noturno: { Servente: 5 }, customIndireto_noturno: [], customDireto_noturno: [] }),
      equipamentos_json: JSON.stringify({ padrao_noturno: {}, custom_noturno: [] }),
      paralisacoes_json: JSON.stringify({ noturno: [] }) });
  }
  return Object.assign(base, o || {});
}

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };

console.log('\nUM TURNO NÃO DESFAZ O OUTRO\n');

t('a correção do noturno feita noutro aparelho sobrevive ao salvar do diurno', () => {
  planilhaNova();
  ctx.upsertRDODiario(turno('diurno', { action: 'addRDODiario', ocorrencias_diurno: 'caminhão atrasou' }), false);
  ctx.upsertRDODiario(turno('noturno', { ocorrencias_noturno: 'vala aberta', clima_noite: 'Chuva' }), true);
  // o Guilherme corrige o noturno de outro aparelho
  ctx.upsertRDODiario(turno('noturno', { ocorrencias_noturno: 'vala fechada às 23h', clima_noite: 'Chuva',
    efetivo_json: JSON.stringify({ padrao_noturno: { Servente: 6 } }) }), true);
  // o Wallace, que viu o noturno ANTES da correção, ajusta o diurno: manda o noturno em branco
  ctx.upsertRDODiario(turno('diurno', { ocorrencias_diurno: 'caminhão atrasou 2h' }), true);
  const l = linhasDe(DIA);
  assert.strictEqual(l.length, 1);
  const r = l[0];
  assert.strictEqual(v(r, 'ocorrencias_noturno'), 'vala fechada às 23h');
  assert.strictEqual(JSON.parse(v(r, 'efetivo_json')).padrao_noturno.Servente, 6, 'o efetivo corrigido do noturno voltou ao velho');
  assert.strictEqual(v(r, 'clima_noite'), 'Chuva');
  assert.strictEqual(JSON.parse(v(r, 'efetivo_json')).padrao_diurno.Servente, 8);
});

t('o texto corrigido TROCA o texto — não fica somado ao errado', () => {
  const r = linhasDe(DIA)[0];
  assert.strictEqual(v(r, 'ocorrencias'), 'caminhão atrasou 2h / vala fechada às 23h', v(r, 'ocorrencias'));
  assert.ok(!/vala aberta/.test(v(r, 'ocorrencias')));
});

t('apagar o texto de um turno apaga do RDO', () => {
  ctx.upsertRDODiario(turno('diurno', { ocorrencias_diurno: '' }), true);
  assert.strictEqual(v(linhasDe(DIA)[0], 'ocorrencias'), 'vala fechada às 23h');
});

t('o resumo das paradas sai dos dois turnos, não do que um aparelho mandou', () => {
  ctx.upsertRDODiario(turno('noturno', { ocorrencias_noturno: 'vala fechada às 23h',
    paralisacoes_json: JSON.stringify({ noturno: [{ motivo: 'Chuva' }] }), paralisado_motivo: 'Chuva' }), true);
  ctx.upsertRDODiario(turno('diurno', { paralisacoes_json: JSON.stringify({ diurno: [{ motivo: 'Falta de material' }] }),
    paralisado_motivo: 'Falta de material' }), true);
  assert.strictEqual(v(linhasDe(DIA)[0], 'paralisado_motivo'), 'Falta de material / Chuva');
});

t('linha de antes das colunas por turno não perde o texto', () => {
  planilhaNova([['D0100', DIA, 'Wallace', 'Guilherme', '', 'Bom', 'Bom', 'Bom',
    '', 'chuva à tarde / vala aberta', '', 'true', '{}', '{}', 'w', 'teotonio', 100, '{}', '']]);
  ctx.upsertRDODiario(turno('noturno', { ocorrencias_noturno: 'poste caiu' }), true);
  const r = linhasDe(DIA)[0];
  assert.ok(/chuva à tarde/.test(v(r, 'ocorrencias')) && /poste caiu/.test(v(r, 'ocorrencias')), v(r, 'ocorrencias'));
});

t('o app velho (só o texto junto) continua funcionando: a linha volta a ser de texto junto', () => {
  planilhaNova();
  ctx.upsertRDODiario(turno('diurno', { action: 'addRDODiario', ocorrencias_diurno: 'A' }), false);
  const velho = turno('diurno', { ocorrencias: 'A corrigido' });
  delete velho.visitas_diurno; delete velho.ocorrencias_diurno; delete velho.obs_diurno;
  ctx.upsertRDODiario(velho, true);
  const r = linhasDe(DIA)[0];
  assert.strictEqual(v(r, 'ocorrencias'), 'A corrigido');
  assert.strictEqual(v(r, 'ocorrencias_diurno'), '', 'a coluna por turno ficou com o texto velho');
});

t('a gravação devolve a linha como ficou, com revisão nova a cada vez', () => {
  planilhaNova();
  const a = ctx.upsertRDODiario(turno('diurno', { action: 'addRDODiario' }), false);
  const b = ctx.upsertRDODiario(turno('diurno'), true);
  assert.ok(a.linha && a.linha.revisao && b.linha && b.linha.revisao, JSON.stringify(b));
  assert.notStrictEqual(a.linha.revisao, b.linha.revisao);
  assert.ok(String(b.linha.numero_rdo), 'sem o número do RDO na linha devolvida');
  assert.strictEqual(v(linhasDe(DIA)[0], 'revisao'), b.linha.revisao);
});

console.log('\nO RDO ASSINADO NÃO MUDA CALADO\n');

const assinaturas = (fiscal, eng) => [
  ['A1', 'teotonio', DIA, 'engenheiro', 'Eng', 'Paulo', 'p@x', 'tok-eng-0123456789abcdef', eng ? 'assinada' : 'pendente',
   '2026-09-23 08:00:00', eng ? '2026-09-23 09:00:00' : '', eng ? 'drive_id:E' : '', eng ? 'Paulo' : '', '', '', '', eng || ''],
  ['A2', 'teotonio', DIA, 'fiscalizacao', 'Fiscal', 'Rita', 'r@x', 'tok-fis-0123456789abcdef', fiscal ? 'assinada' : 'pendente',
   '2026-09-23 08:00:00', fiscal ? '2026-09-23 15:00:00' : '', fiscal ? 'drive_id:F' : '', fiscal ? 'Rita Fiscal' : '', '', '', '', fiscal ? 'link' : ''],
];
const diaGravado = () => [['D0100', DIA, 'Wallace', '', '', 'Bom', 'Bom', '', '', 'ok', '', 'false',
  JSON.stringify({ padrao_diurno: { Servente: 8 } }), '{}', 'w', 'teotonio', 100, '{}', '']];

t('com a firma do fiscal dada, gravar por cima é recusado', () => {
  planilhaNova(diaGravado(), assinaturas(true, 'arquivada'));
  const r = ctx.upsertRDODiario(turno('diurno', { ocorrencias_diurno: 'mudou', token: 'apontador' }), true);
  assert.strictEqual(r.error, 'RDO_ASSINADO', JSON.stringify(r));
  assert.ok(/Rita Fiscal/.test(r.mensagem), r.mensagem);
  assert.strictEqual(v(linhasDe(DIA)[0], 'ocorrencias'), 'ok', 'gravou mesmo recusando');
});

t('só a firma ARQUIVADA do engenheiro não trava a edição', () => {
  planilhaNova(diaGravado(), assinaturas(false, 'arquivada'));
  const r = ctx.upsertRDODiario(turno('diurno', { ocorrencias_diurno: 'mudou', token: 'apontador' }), true);
  assert.ok(r.ok, JSON.stringify(r));
});

t('o apontador não reabre, mesmo pedindo', () => {
  planilhaNova(diaGravado(), assinaturas(true, 'arquivada'));
  PROPS.EXIGIR_TOKEN = 'true';
  const r = ctx.upsertRDODiario(turno('diurno', { ocorrencias_diurno: 'mudou', token: 'apontador', reabrir: '1' }), true);
  delete PROPS.EXIGIR_TOKEN;
  assert.strictEqual(r.error, 'SEM_PERMISSAO', JSON.stringify(r));
  assert.strictEqual(v(linhasDe(DIA)[0], 'ocorrencias'), 'ok');
});

t('o escritório reabre: grava, cancela a firma do fiscal com link novo e deixa rastro', () => {
  planilhaNova(diaGravado(), assinaturas(true, 'arquivada'));
  PROPS.EXIGIR_TOKEN = 'true';
  const r = ctx.upsertRDODiario(turno('diurno', { ocorrencias_diurno: 'mudou', token: 'engenharia', reabrir: '1' }), true);
  delete PROPS.EXIGIR_TOKEN;
  assert.ok(r.ok && r.reaberto === 1, JSON.stringify(r));
  assert.strictEqual(v(linhasDe(DIA)[0], 'ocorrencias'), 'mudou');
  const A = ABAS.RDO_Assinaturas.dados, c = n => A[0].indexOf(n);
  const fiscal = A.find(l => l[c('papel')] === 'fiscalizacao');
  assert.strictEqual(fiscal[c('status')], 'pendente');
  assert.strictEqual(fiscal[c('assinatura')], '');
  assert.notStrictEqual(fiscal[c('token')], 'tok-fis-0123456789abcdef', 'o link velho continua valendo');
  assert.ok(/Reaberto/.test(fiscal[c('observacao')]) && /Rita Fiscal/.test(fiscal[c('observacao')]), fiscal[c('observacao')]);
  const eng = A.find(l => l[c('papel')] === 'engenheiro');
  assert.strictEqual(eng[c('status')], 'assinada', 'a firma arquivada do engenheiro foi cancelada');
  assert.ok(AUDITORIA.some(a => a[2] === 'reabrirRDOAssinado'), 'sem rastro na Auditoria');
  assert.ok(!JSON.parse(PROPS.RDO_ASSINADO_LOG)['teotonio|2026-09-22'], 'o "RDO ASSINADO" do dia não foi esquecido');
});

t('outra obra não tem assinatura online: nada trava', () => {
  planilhaNova([['D0200', DIA, 'Wallace', '', '', 'Bom', 'Bom', '', '', 'ok', '', 'false', '{}', '{}', 'w', 'ranario', 1, '{}', '']],
               assinaturas(true, 'arquivada'));
  const r = ctx.upsertRDODiario(turno('diurno', { obra: 'ranario', ocorrencias_diurno: 'mudou' }), true);
  assert.ok(r.ok, JSON.stringify(r));
});

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
