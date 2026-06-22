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
      case 'apagarPorPrefixoId': resp = apagarPorPrefixoId(p.prefixo); break;
      case 'producaoPorPacote': resp = producaoPorPacote(p.mes); break;
      case 'addRDODiario':    resp = upsertRDODiario(p, false); break;
      case 'updateRDODiario': resp = upsertRDODiario(p, true); break;
      case 'deleteRDODiario': resp = deleteRDODiario(p.id); break;
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
