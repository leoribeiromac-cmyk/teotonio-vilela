// A ASSINATURA ONLINE DO RDO — o lado do servidor
//
// O engenheiro e o fiscal assinam o RDO por um LINK que chega no e-mail das
// 8h. Não há login: o token do link é a credencial. Isso põe todo o peso da
// segurança neste arquivo — um token previsível, um link que vale pelo do
// outro, ou uma assinatura que pode ser reescrita depois de dada, e o que
// se perde é a validade de um documento que a fiscalização arquiva.
//
// Como o Apps Script não roda fora do Google, o Code.gs é carregado numa VM
// com planilha, Drive, Gmail e Propriedades FALSOS. Assim dá para forçar o
// que a obra ainda não viveu: o link vencido, o fiscal apertando "assinar"
// duas vezes num sinal ruim, o engenheiro tentando assinar pelo link do
// fiscal, a assinatura que chega depois de o RDO já ter saído.
//
// Roda sem dependência externa:  node tests/rdo-assinatura-servidor.test.js
const vm = require('vm');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

const HOJE = '2026-08-24';           // uma segunda-feira
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
const uriPdf = () => 'data:application/pdf;base64,' + PDF.toString('base64');
// um PNG mínimo de verdade — é o que a página de assinatura manda
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const uriPng = () => 'data:image/png;base64,' + PNG.toString('base64');

// ---------------- Drive falso ----------------
const DRIVE = { pastas: {}, arquivosPorId: {}, seq: 0 };
function arquivoFalso(nome, bytes, tipo, pasta) {
  const id = 'file' + (++DRIVE.seq);
  const a = {
    _nome: nome, _bytes: bytes, _tipo: tipo || 'application/pdf', _lixo: false, _desc: '', _pasta: pasta,
    getId: () => id,
    getName() { return this._nome; },
    getSize() { return this._bytes.length; },
    isTrashed() { return this._lixo; },
    setTrashed(v) { this._lixo = v; return this; },
    setDescription(d) { this._desc = d; return this; },
    getDescription() { return this._desc; },
    setSharing() { return this; },
    getBlob() {
      const self = this;
      return { _n: self._nome, getName() { return this._n; },
               setName(n) { this._n = n; return this; },
               getBytes: () => self._bytes, getContentType: () => self._tipo };
    },
  };
  DRIVE.arquivosPorId[id] = a;
  return a;
}
function pastaFalsa(nome) {
  const p = {
    nome, arquivos: [],
    setSharing: () => p,
    createFile(blob) {
      const a = arquivoFalso(blob.getName(), blob.getBytes(),
                             blob.getContentType && blob.getContentType(), p);
      p.arquivos.push(a);
      return a;
    },
    getFilesByName(n) {
      const achados = p.arquivos.filter(a => a._nome === n);
      let i = 0;
      return { hasNext: () => i < achados.length, next: () => achados[i++] };
    },
  };
  return p;
}
const DriveApp = {
  Access: { PRIVATE: 'PRIVATE' }, Permission: { NONE: 'NONE' },
  getFoldersByName(n) {
    const p = DRIVE.pastas[n];
    let usado = false;
    return { hasNext: () => !!p && !usado, next: () => { usado = true; return p; } };
  },
  createFolder(n) { return (DRIVE.pastas[n] = pastaFalsa(n)); },
  getFileById(id) {
    const a = DRIVE.arquivosPorId[id];
    if (!a) throw new Error('arquivo não existe');
    return a;
  },
};

// ---------------- planilha falsa ----------------
// Grava de verdade: o convite tem de continuar existindo (com o MESMO token)
// de uma chamada para a outra, e a assinatura tem de continuar gravada.
const PLANILHA = { RDO_Diario: [], RDO_Avanco: [], RDO_Assinaturas: [], Auditoria: [] };
const CAB_DIARIO = ['id', 'data', 'obra', 'numero_rdo', 'clima_manha', 'clima_tarde', 'clima_noite',
                    'apontador_diurno', 'apontador_noturno', 'visitas', 'ocorrencias',
                    'observacoes_gerais', 'paralisacoes_json', 'paralisado_motivo', 'chuva_mm_auto'];
