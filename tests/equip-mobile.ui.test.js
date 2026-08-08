// A tela de Equipamentos é preenchida em pé, com uma mão, no canteiro — e era
// a que pior se comportava no celular:
//
//   • a linha de parada não cabia na largura: motivo + duas horas + "até" +
//     lixeira na mesma linha punham o botão de apagar para fora do cartão;
//   • o total de horas — que é o número que a tela existe para produzir —
//     rolava para fora da vista assim que se lançava a primeira parada;
//   • o botão de enviar só aparecia depois de rolar o formulário inteiro;
//   • a barra de navegação de baixo (position:fixed, z-index 999) ficava POR
//     CIMA dos modais, comendo o pé de Cadastros e do Painel;
//   • "Gerar medição" e o filtro de equipamento estouravam a caixa do Painel.
//
// Este teste mede a tela num aparelho de verdade e cobra que nada disso volte.
// De quebra confere que a conta das horas continua descontando as paradas —
// o layout mexeu na estrutura da linha, e é ela que a conta percorre.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/equip-mobile.ui.test.js
const { chromium } = require('playwright');

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

const EQUIPS = [
  { nome: 'Escavadeira Hidráulica CAT 320D', tipo: 'Linha Amarela', vinculo: 'Locado', locadora: 'Locarma Máquinas e Equipamentos', ativo: 'SIM' },
  { nome: 'Caminhão Basculante Mercedes 2726', tipo: 'Transporte', vinculo: 'Locado', locadora: 'Transportes Vale Verde', ativo: 'SIM' },
];
const APONT = Array.from({ length: 12 }, (_, i) => ({
  id: 'AP' + i, data: '2026-08-' + String(i + 1).padStart(2, '0'),
  turno: i % 3 ? 'Diurno' : 'Noturno', equipamento: EQUIPS[i % 2].nome,
  operador: 'José Carlos da Silva Pereira', horas: '9.00', status: 'Operacional',
  horimInicial: 100, horimFinal: 109, combustivel: 80, observacoes: '', assinatura: '',
}));

async function abrirTela(navegador, largura, altura) {
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.route('**script.google*.com/**', rota => {
    const u = new URL(rota.request().url());
    const cb = u.searchParams.get('callback');
    const acao = u.searchParams.get('action') || '';
    let c = { ok: true };
    if (acao === 'login') c = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') c = { ok: true, usuarios: ['Leonardo'] };
    c.equipamentos = EQUIPS; c.locadoras = [{ nome: 'Locarma Máquinas e Equipamentos', obs: '' }];
    c.apontamentos = APONT;
    rota.fulfill({ status: 200, contentType: 'application/javascript',
                   body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  await p.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: '' }));

  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1100);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 10000 });
  await p.evaluate(async () => {
    document.getElementById('loginUserSelect').value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => navigate('equip'));
  await p.waitForSelector('#apontamentoForm', { timeout: 10000 });
  await p.waitForTimeout(500);
  return { p, erros };
}

// Nada pode passar da largura da tela — é o sintoma clássico de mobile quebrado.
const medirEstouro = (p, escopo) => p.evaluate((sel) => {
  const W = window.innerWidth;
  const fora = [];
  document.querySelectorAll(sel).forEach(e => {
    const b = e.getBoundingClientRect();
    if (!b.width || getComputedStyle(e).visibility === 'hidden') return;
    if (b.right > W + 2 || b.left < -2)
      fora.push((e.tagName + '.' + (typeof e.className === 'string' ? e.className : '')).slice(0, 48)
                + ' [' + Math.round(b.left) + '…' + Math.round(b.right) + ']');
  });
  return { W, doc: document.documentElement.scrollWidth, fora: fora.slice(0, 5) };
}, escopo);

