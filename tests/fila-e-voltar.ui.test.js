// A FILA DE ENVIO E O BOTÃO VOLTAR — no app de verdade.
//
// 1. O lançamento sobe com o login de QUEM O FEZ. O aparelho do canteiro
//    passa de mão: o turno do apontador A subia com o login de B (gravado em
//    nome de B, ou recusado como SEM_PERMISSAO — terminal — e apagado).
// 2. "Ação desconhecida" (backend antigo, corpo do POST perdido) não é defeito
//    do lançamento: ele fica guardado e é tentado de novo depois, e a fila
//    anda. Só o erro TERMINAL (o servidor recusou o conteúdo) tira da fila.
// 3. O Voltar do Android saía do app de uma vez. Agora cada tela é uma
//    entrada do histórico, e o Voltar primeiro fecha o que está por cima.
// 4. O aviso (toast) é TEXTO: o que vem de fora não vira HTML na tela.
//
// Como rodar:  node tests/fila-e-voltar.ui.test.js
const { abrir } = require('./harness');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const RESPOSTA = { lote: { ok: true } };

(async () => {
  const s = await abrir({
    logar: { usuario: 'Leonardo', perfil: 'admin' },
    gas: (acao, params) => {
      if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo', 'Wallace'] };
      if (acao === 'login') return { ok: true, usuario: params.usuario, perfil: 'admin', token: 'tok-falso', obras: '*' };
      if (acao === 'addBatchRDO') {
        const lote = JSON.parse(params.batch || '[]');
        const marca = (lote[0] || {}).Observacao || '';
        if (/espera/.test(marca)) return { ok: false, error: 'Ação desconhecida: addBatchRDO' };
        if (/terminal/.test(marca)) return { ok: false, error: 'batch inválido' };
        return { ok: true, inserted: lote.length };
      }
      return { ok: true };
    },
  });
  const { p } = s;
  const enviados = marca => s.chamadas.filter(c => c.acao === 'addBatchRDO' &&
    String(c.params.batch || '').indexOf(marca) !== -1).length;
  const naFila = marca => p.evaluate(m => outboxLer().filter(it => JSON.stringify(it.params || {}).indexOf(m) !== -1), marca);
  const guardar = (marca, dono) => p.evaluate(async ([m, d]) => {
    const antes = STATE.usuarioLogado;
    if (d) STATE.usuarioLogado = d;
    await outboxAdicionar({ kind: 'rdo', descricao: 'teste ' + m,
      params: { action: 'addBatchRDO', obra: OBRA.id,
                batch: JSON.stringify([{ ID: 'id-' + m, Data: '2026-09-22', Pacote_ID: 'P01', Quantidade: '1', Observacao: m }]) } });
    STATE.usuarioLogado = antes;
  }, [marca, dono || '']);

  console.log('O LANÇAMENTO SOBE COM O LOGIN DE QUEM O FEZ');
  await guardar('do-wallace', 'Wallace');
  await p.evaluate(() => outboxFlush(true));
  await p.waitForTimeout(800);
  ok('o lançamento do Wallace NÃO sobe com o login do Leonardo', enviados('do-wallace') === 0, enviados('do-wallace'));
  ok('e continua guardado no aparelho', (await naFila('do-wallace')).length === 1);
  const aviso = await p.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map(e => e.textContent).join(' | '));
  ok('o aviso diz de quem é e que sobe quando ele entrar', /Wallace/.test(aviso), aviso.slice(0, 160));

  console.log('\nESPERA × TERMINAL');
  await guardar('espera-1');
  await guardar('normal-1');
  await p.evaluate(() => outboxFlush(true));
  await p.waitForTimeout(1200);
  const espera = await naFila('espera-1');
  ok('"Ação desconhecida": o lançamento FICA guardado', espera.length === 1);
  ok('marcado para tentar de novo mais tarde (sem bater no servidor a cada 30 s)',
     espera[0] && espera[0].esperarAte > Date.now(), espera[0] && espera[0].esperarAte);
  ok('e a fila andou: o lançamento de trás subiu', enviados('normal-1') === 1 && (await naFila('normal-1')).length === 0,
     enviados('normal-1'));
  await guardar('terminal-1');
  await p.evaluate(() => outboxFlush(true));
  await p.waitForTimeout(800);
  ok('erro TERMINAL (o servidor recusou o conteúdo): sai da fila', (await naFila('terminal-1')).length === 0);
  const avisoTerm = await p.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map(e => e.textContent).join(' | '));
  ok('com aviso para lançar de novo pela tela', /recusado pelo servidor/.test(avisoTerm), avisoTerm.slice(0, 200));

  console.log('\nO PDF QUE FICOU DEVENDO (turno de outra obra)');
  // a tela está em OUTRA obra quando o turno da Teotônio termina de subir
  const dia = '2025-01-10';
  await p.evaluate(() => navigate('executivo'));
  await p.waitForTimeout(300);
  const anotou = await p.evaluate(async (d) => {
    OBRA.id = 'ranario';
    const r = await depositoDepoisDeGravar('teotonio', d, false);
    OBRA.id = 'teotonio';
    return { r, lista: depositosPendentesLer() };
  }, dia);
  ok('com a tela em outra obra, o PDF não é desenhado agora', anotou.r === false &&
     s.chamadas.filter(c => c.acao === 'rdoPdfDoDia').length === 0, JSON.stringify(anotou.r));
  ok('fica anotado no aparelho', anotou.lista.some(x => x.obra === 'teotonio' && x.data === dia), JSON.stringify(anotou.lista));
  const feitos = await p.evaluate(() => depositosPendentesRodar());
  await p.waitForTimeout(500);
  const dep = s.chamadas.filter(c => c.acao === 'rdoPdfDoDia');
  ok('a obra de volta à tela: o PDF daquele dia sai', feitos === 1 && dep.length === 1 && dep[0].params.data === dia,
     feitos + ' · ' + dep.map(c => c.params.data).join(','));
  ok('e a anotação some', await p.evaluate(() => depositosPendentesLer().length) === 0);

  console.log('\nO BOTÃO VOLTAR');
  await p.evaluate(() => navigate('executivo'));
  await p.waitForTimeout(300);
  await p.evaluate(() => navigate('historico'));
  await p.waitForTimeout(300);
  await p.evaluate(() => history.back());
  await p.waitForTimeout(600);
  ok('Voltar leva à tela anterior (não sai do app)', await p.evaluate(() => STATE.currentPage) === 'executivo',
     await p.evaluate(() => STATE.currentPage));
  await p.evaluate(() => navigate('historico'));
  await p.waitForTimeout(300);
  await p.evaluate(() => abrirModalRDO('<p id="modalTeste">aberto</p>'));
  await p.evaluate(() => history.back());
  await p.waitForTimeout(600);
  ok('com algo aberto por cima, o Voltar fecha isso primeiro', await p.evaluate(() => !document.getElementById('modalRDO')));
  ok('e a tela fica onde estava', await p.evaluate(() => STATE.currentPage) === 'historico',
     await p.evaluate(() => STATE.currentPage));

  console.log('\nO AVISO É TEXTO');
  await p.evaluate(() => { window.__xss = 0; toast('<img src=x onerror="window.__xss=1"> nome de fora', 'info', 3000); });
  await p.waitForTimeout(300);
  ok('HTML vindo de fora aparece como texto, não roda', await p.evaluate(() => window.__xss === 0 &&
     ![...document.querySelectorAll('.toast img')].length));

  ok('nenhum erro de página', s.erros.length === 0, s.erros.join(' | '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
