// ============================================================
// BACKEND — Apps Script do "Teotônio Vilela"
// COLE ESTE ARQUIVO INTEIRO no editor do Apps Script (Code.gs),
// salve e REPUBLIQUE (Implantar > Gerenciar implantações > editar
// > Nova versão). A URL /exec continua a mesma.
//
// Por que isto corrige os 2 bugs:
//   • "apagar não funciona"  -> deleteRDO apaga a linha pelo ID.
//   • "cria novos serviços"  -> o switch tem um DEFAULT que RETORNA ERRO
//     para ação desconhecida. Antes, sem o case 'deleteRDO', a requisição
//     caía num ramo que INSERIA linha. Agora isso é impossível.
// ============================================================

var NOME_ABA       = 'RDO_Avanco';   // aba dos serviços
var NOME_ABA_DIARIO = 'RDO_Diario';  // aba do RDO diário (ajuste se o nome for outro)

// ------------------------------------------------------------
// ROTEADOR
// ------------------------------------------------------------
function doGet(e)  { return rotear(e); }
function doPost(e) { return rotear(e); }

function rotear(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = p.action || '';
  var resp;
  try {
    // SEGURANÇA: com a Propriedade do script EXIGIR_TOKEN = 'true', toda ação
    // que altera dados passa a exigir um token de sessão obtido via 'login'.
    // Enquanto a propriedade não existir, nada muda (migração sem quebrar o campo).
    var PROTEGIDAS = ['deleteRDO', 'updateRDO', 'limparDuplicados', 'apagarPorPrefixoId',
                      'addBatchRDO', 'addRDODiario', 'updateRDODiario', 'deleteRDODiario'];
    if (PROTEGIDAS.indexOf(action) !== -1) {
      var falhaAuth = exigirTokenSeAtivo(p.token);
      if (falhaAuth) return responder(falhaAuth, p.callback);
    }
    switch (action) {
      case 'login':           resp = loginUsuario(p.usuario, p.senha); break;
      case 'deleteRDO':       resp = deleteRDO(p.id); break;
      case 'addBatchRDO':     resp = addBatchRDO(p.batch, p.clientId); break;
      case 'updateRDO':       resp = updateRDO(p.payload); break;
      case 'limparDuplicados': resp = limparDuplicadosServidor(); break;
      case 'apagarPorPrefixoId': resp = apagarPorPrefixoId(p.prefixo); break;
      case 'producaoPorPacote': resp = producaoPorPacote(p.mes); break;
      case 'addRDODiario':    resp = upsertRDODiario(p, false); break;
      case 'updateRDODiario': resp = upsertRDODiario(p, true); break;
      case 'deleteRDODiario': resp = deleteRDODiario(p.id, p.data); break;
      default:
        // NUNCA inserir nada aqui. Ação desconhecida = erro, e ponto.
        resp = { ok: false, error: 'Ação desconhecida: "' + action + '"' };
    }
  } catch (err) {
    resp = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return responder(resp, p.callback);
}

// ------------------------------------------------------------
// SEGURANÇA — login no servidor + token de sessão.
//
// Configuração (Apps Script > ⚙ Configurações do projeto > Propriedades do script):
//   USUARIOS     = {"Leonardo":"senha-nova","Wallace":"senha-nova","Guilherme":"senha-nova"}
//   EXIGIR_TOKEN = true
//
// Com USUARIOS definido, o app valida a senha AQUI (senha some do HTML).
// Com EXIGIR_TOKEN=true, escrever/apagar sem token válido é recusado — quem
// tiver só a URL do /exec não consegue mais injetar nem apagar dados.
// O token vale 6 h e renova a cada uso.
// IMPORTANTE: troque as senhas ao configurar — as antigas ficaram públicas
// no histórico do repositório.
// ------------------------------------------------------------
function loginUsuario(usuario, senha) {
  var raw = PropertiesService.getScriptProperties().getProperty('USUARIOS');
  if (!raw) return { ok: false, error: 'LOGIN_NAO_CONFIGURADO' };
  var usuarios;
  try { usuarios = JSON.parse(raw); }
  catch (e) { return { ok: false, error: 'Propriedade USUARIOS não é um JSON válido' }; }

  var u = String(usuario || '').trim();
  if (!u || !senha || String(usuarios[u]) !== String(senha)) {
    Utilities.sleep(500); // desincentiva tentativa e erro em massa
    return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, u, 21600); // 6 h
  return { ok: true, usuario: u, token: token, expiraEmSegundos: 21600 };
}

function usuarioDoToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var u = cache.get('tok_' + String(token));
  if (u) cache.put('tok_' + String(token), u, 21600); // renova a validade a cada uso
  return u;
}

