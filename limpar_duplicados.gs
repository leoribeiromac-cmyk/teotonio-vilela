// ============================================================
// LIMPAR DUPLICADOS — RDO_Avanco
// Cole este código no Apps Script do projeto e execute
// a função "limparDuplicadosRDO".
//
// O que faz:
//   1. Lê todas as linhas da aba RDO_Avanco
//   2. Identifica duplicatas pela chave:
//      Data + Turno + Pacote_ID + Quantidade + Apontador + Local_Estaca
//   3. Mantém APENAS a primeira ocorrência de cada chave
//   4. Remove as linhas repetidas (de baixo para cima, para não
//      deslocar os índices)
//   5. Exibe um resumo no log
//
// SEGURANÇA: faz uma cópia da aba antes de apagar qualquer linha.
// ============================================================

function limparDuplicadosRDO() {
  const NOME_ABA = 'RDO_Avanco';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(NOME_ABA);
  if (!aba) {
    Browser.msgBox('Aba "' + NOME_ABA + '" não encontrada.');
    return;
  }

  // ── 1. Backup preventivo ──────────────────────────────────────
  const nomeBackup = NOME_ABA + '_backup_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
  aba.copyTo(ss).setName(nomeBackup);
  Logger.log('Backup criado: ' + nomeBackup);

  // ── 2. Ler dados ─────────────────────────────────────────────
  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) {
    Logger.log('Nenhum dado para processar.');
    return;
  }

  const cabecalho = dados[0].map(h => String(h).trim().toLowerCase());

  function col(nome) {
    const idx = cabecalho.indexOf(nome.toLowerCase());
    if (idx === -1) {
      // Tenta correspondência parcial
      const parcial = cabecalho.findIndex(h => h.includes(nome.toLowerCase()));
      return parcial;
    }
    return idx;
  }

  const iData       = col('data');
  const iTurno      = col('turno');
  const iPacoteId   = col('pacote_id');
  const iQuantidade = col('quantidade');
  const iApontador  = col('apontador');
  const iEstaca     = col('local_estaca');

  Logger.log('Colunas encontradas — Data:' + iData + ' Turno:' + iTurno +
    ' Pacote_ID:' + iPacoteId + ' Quantidade:' + iQuantidade +
    ' Apontador:' + iApontador + ' Local_Estaca:' + iEstaca);

  // ── 3. Identificar linhas duplicadas ─────────────────────────
  const vistas = new Set();
  const linhasParaApagar = []; // índices base-1 (linha real na planilha)

  for (let i = 1; i < dados.length; i++) {
    const r = dados[i];
    const chave = [
      String(r[iData]       || '').trim(),
      String(r[iTurno]      || '').trim().toLowerCase(),
      String(r[iPacoteId]   || '').trim().toLowerCase(),
      String(r[iQuantidade] || '').trim(),
      String(r[iApontador]  || '').trim().toLowerCase(),
      String(r[iEstaca]     || '').trim().toLowerCase(),
    ].join('|');

    if (vistas.has(chave)) {
      linhasParaApagar.push(i + 1); // +1 porque planilha é base-1
    } else {
      vistas.add(chave);
    }
  }

  Logger.log('Total de linhas: ' + (dados.length - 1));
  Logger.log('Duplicatas encontradas: ' + linhasParaApagar.length);

  if (linhasParaApagar.length === 0) {
    Browser.msgBox('Nenhuma duplicata encontrada. A planilha já está limpa.');
    return;
  }

  // ── 4. Confirmar antes de apagar ─────────────────────────────
  const confirmar = Browser.msgBox(
    'Limpeza de duplicatas',
    'Foram encontradas ' + linhasParaApagar.length + ' linhas duplicadas.\n' +
    'Um backup foi criado na aba "' + nomeBackup + '".\n\n' +
    'Deseja apagar as duplicatas agora?',
    Browser.Buttons.YES_NO
  );
  if (confirmar !== Browser.Buttons.YES) {
    Logger.log('Operação cancelada pelo usuário.');
    return;
  }

  // ── 5. Apagar de baixo para cima (mantém índices corretos) ───
  for (let i = linhasParaApagar.length - 1; i >= 0; i--) {
    aba.deleteRow(linhasParaApagar[i]);
  }

  const msg = '✓ ' + linhasParaApagar.length + ' linhas duplicadas removidas.\nBackup salvo em: ' + nomeBackup;
  Logger.log(msg);
  Browser.msgBox(msg);
}
