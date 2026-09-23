// O DIA DO RDO DIÁRIO É UMA LINHA SÓ — o servidor, com uma planilha falsa.
//
// O defeito que isto trava: `upsertRDODiario` procurava a linha do dia por
// (obra, data, turno) com `idxColuna(cab, 'turno')`. A aba de verdade NÃO tem
// coluna `turno`, e o idxColuna aproximado caía em `apontador_noturno` — a
// chave virava "linha cujo noturno está vazio". Salvo o noturno, o próximo
// salvamento do dia criava outra linha. O Histórico acendia duplicata todo
// dia, a lista dos 14 dias lia uma linha e o cartão do turno lia outra.
//
// O cabeçalho aqui é o da planilha real (sem `turno`), de propósito: o
// multiobra.test.js tem uma coluna `turno` exata e por isso nunca viu o bug.
//
// Como rodar:  node tests/rdo-diario-duplicado-servidor.test.js
const vm = require('vm');
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

function Aba(cab, linhas) {
  const dados = [cab.slice(), ...linhas.map(l => l.slice())];
  return {
    dados,
    getLastColumn: () => dados[0].length,
    getLastRow: () => dados.length,
    getDataRange: () => ({ getValues: () => dados.map(l => l.slice()) }),
    appendRow(l) { dados.push(l.slice()); },
    deleteRow(r) { dados.splice(r - 1, 1); },
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

// O cabeçalho da aba RDO_Diario de produção: nenhuma coluna se chama `turno`,
// mas três CONTÊM a palavra (apontador_noturno, tem_turno_noturno…).
const CAB = ['id', 'data', 'apontador_diurno', 'apontador_noturno', 'encarregado',
  'clima_manha', 'clima_tarde', 'clima_noite', 'visitas', 'ocorrencias', 'observacoes_gerais',
  'tem_turno_noturno', 'efetivo_json', 'equipamentos_json', 'usuario', 'obra', 'numero_rdo',
  'paralisacoes_json', 'paralisado_motivo'];

let ABAS;
const AUDITORIA = [];
function planilhaNova(linhas) {
  ABAS = { RDO_Diario: Aba(CAB, linhas || []) };
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
               getUuid: () => 'u', DigestAlgorithm: {}, computeDigest: () => [] },
  Session: { getScriptTimeZone: () => 'UTC' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {}, getProperties: () => ({}) }) },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  DriveApp: {}, UrlFetchApp: {}, MailApp: {}, ScriptApp: {}, XmlService: {}
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });
// A Auditoria não interessa aqui, a não ser para conferir que a linha
// apagada foi para lá inteira.
ctx.registrarAuditoria = function () { AUDITORIA.push([].slice.call(arguments)); };

const col = n => CAB.indexOf(n);
const linhasDe = (data) => ABAS.RDO_Diario.dados.slice(1).filter(l => String(l[col('data')]).slice(0, 10) === data);
const efetivo = (d, n) => JSON.stringify({
  padrao_diurno: d || {}, padrao_noturno: n || {},
  customIndireto_diurno: [], customDireto_diurno: [], customIndireto_noturno: [], customDireto_noturno: []
});

// O que o salvarDiarioV4 manda: os DOIS turnos, do jeito que o aparelho os vê.
function envio(o) {
  return Object.assign({
    action: 'updateRDODiario', obra: 'teotonio', data: '2026-09-22',
    apontador_diurno: '', apontador_noturno: '', encarregado: '',
    clima_manha: 'Bom', clima_tarde: 'Bom', clima_noite: 'Bom',
    visitas: '', ocorrencias: '', observacoes_gerais: '',
    tem_turno_noturno: 'false', efetivo_json: efetivo(), equipamentos_json: '{}',
    paralisacoes_json: '{"diurno":[],"noturno":[]}', paralisado_motivo: ''
  }, o);
}

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };

console.log('\nO DIA DO RDO DIÁRIO É UMA LINHA SÓ\n');

t('o dia inteiro — diurno, noturno e um ajuste depois — fica numa linha', () => {
  planilhaNova();
  ctx.upsertRDODiario(envio({ action: 'addRDODiario', apontador_diurno: 'Wallace',
    efetivo_json: efetivo({ Servente: 8 }) }), false);
  ctx.upsertRDODiario(envio({ apontador_diurno: 'Wallace', apontador_noturno: 'Guilherme',
    tem_turno_noturno: 'true', efetivo_json: efetivo({ Servente: 8 }, { Servente: 5 }) }), true);
  // O ajuste que antes criava a 2ª linha: a linha agora tem noturno.
  ctx.upsertRDODiario(envio({ apontador_diurno: 'Wallace', apontador_noturno: 'Guilherme',
    tem_turno_noturno: 'true', ocorrencias: 'chuva às 15h',
    efetivo_json: efetivo({ Servente: 9 }, { Servente: 5 }) }), true);
  const l = linhasDe('2026-09-22');
  assert.strictEqual(l.length, 1, l.length + ' linhas para o mesmo dia');
  assert.strictEqual(l[0][col('apontador_noturno')], 'Guilherme');
  assert.strictEqual(l[0][col('ocorrencias')], 'chuva às 15h');
  assert.strictEqual(JSON.parse(l[0][col('efetivo_json')]).padrao_diurno.Servente, 9);
});