const CAB_AVANCO = ['id', 'data', 'obra', 'pacote_id', 'quantidade'];
const CAB_ASSIN = ['id', 'obra', 'data', 'papel', 'rotulo', 'nome', 'email', 'token', 'status',
                   'convidadoEm', 'assinadoEm', 'assinatura', 'nomeAssinante', 'documento',
                   'agente', 'observacao'];
const CAB_AUDIT = ['carimbo', 'usuario', 'perfil', 'acao', 'obra', 'registroId',
                   'detalhesAnteriores', 'detalhesNovos'];

function abaFalsa(nome, cab, linhas) {
  return {
    getName: () => nome,
    getDataRange: () => ({ getValues: () => [cab].concat(linhas) }),
    getRange(l, c, nl, nc) {
      return {
        setValue(v) { if (l > 1 && linhas[l - 2]) linhas[l - 2][c - 1] = v; },
        setValues(vals) {
          if (l <= 1) return;
          vals.forEach((v, k) => { linhas[l - 2 + k] = v.slice(); });
        },
        getValues: () => [cab],
      };
    },
    getLastColumn: () => cab.length,
    getLastRow: () => linhas.length + 1,
    appendRow(l) { linhas.push(l.slice()); },
  };
}
const ABAS_FALSAS = {
  RDO_Diario: () => abaFalsa('RDO_Diario', CAB_DIARIO, PLANILHA.RDO_Diario),
  RDO_Avanco: () => abaFalsa('RDO_Avanco', CAB_AVANCO, PLANILHA.RDO_Avanco),
  RDO_Assinaturas: () => abaFalsa('RDO_Assinaturas', CAB_ASSIN, PLANILHA.RDO_Assinaturas),
  Auditoria: () => abaFalsa('Auditoria', CAB_AUDIT, PLANILHA.Auditoria),
};
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getId: () => 'planilha', getName: () => 'Planilha',
    getSheetByName: (n) => (ABAS_FALSAS[n] ? ABAS_FALSAS[n]() : null),
    insertSheet: (n) => (ABAS_FALSAS[n] ? ABAS_FALSAS[n]() : abaFalsa(n, [], [])),
  }),
};

// ---------------- Gmail falso ----------------
const CORREIO = { enviados: [], cota: 100 };
const MailApp = {
  getRemainingDailyQuota: () => CORREIO.cota,
  sendEmail(a, b, c) {
    CORREIO.enviados.push(typeof a === 'object' ? a : { to: a, subject: b, body: c, simples: true });
  },
};

const _props = {};
const PROPS = {
  getProperty: k => (k in _props ? _props[k] : null),
  setProperty: (k, v) => { _props[k] = String(v); },
  deleteProperty: k => { delete _props[k]; },
  getProperties: () => ({ ..._props }),
};

function fmt(d, tz, padrao) {
  const dt = new Date(d);
  const p = n => String(n).padStart(2, '0');
  return String(padrao)
    .replace('yyyy', dt.getFullYear()).replace('MM', p(dt.getMonth() + 1))
    .replace('dd', p(dt.getDate())).replace('HH', p(dt.getHours()))
    .replace('mm', p(dt.getMinutes())).replace('ss', p(dt.getSeconds()));
}

let _uuid = 0;
const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt,
  RegExp, Error, encodeURIComponent, decodeURIComponent,
  SpreadsheetApp, DriveApp, MailApp,
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    formatDate: fmt, sleep() {}, getUuid: () => 'uuid-' + (++_uuid),
    base64Decode: s => Buffer.from(String(s), 'base64'),
    base64Encode: b => Buffer.from(b).toString('base64'),
    newBlob: (bytes, tipo, nome) => ({
      _n: nome, getName() { return this._n; }, setName(n) { this._n = n; return this; },
      getBytes: () => bytes, getContentType: () => tipo,
    }),
    // O digest de verdade: é ele que dá ao token a cara de sorteado.
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (alg, txt) => Array.from(
      require('crypto').createHash('sha256').update(String(txt)).digest()
    ).map(b => (b > 127 ? b - 256 : b)),
  },
  Session: { getScriptTimeZone: () => 'America/Sao_Paulo',
             getEffectiveUser: () => ({ getEmail: () => 'dono@gestorengenharia.com.br' }) },
  PropertiesService: { getScriptProperties: () => PROPS },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 500, getContentText: () => '' }) },
  ScriptApp: { getProjectTriggers: () => [],
               newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
  XmlService: {},
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });

function linhaDiario(extra) {
  const base = {
    id: 'D0128', data: HOJE, obra: 'teotonio', numero_rdo: '128',
    clima_manha: 'Bom', clima_tarde: 'Chuva', clima_noite: '',
    apontador_diurno: 'Carlos Apontador', apontador_noturno: '',
    visitas: '', ocorrencias: 'Sem ocorrências.', observacoes_gerais: '',
    paralisacoes_json: '', paralisado_motivo: '', chuva_mm_auto: '',
  };
  Object.assign(base, extra || {});
  return CAB_DIARIO.map(c => base[c]);
}

function limpar() {
  Object.keys(_props).forEach(k => delete _props[k]);
  DRIVE.pastas = {}; DRIVE.arquivosPorId = {}; DRIVE.seq = 0;
  PLANILHA.RDO_Diario = [linhaDiario()];
  PLANILHA.RDO_Avanco = [['A1', HOJE, 'teotonio', 'P01', 10]];
  PLANILHA.RDO_Assinaturas = [];
  PLANILHA.Auditoria = [];
  CORREIO.enviados = []; CORREIO.cota = 100;
}

let falhas = 0;
const t = (nome, fn) => {
  limpar();
  try { fn(); console.log('  ✓ ' + nome); }
  catch (e) { falhas++; console.log('  ✗ ' + nome + '  → ' + (e && e.message ? e.message : e)); }
};
const eq = (a, b, msg) => {
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'esperava ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
};
const verdade = (c, msg) => { if (!c) throw new Error(msg || 'esperava verdadeiro'); };

const depositar = (extra) => ctx.rdoPdfDoDia(Object.assign(
  { action: 'rdoPdfDoDia', obra: 'teotonio', data: HOJE, numero_rdo: '128', pdf: uriPdf() }, extra || {}));
const convites = (data) => ctx.rdoAssinaturasGarantir_('teotonio', data || HOJE);
const tokenDe = (papel, data) => {
  const c = convites(data).filter(x => x.papel === papel)[0];
  return c ? c.token : '';
};
const assinar = (papel, extra) => ctx.rdoAssinaturaGravar(Object.assign(
  { t: tokenDe(papel), assinatura: uriPng(), nome: 'Fulano de Tal Assinante' }, extra || {}));
const paraLista = () => CORREIO.enviados.filter(e => !e.simples);
const paraDono = () => CORREIO.enviados.filter(e => e.simples);

console.log('\nASSINATURA ONLINE DO RDO — o lado do servidor\n');

console.log('Quem assina');
t('a lista do código vale quando não há Propriedade', () => {
  const a = ctx.rdoAssinantes();
  eq(a.length, 3, 'quantidade');
  eq(a.map(x => x.papel).join(','), 'engenheiro,fiscalizacao,supervisao', 'papéis e ordem');
});
t('a Propriedade RDO_ASSINANTES manda na lista do código', () => {
  PROPS.setProperty('RDO_ASSINANTES', JSON.stringify([
    { papel: 'engenheiro', rotulo: 'Eng.', email: 'eng@x.com' },
    { papel: 'fiscalizacao', rotulo: 'Fisc.', email: 'fis@y.com' }]));
  const a = ctx.rdoAssinantes();
  eq(a.length, 2);
  eq(a[1].email, 'fis@y.com');
});
t('JSON estragado na Propriedade cai na lista do código — o RDO não fica sem assinante', () => {
  PROPS.setProperty('RDO_ASSINANTES', 'isso não é json');
  eq(ctx.rdoAssinantes().length, 3);
});
t('assinante sem e-mail válido sai da lista — não teria como receber o link', () => {
  PROPS.setProperty('RDO_ASSINANTES', JSON.stringify([
    { papel: 'engenheiro', email: 'eng@x.com' },
    { papel: 'fiscalizacao', email: 'sem-arroba' }]));
  eq(ctx.rdoAssinantes().map(x => x.papel).join(','), 'engenheiro');
});
t('papel repetido entra uma vez só — dois quadros disputando o mesmo lugar no PDF', () => {
  PROPS.setProperty('RDO_ASSINANTES', JSON.stringify([
    { papel: 'engenheiro', email: 'a@x.com' },
    { papel: 'engenheiro', email: 'b@x.com' }]));
  eq(ctx.rdoAssinantes().length, 1);
});

