// O ESTOQUE E O CONSUMO REAL SÃO DA OBRA, NÃO DO APARELHO QUE LANÇOU.
//
// 1. A entrada no estoque era gravada só no aparelho que salvou a nota. No
//    celular do almoxarife a nota aparecia "Integrada ao estoque" e o estoque
//    dela não existia — a primeira saída deixava o saldo negativo. Agora a
//    sincronização dá a entrada à nota integrada que chegou de outro aparelho,
//    e tira a da nota cancelada ou excluída lá.
// 2. O Teórico × Real lia as saídas do almoxarifado só do que a tela de Notas
//    tinha trazido da última vez. Quem abria o Teórico × Real direto via o
//    consumo velho (ou nenhum). Agora a tela busca as saídas ela mesma.
//
// Como rodar:  node tests/estoque-entre-aparelhos.ui.test.js
const { abrir } = require('./harness');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const ITENS = JSON.stringify([{ descricao: 'AREIA MEDIA', qtd: 10, un: 'M3', vUnit: 100, vTotal: 1000 }]);
const nota = (status, em) => ({
  id: 'nt9', clientId: 'nt9', obra: 'teotonio', numero: '9001', dataEmissao: '2026-09-01',
  dataEntrada: '2026-09-02', razaoSocial: 'Areial do Outro Aparelho', vTotal: 1000, status,
  usuario: 'Guilherme', responsavel: 'Guilherme', itens: ITENS, criadoEm: 1756700000000, atualizadoEm: em,
});
let NOTAS = [nota('Integrada ao estoque', 1756700000000)];
const SAIDAS = [{ id: 's1', obra: 'teotonio', materialId: 'AREIA MEDIA', descricao: 'AREIA MEDIA', un: 'M3',
                  qtd: 3, data: '2026-09-05', usuario: 'Guilherme', criadoem: 1756900000000 }];

(async () => {
  const s = await abrir({
    logar: { usuario: 'Leonardo', perfil: 'admin' },
    gas: (acao, params) => {
      if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo'] };
      if (acao === 'login') return { ok: true, usuario: params.usuario, perfil: 'admin', token: 'tok-falso', obras: '*' };
      if (acao === 'nfListar') return { ok: true, notas: NOTAS, saidas: SAIDAS };
      return { ok: true };
    },
  });
  const { p } = s;
  const listar = () => s.chamadas.filter(c => c.acao === 'nfListar').length;

  console.log('O TEÓRICO × REAL BUSCA AS SAÍDAS SOZINHO');
  ok('(as Notas ainda não foram abertas neste aparelho)', listar() === 0, listar());
  await s.ir('teoricoreal');
  await p.waitForTimeout(1500);
  ok('abrir o Teórico × Real busca as saídas no servidor', listar() >= 1, listar());
  ok('e a saída do almoxarifado chega ao aparelho',
     await p.evaluate(() => nfSaiGet(OBRA.id).length) === 1, await p.evaluate(() => nfSaiGet(OBRA.id).length));
  const naTela = await p.evaluate(() => document.querySelector('.page') ? document.querySelector('.page').textContent : '');
  ok('a tela não diz mais "nenhuma saída registrada"', !/Nenhuma saída de almoxarifado registrada/.test(naTela));
  const chamadasAntes = listar();
  await p.evaluate(() => { navigate('executivo'); });
  await p.waitForTimeout(300);
  await s.ir('teoricoreal');
  await p.waitForTimeout(800);
  ok('voltar logo à tela não busca de novo', listar() === chamadasAntes, listar() + ' × ' + chamadasAntes);

  console.log('\nA NOTA INTEGRADA EM OUTRO APARELHO ENTRA NO ESTOQUE DESTE');
  await s.ir('notas');
  await p.waitForTimeout(1200);
  const saldo = await p.evaluate(() => nfSaldos(OBRA.id).find(x => /AREIA/.test(x.descricao)) || null);
  ok('o material da nota aparece no estoque', !!saldo, JSON.stringify(saldo));
  ok('com a entrada da nota (10) e a saída (3): saldo 7',
     saldo && saldo.entradas === 10 && saldo.saidas === 3 && saldo.saldo === 7,
     saldo && [saldo.entradas, saldo.saidas, saldo.saldo].join(' / '));
  ok('a entrada leva o nome de quem lançou a nota, não de quem sincronizou',
     await p.evaluate(() => (nfMovGet(OBRA.id)[0] || {}).usuario) === 'Guilherme',
     await p.evaluate(() => (nfMovGet(OBRA.id)[0] || {}).usuario));
  await p.evaluate(() => nfCarregar(OBRA.id, { fundo: true }));
  await p.waitForTimeout(400);
  ok('sincronizar de novo não duplica a entrada', await p.evaluate(() => nfMovGet(OBRA.id).length) === 1,
     await p.evaluate(() => nfMovGet(OBRA.id).length));

  console.log('\nCANCELADA LÁ, SAI DAQUI');
  NOTAS = [nota('Cancelada', 1756800000000)];
  await p.evaluate(() => nfCarregar(OBRA.id, { fundo: true }));
  await p.waitForTimeout(400);
  ok('a nota cancelada em outro aparelho leva a entrada embora', await p.evaluate(() => nfMovGet(OBRA.id).length) === 0,
     await p.evaluate(() => nfMovGet(OBRA.id).length));

  console.log('\nTIRADA DO ESTOQUE LÁ, SAI DAQUI TAMBÉM');
  NOTAS = [nota('Integrada ao estoque', 1756900000000)];
  await p.evaluate(() => nfCarregar(OBRA.id, { fundo: true }));
  await p.waitForTimeout(400);
  ok('(integrada de novo: a entrada volta)', await p.evaluate(() => nfMovGet(OBRA.id).length) === 1,
     await p.evaluate(() => nfMovGet(OBRA.id).length));
  NOTAS = [nota('Conferida', 1757000000000)];
  await p.evaluate(() => nfCarregar(OBRA.id, { fundo: true }));
  await p.waitForTimeout(400);
  ok('a nota que deixou de estar integrada leva a entrada que a sincronização tinha dado',
     await p.evaluate(() => nfMovGet(OBRA.id).length) === 0, await p.evaluate(() => nfMovGet(OBRA.id).length));

  ok('nenhum erro de página', s.erros.length === 0, s.erros.join(' | '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
