// Testa a lógica multi-obra do Code.gs em Node, com uma planilha falsa.
// O que importa provar: (1) linha antiga sem obra continua sendo da Teotônio;
// (2) diário do Ranário NÃO sobrescreve o da Teotônio na mesma data e turno.
// (sem dependências externas: roda com `node tests/multiobra.test.js`)
const vm = require('vm');
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');

// ---------- planilha falsa ----------
function Aba(cab, linhas) {
  const dados = [cab.slice(), ...linhas.map(l => l.slice())];
  return {
    dados,
    getLastColumn: () => dados[0].length,
    getLastRow: () => dados.length,
    getDataRange: () => ({ getValues: () => dados }),
    appendRow(l) { dados.push(l.slice()); },
    getRange(r, c, nr, nc) {
      return {
        setValue(v) {
          while (dados.length < r) dados.push(new Array(dados[0].length).fill(''));
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
            while (dados.length <= alvo) dados.push(new Array(dados[0].length).fill(''));
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

const ABAS = {
  RDO_Avanco: Aba(['id', 'data', 'turno', 'pacote_id', 'quantidade', 'clientId', 'usuario'],
    [['a1', '2026-08-01', 'Diurno', 'P26', 10, 'c1', 'Wallace']]),   // linha ANTIGA, sem obra
  RDO_Diario: Aba(['id', 'data', 'turno', 'encarregado', 'observacoes_gerais'],
    [['d1', '2026-08-01', '', 'J. Santos', 'diario da teotonio']]),  // linha ANTIGA, sem obra
  // sem a coluna `paginas`: é a planilha que já está em uso, e ela tem de
  // ganhar a coluna sozinha na primeira nota de duas folhas
  NotasFiscais: Aba(['id', 'clientId', 'obra', 'numero', 'dataEmissao', 'dataEntrada', 'vTotal',
                     'driveId', 'driveLink', 'usuario'],
    [['n1', 'c-n1', 'teotonio', '1001', '2026-07-01', '2026-07-02', 500, '', '', 'Leonardo'],
     ['n2', 'c-n2', 'ranario',  '2002', '2026-07-03', '2026-07-04', 800, '', '', 'Wallace'],
     ['n3', 'c-n3', '',         '3003', '2026-06-01', '2026-06-02', 300, '', '', 'Leonardo']]),  // ANTIGA, sem obra
  EstoqueSaidas: Aba(['id', 'obra', 'descricao', 'qtd', 'data', 'usuario'],
    [['s1', 'teotonio', 'brita', 10, '2026-07-05', 'Leonardo'],
     ['s2', 'ranario',  'areia', 20, '2026-07-06', 'Wallace']])
};

// Propriedades do script COM estado — e um cache que pode ser esvaziado a
// qualquer momento, que e exatamente o que o Google faz com o CacheService.
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

const ABERTURAS = { n: 0 };

// Drive falso — guarda o nome de cada arquivo criado, que e como se confere
// que a folha 2 nao sobrescreveu a folha 1.
const ARQUIVOS = [];
let _idArq = 0;
function PASTA(nome) {
  return {
    getName: () => nome,
    getFilesByName: () => ({ hasNext: () => false }),
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: (n) => PASTA(n),
    createFile: (blob) => {
      const id = 'drv' + (++_idArq);
      ARQUIVOS.push({ id, nome: blob.nome });
      return { getId: () => id, getUrl: () => 'https://drive/' + id, setSharing() {} };
    }
  };
}

const ctx = {
  console, JSON, String, Number, Object, Array, Math, Date, isNaN, parseFloat, parseInt, RegExp,
  SpreadsheetApp: { getActiveSpreadsheet: () => {
    ABERTURAS.n++;   // abrir a planilha e a operacao mais cara do Apps Script
    return { getSheetByName: n => ABAS[n] || null, insertSheet: n => (ABAS[n] = Aba([], [])) };
  } },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, 10),
    sleep() {},
    getUuid: () => require('crypto').randomUUID(),
    base64Decode: (s) => Buffer.from(String(s), 'base64'),
    newBlob: (bytes, tipo, nome) => ({ bytes, tipo, nome, getContentType: () => tipo, getBytes: () => bytes }),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    // o Apps Script devolve bytes COM SINAL (-128..127); o hashSenha conta com isso
    computeDigest: (alg, txt) => Array.from(require('crypto')
      .createHash('sha256').update(String(txt), 'utf8').digest())
      .map(b => (b > 127 ? b - 256 : b))
  },
  Session: { getScriptTimeZone: () => 'UTC' },
  PropertiesService: { getScriptProperties: () => PROPS },
  Logger: { log: () => {} },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  CacheService: { getScriptCache: () => CACHE },
  // Drive falso: guarda os arquivos criados para conferir o nome de cada folha
  DriveApp: {
    Access: { PRIVATE: 'PRIVATE' }, Permission: { NONE: 'NONE' },
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: (n) => PASTA(n)
  },
  UrlFetchApp: {}, MailApp: {}, ScriptApp: {}, XmlService: {}
};
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'Code.gs' });

let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); } };