(async () => {
  const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  console.log('EQUIPAMENTOS NO CELULAR — 390×844');
  const { p, erros } = await abrirTela(navegador, 390, 844);

  // ---------- a conta das horas, que a reforma da linha podia quebrar ----------
  await p.evaluate(() => { EQ.adicionarParada(); EQ.adicionarParada(); });
  await p.waitForTimeout(250);
  const horas = await p.evaluate(() => {
    document.getElementById('inicio').value = '07:00';
    document.getElementById('fim').value = '17:00';
    const linhas = [...document.querySelectorAll('#paradasList .parada-row')];
    const conf = [['12:00', '13:00'], ['15:00', '15:30']];
    linhas.forEach((r, i) => {
      r.querySelector('.parada-motivo').selectedIndex = i + 1;
      r.querySelector('.parada-inicio').value = conf[i][0];
      r.querySelector('.parada-fim').value = conf[i][1];
    });
    EQ.calcularHoras();
    const antes = document.getElementById('horas').value;
    linhas[1].querySelector('.parada-remover').click();
    return { comParadas: antes, depoisDeApagar: document.getElementById('horas').value,
             sobraram: document.querySelectorAll('#paradasList .parada-row').length };
  });
  ok('as paradas continuam sendo descontadas (10h − 1h30)', horas.comParadas === '8.50', horas.comParadas + 'h');
  ok('apagar uma parada devolve o tempo dela', horas.depoisDeApagar === '9.00' && horas.sobraram === 1,
     horas.depoisDeApagar + 'h, ' + horas.sobraram + ' linha(s)');

  // ---------- nada estoura a largura ----------
  const form = await medirEstouro(p, '#apontamentoForm *, .eq-topo *');
  ok('o formulário cabe na largura da tela', form.fora.length === 0 && form.doc <= form.W,
     form.fora.join(' | ') || ('página com ' + form.doc + 'px'));

  // ---------- alvo de dedo ----------
  const miudos = await p.evaluate(() => [...document.querySelectorAll('#apontamentoForm button')]
    .map(e => ({ el: (e.className || e.id).slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
    .filter(x => x.h > 0 && x.h < 40));
  ok('nenhum botão do formulário abaixo de 40px de altura', miudos.length === 0, JSON.stringify(miudos));

  // ---------- o que precisa ficar à vista, fica ----------
  await p.evaluate(() => { document.querySelector('.main').scrollTop = 450; });
  await p.waitForTimeout(350);
  const grudados = await p.evaluate(() => {
    const H = window.innerHeight;
    const dentro = el => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= H + 1; };
    const nav = document.querySelector('.bottom-nav-mobile');
    const btn = document.getElementById('submitBtn');
    return {
      horas: dentro(document.querySelector('.eq-horas')),
      botao: dentro(btn),
      acimaDaNav: !nav || btn.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1,
    };
  });
  ok('o total de horas segue visível depois de rolar', grudados.horas);
  ok('o botão de enviar segue visível depois de rolar', grudados.botao);
  ok('e não fica escondido atrás da barra de navegação', grudados.acimaDaNav);

  // ---------- os modais mandam na tela ----------
  for (const [nome, abre, alvoTexto] of [
    ['Cadastros', () => EQ.abrirCadastros(), 'CADASTROS'],
    ['Painel', () => EQ.abrirPainel(), 'PAINEL DE EQUIPAMENTOS'],
  ]) {
    await p.evaluate(f => { document.querySelectorAll('.eq-modal').forEach(m => m.style.display = 'none'); eval('(' + f + ')()'); }, abre.toString());
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const cx = document.querySelector('.eq-modal[style*="flex"] .eq-modal-caixa');
      const r = cx.getBoundingClientRect();
      const noPe = document.elementFromPoint(Math.round(window.innerWidth / 2), window.innerHeight - 20);
      return { topo: Math.round(r.top), altura: Math.round(r.height), H: window.innerHeight,
               noPe: noPe ? (noPe.tagName + '.' + (typeof noPe.className === 'string' ? noPe.className : '')).slice(0, 40) : null };
    });
    ok(nome + ': o modal toma a tela toda no celular', m.topo === 0 && m.altura >= m.H - 1,
       'topo ' + m.topo + ', altura ' + m.altura + ' de ' + m.H);
    ok(nome + ': a barra de navegação não fica por cima do modal',
       !/bottom-nav/.test(String(m.noPe)), 'no pé da tela: ' + m.noPe);
    const dentro = await medirEstouro(p, '.eq-modal[style*="flex"] *');
    ok(nome + ': nada estoura a largura', dentro.fora.length === 0, dentro.fora.join(' | '));
  }

  ok('sem erro de página', erros.length === 0, erros[0]);

  // ---------- telas menores e o limite do tablet ----------
  for (const [larg, alt] of [[360, 740], [768, 1024]]) {
    const t = await abrirTela(navegador, larg, alt);
    await t.p.evaluate(() => EQ.adicionarParada());
    await t.p.waitForTimeout(250);
    const e = await medirEstouro(t.p, '#apontamentoForm *, .eq-topo *');
    ok(`cabe também em ${larg}px`, e.fora.length === 0 && e.doc <= e.W, e.fora.join(' | '));
    await t.p.context().close();
  }

  await navegador.close();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
