// ÁREA SEGURA — o app instalado na tela de início do iPhone abre em tela
// cheia, e o conteúdo passa POR BAIXO da barra de status (relógio, bateria).
// O botão ENTRAR, que mora na barra do topo, ficava escondido lá atrás: o
// toque não chegava na página — o iOS o entendia como toque na barra de
// status — e o apontador simplesmente não conseguia entrar no sistema.
//
// O navegador de teste não tem notch, então `env(safe-area-inset-top)` vale
// sempre 0 e o defeito não apareceria aqui. Por isso o CSS lê os tokens
// `--sat/--sab/--sal/--sar`: o teste os sobrescreve com as medidas reais de
// um iPhone com notch e confere que nada clicável nasce dentro da faixa.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/area-segura.ui.test.js
const H = require('./harness.js');

// iPhone 14/15 em pé: 59 px de barra de status, 34 px da barra de gestos.
const SAT = 59, SAB = 34;

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); }
};

(async () => {
  const s = await H.abrir({ mobile: true });
  const { p } = s;

  // simula o iPhone em tela cheia (standalone + viewport-fit=cover)
  await p.evaluate(({ sat, sab }) => {
    document.documentElement.style.setProperty('--sat', sat + 'px');
    document.documentElement.style.setProperty('--sab', sab + 'px');
  }, { sat: SAT, sab: SAB });
  await p.waitForTimeout(150);

  // O que realmente responde ao toque num ponto: se o retorno não for o
  // próprio botão, o dedo do apontador acerta outra coisa.
  const alvoNoTopoDe = sel => p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { erro: 'elemento não existe' };
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + 4);
    const alvo = document.elementFromPoint(x, y);
    return { topo: Math.round(r.top), altura: Math.round(r.height),
             acerta: !!(alvo && (alvo === el || el.contains(alvo) || alvo.contains(el))) };
  }, sel);

  console.log('BOTÃO ENTRAR — o defeito relatado no iPhone');
  await s.ir('rdo');                      // tela restrita: força a barra com "Entrar"
  await p.waitForSelector('#topbarActions .btn', { timeout: 5000 });

  const entrar = await alvoNoTopoDe('#topbarActions .btn');
  ok('o botão nasce abaixo da barra de status', entrar.topo >= SAT, entrar);
  ok('e o toque no topo dele chega no botão', entrar.acerta === true, entrar);

  const menu = await alvoNoTopoDe('.mobile-menu-btn');
  ok('o botão do menu também escapa da faixa', menu.topo >= SAT, menu);
  ok('e recebe o toque', menu.acerta === true, menu);

  console.log('\nA BARRA DO TOPO — cresce, não encolhe');
  const barra = await p.evaluate((sat) => {
    const t = document.querySelector('.topbar');
    const r = t.getBoundingClientRect();
    return { topo: Math.round(r.top), altura: Math.round(r.height), esperado: 56 + sat };
  }, SAT);
  ok('mantém os 56 px de conteúdo e soma a área segura',
    barra.altura === barra.esperado, barra);
  ok('e continua encostada no alto da tela', barra.topo === 0, barra);

  console.log('\nFAIXA DA BARRA DE STATUS');
  const faixa = await p.evaluate(() => {
    const f = document.querySelector('.faixa-status');
    if (!f) return { erro: 'faixa não existe' };
    const st = getComputedStyle(f);
    return { altura: Math.round(f.getBoundingClientRect().height),
             toque: st.pointerEvents, fundo: st.backgroundColor };
  });
  ok('tem a altura da barra de status', faixa.altura === SAT, faixa);
  ok('e nunca rouba um toque', faixa.toque === 'none', faixa);

  console.log('\nGAVETA DO MENU — o primeiro item do menu');
  await p.evaluate(() => toggleSidebar());
  await p.waitForTimeout(400);
  const item = await alvoNoTopoDe('.sidebar .nav-item');
  ok('o primeiro item abre abaixo da faixa', item.topo >= SAT, item);
  ok('e recebe o toque', item.acerta === true, item);
  await p.evaluate(() => toggleSidebar());
  await p.waitForTimeout(300);

  console.log('\nBARRA INFERIOR — a barra de gestos do iPhone');
  const rodape = await p.evaluate((sab) => {
    const b = document.querySelector('.bottom-nav-item');
    if (!b) return { erro: 'barra inferior não existe' };
    const r = b.getBoundingClientRect();
    return { base: Math.round(window.innerHeight - r.bottom), esperado: sab };
  }, SAB);
  ok('os botões param acima da barra de gestos',
    rodape.base >= rodape.esperado, rodape);

  console.log('\nSEM NOTCH — o layout de antes não pode mudar');
  await p.evaluate(() => {
    document.documentElement.style.removeProperty('--sat');
    document.documentElement.style.removeProperty('--sab');
  });
  await p.waitForTimeout(150);
  const semNotch = await p.evaluate(() => ({
    barra: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
    faixa: Math.round(document.querySelector('.faixa-status').getBoundingClientRect().height),
  }));
  ok('a barra volta aos 56 px', semNotch.barra === 56, semNotch);
  ok('e a faixa some (altura zero)', semNotch.faixa === 0, semNotch);

  const erros = [...new Set(s.erros)];
  console.log('\n--- ERROS DE JS (' + erros.length + ') ---');
  erros.slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || erros.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await s.fechar();
  process.exit(falhas || erros.length ? 1 : 0);
})();