function exigirTokenSeAtivo(token) {
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') return null; // proteção ainda desligada
  if (usuarioDoToken(token)) return null;
  return { ok: false, error: 'TOKEN_INVALIDO' };
}

// Responde em JSONP (se veio ?callback=) ou JSON puro.
function responder(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
// Helpers de planilha (resolvem colunas pelo NOME do cabeçalho,
// então funcionam mesmo que a ordem das colunas mude).
// ------------------------------------------------------------
function abaServicos() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA);
  if (!aba) throw new Error('Aba "' + NOME_ABA + '" não encontrada');
  return aba;
}

function cabecalhoNormalizado(aba) {
  var ultima = aba.getLastColumn();
  var head = aba.getRange(1, 1, 1, ultima).getValues()[0];
  return head.map(function (h) { return String(h).trim().toLowerCase(); });
}

function idxColuna(cab, nome) {
  var n = String(nome).trim().toLowerCase();
  var i = cab.indexOf(n);
  if (i !== -1) return i;
  return cab.findIndex(function (h) { return h.indexOf(n) !== -1; });
}

// ------------------------------------------------------------
// 1. deleteRDO — apaga 1 linha pelo ID
// ------------------------------------------------------------
function deleteRDO(id) {
  if (!id) return { ok: false, error: 'ID não informado' };
  var aba = abaServicos();
  var dados = aba.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxColuna(cab, 'id');
  if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };

  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iId]).trim() === String(id).trim()) {
      aba.deleteRow(i + 1); // planilha é base-1 e tem cabeçalho
      return { ok: true, deleted: id };
    }
  }
  return { ok: false, error: 'ID não encontrado: ' + id };
}

// ------------------------------------------------------------
// 2. addBatchRDO — grava vários serviços de uma vez.
//    Idempotente: se o clientId já existe na planilha, NÃO regrava
//    (evita duplicação por reenvio/retry).
// ------------------------------------------------------------
function addBatchRDO(batchJson, clientId) {
  var batch;
  try { batch = JSON.parse(batchJson || '[]'); }
  catch (e) { return { ok: false, error: 'batch inválido' }; }
  if (!batch.length) return { ok: false, error: 'batch vazio' };

  // Trava para o lote inteiro não rodar 2x ao mesmo tempo.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var aba = abaServicos();
    var cab = cabecalhoNormalizado(aba);
    var iClient = idxColuna(cab, 'clientid');

    // A proteção anti-duplicação precisa da coluna 'clientId'. Se a planilha
    // não tiver, criamos automaticamente (no fim do cabeçalho) para que o
    // dedup passe a funcionar — sem isso, reenvios da fila duplicam linhas.
    if (iClient === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('clientId');
      cab = cabecalhoNormalizado(aba);
      iClient = idxColuna(cab, 'clientid');
    }

    // Dedup por clientId: se já existe, considera salvo e sai.
    if (clientId && iClient !== -1) {
      var dados = aba.getDataRange().getValues();
      for (var r = 1; r < dados.length; r++) {
        if (String(dados[r][iClient]).trim() === String(clientId).trim()) {
          return { ok: true, duplicate: true, inserted: 0 };
        }
      }
    }

    var agora = new Date();
    var linhas = batch.map(function (item, k) {
      var registro = {};
      // copia os campos recebidos
      Object.keys(item).forEach(function (chave) { registro[chave.toLowerCase()] = item[chave]; });
      // campos gerados pelo servidor
      registro['id'] = registro['id'] || gerarId(agora, k);
      registro['clientid'] = clientId || '';
      registro['timestamp'] = registro['timestamp'] || agora;
      registro['data_registro'] = registro['data_registro'] || agora;

      // monta a linha respeitando a ORDEM das colunas da planilha
      return cab.map(function (nomeCol) {
        return registro.hasOwnProperty(nomeCol) ? registro[nomeCol] : '';
      });
    });

    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, cab.length).setValues(linhas);
    return { ok: true, inserted: linhas.length };
  } finally {
    lock.releaseLock();
  }
}

