// BUSCA GLOBAL, E O DOM DO HISTÓRICO.
//
// 1) BUSCA. São 15 telas e nenhum caminho entre elas: quem lembrava da
//    estaca E112, do pacote "Muro C" ou do RDO de um dia tinha de adivinhar
//    em qual tela procurar e refazer o filtro na mão. Um campo só passa a
//    entender as quatro coisas que se procura numa obra — estaca, pacote,
//    lançamento e RDO — e leva direto ao lugar, já filtrado.
//
// 2) O DOM DO HISTÓRICO. O formulário de edição vinha pronto em TODA linha
//    da tabela, escondido com display:none. Medido com 100 linhas: 14.327
//    nós, dos quais 11.500 dentro dessas linhas invisíveis, e 5.330 <option>
//    porque cada linha carregava um <select> com os 49 pacotes da obra. Era
//    o maior DOM do app, montado para um formulário que quase nunca abre —
//    no aparelho que menos aguenta. Agora a linha nasce vazia e o formulário
//    é construído no clique.
//
// Como rodar:  node tests/busca-global.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' },
                            rdo: H.gerarRDO({ linhas: 400 }) });
  await s.ir('executivo');
  await s.p.waitForTimeout(800);

  // ================================================= abrir e fechar
  console.log('\n── abrir e fechar ──');
  await s.p.keyboard.press('Control+k');
  await s.p.waitForTimeout(300);
  ok('Ctrl+K abre a busca', await s.p.evaluate(() => !!document.getElementById('buscaOverlay')));
  ok('o campo já vem focado',
     await s.p.evaluate(() => document.activeElement && document.activeElement.id === 'buscaInput'));
  await s.p.keyboard.press('Escape');
  await s.p.waitForTimeout(250);
  ok('Esc fecha', await s.p.evaluate(() => !document.getElementById('buscaOverlay')));

  await s.p.evaluate(() => buscaAbrir());
  await s.p.waitForTimeout(250);

  // ================================================= o que ela entende
  console.log('\n── o que a busca entende ──');
  const busca = async termo => {
    await s.p.evaluate(t => buscaDigitou(t), termo);
    await s.p.waitForTimeout(180);
    return s.p.evaluate(() => ({
      n: BUSCA.itens.length,
      grupos: [...new Set(BUSCA.itens.map(i => i.grupo))],
      titulos: BUSCA.itens.map(i => i.titulo),
    }));
  };

  const estaca = await busca('E112');
  ok('acha lançamentos por estaca', estaca.n > 0 && estaca.grupos.includes('Serviços lançados'),
     JSON.stringify(estaca.grupos));

  const pac = await busca('P03');
  ok('acha pacote pelo código', pac.grupos.includes('Pacotes'), JSON.stringify(pac.grupos));

  const frente = await busca('muro');
  ok('acha pacotes pela frente', frente.grupos.includes('Pacotes'), JSON.stringify(frente.grupos));

  const tela = await busca('medi');
  ok('acha tela pelo assunto', tela.grupos.includes('Telas') && tela.titulos.some(t => /Medição/.test(t)),
     JSON.stringify(tela.titulos));

  const semAcento = await busca('medicao');
  ok('acha sem acento também ("medicao")',
     semAcento.grupos.includes('Telas'), JSON.stringify(semAcento.grupos));

  const nada = await busca('zzzzqqqq');
  ok('não inventa resultado', nada.n === 0, nada.n + '');

  const vazio = await busca('');
  ok('campo vazio não lista nada', vazio.n === 0, vazio.n + '');

  // ================================================= navegar
  console.log('\n── navegar pelo teclado ──');
  await busca('E112');
  const sel0 = await s.p.evaluate(() => BUSCA.sel);
  await s.p.keyboard.press('ArrowDown');
  await s.p.waitForTimeout(120);
  const sel1 = await s.p.evaluate(() => BUSCA.sel);
  ok('a seta para baixo move a seleção', sel1 === sel0 + 1, `${sel0} → ${sel1}`);
  await s.p.keyboard.press('ArrowUp');
  await s.p.waitForTimeout(120);
  ok('a seta para cima volta', await s.p.evaluate(() => BUSCA.sel) === sel0);

  await s.p.keyboard.press('Enter');
  await s.p.waitForTimeout(800);
  const foi = await s.p.evaluate(() => ({
    fechou: !document.getElementById('buscaOverlay'),
    tela: STATE.currentPage,
    filtro: HIST_FILTRO.busca,
  }));
  ok('Enter fecha a busca', foi.fechou);
  ok('Enter leva ao Histórico', foi.tela === 'historico', foi.tela);
  ok('e já deixa o filtro preenchido com a estaca', /E112/.test(foi.filtro || ''), foi.filtro);

  ok('nenhum erro de JS na busca', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  // ================================================= DOM do histórico
  console.log('\n── o peso do Histórico ──');
  const s2 = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' },
                             rdo: H.gerarRDO({ linhas: 1200 }) });
  await s2.ir('historico');
  await s2.p.waitForTimeout(1000);
  const dom = await s2.p.evaluate(() => ({
    total: document.getElementsByTagName('*').length,
    options: document.getElementsByTagName('option').length,
    linhas: document.querySelectorAll('table tbody tr').length,
  }));
  ok('o Histórico não passa de 6.000 nós com 1.200 serviços', dom.total < 6000, dom.total + ' nós');
  ok('não carrega milhares de <option> escondidos', dom.options < 200, dom.options + ' options');

  // e a edição continua funcionando
  const antes = dom.total;
  await s2.p.evaluate(() => { document.querySelector('[id^="hedit-toggle-"]').click(); });
  await s2.p.waitForTimeout(500);
  const aberto = await s2.p.evaluate(() => {
    const row = [...document.querySelectorAll('[id^="hist-edit-row-"]')].find(r => r.style.display !== 'none');
    if (!row) return null;
    const campo = c => row.querySelector(`[id^="hedit-${c}-"]`);
    const sel = campo('pacote');
    return {
      temTodosOsCampos: ['data','turno','pacote','qtd','sentido','estini','estfim','equipe','apontador','obs']
        .every(c => !!campo(c)),
      opcoes: sel ? sel.options.length : 0,
      selecionado: sel ? sel.value : null,
      nos: document.getElementsByTagName('*').length,
    };
  });
  ok('abrir a edição monta o formulário completo', aberto && aberto.temTodosOsCampos, JSON.stringify(aberto));
  ok('com a lista de pacotes carregada', aberto && aberto.opcoes > 10, aberto ? aberto.opcoes + '' : '-');
  ok('e com o pacote do lançamento já selecionado', !!(aberto && aberto.selecionado), aberto ? aberto.selecionado : '-');

  await s2.p.evaluate(() => { document.querySelector('[id^="hedit-toggle-"]').click(); });
  await s2.p.waitForTimeout(350);
  const fechado = await s2.p.evaluate(() => document.getElementsByTagName('*').length);
  ok('fechar devolve os nós ao navegador', fechado === antes, `${antes} → ${aberto ? aberto.nos : '?'} → ${fechado}`);
  ok('nenhum erro de JS no Histórico', s2.erros.length === 0, s2.erros.slice(0, 3).join(' | '));
  await s2.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