console.log('MULTI-OBRA NO BACKEND\n');

t('linha antiga, sem coluna obra, continua sendo da Teotônio', () => {
  assert.strictEqual(ctx.normObra(''), 'teotonio');
  assert.strictEqual(ctx.normObra(null), 'teotonio');
  assert.strictEqual(ctx.normObra('  '), 'teotonio');
  assert.strictEqual(ctx.normObra('ranario'), 'ranario');
});

t('migração cria a coluna e marca o histórico como teotonio', () => {
  ctx.migrarObraNasAbasDeRDO();
  const cab = ABAS.RDO_Avanco.dados[0].map(c => String(c).toLowerCase());
  assert.ok(cab.indexOf('obra') !== -1, 'coluna obra nao foi criada em RDO_Avanco');
  const i = cab.indexOf('obra');
  assert.strictEqual(ABAS.RDO_Avanco.dados[1][i], 'teotonio', 'linha antiga nao foi marcada');
  const cabD = ABAS.RDO_Diario.dados[0].map(c => String(c).toLowerCase());
  assert.strictEqual(ABAS.RDO_Diario.dados[1][cabD.indexOf('obra')], 'teotonio');
});

t('migração é idempotente (rodar duas vezes nao estraga)', () => {
  const antes = JSON.stringify(ABAS.RDO_Avanco.dados);
  ctx.migrarObraNasAbasDeRDO();
  assert.strictEqual(JSON.stringify(ABAS.RDO_Avanco.dados), antes);
});

t('lançamento do Ranário grava com a obra dele', () => {
  const r = ctx.addBatchRDO(JSON.stringify([
    { id: 'r1', obra: 'ranario', data: '2026-08-05', turno: 'Diurno', pacote_id: 'RAN-001', quantidade: 5 }
  ]), 'cli-ran', null);
  assert.ok(r.ok, 'gravacao falhou: ' + JSON.stringify(r));
  const cab = ABAS.RDO_Avanco.dados[0].map(c => String(c).toLowerCase());
  const ultima = ABAS.RDO_Avanco.dados[ABAS.RDO_Avanco.dados.length - 1];
  assert.strictEqual(ultima[cab.indexOf('obra')], 'ranario');
});

t('lançamento sem obra declarada cai na Teotônio', () => {
  const r = ctx.addBatchRDO(JSON.stringify([
    { id: 't9', data: '2026-08-05', turno: 'Diurno', pacote_id: 'P26', quantidade: 3 }
  ]), 'cli-teo', null);
  assert.ok(r.ok);
  const cab = ABAS.RDO_Avanco.dados[0].map(c => String(c).toLowerCase());
  const ultima = ABAS.RDO_Avanco.dados[ABAS.RDO_Avanco.dados.length - 1];
  assert.strictEqual(ultima[cab.indexOf('obra')], 'teotonio');
});