function gerarId(data, k) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), 'yyyyMMddHHmmss') +
         '_' + k + '_' + Math.floor(Math.random() * 9000 + 1000);
}

// ------------------------------------------------------------
// RELATÓRIO — produção total por pacote num mês (ex: mes='2026-05').
// DEDUPLICA na leitura (Data+Turno+Pacote+Qtd+Apontador+Estaca), então
// o resultado é correto mesmo que a planilha ainda tenha duplicatas.
// Chamada: ?action=producaoPorPacote&mes=2026-05&callback=cb
// Se 'mes' for omitido, soma o histórico inteiro.
// ------------------------------------------------------------
function producaoPorPacote(mes) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA + '" não encontrada' };

  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return { ok: true, mes: mes || 'tudo', pacotes: {} };

  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iData   = idxColuna(cab, 'data');
  var iTurno  = idxColuna(cab, 'turno');
  var iPacId  = idxColuna(cab, 'pacote_id');
  var iPacNm  = idxColuna(cab, 'pacote_nome');
  var iQtd    = idxColuna(cab, 'quantidade');
  var iApont  = idxColuna(cab, 'apontador');
  var iEstaca = idxColuna(cab, 'local_estaca');

  function mesDe(v) {
    // Aceita Date ou string; devolve 'yyyy-MM'.
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
    var s = String(v).trim();
    var m = s.match(/(\d{4})-(\d{2})/);            // 2026-05-15
    if (m) return m[1] + '-' + m[2];
    var b = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);  // 15/05/2026
    if (b) return b[3] + '-' + b[2];
    var c = s.match(/(\d{2})\/(\d{2})\/(\d{2})$/); // 15/05/26
    if (c) return '20' + c[3] + '-' + c[2];
    return '';
  }

  function num(s) {
    if (s === '' || s === null || s === undefined) return 0;
    if (typeof s === 'number') return s;
    var t = String(s).replace(/\./g, '').replace(',', '.');
    var v = parseFloat(t);
    return isNaN(v) ? 0 : v;
  }

  var vistas = {};
  var pacotes = {};       // pacote_id -> { nome, qtd, lancamentos }
  var totalLinhas = 0, consideradas = 0, duplicadasIgnoradas = 0;

  for (var i = 1; i < dados.length; i++) {
    var r = dados[i];
    if (mes && mesDe(r[iData]) !== mes) continue;
    totalLinhas++;

    // dedup por conteúdo
    var chave = [
      String(iData!==-1?r[iData]:'').trim(),
      String(iTurno!==-1?r[iTurno]:'').trim().toLowerCase(),
      String(iPacId!==-1?r[iPacId]:'').trim().toLowerCase(),
      String(iQtd!==-1?r[iQtd]:'').trim(),
      String(iApont!==-1?r[iApont]:'').trim().toLowerCase(),
      String(iEstaca!==-1?r[iEstaca]:'').trim().toLowerCase()
    ].join('|');
    if (vistas[chave]) { duplicadasIgnoradas++; continue; }
    vistas[chave] = true;
    consideradas++;

    var pid = String(iPacId!==-1?r[iPacId]:'').trim() || '(sem pacote)';
    if (!pacotes[pid]) pacotes[pid] = { nome: String(iPacNm!==-1?r[iPacNm]:'').trim(), qtd: 0, lancamentos: 0 };
    pacotes[pid].qtd += num(iQtd!==-1?r[iQtd]:0);
    pacotes[pid].lancamentos++;
  }

  return {
    ok: true,
    mes: mes || 'tudo',
    totalLinhasNoMes: totalLinhas,
    consideradas: consideradas,
    duplicadasIgnoradas: duplicadasIgnoradas,
    pacotes: pacotes
  };
}

