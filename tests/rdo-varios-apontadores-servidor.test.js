// DOIS APONTADORES NO MESMO TURNO — as partes SOMAM (o servidor, planilha falsa).
//
// Nas Ruas de Terra são duas frentes, cada uma com o seu apontador, no mesmo
// diurno. Com o dia numa linha só, o segundo a enviar trocava o efetivo, os
// equipamentos e as ocorrências do primeiro pelos dele. Agora cada um manda a
// SUA parte (`contribuicao`), e as colunas do dia são a soma.
//
// Como rodar:  node tests/rdo-varios-apontadores-servidor.test.js
const assert = require('assert');
const { criar } = require('./servidor-falso.js');

const CAB = ['id', 'data', 'apontador_diurno', 'apontador_noturno', 'encarregado',
  'clima_manha', 'clima_tarde', 'clima_noite', 'visitas', 'ocorrencias', 'observacoes_gerais',
  'tem_turno_noturno', 'efetivo_json', 'equipamentos_json', 'usuario', 'obra', 'numero_rdo',
  'paralisacoes_json', 'paralisado_motivo'];
const DIA = '2026-09-22';

let S;
function nova(linhas) {
  S = criar();
  S.aba('RDO_Diario', [CAB].concat(linhas || []));
}
const tabela = () => S.abas.RDO_Diario.dados;
const col = n => tabela()[0].indexOf(n);
const linhasDe = d => tabela().slice(1).filter(l => String(l[col('data')]).slice(0, 10) === d);
const J = (l, c) => JSON.parse(l[col(c)] || '{}');

function parte(o) {
  return Object.assign({ turno: 'diurno', apontador: 'Wallace', clima: { clima_manha: 'Bom', clima_tarde: 'Bom' },
    efetivo: { padrao: {}, customIndireto: [], customDireto: [] },
    equipamentos: { padrao: {}, custom: [] }, paralisacoes: [], visitas: '', ocorrencias: '', observacoes: '' }, o);
}
function enviar(p, extra) {
  return S.ctx.upsertRDODiario(Object.assign({ action: 'updateRDODiario', obra: 'ruas-de-terra', data: DIA,
    contribuicao: JSON.stringify(p), token: 'tok-' + p.apontador.toLowerCase().split(' ')[0] }, extra || {}), true);
}

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };

console.log('\nDOIS APONTADORES NO MESMO TURNO — AS PARTES SOMAM\n');

t('duas frentes no mesmo diurno: efetivo, equipamentos e ocorrências somados numa linha', () => {
  nova();
  const r1 = enviar(parte({ apontador: 'Wallace', efetivo: { padrao: { servente: '8', pedreiro: '2' },
    customIndireto: [{ label: 'Topógrafo', qtd: '1' }], customDireto: [] },
    equipamentos: { padrao: { retro: '1' }, custom: [] }, ocorrencias: 'Agrimensor: base E2 a E5' }));
  assert.ok(r1.ok && r1.inserted, JSON.stringify(r1));
  assert.strictEqual(r1.chave, 'wallace');
  const r2 = enviar(parte({ apontador: 'Pedro', clima: { clima_manha: 'Bom', clima_tarde: 'Chuva' },
    efetivo: { padrao: { servente: '5' }, customIndireto: [{ label: 'topógrafo', qtd: '1' }], customDireto: [] },
    equipamentos: { padrao: { retro: '1', rolo: '1' }, custom: [] }, ocorrencias: 'Astrogildo: guia LD' }));
  assert.ok(r2.ok && r2.updated, JSON.stringify(r2));
  const l = linhasDe(DIA);
  assert.strictEqual(l.length, 1, 'o dia virou ' + l.length + ' linhas');
  const r = l[0];
  assert.strictEqual(r[col('apontador_diurno')], 'Wallace / Pedro');
  const ef = J(r, 'efetivo_json');
  assert.strictEqual(ef.padrao_diurno.servente, '13', 'servente: ' + ef.padrao_diurno.servente);
  assert.strictEqual(ef.padrao_diurno.pedreiro, '2');
  assert.deepStrictEqual(ef.customIndireto_diurno, [{ label: 'Topógrafo', qtd: '2' }]);
  const eq = J(r, 'equipamentos_json');
  assert.strictEqual(eq.padrao_diurno.retro, '2');
  assert.strictEqual(eq.padrao_diurno.rolo, '1');
  assert.ok(/Agrimensor/.test(r[col('ocorrencias')]) && /Astrogildo/.test(r[col('ocorrencias')]), r[col('ocorrencias')]);
  // Choveu numa rua, choveu na obra: vale o pior clima do período.
  assert.strictEqual(r[col('clima_tarde')], 'Chuva');
  assert.ok(r2.linha && r2.linha.apontador_diurno === 'Wallace / Pedro', 'a resposta não trouxe a linha somada');
});

