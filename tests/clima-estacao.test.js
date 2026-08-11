// A ESTAÇÃO METEOROLÓGICA DE CADA OBRA
//
// Até aqui havia UMA estação fixa (A701, Mirante de Santana) para todas as
// obras. Só que o Ranário fica em São Roque, a mais de 50 km dali, e as Ruas
// de Terra em Itaquera: a chuva que sustentaria um pleito de prorrogação era
// medida noutro lugar. Aqui se prova que cada obra passa a resolver a estação
// pela PRÓPRIA coordenada, contra o catálogo do INMET.
//
// O INMET é falso de propósito: o teste não pode depender de rede, e assim dá
// para forçar o que a obra ainda não viveu — a estação mais perto muda, cai,
// ou o catálogo inteiro sai do ar.
//
// Roda sem dependência externa:  node tests/clima-estacao.test.js
const vm = require('vm');
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

// ---------- INMET falso ----------
// Coordenadas plausíveis para a região; o que o teste checa é a ESCOLHA
// (qual fica mais perto de qual obra), não o valor absoluto.
const CATALOGO = [
  { CD_ESTACAO: 'A701', DC_NOME: 'SAO PAULO - MIRANTE',   SG_ESTADO: 'SP', VL_LATITUDE: -23.4961, VL_LONGITUDE: -46.6200 },
  { CD_ESTACAO: 'A771', DC_NOME: 'SAO PAULO - INTERLAGOS', SG_ESTADO: 'SP', VL_LATITUDE: -23.7244, VL_LONGITUDE: -46.6775 },
  { CD_ESTACAO: 'A713', DC_NOME: 'SOROCABA',               SG_ESTADO: 'SP', VL_LATITUDE: -23.4260, VL_LONGITUDE: -47.5855 },
  { CD_ESTACAO: 'A755', DC_NOME: 'BARUERI',                SG_ESTADO: 'SP', VL_LATITUDE: -23.5236, VL_LONGITUDE: -46.8703 },
  // desativada: não pode ser escolhida por mais perto que esteja
  { CD_ESTACAO: 'A999', DC_NOME: 'ESTACAO DESATIVADA',     SG_ESTADO: 'SP', VL_LATITUDE: -23.7205, VL_LONGITUDE: -46.7025,
    DT_FIM_OPERACAO: '2019-01-01T00:00:00.000-03:00' },
];

// Horas do INMET: HR_MEDICAO em UTC ("HH00"), CHUVA em mm com vírgula.
function horas(porHoraLocal) {
  const linhas = [];
  for (let local = 0; local < 24; local++) {
    const utc = (local + 3) % 24;
    linhas.push({ HR_MEDICAO: String(utc).padStart(2, '0') + '00',
                  CHUVA: String(porHoraLocal[local] || 0).replace('.', ',') });
  }
  return linhas;
}

// Controle da rede falsa: quem responde o quê, e quantas vezes foi chamado.
const REDE = {
  catalogoNoAr: true,
  catalogoBuscas: 0,
  mudas: [],            // estações que respondem "sem registro"
  fora: [],             // estações que respondem HTTP 500
  chuvaPorHora: {},     // por hora local, mm
  pedidos: [],          // códigos consultados, na ordem
};

const UrlFetchApp = {
  fetch(url) {
    if (url.indexOf('/estacoes/T') !== -1) {
      REDE.catalogoBuscas++;
      if (!REDE.catalogoNoAr) return { getResponseCode: () => 503, getContentText: () => '' };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(CATALOGO) };
    }
    const cod = url.split('/').pop();
    REDE.pedidos.push(cod);
    if (REDE.fora.indexOf(cod) !== -1) return { getResponseCode: () => 500, getContentText: () => '' };
    if (REDE.mudas.indexOf(cod) !== -1) return { getResponseCode: () => 200, getContentText: () => '[]' };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(horas(REDE.chuvaPorHora)) };
  }
};