console.log('\nO convite de cada um');
t('cria uma linha por assinante no dia', () => {
  const c = convites();
  eq(c.length, 3);
  eq(PLANILHA.RDO_Assinaturas.length, 3, 'linhas gravadas');
  verdade(c.every(x => x.status === 'pendente'), 'nasce pendente');
});
t('chamar de novo NÃO duplica nem sorteia outro token — o link do e-mail continua valendo', () => {
  const antes = convites().map(x => x.token).join(',');
  const depois = convites().map(x => x.token).join(',');
  eq(PLANILHA.RDO_Assinaturas.length, 3, 'linhas');
  eq(depois, antes, 'o token mudou entre duas chamadas');
});
t('cada assinante tem um token só dele, e longo', () => {
  const c = convites();
  const t1 = c.map(x => x.token);
  eq(new Set(t1).size, 3, 'tokens repetidos');
  verdade(t1.every(x => x.length >= 32), 'token curto: ' + t1[0]);
  verdade(t1.every(x => /^[0-9a-f]+$/.test(x)), 'token não é hexadecimal: ' + t1[0]);
});
t('cada DIA tem os seus tokens — o link de ontem não abre o RDO de hoje', () => {
  const a = tokenDe('fiscalizacao', HOJE);
  const b = tokenDe('fiscalizacao', '2026-08-25');
  verdade(a && b && a !== b, 'o mesmo token serviu para dois dias');
});
t('data sem sentido não gera convite nenhum', () => {
  eq(ctx.rdoAssinaturasGarantir_('teotonio', 'ontem').length, 0);
});

console.log('\nAbrir o link');
t('token inválido não abre nada', () => {
  const r = ctx.rdoAssinaturaAbrir({ t: 'a'.repeat(40) });
  verdade(!r.ok, 'abriu com token inventado');
});
t('token curto nem é procurado', () => {
  verdade(!ctx.rdoAssinaturaAbrir({ t: 'abc' }).ok);
});
t('o link abre o RDO daquele dia, com o PDF depositado', () => {
  depositar();
  const r = ctx.rdoAssinaturaAbrir({ t: tokenDe('fiscalizacao') });
  verdade(r.ok, 'não abriu: ' + JSON.stringify(r));
  eq(r.data, HOJE);
  eq(r.numeroRdo, '128');
  eq(r.papel, 'fiscalizacao');
  verdade(String(r.pdf || '').indexOf('data:application/pdf;base64,') === 0, 'sem o PDF');
  verdade(r.resumo.indexOf('Carlos Apontador') !== -1, 'sem o resumo do dia');
});
t('o link NUNCA devolve o token de quem quer que seja', () => {
  depositar();
  const tok = tokenDe('fiscalizacao');
  const r = ctx.rdoAssinaturaAbrir({ t: tok });
  const inteiro = JSON.stringify(r);
  convites().forEach(c => {
    verdade(inteiro.indexOf(c.token) === -1, 'vazou o token de ' + c.papel);
  });
  eq(r.codigo, tok.slice(0, 8).toUpperCase(), 'o código curto é o que aparece');
});
t('dia sem PDF depositado: avisa, em vez de mandar assinar um quadro vazio', () => {
  const r = ctx.rdoAssinaturaAbrir({ t: tokenDe('engenheiro') });
  verdade(r.ok);
  verdade(r.semPdf, 'não avisou que falta o PDF');
  verdade(!r.pdf, 'mandou PDF que não existe');
});
t('mostra o andamento das outras assinaturas, sem token nenhum', () => {
  assinar('engenheiro', { nome: 'Paulo Engenheiro' });
  const r = ctx.rdoAssinaturaAbrir({ t: tokenDe('fiscalizacao') });
  const eng = r.outras.filter(x => x.papel === 'engenheiro')[0];
  verdade(eng.assinada, 'não viu a assinatura do engenheiro');
  eq(eng.nomeAssinante, 'Paulo Engenheiro');
});