// ------------------------------------------------------------
// LIMPEZA EM LOTE NO SERVIDOR — apaga TODAS as duplicatas de uma vez.
// Faz backup automático antes. Mantém a 1ª ocorrência de cada chave:
//   Data + Turno + Pacote_ID + Quantidade + Apontador + Local_Estaca
// Retorna quantas linhas removeu — uma única chamada resolve milhares.
// ------------------------------------------------------------
function limparDuplicadosServidor() {
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName(NOME_ABA);
    if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA + '" não encontrada' };

    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return { ok: true, removidas: 0, total: 0 };

    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iData   = idxColuna(cab, 'data');
    var iTurno  = idxColuna(cab, 'turno');
    var iPac    = idxColuna(cab, 'pacote_id');
    var iQtd    = idxColuna(cab, 'quantidade');
    var iApont  = idxColuna(cab, 'apontador');
    var iEstaca = idxColuna(cab, 'local_estaca');

    // Backup preventivo antes de mexer em qualquer coisa.
    var nomeBackup = NOME_ABA + '_backup_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    aba.copyTo(ss).setName(nomeBackup);

    // Monta a lista de linhas a MANTER (primeira ocorrência de cada chave).
    // Em vez de apagar uma a uma (lento, estoura tempo com milhares de linhas),
    // limpamos tudo e regravamos só o que fica — roda em segundos.
    var vistas = {};
    var manter = [dados[0]]; // mantém o cabeçalho
    for (var i = 1; i < dados.length; i++) {
      var r = dados[i];
      var chave = [
        String(iData   !== -1 ? r[iData]   : '').trim(),
        String(iTurno  !== -1 ? r[iTurno]  : '').trim().toLowerCase(),
        String(iPac    !== -1 ? r[iPac]    : '').trim().toLowerCase(),
        String(iQtd    !== -1 ? r[iQtd]    : '').trim(),
        String(iApont  !== -1 ? r[iApont]  : '').trim().toLowerCase(),
        String(iEstaca !== -1 ? r[iEstaca] : '').trim().toLowerCase()
      ].join('|');
      if (!vistas[chave]) { vistas[chave] = true; manter.push(r); }
    }

    var removidas = dados.length - manter.length;
    if (removidas > 0) {
      // Apaga todo o conteúdo (menos o cabeçalho) e regrava o que fica de uma vez.
      var nLinhas = aba.getLastRow();
      var nCols = aba.getLastColumn();
      if (nLinhas > 1) aba.getRange(2, 1, nLinhas - 1, nCols).clearContent();
      if (manter.length > 1) {
        aba.getRange(2, 1, manter.length - 1, manter[0].length).setValues(manter.slice(1));
      }
    }

    return { ok: true, removidas: removidas, total: dados.length - 1, restantes: manter.length - 1, backup: nomeBackup };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// LIMPEZA POR FAIXA DE ID — apaga todas as linhas cujo ID COMEÇA com
// um prefixo (ex: '20260530' = tudo gerado em 30/05). Útil quando os
// reenrios criaram lixo num dia específico que você quer zerar.
// Faz backup antes. Chamada: ?action=apagarPorPrefixoId&prefixo=20260530
// ------------------------------------------------------------
function apagarPorPrefixoId(prefixo) {
  if (!prefixo) return { ok: false, error: 'prefixo não informado' };
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName(NOME_ABA);
    if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA + '" não encontrada' };

    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return { ok: true, removidas: 0, total: 0 };

    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxColuna(cab, 'id');
    if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };

    var nomeBackup = NOME_ABA + '_backup_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    aba.copyTo(ss).setName(nomeBackup);

    var p = String(prefixo).trim();
    var manter = [dados[0]];
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim().indexOf(p) !== 0) manter.push(dados[i]);
    }

    var removidas = dados.length - manter.length;
    if (removidas > 0) {
      var nLinhas = aba.getLastRow(), nCols = aba.getLastColumn();
      if (nLinhas > 1) aba.getRange(2, 1, nLinhas - 1, nCols).clearContent();
      if (manter.length > 1) aba.getRange(2, 1, manter.length - 1, manter[0].length).setValues(manter.slice(1));
    }

    return { ok: true, removidas: removidas, total: dados.length - 1, restantes: manter.length - 1, backup: nomeBackup };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// 3. updateRDO — edição inline de um serviço (por ID)
// ------------------------------------------------------------
function updateRDO(payloadJson) {
  var payload;
  try { payload = JSON.parse(payloadJson || '{}'); }
  catch (e) { return { ok: false, error: 'payload inválido' }; }
  if (!payload.id && !payload.ID) return { ok: false, error: 'ID não informado' };
  var id = payload.id || payload.ID;

  var aba = abaServicos();
  var dados = aba.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxColuna(cab, 'id');
  if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };

  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iId]).trim() === String(id).trim()) {
      Object.keys(payload).forEach(function (chave) {
        var col = idxColuna(cab, chave.toLowerCase());
        if (col !== -1 && col !== iId) {
          aba.getRange(i + 1, col + 1).setValue(payload[chave]);
        }
      });
      return { ok: true, updated: id };
    }
  }
  return { ok: false, error: 'ID não encontrado: ' + id };
}