const _props = {};
const PROPS = {
  getProperty: k => (k in _props ? _props[k] : null),
  setProperty: (k, v) => { _props[k] = String(v); },
  deleteProperty: k => { delete _props[k]; },
  getProperties: () => ({ ..._props })
};
let _cache = {};
const CACHE = {
  get: k => (k in _cache ? _cache[k] : null),
  put: (k, v) => { _cache[k] = String(v); },
  remove: k => { delete _cache[k]; }
};

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: (d) => new Date(d).toISOString().slice(0, 10), sleep() {},
               getUuid: () => 'uuid', DigestAlgorithm: {}, computeDigest: () => [] },
  Session: { getScriptTimeZone: () => 'UTC' },
  PropertiesService: { getScriptProperties: () => PROPS },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  CacheService: { getScriptCache: () => CACHE },
  DriveApp: { getFoldersByName: () => ({ hasNext: () => false }) },
  UrlFetchApp, MailApp: {}, ScriptApp: {}, XmlService: {}
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });

function limpar() {
  Object.keys(_props).forEach(k => delete _props[k]);
  _cache = {};
  REDE.catalogoNoAr = true; REDE.catalogoBuscas = 0;
  REDE.mudas = []; REDE.fora = []; REDE.chuvaPorHora = {}; REDE.pedidos = [];
}

let falhas = 0;
const t = (nome, fn) => {
  limpar();
  try { fn(); console.log('  ✓ ' + nome); }
  catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
};

console.log('\nA ESTAÇÃO É DE CADA OBRA\n');

t('as três obras têm coordenada declarada', () => {
  ['teotonio', 'ruas-de-terra', 'ranario'].forEach(id => {
    const o = ctx.CLIMA_OBRAS[id];
    assert.ok(o, 'obra ' + id + ' sem entrada em CLIMA_OBRAS');
    assert.ok(isFinite(o.lat) && isFinite(o.lon), 'obra ' + id + ' sem lat/lon');
  });
});

// Repare no Ranário: a intuição diz Sorocaba, que é a cidade grande da
// região e dá nome à área. A conta diz Barueri, 19 km mais perto. É por
// isso que a estação sai da distância, e não de um palpite escrito à mão.
t('cada obra resolve uma estação DIFERENTE — era este o defeito', () => {
  const t1 = ctx.estacoesDaObra_('teotonio', 1)[0];
  const t2 = ctx.estacoesDaObra_('ruas-de-terra', 1)[0];
  const t3 = ctx.estacoesDaObra_('ranario', 1)[0];
  assert.strictEqual(t1.cod, 'A771', 'Teotônio devia cair em Interlagos, caiu em ' + t1.cod);
  assert.strictEqual(t2.cod, 'A701', 'Ruas de Terra devia cair no Mirante, caiu em ' + t2.cod);
  assert.strictEqual(t3.cod, 'A755', 'Ranário devia cair na mais perto, caiu em ' + t3.cod);
  assert.strictEqual(new Set([t1.cod, t2.cod, t3.cod]).size, 3, 'duas obras na mesma estação');
});

t('a estação da Teotônio fica a poucos km, não a 25', () => {
  const e = ctx.estacoesDaObra_('teotonio', 1)[0];
  assert.ok(e.km < 5, 'ficou a ' + e.km + ' km');
});

t('e a do Ranário deixa de ser a da capital', () => {
  const e = ctx.estacoesDaObra_('ranario', 1)[0];
  const capital = ctx.distanciaKm_(ctx.CLIMA_OBRAS['ranario'].lat, ctx.CLIMA_OBRAS['ranario'].lon,
                                   -23.4961, -46.6200);
  assert.ok(capital > 50, 'o Mirante devia estar a mais de 50 km: ' + capital.toFixed(1));
  assert.ok(e.km < capital, 'a escolhida (' + e.km + ' km) não é mais perto que o Mirante');
});

t('estação desativada nunca é escolhida, por mais perto que esteja', () => {
  const lista = ctx.estacoesDaObra_('teotonio', 5);
  assert.ok(lista.every(e => e.cod !== 'A999'), JSON.stringify(lista.map(e => e.cod)));
});

console.log('\nQUANDO A ESTAÇÃO MAIS PERTO NÃO PUBLICA\n');

t('a busca desce para a seguinte e a resposta diz qual respondeu', () => {
  REDE.mudas = ['A771'];
  REDE.chuvaPorHora = { 14: 3 };
  const r = ctx.climaDoDia('2026-08-10', 'teotonio');
  assert.ok(r.ok, 'devolveu erro: ' + r.motivo);
  assert.deepStrictEqual(REDE.pedidos, ['A771', 'A701'], JSON.stringify(REDE.pedidos));
  assert.strictEqual(r.estacao, 'A701');
});

