// O ENVIO AUTOMÁTICO DO RDO — o lado do servidor
//
// Este é o código que roda SOZINHO, todo dia, sem ninguém olhando: um
// gatilho de tempo do Apps Script pega o PDF que o app depositou e o manda
// para a fiscalização. Errar aqui não dá tela vermelha para ninguém — dá
// RDO que não chega, ou chega duas vezes, ou chega para quem não devia.
//
// Como o Apps Script não roda fora do Google, o Code.gs é carregado numa VM
// com Drive, planilha, Gmail e Propriedades FALSOS. Assim dá para forçar o
// que a obra ainda não viveu: domingo sem RDO, cota de e-mail estourada,
// endereço torto na lista, gatilho disparando duas vezes no mesmo dia.
//
// Roda sem dependência externa:  node tests/rdo-email-servidor.test.js
const vm = require('vm');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

const HOJE = '2026-08-24';           // uma segunda-feira
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
const uriPdf = () => 'data:application/pdf;base64,' + PDF.toString('base64');
// o que o jsPDF produz cru, que é o que um aparelho com o app velho em cache manda
const uriPdfJsPDF = () => 'data:application/pdf;filename=generated.pdf;base64,' + PDF.toString('base64');

// ---------------- Drive falso ----------------
const DRIVE = { pastas: {}, seq: 0 };
function arquivoFalso(nome, bytes, pasta) {
  const id = 'file' + (++DRIVE.seq);
  return {
    _nome: nome, _bytes: bytes, _lixo: false, _desc: '', _pasta: pasta,
    getId: () => id,
    getName() { return this._nome; },
    getSize() { return this._bytes.length; },
    isTrashed() { return this._lixo; },
    setTrashed(v) { this._lixo = v; return this; },
    setDescription(d) { this._desc = d; return this; },
    setSharing() { return this; },
    getBlob() {
      const self = this;
      return { _n: self._nome, getName() { return this._n; },
               setName(n) { this._n = n; return this; }, getBytes: () => self._bytes };
    },
  };
}
function pastaFalsa(nome) {
  const p = {
    nome, arquivos: [],
    setSharing: () => p,
    createFile(blob) {
      const a = arquivoFalso(blob.getName(), blob.getBytes(), p);
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
};

// ---------------- planilha falsa ----------------
const PLANILHA = { RDO_Diario: [], RDO_Avanco: [] };
const CAB_DIARIO = ['id', 'data', 'obra', 'numero_rdo', 'clima_manha', 'clima_tarde', 'clima_noite',
                    'apontador_diurno', 'apontador_noturno', 'visitas', 'ocorrencias',
                    'observacoes_gerais', 'paralisacoes_json', 'paralisado_motivo', 'chuva_mm_auto'];
const CAB_AVANCO = ['id', 'data', 'obra', 'pacote_id', 'quantidade'];

function abaFalsa(nome, cab, linhas) {
  return {
    getDataRange: () => ({ getValues: () => [cab].concat(linhas) }),
    getRange: () => ({ setValue() {}, setValues() {}, getValues: () => [cab] }),
    getLastColumn: () => cab.length, getLastRow: () => linhas.length + 1,
    appendRow() {}, getName: () => nome,
  };
}
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getId: () => 'planilha', getName: () => 'Planilha',
    getSheetByName(n) {
      if (n === 'RDO_Diario') return abaFalsa(n, CAB_DIARIO, PLANILHA.RDO_Diario);
      if (n === 'RDO_Avanco') return abaFalsa(n, CAB_AVANCO, PLANILHA.RDO_Avanco);
      return null;
    },
    insertSheet: (n) => abaFalsa(n, [], []),
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
    .replace('yyyy', dt.getFullYear())
    .replace('MM', p(dt.getMonth() + 1))
    .replace('dd', p(dt.getDate()))
    .replace('HH', p(dt.getHours()))
    .replace('mm', p(dt.getMinutes()))
    .replace('ss', p(dt.getSeconds()));
}

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp, Error,
  SpreadsheetApp, DriveApp, MailApp,
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    formatDate: fmt, sleep() {}, getUuid: () => 'uuid',
    base64Decode: s => Buffer.from(String(s), 'base64'),
    newBlob: (bytes, tipo, nome) => ({
      _n: nome, getName() { return this._n; }, setName(n) { this._n = n; return this; },
      getBytes: () => bytes, getContentType: () => tipo,
    }),
    DigestAlgorithm: {}, computeDigest: () => [],
  },
  Session: { getScriptTimeZone: () => 'America/Sao_Paulo',
             getEffectiveUser: () => ({ getEmail: () => 'dono@gestorengenharia.com.br' }) },
  PropertiesService: { getScriptProperties: () => PROPS },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 500, getContentText: () => '' }) },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
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
    visitas: 'Fiscalização SP Obras pela manhã', ocorrencias: 'Sem ocorrências.',
    observacoes_gerais: 'Concretagem liberada.', paralisacoes_json: '',
    paralisado_motivo: '', chuva_mm_auto: '',
  };
  Object.assign(base, extra || {});
  return CAB_DIARIO.map(c => base[c]);
}

