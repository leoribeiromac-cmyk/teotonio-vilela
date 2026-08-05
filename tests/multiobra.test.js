// Testa a lógica multi-obra do Code.gs em Node, com uma planilha falsa.
// O que importa provar: (1) linha antiga sem obra continua sendo da Teotônio;
// (2) diário do Ranário NÃO sobrescreve o da Teotônio na mesma data e turno.
// (sem dependências externas: roda com `node tests/multiobra.test.js`)
const vm = require('vm');
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

// ---------- planilha falsa ----------
function Aba(cab, linhas) {
  const dados = [cab.slice(), ...linhas.map(l => l.slice())];
  return {
    dados,
    getLastColumn: () => dados[0].length,
    getLastRow: () => dados.length,
    getDataRange: () => ({ getValues: () => dados }),
    appendRow(l) { dados.push(l.slice()); },
    getRange(r, c, nr, nc) {
      return {
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
      };
    }
  };
}

const ABAS = {
  RDO_Avanco: Aba(['id', 'data', 'turno', 'pacote_id', 'quantidade', 'clientId', 'usuario'],
    [['a1', '2026-08-01', 'Diurno', 'P26', 10, 'c1', 'Wallace']]),   // linha ANTIGA, sem obra
  RDO_Diario: Aba(['id', 'data', 'turno', 'encarregado', 'observacoes_gerais'],
    [['d1', '2026-08-01', '', 'J. Santos', 'diario da teotonio']])   // linha ANTIGA, sem obra
};

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => ABAS[n] || null, insertSheet: n => (ABAS[n] = Aba([], [])) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, 10), sleep() {} },
  Session: { getScriptTimeZone: () => 'UTC' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  DriveApp: {}, UrlFetchApp: {}, CacheService: {}, MailApp: {}, ScriptApp: {}, XmlService: {}
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };

console.log('MULTI-OBRA NO BACKEND\n');

t('linha antiga, sem coluna obra, continua sendo da Teotônio', () => {
  assert.strictEqual(ctx.normObra(''), 'teotonio');
  assert.strictEqual(ctx.normObra(null), 'teotonio');
  assert.strictEqual(ctx.normObra('  '), 'teotonio');
  assert.strictEqual(ctx.normObra('ranario'), 'ranario');
});

t('migração cria a coluna e marca o histórico como teotonio', () => {
  ctx.migrarObraNasAbasDeRDO();
  const cab = ABAS.RDO_Avanco.dados[0].map(c => String(c).toLowerCase());
  assert.ok(cab.indexOf('obra') !== -1, 'coluna obra nao foi criada em RDO_Avanco');
  const i = cab.indexOf('obra');
  assert.strictEqual(ABAS.RDO_Avanco.dados[1][i], 'teotonio', 'linha antiga nao foi marcada');
  const cabD = ABAS.RDO_Diario.dados[0].map(c => String(c).toLowerCase());
  assert.strictEqual(ABAS.RDO_Diario.dados[1][cabD.indexOf('obra')], 'teotonio');
});

t('migração é idempotente (rodar duas vezes nao estraga)', () => {
  const antes = JSON.stringify(ABAS.RDO_Avanco.dados);
  ctx.migrarObraNasAbasDeRDO();
  assert.strictEqual(JSON.stringify(ABAS.RDO_Avanco.dados), antes);
});

t('lançamento do Ranário grava com a obra dele', () => {
  const r = ctx.addBatchRDO(JSON.stringify([
    { id: 'r1', obra: 'ranario', data: '2026-08-05', turno: 'Diurno', pacote_id: 'RAN-001', quantidade: 5 }
  ]), 'cli-ran', null);
  assert.ok(r.ok, 'gravacao falhou: ' + JSON.stringify(r));
  const cab = ABAS.RDO_Avanco.dados[0].map(c => String(c).toLowerCase());
  const ultima = ABAS.RDO_Avanco.dados[ABAS.RDO_Avanco.dados.length - 1];
  assert.strictEqual(ultima[cab.indexOf('obra')], 'ranario');
});

t('lançamento sem obra declarada cai na Teotônio', () => {
  const r = ctx.addBatchRDO(JSON.stringify([
    { id: 't9', data: '2026-08-05', turno: 'Diurno', pacote_id: 'P26', quantidade: 3 }
  ]), 'cli-teo', null);
  assert.ok(r.ok);
  const cab = ABAS.RDO_Avanco.dados[0].map(c => String(c).toLowerCase());
  const ultima = ABAS.RDO_Avanco.dados[ABAS.RDO_Avanco.dados.length - 1];
  assert.strictEqual(ultima[cab.indexOf('obra')], 'teotonio');
});

t('DIÁRIO do Ranário NÃO sobrescreve o da Teotônio na mesma data', () => {
  const antes = ABAS.RDO_Diario.dados.length;
  const r = ctx.upsertRDODiario({ obra: 'ranario', data: '2026-08-01', encarregado: 'A. Costa',
    observacoes_gerais: 'diario do ranario' }, false);
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(ABAS.RDO_Diario.dados.length, antes + 1, 'deveria ter criado linha NOVA');
  const cab = ABAS.RDO_Diario.dados[0].map(c => String(c).toLowerCase());
  const iObs = cab.indexOf('observacoes_gerais');
  assert.strictEqual(ABAS.RDO_Diario.dados[1][iObs], 'diario da teotonio', 'o diario da Teotonio foi alterado!');
  assert.strictEqual(ABAS.RDO_Diario.dados[antes][cab.indexOf('obra')], 'ranario');
});

t('reenviar o diário da MESMA obra atualiza, não duplica', () => {
  const antes = ABAS.RDO_Diario.dados.length;
  ctx.upsertRDODiario({ obra: 'ranario', data: '2026-08-01', observacoes_gerais: 'corrigido' }, true);
  assert.strictEqual(ABAS.RDO_Diario.dados.length, antes, 'duplicou o diario');
  const cab = ABAS.RDO_Diario.dados[0].map(c => String(c).toLowerCase());
  assert.strictEqual(ABAS.RDO_Diario.dados[antes - 1][cab.indexOf('observacoes_gerais')], 'corrigido');
});

t('producaoPorPacote separa as obras', () => {
  const teo = ctx.producaoPorPacote('2026-08', 'teotonio');
  const ran = ctx.producaoPorPacote('2026-08', 'ranario');
  assert.ok(teo.pacotes['P26'], 'Teotonio deveria ter P26');
  assert.ok(!teo.pacotes['RAN-001'], 'pacote do Ranario vazou para a Teotonio');
  assert.ok(ran.pacotes['RAN-001'], 'Ranario deveria ter RAN-001');
  assert.ok(!ran.pacotes['P26'], 'pacote da Teotonio vazou para o Ranario');
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