t('DIÁRIO do Ranário NÃO sobrescreve o da Teotônio na mesma data', () => {
  const antes = ABAS.RDO_Diario.dados.length;
  const r = ctx.upsertRDODiario({ obra: 'ranario', data: '2026-08-01', encarregado: 'A. Costa',
    observacoes_gerais: 'diario do ranario' }, false);
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(ABAS.RDO_Diario.dados.length, antes + 1, 'deveria ter criado linha NOVA');
  const cab = ABAS.RDO_Diario.dados[0].map(c => String(c).toLowerCase());
  const iObs = cab.indexOf('observacoes_gerais');
  assert.strictEqual(ABAS.RDO_Diario.dados[1][iObs], 'diario da teotonio', 'o diario da Teotonio foi alterado!');
  assert.strictEqual(ABAS.RDO_Diario.dados[antes][cab.indexOf('obra')], 'ranario');
});

t('reenviar o diário da MESMA obra atualiza, não duplica', () => {
  const antes = ABAS.RDO_Diario.dados.length;
  ctx.upsertRDODiario({ obra: 'ranario', data: '2026-08-01', observacoes_gerais: 'corrigido' }, true);
  assert.strictEqual(ABAS.RDO_Diario.dados.length, antes, 'duplicou o diario');
  const cab = ABAS.RDO_Diario.dados[0].map(c => String(c).toLowerCase());
  assert.strictEqual(ABAS.RDO_Diario.dados[antes - 1][cab.indexOf('observacoes_gerais')], 'corrigido');
});

t('producaoPorPacote separa as obras', () => {
  const teo = ctx.producaoPorPacote('2026-08', 'teotonio');
  const ran = ctx.producaoPorPacote('2026-08', 'ranario');
  assert.ok(teo.pacotes['P26'], 'Teotonio deveria ter P26');
  assert.ok(!teo.pacotes['RAN-001'], 'pacote do Ranario vazou para a Teotonio');
  assert.ok(ran.pacotes['RAN-001'], 'Ranario deveria ter RAN-001');
  assert.ok(!ran.pacotes['P26'], 'pacote da Teotonio vazou para o Ranario');
});

console.log('\nSESSAO DURAVEL');

PROPS.setProperty('USUARIOS', JSON.stringify({
  Leonardo: { senha: ctx.hashSenha('senha123'), perfil: 'admin' },
  Wallace:  { senha: ctx.hashSenha('senha123'), perfil: 'campo', obras: ['ranario'] },
  Antigo:   { senha: ctx.hashSenha('senha123'), perfil: 'engenharia' }   // sem campo obras
}));

let tokenWallace = null, tokenAntigo = null;

t('login devolve token e as obras do usuario', () => {
  const r = ctx.loginUsuario('Wallace', 'senha123');
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(r.obras, ['ranario']);
  tokenWallace = r.token;
});

t('usuario antigo, sem campo obras, enxerga TODAS', () => {
  const r = ctx.loginUsuario('Antigo', 'senha123');
  assert.ok(r.ok);
  assert.strictEqual(r.obras, '*');
  tokenAntigo = r.token;
});

t('a sessao SOBREVIVE ao cache do Google evaporar', () => {
  _cache = {};                       // e o que acontece a cada republicacao
  const s = ctx.sessaoDoToken(tokenWallace);
  assert.ok(s, 'a sessao morreu junto com o cache — era esse o bug');
  assert.strictEqual(s.usuario, 'Wallace');
  assert.deepStrictEqual(s.obras, ['ranario']);
});

t('sair revoga a sessao NO SERVIDOR', () => {
  const r0 = ctx.loginUsuario('Antigo', 'senha123');
  ctx.sessaoRevogar(r0.token);
  assert.strictEqual(ctx.sessaoDoToken(r0.token), null, 'token continuou valendo depois do logout');
});

t('token do formato ANTIGO (so no cache) e promovido, nao derrubado', () => {
  _cache['tok_velho'] = JSON.stringify({ usuario: 'Leonardo', perfil: 'admin' });
  const s = ctx.sessaoDoToken('velho');
  assert.ok(s, 'quem estava logado antes da atualizacao foi deslogado');
  assert.strictEqual(s.usuario, 'Leonardo');
  _cache = {};
  assert.ok(ctx.sessaoDoToken('velho'), 'a promocao nao persistiu');
});

console.log('\nRESTRICAO DE OBRA');