t('o mesmo apontador reenviando TROCA a parte dele, não soma de novo', () => {
  nova();
  enviar(parte({ apontador: 'Wallace', efetivo: { padrao: { servente: '8' } } }));
  enviar(parte({ apontador: 'Pedro', efetivo: { padrao: { servente: '5' } } }));
  enviar(parte({ apontador: 'wállace ', efetivo: { padrao: { servente: '9' } } }));
  const ef = J(linhasDe(DIA)[0], 'efetivo_json');
  assert.strictEqual(ef.padrao_diurno.servente, '14');
  assert.strictEqual(linhasDe(DIA)[0][col('apontador_diurno')], 'Wallace / Pedro'.replace('Wallace', 'wállace'));
});

t('corrigir o próprio nome não deixa a parte velha no dia', () => {
  nova();
  enviar(parte({ apontador: 'Pedr', efetivo: { padrao: { servente: '5' } } }));
  enviar(parte({ apontador: 'Pedro', efetivo: { padrao: { servente: '5' } } }), { contribuicao_de: 'pedr' });
  const r = linhasDe(DIA)[0];
  assert.strictEqual(r[col('apontador_diurno')], 'Pedro');
  assert.strictEqual(J(r, 'efetivo_json').padrao_diurno.servente, '5');
});

t('o turno que já estava na planilha (antes das partes) vira parte e é somado, não apagado', () => {
  nova([['D0100', DIA, 'Wallace', '', '', 'Bom', 'Bom', 'Bom', 'fiscal 9h', 'base E2', '', 'false',
    JSON.stringify({ padrao_diurno: { servente: '8' }, padrao_noturno: {}, customIndireto_diurno: [],
      customDireto_diurno: [], customIndireto_noturno: [], customDireto_noturno: [] }),
    JSON.stringify({ padrao_diurno: { retro: '1' }, padrao_noturno: {}, custom_diurno: [], custom_noturno: [] }),
    'wallace', 'ruas-de-terra', 7, JSON.stringify({ diurno: [{ motivo: 'Chuva', inicio: '14:00', fim: '15:00' }], noturno: [] }), 'Chuva']]);
  enviar(parte({ apontador: 'Pedro', efetivo: { padrao: { servente: '5' } }, ocorrencias: 'guia LD' }));
  const l = linhasDe(DIA);
  assert.strictEqual(l.length, 1);
  const r = l[0];
  assert.strictEqual(r[col('id')], 'D0100');
  assert.strictEqual(r[col('numero_rdo')], 7, 'o número do RDO mudou');
  assert.strictEqual(r[col('apontador_diurno')], 'Wallace / Pedro');
  assert.strictEqual(J(r, 'efetivo_json').padrao_diurno.servente, '13');
  assert.strictEqual(J(r, 'equipamentos_json').padrao_diurno.retro, '1');
  assert.strictEqual(J(r, 'paralisacoes_json').diurno.length, 1, 'a paralisação do Wallace sumiu');
  assert.ok(/base E2/.test(r[col('ocorrencias')]) && /guia LD/.test(r[col('ocorrencias')]), r[col('ocorrencias')]);
  assert.strictEqual(r[col('visitas')], 'fiscal 9h');
});

