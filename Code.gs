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
    switch (action) {
      case 'deleteRDO':       resp = deleteRDO(p.id); break;
      case 'addBatchRDO':     resp = addBatchRDO(p.batch, p.clientId); break;
      case 'updateRDO':       resp = updateRDO(p.payload); break;
      case 'limparDuplicados': resp = limparDuplicadosServidor(); break;
      case 'addRDODiario':    resp = upsertRDODiario(p, false); break;
      case 'updateRDODiario': resp = upsertRDODiario(p, true); break;
      default:
        // NUNCA inserir nada aqui. Ação desconhecida = erro, e ponto.
        resp = { ok: false, error: 'Ação desconhecida: "' + action + '"' };
    }
  } catch (err) {
    resp = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return responder(resp, p.callback);
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
// LIMPEZA EM LOTE NO SERVIDOR — apaga TODAS as duplicatas de uma vez.
// Faz backup automático antes. Mantém a 1ª ocorrência de cada chave:
//   Data + Turno + Pacote_ID + Quantidade + Apontador + Local_Estaca
// Retorna quantas linhas removeu — uma única chamada resolve milhares.
// ------------------------------------------------------------
function limparDuplicadosServidor() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
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

    // Backup preventivo antes de apagar qualquer coisa.
    var nomeBackup = NOME_ABA + '_backup_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    aba.copyTo(ss).setName(nomeBackup);

    var vistas = {};
    var apagar = []; // índices de linha (base-1) a remover
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
      if (vistas[chave]) apagar.push(i + 1);
      else vistas[chave] = true;
    }

    // Apaga de baixo para cima para os índices não deslocarem.
    for (var j = apagar.length - 1; j >= 0; j--) {
      aba.deleteRow(apagar[j]);
    }

    return { ok: true, removidas: apagar.length, total: dados.length - 1, backup: nomeBackup };
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
    var dados = aba.getDataRange().getValues();

    var data = String(p.data || '').trim();
    var turno = String(p.turno || '').trim().toLowerCase();

    var linhaExistente = -1;
    for (var i = 1; i < dados.length; i++) {
      var mesmaData = String(dados[i][iData]).trim() === data;
      var mesmoTurno = (iTurno === -1) || String(dados[i][iTurno]).trim().toLowerCase() === turno;
      if (mesmaData && mesmoTurno) { linhaExistente = i + 1; break; }
    }

    var registro = {};
    Object.keys(p).forEach(function (chave) {
      if (chave === 'action' || chave === 'callback') return;
      registro[chave.toLowerCase()] = p[chave];
    });

    if (linhaExistente !== -1) {
      // atualiza
      cab.forEach(function (nomeCol, idx) {
        if (registro.hasOwnProperty(nomeCol)) {
          aba.getRange(linhaExistente, idx + 1).setValue(registro[nomeCol]);
        }
      });
      return { ok: true, updated: true };
    } else {
      var linha = cab.map(function (nomeCol) {
        return registro.hasOwnProperty(nomeCol) ? registro[nomeCol] : '';
      });
      aba.getRange(aba.getLastRow() + 1, 1, 1, cab.length).setValues([linha]);
      return { ok: true, inserted: true };
    }
  } finally {
    lock.releaseLock();
  }
}