t('o diurno salvo de um aparelho que não viu o noturno NÃO apaga o noturno', () => {
  planilhaNova([['D0100', '2026-09-22', 'Wallace', 'Guilherme', '', 'Bom', 'Bom', 'Chuvoso',
    '', 'vala aberta (noturno)', '', 'true', efetivo({ Servente: 8 }, { Servente: 5 }),
    JSON.stringify({ padrao_diurno: { Retro: 1 }, padrao_noturno: { Rolo: 1 }, custom_diurno: [], custom_noturno: [] }),
    'guilherme', 'teotonio', 100, JSON.stringify({ diurno: [], noturno: [{ motivo: 'Chuva' }] }), 'Chuva']]);
  // Celular do Wallace, aberto desde cedo: o noturno está em branco nele.
  ctx.upsertRDODiario(envio({ apontador_diurno: 'Wallace', clima_noite: 'Bom',
    ocorrencias: 'caminhão atrasou', efetivo_json: efetivo({ Servente: 10 }),
    equipamentos_json: JSON.stringify({ padrao_diurno: { Retro: 2 }, padrao_noturno: {}, custom_diurno: [], custom_noturno: [] }) }), true);
  const l = linhasDe('2026-09-22');
  assert.strictEqual(l.length, 1);
  const r = l[0];
  assert.strictEqual(r[col('apontador_noturno')], 'Guilherme', 'o noturno sumiu');
  assert.strictEqual(r[col('tem_turno_noturno')], 'true');
  assert.strictEqual(r[col('clima_noite')], 'Chuvoso', 'o clima da noite foi trocado por quem não estava lá');
  const ef = JSON.parse(r[col('efetivo_json')]);
  assert.strictEqual(ef.padrao_diurno.Servente, 10, 'o diurno novo não entrou');
  assert.strictEqual(ef.padrao_noturno.Servente, 5, 'o efetivo do noturno foi apagado');
  assert.strictEqual(JSON.parse(r[col('equipamentos_json')]).padrao_noturno.Rolo, 1);
  assert.strictEqual(JSON.parse(r[col('paralisacoes_json')]).noturno.length, 1, 'a paralisação do noturno sumiu');
  assert.ok(/vala aberta/.test(r[col('ocorrencias')]) && /caminhão atrasou/.test(r[col('ocorrencias')]),
    'ocorrências: ' + r[col('ocorrencias')]);
  assert.strictEqual(r[col('numero_rdo')], 100, 'o número do RDO mudou');
});

t('salvar um dia que JÁ está repetido une as linhas (e cada turno fica com a versão mais nova)', () => {
  // Exatamente o 22/09 da tela: a 1ª linha com os dois turnos, a 2ª — criada
  // por um ajuste do diurno — só com o diurno.
  planilhaNova([
    ['D0100', '2026-09-22', 'Wallace', 'Guilherme', '', 'Bom', 'Bom', 'Bom', '', 'noite ok', '',
     'true', efetivo({ Servente: 8 }, { Servente: 5 }), '{}', 'guilherme', 'teotonio', 100, '', ''],
    ['D0101', '2026-09-22', 'Wallace', '', '', 'Nublado', 'Bom', 'Bom', '', 'dia ok', '',
     'false', efetivo({ Servente: 9 }), '{}', 'wallace', 'teotonio', 101, '', ''],
    ['D0102', '2026-09-23', 'Wallace', '', '', 'Bom', 'Bom', 'Bom', '', '', '',
     'false', efetivo({ Servente: 7 }), '{}', 'wallace', 'teotonio', 102, '', '']
  ]);
  const r = ctx.upsertRDODiario(envio({ apontador_diurno: 'Wallace', apontador_noturno: 'Guilherme',
    tem_turno_noturno: 'true', clima_manha: 'Nublado', ocorrencias: 'dia ok / noite ok',
    efetivo_json: efetivo({ Servente: 9 }, { Servente: 6 }) }), true);
  assert.ok(r.ok && r.unidas === 1, JSON.stringify(r));
  const l = linhasDe('2026-09-22');
  assert.strictEqual(l.length, 1, 'continua repetido');
  assert.strictEqual(l[0][col('id')], 'D0100', 'a identidade tem de ser a da linha mais antiga');
  assert.strictEqual(l[0][col('numero_rdo')], 100);
  assert.strictEqual(JSON.parse(l[0][col('efetivo_json')]).padrao_noturno.Servente, 6);
  assert.strictEqual(linhasDe('2026-09-23').length, 1, 'mexeu em outro dia');
  const apagada = AUDITORIA.find(a => a[2] === 'mesclarRDODiario');
  assert.ok(apagada && /D0101/.test(apagada[5]), 'a linha apagada não foi para a Auditoria inteira');
});