t('Wallace (so Ranario) NAO grava na Teotonio', () => {
  const r = ctx.addBatchRDO(JSON.stringify([
    { id: 'x1', obra: 'teotonio', data: '2026-08-05', pacote_id: 'P26', quantidade: 1 }
  ]), 'cli-x1', tokenWallace);
  assert.strictEqual(r.ok, false, 'gravou numa obra sem acesso');
  assert.strictEqual(r.error, 'SEM_ACESSO_A_OBRA');
});

t('Wallace grava no Ranario, que e a obra dele', () => {
  const r = ctx.addBatchRDO(JSON.stringify([
    { id: 'x2', obra: 'ranario', data: '2026-08-05', pacote_id: 'RAN-009', quantidade: 1 }
  ]), 'cli-x2', tokenWallace);
  assert.ok(r.ok, JSON.stringify(r));
});

t('usuario sem restricao grava em qualquer obra', () => {
  const r = ctx.addBatchRDO(JSON.stringify([
    { id: 'x3', obra: 'teotonio', data: '2026-08-05', pacote_id: 'P26', quantidade: 1 }
  ]), 'cli-x3', tokenAntigo);
  assert.ok(r.ok, JSON.stringify(r));
});

t('o DIARIO tambem respeita a obra', () => {
  const r = ctx.upsertRDODiario({ obra: 'teotonio', data: '2026-09-01',
    token: tokenWallace, observacoes_gerais: 'nao deveria entrar' }, false);
  assert.strictEqual(r.ok, false, 'gravou diario em obra sem acesso');
  assert.strictEqual(r.error, 'SEM_ACESSO_A_OBRA');
});

t('a recusa fica registrada na Auditoria', () => {
  const aud = ABAS.Auditoria;
  assert.ok(aud, 'aba de auditoria nao foi criada');
  const texto = JSON.stringify(aud.dados);
  assert.ok(/NEGADO/.test(texto), 'a tentativa negada nao foi registrada');
});

t('admin nunca fica restrito a uma obra', () => {
  ctx.usuarioSalvar({ token: ctx.loginUsuario('Leonardo', 'senha123').token,
    nome: 'Leonardo', perfil: 'admin', obras: 'ranario' });
  const mapa = JSON.parse(PROPS.getProperty('USUARIOS'));
  assert.strictEqual(ctx.usuarioObrasDe(mapa.Leonardo), '*');
});

console.log('\nLOGIN FORA DO CAMINHO DA PLANILHA');

// O que faz o login demorar no Apps Script e abrir a planilha. Estes testes
// provam que ele nao abre mais, e que a trilha de auditoria NAO se perdeu:
// ela desce depois, junto com a proxima gravacao de verdade.
t('entrar nao abre a planilha', () => {
  ABERTURAS.n = 0;
  const r = ctx.loginUsuario('Leonardo', 'senha123');
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(ABERTURAS.n, 0, 'o login ainda abriu a planilha ' + ABERTURAS.n + '×');
});

t('sair tambem nao abre a planilha', () => {
  const tk = ctx.loginUsuario('Leonardo', 'senha123').token;
  ABERTURAS.n = 0;
  ctx.sessaoRevogar(tk);
  assert.strictEqual(ABERTURAS.n, 0, 'o logout ainda abriu a planilha ' + ABERTURAS.n + '×');
});

t('a trilha de LOGIN fica na fila, nao some', () => {
  const naFila = Object.keys(PROPS.getProperties()).filter(k => k.indexOf('AUDQ_') === 0);
  assert.ok(naFila.length >= 3, 'esperava LOGIN/LOGOUT enfileirados, achei ' + naFila.length);
});

t('a proxima gravacao de verdade desce a fila para a planilha', () => {
  const antes = ABAS.Auditoria.dados.length;
  const pendentes = Object.keys(PROPS.getProperties()).filter(k => k.indexOf('AUDQ_') === 0).length;
  ctx.registrarAuditoria('Leonardo', 'admin', 'TESTE', 'teotonio', '-', '', 'gravacao normal');
  const texto = JSON.stringify(ABAS.Auditoria.dados);
  assert.ok(/LOGIN/.test(texto), 'o LOGIN nao chegou na planilha');
  assert.ok(/LOGOUT/.test(texto), 'o LOGOUT nao chegou na planilha');
  assert.strictEqual(ABAS.Auditoria.dados.length, antes + pendentes + 1,
    'numero de linhas gravadas nao bate com a fila');
  assert.strictEqual(
    Object.keys(PROPS.getProperties()).filter(k => k.indexOf('AUDQ_') === 0).length, 0,
    'a fila nao foi limpa depois de gravar');
});