t('estação fora do ar (HTTP 500) também cai para a seguinte', () => {
  REDE.fora = ['A771'];
  REDE.chuvaPorHora = { 9: 1 };
  const r = ctx.climaDoDia('2026-08-10', 'teotonio');
  assert.ok(r.ok, 'devolveu erro: ' + r.motivo);
  assert.strictEqual(r.estacao, 'A701');
});

t('todas mudas → erro claro, e o RDO continua sendo preenchido à mão', () => {
  REDE.mudas = ['A701', 'A771', 'A713', 'A755'];
  const r = ctx.climaDoDia('2026-08-10', 'teotonio');
  assert.strictEqual(r.ok, false);
  assert.ok(/não tem registro/.test(r.motivo), r.motivo);
});

console.log('\nO QUE FICA ESCRITO NO RDO\n');

t('a fonte traz a estação, o nome e a distância até a obra', () => {
  REDE.chuvaPorHora = { 15: 2 };
  const r = ctx.climaDoDia('2026-08-10', 'teotonio');
  assert.ok(/INMET/.test(r.fonte), r.fonte);
  assert.ok(/A771/.test(r.fonte), r.fonte);
  assert.ok(/INTERLAGOS/.test(r.fonte), r.fonte);
  assert.ok(/km da obra/.test(r.fonte), r.fonte);
  assert.strictEqual(typeof r.km, 'number');
});

t('a chuva é somada no período certo (hora do INMET vem em UTC)', () => {
  REDE.chuvaPorHora = { 7: 4, 13: 1, 20: 10 };   // manhã, tarde, noite (local)
  const r = ctx.climaDoDia('2026-08-10', 'teotonio');
  // objeto nascido no vm: prototype de outro realm, então compara por valor
  assert.deepStrictEqual({ ...r.mm }, { manha: 4, tarde: 1, noite: 10 }, JSON.stringify(r.mm));
  assert.strictEqual(r.manha, 'Chuva');        // 4 mm
  assert.strictEqual(r.tarde, 'Chuva');        // 1 mm
  assert.strictEqual(r.noite, 'Chuva forte');  // 10 mm
  assert.strictEqual(r.total_mm, 15);
});

t('dia seco vira Bom, e não Encoberto', () => {
  const r = ctx.climaDoDia('2026-08-10', 'teotonio');
  assert.deepStrictEqual([r.manha, r.tarde, r.noite], ['Bom', 'Bom', 'Bom']);
});

console.log('\nCACHE — a chuva de uma obra não pode servir à outra\n');

t('a chave do cache leva a obra junto com a data', () => {
  REDE.chuvaPorHora = { 10: 8 };
  const a = ctx.climaDoDia('2026-08-10', 'teotonio');
  REDE.chuvaPorHora = {};                        // no Ranário não choveu
  const b = ctx.climaDoDia('2026-08-10', 'ranario');
  assert.strictEqual(a.mm.manha, 8);
  assert.strictEqual(b.mm.manha, 0, 'o Ranário recebeu a chuva da Teotônio');
  assert.notStrictEqual(a.estacao, b.estacao);
});

t('a segunda consulta da mesma obra sai do cache, sem nova ida à rede', () => {
  REDE.chuvaPorHora = { 10: 2 };
  ctx.climaDoDia('2026-08-10', 'teotonio');
  const antes = REDE.pedidos.length;
  ctx.climaDoDia('2026-08-10', 'teotonio');
  assert.strictEqual(REDE.pedidos.length, antes, 'bateu na rede de novo');
});

console.log('\nAJUSTE MANUAL E REDE RUIM\n');

t('INMET_ESTACAO_<OBRA> trava a estação daquela obra só', () => {
  _props['INMET_ESTACAO_TEOTONIO'] = 'A713';
  assert.strictEqual(ctx.estacoesDaObra_('teotonio', 1)[0].cod, 'A713');
  assert.strictEqual(ctx.estacoesDaObra_('ranario', 1)[0].cod, 'A755',
    'a trava de uma obra vazou para a outra');
});

t('INMET_ESTACAO (o ajuste antigo) continua valendo para todas', () => {
  _props['INMET_ESTACAO'] = 'A701';
  assert.strictEqual(ctx.estacoesDaObra_('teotonio', 1)[0].cod, 'A701');
  assert.strictEqual(ctx.estacoesDaObra_('ranario', 1)[0].cod, 'A701');
});

