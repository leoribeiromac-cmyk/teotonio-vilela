// O QUE O APONTADOR ALCANÇA COM O CELULAR NA MÃO.
//
// Três medições no celular de 390×844 mostraram o app entregando menos do
// que tem:
//
// 1) BOTÃO FORA DA TELA. "Sair (Leonardo · Administrador)" ocupava a largura
//    toda da barra de topo e o "+ Novo Serviço" terminava em 492px numa
//    janela de 390px. O atalho mais usado do app ficava fora do alcance
//    justamente de quem só tem celular.
//
// 2) A OBRA ABAIXO DA DOBRA. A barra de filtros gastava 196px dos 844px da
//    tela e o número do avanço só começava em y=753. Quem abria o Painel
//    Executivo no celular via dois seletores e um aviso — e tinha de rolar
//    para descobrir como a obra estava.
//
// 3) METADE DO MENU ESCONDIDA. Na gaveta, o rodapé preso (conta, estado da
//    sincronização, ATUALIZAR, APRESENTAR, tema e crédito) ocupava 355px e
//    sobravam 309px para uma navegação de 894px: 6 dos 15 itens. Todo o
//    grupo "Operação" — Lançar, RDO, Histórico, Equipamentos, Galeria,
//    Projetos — ficava invisível, sem pista de que havia mais embaixo.
//
// Como rodar:  node tests/celular-alcance.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