t('a fila sai na ORDEM em que aconteceu', () => {
  ctx.auditoriaEnfileirar(['2026-08-05 10:00:00', 'A', 'campo', 'LOGIN', 'teotonio', '-', '', 'primeiro']);
  ctx.auditoriaEnfileirar(['2026-08-05 10:00:01', 'B', 'campo', 'LOGIN', 'teotonio', '-', '', 'segundo']);
  ctx.auditoriaEnfileirar(['2026-08-05 10:00:02', 'C', 'campo', 'LOGIN', 'teotonio', '-', '', 'terceiro']);
  ctx.auditoriaDescarregar();
  const ult = ABAS.Auditoria.dados.slice(-3).map(l => l[7]);
  assert.deepStrictEqual(ult, ['primeiro', 'segundo', 'terceiro'], JSON.stringify(ult));
});

t('a faxina diaria desce a fila mesmo sem ninguem lancar nada', () => {
  ctx.loginUsuario('Leonardo', 'senha123');
  assert.ok(Object.keys(PROPS.getProperties()).some(k => k.indexOf('AUDQ_') === 0), 'nada na fila');
  ctx.limparSessoesAbandonadas();
  assert.ok(!Object.keys(PROPS.getProperties()).some(k => k.indexOf('AUDQ_') === 0),
    'a faxina nao descarregou a fila');
  assert.ok(/LOGIN/.test(JSON.stringify(ABAS.Auditoria.dados.slice(-1))), 'o LOGIN nao chegou');
});

console.log('\nNOTAS FISCAIS POR OBRA');

// nfListar sempre PASSOU a obra, mas linhasObj ignorava o argumento: a tela
// de Notas devolvia as notas e as saidas de todas as obras misturadas.
t('a Teotonio ve as notas dela, mais as antigas sem obra', () => {
  const r = ctx.nfListar('teotonio');
  const nums = r.notas.map(n => String(n.numero)).sort().join(',');
  assert.strictEqual(nums, '1001,3003', nums);
});

t('o Ranario ve SO a nota dele', () => {
  const r = ctx.nfListar('ranario');
  const nums = r.notas.map(n => String(n.numero)).join(',');
  assert.strictEqual(nums, '2002', nums);
});

t('a nota antiga, sem obra na coluna, e da Teotonio', () => {
  assert.ok(ctx.nfListar('teotonio').notas.some(n => String(n.numero) === '3003'));
  assert.ok(!ctx.nfListar('ranario').notas.some(n => String(n.numero) === '3003'));
});

t('as saidas de estoque tambem separam por obra', () => {
  assert.strictEqual(ctx.nfListar('teotonio').saidas.map(s => String(s.descricao)).join(','), 'brita');
  assert.strictEqual(ctx.nfListar('ranario').saidas.map(s => String(s.descricao)).join(','), 'areia');
});

t('sem obra declarada, devolve tudo (nao quebra quem nao filtra)', () => {
  assert.strictEqual(ctx.linhasObj('NotasFiscais').length, 3);
  assert.strictEqual(ctx.linhasObj('NotasFiscais', '').length, 3);
});

t('aba SEM coluna obra segue devolvendo tudo', () => {
  // RDO_Diario ganhou a coluna na migracao; Equipamentos nunca teve
  const n = ctx.linhasObj('Equipamentos', 'ranario').length;
  assert.strictEqual(n, ctx.linhasObj('Equipamentos').length);
});

console.log('\nNOTA DE MAIS DE UMA FOLHA');

// A DANFE de duas paginas tinha a segunda folha descartada em silencio.
const FOTO = 'data:image/jpeg;base64,' + Buffer.from('folha').toString('base64');

