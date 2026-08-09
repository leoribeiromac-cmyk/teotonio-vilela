// AS COLUNAS DO RDO DIÁRIO — o parâmetro que some em silêncio.
//
// `upsertRDODiario` grava POR NOME DE COLUNA: ele varre o cabeçalho da aba e
// só escreve o parâmetro cujo nome casa com uma coluna existente. Parâmetro
// sem coluna correspondente é descartado — sem erro, sem aviso, sem nada.
//
// A aba RDO_Diario não está no HEADERS do Code.gs (ela nasceu à mão na
// planilha do Leonardo), então o único jeito de uma coluna NOVA passar a
// existir é uma chamada `garantirColuna` no próprio upsert.
//
// Isto já aconteceu de verdade: `paralisado_motivo` era digitado pelo
// apontador, subia na requisição e sumia na planilha, porque a coluna nunca
// era criada. Este teste é a trava para não acontecer de novo.
//
// Como rodar:  node tests/colunas-diario.test.js
const fs = require('fs');
const path = require('path');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(raiz, 'Code.gs'), 'utf8');

console.log('\nCOLUNAS DO RDO DIÁRIO');

// O corpo de upsertRDODiario, onde as garantias têm de estar.
const upsert = (gs.split('function upsertRDODiario')[1] || '').split('\nfunction ')[0];
ok('achou upsertRDODiario no Code.gs', upsert.length > 200, upsert.length + ' caracteres');

const garantidas = [...upsert.matchAll(/garantirColuna\(\s*aba\s*,\s*'([^']+)'/g)].map(m => m[1]);
ok('lê as colunas garantidas', garantidas.length >= 2, JSON.stringify(garantidas));

// Os parâmetros que o app manda em addRDODiario / updateRDODiario. O bloco
// `const params = { action: existe ? 'updateRDODiario' ... }` do salvarDiarioV4.
const bloco = (html.split("action: existe ? 'updateRDODiario'")[1] || '').split('};')[0];
ok('achou o payload do salvarDiarioV4', bloco.length > 100, bloco.length + ' caracteres');

const enviados = [...bloco.matchAll(/^\s{4}([a-z_][a-z0-9_]*)\s*:/gmi)].map(m => m[1]);
ok('lê os parâmetros enviados', enviados.length >= 8, JSON.stringify(enviados));

/* As colunas que JÁ EXISTEM na planilha desde antes deste app — não precisam
   de garantia, e exigi-la só criaria ruído. Toda coluna NOVA, que não esteja
   nesta lista, tem de ser garantida por código. */
const PREEXISTENTES = new Set([
  'obra', 'data', 'apontador_diurno', 'apontador_noturno', 'encarregado',
  'clima_manha', 'clima_tarde', 'clima_noite', 'visitas', 'ocorrencias',
  'observacoes_gerais', 'tem_turno_noturno', 'efetivo_json', 'equipamentos_json',
  'action', 'token', 'callback', 'usuario', 'id', 'turno',
]);

const semGarantia = enviados.filter(p => !PREEXISTENTES.has(p) && garantidas.indexOf(p) === -1);
ok('todo parâmetro novo tem garantirColuna no backend',
   semGarantia.length === 0,
   'sem coluna garantida: ' + JSON.stringify(semGarantia));

// As duas desta versão, nomeadas — para o teste falhar alto se alguém as tirar.
ok('paralisacoes_json é garantida', garantidas.indexOf('paralisacoes_json') > -1, JSON.stringify(garantidas));
ok('paralisado_motivo é garantida', garantidas.indexOf('paralisado_motivo') > -1, JSON.stringify(garantidas));
ok('e as duas são realmente enviadas pelo app',
   enviados.indexOf('paralisacoes_json') > -1 && enviados.indexOf('paralisado_motivo') > -1,
   JSON.stringify(enviados));

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
