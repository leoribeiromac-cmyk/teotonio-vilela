// O Code.gs de verdade, carregado num contexto com planilha, trava e
// propriedades FALSAS. Usado pelos testes de servidor e pelos testes .ui que
// precisam que a gravação passe pelas regras do servidor (a soma das partes
// do RDO, o mapa de chuva) em vez de uma resposta pronta.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function Aba(linhas) {
  const dados = linhas.map(l => l.slice());
  const largura = () => (dados[0] || []).length;
  return {
    dados,
    getLastColumn: () => largura(),
    getLastRow: () => dados.length,
    getDataRange: () => ({ getValues: () => dados.map(l => l.slice()) }),
    appendRow(l) { dados.push(l.slice()); },
    deleteRow(r) { dados.splice(r - 1, 1); },
    clearContents() { dados.length = 0; },
    getRange(r, c, nr, nc) {
      const garantir = (alvo) => {
        while (dados.length <= alvo) dados.push(new Array(largura()).fill(''));
      };
      return {
        setValue(v) {
          garantir(r - 1);
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
            garantir(alvo);
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

function criar(opts = {}) {
  const abas = {};
  const auditoria = [];
  const props = Object.assign({}, opts.props || {});
  const ctx = {
    console, JSON, String, Number, Object, Array, Math, Date, isNaN, isFinite, parseFloat, parseInt, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: n => abas[n] || null,
      insertSheet: n => (abas[n] = Aba([]))
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d) => new Date(d).toISOString().slice(0, 10), sleep() {},
                 getUuid: () => 'u', DigestAlgorithm: {}, computeDigest: () => [] },
    Session: { getScriptTimeZone: () => 'UTC' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
    Logger: { log: () => {} },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    DriveApp: {}, UrlFetchApp: {}, MailApp: {}, ScriptApp: {}, XmlService: {}
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'Code.gs' });
  ctx.registrarAuditoria = function () { auditoria.push([].slice.call(arguments)); };
  // Sessões falsas: token "tok-<usuario>[-<perfil>]".
  ctx.sessaoDoToken = function (t) {
    const m = /^tok-([^-]+)(?:-(\w+))?$/.exec(String(t || ''));
    return m ? { usuario: m[1], perfil: m[2] || 'campo', obras: '*' } : null;
  };
  return {
    ctx, abas, auditoria, props,
    aba(nome, linhas) { abas[nome] = Aba(linhas); return abas[nome]; },
  };
}

module.exports = { criar, Aba };
