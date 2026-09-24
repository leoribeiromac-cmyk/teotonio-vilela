// DOIS APONTADORES NO MESMO TURNO — no app de verdade, com o Code.gs de verdade.
//
// Nas Ruas de Terra o Wallace aponta a Agrimensor e o Pedro a Astrogildo,
// no mesmo diurno. O segundo a enviar apagava o primeiro. Aqui o app manda a
// PARTE de cada um e o servidor (o Code.gs, carregado com planilha falsa)
// soma. Confere também que o formulário abre com a parte do apontador, e não
// com o dia somado — senão o próximo "salvar" somaria o dia sobre ele mesmo —,
// que a parte começada sobrevive a um recarregamento, e que o mapa de chuva
// pinta o dia a partir do que foi lançado.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/rdo-varios-apontadores.ui.test.js
const H = require('./harness.js');
const { criar } = require('./servidor-falso.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOJE = iso(new Date());

const ef = d => JSON.stringify({ padrao_diurno: d || {}, padrao_noturno: {},
  customIndireto_diurno: [], customDireto_diurno: [], customIndireto_noturno: [], customDireto_noturno: [] });
const PARADA = JSON.stringify({ diurno: [{ motivo: 'Chuva', inicio: '14:00', fim: '16:00' }], noturno: [] });
const CAB = ['id', 'Data', 'apontador_diurno', 'apontador_noturno', 'clima_manha', 'clima_tarde', 'clima_noite',
  'ocorrencias', 'tem_turno_noturno', 'efetivo_json', 'equipamentos_json', 'paralisacoes_json', 'obra', 'numero_rdo', 'usuario'];
// O diurno do Wallace, lançado ANTES das partes existirem.
const LINHA = ['D0900', HOJE, 'Wallace', '', 'Bom', 'Chuva', 'Bom', 'base E2 a E5', 'false',
  ef({ pedreiro: '2', ajudante: '8' }), '{}', PARADA, 'ruas-de-terra', 12, 'wallace'];

const S = criar();
S.aba('RDO_Diario', [CAB.map(c => c.toLowerCase()), LINHA]);
const servidor = () => {
  const d = S.abas.RDO_Diario.dados, c = n => d[0].indexOf(n);
  const l = d.slice(1).filter(x => String(x[c('data')]).slice(0, 10) === HOJE);
  return { linhas: l.length, apont: l[0] && l[0][c('apontador_diurno')],
           ef: l[0] ? JSON.parse(l[0][c('efetivo_json')] || '{}').padrao_diurno : {},
           num: l[0] && l[0][c('numero_rdo')] };
};

(async () => {
  const s = await H.abrir({
    diario: H.csv([CAB, LINHA]),
    logar: { usuario: 'Pedro', perfil: 'engenharia' },
    gas: (acao, params) => {
      if (acao === 'updateRDODiario' || acao === 'addRDODiario') {
        // A sessão é a do Pedro (o app manda o token falso do harness).
        params.token = 'tok-pedro';
        return JSON.parse(JSON.stringify(S.ctx.upsertRDODiario(params, acao === 'updateRDODiario')));
      }
      return { ok: true };
    },
  });
  const p = s.p;
  await p.evaluate(() => trocarObra('ruas-de-terra'));
  await p.waitForFunction(() => OBRA.id === 'ruas-de-terra' && STATE.loaded, null, { timeout: 30000 });
  await s.ir('rdodiario');
  await p.evaluate(d => abrirDiarioNaData(d), HOJE);
  await p.waitForTimeout(500);

  const partes = () => p.evaluate(() => [...document.querySelectorAll('.btn-turno-diurno .turno-partes-lista li b')].map(b => b.textContent));
  ok('o diurno que já estava lançado aparece como a parte do Wallace', JSON.stringify(await partes()) === '["Wallace"]', JSON.stringify(await partes()));

  // ── o Pedro acrescenta a parte dele ──
  await p.evaluate(() => abrirParteV4('diurno', ''));
  await p.waitForSelector('#btnSalvarDiarioV4');
  const form = await p.evaluate(() => ({
    noite: !!document.querySelector('[data-diario4-clima="clima_noite"]'),
    tarde: !!document.querySelector('[data-diario4-clima="clima_tarde"]'),
    aviso: document.body.textContent.includes('SOMADA à sua'),
    ajudante: (document.querySelector('[data-efet4="ajudante"]') || {}).value,
  }));
  ok('a parte nova abre EM BRANCO, não com o dia somado', form.ajudante === '', form.ajudante);
  ok('e diz que a parte do Wallace é somada, não substituída', form.aviso);
  ok('o diurno só pergunta o clima da manhã e da tarde', form.tarde && !form.noite, JSON.stringify(form));

  await p.fill('[data-diario4="apontador"]', 'Pedro');
  await p.fill('[data-efet4="ajudante"]', '5');

  // A parte começada sobrevive a um recarregamento (o celular descarta a aba).
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 60000 });
  await s.ir('rdodiario');
  await p.waitForTimeout(400);
  const voltou = await p.evaluate(() => ({
    turno: DIARIO_TURNO_ATIVO, obra: OBRA.id,
    nome: (document.querySelector('[data-diario4="apontador"]') || {}).value,
    ajudante: (document.querySelector('[data-efet4="ajudante"]') || {}).value,
  }));
  ok('recarregar a página volta ao formulário da parte, com o que foi digitado',
     voltou.turno === 'diurno' && voltou.nome === 'Pedro' && voltou.ajudante === '5', JSON.stringify(voltou));

  await p.click('#btnSalvarDiarioV4');
  await p.waitForFunction(() => DIARIO_TURNO_ATIVO === null && document.querySelectorAll('.btn-turno-diurno .turno-partes-lista li').length === 2,
    null, { timeout: 10000 }).catch(() => {});
  let sv = servidor();
  ok('no servidor o dia continua UMA linha, com o mesmo número', sv.linhas === 1 && sv.num === 12, JSON.stringify(sv));
  ok('o efetivo do dia é a SOMA das duas frentes (ajudante 8 + 5)', sv.ef.ajudante === '13' && sv.ef.pedreiro === '2', JSON.stringify(sv.ef));
  ok('os dois apontadores assinam o diurno', sv.apont === 'Wallace / Pedro', sv.apont);
  ok('e o seletor já mostra as duas partes, sem esperar o CSV publicado',
     JSON.stringify(await partes()) === '["Wallace","Pedro"]', JSON.stringify(await partes()));
  const dia = await p.evaluate(d => ({ apont: getCSVField(linhaDoDiaRDO(d), 'apontador_diurno'),
    ef: JSON.parse(getCSVField(linhaDoDiaRDO(d), 'efetivo_json')).padrao_diurno.ajudante }), HOJE);
  ok('o dia que o PDF lê é o somado', dia.apont === 'Wallace / Pedro' && dia.ef === '13', JSON.stringify(dia));

  // ── o Pedro corrige a parte dele ──
  await p.evaluate(() => abrirParteV4('diurno', 'pedro'));
  await p.waitForSelector('#btnSalvarDiarioV4');
  const editando = await p.evaluate(() => (document.querySelector('[data-efet4="ajudante"]') || {}).value);
  ok('Editar abre a parte do Pedro (5), não o dia somado (13)', editando === '5', editando);
  await p.fill('[data-efet4="ajudante"]', '6');
  await p.click('#btnSalvarDiarioV4');
  await p.waitForFunction(() => DIARIO_TURNO_ATIVO === null && document.querySelectorAll('.btn-turno-diurno .turno-partes-lista li').length === 2,
    null, { timeout: 10000 }).catch(() => {});
  sv = servidor();
  ok('corrigir a própria parte troca, não soma de novo (8 + 6)', sv.ef.ajudante === '14', JSON.stringify(sv.ef));
  // Editar a parte de OUTRA pessoa pede confirmação.
  let perguntou = '';
  p.once('dialog', d => { perguntou = d.message(); d.dismiss(); });
  await p.evaluate(() => { DIARIO_V4 = carregarDiarioDaSheet(DIARIO_V4.data); });
  const chaveW = await p.evaluate(() => Object.keys(partesDoDiaRDO(DIARIO_V4.data).diurno)[0]);
  // a parte do Wallace é legado (sem usuário) — dá a ela um dono para o teste
  await p.evaluate(() => {
    const l = linhaDoDiaRDO(DIARIO_V4.data);
    const o = JSON.parse(getCSVField(l, 'contribuicoes_json'));
    o.diurno.wallace.usuario = 'wallace';
    diarioLocalGuardar(DIARIO_V4.data, Object.assign({}, l, { contribuicoes_json: JSON.stringify(o) }));
  });
  await p.evaluate(k => abrirParteV4('diurno', k), chaveW);
  await p.waitForTimeout(300);
  ok('editar a parte do Wallace, logado como Pedro, pede confirmação', /Wallace/.test(perguntou), perguntou);
  ok('e, recusada, o formulário não abre', await p.evaluate(() => DIARIO_TURNO_ATIVO === null));
  await p.evaluate(() => transitionTo(render));
  await p.waitForTimeout(400);
  ok('e continuam duas partes', JSON.stringify(await partes()) === '["Wallace","Pedro"]', JSON.stringify(await partes()));

  // ── o mapa de chuva do mês ──
  await p.evaluate(m => { IMPROD_MES = m; navigate('improdutivos'); }, HOJE.slice(0, 7));
  await p.waitForSelector('#mapaChuvaCard svg');
  const casa = await p.evaluate(d => {
    const q = per => (document.querySelector(`#mapaChuvaCard path[data-dia="${d}"][data-periodo="${per}"]`) || {}).getAttribute
      ? document.querySelector(`#mapaChuvaCard path[data-dia="${d}"][data-periodo="${per}"]`).getAttribute('data-cat') : 'faltou';
    return { manha: q('manha'), tarde: q('tarde'), noite: q('noite'),
             fatias: document.querySelectorAll('#mapaChuvaCard path[data-periodo="manha"]').length };
  }, HOJE);
  const diasNoMes = new Date(+HOJE.slice(0, 4), +HOJE.slice(5, 7), 0).getDate();
  ok('o mapa tem uma fatia por dia do mês', casa.fatias === diasNoMes, casa.fatias + ' de ' + diasNoMes);
  ok('manhã seca com trabalho: seco produtivo', casa.manha === 'seco_produtivo', casa.manha);
  ok('tarde com chuva e parada das 14h às 16h: chuva improdutivo', casa.tarde === 'chuva_improdutivo', casa.tarde);
  ok('sem turno noturno, a noite fica em branco', casa.noite === '', casa.noite);
  const mapaServ = S.abas.Mapa_Chuva ? S.abas.Mapa_Chuva.dados : [];
  ok('e a aba Mapa_Chuva da planilha recebeu o dia', mapaServ.length === 2 &&
     mapaServ[1][mapaServ[0].indexOf('tarde')] === 'Chuva improdutivo', JSON.stringify(mapaServ[1]));

  ok('nenhum erro de página', s.erros.length === 0, s.erros.join(' | '));
  await s.fechar();
  console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} FALHA(S)\n`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