t('diurno e noturno com partes próprias: um não mexe no outro', () => {
  nova();
  enviar(parte({ apontador: 'Wallace', efetivo: { padrao: { servente: '8' } } }));
  enviar(parte({ turno: 'noturno', apontador: 'Guilherme', clima: { clima_noite: 'Garoa' },
    efetivo: { padrao: { servente: '4' } } }));
  const r = linhasDe(DIA)[0];
  const ef = J(r, 'efetivo_json');
  assert.strictEqual(ef.padrao_diurno.servente, '8');
  assert.strictEqual(ef.padrao_noturno.servente, '4');
  assert.strictEqual(r[col('tem_turno_noturno')], 'true');
  assert.strictEqual(r[col('clima_noite')], 'Garoa');
});

t('tirar uma parte: só o dono, a engenharia ou o admin', () => {
  S = criar({ props: { EXIGIR_TOKEN: 'true' } });
  S.aba('RDO_Diario', [CAB]);
  enviar(parte({ apontador: 'Wallace', efetivo: { padrao: { servente: '8' } } }));
  enviar(parte({ apontador: 'Pedro', efetivo: { padrao: { servente: '5' } } }));
  const remover = (tok) => S.ctx.upsertRDODiario({ action: 'updateRDODiario', obra: 'ruas-de-terra', data: DIA,
    contribuicao: JSON.stringify({ turno: 'diurno', remover: true }), contribuicao_de: 'pedro', token: tok }, true);
  const negado = remover('tok-wallace');
  assert.strictEqual(negado.ok, false, 'Wallace tirou a parte do Pedro');
  assert.strictEqual(J(linhasDe(DIA)[0], 'efetivo_json').padrao_diurno.servente, '13');
  const r = remover('tok-pedro');
  assert.ok(r.ok, JSON.stringify(r));
  const l = linhasDe(DIA)[0];
  assert.strictEqual(l[col('apontador_diurno')], 'Wallace');
  assert.strictEqual(J(l, 'efetivo_json').padrao_diurno.servente, '8');
});

t('quantidade com vírgula soma certo e volta com vírgula (o num() do app lê ponto como milhar)', () => {
  nova();
  enviar(parte({ apontador: 'Wallace', equipamentos: { padrao: { caminhao: '1,5' }, custom: [] } }));
  enviar(parte({ apontador: 'Pedro', equipamentos: { padrao: { caminhao: '2' }, custom: [] } }));
  assert.strictEqual(J(linhasDe(DIA)[0], 'equipamentos_json').padrao_diurno.caminhao, '3,5');
});

t('obra sem partes continua no envio de sempre (e o dia vai para o mapa de chuva)', () => {
  nova();
  const r = S.ctx.upsertRDODiario({ action: 'addRDODiario', obra: 'teotonio', data: DIA, apontador_diurno: 'Wallace',
    clima_manha: 'Chuva', clima_tarde: 'Bom', clima_noite: 'Bom', tem_turno_noturno: 'false',
    efetivo_json: '{}', equipamentos_json: '{}', paralisacoes_json: '{"diurno":[],"noturno":[]}' }, false);
  // a linha gravada volta sempre (o PDF oficial sai dela), mas sem partes
  assert.ok(r.ok && r.inserted && r.linha && !r.linha.contribuicoes_json, JSON.stringify(r));
  assert.strictEqual(col('contribuicoes_json'), -1, 'criou coluna de partes sem precisar');
  const mapa = S.abas.Mapa_Chuva.dados;
  const cabM = mapa[0];
  assert.strictEqual(mapa.length, 2);
  assert.strictEqual(mapa[1][cabM.indexOf('manha')], 'Chuva produtivo');
  assert.strictEqual(mapa[1][cabM.indexOf('tarde')], 'Seco produtivo');
  assert.strictEqual(mapa[1][cabM.indexOf('noite')], '', 'sem noturno a noite fica em branco');
});

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