// ------------------------------------------------------------
// 4. RDO Diário — grava por data (1 registro por data/turno)
//    Corrige 2 bugs:
//    • DUPLICAÇÃO: a célula Data costuma vir como objeto Date; a comparação
//      antiga String(Date) === "2026-06-01" nunca casava → inseria sempre.
//      Agora normaliza ambos para 'yyyy-MM-dd' antes de comparar.
//    • SEM ID: inserts não geravam ID. Agora gera 'D####' sequencial (e faz
//      backfill se uma linha existente estiver sem ID).
// ------------------------------------------------------------
function upsertRDODiario(p, deveExistir) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cab = cabecalhoNormalizado(aba);
    var iData = idxColuna(cab, 'data');
    var iTurno = idxColuna(cab, 'turno');
    var iId = idxColuna(cab, 'id');
    var dados = aba.getDataRange().getValues();

    var dataAlvo = normData(p.data);
    var turno = String(p.turno || '').trim().toLowerCase();

    var linhaExistente = -1;
    for (var i = 1; i < dados.length; i++) {
      var mesmaData = dataAlvo !== '' && (iData !== -1) && normData(dados[i][iData]) === dataAlvo;
      var mesmoTurno = (iTurno === -1) || String(dados[i][iTurno]).trim().toLowerCase() === turno;
      if (mesmaData && mesmoTurno) { linhaExistente = i + 1; break; }
    }

    var registro = {};
    Object.keys(p).forEach(function (chave) {
      if (chave === 'action' || chave === 'callback') return;
      registro[chave.toLowerCase()] = p[chave];
    });

    if (linhaExistente !== -1) {
      // ATUALIZA a linha existente (sem duplicar). Faz backfill de ID se faltar.
      if (iId !== -1 && !registro['id']) {
        var idAtual = String(dados[linhaExistente - 1][iId] == null ? '' : dados[linhaExistente - 1][iId]).trim();
        if (!idAtual) registro['id'] = gerarIdDiario(dados, iId);
      }
      cab.forEach(function (nomeCol, idx) {
        if (registro.hasOwnProperty(nomeCol)) {
          aba.getRange(linhaExistente, idx + 1).setValue(registro[nomeCol]);
        }
      });
      return { ok: true, updated: true, id: registro['id'] || undefined };
    } else {
      // INSERE nova linha, sempre com ID gerado (se a aba tem coluna ID).
      if (iId !== -1 && !registro['id']) {
        registro['id'] = gerarIdDiario(dados, iId);
      }
      var linha = cab.map(function (nomeCol) {
        return registro.hasOwnProperty(nomeCol) ? registro[nomeCol] : '';
      });
      aba.getRange(aba.getLastRow() + 1, 1, 1, cab.length).setValues([linha]);
      return { ok: true, inserted: true, id: registro['id'] || '' };
    }
  } finally {
    lock.releaseLock();
  }
}

// Normaliza um valor de data (Date, 'yyyy-MM-dd...' ou 'dd/MM/yyyy') para
// 'yyyy-MM-dd', para comparação confiável entre planilha e front-end.
function normData(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (s.indexOf('/') !== -1) {
    var p = s.split('/');
    if (p.length === 3) return p[2].slice(0, 4) + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2);
  }
  return s.slice(0, 10);
}

// Gera o próximo ID 'D####' a partir do maior número já presente na coluna ID
// (mantém o padrão D0001, D0002, ... e continua de onde parou).
function gerarIdDiario(dados, iId) {
  var max = 0;
  for (var i = 1; i < dados.length; i++) {
    var v = String(dados[i][iId] == null ? '' : dados[i][iId]).trim();
    var m = v.match(/(\d+)/);
    if (m) { var n = parseInt(m[1], 10); if (!isNaN(n) && n > max) max = n; }
  }
  return 'D' + ('0000' + (max + 1)).slice(-4);
}

