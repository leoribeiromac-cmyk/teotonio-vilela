// A FOTO SEM CARIMBO — o lado do servidor
//
// O carimbo é queimado na imagem no APARELHO, antes do upload: é o que faz a
// foto valer como prova onde quer que ela vá parar, mas é também o que
// apagava para sempre a versão limpa — a que serve para relatório, ofício e
// apresentação. Agora o app manda as duas, e o servidor guarda as duas na
// mesma pasta privada, com o ponteiro da planilha carregando o par.
//
// O que este teste cobra, porque errar aqui é perder prova ou perder a foto:
//   • as duas versões viram DOIS arquivos, e o ponteiro traz os dois ids;
//   • o app antigo (que só manda a carimbada) continua funcionando igual;
//   • o app NOVO lendo ponteiro VELHO, e o app VELHO lendo ponteiro NOVO,
//     acham a foto carimbada — é o que segura o celular do canteiro que
//     ainda não recarregou;
//   • o reenvio da fila offline não duplica nem uma nem outra;
//   • falhar ao gravar a limpa NÃO pode derrubar a carimbada, que é a prova.
//
// Roda sem dependência externa:  node tests/foto-limpa-servidor.test.js
const vm = require('vm');
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

const CARIMBADA = 'data:image/jpeg;base64,' + Buffer.from('foto-com-carimbo-queimado').toString('base64');
const LIMPA     = 'data:image/jpeg;base64,' + Buffer.from('a-mesma-foto-sem-a-tarja--').toString('base64');

// ---------------- planilha falsa ----------------
function Aba(cab, linhas) {
  const dados = [cab.slice(), ...linhas.map(l => l.slice())];
  return {
    dados,
    getLastColumn: () => dados[0].length,
    getLastRow: () => dados.length,
    getDataRange: () => ({ getValues: () => dados }),
    appendRow(l) { dados.push(l.slice()); },
    getRange(r, c) {
      return {
        setValue(v) {
          while (dados.length < r) dados.push(new Array(dados[0].length).fill(''));
          while (dados[r - 1].length < c) dados[r - 1].push('');
          dados[r - 1][c - 1] = v;
        },
        getValues: () => [[(dados[r - 1] || [])[c - 1] ?? '']],
        setValues(v) { v.forEach((row, i) => row.forEach((val, j) => { dados[r - 1 + i][c - 1 + j] = val; })); }
      };
    }
  };
}
const ABAS = {
  RDO_Avanco: Aba(['id', 'data', 'turno', 'obra', 'pacote_id', 'quantidade'],
    [['svc-1', '2026-08-27', 'Diurno', 'teotonio', 'P26', 10]])
};

// ---------------- Drive falso ----------------
// Guarda bytes e nome de verdade: sem isso não dá para provar que a limpa é
// OUTRO arquivo, nem que o reenvio reaproveitou em vez de criar.
const PASTAS = {};
let _seq = 0, FALHAR_A_PARTIR_DE = null;
function pastaFalsa(nome) {
  const p = {
    nome, arquivos: [],
    getName: () => nome,
    createFile(blob) {
      if (FALHAR_A_PARTIR_DE && blob.nome.indexOf(FALHAR_A_PARTIR_DE) !== -1) {
        throw new Error('cota do Drive estourada');
      }
      const a = { id: 'drv' + (++_seq), nome: blob.nome, bytes: blob.bytes, lixo: false,
                  getId() { return this.id; }, getName() { return this.nome; },
                  getSize() { return this.bytes.length; }, isTrashed() { return this.lixo; },
                  setSharing() { return this; } };
      p.arquivos.push(a);
      return a;
    },
    getFilesByName(n) {
      const achados = p.arquivos.filter(a => a.nome === n);
      let i = 0;
      return { hasNext: () => i < achados.length, next: () => achados[i++] };
    }
  };
  return p;
}

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: n => ABAS[n] || null, insertSheet: n => (ABAS[n] = Aba([], [])) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    formatDate: (d) => new Date(d).toISOString().slice(0, 10),
    base64Decode: (b64) => Buffer.from(String(b64), 'base64'),
    newBlob: (bytes, tipo, nome) => ({ bytes, tipo, nome }),
    sleep() {}
  },
  Session: { getScriptTimeZone: () => 'UTC' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  DriveApp: {
    Access: { PRIVATE: 'PRIVATE' }, Permission: { NONE: 'NONE' },
    getFoldersByName(n) {
      let usado = false;
      return { hasNext: () => !!PASTAS[n] && !usado, next: () => { usado = true; return PASTAS[n]; } };
    },
    createFolder: (n) => (PASTAS[n] = pastaFalsa(n))
  },
  UrlFetchApp: {}, MailApp: {}, ScriptApp: {}, XmlService: {}
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };

const pasta = () => PASTAS[ctx.PASTA_FOTOS] || { arquivos: [] };
function ponteiroDaLinha(id) {
  const cab = ABAS.RDO_Avanco.dados[0].map(c => String(c).toLowerCase());
  const i = cab.indexOf('foto_link');
  const linha = ABAS.RDO_Avanco.dados.find((l, n) => n > 0 && String(l[cab.indexOf('id')]).trim() === id);
  return i === -1 || !linha ? '' : String(linha[i] || '');
}

console.log('A FOTO SEM CARIMBO — SERVIDOR\n');

let r1;
t('as duas versões viram DOIS arquivos na pasta privada', () => {
  r1 = ctx.rdoFoto({ id: 'svc-1', obra: 'teotonio', idx: 0,
                     foto: CARIMBADA, fotoLimpa: LIMPA, clientId: 'c-a' });
  assert.ok(r1.ok, JSON.stringify(r1));
  assert.strictEqual(pasta().arquivos.length, 2, 'esperava carimbada + limpa');
  const nomes = pasta().arquivos.map(a => a.nome);
  assert.ok(nomes.some(n => /_limpa\.jpg$/.test(n)), 'a limpa não foi gravada: ' + nomes);
  assert.ok(nomes.some(n => !/_limpa\.jpg$/.test(n)), 'a carimbada não foi gravada: ' + nomes);
});

t('e são de fato imagens DIFERENTES (a limpa não é cópia da carimbada)', () => {
  const [a, b] = pasta().arquivos;
  assert.notStrictEqual(a.bytes.toString(), b.bytes.toString());
});

t('o ponteiro da planilha carrega as duas: drive_id:<carimbada>|<limpa>', () => {
  assert.strictEqual(r1.url, 'drive_id:' + r1.fileId + '|' + r1.fileIdLimpa);
  assert.ok(r1.fileIdLimpa, 'não devolveu o id da limpa');
  assert.strictEqual(ponteiroDaLinha('svc-1'), r1.url);
});

/* O aparelho que ainda não recarregou o app manda só `foto` — e é o caso
   mais comum no dia da publicação, com o celular do apontador em campo. */
t('app antigo (sem fotoLimpa) grava um arquivo só e o ponteiro simples', () => {
  const antes = pasta().arquivos.length;
  const r = ctx.rdoFoto({ id: 'svc-1', obra: 'teotonio', idx: 1, foto: CARIMBADA, clientId: 'c-b' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(pasta().arquivos.length, antes + 1);
  assert.strictEqual(r.url, 'drive_id:' + r.fileId);
  assert.strictEqual(r.fileIdLimpa, '');
});

t('reenvio da fila offline não duplica nem a carimbada nem a limpa', () => {
  const antes = pasta().arquivos.length;
  const r = ctx.rdoFoto({ id: 'svc-1', obra: 'teotonio', idx: 0,
                          foto: CARIMBADA, fotoLimpa: LIMPA, clientId: 'c-a' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(pasta().arquivos.length, antes, 'criou arquivo repetido no Drive');
  assert.strictEqual(r.fileId, r1.fileId);
  assert.strictEqual(r.fileIdLimpa, r1.fileIdLimpa);
  const ponteiros = ponteiroDaLinha('svc-1').split(/\s+/).filter(Boolean);
  assert.strictEqual(ponteiros.filter(x => x === r1.url).length, 1, 'ponteiro repetido na linha');
});

/* A prova é a CARIMBADA. Se o Drive recusar a limpa (cota, tempo), o serviço
   não pode ficar sem foto nenhuma por causa da versão de enfeite. */
t('falhar ao gravar a limpa não derruba a carimbada', () => {
  FALHAR_A_PARTIR_DE = '_limpa.jpg';
  const r = ctx.rdoFoto({ id: 'svc-1', obra: 'teotonio', idx: 7,
                          foto: CARIMBADA, fotoLimpa: LIMPA, clientId: 'c-cota' });
  FALHAR_A_PARTIR_DE = null;
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.fileId, 'perdeu a carimbada');
  assert.strictEqual(r.fileIdLimpa, '');
  assert.strictEqual(r.url, 'drive_id:' + r.fileId);
});

t('fotoLimpa que não é imagem é ignorada, sem virar arquivo', () => {
  const antes = pasta().arquivos.length;
  const r = ctx.rdoFoto({ id: 'svc-1', obra: 'teotonio', idx: 8,
                          foto: CARIMBADA, fotoLimpa: 'sei-la-o-que', clientId: 'c-lixo' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.fileIdLimpa, '');
  assert.strictEqual(pasta().arquivos.length, antes + 1, 'gravou lixo como imagem');
});

/* A regra dos dois lados: o `|` foi escolhido porque o `[\w-]+` do
   `fotoFileId` do app PARA nele. Este teste guarda o formato do ponteiro
   contra uma mudança distraída aqui no servidor. */
t('o ponteiro novo continua legível pelo leitor do app ANTIGO', () => {
  const comoOAppAntigoLia = (v) => {
    const m = String(v).match(/^drive_id:([\w-]+)/);
    return m ? m[1] : '';
  };
  assert.strictEqual(comoOAppAntigoLia(r1.url), r1.fileId);
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