function limpar() {
  Object.keys(_props).forEach(k => delete _props[k]);
  DRIVE.pastas = {}; DRIVE.seq = 0;
  PLANILHA.RDO_Diario = [linhaDiario()];
  PLANILHA.RDO_Avanco = [
    ['A1', HOJE, 'teotonio', 'P01', 10],
    ['A2', HOJE, 'teotonio', 'P02', 5],
    ['A3', '2026-08-23', 'teotonio', 'P01', 8],
    ['A4', HOJE, 'ranario', 'P01', 3],
  ];
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
const paraFiscalizacao = () => CORREIO.enviados.filter(e => !e.simples);
const paraDono = () => CORREIO.enviados.filter(e => e.simples);

console.log('\nENVIO AUTOMÁTICO DO RDO — o lado do servidor\n');

console.log('Para quem vai');
t('a lista do código vale quando não há Propriedade', () => {
  const d = ctx.rdoEmailDestinatarios();
  eq(d.length, 4, 'quantidade');
  verdade(d.every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)), 'todos válidos');
});
t('a Propriedade RDO_EMAILS manda na lista do código', () => {
  PROPS.setProperty('RDO_EMAILS', 'a@x.com, b@y.com.br');
  const d = ctx.rdoEmailDestinatarios();
  eq(d.join(','), 'a@x.com,b@y.com.br');
});
t('aceita vírgula, ponto-e-vírgula e quebra de linha', () => {
  PROPS.setProperty('RDO_EMAILS', 'a@x.com; b@y.com\nc@z.com');
  eq(ctx.rdoEmailDestinatarios().length, 3);
});
t('endereço torto é descartado sem derrubar os outros', () => {
  PROPS.setProperty('RDO_EMAILS', 'a@x.com, isso-nao-e-email, b@y.com');
  eq(ctx.rdoEmailDestinatarios().join(','), 'a@x.com,b@y.com');
});
t('o mesmo endereço repetido recebe uma vez só', () => {
  PROPS.setProperty('RDO_EMAILS', 'a@x.com, A@X.com');
  eq(ctx.rdoEmailDestinatarios().length, 1);
});

console.log('\nO depósito do PDF');
t('guarda o PDF do dia e responde o arquivo', () => {
  const r = depositar();
  verdade(r.ok, 'ok');
  const arq = ctx.rdoPdfArquivo_('teotonio', HOJE);
  verdade(!!arq, 'o arquivo do dia existe');
  eq(arq.getName(), 'RDO_teotonio_2026_08_24.pdf');
  eq(Buffer.from(arq.getBlob().getBytes()).slice(0, 5).toString(), '%PDF-');
});
t('aceita também o data URI cru do jsPDF (aparelho com app velho em cache)', () => {
  verdade(depositar({ pdf: uriPdfJsPDF() }).ok);
  verdade(!!ctx.rdoPdfArquivo_('teotonio', HOJE));
});
t('recusa o que não é PDF', () => {
  verdade(!depositar({ pdf: 'data:image/jpeg;base64,AAAA' }).ok);
  verdade(!depositar({ pdf: '' }).ok);
});
t('recusa data inválida', () => { verdade(!depositar({ data: 'ontem' }).ok); });
t('aceita a data em dd/mm/aaaa e guarda no formato do dia', () => {
  verdade(depositar({ data: '24/08/2026' }).ok);
  verdade(!!ctx.rdoPdfArquivo_('teotonio', HOJE), 'achou pelo ISO');
});
t('o RDO corrigido SUBSTITUI o depósito do dia — não fica um par de PDFs', () => {
  depositar();
  depositar();
  const pasta = DRIVE.pastas['RDOs do dia em PDF (Teotônio Privado)'];
  const vivos = pasta.arquivos.filter(a => !a._lixo && a._nome === 'RDO_teotonio_2026_08_24.pdf');
  eq(vivos.length, 1, 'arquivos vivos do dia');
});
t('depósito de outra obra é recusado — o e-mail é só da Teotônio', () => {
  const r = depositar({ obra: 'ranario' });
  verdade(!r.ok, 'aceitou o depósito de outra obra');
  verdade(!ctx.rdoPdfArquivo_('ranario', HOJE), 'guardou PDF de obra que não manda e-mail');
});
t('cada dia tem o seu arquivo', () => {
  depositar();
  depositar({ data: '2026-08-25' });
  verdade(!!ctx.rdoPdfArquivo_('teotonio', HOJE), 'dia 24');
  verdade(!!ctx.rdoPdfArquivo_('teotonio', '2026-08-25'), 'dia 25');
});

