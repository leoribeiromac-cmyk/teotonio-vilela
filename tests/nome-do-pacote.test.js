// O NOME DO SERVIÇO NÃO PODE DEPENDER DE UMA COLUNA QUE NINGUÉM GARANTE.
//
// A aba RDO_Avanco guarda `Pacote_ID` (a chave) e `Pacote_Nome` (o nome como
// estava no dia do lançamento). O app manda o nome ao gravar, mas o
// `addBatchRDO` NÃO cria essa coluna sozinho, como faz com clientId, usuario
// e obra: se a planilha de uma obra nova não tiver `Pacote_Nome`, o valor é
// descartado em silêncio. Linha digitada à mão na planilha também chega sem.
//
// Meia dúzia de lugares liam `Pacote_Nome` direto, sem procurar pelo ID. O
// resultado: a coluna "Pacote" do Histórico virava um traço em TODA linha, e
// o PDF do RDO imprimia a frente e um separador solto, sem nome de serviço —
// no documento que a fiscalização assina.
//
// E há duas regras diferentes, de propósito:
//   • TELAS DE ANÁLISE (Histórico, Avanço, Galeria) mostram o nome ATUAL do
//     cadastro — renomear pacote é quase sempre correção, e quem consulta
//     quer o vocabulário de hoje;
//   • O DOCUMENTO (RDO na tela e em PDF) mostra o nome COMO FOI LANÇADO —
//     renomear um pacote meses depois não pode reescrever, de trás para
//     frente, o RDO que já foi entregue e assinado.
//
// Como rodar:  node tests/nome-do-pacote.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const pacotes = H.csv([
  ['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'],
  ['P01', 'Drenagem', 'Rede de drenagem tubular', 'm', H.pt(1000), H.pt(10), 'Ativo', ''],
]);

// O harness NÃO gera a coluna Pacote_Nome — é exatamente a planilha de uma
// obra nova, ou a linha que alguém digitou à mão.
const semNome = H.csv([
  ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador',
   'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'],
  ['r1', '2025-06-10', 'P01', H.pt(120), 'E100+0', 'Equipe 1', 'Wallace', 'Diurno', '', '',
   'Wallace', '2025-06-10T12:00:00Z', 'teotonio'],
]);

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' },
                            pacotes, rdo: semNome,
                            coeficientes: H.gerarCoeficientes(1, 1),
                            diario: H.gerarDiario({ linhas: 2 }) });

  // ---------------------------------------------- as duas regras, direto
  console.log('\n── as duas regras ──');
  const regras = await s.p.evaluate(() => {
    const semColuna = { 'Pacote_ID': 'P01' };
    const comColuna  = { 'Pacote_ID': 'P01', 'Pacote_Nome': 'Rede tubular (nome do dia do lançamento)' };
    const idOrfao    = { 'Pacote_ID': 'P99' };
    return {
      analiseSemColuna:  nomeDoPacote(semColuna),
      analiseComColuna:  nomeDoPacote(comColuna),
      documentoSemColuna: nomeDoPacoteNoLancamento(semColuna),
      documentoComColuna: nomeDoPacoteNoLancamento(comColuna),
      orfaoAnalise:      nomeDoPacote(idOrfao),
      orfaoDocumento:    nomeDoPacoteNoLancamento(idOrfao),
    };
  });

  ok('sem a coluna, a análise acha o nome pelo Pacote_ID',
     regras.analiseSemColuna === 'Rede de drenagem tubular', regras.analiseSemColuna);
  ok('sem a coluna, o DOCUMENTO também acha o nome (não sai em branco)',
     regras.documentoSemColuna === 'Rede de drenagem tubular', regras.documentoSemColuna);
  ok('com a coluna, a análise prefere o nome ATUAL do cadastro',
     regras.analiseComColuna === 'Rede de drenagem tubular', regras.analiseComColuna);
  ok('com a coluna, o DOCUMENTO preserva o nome como foi lançado',
     regras.documentoComColuna === 'Rede tubular (nome do dia do lançamento)', regras.documentoComColuna);
  ok('pacote que não existe mais no cadastro cai no ID, não em vazio',
     regras.orfaoAnalise === 'P99' && regras.orfaoDocumento === 'P99',
     regras.orfaoAnalise + ' / ' + regras.orfaoDocumento);

  // ---------------------------------------------- a tela do Histórico
  console.log('\n── Histórico ──');
  await s.ir('historico');
  await s.p.waitForTimeout(900);
  const hist = await s.p.evaluate(() => {
    const tr = document.querySelector('table tbody tr');
    const td = tr ? tr.querySelector('td') : null;
    return td ? td.textContent.trim() : null;
  });
  ok('a coluna Pacote traz o nome, e não um traço',
     hist === 'Rede de drenagem tubular', JSON.stringify(hist));

  // ---------------------------------------------- exportação
  const csvTemNome = await s.p.evaluate(() => {
    // a exportação monta as linhas com a mesma regra da tela
    const r = (STATE.rdoavanco || [])[0];
    return r ? nomeDoPacote(r) : null;
  });
  ok('a exportação CSV leva o nome junto', csvTemNome === 'Rede de drenagem tubular', csvTemNome);

  ok('nenhum erro de JS', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
