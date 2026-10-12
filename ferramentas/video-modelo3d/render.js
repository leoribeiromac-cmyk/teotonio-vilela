/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// Gravador do vídeo do modelo: um quadro por vez, pelo tempo do roteiro.
// node render.js <roteiro.js> <saida/> [--q alta|leve] [--w 1920 --h 800] [--dpr 1.5] [--fps 24]
//   [--de s] [--ate s] [--planos id,id] [--passo n] [--msaa 0|4] [--jpeg .95]
const { chromium } = require(require.resolve('playwright', { paths: [require('path').join(__dirname, '../../tests')] }));
const H = require(require('path').join(__dirname, '../../tests/harness.js'));
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const ROT = require(path.resolve(A[0])), OUT = path.resolve(A[1]);
const Q = opt('q', 'alta'), W = +opt('w', 1920), HH = +opt('h', 800), DPR = +opt('dpr', 1), FPS = +opt('fps', 24), PASSO = +opt('passo', 1), MSAA = +opt('msaa', 0), JQ = +opt('jpeg', .95);
const PLANOS = opt('planos', '') ? opt('planos').split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = new Date().toISOString().slice(11, 19) + ' ' + a.join(' '); console.log(s); fs.appendFileSync(path.join(OUT, 'render.log'), s + '\n'); };
(async () => {
  await H.garantirServidor(8099);
  const b = await chromium.launch({ executablePath: H.CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const ctx = await b.newContext({ viewport: { width: W, height: HH }, deviceScaleFactor: DPR });
  const p = await ctx.newPage();
  p.on('pageerror', e => log('ERRO página:', e.message)); p.on('console', m => { if (m.type() === 'error' || /cine/i.test(m.text())) log('console:', m.text()); });
  const t0 = Date.now();
  await p.goto('http://localhost:8099/modelo3d.html?obra=teotonio&cine=1&q=' + Q, { waitUntil: 'load' });
  await p.waitForFunction(q => q === 'alta' ? window.__hqDone : window.__edifDone, Q, { timeout: 1800000, polling: 1000 });
  await p.evaluate(() => window.__cineAbrir());
  await p.evaluate(() => { window.__pause = true; });
  await p.evaluate(m => { const c = window.__dbg.composer; if (c) { c.renderTarget1.samples = m; c.renderTarget2.samples = m; } }, MSAA);
  if (ROT.preparar) await p.evaluate(ROT.preparar);
  const R = await p.evaluate(r => window.__cine.carregar(r), ROT.roteiro);
  log('modelo pronto em', Math.round((Date.now() - t0) / 1000), 's · roteiro', R.dur.toFixed(2), 's,', R.planos, 'planos · tela', W + 'x' + HH, '@' + DPR);
  const planos = ROT.roteiro.planos; let acc = 0; const ini = planos.map(pl => { const a = acc; acc += pl.dur; return a; });
  const f0 = Math.round(+opt('de', 0) * FPS), f1 = Math.round(+opt('ate', R.dur) * FPS);
  let feitos = 0, tAcum = 0;
  for (let f = f0; f < f1; f += PASSO) {
    const t = f / FPS, k = planos.findIndex((pl, i) => t < ini[i] + pl.dur); const pl = planos[k < 0 ? planos.length - 1 : k];
    if (PLANOS && !PLANOS.includes(pl.id)) continue;
    const arq = path.join(OUT, String(f).padStart(5, '0') + '.jpg'); if (fs.existsSync(arq)) continue;
    const tq = Date.now();
    const sub = pl.mb || 1, imgs = [];
    for (let s = 0; s < sub; s++) {
      const ts = sub > 1 ? t + (s / sub - .5) * (pl.obturador ?? .5) / FPS : t;
      // os quadros do plano anterior podem ter deixado o sol fora do lugar: o quadro é função só do tempo
      const st = await p.evaluate(([ts, rs]) => window.__cine.quadro(ts, { regenSol: rs }), [ts, pl.regenSol || ROT.regenSol || 'fim']);
      if (ROT.porQuadro) await p.evaluate(ROT.porQuadro, { t: ts, f, plano: pl.id, u: st && st.u });
      const d = await p.evaluate(q => window.__cine.foto('image/jpeg', q), JQ);
      imgs.push(Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
    }
    if (imgs.length === 1) fs.writeFileSync(arq, imgs[0]);
    else { imgs.forEach((im, s) => fs.writeFileSync(arq.replace('.jpg', '.s' + s + '.jpg'), im)); fs.writeFileSync(arq, imgs[imgs.length >> 1]); }
    if (pl.marcas) { const pts = await p.evaluate(m => window.__cine.projetar(m.map(x => x.p)), pl.marcas); fs.writeFileSync(arq.replace('.jpg', '.json'), JSON.stringify(pts)); }
    const dt = (Date.now() - tq) / 1000; tAcum += dt; feitos++;
    if (feitos % 10 === 1 || dt > 30) log('quadro', f, '(' + pl.id + ')', dt.toFixed(1) + ' s', '· média', (tAcum / feitos).toFixed(1), 's');
  }
  log('fim:', feitos, 'quadros em', Math.round(tAcum), 's');
  await b.close();
})().catch(e => { log('FALHOU', e && e.stack || e); process.exit(1); });