// ------------------------------------------------------------
// UTILITÁRIO (rodar manualmente no editor): cria RDOs Diários VAZIOS para as
// datas de maio/2026 que ainda não têm RDO. Idempotente (não duplica datas que
// já existem) e seguro para rodar de novo.
//   • criarRDOsVaziosMaio2026()      -> só dias NÃO úteis (fim de semana + feriado)
//   • criarRDOsVaziosMaio2026(true)  -> também os dias ÚTEIS faltantes (vazios)
// Veja o resultado no menu "Execuções" / log. Dias úteis sem RDO são listados
// (não preenchidos) quando incluirDiasUteis = false.
// ------------------------------------------------------------
function criarRDOsVaziosMaio2026(incluirDiasUteis) {
  var ano = 2026, mes = 5;
  // Feriados NACIONAIS em maio/2026. Acrescente feriados municipais da obra aqui.
  var FERIADOS = ['2026-05-01'];

  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var cab = cabecalhoNormalizado(aba);
    var iData = idxColuna(cab, 'data');
    var iId = idxColuna(cab, 'id');
    var dados = aba.getDataRange().getValues();

    var existentes = {};
    for (var i = 1; i < dados.length; i++) {
      var nd = normData(dados[i][iData]);
      if (nd) existentes[nd] = true;
    }

    var ultimoDia = new Date(ano, mes, 0).getDate();
    var criados = [], uteisSemRDO = [], jaTinham = 0;
    for (var dia = 1; dia <= ultimoDia; dia++) {
      var d = new Date(ano, mes - 1, dia);
      var iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var dow = d.getDay();
      var util = (dow !== 0 && dow !== 6) && FERIADOS.indexOf(iso) === -1;

      if (existentes[iso]) { jaTinham++; continue; }
      if (util && !incluirDiasUteis) { uteisSemRDO.push(iso); continue; }

      var registro = {};
      registro['data'] = iso;
      if (iId !== -1) registro['id'] = gerarIdDiario(dados, iId);
      registro['tem_turno_noturno'] = 'false';
      if (!util) registro['observacoes_gerais'] = 'Dia não útil — sem serviços';

      var linha = cab.map(function (nc) { return registro.hasOwnProperty(nc) ? registro[nc] : ''; });
      aba.appendRow(linha);
      dados.push(linha);            // p/ o próximo gerarIdDiario enxergar o novo ID
      existentes[iso] = true;
      criados.push(registro['id'] + ' ' + iso + (util ? ' (útil, vazio)' : ' (não útil)'));
    }

    var resultado = { ok: true, totalCriados: criados.length, criados: criados, jaTinham: jaTinham, diasUteisSemRDO: uteisSemRDO };
    Logger.log(JSON.stringify(resultado, null, 2));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

// Atalho para o botão ▶ Run (que não passa argumentos): cria TODAS as datas
// de maio/2026 sem RDO — inclusive os dias úteis (vazios). Veja o log em "Execuções".
function criarTodosRDOsVaziosMaio2026() {
  return criarRDOsVaziosMaio2026(true);
}

// ------------------------------------------------------------
// 5. deleteRDODiario — apaga 1 linha da aba RDO_Diario.
//    Casa por ID (texto exato OU só dígitos — cobre IDs numéricos exibidos
//    formatados, ex.: célula = 2 mostrada como "D0002"). Se o ID não casar e
//    a data tiver UM único RDO, apaga por data. Em falha, devolve uma amostra
//    dos IDs realmente presentes na aba, para diagnóstico.
// ------------------------------------------------------------
function deleteRDODiario(id, data) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var dados = aba.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxColuna(cab, 'id');
    var iData = idxColuna(cab, 'data');

    var alvo = String(id == null ? '' : id).trim();
    var alvoDig = alvo.replace(/\D/g, '');
    var alvoNum = alvoDig ? parseInt(alvoDig, 10) : null;

    // 1) por ID — exato; senão por dígitos (IDs numéricos formatados).
    if (iId !== -1 && (alvo || alvoNum !== null)) {
      for (var i = 1; i < dados.length; i++) {
        var cell = String(dados[i][iId]).trim();
        if (cell === '') continue;
        var cellDig = cell.replace(/\D/g, '');
        var cellNum = cellDig ? parseInt(cellDig, 10) : null;
        if (cell === alvo || (alvoNum !== null && cellNum !== null && cellNum === alvoNum)) {
          aba.deleteRow(i + 1);
          return { ok: true, deleted: id, by: 'id' };
        }
      }
    }

    // 2) por data — só se houver exatamente UM RDO naquela data.
    if (data && iData !== -1) {
      var tz = Session.getScriptTimeZone();
      var alvoData = String(data).slice(0, 10);
      var matches = [];
      for (var j = 1; j < dados.length; j++) {
        var v = dados[j][iData];
        var iso;
        if (v instanceof Date) {
          iso = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        } else {
          var sv = String(v).trim();
          if (sv.indexOf('/') !== -1) {
            var p = sv.split('/');
            iso = (p.length === 3) ? (p[2].slice(0, 4) + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2)) : sv;
          } else {
            iso = sv.slice(0, 10);
          }
        }
        if (iso === alvoData) matches.push(j);
      }
      if (matches.length === 1) {
        aba.deleteRow(matches[0] + 1);
        return { ok: true, deleted: id, by: 'data' };
      }
      if (matches.length > 1) {
        return { ok: false, error: 'Há ' + matches.length + ' RDOs em ' + alvoData + ', mas o ID "' + id + '" não casou com a coluna ID. Veja idsVistos.', idsVistos: amostraIdsDiario(dados, iId) };
      }
    }

    return { ok: false, error: 'ID não encontrado: ' + id, idsVistos: amostraIdsDiario(dados, iId) };
  } finally {
    lock.releaseLock();
  }
}

