/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
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

  /* A CONTAGEM é só para a pergunta. Antes, as linhas a apagar eram lidas
     aqui, a caixa de confirmação ficava esperando o dedo — minutos, às vezes
     — e depois `deleteRow` apagava pelas POSIÇÕES lidas antes. Qualquer
     lançamento apagado pelo app nesse meio deslocava a planilha, e a faxina
     apagava linhas que não eram duplicata. Agora a gravação relê tudo sob a
     trava do script, e regrava de uma vez (como o botão do app). */
  const antes = aba.getDataRange().getValues();
  if (antes.length <= 1) { Logger.log('Sem dados.'); return; }
  const previstas = antes.length - rdoAvancoSemDuplicadas_(antes).length;
  Logger.log('Total: ' + (antes.length - 1) + ' · Duplicatas: ' + previstas);
  if (previstas === 0) {
    Browser.msgBox('Nenhuma duplicata encontrada. Planilha já está limpa.');
    return;
  }

  const ok = Browser.msgBox(
    'Limpeza de duplicatas',
    previstas + ' linhas duplicadas encontradas.\nUm backup da aba é criado antes.\n\nApagar agora?',
    Browser.Buttons.YES_NO
  );
  if (ok !== Browser.Buttons.YES) return;

  const trava = LockService.getScriptLock();
  trava.waitLock(120000);
  let removidas = 0, nomeBackup = '';
  try {
    nomeBackup = NOME_ABA + '_backup_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    aba.copyTo(ss).setName(nomeBackup);
    Logger.log('Backup criado: ' + nomeBackup);

    const dados = aba.getDataRange().getValues();          // o estado de AGORA
    const manter = rdoAvancoSemDuplicadas_(dados);
    removidas = dados.length - manter.length;
    if (removidas > 0) {
      const nLinhas = aba.getLastRow(), nCols = aba.getLastColumn();
      if (nLinhas > 1) aba.getRange(2, 1, nLinhas - 1, nCols).clearContent();
      if (manter.length > 1) {
        aba.getRange(2, 1, manter.length - 1, manter[0].length).setValues(seguroMatriz(manter.slice(1)));
      }
    }
    registrarAuditoria('editor', 'admin', 'limparDuplicadosRDO', '', '',
      'linhas antes: ' + (dados.length - 1), 'removidas: ' + removidas + ' · backup: ' + nomeBackup);
  } finally {
    trava.releaseLock();
  }

  Browser.msgBox('Pronto: ' + removidas + ' linhas removidas.\nBackup: ' + nomeBackup);
}
