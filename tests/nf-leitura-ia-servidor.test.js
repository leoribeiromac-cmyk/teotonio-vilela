// A LEITURA DA NOTA POR IA — o lado do servidor
//
// Quem chama o Gemini é o Code.gs, e é lá que moram as falhas que o apontador
// não tem como entender: o Google devolvendo 503 porque está sobrecarregado,
// a resposta cortada no meio porque a nota tem itens demais, e o modelo velho
// recusando um ajuste que só o 2.5 conhece. Nos três casos o app dizia a mesma
// coisa — "Não consegui ler a imagem" — e a nota ia para a digitação à mão.
//
// O que este teste cobra:
//   • 503/500 é sobrecarga do Google, não nota ilegível: repete UMA vez, e só
//     depois desiste — e desiste com motivo próprio, não com "api";
//   • sobrecarga persistente cai no modelo reserva, como a cota estourada já
//     fazia;
//   • nota comprida (MAX_TOKENS) não se perde inteira: repete pedindo só o
//     cabeçalho, e avisa que a lista de itens ficou de fora;
//   • modelo antigo que recusa o teto de saída novo (400) continua lendo, pelo
//     pedido simplificado;
//   • o que não é transitório (chave inválida) NÃO é repetido — insistir ali
//     só faz o apontador esperar.
//
// Roda sem dependência externa:  node tests/nf-leitura-ia-servidor.test.js
const vm = require('vm');
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

const FOTO = 'data:image/jpeg;base64,' + Buffer.from('uma-danfe-fotografada').toString('base64');

// ---------------- respostas do Gemini, na fila em que serão devolvidas ------
let FILA = [];          // cada item: {codigo, corpo}
let CHAMADAS = [];      // {url, payload} de cada ida à internet
let DORMIU = 0;         // quanto o servidor esperou antes de repetir

function resposta(codigo, corpo) {
  return { codigo: codigo, corpo: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) };
}
function respostaOk(dados, finishReason) {
  return resposta(200, {
    candidates: [{ finishReason: finishReason || 'STOP',
                   content: { parts: [{ text: JSON.stringify(dados) }] } }]
  });
}
const NOTA = {
  dados: { numero: '12345', serie: '1', cnpj: '11111111000191', razaoSocial: 'CONCRETEIRA ALFA',
           dataEmissao: '2026-08-20', vTotal: 13500, itens: [{ descricao: 'BRITA 1', qtd: 100, un: 'M3' }] },
  confiancaGeral: 0.9
};
const SO_CABECALHO = {
  dados: { numero: '12345', serie: '1', razaoSocial: 'CONCRETEIRA ALFA', vTotal: 13500, itens: [] },
  confiancaGeral: 0.9
};

/* Propriedades do script de verdade (um mapa): o nfDiag lista os NOMES do
   que está lá, e o teste do diagnóstico precisa enxergar o que ele lista —
   e o que ele deixa de fora. */
const PROPS_MAPA = { GEMINI_API_KEY: 'chave-de-teste' };
const PROPS = {
  getProperty: (k) => (k in PROPS_MAPA ? PROPS_MAPA[k] : null),
  setProperty(k, v) { PROPS_MAPA[k] = String(v); },
  deleteProperty(k) { delete PROPS_MAPA[k]; },
  getKeys: () => Object.keys(PROPS_MAPA),
  getProperties: () => ({ ...PROPS_MAPA }),
};
let _uuid = 0;

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp,
  encodeURIComponent,
  SpreadsheetApp: { getActiveSpreadsheet: () => null },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    formatDate: (d) => new Date(d).toISOString().slice(0, 19),
    sleep: (ms) => { DORMIU += ms; },
    getUuid: () => 'uuid-' + (++_uuid)
  },
  Session: { getScriptTimeZone: () => 'UTC' },
  PropertiesService: { getScriptProperties: () => PROPS },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  DriveApp: {}, MailApp: {}, ScriptApp: {}, XmlService: {},
  UrlFetchApp: {
    fetch(url, opts) {
      CHAMADAS.push({ url: url, payload: JSON.parse((opts && opts.payload) || '{}') });
      const r = FILA.shift() || resposta(200, { candidates: [] });
      return { getResponseCode: () => r.codigo, getContentText: () => r.corpo };
    }
  }
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };
function preparar(respostas) { FILA = respostas.slice(); CHAMADAS = []; DORMIU = 0; }
const modelosChamados = () => CHAMADAS.map(c => (c.url.match(/models\/([^:]+):/) || [])[1]);