console.log('\nAssinar');
t('grava o traço, o nome e a hora', () => {
  const r = assinar('fiscalizacao', { nome: 'Walter Fiscal', documento: 'CREA 123' });
  verdade(r.ok, 'não gravou: ' + JSON.stringify(r));
  verdade(!!r.assinadoEm, 'sem a hora');
  const l = ctx.rdoAssinLinhasDoDia_('teotonio', HOJE).filter(x => x.papel === 'fiscalizacao')[0];
  eq(l.status, 'assinada');
  eq(l.nomeAssinante, 'Walter Fiscal');
  eq(l.documento, 'CREA 123');
  verdade(String(l.assinatura).indexOf('drive_id:') === 0, 'a imagem não virou ponteiro do Drive');
});
t('a imagem vai para o Drive, não para a célula', () => {
  assinar('fiscalizacao');
  const pasta = DRIVE.pastas['Assinaturas do RDO (Teotônio Privado)'];
  verdade(!!pasta && pasta.arquivos.length === 1, 'a assinatura não foi para a pasta privada');
  const celula = PLANILHA.RDO_Assinaturas.map(l => l.join('')).join('');
  verdade(celula.indexOf('base64') === -1, 'base64 numa célula estoura a planilha');
});
t('recusa o que não é PNG', () => {
  verdade(!assinar('fiscalizacao', { assinatura: 'data:image/jpeg;base64,AAAA' }).ok);
  verdade(!assinar('fiscalizacao', { assinatura: '' }).ok);
});
t('recusa assinatura sem nome de quem assina', () => {
  const r = assinar('fiscalizacao', { nome: 'Zé' });
  verdade(!r.ok, 'aceitou nome de duas letras');
});
t('o PAPEL vem da linha, não do que o cliente mandou — ninguém assina no lugar do outro', () => {
  assinar('fiscalizacao', { nome: 'Walter Fiscal', papel: 'engenheiro', rotulo: 'Engenheiro' });
  const l = ctx.rdoAssinLinhasDoDia_('teotonio', HOJE);
  eq(l.filter(x => x.papel === 'fiscalizacao')[0].status, 'assinada', 'fiscalização');
  eq(l.filter(x => x.papel === 'engenheiro')[0].status, 'pendente', 'engenheiro');
});
t('apertar duas vezes no sinal ruim NÃO reescreve a assinatura já dada', () => {
  const um = assinar('fiscalizacao', { nome: 'Walter Fiscal' });
  const dois = ctx.rdoAssinaturaGravar({ t: tokenDe('fiscalizacao'), assinatura: uriPng(),
                                         nome: 'Outra Pessoa Qualquer' });
  verdade(dois.ok, 'a segunda tentativa virou erro na cara de quem assinou');
  verdade(dois.jaAssinada, 'não disse que já estava assinada');
  eq(dois.assinadoEm, um.assinadoEm, 'trocou a hora de uma assinatura já dada');
  const l = ctx.rdoAssinLinhasDoDia_('teotonio', HOJE).filter(x => x.papel === 'fiscalizacao')[0];
  eq(l.nomeAssinante, 'Walter Fiscal', 'trocou o nome de uma assinatura já dada');
});
t('diz quantas assinaturas ainda faltam', () => {
  eq(assinar('engenheiro').faltam, 2);
  eq(assinar('fiscalizacao').faltam, 1);
  eq(assinar('supervisao').faltam, 0);
});
t('o escritório é avisado a cada assinatura — é ele que repõe o PDF assinado', () => {
  assinar('engenheiro', { nome: 'Paulo Engenheiro' });
  eq(paraDono().length, 1);
  verdade(paraDono()[0].subject.indexOf('assinado por') !== -1, paraDono()[0].subject);
});

