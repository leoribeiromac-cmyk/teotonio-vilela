// REPETIR A EQUIPE DO ÚLTIMO DIA NO RDO DIÁRIO.
//
// São 17 funções de efetivo indireto, as do direto e uma dúzia de
// equipamentos — redigitados todo dia, quando a equipe quase não muda. Um
// toque traz as quantidades do último turno igual; o apontador só corrige.
// Só as QUANTIDADES: apontador, paralisação e texto são do dia.
//
// Como rodar:  node tests/repetir-equipe.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const hoje = new Date();
const ontem = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1));
const anteontem = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 2));

(async () => {
  // as chaves das categorias vêm do próprio app: o teste não inventa nome de função
  const s0 = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, diario: '' });
  const chaves = await s0.p.evaluate(() => ({ dir: CATEGORIAS_DIRETO[0].key, eq: CATEGORIAS_EQUIP_PADRAO[0].key }));
  await s0.fechar();

  const diario = H.csv([
    ['id', 'Data', 'Apontador_Diurno', 'Clima_Manha', 'Clima_Tarde', 'Efetivo_JSON', 'Equipamentos_JSON', 'Ocorrencias', 'obra'],
    ['D0001', anteontem, 'Wallace', 'Bom', 'Bom',
     JSON.stringify({ padrao_diurno: { [chaves.dir]: 9 } }), JSON.stringify({ padrao_diurno: { [chaves.eq]: 9 } }), 'velho', 'teotonio'],
    ['D0002', ontem, 'Wallace', 'Bom', 'Chuva',
     JSON.stringify({ padrao_diurno: { [chaves.dir]: 4 }, customDireto_diurno: [{ label: 'Soldador', qtd: 2 }] }),
     JSON.stringify({ padrao_diurno: { [chaves.eq]: 1 }, custom_diurno: [{ label: 'Rolo pé-de-carneiro', qtd: 1 }] }),
     'Chuva forte à tarde', 'teotonio'],
  ]);

  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, diario });
  await s.ir('rdodiario');
  await s.p.waitForTimeout(500);
  await s.p.evaluate(() => selecionarTurnoV4('diurno'));
  await s.p.waitForTimeout(500);
  ok('o formulário do turno oferece repetir a equipe',
     await s.p.evaluate(() => !!document.querySelector('.copiar-equipe button')));

  await s.p.evaluate(() => copiarEquipeDoUltimoDia());
  await s.p.waitForTimeout(500);
  const r = await s.p.evaluate((ch) => ({
    dir: DIARIO_V4.diurno.efetivo[ch.dir], eq: DIARIO_V4.diurno.equipamentos[ch.eq],
    custom: DIARIO_V4.diurno.customDireto, customEq: DIARIO_V4.diurno.customEquip,
    oc: DIARIO_V4.diurno.ocorrencias, apont: DIARIO_V4.diurno.apontador,
    campo: (document.querySelector(`[data-diario4-ef="${ch.dir}"], input[name="${ch.dir}"]`) || {}).value,
  }), chaves);
  ok('vem o efetivo do ÚLTIMO dia (ontem), não o de antes', String(r.dir) === '4', JSON.stringify(r));
  ok('e os equipamentos', String(r.eq) === '1', r.eq);
  ok('com as funções e os equipamentos personalizados', (r.custom || []).some(f => f.label === 'Soldador') &&
     (r.customEq || []).some(f => /Rolo/.test(f.label)), JSON.stringify([r.custom, r.customEq]));
  ok('mas não as ocorrências nem o apontador — esses são do dia', !r.oc && !r.apont, JSON.stringify([r.oc, r.apont]));
  ok('e ficou no rascunho (sobrevive a recarregar)', await s.p.evaluate((ch) => {
    const g = loadDiarioV4(DIARIO_V4.data); return g && String(g.diurno.efetivo[ch.dir]) === '4';
  }, chaves));

  // já preenchido: pergunta antes de trocar
  const perguntou = await s.p.evaluate(() => {
    let p = false; const c = window.confirm; window.confirm = () => { p = true; return false; };
    copiarEquipeDoUltimoDia(); window.confirm = c; return p;
  });
  ok('com quantidades já digitadas, pergunta antes de trocar', perguntou);

  ok('nenhum erro de página', s.erros.length === 0, s.erros.slice(0, 3).join(' ; '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