console.log('LEITURA DA NOTA POR IA — SERVIDOR\n');

console.log('SOBRECARGA DO GOOGLE NÃO É NOTA ILEGÍVEL');

t('503 na primeira: repete e entrega a nota lida na segunda', () => {
  preparar([resposta(503, { error: { message: 'The model is overloaded. Please try again later.' } }),
            respostaOk(NOTA)]);
  const r = ctx.nfLerIA({ foto: FOTO, obra: 'teotonio' });
  assert.ok(r.ok, 'devia ter lido na segunda tentativa: ' + JSON.stringify(r));
  assert.strictEqual(r.dados.numero, '12345');
  assert.strictEqual(CHAMADAS.length, 2, 'esperava 2 idas ao Gemini, houve ' + CHAMADAS.length);
});

t('e espera um instante antes de repetir (repetir na hora pega a mesma fila cheia)', () => {
  assert.ok(DORMIU >= 1000, 'não esperou nada entre as tentativas');
});

t('500 também é repetido', () => {
  preparar([resposta(500, { error: { message: 'Internal error' } }), respostaOk(NOTA)]);
  assert.ok(ctx.nfLerIA({ foto: FOTO }).ok);
  assert.strictEqual(CHAMADAS.length, 2);
});

t('sobrecarga que não passa cai no modelo reserva', () => {
  preparar([resposta(503, {}), resposta(503, {}),        // principal: as duas tentativas
            respostaOk(NOTA)]);                          // reserva responde
  const r = ctx.nfLerIA({ foto: FOTO });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.modelo, ctx.NF_MODELO_RESERVA, 'devia ter respondido pelo reserva');
});

t('quando nem o reserva responde, o motivo é sobrecarga — não "erro da API"', () => {
  preparar([resposta(503, {}), resposta(503, {}), resposta(503, {}), resposta(503, {})]);
  const r = ctx.nfLerIA({ foto: FOTO });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'sobrecarga', JSON.stringify(r));
});

t('chave inválida NÃO é repetida: insistir ali é só espera perdida', () => {
  preparar([resposta(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })]);
  const r = ctx.nfLerIA({ foto: FOTO });
  assert.strictEqual(r.motivo, 'chave_invalida', JSON.stringify(r));
  assert.strictEqual(CHAMADAS.length, 1, 'repetiu uma falha que não passa sozinha');
});

console.log('\nNOTA COMPRIDA: SALVA-SE O CABEÇALHO');

t('a lista de itens estourou o teto: repete pedindo só o cabeçalho', () => {
  preparar([respostaOk(NOTA, 'MAX_TOKENS'), respostaOk(SO_CABECALHO)]);
  const r = ctx.nfLerIA({ foto: FOTO });
  assert.ok(r.ok, 'perdeu a nota inteira por causa dos itens: ' + JSON.stringify(r));
  assert.strictEqual(r.dados.razaoSocial, 'CONCRETEIRA ALFA');
  assert.strictEqual(r.semItens, true, 'não avisou que a lista de itens ficou de fora');
});

t('e o segundo pedido diz, em português, para não trazer os itens', () => {
  const segundo = CHAMADAS[1].payload.contents[0].parts[0].text;
  assert.ok(/NÃO traga a lista de itens/.test(segundo), segundo.slice(-200));
});

t('se nem o cabeçalho couber, aí sim a leitura falha com "nota comprida"', () => {
  preparar([respostaOk(NOTA, 'MAX_TOKENS'), respostaOk(NOTA, 'MAX_TOKENS')]);
  const r = ctx.nfLerIA({ foto: FOTO });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'longa', JSON.stringify(r));
});

t('leitura normal não ganha aviso de itens faltando', () => {
  preparar([respostaOk(NOTA)]);
  const r = ctx.nfLerIA({ foto: FOTO });
  assert.ok(r.ok);
  assert.strictEqual(r.semItens, false);
  assert.strictEqual(CHAMADAS.length, 1);
});

console.log('\nO TETO DE SAÍDA É ALTO, MAS NÃO QUEBRA MODELO ANTIGO');