console.log('\nO link tem prazo');
t('convite velho não assina mais', () => {
  convites();
  // envelhece o convite na planilha: 90 dias atrás
  const iConv = CAB_ASSIN.indexOf('convidadoEm');
  const velho = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const iso = velho.getFullYear() + '-' + String(velho.getMonth() + 1).padStart(2, '0') +
              '-' + String(velho.getDate()).padStart(2, '0');
  PLANILHA.RDO_Assinaturas.forEach(l => { l[iConv] = iso + ' 08:00:00'; });
  const r = assinar('fiscalizacao');
  verdade(!r.ok && r.vencido, 'assinou com link vencido: ' + JSON.stringify(r));
  verdade(!ctx.rdoAssinaturaAbrir({ t: tokenDe('fiscalizacao') }).ok, 'o link vencido ainda abre');
});
t('a Propriedade RDO_ASSINATURA_DIAS estica o prazo', () => {
  PROPS.setProperty('RDO_ASSINATURA_DIAS', '365');
  convites();
  const iConv = CAB_ASSIN.indexOf('convidadoEm');
  const velho = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const iso = velho.getFullYear() + '-' + String(velho.getMonth() + 1).padStart(2, '0') +
              '-' + String(velho.getDate()).padStart(2, '0');
  PLANILHA.RDO_Assinaturas.forEach(l => { l[iConv] = iso + ' 08:00:00'; });
  verdade(assinar('fiscalizacao').ok, 'não assinou com o prazo esticado');
});

console.log('\nO link pessoal no e-mail das 8h');
t('cada assinante recebe o SEU link, e só o dele', () => {
  depositar();
  ctx.reenviarRDOPorEmail(HOJE);
  const porEmail = {};
  paraLista().forEach(e => { porEmail[e.to] = e; });
  const c = convites();
  c.forEach(a => {
    const meu = porEmail[a.email];
    verdade(!!meu, 'ninguém escreveu para ' + a.email);
    verdade(meu.htmlBody.indexOf(a.token) !== -1, 'o link de ' + a.papel + ' não foi no e-mail dele');
    // e o token de um não pode aparecer no e-mail de outro
    c.filter(o => o.papel !== a.papel).forEach(o => {
      verdade(meu.htmlBody.indexOf(o.token) === -1,
              'o link de ' + o.papel + ' vazou no e-mail de ' + a.papel);
    });
  });
});
t('a cópia do escritório recebe o RDO sem link de assinatura nenhum', () => {
  depositar();
  ctx.reenviarRDOPorEmail(HOJE);
  const assinantes = ctx.rdoAssinantes().map(a => a.email.toLowerCase());
  const copias = paraLista().filter(e => assinantes.indexOf(String(e.to).toLowerCase()) === -1);
  verdade(copias.length >= 1, 'esperava ao menos uma cópia sem link');
  copias.forEach(e => {
    verdade(e.htmlBody.indexOf('assinar.html') === -1, 'link de assinatura na cópia do escritório');
  });
});
t('o e-mail mostra o andamento das assinaturas para todo mundo', () => {
  depositar();
  assinar('engenheiro', { nome: 'Paulo Engenheiro' });
  ctx.reenviarRDOPorEmail(HOJE);
  verdade(paraLista()[0].body.indexOf('Paulo Engenheiro') !== -1,
          'o corpo não diz quem já assinou');
  verdade(paraLista()[0].body.indexOf('pendente') !== -1, 'o corpo não diz quem falta');
});
t('quem já assinou não recebe o botão de assinar de novo', () => {
  depositar();
  assinar('engenheiro', { nome: 'Paulo Engenheiro' });
  ctx.reenviarRDOPorEmail(HOJE);
  const eng = ctx.rdoAssinantes().filter(a => a.papel === 'engenheiro')[0];
  const dele = paraLista().filter(e => e.to === eng.email)[0];
  verdade(dele.htmlBody.indexOf('assinar.html') === -1, 'mandou link para quem já assinou');
  verdade(dele.htmlBody.indexOf('já assinou') !== -1, 'não reconheceu quem já assinou');
});
t('a Propriedade RDO_SITE_URL manda no endereço do link', () => {
  PROPS.setProperty('RDO_SITE_URL', 'https://obra.exemplo.com.br/app/');
  verdade(ctx.rdoAssinaturaLink_('abc123').indexOf(
    'https://obra.exemplo.com.br/app/assinar.html?t=abc123') === 0,
    ctx.rdoAssinaturaLink_('abc123'));
});