console.log('\nO envio');
t('manda o PDF do dia para toda a lista, com o resumo no corpo', () => {
  depositar();
  verdade(ctx.reenviarRDOPorEmail(HOJE).ok, 'enviou');
  eq(paraFiscalizacao().length, 1, 'um e-mail');
  const e = paraFiscalizacao()[0];
  eq(e.to.split(',').length, 4, 'destinatários');
  verdade(e.subject.indexOf('nº 128') !== -1, 'assunto sem o número: ' + e.subject);
  verdade(e.subject.indexOf('24/08/2026') !== -1, 'assunto sem a data: ' + e.subject);
  eq(e.attachments.length, 1, 'anexos');
  eq(e.attachments[0].getName(), 'RDO_128_2026_08_24.pdf');
  verdade(e.body.indexOf('Carlos Apontador') !== -1, 'corpo sem o apontador');
  verdade(e.body.indexOf('Chuva') !== -1, 'corpo sem o clima');
  verdade(e.body.indexOf('segunda-feira') !== -1, 'corpo sem o dia da semana');
});
t('conta só os serviços daquele dia e daquela obra', () => {
  depositar();
  ctx.reenviarRDOPorEmail(HOJE);
  verdade(paraFiscalizacao()[0].body.indexOf('Serviços lançados: 2') !== -1,
          'contagem errada no corpo');
});
t('as paralisações do dia entram no corpo', () => {
  PLANILHA.RDO_Diario = [linhaDiario({ paralisacoes_json: JSON.stringify({
    diurno: [{ motivo: 'Chuva', inicio: '14:00', fim: '17:00', obs: 'concretagem suspensa' }],
    noturno: [] }) })];
  depositar();
  ctx.reenviarRDOPorEmail(HOJE);
  const b = paraFiscalizacao()[0].body;
  verdade(b.indexOf('Chuva · 14:00–17:00 · concretagem suspensa') !== -1, 'paralisação fora do corpo');
});
t('paralisação com JSON estragado não derruba o envio', () => {
  PLANILHA.RDO_Diario = [linhaDiario({ paralisacoes_json: '{isso não é json' })];
  depositar();
  verdade(ctx.reenviarRDOPorEmail(HOJE).ok);
  eq(paraFiscalizacao().length, 1);
});
t('o mesmo dia não é enviado duas vezes (gatilho repetido não repete o e-mail)', () => {
  depositar();
  ctx.reenviarRDOPorEmail(HOJE);
  const r2 = ctx.rdoEnviarPorEmail_(HOJE, 'teotonio', false);
  verdade(r2.ok, 'não é erro');
  eq(r2.pulado, 'já enviado');
  eq(paraFiscalizacao().length, 1, 'e-mails');
});
t('reenvio manual manda de novo, de propósito', () => {
  depositar();
  ctx.rdoEnviarPorEmail_(HOJE, 'teotonio', false);
  ctx.reenviarRDOPorEmail(HOJE);
  eq(paraFiscalizacao().length, 2);
});
t('dia sem PDF: a fiscalização não recebe nada, o dono é avisado', () => {
  const r = ctx.rdoEnviarPorEmail_(HOJE, 'teotonio', false);
  verdade(!r.ok, 'não deve dizer que enviou');
  eq(paraFiscalizacao().length, 0, 'nada para a fiscalização');
  eq(paraDono().length, 1, 'aviso para o dono');
  eq(paraDono()[0].to, 'dono@gestorengenharia.com.br');
  verdade(paraDono()[0].body.indexOf("reenviarRDOPorEmail('2026-08-24')") !== -1,
          'o aviso não ensina como remediar');
});
t('dia sem PDF não fica marcado como enviado — o reenvio de amanhã funciona', () => {
  ctx.rdoEnviarPorEmail_(HOJE, 'teotonio', false);
  verdade(!ctx.rdoEmailJaEnviado_('teotonio', HOJE));
});
t('lista vazia: não manda para ninguém e avisa o dono', () => {
  PROPS.setProperty('RDO_EMAILS', 'nada-aqui-presta');
  depositar();
  const r = ctx.rdoEnviarPorEmail_(HOJE, 'teotonio', false);
  verdade(!r.ok);
  eq(paraFiscalizacao().length, 0);
  eq(paraDono().length, 1);
});
t('cota de e-mail curta: não manda pela metade da lista', () => {
  depositar();
  CORREIO.cota = 2;                       // são 4 destinatários
  const r = ctx.rdoEnviarPorEmail_(HOJE, 'teotonio', false);
  verdade(!r.ok);
  eq(paraFiscalizacao().length, 0, 'não pode sair para uns e não para outros');
  eq(paraDono().length, 1, 'aviso para o dono');
  verdade(!ctx.rdoEmailJaEnviado_('teotonio', HOJE), 'não pode marcar como enviado');
});
t('RDO sem linha na planilha ainda vai — o PDF é o que importa', () => {
  PLANILHA.RDO_Diario = [];
  depositar();
  verdade(ctx.reenviarRDOPorEmail(HOJE).ok);
  eq(paraFiscalizacao().length, 1);
});
t('o e-mail é do dia certo mesmo com outra obra na mesma data', () => {
  PLANILHA.RDO_Diario = [linhaDiario(), linhaDiario({ id: 'D0500', obra: 'ranario', numero_rdo: '7',
                                                      apontador_diurno: 'Outro Apontador' })];
  depositar();
  ctx.reenviarRDOPorEmail(HOJE);
  const e = paraFiscalizacao()[0];
  verdade(e.subject.indexOf('nº 128') !== -1, 'pegou o RDO da outra obra: ' + e.subject);
  verdade(e.body.indexOf('Outro Apontador') === -1, 'vazou apontador da outra obra');
});