t('o pedido normal pede um teto folgado (nota de 40 itens não cabe em 8192)', () => {
  preparar([respostaOk(NOTA)]);
  ctx.nfLerIA({ foto: FOTO });
  assert.ok(CHAMADAS[0].payload.generationConfig.maxOutputTokens > 8192,
    'teto de saída: ' + CHAMADAS[0].payload.generationConfig.maxOutputTokens);
});

t('modelo que recusa o teto novo (400) é reatendido pelo pedido simplificado', () => {
  preparar([resposta(400, { error: { message: 'Invalid value at generation_config.max_output_tokens' } }),
            respostaOk(NOTA)]);
  const r = ctx.nfLerIA({ foto: FOTO });
  assert.ok(r.ok, JSON.stringify(r));
  const g = CHAMADAS[1].payload.generationConfig;
  assert.strictEqual(g.maxOutputTokens, 8192, 'não baixou o teto: ' + JSON.stringify(g));
  assert.strictEqual(g.thinkingConfig, undefined, 'não tirou o thinkingConfig: ' + JSON.stringify(g));
});

console.log('\nO TEXTO DO PDF DISPENSA A IMAGEM');

t('com texto em mãos, o que sobe é o texto — não a foto (10x mais cara)', () => {
  preparar([respostaOk(NOTA)]);
  ctx.nfLerIA({ texto: 'DANFE '.repeat(80), foto: '' });
  const partes = CHAMADAS[0].payload.contents[0].parts;
  assert.ok(partes.every(x => !x.inline_data), 'mandou imagem junto com o texto');
  assert.ok(partes.some(x => /DANFE/.test(x.text || '')), JSON.stringify(partes).slice(0, 200));
});

console.log('\nO DIAGNÓSTICO É DO ADMINISTRADOR — E NÃO ENTREGA SESSÃO');
/* nfDiag listava TODAS as Propriedades do script para qualquer usuário
   logado — e é lá que moram as sessões (SES_<token>): a lista entregava o
   token de todo mundo, inclusive o do administrador, a quem só tinha perfil
   de apontador. */
t('sem perfil de administrador, o diagnóstico é recusado — sem a lista', () => {
  PROPS_MAPA.EXIGIR_TOKEN = 'true';
  const r = ctx.nfDiag(ctx.sessaoCriar('Carlos', 'apontador', []));
  assert.ok(!r.ok, 'abriu para o apontador');
  assert.strictEqual(r.error, 'SEM_PERMISSAO');
  assert.ok(!('propriedades' in r), 'vazou a lista de propriedades');
});
t('sem token, idem', () => {
  PROPS_MAPA.EXIGIR_TOKEN = 'true';
  assert.strictEqual(ctx.nfDiag('').error, 'TOKEN_INVALIDO');
});
t('para o administrador a lista sai — sem as sessões nem a fila da auditoria', () => {
  preparar([]);
  PROPS_MAPA.EXIGIR_TOKEN = 'true';
  PROPS_MAPA.USUARIOS = '{"Leonardo":{"senha":"hash-da-senha","perfil":"admin"}}';
  PROPS_MAPA.AUDQ_1725000000000_1_abc = '{"acao":"LOGIN"}';
  const doOutro = ctx.sessaoCriar('Wallace', 'engenharia', []);
  const meu = ctx.sessaoCriar('Leonardo', 'admin', []);
  const r = ctx.nfDiag(meu);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.propriedades.indexOf('GEMINI_API_KEY') !== -1, r.propriedades);
  assert.ok(r.propriedades.indexOf('USUARIOS') !== -1, r.propriedades);
  assert.ok(r.propriedades.indexOf('SES_') === -1, 'vazou sessão: ' + r.propriedades);
  assert.ok(r.propriedades.indexOf(doOutro) === -1 && r.propriedades.indexOf(meu) === -1, 'vazou token');
  assert.ok(r.propriedades.indexOf('AUDQ_') === -1, 'vazou a fila da auditoria: ' + r.propriedades);
  const inteiro = JSON.stringify(r);
  assert.ok(inteiro.indexOf('chave-de-teste') === -1, 'vazou o VALOR da chave da IA');
  assert.ok(inteiro.indexOf('hash-da-senha') === -1, 'vazou a senha');
});

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