console.log('\nO PDF assinado de volta para a fiscalização');
t('o depósito guarda quantas firmas o PDF já traz desenhadas', () => {
  depositar({ assinaturas: '2' });
  eq(ctx.rdoPdfAssinaturasNoDeposito_('teotonio', HOJE), 2);
});
t('depósito sem o campo conta zero — versão velha do app não mente sobre firma', () => {
  depositar();
  eq(ctx.rdoPdfAssinaturasNoDeposito_('teotonio', HOJE), 0);
});
t('dia sem depósito devolve -1, que é diferente de "depositado sem firma"', () => {
  eq(ctx.rdoPdfAssinaturasNoDeposito_('teotonio', HOJE), -1);
});
t('o RDO assinado NÃO sai enquanto falta assinatura', () => {
  assinar('engenheiro');
  depositar({ assinaturas: '1' });
  eq(paraLista().length, 0, 'mandou o "assinado" com uma firma só');
});
t('o RDO assinado sai quando o depósito chega com todas as firmas', () => {
  assinar('engenheiro'); assinar('fiscalizacao'); assinar('supervisao');
  const r = depositar({ assinaturas: '3' });
  verdade(r.ok && r.assinadoEnviado, 'não mandou o RDO assinado: ' + JSON.stringify(r));
  eq(paraLista().length, 1, 'e-mails');
  verdade(paraLista()[0].subject.indexOf('ASSINADO') !== -1, paraLista()[0].subject);
  eq(paraLista()[0].attachments[0].getName(), 'RDO_128_2026_08_24_assinado.pdf');
  verdade(paraLista()[0].body.indexOf('cód.') !== -1, 'o corpo não traz os códigos das firmas');
});
t('e sai UMA vez só — o app redeposita a cada PDF gerado', () => {
  assinar('engenheiro'); assinar('fiscalizacao'); assinar('supervisao');
  depositar({ assinaturas: '3' });
  depositar({ assinaturas: '3' });
  eq(paraLista().length, 1);
});
t('reenviarRDOAssinado manda de novo, de propósito', () => {
  assinar('engenheiro'); assinar('fiscalizacao'); assinar('supervisao');
  depositar({ assinaturas: '3' });
  verdade(ctx.reenviarRDOAssinado(HOJE).ok);
  eq(paraLista().length, 2);
});
t('falha no e-mail do assinado não derruba o depósito do PDF', () => {
  assinar('engenheiro'); assinar('fiscalizacao'); assinar('supervisao');
  CORREIO.cota = 0;                       // o Gmail não vai deixar mandar
  const r = depositar({ assinaturas: '3' });
  verdade(r.ok, 'o depósito virou erro por causa do e-mail');
  verdade(!!ctx.rdoPdfArquivo_('teotonio', HOJE), 'o PDF não ficou guardado');
});