// Amostra dos valores da coluna ID (até 25) para diagnóstico de não-casamento.
function amostraIdsDiario(dados, iId) {
  var out = [];
  for (var i = 1; i < dados.length && out.length < 25; i++) {
    out.push(iId !== -1 ? dados[i][iId] : '(sem coluna ID)');
  }
  return out;
}

// ============================================================
// AUTOMAÇÕES (gatilhos de tempo)
// Rode configurarGatilhos() UMA vez no editor (botão ▶ Run) para
// agendar o backup diário e o registro automático de chuva.
// ============================================================
function configurarGatilhos() {
  // Remove gatilhos antigos destas funções para não duplicar.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'backupDiario' || fn === 'registrarClimaAuto') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('registrarClimaAuto').timeBased().everyDays(1).atHour(5).create();
  Logger.log('Gatilhos criados: backupDiario (02h) e registrarClimaAuto (05h).');
  return { ok: true };
}

// ------------------------------------------------------------
// BACKUP DIÁRIO — copia a planilha inteira para o Drive (pasta
// "Backups Teotonio") e mantém as últimas 14 cópias.
// ------------------------------------------------------------
function backupDiario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var arquivo = DriveApp.getFileById(ss.getId());

  var pastas = DriveApp.getFoldersByName('Backups Teotonio');
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder('Backups Teotonio');

  var nome = 'BACKUP ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
             ' — ' + ss.getName();
  arquivo.makeCopy(nome, pasta);

  // Retenção: mantém só as 14 cópias mais recentes.
  var copias = [];
  var it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('BACKUP ') === 0) copias.push(f);
  }
  copias.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = 14; i < copias.length; i++) copias[i].setTrashed(true);

  Logger.log('Backup criado: ' + nome + ' (' + copias.length + ' cópias na pasta).');
  return { ok: true, backup: nome };
}

// ------------------------------------------------------------
// CLIMA AUTOMÁTICO — busca a chuva de ONTEM na Open-Meteo (grátis,
// sem chave) e grava na aba RDO_Diario, colunas Chuva_mm_Auto e
// Clima_Fonte (criadas automaticamente se não existirem).
// Serve de contraprova objetiva do clima apontado — base para
// pleitos de prorrogação por dias improdutivos.
// ------------------------------------------------------------
var OBRA_LAT = -23.72;  // Av. Sen. Teotônio Vilela (ajuste fino se necessário)
var OBRA_LON = -46.66;

