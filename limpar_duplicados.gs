// ============================================================
// FERRAMENTA MANUAL — execute direto no editor do Apps Script.
//
// O roteamento (doGet/doPost), o deleteRDO e o addBatchRDO ficam no
// arquivo Code.gs. Aqui fica só a limpeza em lote, que você roda à mão
// quando quiser uma faxina geral com backup automático.
//
// LIMPEZA EM LOTE — identifica e remove duplicatas pela chave:
//   Data + Turno + Pacote_ID + Quantidade + Apontador + Local_Estaca
//   Cria backup automático antes de apagar.
// ------------------------------------------------------------
function limparDuplicadosRDO() {
  const NOME_ABA = 'RDO_Avanco';

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(NOME_ABA);
  if (!aba) {
    Browser.msgBox('Aba "' + NOME_ABA + '" não encontrada.');
    return;
  }

  // Backup preventivo
  const nomeBackup = NOME_ABA + '_backup_' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
  aba.copyTo(ss).setName(nomeBackup);
  Logger.log('Backup criado: ' + nomeBackup);

  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) { Logger.log('Sem dados.'); return; }

  const cab = dados[0].map(h => String(h).trim().toLowerCase());
  const c = nome => {
    const i = cab.indexOf(nome.toLowerCase());
    return i !== -1 ? i : cab.findIndex(h => h.includes(nome.toLowerCase()));
  };

  const iData = c('data'), iTurno = c('turno'), iPacoteId = c('pacote_id');
  const iQtd  = c('quantidade'), iApontador = c('apontador'), iEstaca = c('local_estaca');

  const vistas = new Set();
  const apagar = [];

  for (let i = 1; i < dados.length; i++) {
    const r = dados[i];
    const chave = [
      String(r[iData]       || '').trim(),
      String(r[iTurno]      || '').trim().toLowerCase(),
      String(r[iPacoteId]   || '').trim().toLowerCase(),
      String(r[iQtd]        || '').trim(),
      String(r[iApontador]  || '').trim().toLowerCase(),
      String(r[iEstaca]     || '').trim().toLowerCase(),
    ].join('|');

    if (vistas.has(chave)) {
      apagar.push(i + 1);
    } else {
      vistas.add(chave);
    }
  }

  Logger.log('Total: ' + (dados.length - 1) + ' · Duplicatas: ' + apagar.length);

  if (apagar.length === 0) {
    Browser.msgBox('Nenhuma duplicata encontrada. Planilha já está limpa.');
    return;
  }

  const ok = Browser.msgBox(
    'Limpeza de duplicatas',
    apagar.length + ' linhas duplicadas encontradas.\nBackup: "' + nomeBackup + '".\n\nApagar agora?',
    Browser.Buttons.YES_NO
  );
  if (ok !== Browser.Buttons.YES) return;

  for (let i = apagar.length - 1; i >= 0; i--) {
    aba.deleteRow(apagar[i]);
  }

  Browser.msgBox('✓ ' + apagar.length + ' linhas removidas.\nBackup: ' + nomeBackup);
}