/* O gatilho da manhã leva o RDO de ONTEM — o dia que fechou. Às 10h o dia de
   hoje mal começou, e mandar o de hoje seria despachar para a fiscalização um
   relatório com meio turno dentro. Estes dois testes usam a data de verdade,
   que é o que prova que a conta do gatilho bate. */
const p2 = n => String(n).padStart(2, '0');
const diaDeVerdade = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const ONTEM_DE_VERDADE = diaDeVerdade(new Date(Date.now() - 24 * 3600 * 1000));
const HOJE_DE_VERDADE = diaDeVerdade(new Date());

t('o gatilho manda o RDO de ONTEM — a data que ele mesmo calcula', () => {
  PLANILHA.RDO_Diario = [linhaDiario({ data: ONTEM_DE_VERDADE })];
  depositar({ data: ONTEM_DE_VERDADE });
  const r = ctx.enviarRDODeOntemPorEmail();
  verdade(r.ok, 'não enviou: ' + JSON.stringify(r));
  eq(paraFiscalizacao().length, 1);
  eq(r.data, ONTEM_DE_VERDADE);
});
t('e NÃO manda o de hoje, que ainda está sendo preenchido', () => {
  PLANILHA.RDO_Diario = [linhaDiario({ data: HOJE_DE_VERDADE })];
  depositar({ data: HOJE_DE_VERDADE });          // só o de hoje está depositado
  const r = ctx.enviarRDODeOntemPorEmail();
  verdade(!r.ok, 'mandou o RDO de hoje: ' + JSON.stringify(r));
  eq(paraFiscalizacao().length, 0, 'nada para a fiscalização');
  eq(paraDono().length, 1, 'o dono é avisado de que ontem ficou sem RDO');
});
t('conferirEnvioRDOEmail() olha o dia que vai ser enviado, não o de hoje', () => {
  depositar({ data: ONTEM_DE_VERDADE });
  const d = ctx.conferirEnvioRDOEmail();
  verdade(d.proximo_envio_leva_o_RDO_de.indexOf(ONTEM_DE_VERDADE) === 0,
          'olhou o dia errado: ' + d.proximo_envio_leva_o_RDO_de);
  verdade(d.pdf_desse_dia_depositado, 'não viu o depósito de ontem');
  eq(d.hora_do_envio, '10h');
});

console.log('\nO registro do que já saiu');
t('o histórico não cresce sem fim (a Propriedade tem teto de 500 KB)', () => {
  for (let i = 1; i <= 80; i++) {
    const d = '2026-' + String(1 + Math.floor(i / 28)).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0');
    ctx.rdoEmailMarcar_('teotonio', d, ['a@x.com']);
  }
  const log = JSON.parse(PROPS.getProperty('RDO_EMAIL_LOG'));
  verdade(Object.keys(log).length <= 60, 'guardou ' + Object.keys(log).length + ' dias');
});
t('log estragado não impede o envio de hoje', () => {
  PROPS.setProperty('RDO_EMAIL_LOG', 'isso não é json');
  depositar();
  verdade(ctx.rdoEnviarPorEmail_(HOJE, 'teotonio', false).ok);
});

console.log('\nA hora do envio');
t('10h por padrão', () => { eq(ctx.rdoEmailHora(), 10); });
t('a Propriedade RDO_EMAIL_HORA troca a hora', () => {
  PROPS.setProperty('RDO_EMAIL_HORA', '17');
  eq(ctx.rdoEmailHora(), 17);
});
t('hora sem sentido volta para o padrão', () => {
  PROPS.setProperty('RDO_EMAIL_HORA', '99');
  eq(ctx.rdoEmailHora(), 10);
});

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
