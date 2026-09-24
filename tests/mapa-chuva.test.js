// MAPA DE CHUVA — a regra, dos dois lados, e a aba Mapa_Chuva.
//
// O mapa é o gráfico circular do mês (um dia por fatia; Manhã, Tarde e Noite
// em anéis), cada casa em seco/chuva × produtivo/improdutivo. Quem alimenta
// são os APONTADORES, pelo RDO — o clima de cada período e as paralisações —,
// não a estação do INMET.
//
// A regra está escrita duas vezes: js/rdo/mapa-chuva.js (o app desenha) e
// Code.gs (a aba da planilha). Este teste é a trava de que continuam iguais.
//
// Como rodar:  node tests/mapa-chuva.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { criar } = require('./servidor-falso.js');

const raiz = path.join(__dirname, '..');
const codeGs = fs.readFileSync(path.join(raiz, 'Code.gs'), 'utf8');
const appJs = fs.readFileSync(path.join(raiz, 'js/rdo/mapa-chuva.js'), 'utf8');

// O corpo da função, sem a indentação (no app ela mora dentro de uma IIFE).
function corpo(src) {
  const i = src.indexOf('function mapaChuvaClassificar(dia) {');
  assert.ok(i !== -1, 'mapaChuvaClassificar não encontrada');
  let n = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') n++;
    else if (src[j] === '}' && --n === 0) break;
  }
  return src.slice(i, j + 1).split('\n').map(l => l.trim()).join('\n');
}

// O classificador do app, isolado (o resto do módulo pede o DOM).
const ctxApp = { window: {} };
vm.createContext(ctxApp);
vm.runInContext(corpo(appJs) + '\nwindow.f = mapaChuvaClassificar;', ctxApp);
const doApp = ctxApp.window.f;
const S = criar();
const doServidor = S.ctx.mapaChuvaClassificar;

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };

console.log('\nMAPA DE CHUVA\n');

t('a regra é o MESMO texto no app e no Code.gs', () => {
  assert.strictEqual(corpo(appJs), corpo(codeGs));
});

const dia = (o) => Object.assign({ diurno: true, noturno: false,
  clima: { manha: 'Bom', tarde: 'Bom', noite: 'Bom' }, paralisacoes: { diurno: [], noturno: [] } }, o);
const casos = [
  ['dia seco, sem parada', dia(), { manha: 'seco_produtivo', tarde: 'seco_produtivo', noite: '' }],
  ['choveu à tarde e trabalhou', dia({ clima: { manha: 'Bom', tarde: 'Chuva', noite: 'Bom' } }),
    { manha: 'seco_produtivo', tarde: 'chuva_produtivo', noite: '' }],
  ['parou por chuva das 14h às 16h', dia({ clima: { manha: 'Bom', tarde: 'Chuva forte' },
    paralisacoes: { diurno: [{ motivo: 'Chuva', inicio: '14:00', fim: '16:00' }], noturno: [] } }),
    { manha: 'seco_produtivo', tarde: 'chuva_improdutivo', noite: '' }],
  ['pista impraticável de manhã com o período marcado seco: a causa é a chuva', dia({
    paralisacoes: { diurno: [{ motivo: 'Pista impraticável após chuva', inicio: '07:00', fim: '10:00' }], noturno: [] } }),
    { manha: 'chuva_improdutivo', tarde: 'seco_produtivo', noite: '' }],
  ['concessionária parou o dia (sem horário = turno inteiro)', dia({
    paralisacoes: { diurno: [{ motivo: 'Interferência de concessionária' }], noturno: [] } }),
    { manha: 'seco_improdutivo', tarde: 'seco_improdutivo', noite: '' }],
  ['parada das 11h às 13h toca manhã e tarde', dia({
    paralisacoes: { diurno: [{ motivo: 'Determinação da fiscalização', inicio: '11:00', fim: '13:00' }], noturno: [] } }),
    { manha: 'seco_improdutivo', tarde: 'seco_improdutivo', noite: '' }],
  ['noturno: parada de madrugada atravessa a meia-noite', dia({ noturno: true, clima: { manha: 'Bom', tarde: 'Bom', noite: 'Garoa' },
    paralisacoes: { diurno: [], noturno: [{ motivo: 'Chuva', inicio: '23:00', fim: '02:00' }] } }),
    { manha: 'seco_produtivo', tarde: 'seco_produtivo', noite: 'chuva_improdutivo' }],
  ['noturno: parada 01h–03h', dia({ noturno: true,
    paralisacoes: { diurno: [], noturno: [{ motivo: 'Outro', obs: 'x', inicio: '01:00', fim: '03:00' }] } }),
    { manha: 'seco_produtivo', tarde: 'seco_produtivo', noite: 'seco_improdutivo' }],
  ['paralisação sem motivo (linha em branco) não conta', dia({
    paralisacoes: { diurno: [{ motivo: '', inicio: '08:00', fim: '09:00' }], noturno: [] } }),
    { manha: 'seco_produtivo', tarde: 'seco_produtivo', noite: '' }],
  ['sem RDO: tudo em branco', { diurno: false, noturno: false }, { manha: '', tarde: '', noite: '' }],
];
casos.forEach(([nome, entrada, esperado]) => {
  t(nome, () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(doApp(entrada))), esperado, 'app');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(doServidor(entrada))), esperado, 'servidor');
  });
});

t('refazerMapaChuva reconstrói a aba inteira, com os dias repetidos unidos', () => {
  const CAB = ['id', 'data', 'apontador_diurno', 'apontador_noturno', 'clima_manha', 'clima_tarde', 'clima_noite',
    'tem_turno_noturno', 'obra', 'paralisacoes_json'];
  S.aba('RDO_Diario', [CAB,
    ['D1', '2026-09-02', 'Wallace', '', 'Chuva', 'Bom', 'Bom', 'false', 'ruas-de-terra',
      JSON.stringify({ diurno: [{ motivo: 'Chuva', inicio: '08:00', fim: '10:00' }], noturno: [] })],
    ['D2', '2026-09-01', 'Wallace', '', 'Bom', 'Bom', 'Bom', 'false', 'ruas-de-terra', ''],
    ['D3', '2026-09-01', '', 'Guilherme', 'Bom', 'Bom', 'Garoa', 'true', 'ruas-de-terra', ''],
    ['D4', '2026-09-01', 'Ana', '', 'Garoa', 'Bom', 'Bom', 'false', 'ranario', ''],
  ]);
  S.aba('Mapa_Chuva', [['lixo velho']]);
  const r = S.ctx.refazerMapaChuva();
  assert.ok(r.ok && r.dias === 3, JSON.stringify(r));
  const m = S.abas.Mapa_Chuva.dados;
  const c = n => m[0].indexOf(n);
  assert.strictEqual(m[0][0], 'obra', 'o cabeçalho não foi reposto');
  const achar = (obra, data) => m.slice(1).find(l => l[c('obra')] === obra && l[c('data')] === data);
  const d1 = achar('ruas-de-terra', '2026-09-01');
  assert.strictEqual(d1[c('manha')], 'Seco produtivo');
  assert.strictEqual(d1[c('noite')], 'Chuva produtivo', 'o noturno da 2ª linha do dia não entrou');
  assert.strictEqual(d1[c('apontadores')], 'Wallace / Guilherme');
  assert.strictEqual(achar('ruas-de-terra', '2026-09-02')[c('manha')], 'Chuva improdutivo');
  assert.strictEqual(achar('ranario', '2026-09-01')[c('manha')], 'Chuva produtivo');
});

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
