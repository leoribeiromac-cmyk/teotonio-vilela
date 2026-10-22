// O AJUSTE DE AVANÇO NÃO ENTRA NA CONTA DE SERVIÇOS DO E-MAIL DO RDO.
//
// O e-mail que leva o RDO para a fiscalização diz quantos serviços o dia
// teve (`rdoServicosDoDia_`). A linha de Turno "Ajuste" é a correção de
// avanço do escritório — não sai no PDF anexado, então o número do e-mail
// também não pode contá-la, senão o texto promete serviço que o papel não
// mostra. Ver `ehAjusteDeAvanco` no index.html.
//
// Roda sem dependência externa:  node tests/ajuste-de-avanco-servidor.test.js
const vm = require('vm');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const CAB = ['ID', 'Data', 'Turno', 'Pacote_ID', 'Quantidade', 'obra'];
let LINHAS = [];
const aba = { getDataRange: () => ({ getValues: () => [CAB].concat(LINHAS) }) };

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp, Error,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => (n === 'RDO_Avanco' ? aba : null) }) },
  Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
  Utilities: { formatDate: d => new Date(d).toISOString().slice(0, 10) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  Logger: { log: () => {} },
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

console.log('CONTAGEM DE SERVIÇOS DO E-MAIL');

LINHAS = [
  ['r1', '2026-10-22', 'Diurno',  'P01', 10, 'teotonio'],
  ['r2', '2026-10-22', 'Noturno', 'P02', 5,  'teotonio'],
  ['a1', '2026-10-22', 'Ajuste',  'P03', 113, 'teotonio'],
  ['a2', '2026-10-22', ' ajuste ', 'P06', 7, 'teotonio'],
  ['r3', '2026-10-21', 'Diurno',  'P01', 3,  'teotonio'],
];
ok('conta os dois turnos e deixa os ajustes de fora',
   ctx.rdoServicosDoDia_('teotonio', '2026-10-22') === 2, ctx.rdoServicosDoDia_('teotonio', '2026-10-22'));

LINHAS = [['a1', '2026-10-22', 'Ajuste', 'P03', 113, 'teotonio']];
ok('dia só com ajuste conta zero serviço', ctx.rdoServicosDoDia_('teotonio', '2026-10-22') === 0);

console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