function registrarClimaAuto() {
  var ontem = new Date(Date.now() - 24 * 3600 * 1000);
  var iso = Utilities.formatDate(ontem, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + OBRA_LAT +
            '&longitude=' + OBRA_LON +
            '&start_date=' + iso + '&end_date=' + iso +
            '&daily=precipitation_sum&timezone=America%2FSao_Paulo';
  var chuva = null;
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var dados = JSON.parse(resp.getContentText());
    if (dados.daily && dados.daily.precipitation_sum) chuva = dados.daily.precipitation_sum[0];
  } catch (e) {
    Logger.log('Open-Meteo indisponível: ' + e);
    return { ok: false, error: 'API de clima indisponível' };
  }
  if (chuva === null || chuva === undefined) return { ok: false, error: 'Sem dado de chuva para ' + iso };

  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cab = cabecalhoNormalizado(aba);
    // Cria as colunas de clima automático se ainda não existirem.
    if (idxColuna(cab, 'chuva_mm_auto') === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('Chuva_mm_Auto');
      cab = cabecalhoNormalizado(aba);
    }
    if (idxColuna(cab, 'clima_fonte') === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('Clima_Fonte');
      cab = cabecalhoNormalizado(aba);
    }
    var iData = idxColuna(cab, 'data');
    var iChuva = idxColuna(cab, 'chuva_mm_auto');
    var iFonte = idxColuna(cab, 'clima_fonte');
    var iId = idxColuna(cab, 'id');
    var dados2 = aba.getDataRange().getValues();

    for (var i = 1; i < dados2.length; i++) {
      if (normData(dados2[i][iData]) === iso) {
        aba.getRange(i + 1, iChuva + 1).setValue(chuva);
        aba.getRange(i + 1, iFonte + 1).setValue('Open-Meteo');
        return { ok: true, data: iso, chuva_mm: chuva, atualizado: true };
      }
    }

    // Não havia RDO na data: cria linha mínima só com data + chuva,
    // para o dia ficar documentado mesmo sem apontamento.
    var registro = {};
    registro['data'] = iso;
    registro['chuva_mm_auto'] = chuva;
    registro['clima_fonte'] = 'Open-Meteo';
    registro['tem_turno_noturno'] = 'false';
    if (iId !== -1) registro['id'] = gerarIdDiario(dados2, iId);
    var linha = cab.map(function (nc) { return registro.hasOwnProperty(nc) ? registro[nc] : ''; });
    aba.getRange(aba.getLastRow() + 1, 1, 1, cab.length).setValues([linha]);
    return { ok: true, data: iso, chuva_mm: chuva, inserido: true };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// RDOs VAZIOS — versão GENÉRICA (qualquer mês/ano) do utilitário
// de maio/26. Edite ANO_MES_ALVO e rode criarRDOsVaziosDoMes().
// Feriados: nacionais + municipais de São Paulo.
// ------------------------------------------------------------
var ANO_MES_ALVO = '2026-06'; // <-- ajuste aqui antes de rodar

var FERIADOS_OBRA = [
  '2026-01-01', '2026-01-25', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21',
  '2026-05-01', '2026-06-04', '2026-07-09', '2026-09-07', '2026-10-12', '2026-11-02',
  '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-01-25'
];

function criarRDOsVaziosDoMes() {
  var partes = String(ANO_MES_ALVO).split('-');
  return criarRDOsVazios(parseInt(partes[0], 10), parseInt(partes[1], 10), true);
}

function criarRDOsVazios(ano, mes, incluirDiasUteis) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var cab = cabecalhoNormalizado(aba);
    var iData = idxColuna(cab, 'data');
    var iId = idxColuna(cab, 'id');
    var dados = aba.getDataRange().getValues();

    var existentes = {};
    for (var i = 1; i < dados.length; i++) {
      var nd = normData(dados[i][iData]);
      if (nd) existentes[nd] = true;
    }

    var ultimoDia = new Date(ano, mes, 0).getDate();
    var criados = [], uteisSemRDO = [], jaTinham = 0;
    for (var dia = 1; dia <= ultimoDia; dia++) {
      var d = new Date(ano, mes - 1, dia);
      var iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var dow = d.getDay();
      var util = (dow !== 0 && dow !== 6) && FERIADOS_OBRA.indexOf(iso) === -1;

      if (existentes[iso]) { jaTinham++; continue; }
      if (util && !incluirDiasUteis) { uteisSemRDO.push(iso); continue; }

      var registro = {};
      registro['data'] = iso;
      if (iId !== -1) registro['id'] = gerarIdDiario(dados, iId);
      registro['tem_turno_noturno'] = 'false';
      if (!util) registro['observacoes_gerais'] = 'Dia não útil — sem serviços';

      var linha = cab.map(function (nc) { return registro.hasOwnProperty(nc) ? registro[nc] : ''; });
      aba.appendRow(linha);
      dados.push(linha);
      existentes[iso] = true;
      criados.push(registro['id'] + ' ' + iso + (util ? ' (útil, vazio)' : ' (não útil)'));
    }

    var resultado = { ok: true, mes: ano + '-' + ('0' + mes).slice(-2), totalCriados: criados.length, criados: criados, jaTinham: jaTinham, diasUteisSemRDO: uteisSemRDO };
    Logger.log(JSON.stringify(resultado, null, 2));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}
