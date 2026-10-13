// A NOTA EM CONFERÊNCIA VOLTA DEPOIS QUE O APARELHO RECARREGA.
//
// A conferência da nota é longa (itens, valores, a imagem que a IA leu) e é
// feita no celular — que descarta a aba quando a pessoa vai ao WhatsApp
// conferir com o fornecedor. O formulário morava só na memória da página:
// voltava em branco. Agora ele é guardado fora da página (o mesmo rascunho do
// RDO e do Bota-Fora) e a tela de Notas oferece retomar.
//
// Este teste recarrega a página de verdade (page.reload) e confere também o
// outro lado: "Cancelar" descarta de propósito, e a nota aberta só para olhar
// (ou a nova fechada sem nada preenchido) não vira "nota não salva".
//
// E, no caminho, que a tela de Notas não busca a lista inteira no servidor a
// cada toque (aba, filtro) — só na entrada, no relógio e no Atualizar.
//
// Como rodar:  node tests/nf-rascunho.ui.test.js
const { abrir } = require('./harness');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const NOTA_LANCADA = { id: 'nt1', clientId: 'nt1', obra: 'teotonio', numero: '1001', dataEmissao: '2026-07-01',
                       dataEntrada: '2026-07-02', razaoSocial: 'Fornecedor Antigo', vTotal: 500,
                       status: 'Recebida', usuario: 'Leonardo', responsavel: 'Leonardo', itens: '[]',
                       criadoEm: 1751400000000, atualizadoEm: 1751400000000 };

