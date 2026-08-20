// A PRANCHA PARADA NÃO PODE FICAR NA GPU.
//
// A folha é o único elemento que recebe o transform, e `will-change` +
// `backface-visibility` + `translate3d` a transformam numa CAMADA: arrastar e
// ampliar viram uma matriz na placa de vídeo, sem redesenhar nada. É o que faz
// o gesto correr solto, e é para isso que a camada existe.
//
// O preço é que camada é rasterizada UMA VEZ, numa escala escolhida na hora —
// e o `will-change` é literalmente o pedido para NÃO refazer esse raster quando
// o transform muda. Parada, a folha ficava sendo esticada (ou reduzida) a partir
// de um raster velho: desenho borrado do jeito que se via, que só endireitava
// quando alguma outra coisa da página obrigava o navegador a redesenhar — o
// "depois de dois minutos aparece a resolução certa".
//
// Então a camada é do MOVIMENTO, não da folha. Este teste é a trava: se alguém
// devolver o `will-change` para o `.proj-folha`, ou deixar o `translate3d` fixo
// no transform, o borrão volta em silêncio e só aparece no computador de quem
// usa. Roda com:  node tests/prancha-camada.ui.test.js
const { chromium } = require('playwright');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8129;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
const encerrar = () => { try { srv.kill(); } catch (e) { } };
process.on('exit', encerrar);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  // Computador: é onde a folha aparece REDUZIDA (a A1 inteira cabe na tela), e
  // reduzir na GPU, sem redesenhar, é o que mais come traço fino de CAD.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();

  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t);
  });

  await p.route('**://script.google.com/**', (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback');
    route.fulfill({ status: 200, contentType: 'application/javascript', body: cb + '({"ok":true})' });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => navigate('projetos'));
  await p.waitForSelector('.proj-quadrado', { timeout: 15000 });
  await p.waitForTimeout(1200);

  const ler = () => p.evaluate(() => {
    const f = VISOR.folha, cs = getComputedStyle(f);
    return {
      naGPU: cs.willChange === 'transform' || cs.backfaceVisibility === 'hidden'
             || /translate3d|matrix3d/.test(f.style.transform),
      classe: f.className, willChange: cs.willChange,
      gesto: VISOR.gesto, arrastando: VISOR.arrastando,
      deslizando: VISOR.deslizando, emCamada: VISOR.emCamada,
    };
  });

  console.log('PARADA, A FOLHA É CONTEÚDO NORMAL');
  let e = await ler();
  ok('recém-aberta, a folha não está na GPU', !e.naGPU, JSON.stringify(e));
  ok('e o estado do visor concorda', e.emCamada === false && e.gesto === 0, JSON.stringify(e));

  console.log('\nEM MOVIMENTO, VAI PARA A GPU');
  await p.evaluate(() => visorAnimar(VISOR.max, VISOR.cx / 2, VISOR.cy / 2));
  await p.waitForTimeout(90);
  e = await ler();
  ok('durante a animação de zoom a folha vira camada', e.naGPU, JSON.stringify(e));
  ok('e o transform é 3D, que é o que segura a camada', e.classe.indexOf('movendo') > -1, e.classe);

  await p.waitForTimeout(1000);
  e = await ler();
  ok('terminada a animação, ela sai da camada', !e.naGPU, JSON.stringify(e));

  console.log('\nA RODA DO MOUSE CONTA COMO UM GESTO SÓ');
  await p.mouse.move(700, 400);
  await p.mouse.wheel(0, -120);
  await p.waitForTimeout(40);
  ok('rodando, está na GPU', (await ler()).naGPU);
  await p.waitForTimeout(600);
  ok('parou de rodar, saiu da GPU', !(await ler()).naGPU);

  console.log('\nO ARRASTO SIMPLES E A INÉRCIA TAMBÉM');
  // O `V.gesto` só conta a PINÇA. Se o arrasto de um dedo não entrasse no
  // estado de movimento, a folha sairia da camada e o navegador redesenharia a
  // prancha inteira a cada quadro do arrasto — trocando o borrão por engasgo.
  await p.mouse.move(700, 400);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(700 - i * 22, 400); await p.waitForTimeout(8); }
  const arrastando = await ler();
  ok('com o botão apertado, arrastando, a folha está na GPU', arrastando.naGPU,
    JSON.stringify(arrastando));
  await p.mouse.up();
  await p.waitForTimeout(60);
  const noMeio = await ler();
  await p.waitForTimeout(2500);
  const depois = await ler();
  ok('a inércia mantém a camada enquanto corre', noMeio.naGPU, JSON.stringify(noMeio));
  ok('e, parada a inércia, a folha volta a ser conteúdo normal', !depois.naGPU, JSON.stringify(depois));
  ok('sem contador de movimento pendurado', depois.gesto === 0 && depois.deslizando === 0
    && depois.arrastando === false, JSON.stringify(depois));

  // Um toque que NÃO anda (sem inércia, sem toque duplo) sai por outro caminho
  // do `soltou` — e era o caminho fácil de esquecer de aplicar.
  await p.mouse.move(700, 400); await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(500);
  const clique = await ler();
  ok('um clique parado também devolve a folha ao conteúdo normal', !clique.naGPU,
    JSON.stringify(clique));

  console.log('\nO NÍVEL PINTADO CONTINUA DANDO CONTA DA TELA');
  await p.evaluate(() => { prachaAjustar(); });
  await p.waitForTimeout(900);
  const res = await p.evaluate(() => {
    const V = VISOR, nv = V.niveis[V.nivelAtual];
    return { precisa: V.s * Math.min(3, window.devicePixelRatio || 1), tem: nv.res, nivel: V.nivelAtual };
  });
  ok('o nível na tela tem pelo menos a resolução que a tela pede',
    res.tem >= res.precisa * 0.9, JSON.stringify(res));

  ok('nenhum erro de página', err.length === 0, err.join(' | '));

  await b.close(); encerrar();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