t('a folha 1 vai para o Drive e preenche driveId na planilha', () => {
  ctx.nfSalvar({ clientId: 'cp1', id: 'cp1', obra: 'teotonio', numero: '7001', vtotal: 10 });
  ARQUIVOS.length = 0;
  const r = ctx.nfImagem({ obra: 'teotonio', id: 'cp1', numero: '7001', competencia: '2026-08', foto: FOTO });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.pagina, 1);
  const cab = ABAS.NotasFiscais.dados[0].map(c => String(c).toLowerCase());
  const linha = ABAS.NotasFiscais.dados.find(l => String(l[cab.indexOf('clientid')]) === 'cp1');
  assert.strictEqual(String(linha[cab.indexOf('driveid')]), r.fileId);
});

t('a folha 2 vira um arquivo SEPARADO, com sufixo no nome', () => {
  ARQUIVOS.length = 0;
  const r = ctx.nfImagem({ obra: 'teotonio', id: 'cp1', numero: '7001', competencia: '2026-08',
                           foto: FOTO, pagina: 2 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.pagina, 2);
  assert.strictEqual(ARQUIVOS.length, 1);
  assert.ok(/_p2\.jpg$/.test(ARQUIVOS[0].nome), ARQUIVOS[0].nome);
});

t('e a folha 2 NAO sobrescreve o driveId da capa', () => {
  const cab = ABAS.NotasFiscais.dados[0].map(c => String(c).toLowerCase());
  const linha = ABAS.NotasFiscais.dados.find(l => String(l[cab.indexOf('clientid')]) === 'cp1');
  assert.notStrictEqual(String(linha[cab.indexOf('driveid')]), ARQUIVOS[0].id);
});

t('a coluna `paginas` nasce sozinha na primeira nota que precisa dela', () => {
  const antes = ABAS.NotasFiscais.dados[0].map(c => String(c).toLowerCase());
  assert.ok(antes.indexOf('paginas') === -1, 'a coluna nao deveria existir ainda');
  ctx.nfSalvar({ clientId: 'cp1', id: 'cp1', obra: 'teotonio', numero: '7001', vtotal: 10,
                 paginas: JSON.stringify([{ fileId: 'drvX', link: 'https://drive/drvX' }]) });
  const cab = ABAS.NotasFiscais.dados[0].map(c => String(c).toLowerCase());
  assert.ok(cab.indexOf('paginas') > -1, 'a coluna paginas nao foi criada');
  const linha = ABAS.NotasFiscais.dados.find(l => String(l[cab.indexOf('clientid')]) === 'cp1');
  assert.ok(/drvX/.test(String(linha[cab.indexOf('paginas')])), String(linha[cab.indexOf('paginas')]));
});

t('nota de UMA folha nao ganha a coluna à toa', () => {
  // ja existe agora, mas o valor tem de sair vazio para quem nao tem paginas
  ctx.nfSalvar({ clientId: 'cp9', id: 'cp9', obra: 'teotonio', numero: '9009', vtotal: 5 });
  const cab = ABAS.NotasFiscais.dados[0].map(c => String(c).toLowerCase());
  const linha = ABAS.NotasFiscais.dados.find(l => String(l[cab.indexOf('clientid')]) === 'cp9');
  assert.strictEqual(String(linha[cab.indexOf('paginas')]), '[]');
});

t('reenviar a nota SEM as paginas nao apaga as que ja subiram', () => {
  ctx.nfSalvar({ clientId: 'cp1', id: 'cp1', obra: 'teotonio', numero: '7001', vtotal: 12 });
  const cab = ABAS.NotasFiscais.dados[0].map(c => String(c).toLowerCase());
  const linha = ABAS.NotasFiscais.dados.find(l => String(l[cab.indexOf('clientid')]) === 'cp1');
  assert.ok(/drvX/.test(String(linha[cab.indexOf('paginas')])),
    'as paginas foram perdidas: ' + String(linha[cab.indexOf('paginas')]));
});

t('nfListar devolve as paginas junto com a nota', () => {
  const n = ctx.nfListar('teotonio').notas.find(x => String(x.clientId) === 'cp1');
  assert.ok(n, 'nota nao voltou');
  assert.ok(/drvX/.test(String(n.paginas)), String(n.paginas));
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