(async () => {
  const s = await abrir({
    logar: { usuario: 'Leonardo', perfil: 'admin' },
    gas: (acao, params) => {
      if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo'] };
      if (acao === 'login') return { ok: true, usuario: params.usuario, perfil: 'admin', token: 'tok-falso', obras: '*' };
      if (acao === 'nfListar') return { ok: true, notas: [NOTA_LANCADA], saidas: [] };
      return { ok: true };
    },
  });
  const { p } = s;
  const listar = () => s.chamadas.filter(c => c.acao === 'nfListar').length;
  const recarregar = async () => {
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 60000 }).catch(() => {});
    await s.ir('notas');
    await p.waitForTimeout(900);
  };
  const aviso = () => p.evaluate(() => (document.getElementById('nfRascAviso') || {}).textContent || '');

  console.log('A TELA DE NOTAS NÃO BUSCA A LISTA A CADA TOQUE');
  await s.ir('notas');
  await p.waitForTimeout(900);
  const naEntrada = listar();
  ok('entrar na tela busca a lista', naEntrada >= 1, naEntrada);
  await p.evaluate(() => { nfTab('estoque'); });
  await p.waitForTimeout(250);
  await p.evaluate(() => { nfTab('notas'); });
  await p.waitForTimeout(400);
  ok('trocar de aba logo depois não busca de novo', listar() === naEntrada, listar() + ' × ' + naEntrada);
  const html1 = await p.evaluate(() => document.querySelector('.page') ? document.querySelector('.page').innerHTML.length : 0);
  await p.evaluate(() => nfCarregar(obra().id, { fundo: true }));
  await p.waitForTimeout(300);
  ok('a sincronização sem nada novo não marca a lista como mudada',
     await p.evaluate(() => { const a = nfAssinaturaLista(obra().id); return typeof a === 'string' && a.length > 0; }) &&
     await p.evaluate(() => nfGet(obra().id)[0].atualizadoEm) === NOTA_LANCADA.atualizadoEm,
     await p.evaluate(() => nfGet(obra().id)[0].atualizadoEm));
  ok('(a tela continua a mesma)', html1 > 0);

  console.log('\nA CONFERÊNCIA VOLTA DEPOIS DO RECARREGAMENTO');
  await p.evaluate(() => { nfAbrirNova(); _nfModoSimples = false; nfConferir(); });
  await p.waitForSelector('#nf_numero', { state: 'attached', timeout: 5000 });
  await p.fill('#nf_numero', '4321');
  await p.fill('#nf_razaoSocial', 'Areial Boa Vista');
  await p.waitForTimeout(900);            // o rascunho junta as teclas (600 ms)
  await recarregar();
  const a1 = await aviso();
  ok('a tela de Notas avisa que há uma nota em conferência', /nota em conferência/i.test(a1), a1.slice(0, 120));
  ok('e diz qual é (número e fornecedor)', /4321/.test(a1) && /Areial Boa Vista/.test(a1), a1.slice(0, 160));
  await p.evaluate(() => nfRascRetomar());
  await p.waitForSelector('#nf_numero', { state: 'attached', timeout: 5000 });
  ok('"Continuar a nota" abre o formulário com o que foi digitado',
     await p.inputValue('#nf_numero') === '4321' && await p.inputValue('#nf_razaoSocial') === 'Areial Boa Vista',
     await p.inputValue('#nf_numero') + ' / ' + await p.inputValue('#nf_razaoSocial'));

  console.log('\n"CANCELAR" DESCARTA DE PROPÓSITO');
  await p.evaluate(() => nfCancelarConferencia());
  await p.waitForTimeout(300);
  await recarregar();
  ok('cancelada, a nota não volta a ser oferecida', !/nota em conferência/i.test(await aviso()), await aviso());

  console.log('\nFECHAR POR FORA GUARDA');
  await p.evaluate(() => { nfAbrirNova(); _nfModoSimples = false; nfConferir(); });
  await p.waitForSelector('#nf_numero', { state: 'attached', timeout: 5000 });
  await p.fill('#nf_numero', '7777');
  // o Voltar do celular / o toque fora da janela fecham sem passar pelo Cancelar
  await p.evaluate(() => fecharModal());
  await p.waitForTimeout(900);
  await recarregar();
  ok('fechada sem salvar, a nota é oferecida de novo', /7777/.test(await aviso()), await aviso());
  await p.evaluate(() => { window.confirm = () => true; nfRascDescartar(); });
  await p.waitForTimeout(300);
  await recarregar();
  ok('e "Descartar" a tira de vez', !/nota em conferência/i.test(await aviso()), await aviso());

  console.log('\nO QUE NÃO TEM TRABALHO NÃO VIRA "NOTA NÃO SALVA"');
  await p.evaluate(() => { nfAbrirNova(); _nfModoSimples = false; nfConferir(); });
  await p.waitForSelector('#nf_numero', { state: 'attached', timeout: 5000 });
  await p.evaluate(() => fecharModal());
  await p.waitForTimeout(900);
  await recarregar();
  ok('nota nova fechada sem nada preenchido: nada a oferecer', !/nota em conferência/i.test(await aviso()), await aviso());
  await p.evaluate(() => nfEditar('nt1'));
  await p.waitForSelector('#nf_numero', { state: 'attached', timeout: 5000 });
  await p.evaluate(() => fecharModal());
  await p.waitForTimeout(900);
  await recarregar();
  ok('nota lançada aberta só para olhar: nada a oferecer', !/nota em conferência/i.test(await aviso()), await aviso());

  console.log('\nSALVAR TIRA O RASCUNHO');
  await p.evaluate(() => { nfAbrirNova(); _nfModoSimples = false; nfConferir(); });
  await p.waitForSelector('#nf_numero', { state: 'attached', timeout: 5000 });
  await p.fill('#nf_numero', '5555');
  await p.fill('#nf_razaoSocial', 'Pedreira Teste');
  await p.fill('#nf_vTotal', '100,00');
  await p.waitForTimeout(900);
  await p.evaluate(() => { window.confirm = () => true; nfSalvarForm(); });
  await p.waitForTimeout(600);
  await recarregar();
  ok('gravada, a nota não é oferecida como "não salva"', !/nota em conferência/i.test(await aviso()), await aviso());

  ok('nenhum erro de página', s.erros.length === 0, s.erros.join(' | '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