t('o catálogo é buscado UMA vez e guardado', () => {
  ctx.estacoesDaObra_('teotonio', 1);
  ctx.estacoesDaObra_('ranario', 1);
  ctx.estacoesDaObra_('ruas-de-terra', 1);
  assert.strictEqual(REDE.catalogoBuscas, 1, 'buscou ' + REDE.catalogoBuscas + ' vezes');
});

// O INMET tem centenas de estações automáticas no Brasil. Guardar o
// catálogo inteiro estoura o limite de 9 KB por propriedade do Apps
// Script — e a gravação falha calada, fazendo o script rebaixar o
// catálogo a cada consulta.
t('o que fica guardado cabe numa propriedade do Apps Script (9 KB)', () => {
  const grande = [];
  for (let i = 0; i < 600; i++) {
    grande.push({ CD_ESTACAO: 'B' + String(i).padStart(3, '0'),
                  DC_NOME: 'ESTACAO AUTOMATICA DE NOME COMPRIDO ' + i, SG_ESTADO: 'SP',
                  VL_LATITUDE: -23 - i / 1000, VL_LONGITUDE: -46 - i / 1000 });
  }
  const original = CATALOGO.slice();
  CATALOGO.length = 0; grande.forEach(e => CATALOGO.push(e));
  try {
    ctx.estacoesDaObra_('teotonio', 3);
    Object.keys(_props).forEach(k => {
      assert.ok(_props[k].length < 9000,
        'a propriedade ' + k + ' tem ' + _props[k].length + ' caracteres');
    });
    assert.ok(_props['INMET_PERTO_teotonio'], 'não guardou as candidatas da obra');
  } finally {
    CATALOGO.length = 0; original.forEach(e => CATALOGO.push(e));
  }
});

t('catálogo fora do ar → usa a última estação que deu certo naquela obra', () => {
  REDE.chuvaPorHora = { 10: 1 };
  ctx.climaDoDia('2026-08-10', 'teotonio');           // grava a escolha
  assert.strictEqual(_props['INMET_ULTIMA_teotonio'], 'A771');

  REDE.catalogoNoAr = false;
  delete _props['INMET_CATALOGO']; delete _props['INMET_CATALOGO_EM'];
  assert.strictEqual(ctx.estacoesDaObra_('teotonio', 1)[0].cod, 'A771');
});

t('obra sem coordenada declarada não inventa estação — cai no padrão', () => {
  const e = ctx.estacoesDaObra_('obra-que-nao-existe', 1)[0];
  assert.strictEqual(e.cod, ctx.INMET_ESTACAO_PADRAO);
  assert.strictEqual(e.semCoordenada, true);
});

console.log('\nO GATILHO DAS 05h ATENDE TODAS AS OBRAS\n');

t('registrarClimaAuto percorre CLIMA_OBRAS, e não uma obra só', () => {
  const corpo = (src.split('function registrarClimaAuto')[1] || '').split('\nfunction ')[0];
  assert.ok(/Object\.keys\(CLIMA_OBRAS\)/.test(corpo), 'não percorre as obras');
});

t('e não usa mais a Open-Meteo, cuja licença grátis proíbe uso comercial', () => {
  assert.ok(!/open-meteo\.com/i.test(src), 'ainda há chamada à Open-Meteo no Code.gs');
});

t('a coordenada fixa de uma obra só saiu do código', () => {
  assert.ok(!/\bOBRA_LAT\b/.test(src), 'OBRA_LAT ainda existe');
  assert.ok(!/\bOBRA_LON\b/.test(src), 'OBRA_LON ainda existe');
});

console.log('\nO APP MANDA A OBRA NA CONSULTA\n');

t('o roteador repassa p.obra para o climaDoDia', () => {
  assert.ok(/case 'clima':\s*resp = climaDoDia\(p\.data, p\.obra\)/.test(src),
    'o roteador ainda chama climaDoDia sem a obra');
});

t('o index.html envia a obra ativa no action=clima', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const bloco = (html.split('window.buscarClima')[1] || '').slice(0, 1200);
  assert.ok(/action: 'clima'/.test(bloco), 'não achei a chamada');
  assert.ok(/obra: obraAtivaId\(\)/.test(bloco), 'a obra não vai na consulta');
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