t('"Unificar" do Histórico: junta sem perder nenhum dos turnos', () => {
  planilhaNova([
    ['D0200', '2026-09-20', 'Wallace', '', '', 'Bom', 'Bom', 'Bom', 'fiscal 9h', '', '',
     'false', efetivo({ Servente: 8 }), '{}', 'wallace', 'teotonio', 200, '', ''],
    ['D0201', '2026-09-20', '', 'Guilherme', '', 'Bom', 'Bom', 'Chuvoso', '', 'poça na vala', '',
     'true', efetivo({}, { Servente: 5 }), '{}', 'guilherme', '', 201, '', '']   // linha antiga sem obra
  ]);
  const r = ctx.mesclarRDODiario({ obra: 'teotonio', data: '2026-09-20' });
  assert.ok(r.ok && r.unidas === 1, JSON.stringify(r));
  const l = linhasDe('2026-09-20');
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0][col('apontador_diurno')], 'Wallace');
  assert.strictEqual(l[0][col('apontador_noturno')], 'Guilherme');
  assert.strictEqual(l[0][col('tem_turno_noturno')], 'true');
  assert.strictEqual(l[0][col('clima_noite')], 'Chuvoso');
  assert.strictEqual(l[0][col('visitas')], 'fiscal 9h');
  assert.strictEqual(l[0][col('ocorrencias')], 'poça na vala');
  const ef = JSON.parse(l[0][col('efetivo_json')]);
  assert.strictEqual(ef.padrao_diurno.Servente, 8);
  assert.strictEqual(ef.padrao_noturno.Servente, 5);
  // rodar de novo não faz nada
  assert.strictEqual(ctx.mesclarRDODiario({ obra: 'teotonio', data: '2026-09-20' }).unidas, 0);
});

t('outra obra na mesma data não é unida à Teotônio', () => {
  planilhaNova([
    ['D0300', '2026-09-21', 'Wallace', '', '', '', '', '', '', '', '', 'false', '{}', '{}', '', 'teotonio', 1, '', ''],
    ['D0301', '2026-09-21', 'Ana', '', '', '', '', '', '', '', '', 'false', '{}', '{}', '', 'ranario', 1, '', '']
  ]);
  assert.strictEqual(ctx.mesclarRDODiario({ obra: 'teotonio', data: '2026-09-21' }).unidas, 0);
  ctx.upsertRDODiario(envio({ obra: 'ranario', data: '2026-09-21', apontador_diurno: 'Ana' }), true);
  assert.strictEqual(linhasDe('2026-09-21').length, 2);
});

t('a ferramenta do editor une todos os dias repetidos de uma vez', () => {
  planilhaNova([
    ['D1', '2026-09-01', 'A', '', '', '', '', '', '', '', '', '', '{}', '{}', '', 'teotonio', 1, '', ''],
    ['D2', '2026-09-01', '', 'B', '', '', '', '', '', '', '', '', '{}', '{}', '', 'teotonio', 2, '', ''],
    ['D3', '2026-09-02', 'A', '', '', '', '', '', '', '', '', '', '{}', '{}', '', 'teotonio', 3, '', ''],
    ['D4', '2026-09-01', 'A', 'B', '', '', '', '', '', '', '', '', '{}', '{}', '', 'teotonio', 4, '', ''],
    ['D5', '2026-09-02', 'A', 'C', '', '', '', '', '', '', '', '', '{}', '{}', '', 'teotonio', 5, '', '']
  ]);
  const r = ctx.mesclarTodosRDODiarioRepetidos();
  assert.strictEqual(r.dias, 2, JSON.stringify(r));
  assert.strictEqual(r.linhasUnidas, 3);
  assert.strictEqual(ABAS.RDO_Diario.dados.length - 1, 2);
  assert.deepStrictEqual(linhasDe('2026-09-02')[0].slice(0, 4), ['D3', '2026-09-02', 'A', 'C']);
});

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