console.log('\nO que o app lê para desenhar as firmas');
t('devolve papel, imagem, código e link de cada um', () => {
  depositar({ assinaturas: '0' });
  assinar('engenheiro', { nome: 'Paulo Engenheiro' });
  const r = ctx.rdoAssinaturasDoDia({ obra: 'teotonio', data: HOJE });
  verdade(r.ok);
  eq(r.assinaturas.length, 3);
  eq(r.assinadas, 1);
  const eng = r.assinaturas.filter(x => x.papel === 'engenheiro')[0];
  eq(eng.status, 'assinada');
  eq(eng.nomeAssinante, 'Paulo Engenheiro');
  verdade(String(eng.imagem || '').indexOf('data:image/png;base64,') === 0, 'sem a imagem do traço');
  verdade(String(eng.link).indexOf('assinar.html?t=') !== -1, 'sem o link');
  eq(eng.codigo.length, 8, 'código curto');
});
t('diz quantas firmas o PDF depositado tem — é como o app sabe que precisa repor', () => {
  depositar({ assinaturas: '0' });
  assinar('engenheiro');
  const r = ctx.rdoAssinaturasDoDia({ obra: 'teotonio', data: HOJE });
  eq(r.assinadas, 1, 'assinadas');
  eq(r.noDeposito, 0, 'no depósito');
  verdade(r.assinadas !== r.noDeposito, 'o app precisa ver a diferença para repor o depósito');
});
t('imagem sumida do Drive não derruba a leitura — o nome e a hora continuam valendo', () => {
  assinar('engenheiro', { nome: 'Paulo Engenheiro' });
  DRIVE.arquivosPorId = {};                  // o arquivo evaporou
  const r = ctx.rdoAssinaturasDoDia({ obra: 'teotonio', data: HOJE });
  verdade(r.ok, 'a leitura caiu junto com a imagem');
  const eng = r.assinaturas.filter(x => x.papel === 'engenheiro')[0];
  eq(eng.nomeAssinante, 'Paulo Engenheiro');
  verdade(!eng.imagem, 'inventou uma imagem');
});
t('imagens: "0" devolve sem base64 — é o que a conferência do editor usa', () => {
  assinar('engenheiro');
  const r = ctx.rdoAssinaturasDoDia({ obra: 'teotonio', data: HOJE, imagens: '0' });
  verdade(!r.assinaturas.filter(x => x.papel === 'engenheiro')[0].imagem);
});
t('outra obra não tem assinatura online — a mesma trava do depósito', () => {
  const r = ctx.rdoAssinaturasDoDia({ obra: 'ranario', data: HOJE });
  eq(r.assinaturas.length, 0);
  verdade(!!r.indisponivel);
});
t('data inválida é recusada', () => {
  verdade(!ctx.rdoAssinaturasDoDia({ obra: 'teotonio', data: 'ontem' }).ok);
});

console.log('\nCancelar uma assinatura dada por engano');
t('sorteia um link novo e o antigo para de valer', () => {
  const antigo = tokenDe('fiscalizacao');
  assinar('fiscalizacao', { nome: 'Assinou no dia errado' });
  const r = ctx.rdoAssinaturaCancelar(HOJE, 'fiscalizacao', 'dia errado');
  verdade(r.ok, JSON.stringify(r));
  verdade(!ctx.rdoAssinaturaAbrir({ t: antigo }).ok, 'o link antigo ainda abre');
  const l = ctx.rdoAssinLinhasDoDia_('teotonio', HOJE).filter(x => x.papel === 'fiscalizacao')[0];
  eq(l.status, 'pendente');
  eq(l.nomeAssinante, '');
  verdade(String(l.observacao).indexOf('dia errado') !== -1, 'sem o motivo registrado');
  verdade(ctx.rdoAssinaturaAbrir({ t: l.token }).ok, 'o link novo não abre');
});
t('deixa rastro na auditoria', () => {
  assinar('fiscalizacao', { nome: 'Assinou no dia errado' });
  ctx.rdoAssinaturaCancelar(HOJE, 'fiscalizacao', 'dia errado');
  const acoes = PLANILHA.Auditoria.map(l => l[CAB_AUDIT.indexOf('acao')]);
  verdade(acoes.indexOf('rdoAssinaturaCancelar') !== -1, JSON.stringify(acoes));
});
t('cancelar o que não existe é erro, não estrago', () => {
  verdade(!ctx.rdoAssinaturaCancelar(HOJE, 'ninguem', 'x').ok);
});

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