(async () => {
  // ================================================= barra de topo
  console.log('\n── barra de topo, em cada largura de celular ──');
  for (const largura of [320, 360, 390, 430]) {
    const s = await H.abrir({ mobile: true, viewport: { width: largura, height: 844 },
                              logar: { usuario: 'Leonardo', perfil: 'admin' } });
    // Fora da tela de lançamento: é lá que "+ Novo Serviço" leva a algum
    // lugar. NA tela de lançamento ele não é renderizado de propósito —
    // quatro botões deixavam ~70px para o bloco do título, e é o subtítulo
    // que diz onde o lançamento grava (conferido logo abaixo).
    await s.ir('historico');
    await s.p.waitForTimeout(400);
    const r = await s.p.evaluate(() => {
      const tb = document.querySelector('.topbar');
      const acts = document.getElementById('topbarActions');
      const botoes = [...(acts ? acts.children : [])].map(b => {
        const c = b.getBoundingClientRect();
        return { rotulo: (b.getAttribute('title') || b.textContent).trim().slice(0, 20),
                 w: Math.round(c.width), h: Math.round(c.height),
                 fora: c.right > window.innerWidth + 1 || c.left < -1 };
      });
      return { transborda: tb.scrollWidth > tb.clientWidth + 1, botoes,
               temNovoServico: !!acts && /Novo Serviço/.test(acts.textContent) };
    });
    ok(`${largura}px · a barra de topo não transborda`, !r.transborda);
    ok(`${largura}px · nenhum botão do topo fica fora da tela`,
       r.botoes.every(b => !b.fora),
       JSON.stringify(r.botoes.filter(b => b.fora)));
    ok(`${largura}px · "+ Novo Serviço" continua lá`, r.temNovoServico);
    ok(`${largura}px · todo botão do topo tem alvo de 44px`,
       r.botoes.every(b => b.w >= 44 && b.h >= 44),
       JSON.stringify(r.botoes.filter(b => b.w < 44 || b.h < 44)));

    // ...e na PRÓPRIA tela de lançamento o botão sai de cena e a linha
    // volta para o título e o subtítulo.
    await s.ir('rdo');
    await s.p.waitForTimeout(400);
    const noRdo = await s.p.evaluate(() => {
      const acts = document.getElementById('topbarActions');
      const bloco = document.querySelector('.topbar > div:first-child');
      const sub = document.getElementById('pageSubtitle');
      const c = bloco ? bloco.getBoundingClientRect() : null;
      return {
        temNovoServico: !!acts && /Novo Serviço/.test(acts.textContent),
        larguraTitulo: c ? Math.round(c.width) : 0,
        subVisivel: !!sub && getComputedStyle(sub).display !== 'none',
      };
    });
    ok(`${largura}px · na tela de lançamento, "+ Novo Serviço" não se repete`,
       !noRdo.temNovoServico);
    // Com quatro botões sobravam ~70px para o bloco do título; com três,
    // o título e o subtítulo cabem.
    ok(`${largura}px · o bloco do título fica com espaço de verdade (≥ 130px)`,
       noRdo.larguraTitulo >= 130, noRdo.larguraTitulo + 'px');
    if (largura >= 390) {
      ok(`${largura}px · e o subtítulo (onde o lançamento grava) volta a aparecer`,
         noRdo.subVisivel);
    }
    await s.fechar();
  }

  // ================================================= dobra do painel
  console.log('\n── a obra tem de aparecer sem rolar ──');
  const s2 = await H.abrir({ mobile: true, logar: { usuario: 'Leonardo', perfil: 'admin' },
                             rdo: H.gerarRDO({ linhas: 800 }) });
  await s2.ir('executivo');
  await s2.p.waitForTimeout(1100);
  const painel = await s2.p.evaluate(() => {
    const fb = document.querySelector('.filter-bar');
    const hero = document.querySelector('.exec-hero');
    const valor = document.querySelector('.hero-value');
    const controles = [...document.querySelectorAll('.filter-bar select, .filter-bar input, .filter-bar button')]
      .map(e => { const c = e.getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height) }; });
    return {
      alturaFiltro: fb ? Math.round(fb.getBoundingClientRect().height) : null,
      topoHero: hero ? Math.round(hero.getBoundingClientRect().top) : null,
      topoValor: valor ? Math.round(valor.getBoundingClientRect().top) : null,
      janela: window.innerHeight,
      controles,
      transbordo: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  ok('a barra de filtros cabe numa faixa (≤ 80px)', painel.alturaFiltro <= 80, painel.alturaFiltro + 'px');
  ok('o cartão do avanço começa acima da dobra', painel.topoHero < painel.janela,
     `topo ${painel.topoHero} · janela ${painel.janela}`);
  ok('o NÚMERO do avanço aparece sem rolar', painel.topoValor !== null && painel.topoValor < painel.janela,
     `topo do número ${painel.topoValor} · janela ${painel.janela}`);
  ok('nada vaza na horizontal', !painel.transbordo);
  ok('todo controle de filtro tem 44px de alvo',
     painel.controles.every(c => c.w >= 44 && c.h >= 44),
     JSON.stringify(painel.controles.filter(c => c.w < 44 || c.h < 44)));
  await s2.fechar();

  // ================================================= gaveta de menu
  console.log('\n── a gaveta tem de mostrar o grupo Operação ──');
  const s3 = await H.abrir({ mobile: true, logar: { usuario: 'Leonardo', perfil: 'admin' } });
  await s3.ir('executivo');
  await s3.p.waitForTimeout(500);
  await s3.p.evaluate(() => toggleSidebar(true));
  await s3.p.waitForTimeout(400);
  const gaveta = await s3.p.evaluate(() => {
    const itens = [...document.querySelectorAll('.sidebar-nav .nav-item')];
    const naTela = itens.filter(el => {
      const c = el.getBoundingClientRect();
      return c.top >= 0 && c.bottom <= window.innerHeight;
    });
    const sb = document.querySelector('.sidebar');
    const texto = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      total: itens.length,
      naTela: naTela.length,
      rotulosNaTela: naTela.map(texto),
      gavetaRola: sb.scrollHeight > sb.clientHeight + 1,
      // com a gaveta rolada até o fim, o rodapé tem de estar alcançável
      alcancaTodos: itens.length > 0,
    };
  });
  ok('a gaveta rola por inteiro', gaveta.gavetaRola);
  ok('pelo menos 10 dos 15 itens aparecem sem rolar', gaveta.naTela >= 10,
     `${gaveta.naTela} de ${gaveta.total}`);
  ok('"Lançar Serviço" aparece sem rolar',
     gaveta.rotulosNaTela.some(t => /Lançar/.test(t)), gaveta.rotulosNaTela.join(' | '));
  ok('"RDO Diário" aparece sem rolar',
     gaveta.rotulosNaTela.some(t => /RDO/.test(t)), gaveta.rotulosNaTela.join(' | '));
  ok('"Histórico" aparece sem rolar',
     gaveta.rotulosNaTela.some(t => /Histórico/.test(t)), gaveta.rotulosNaTela.join(' | '));

  // e o rodapé continua alcançável rolando
  await s3.p.evaluate(() => { document.querySelector('.sidebar').scrollTop = 99999; });
  await s3.p.waitForTimeout(300);
  const rodape = await s3.p.evaluate(() => {
    const sair = [...document.querySelectorAll('.sync-block button')]
      .find(b => /SAIR|ENTRAR|APRESENTAR/i.test(b.textContent));
    if (!sair) return { achou: false };
    const c = sair.getBoundingClientRect();
    return { achou: true, naTela: c.top >= 0 && c.bottom <= window.innerHeight };
  });
  ok('rolando a gaveta até o fim, o rodapé fica alcançável',
     rodape.achou && rodape.naTela, JSON.stringify(rodape));
  ok('nenhum erro de JS', s3.erros.length === 0, s3.erros.slice(0, 3).join(' | '));
  await s3.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
