/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ============================================================
   VISOR DO MODELO 3D (modelo3d.html)
   ------------------------------------------------------------
   É o visualizador da página do modelo (pipeline "modelo 3D viário":
   montagem, conferência e publicação), trazido para dentro do app. O que
   mudou em relação à página publicada, e por quê:

   · DADOS DE modelo3d/<obra>/ — o índice deixou de vir embutido no HTML e
     os trechos vêm compactados (.bin, ver desempacotar() e
     ferramentas/modelo3d-importar.py): 2,4 MB no lugar de 15 MB de JSON.
   · SEM CDN — three.js, os complementos e o ez-tree vêm de vendor/three/,
     como todo o resto do app (o canteiro abre sem sinal).
   · DESENHA SÓ QUANDO ALGO MUDA — a página original pintava 60 quadros por
     segundo parada; no celular isso é bateria e calor à toa. Agora a cena
     só é redesenhada quando a câmera anda, um trecho chega, uma camada
     muda… (invalidar()). A água só ondula no modo Alta e com o córrego
     à vista.
   · PONTE COM O APP — a camada "Serviços lançados (RDO)": o app manda as
     estacas com serviço e a cor de cada uma, o visor deita uma faixa sobre
     a pista de cada estaca e devolve ao app a estaca que foi tocada. Estaca
     com foto ganha um pino de câmera (camada "Fotos do RDO"), e o app manda
     as miniaturas prontas da estaca aberta. Na linha do tempo do app as
     faixas chegam a cada quadro: a geometria de cada uma fica guardada
     (_geoFx) e só é refeita quando um trecho novo do modelo chega.
   · Saíram as exportações (DXF, SketchUp, OBJ, GLB, LandXML) e os ganchos
     de exportação do pipeline: são para o escritório, e ficam na página do
     modelo.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const $ = id => document.getElementById(id);
// ---------- de onde vem o modelo: modelo3d/<obra>/ (o id só leva letra, número e traço)
const PARAMS = new URLSearchParams(location.search);
const OBRA_ID = (PARAMS.get('obra') || 'teotonio').replace(/[^a-z0-9-]/gi, '') || 'teotonio';
const BASE = 'modelo3d/' + OBRA_ID + '/';
const PAI = window.parent !== window ? window.parent : null;   // o app, quando o visor está dentro dele
const EMBED = !!PAI || PARAMS.get('embed') === '1';
function falhou(txt) {
  const l = $('loading'); if (l) l.remove();
  $('erroTxt').textContent = txt; $('erro').hidden = false;
}

/* ---------- PACOTE .bin ("M3DP" 1) — o par de ferramentas/modelo3d-importar.py
   gzip( 'M3DP' | versão u32 | tamanho do cabeçalho u32 | cabeçalho JSON | alinha 8 | dados )
   O cabeçalho é o objeto do trecho com cada vetor trocado por {"@": k}; arrays[k]
   diz onde ele está e como foi gravado (q = milímetro em diferença por componente,
   d = índice em diferença, f = float32, r = bytes), sempre em zigue-zague e com os
   bytes embaralhados por plano. Mudou lá, mude aqui. */
async function gunzip(buf) {
  if (typeof DecompressionStream === 'function') {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).arrayBuffer();
  }
  // navegador antigo (iPhone antes do iOS 16.4): o fflate do vendor, só neste caso
  const { gunzipSync } = await import('three/addons/libs/fflate.module.js');
  const u = gunzipSync(new Uint8Array(buf)); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
}
function desempacotar(ab) {
  const u8 = new Uint8Array(ab), dv = new DataView(ab);
  if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'M3DP') throw new Error('arquivo do modelo inválido');
  if (dv.getUint32(4, true) !== 1) throw new Error('versão do pacote desconhecida: ' + dv.getUint32(4, true));
  const hl = dv.getUint32(8, true);
  const H = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hl)));
  const base = (12 + hl + 7) & ~7;
  const vet = H.arrays.map(a => {
    const n = a.n, w = a.w, src = u8.subarray(base + a.o, base + a.o + n * w);
    if (a.e === 'r') return src.slice();
    let z;   // desembaralha: o byte k do valor i está em src[k * n + i]
    if (w === 1) z = src;
    else { const b = new Uint8Array(n * w); for (let k = 0; k < w; k++) { const o = k * n; for (let i = 0; i < n; i++) b[i * w + k] = src[o + i]; } z = w === 2 ? new Uint16Array(b.buffer) : new Uint32Array(b.buffer); }
    if (a.e === 'f') return new Float32Array(z.buffer, z.byteOffset, n);
    if (a.e === 'd') { const out = new Uint32Array(n); let acc = 0; for (let i = 0; i < n; i++) { const v = z[i]; acc += (v >>> 1) ^ -(v & 1); out[i] = acc; } return out; }
    const c = a.c || 1, acc = new Float64Array(c), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = z[i], k = i % c; acc[k] += (v >>> 1) ^ -(v & 1); out[i] = acc[k] / 1000; }
    return out;
  });
  const volta = o => Array.isArray(o) ? o.map(volta) : o && typeof o === 'object' ? ('@' in o && Object.keys(o).length === 1 ? vet[o['@']] : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, volta(v)]))) : o;
  return volta(H.root);
}
async function lerArquivo(rel) {   // .bin compactado ou .json do pipeline, tanto faz
  const r = await fetch(BASE + rel); if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + rel);
  if (!/\.bin$/.test(rel)) return r.json();
  return desempacotar(await gunzip(await r.arrayBuffer()));
}
let M;
try { const r = await fetch(BASE + 'index.json'); if (!r.ok) throw new Error('HTTP ' + r.status); M = await r.json(); }
catch (e) {
  falhou(navigator.onLine === false ? 'Sem sinal, e este aparelho ainda não guardou o modelo. Abra uma vez com internet (ou use "Guardar para abrir sem sinal" na tela do app).' : 'O índice do modelo não chegou (' + (e && e.message || e) + ').');
  throw e;
}
const TEX = (M.pacote && M.pacote.tex) || {};
const texUrl = f => { const k = f.replace(/\.(jpe?g|png|webp)$/i, ''); return BASE + (TEX[k] || 'tex/' + f); };
const fmt = (v, d = 3) => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const AZ = (M.origin.az || 0) * Math.PI / 180;
const Uv = [Math.sin(AZ), Math.cos(AZ)], Rv = [Math.cos(AZ), -Math.sin(AZ)];
const Z0 = M.origin.Z;
const V = (x, y, z) => new THREE.Vector3(x, z, -y);
const bearingRot = az => -az * Math.PI / 180; // rotation.y so that local -Z faces bearing
const ajRow = a => a && a.ajuste > 0 ? [['Posição', `recuada ${fmt(a.ajuste, 2)} m para o passeio (símbolo do projeto caía na pista)`]] : [];
const FEAT = M.feat || {}; const feat = k => Array.isArray(FEAT[k]) ? FEAT[k] : [];
const fin = Number.isFinite;
// ---------- quality: 'alta' (PC: texturas fotográficas, árvores detalhadas, oclusão de ambiente, nuvens) or 'leve' (celular / PC fraco)
const Q_KEY = 'tv3d_qualidade';
const Q_URL = new URLSearchParams(location.search).get('q');
let Q_PREF = null; try { Q_PREF = localStorage.getItem(Q_KEY); } catch { }
const WEAK = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory < 4) || Math.min(screen.width, screen.height) < 600;
const Q_ALTA = Q_URL ? Q_URL === 'alta' : Q_PREF ? Q_PREF === 'alta' : !WEAK;
const ezP = Q_ALTA ? import('@dgreenheck/ez-tree').catch(e => { console.warn('Árvores detalhadas indisponíveis:', e && e.message); return null; }) : null;

// ---------- base64 arrays ({b64, t: F|U|B})
function dec(o) {
  if (o == null) return null; if (Array.isArray(o) || ArrayBuffer.isView(o)) return o; if (typeof o.b64 !== 'string') return null;
  const bin = atob(o.b64), n = bin.length, u8 = new Uint8Array(n); for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
  return o.t === 'F' ? new Float32Array(u8.buffer) : o.t === 'U' ? new Uint32Array(u8.buffer) : u8;
}

// ---------- stations
const estStr = m => { m = Math.round(m * 100) / 100; const n = Math.floor(m / 20 + 1e-9), r = m - n * 20; return `${n}+${r.toFixed(2).padStart(5, '0').replace('.', ',')}`; };
const parseEst = str => { const m = String(str).trim().replace(',', '.').match(/^(\d+)(?:\s*\+\s*([\d.]+))?$/); return m ? +m[1] * 20 + (m[2] ? +m[2] : 0) : null; };

// ---------- triangle grid (plan) for fast "top surface" and TIN lookups
function triGrid(P, I, three, cs = 2) {
  const nv = P.length / 3; if (nv < 3) return null;
  const X = new Float32Array(nv), Y = new Float32Array(nv), Z = new Float32Array(nv);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < nv; i++) { const x = P[3 * i], y = three ? -P[3 * i + 2] : P[3 * i + 1]; X[i] = x; Y[i] = y; Z[i] = three ? P[3 * i + 1] : P[3 * i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!(x1 >= x0 && y1 >= y0)) return null;
  while (((x1 - x0) / cs + 1) * ((y1 - y0) / cs + 1) > 2e6) cs *= 1.5;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cs)), ny = Math.max(1, Math.ceil((y1 - y0) / cs)), nc = nx * ny;
  const nt = (I ? I.length : nv) / 3 | 0; const start = new Uint32Array(nc + 1); const bb = new Int32Array(nt * 4); const ok = new Uint8Array(nt);
  const cx = x => Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cs))), cy = y => Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cs)));
  for (let t = 0; t < nt; t++) {
    const a = I ? I[3 * t] : 3 * t, b = I ? I[3 * t + 1] : 3 * t + 1, c = I ? I[3 * t + 2] : 3 * t + 2;
    const area = (X[b] - X[a]) * (Y[c] - Y[a]) - (X[c] - X[a]) * (Y[b] - Y[a]); if (!(Math.abs(area) > 1e-9)) continue; ok[t] = 1;
    const i0 = cx(Math.min(X[a], X[b], X[c])), i1 = cx(Math.max(X[a], X[b], X[c])), j0 = cy(Math.min(Y[a], Y[b], Y[c])), j1 = cy(Math.max(Y[a], Y[b], Y[c]));
    bb[4 * t] = i0; bb[4 * t + 1] = i1; bb[4 * t + 2] = j0; bb[4 * t + 3] = j1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) start[j * nx + i + 1]++;
  }
  for (let k = 0; k < nc; k++) start[k + 1] += start[k];
  const list = new Uint32Array(start[nc]); const fill = start.slice(0, nc);
  for (let t = 0; t < nt; t++) { if (!ok[t]) continue; for (let j = bb[4 * t + 2]; j <= bb[4 * t + 3]; j++) for (let i = bb[4 * t]; i <= bb[4 * t + 1]; i++) list[fill[j * nx + i]++] = t; }
  return { X, Y, Z, I, x0, y0, x1, y1, cs, nx, ny, start, list };
}
function gridZ(G, x, y) { // highest z among triangles containing (x, y); NaN if none
  if (!G || x < G.x0 || x > G.x1 || y < G.y0 || y > G.y1) return NaN;
  const i = Math.min(G.nx - 1, Math.floor((x - G.x0) / G.cs)), j = Math.min(G.ny - 1, Math.floor((y - G.y0) / G.cs)), c = j * G.nx + i;
  const { X, Y, Z, I, list } = G; let best = NaN;
  for (let k = G.start[c], e = G.start[c + 1]; k < e; k++) {
    const t = list[k], a = I ? I[3 * t] : 3 * t, b = I ? I[3 * t + 1] : 3 * t + 1, cc = I ? I[3 * t + 2] : 3 * t + 2;
    const xa = X[a], ya = Y[a], xb = X[b], yb = Y[b], xc = X[cc], yc = Y[cc];
    const d = (yb - yc) * (xa - xc) + (xc - xb) * (ya - yc);
    const l1 = ((yb - yc) * (x - xc) + (xc - xb) * (y - yc)) / d; if (l1 < -1e-6) continue;
    const l2 = ((yc - ya) * (x - xc) + (xa - xc) * (y - yc)) / d; if (l2 < -1e-6) continue;
    const l3 = 1 - l1 - l2; if (l3 < -1e-6) continue;
    const z = l1 * Z[a] + l2 * Z[b] + l3 * Z[cc]; if (!(z <= best)) best = z;
  }
  return best;
}

// ---------- alignments (sampled every dm from m0)
function mkAlign(key, a) {
  const xy = dec(a.xy); const n = a.n || xy.length / 2; const g = a.g ? dec(a.g) : null, tn = a.tn ? dec(a.tn) : null;
  const ms = new Float64Array(n); let L = 0; for (let i = 1; i < n; i++) L += Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
  if (a.ms) { const q = dec(a.ms); for (let i = 0; i < n; i++) ms[i] = q[i]; }
  else if (Math.abs(L - a.dm * (n - 1)) > Math.max(0.5, 0.005 * L)) { // samples not evenly spaced: stations from the accumulated length
    console.info(`Eixo ${key}: amostras não uniformes; estacas pelo comprimento acumulado.`);
    ms[0] = a.m0; for (let i = 1; i < n; i++) ms[i] = ms[i - 1] + Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
  } else for (let i = 0; i < n; i++) ms[i] = a.m0 + i * a.dm;
  function loc(m) {
    if (!(m > ms[0])) return [0, 0]; if (m >= ms[n - 1]) return [n - 2, 1];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (ms[md] <= m) lo = md; else hi = md; }
    const d = ms[lo + 1] - ms[lo]; return [lo, d > 0 ? (m - ms[lo]) / d : 0];
  }
  const tg = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1); const dx = xy[2 * i1] - xy[2 * i0], dy = xy[2 * i1 + 1] - xy[2 * i0 + 1]; const l = Math.hypot(dx, dy) || 1; tg[2 * i] = dx / l; tg[2 * i + 1] = dy / l; }
  const pos = m => { const [i, f] = loc(m); return [xy[2 * i] + f * (xy[2 * i + 2] - xy[2 * i]), xy[2 * i + 1] + f * (xy[2 * i + 3] - xy[2 * i + 1])]; };
  const dir = m => { const [i, f] = loc(m); const dx = tg[2 * i] + f * (tg[2 * i + 2] - tg[2 * i]), dy = tg[2 * i + 1] + f * (tg[2 * i + 3] - tg[2 * i + 1]); const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const interp = (arr, m) => { const [i, f] = loc(m); return arr[i] + f * (arr[i + 1] - arr[i]); };
  // spatial grid of segments for proj()
  const CS = 20; let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (let i = 0; i < n; i++) { gx0 = Math.min(gx0, xy[2 * i]); gx1 = Math.max(gx1, xy[2 * i]); gy0 = Math.min(gy0, xy[2 * i + 1]); gy1 = Math.max(gy1, xy[2 * i + 1]); }
  gx0 -= CS; gy0 -= CS; const GW = Math.ceil((gx1 - gx0) / CS) + 2, GH = Math.ceil((gy1 - gy0) / CS) + 2; const cells = new Map();
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.floor((Math.min(xy[2 * i], xy[2 * i + 2]) - gx0) / CS), i1 = Math.floor((Math.max(xy[2 * i], xy[2 * i + 2]) - gx0) / CS);
    const j0 = Math.floor((Math.min(xy[2 * i + 1], xy[2 * i + 3]) - gy0) / CS), j1 = Math.floor((Math.max(xy[2 * i + 1], xy[2 * i + 3]) - gy0) / CS);
    for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) { const k = ii * 65536 + jj; let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i); }
  }
  function proj(p) { // -> [station, D (+ right of the stationing direction), distance, beyondEnds]
    const x = p[0], y = p[1]; let best = Infinity, bi = 0, bf = 0;
    const test = i => { const ax = xy[2 * i], ay = xy[2 * i + 1], dx = xy[2 * i + 2] - ax, dy = xy[2 * i + 3] - ay; const l2 = dx * dx + dy * dy; let f = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; f = Math.max(0, Math.min(1, f)); const qx = ax + f * dx - x, qy = ay + f * dy - y; const d2 = qx * qx + qy * qy; if (d2 < best) { best = d2; bi = i; bf = f; } };
    const cx = Math.floor((x - gx0) / CS), cy = Math.floor((y - gy0) / CS);
    if (cx < -1 || cy < -1 || cx > GW || cy > GH) { for (let i = 0; i < n - 1; i++) test(i); }
    else for (let r = 0, R = Math.max(GW, GH) + 1; r <= R; r++) {
      for (let ii = cx - r; ii <= cx + r; ii++) for (let jj = cy - r; jj <= cy + r; jj++) { if (Math.max(Math.abs(ii - cx), Math.abs(jj - cy)) !== r || ii < 0 || jj < 0) continue; const c = cells.get(ii * 65536 + jj); if (c) for (const i of c) test(i); }
      if (best < Infinity && Math.sqrt(best) <= r * CS) break;
    }
    const ax = xy[2 * bi], ay = xy[2 * bi + 1]; let dx = xy[2 * bi + 2] - ax, dy = xy[2 * bi + 3] - ay; const qx = ax + bf * dx, qy = ay + bf * dy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    return [ms[bi] + bf * (ms[bi + 1] - ms[bi]), (x - qx) * dy - (y - qy) * dx, Math.sqrt(best), (bi === 0 && bf <= 0) || (bi === n - 2 && bf >= 1)];
  }
  return { key, n, xy, ms, g, tn, m0: ms[0], m1: ms[n - 1], pos, dir, proj,
    z: m => g ? interp(g, m) : NaN, tnAt: m => tn ? interp(tn, m) : NaN };
}
const ALN = {}; for (const [k, a] of Object.entries(M.align || {})) { try { ALN[k] = mkAlign(k, a); } catch (e) { console.warn('Eixo ' + k + ' inválido', e); } }
const AXES = Object.keys(ALN);
const axisRange = P => ALN[P] ? `${estStr(ALN[P].m0)} a ${estStr(ALN[P].m1)}` : '—';
function axisBearing(x, y) { const A = ALN.PD || ALN[AXES[0]]; if (!A) return M.origin.az || 0; const d = A.dir(A.proj([x, y])[0]); return Math.atan2(d[0], d[1]) * 180 / Math.PI; }
// natural ground (survey TIN)
const NG = M.ngtin ? triGrid(dec(M.ngtin.v), dec(M.ngtin.f), false, 6) : null;
const ngZ = (x, y) => gridZ(NG, x, y);

// ---------- renderer / scene
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }); }
catch (e) { falhou('Este aparelho (ou navegador) não abriu o 3D: o WebGL está desligado ou indisponível. As outras telas do app continuam funcionando.'); avisarApp({ tipo: 'falhou', motivo: 'webgl' }); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q_ALTA || WEAK ? 1.5 : 2));   // celular: tela de 3x desenhada a 1,5x — a diferença não se vê, o calor sim
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const EXPO0 = Q_ALTA ? 0.75 : 0.62; renderer.toneMappingExposure = EXPO0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
/* SOMBRA ESTÁTICA. A cena não se mexe: o mapa de sombra só é redesenhado
   quando o enquadramento da sombra anda (updSun), o sol muda ou a cena muda
   (trecho, camada, árvore, corte) — invalidarSombra(). Refeito a cada quadro,
   eram ~760 objetos desenhados de novo só para repetir a mesma sombra: quase
   metade das chamadas de desenho de cada quadro ao girar a câmera. */
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
function invalidarSombra() { renderer.shadowMap.needsUpdate = true; }
renderer.localClippingEnabled = true;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.3, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.screenSpacePanning = true; controls.maxDistance = 2600;
controls.mouseButtons = { LEFT: -1, MIDDLE: -1, RIGHT: -1 };   // mouse handled by the AutoCAD-style navigation below; touch stays here
// quadro sob demanda (ver "DESENHA SÓ QUANDO ALGO MUDA", junto do laço de desenho)
let sujo = 3, ultimoQuadro = 0, carregando = true, quadroAnterior = false;
function invalidar(n = 2) { if (n > sujo) sujo = n; }
window.__invalidar = invalidar;
const AGUAS = [];   // malhas de água (buildTile e entorno), para saber se o córrego está à vista

// sky (follows the camera) + sun
const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 3.2; su.rayleigh.value = 2.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
const sunBearing = 300 * Math.PI / 180, sunElev = 42 * Math.PI / 180;
const sunDir = new THREE.Vector3(Math.sin(sunBearing) * Math.cos(sunElev), Math.sin(sunElev), -Math.cos(sunBearing) * Math.cos(sunElev));
su.sunPosition.value.copy(sunDir);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); envScene.add(sky2);
Object.assign(sky2.material.uniforms.sunPosition.value, sunDir); sky2.material.uniforms.turbidity.value = 3.2; sky2.material.uniforms.rayleigh.value = 2.4;
if (Q_ALTA) for (const sk of [sky, sky2]) { const m = sk.material; m.uniforms.uSkyScale = { value: .12 };   // linear (HDR) sky instead of the built-in gamma curve -> deep blue, correct IBL
  m.fragmentShader = m.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( texColor * uSkyScale, 1.0 );').replace('void main() {', 'uniform float uSkyScale;\nvoid main() {'); }
// procedural cloud layer (a plane at ~1,8 km seen through a dome at the far plane); in the environment capture the dome also gets a ground
function cloudMat(ground) {
  return new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, transparent: true, fog: false,
    uniforms: { uSun: { value: sunDir }, uGround: { value: ground ? 1 : 0 }, uCov: { value: .6 }, uOff: { value: new THREE.Vector2(3.1, 7.7) } },
    vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uGround, uCov; uniform vec2 uOff; varying vec3 vDir;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p){ float a = .5, s = 0.; mat2 R = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 6; i++) { s += a * vn(p); p = R * p; a *= .5; } return s; }
      void main(){ vec3 d = normalize(vDir);
        if (d.y < 0.0) { if (uGround > .5) { float k = smoothstep(0., -.25, d.y); gl_FragColor = vec4(mix(vec3(.46, .47, .43), vec3(.23, .25, .19), k), 1.); } else discard; return; }
        vec2 q = d.xz / (d.y + .08) * 1.35 + uOff;
        float n = fbm(q), n2 = fbm(q * 2.3 + 11.7);
        float c = smoothstep(uCov, uCov + .28, n * .78 + n2 * .32);
        float sh = fbm(q + uSun.xz * .18);                       // self-shadow: brighter towards the sun
        float lit = clamp(.62 + (n - sh) * 2.2, .35, 1.05);
        vec3 col = mix(vec3(.66, .70, .76), vec3(1.0, .985, .96), lit) * (1.25 + .6 * max(dot(d, uSun), 0.));
        float fade = smoothstep(.015, .16, d.y);
        gl_FragColor = vec4(col, c * fade * .92); }` });
}
if (Q_ALTA) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), cloudMat(false)); dome.renderOrder = -1; dome.frustumCulled = false; dome.userData.noAO = true; scene.add(dome); sky.userData.noAO = true; sky.userData.dome = dome;
  const dome2 = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), cloudMat(true)); envScene.add(dome2);
}
let envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture;
const NEVOA0 = 0.00026, NEVOA_COR0 = Q_ALTA ? 0xb9c9d6 : 0xcfd8dc; scene.fog = Q_ALTA ? new THREE.FogExp2(NEVOA_COR0, NEVOA0) : new THREE.Fog(NEVOA_COR0, 900, 4200);

const SUN_I = Q_ALTA ? 3.4 : 3.2;
const sun = new THREE.DirectionalLight(0xfff1dc, SUN_I);
sun.castShadow = true; sun.shadow.mapSize.set(WEAK && !Q_ALTA ? 2048 : 4096, WEAK && !Q_ALTA ? 2048 : 4096);   // 4096² são 64 MB de GPU: no celular, 2048
let SH = 90, SOL_D = 220; const sc = sun.shadow.camera; sc.left = -SH; sc.right = SH; sc.top = SH; sc.bottom = -SH; sc.near = 1; sc.far = 520;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
/* SOMBRA AMPLA (cinema): para as vistas do alto, uma sombra só, parada, cobrindo
   a obra inteira — a padrão (±90 m em volta do alvo) deixava sem sombra tudo o
   que ficava longe, e era refeita a cada 18 m de voo. null volta à padrão. */
const SOMBRA = { centro: null };
function sombraConfig(cfg) {
  const meia = cfg ? cfg.meia || 450 : 90, mapa = cfg ? cfg.mapa || 8192 : (WEAK && !Q_ALTA ? 2048 : 4096);
  SH = meia; SOL_D = cfg ? meia * 1.6 : 220;
  sc.left = -SH; sc.right = SH; sc.top = SH; sc.bottom = -SH; sc.far = cfg ? meia * 3.4 : 520; sc.updateProjectionMatrix();
  sun.shadow.normalBias = cfg ? 0.04 * meia / 90 * .5 : 0.04;
  if (sun.shadow.mapSize.x !== mapa) { sun.shadow.mapSize.set(mapa, mapa); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  SOMBRA.centro = cfg && cfg.centro ? V(cfg.centro[0], cfg.centro[1], cfg.centro[2] || 0) : null;
  sunKey.a = NaN; updSun(true);
}
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xdfe9f2, 0x6b5a45, Q_ALTA ? 0.12 : 0.55); scene.add(hemi);
// shadow frustum (±90 m) follows the camera target, snapped to shadow texels — mas só
// quando o alvo se afasta mais de 18 m do centro atual: girar e aproximar não refazem a sombra
const _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _st = new THREE.Vector3(), sunKey = { a: NaN, b: NaN, c: NaN };
function updSun(force) {
  const t = SOMBRA.centro || controls.target; _sr.crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize(); _su.crossVectors(sunDir, _sr).normalize();
  const tx = 2 * SH / sun.shadow.mapSize.x; const a = Math.round(t.dot(_sr) / tx) * tx, b = Math.round(t.dot(_su) / tx) * tx, c = t.dot(sunDir);
  if (!force && Math.hypot(a - sunKey.a, b - sunKey.b) < 18 && Math.abs(c - sunKey.c) < 18) return;
  sunKey.a = a; sunKey.b = b; sunKey.c = c; invalidarSombra();
  _st.copy(_sr).multiplyScalar(a).addScaledVector(_su, b).addScaledVector(sunDir, c);
  sun.target.position.copy(_st); sun.target.updateMatrixWorld(); sun.position.copy(_st).addScaledVector(sunDir, SOL_D);
}

// ---------- procedural textures
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
function canvasTex(size, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function speckle(g, S, base, n, cols, rmin, rmax, seed) {
  g.fillStyle = base; g.fillRect(0, 0, S, S); const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.25 + r() * 0.6; const rr = rmin + r() * (rmax - rmin); g.beginPath(); g.arc(r() * S, r() * S, rr, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
function mottled(g, S, cols, seed, blobs = 260, rmin = 20, rmax = 90, alpha = .10) {
  const r = rng(seed); for (let i = 0; i < blobs; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = alpha * r(); const rr = rmin + r() * (rmax - rmin); const x = r() * S, y = r() * S; for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.beginPath(); g.arc(x + dx, y + dy, rr, 0, 7); g.fill(); } } g.globalAlpha = 1;
}
const TX = {};
TX.macro = canvasTex(512, (g, S) => { g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); mottled(g, S, ['#000000', '#ffffff'], 97, 900, 18, 90, .16); mottled(g, S, ['#000000', '#ffffff'], 98, 260, 70, 170, .14); }, { srgb: false });
// large-scale colour variation in world space (breaks the texture tiling; worn paint)
function macroize(m, amp = .16, scale = 1 / 31) {
  m.onBeforeCompile = sh => {
    sh.uniforms.tMacro = { value: TX.macro }; sh.uniforms.uMacro = { value: new THREE.Vector2(amp, scale) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMacroP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMacroP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMacroP; uniform sampler2D tMacro; uniform vec2 uMacro;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec2 q = vMacroP.xz * uMacro.y; float n = texture2D(tMacro, q).r * .6 + texture2D(tMacro, q * 3.7 + .31).r * .4; diffuseColor.rgb *= 1.0 + uMacro.x * (n - .5) * 2.0; }');
  };
  m.customProgramCacheKey = () => 'macro' + amp + '|' + scale;
}
TX.asfalto = canvasTex(1024, (g, S) => { speckle(g, S, '#3a3c3f', 26000, ['#1d1e20', '#55575a', '#6b6d70', '#2a2b2d', '#80807c'], .6, 2.1, 7); mottled(g, S, ['#000', '#777'], 3, 120, 40, 160, .07); });
TX.concreto = canvasTex(1024, (g, S) => { speckle(g, S, '#b9b7b0', 16000, ['#a9a7a0', '#c9c7c0', '#9d9a92', '#d4d2cb'], .5, 1.6, 11); mottled(g, S, ['#8e8b84', '#d8d6cf'], 5, 160, 30, 120, .08);
  g.strokeStyle = 'rgba(70,68,62,.55)'; g.lineWidth = 3; for (const p of [0, S / 2]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); } });
TX.rigido = canvasTex(1024, (g, S) => { speckle(g, S, '#aeaca5', 14000, ['#9b988f', '#c2c0b8', '#8f8c84'], .5, 1.5, 13); mottled(g, S, ['#7d7a72', '#cfcdc6'], 9, 140, 40, 160, .09);
  g.strokeStyle = 'rgba(40,40,36,.75)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 2); g.lineTo(S, 2); g.stroke(); g.beginPath(); g.moveTo(2, 0); g.lineTo(2, S); g.stroke();
  g.strokeStyle = 'rgba(60,58,52,.18)'; g.lineWidth = 1; for (let i = 0; i < 90; i++) { const y = i * S / 90; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); } });
TX.ciclovia = canvasTex(512, (g, S) => { speckle(g, S, '#9c3d33', 9000, ['#7f2f27', '#b04b40', '#8c352c'], .5, 1.5, 17); mottled(g, S, ['#5a1d18', '#c05a4c'], 2, 90, 20, 80, .08); });
TX.sarjeta = canvasTex(512, (g, S) => { speckle(g, S, '#bdbab2', 7000, ['#a8a59d', '#cfccc4', '#98958d'], .5, 1.4, 19); g.strokeStyle = 'rgba(60,58,52,.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 1); g.lineTo(S, 1); g.stroke(); });
TX.grama = canvasTex(1024, (g, S) => { g.fillStyle = '#4f7a31'; g.fillRect(0, 0, S, S); mottled(g, S, ['#3a5f22', '#6d9340', '#7a8f3a', '#4a6b2a'], 21, 420, 20, 110, .22); const r = rng(5);
  for (let i = 0; i < 60000; i++) { const x = r() * S, y = r() * S, l = 2 + r() * 5; g.strokeStyle = ['#3d6424', '#6f9a3c', '#86a84a', '#2f5019'][i % 4]; g.globalAlpha = .55; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 2, y - l); g.stroke(); } g.globalAlpha = 1; });
TX.terreno = canvasTex(1024, (g, S) => { g.fillStyle = '#5f7a38'; g.fillRect(0, 0, S, S); mottled(g, S, ['#7b6a45', '#4d6a2c', '#8a8a4a', '#6d5a3a', '#3f5a24'], 23, 520, 25, 140, .25); const r = rng(8);
  for (let i = 0; i < 45000; i++) { const x = r() * S, y = r() * S; g.strokeStyle = ['#4a6a2a', '#7a9444', '#5b4a30', '#93a257'][i % 4]; g.globalAlpha = .45; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 3, y - 2 - r() * 4); g.stroke(); } g.globalAlpha = 1; });
const soilTex = (base, cols, seed, grav) => canvasTex(512, (g, S) => { speckle(g, S, base, grav, cols, .6, grav > 9000 ? 3.5 : 2.2, seed); mottled(g, S, cols, seed + 1, 80, 20, 70, .12); });
TX.cbuq = soilTex('#232426', ['#111', '#444', '#5a5a58'], 31, 9000);
TX.bgtc = soilTex('#8d8c84', ['#6f6e67', '#a7a69d', '#5d5c56', '#b9b7ad'], 33, 12000);
TX.bgs = soilTex('#8a7f6e', ['#6a6152', '#a39883', '#5a5244', '#b3a894'], 35, 14000);
TX.ccr = soilTex('#9d9b93', ['#85837b', '#b3b1a8'], 37, 8000);
TX.brita = soilTex('#7e7a72', ['#5e5a54', '#9a958c', '#4a4640'], 39, 15000);
TX.subleito = soilTex('#9a5536', ['#7d4128', '#b0663f', '#8a4a2e'], 41, 3000);
TX.solo = soilTex('#8b4a2d', ['#6d3620', '#a75b36', '#7a4027', '#5c2d1a'], 43, 2500);
TX.humus = soilTex('#4a3524', ['#2f2116', '#5d4430', '#3a2a1c'], 45, 3000);
TX.tatil_alerta = canvasTex(256, (g, S) => { g.fillStyle = '#e8b81a'; g.fillRect(0, 0, S, S); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const x = (i + .5) * S / 6, y = (j + .5) * S / 6; const gr = g.createRadialGradient(x - 3, y - 3, 1, x, y, 13); gr.addColorStop(0, '#fff2b8'); gr.addColorStop(1, '#b8900e'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); } });
TX.tatil_direcional = canvasTex(256, (g, S) => { g.fillStyle = '#2d5fa8'; g.fillRect(0, 0, S, S); for (let i = 0; i < 4; i++) { const x = (i + .5) * S / 4; const gr = g.createLinearGradient(x - 14, 0, x + 14, 0); gr.addColorStop(0, '#1f4580'); gr.addColorStop(.5, '#6f9ae0'); gr.addColorStop(1, '#1f4580'); g.fillStyle = gr; g.fillRect(x - 12, 8, 24, S - 16); } });
TX.rampa = canvasTex(256, (g, S) => { speckle(g, S, '#c3c0b8', 3000, ['#aaa79f', '#d6d3cb'], .5, 1.3, 51); g.strokeStyle = 'rgba(90,88,80,.35)'; g.lineWidth = 3; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(0, i * S / 16); g.lineTo(S, i * S / 16); g.stroke(); } });
const drawGrelha = (g, S) => { g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, S, S); g.fillStyle = '#0c0c0c'; for (let i = 0; i < 9; i++) g.fillRect(12 + i * 27, 14, 14, S - 28); g.strokeStyle = '#4a4a4a'; g.lineWidth = 4; g.strokeRect(4, 4, S - 8, S - 8); };
TX.grelha = canvasTex(256, drawGrelha, { repeat: false });
TX.grelhaR = canvasTex(256, drawGrelha);
TX.tampao = canvasTex(256, (g, S) => { g.fillStyle = '#353331'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.fill(); g.strokeStyle = '#5a5652'; g.lineWidth = 5; for (let r = 30; r < S / 2; r += 22) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, 7); g.stroke(); } for (let a = 0; a < 16; a++) { g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a * Math.PI / 8) * S / 2, S / 2 + Math.sin(a * Math.PI / 8) * S / 2); g.stroke(); } }, { repeat: false });
TX.muro = canvasTex(512, (g, S) => { speckle(g, S, '#b6ada0', 5000, ['#a39a8d', '#c7bfb3'], .5, 1.5, 61); g.strokeStyle = 'rgba(80,72,62,.45)'; g.lineWidth = 3; const h = S / 10; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(0, i * h); g.lineTo(S, i * h); g.stroke(); const off = (i % 2) * S / 8; for (let j = 0; j < 5; j++) { const x = off + j * S / 4; g.beginPath(); g.moveTo(x, i * h); g.lineTo(x, (i + 1) * h); g.stroke(); } } });
TX.alerta_amarela = canvasTex(256, (g, S) => { g.fillStyle = '#e3b21c'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(120,90,10,.5)'; g.lineWidth = 3; g.strokeRect(1, 1, S - 2, S - 2); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const x = (i + .5) * S / 6, y = (j + .5) * S / 6; const gr = g.createRadialGradient(x - 4, y - 4, 1, x, y, 15); gr.addColorStop(0, '#fff0b0'); gr.addColorStop(1, '#a8800c'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); } });
TX.alerta_azul = canvasTex(256, (g, S) => { g.fillStyle = '#2b5ea6'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(10,30,70,.6)'; g.lineWidth = 3; g.strokeRect(1, 1, S - 2, S - 2); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const x = (i + .5) * S / 6, y = (j + .5) * S / 6; const gr = g.createRadialGradient(x - 4, y - 4, 1, x, y, 15); gr.addColorStop(0, '#a9c4f0'); gr.addColorStop(1, '#1b3f78'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); } });
TX.direcional_azul = canvasTex(256, (g, S) => { g.fillStyle = '#3563a8'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(20,40,80,.35)'; g.lineWidth = 3; g.strokeRect(1, 1, S - 2, S - 2); for (let i = 0; i < 4; i++) { const y = (i + .5) * S / 4; const gr = g.createLinearGradient(0, y - 16, 0, y + 16); gr.addColorStop(0, '#2a5190'); gr.addColorStop(.5, '#6f93cf'); gr.addColorStop(1, '#2a5190'); g.fillStyle = gr; g.fillRect(14, y - 14, S - 28, 28); } });
TX.muroE = canvasTex(1024, (g, S) => { speckle(g, S, '#b3b0a8', 14000, ['#a19e96', '#c4c1b9', '#8f8c85'], .5, 1.5, 71); mottled(g, S, ['#8a877f', '#cac7bf'], 7, 120, 40, 160, .10); g.strokeStyle = 'rgba(70,68,62,.35)'; g.lineWidth = 2; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(0, i * S / 8); g.lineTo(S, i * S / 8); g.stroke(); } g.fillStyle = 'rgba(60,58,52,.25)'; for (let i = 0; i < 4; i++) for (let j = 1; j < 8; j++) { g.beginPath(); g.arc((i + .5) * S / 4, j * S / 8 - S / 16, 4, 0, 7); g.fill(); } });
TX.tampaBL = canvasTex(256, (g, S) => { speckle(g, S, '#a3a098', 5000, ['#8f8c84', '#b8b5ad', '#7d7a72'], .5, 1.4, 81); mottled(g, S, ['#6f6c65', '#c2bfb7'], 3, 40, 20, 60, .1); });
TX.gradil = canvasTex(256, (g, S) => { g.clearRect(0, 0, S, S); g.strokeStyle = '#2f3a33'; g.lineWidth = 5; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * S / 8 + 2, 0); g.lineTo(i * S / 8 + 2, S); g.stroke(); } g.lineWidth = 9; g.beginPath(); g.moveTo(0, 6); g.lineTo(S, 6); g.stroke(); g.beginPath(); g.moveTo(0, S - 20); g.lineTo(S, S - 20); g.stroke(); });

function mat(tex, { rough = .9, metal = 0, tile = 3, color = 0xffffff, bump = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: metal, color });
  if (bump) { m.bumpMap = tex; m.bumpScale = bump; }
  m.userData.tile = tile; return m;
}
const MAT = {
  asfalto: mat(TX.asfalto, { rough: .93, tile: 4, bump: 0.6 }),
  sarjeta: mat(TX.sarjeta, { rough: .85, tile: 1.0 }),
  rigido: mat(TX.rigido, { rough: .85, tile: 4.5, bump: .3 }),
  ciclovia: mat(TX.ciclovia, { rough: .85, tile: 3 }),
  passeio: mat(TX.concreto, { rough: .88, tile: 3, bump: .3 }),
  plataforma: mat(TX.concreto, { rough: .86, tile: 2.5, bump: .3, color: 0xe6e2da }),
  grama: mat(TX.grama, { rough: 1, tile: 3, bump: .5 }),
  terreno: mat(TX.terreno, { rough: 1, tile: 6, bump: .6 }),
  cbuq: mat(TX.cbuq, { tile: .8 }), bgtc: mat(TX.bgtc, { tile: .8 }), bgs: mat(TX.bgs, { tile: .8 }), ccr: mat(TX.ccr, { tile: .8 }), brita: mat(TX.brita, { tile: .8 }),
  subleito: mat(TX.subleito, { tile: 1.5 }), solo: mat(TX.solo, { tile: 2.5 }), humus: mat(TX.humus, { tile: 1.5 }), concreto: mat(TX.concreto, { tile: 3 }),
  guia: mat(TX.sarjeta, { tile: 1.0, rough: .8, color: 0xf2f0ea }),
  barreira: mat(TX.muroE, { tile: 2.0, rough: .8 }),
  tatil_alerta: mat(TX.tatil_alerta, { tile: .5, rough: .7 }), tatil_direcional: mat(TX.tatil_direcional, { tile: .5, rough: .7 }), rampa: mat(TX.rampa, { tile: 1.2 }),
  muro: mat(TX.muro, { tile: 2.4, rough: .95 }),
  muroE: mat(TX.muroE, { tile: 2.65, rough: .85 }),
  dren: new THREE.MeshStandardMaterial({ color: 0x8f9492, roughness: .9 }),
  tampaBL: mat(TX.tampaBL, { tile: .7, rough: .85, color: 0xd9d6cf }),
  grelha: mat(TX.grelhaR, { tile: .9, rough: .55, metal: .5 }),
  tatil_alerta_amarela: mat(TX.alerta_amarela, { tile: 1, rough: .7 }), tatil_alerta_azul: mat(TX.alerta_azul, { tile: 1, rough: .7 }), tatil_direcional_azul: mat(TX.direcional_azul, { tile: 1, rough: .7 }),
  cmagro: mat(TX.ccr, { tile: .8 }),
};
MAT.dren.userData.tile = 1;
MAT.terreno.vertexColors = true;
for (const k of ['tatil_alerta_amarela', 'tatil_alerta_azul', 'tatil_direcional_azul', 'rampa']) { MAT[k].polygonOffset = true; MAT[k].polygonOffsetFactor = -1; MAT[k].polygonOffsetUnits = -1; }
for (const k of ['cbuq', 'bgtc', 'bgs', 'ccr', 'brita', 'subleito', 'solo', 'humus', 'concreto', 'cmagro']) { MAT['sk_' + k] = MAT[k].clone(); MAT['sk_' + k].side = THREE.DoubleSide; MAT['sk_' + k].userData.tile = MAT[k].userData.tile; }
for (const k of ['guia', 'barreira', 'muroE', 'dren', 'tampaBL', 'grelha']) MAT[k].side = THREE.DoubleSide;
const paint = c => new THREE.MeshStandardMaterial({ color: c, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const PAINT = { branca: paint(0xf2f1ea), amarela: paint(0xf2c230), azul: paint(0x2a64c4), vermelha: paint(0xb3261e) };
macroize(MAT.asfalto, .17, 1 / 29); macroize(MAT.rigido, .12, 1 / 23); macroize(MAT.passeio, .13, 1 / 19); macroize(MAT.plataforma, .10, 1 / 17);
macroize(MAT.grama, .30, 1 / 17); macroize(MAT.terreno, .32, 1 / 41); macroize(MAT.ciclovia, .12, 1 / 21); macroize(MAT.sarjeta, .12, 1 / 13);
for (const k in PAINT) macroize(PAINT[k], .22, 1 / 7);
// ---------- Alta: PBR maps (cor, normal, R = oclusão · G = rugosidade) generated by ftex.py + photographic grass/soil
const HQ = {};
if (Q_ALTA) {
  const TL = new THREE.TextureLoader(); const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const ld = (f, srgb) => { const t = TL.load(texUrl(f), () => { for (const m of HQ.waiting || []) m.needsUpdate = true; }, undefined, () => console.warn('Textura não carregada: ' + f)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const set3 = (k, tile, ns = 1, extra = {}) => ({ map: ld(k + '_c.jpg', true), normalMap: ld(k + '_n.jpg'), rough: ld(k + '_r.jpg'), tile, ns, ...extra });
  HQ.sets = { asfalto: set3('asfalto', 4, 1.1), ciclovia: set3('ciclovia', 4, .9, { color: 0xd9b0a8 }), passeio: set3('passeio', 3, .8), rigido: set3('rigido', 4.5, .9), liso: set3('liso', 1, .6) };
  HQ.grama = { map: ld('grama_c.jpg', true), normalMap: ld('grama_n.jpg'), tile: 2.6 };
  HQ.terreno = ld('terreno_c.jpg', true); HQ.solo = ld('solo_c.jpg', true); HQ.soloN = ld('solo_n.jpg');
  const apply = (m, S, color) => { m.map = S.map; m.normalMap = S.normalMap; m.normalScale.set(S.ns, S.ns); if (S.rough) { m.roughnessMap = S.rough; m.aoMap = S.rough; m.aoMapIntensity = .9; m.roughness = 1; } m.bumpMap = null; m.bumpScale = 0; m.userData.tile = S.tile; if (color != null) m.color.set(color); m.needsUpdate = true; };
  apply(MAT.asfalto, HQ.sets.asfalto); apply(MAT.ciclovia, HQ.sets.ciclovia, 0xc8a39c); apply(MAT.passeio, HQ.sets.passeio); apply(MAT.plataforma, HQ.sets.passeio, 0xf4f1ea);
  apply(MAT.rigido, HQ.sets.rigido); apply(MAT.sarjeta, HQ.sets.liso); apply(MAT.guia, HQ.sets.liso, 0xf7f5f0); MAT.guia.userData.tile = 1; apply(MAT.rampa, HQ.sets.passeio, 0xf2efe8); MAT.rampa.userData.tile = 1.5;
  apply(MAT.muroE, HQ.sets.liso, 0xe2ded6); MAT.muroE.userData.tile = 2.65; apply(MAT.barreira, HQ.sets.liso, 0xe8e4dc); MAT.barreira.userData.tile = 2; apply(MAT.tampaBL, HQ.sets.liso, 0xcfcbc3); MAT.tampaBL.userData.tile = .7;
  MAT.grama.map = HQ.grama.map; MAT.grama.normalMap = HQ.grama.normalMap; MAT.grama.normalScale.set(.8, .8); MAT.grama.bumpMap = null; MAT.grama.bumpScale = 0; MAT.grama.userData.tile = HQ.grama.tile; MAT.grama.roughness = .95; MAT.grama.color.set(0xd2dcc2);
  // terrain: photo grass field blended to exposed soil on steep faces (attribute "soil"), world-space macro variation
  const T = MAT.terreno; T.map = HQ.terreno; T.normalMap = HQ.soloN; T.normalScale.set(.7, .7); T.bumpMap = null; T.bumpScale = 0; T.userData.tile = 5; T.roughness = 1;
  T.onBeforeCompile = sh => {
    sh.uniforms.tMacro = { value: TX.macro }; sh.uniforms.tSolo = { value: HQ.solo };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float soil; varying float vSoil; varying vec3 vMacroP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSoil = soil; vMacroP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSoil; varying vec3 vMacroP; uniform sampler2D tMacro, tSolo;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 q = vMacroP.xz; float n = texture2D(tMacro, q / 37.).r * .6 + texture2D(tMacro, q / 9.3 + .31).r * .4;
        vec3 soilC = texture2D(tSolo, q / 3.2).rgb * vec3(1.05, .92, .80);
        float k = smoothstep(.35, .75, vSoil + (n - .5) * .55);
        vec3 gr = diffuseColor.rgb * vec3(1.18, 1.32, .92); float dry = smoothstep(.35, .75, texture2D(tMacro, q / 83. + .5).r); gr = mix(gr, gr * vec3(1.22, 1.12, .78), dry * .55); diffuseColor.rgb = mix(gr * (1.0 + .34 * (n - .5) * 2.0), soilC, k); }`);
  };
  T.customProgramCacheKey = () => 'terrHQ';
  // paint follows the pavement texture
  for (const k in PAINT) { const m = PAINT[k]; m.normalMap = HQ.sets.asfalto.normalMap; m.normalScale.set(.55, .55); m.roughness = .55; m.needsUpdate = true; }
  HQ.waiting = Object.values(MAT).concat(Object.values(PAINT)); HQ.ld = ld; HQ.set3 = set3; HQ.apply = apply;
}
const SURF_MATS = ['asfalto', 'sarjeta', 'rigido', 'ciclovia', 'passeio', 'plataforma', 'grama', 'terreno', 'guia', 'rampa', 'tatil_alerta_amarela', 'tatil_alerta_azul', 'tatil_direcional_azul', 'tampaBL', 'muroE'];
const SOLID = {
  guia: MAT.guia, barreira: MAT.barreira, muro: MAT.muroE, dren: MAT.dren, tampa: MAT.tampaBL, grelha: MAT.grelha, muroD: MAT.muroE, rampa: MAT.rampa,
  vazio: new THREE.MeshBasicMaterial({ color: 0x0b0c0d, side: THREE.DoubleSide }),
};
// ---------- córrego: pedra argamassada (bacia / dissipador) and a low water sheet with moving ripples
TX.pedra = canvasTex(512, (g, S) => { g.fillStyle = '#8e8a80'; g.fillRect(0, 0, S, S); const r = rng(61), n = 9, c = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const cx = (i + .5 + (r() - .5) * .5) * c, cy = (j + .5 + (r() - .5) * .5) * c, k = 7 + (r() * 3 | 0), rad = c * (.42 + r() * .1), t = 70 + r() * 45, h = r();
    const col = `rgb(${t + h * 14 | 0},${t + h * 8 | 0},${t - 4 | 0})`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); for (let q = 0; q < k; q++) { const a = q / k * Math.PI * 2 + r() * .3, rr = rad * (.8 + r() * .25); const x = cx + ox + Math.cos(a) * rr, y = cy + oy + Math.sin(a) * rr; q ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(40,38,34,.45)'; g.lineWidth = 2; g.stroke(); } }
  speckle(g, S, 'rgba(0,0,0,0)', 5000, ['#6f6b62', '#a9a59b'], .4, 1.2, 62); });
TX.aguaN = canvasTex(256, (g, S) => { const im = g.createImageData(S, S), H = new Float32Array(S * S); const W = [[1, 2, .9, .3], [3, 1, .5, 1.7], [2, 5, .35, 2.9], [6, 3, .2, .6], [5, 7, .15, 4.1], [9, 4, .1, 2.2]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let h = 0; for (const [a, b, amp, ph] of W) h += amp * Math.sin(2 * Math.PI * (a * x + b * y) / S + ph) + amp * .6 * Math.sin(2 * Math.PI * (b * x - a * y) / S + ph * 1.7); H[y * S + x] = h; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = H[y * S + (x + 1) % S] - H[y * S + (x + S - 1) % S], dy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x]; const nx = -dx * 1.2, ny = dy * 1.2, l = Math.hypot(nx, ny, 1), o = 4 * (y * S + x);
    im.data[o] = (nx / l * .5 + .5) * 255; im.data[o + 1] = (ny / l * .5 + .5) * 255; im.data[o + 2] = (1 / l * .5 + .5) * 255; im.data[o + 3] = 255; }
  g.putImageData(im, 0, 0); }, { srgb: false });
SOLID.pedra = mat(TX.pedra, { tile: 2, rough: .95, bump: 1.2 }); SOLID.pedra.name = 'pedra';
SOLID.agua = new THREE.MeshPhysicalMaterial({ color: 0x55664a, roughness: .06, metalness: 0, transparent: true, opacity: .6, depthWrite: false, normalMap: TX.aguaN, normalScale: new THREE.Vector2(.22, .22), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
SOLID.agua.userData.tile = 3; SOLID.agua.name = 'agua';
if (Q_ALTA && HQ.set3) { HQ.apply(SOLID.pedra, HQ.set3('pedra', 2, 1.0), 0xffffff); SOLID.agua.normalMap = HQ.ld('agua_n.jpg'); SOLID.agua.normalScale.set(.3, .3); SOLID.agua.userData.envFixed = true; SOLID.agua.envMapIntensity = 1.1; HQ.waiting.push(SOLID.pedra, SOLID.agua); }

// ---------- groups per discipline
const LYR = [
  { id: 'geo', code: '5F', name: 'Geometria e guias', sw: '#c9c6bd', on: true },
  { id: 'pav', code: '5P', name: 'Pavimentação', sw: '#3a3c3f', on: true },
  { id: 'urb', code: '5U', name: 'Urbanismo e acessibilidade', sw: '#b9b7b0', on: true },
  { id: 'pai', code: '5L', name: 'Paisagismo', sw: '#4f7a31', on: true },
  { id: 'dre', code: '5H', name: 'Drenagem', sw: '#7b8fa6', on: true },
  { id: 'sih', code: '5S', name: 'Sinalização horizontal', sw: '#f2f1ea', on: true },
  { id: 'siv', code: '5S', name: 'Placas e semáforos', sw: '#b3261e', on: true },
  { id: 'ilu', code: '4E', name: 'Iluminação pública', sw: '#8a9097', on: true },
  { id: 'ter', code: '5T', name: 'Terreno e taludes', sw: '#5f7a38', on: true },
  { id: 'exi', code: 'CAD', name: 'Cadastro existente', sw: '#9c8f7e', on: false },
  { id: 'edi', code: 'OSM', name: 'Edificações existentes (OSM/PMSP)', sw: '#cdb89c', on: true },
  { id: 'est', code: 'EST', name: 'Estacas das pistas', sw: '#c85e14', on: true },
  { id: 'rdo', code: 'RDO', name: 'Serviços lançados (RDO)', sw: '#e0662a', on: true },
  { id: 'fot', code: 'FOT', name: 'Fotos do RDO', sw: '#2f6fd0', on: true },
  { id: 'ilus', code: '—', name: 'Arbustos, carros e pessoas (ilustrativo)', sw: '#8a8f94', on: true },
];
if (Q_ALTA) LYR.push({ id: 'ent', code: '—', name: 'Entorno ilustrativo (terreno e vegetação)', sw: '#6f8f4a', on: true });
const GRP = {}; for (const l of LYR) { GRP[l.id] = new THREE.Group(); GRP[l.id].name = l.id; GRP[l.id].visible = l.on; scene.add(GRP[l.id]); }
const pickables = [], searchIdx = [];
const normTxt = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function idxAdd(o, I, iid) { const txt = [I.t, I.disc, ...(I.rows || []).map(r => r.join(' '))].join(' '); searchIdx.push({ o, I, iid, key: normTxt(txt) }); }
function addTo(gid, obj, info) { if (info) { obj.userData.info = info; pickables.push(obj); idxAdd(obj, info); } (GRP[gid] || GRP.geo).add(obj); return obj; }
function addInst(gid, im, infos, search = true) { im.userData.infos = infos; pickables.push(im); if (search) infos.forEach((I, k) => I && idxAdd(im, I, k)); (GRP[gid] || GRP.geo).add(im); return im; }
const isVis = o => { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };
const ehIlustrativo = o => { let p = o; while (p) { if (p === GRP.ilus) return true; p = p.parent; } return false; };

// surface registries filled as tiles arrive
const TOP = [];    // {mesh, G}: top surfaces for sections/drive (grid in plan)
const READ = [];   // surfaces for the cursor readout
const TERRS = [];  // terrain meshes (extrapolated flag)
function regTop(mesh, cs = 2) { const g = mesh.geometry; const G = triGrid(g.attributes.position.array, g.index ? g.index.array : null, true, cs); if (G) TOP.push({ mesh, G }); }
const visTops = () => TOP.filter(e => isVis(e.mesh));
function sampleTop(x, y, tops) { let bz = -Infinity, bo = null; for (const e of tops) { const G = e.G; if (x < G.x0 || x > G.x1 || y < G.y0 || y > G.y1) continue; const z = gridZ(G, x, y); if (z > bz) { bz = z; bo = e.mesh; } } return bo ? { z: bz, o: bo } : null; }
function groundZs(x, y) { // -> [z, source]
  const h = sampleTop(x, y, visTops()); if (h) return [h.z, 'sup']; const z = ngZ(x, y); if (fin(z)) return [z, 'tin'];
  let best = null; for (const P of ['PD', 'PE']) { const A = ALN[P]; if (!A || !A.g) continue; const q = A.proj([x, y]); if (!best || q[2] < best[1]) best = [A.z(q[0]), q[2]]; }
  return best && fin(best[0]) ? [best[0], 'eixo'] : [controls.target.y, '?'];
}
const groundZ = (x, y) => groundZs(x, y)[0];

// ---------- geometry builders
function geomFrom(S, tile, flipUp = true) {
  const p = dec(S.p); const n = p.length / 3; const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[3 * i] = p[3 * i]; pos[3 * i + 1] = p[3 * i + 2]; pos[3 * i + 2] = -p[3 * i + 1]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (S.uv) { const uv = dec(S.uv), u = new Float32Array(uv.length), k = 1 / (tile || 1); for (let i = 0; i < uv.length; i++) u[i] = uv[i] * k; g.setAttribute('uv', new THREE.BufferAttribute(u, 2)); }
  const I = dec(S.i); if (I) g.setIndex(new THREE.BufferAttribute(I instanceof Uint32Array ? I : Uint32Array.from(I), 1));
  g.computeVertexNormals();
  if (flipUp && g.index) { let ny = 0; const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) ny += nr.getY(i);
    if (ny < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.index.needsUpdate = true; g.computeVertexNormals(); } }
  return g;
}
function triplanarGeo(p, tile) { // p: non-indexed model coords (x, y, z)
  const n = p.length / 3; const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[3 * i] = p[3 * i]; pos[3 * i + 1] = p[3 * i + 2]; pos[3 * i + 2] = -p[3 * i + 1]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
  const nr = g.attributes.normal; const uv = new Float32Array(n * 2);
  for (let t = 0; t + 2 < n; t += 3) {
    let nx = 0, ny = 0, nz = 0; for (let k = 0; k < 3; k++) { nx += nr.getX(t + k); ny += nr.getY(t + k); nz += nr.getZ(t + k); }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (let k = 0; k < 3; k++) { const i = t + k, x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[2 * i] = u / tile; uv[2 * i + 1] = v / tile; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
function unindex(p, I) { if (!I) return p; const out = new Float32Array(I.length * 3); for (let k = 0; k < I.length; k++) { const v = I[k]; out[3 * k] = p[3 * v]; out[3 * k + 1] = p[3 * v + 1]; out[3 * k + 2] = p[3 * v + 2]; } return out; }

const SURFINFO = {
  asfalto: ['Pavimentação', 'Pavimento semirrígido (pista)', [['CBUQ', '3 camadas × 4 cm'], ['Base', 'BGTC 20 cm'], ['Sub-base', 'BGS 15 cm'], ['Caimento', '2% para o lado externo']], '5P-105/151 · GEOMETRICO ATUAL (H-PISTA)'],
  sarjeta: ['Geometria', 'Sarjeta de concreto fck ≥ 20 MPa', [['Bordo externo (Det. C)', '0,45 m · 10% para a guia'], ['Canteiro (Det. D)', '0,30 m no caimento da pista'], ['Boca de lobo', 'depressão de 9 cm (DH 07)']], 'DE-VM-TV-01-5P-105/151 · GEOMETRICO (F-HZ-SARJETA)'],
  rigido: ['Pavimentação', 'Pavimento rígido – faixa de ônibus', [['Placa', 'concreto 24 cm'], ['Base', 'CCR 12 cm'], ['Sub-base', 'BGS 20 cm']], '5P-105 · hachura P-PAVIMENTO RÍGIDO'],
  ciclovia: ['Urbanismo', 'Ciclovia bidirecional no canteiro', [['Largura', '2,50 m'], ['Nível', 'guia + 0,15 m']], 'GEOMETRICO ATUAL (H-CICLOVIA)'],
  passeio: ['Urbanismo', 'Passeio de concreto', [['Revestimento', 'concreto fck ≥ 20 MPa, 7 cm'], ['Lastro', 'brita 5 cm'], ['Caimento', '2% para a guia']], '5P-151 · GEOMETRICO ATUAL (H-PASSEIO)'],
  plataforma: ['Urbanismo', 'Plataforma de embarque de ônibus', [['Revestimento', 'concreto']], 'GEOMETRICO ATUAL · 5P-105'],
  grama: ['Paisagismo', 'Forração – grama São Carlos', [], '5L-105'],
  rampa: ['Acessibilidade', 'Rampa / rebaixo de calçada', [['Material', 'concreto moldado in loco fck 20 MPa'], ['Rebaixo', 'pedestres: nível da sarjeta · veículos: 5 cm (adotado)']], 'DE-VM-TV-01-5U-00-104-H · 5L-105-2'],
};
const SURFGRP = { asfalto: 'pav', sarjeta: 'geo', rigido: 'pav', ciclovia: 'urb', passeio: 'urb', plataforma: 'urb', grama: 'pai', rampa: 'urb' };
const SKINFO = { cmagro: 'Base de concreto magro da sarjeta (10 cm)', cbuq: 'CBUQ – concreto asfáltico (3 × 4 cm)', bgtc: 'BGTC – brita graduada tratada com cimento (20 cm)', bgs: 'BGS – brita graduada simples', ccr: 'CCR – concreto compactado com rolo (12 cm)', concreto: 'Concreto', brita: 'Lastro de brita (5 cm)', subleito: 'Subleito compactado (0,60 m)', solo: 'Solo natural', humus: 'Camada vegetal' };
const MKINFO = { branca: 'Sinalização horizontal – branca', amarela: 'Sinalização horizontal – amarela (LFO)', azul: 'Faixa Azul de motocicletas', vermelha: 'Sinalização horizontal – vermelha (ciclovia)' };
const TATINFO = { tatil_alerta_amarela: ['Piso tátil de alerta', 'amarelo · ladrilho hidráulico 40×40 cm'], tatil_alerta_azul: ['Piso tátil de alerta', 'azul · ladrilho hidráulico 25×25 cm'], tatil_direcional_azul: ['Piso tátil direcional', 'azul · ladrilho hidráulico 25×25 cm'] };

let extOn = false;
function applyExt(e) { const { col, x, base } = e; const n = col.length / 3; for (let i = 0; i < n; i++) { const on = extOn && x && x[i]; for (let c = 0; c < 3; c++) col[3 * i + c] = on ? [1.35, .72, .35][c] : (base ? base[3 * i + c] : 1); } e.geo.attributes.color.needsUpdate = true; }
// earthwork slopes read as seeded grass (lighter, drier) and very steep faces as exposed soil
function slopeTint(g) { const nr = g.attributes.normal, n = nr.count, b = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const ny = nr.getY(i); const s = Math.min(1, Math.max(0, (0.985 - ny) / 0.22)), soil = Math.min(1, Math.max(0, (0.72 - ny) / 0.2));
    const r = 1 + .10 * s + .25 * soil, gg = 1 + .03 * s - .12 * soil, bb = 1 - .18 * s - .25 * soil; b[3 * i] = r; b[3 * i + 1] = gg; b[3 * i + 2] = bb; } return b; }
window.__setExt = on => { extOn = on; TERRS.forEach(applyExt); };

const ENV_K = .75;
function envK() { if (!Q_ALTA) return; const seen = new Set(); scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { if (seen.has(m)) continue; seen.add(m); if ('envMapIntensity' in m && !m.userData.envFixed) m.envMapIntensity = ENV_K; } }); }
// ---------- one tile -> separate meshes in the discipline groups
const tick = () => new Promise(r => setTimeout(r, 0));
async function buildTile(T, meta) {
  for (const [k, S] of Object.entries(T.surf || {})) {
    if (!S || !S.p) continue; const m = MAT[k] || MAT.passeio; const g = geomFrom(S, m.userData.tile);
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.userData.stype = MAT[k] ? k : 'passeio'; mesh.userData.tile = meta.id;
    const inf = SURFINFO[k]; addTo(SURFGRP[k] || 'urb', mesh, inf ? { disc: inf[0], t: inf[1], rows: inf[2], src: inf[3] } : { disc: 'Superfície', t: k, rows: [], src: 'modelo' });
    regTop(mesh); READ.push(mesh);
  }
  await tick();
  if (T.terr && T.terr.p) {
    const g = geomFrom(T.terr, MAT.terreno.userData.tile); const n = g.attributes.position.count; const col = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, MAT.terreno); mesh.receiveShadow = true; mesh.castShadow = true; mesh.name = 'terreno'; mesh.userData.stype = 'terreno'; mesh.userData.tile = meta.id;
    let zmin = Infinity, zmax = -Infinity; const pa = g.attributes.position.array; for (let i = 1; i < pa.length; i += 3) { if (pa[i] < zmin) zmin = pa[i]; if (pa[i] > zmax) zmax = pa[i]; }
    addTo('ter', mesh, { disc: 'Topografia', t: 'Terreno com taludes', rows: [['Fonte', 'levantamento 5T (pontos cotados + malha TIN)'], ['Taludes', 'corte 1V:1H · aterro 1V:1,5H (projeto) · reaterro atrás dos muros B, C e D'], ['Faixa de cotas no trecho', `${fmt(zmin + Z0, 2)} a ${fmt(zmax + Z0, 2)} m`]], src: '5T-00-002/003 · GEOMETRICO (T-COTA, MalhaTriTG)' });
    if (Q_ALTA) { const nr = g.attributes.normal, sa = new Float32Array(nr.count); for (let i = 0; i < nr.count; i++) sa[i] = Math.min(1, Math.max(0, (0.93 - nr.getY(i)) / 0.3)); g.setAttribute('soil', new THREE.BufferAttribute(sa, 1)); }
    const e = { geo: g, col, x: T.terr.x ? dec(T.terr.x) : null, base: Q_ALTA ? null : slopeTint(g) }; TERRS.push(e); applyExt(e);
    regTop(mesh, 3); READ.push(mesh);
  }
  await tick();
  for (const [k0, S] of Object.entries(T.skirt || {})) {
    const side = k0.startsWith('S|'), k = side ? k0.slice(2) : k0;
    if (!S || !S.p) continue; const m = MAT['sk_' + k] || MAT.sk_solo; const mesh = new THREE.Mesh(geomFrom(S, m.userData.tile, false), m); mesh.receiveShadow = true; if (side) { mesh.userData.sideSkirt = true; if (HQ.entOK) mesh.visible = false; }
    addTo(['solo', 'humus', 'subleito'].includes(k) ? 'ter' : 'pav', mesh, { disc: 'Corte do modelo', t: SKINFO[k] || k, rows: [], src: k === 'solo' || k === 'humus' ? 'representação' : '5P-105/151' });
  }
  await tick();
  for (const S of T.mesh || []) {
    if (!S || !S.p) continue; const m = SOLID[S.m] || MAT.guia; const g = triplanarGeo(unindex(dec(S.p), dec(S.i)), m.userData.tile || 1);
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = !['vazio', 'agua'].includes(S.m); mesh.receiveShadow = true; if (S.m === 'agua') { mesh.renderOrder = 2; mesh.userData.noAO = true; mesh.geometry.computeBoundingSphere(); AGUAS.push(mesh); }
    if (['guia', 'muro', 'muroD', 'tampa', 'grelha', 'rampa'].includes(S.m)) { mesh.userData.stype = S.m; regTop(mesh, 1.5); }
    addTo(GRP[S.g] ? S.g : 'geo', mesh, S.info || null);
  }
  await tick();
  for (const [k, S] of Object.entries(T.tat || {})) {
    const m = MAT[k]; if (!m || !S || !S.p) continue; const mesh = new THREE.Mesh(geomFrom(S, 1), m); mesh.receiveShadow = true; mesh.userData.stype = 'passeio';
    const [t, d] = TATINFO[k] || [k, '']; addTo('urb', mesh, { disc: 'Acessibilidade', t, rows: [['Peça', d]], src: 'DE-VM-TV-01-5U-00-104-H (rev. H) · 5L-105-2 (URB-101)' }); regTop(mesh, 1.5);
  }
  for (const [c, S] of Object.entries(T.paint || {})) {
    if (!S || !S.p || !PAINT[c]) continue; const pg = geomFrom({ p: S.p, i: S.i }, 1);
    if (Q_ALTA) { const pa = pg.attributes.position.array, uv = new Float32Array(pa.length / 3 * 2); for (let i = 0, j = 0; i < pa.length; i += 3, j += 2) { uv[j] = pa[i] / 4; uv[j + 1] = -pa[i + 2] / 4; } pg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
    const mesh = new THREE.Mesh(pg, PAINT[c]); mesh.receiveShadow = true;
    addTo('sih', mesh, { disc: 'Sinalização horizontal', t: MKINFO[c] || c, rows: [['Largura', '0,10 m (linhas) · 0,40 m (retenção e faixa de pedestre)']], src: '5L-105 xref SIN-002 · 5S-102/103' });
  }
  if (clipOn) applyClip(true);
  envK();
}

// ---------- floor (diorama base)
{
  const E = M.extent || { xmin: -100, xmax: 100, ymin: -100, ymax: 100 }; const zb = M.zbase ?? -3;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: Q_ALTA ? 0x77815d : 0xc9ccc6, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.copy(V((E.xmin + E.xmax) / 2, (E.ymin + E.ymax) / 2, zb - 0.4)); scene.add(floor);
}

// ---------- 3D objects (index)
const mConc = new THREE.MeshStandardMaterial({ color: 0xbab6ad, roughness: .85 });
const mGalv = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: .35, metalness: .85 });
const mDark = new THREE.MeshStandardMaterial({ color: 0x1d2124, roughness: .5, metalness: .3 });
// vidro SEM `transmission`: com ela o three.js redesenha a cena opaca inteira num passe
// extra, a cada quadro em que um abrigo aparece — e o refratado não se vê nesta escala
const mGlass = new THREE.MeshStandardMaterial({ color: 0xcfe3ea, roughness: .05, metalness: .1, transparent: true, opacity: .35, depthWrite: false });
const mLens = new THREE.MeshStandardMaterial({ color: 0xfff7e0, emissive: 0xfff2cc, emissiveIntensity: .4 });
const cyl = (r1, r2, h, s = 16) => new THREE.CylinderGeometry(r1, r2, h, s);
function at(obj, p) { obj.position.copy(V(p[0], p[1], p[2])); return obj; }
const _o = new THREE.Object3D();
const instMatrix = (p, rotY, sx = 1, sy = 1, sz = 1) => { _o.position.copy(V(p[0], p[1], p[2])); _o.rotation.set(0, rotY, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix(); return _o.matrix; };

// pavement legends (PARE / ÔNIBUS)
const legTex = new Map();
for (const L of feat('legendas')) {
  if (!legTex.has(L.texto)) { const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#f2f1ea';
    g.font = '700 150px "Space Grotesk", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(256, 256); g.scale(1, 3.0); g.fillText(L.texto, 0, 0); g.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    legTex.set(L.texto, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: .4, roughness: .6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); }
  const w = String(L.texto).length * 0.75, h = (L.h || 2.5) * 1.05; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), legTex.get(L.texto)); mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true;
  const grp = new THREE.Group(); grp.add(mesh); grp.position.copy(V(L.p[0], L.p[1], L.p[2] + 0.004)); grp.rotation.y = bearingRot((L.az || 0) - 90);
  addTo('sih', grp, { disc: 'Sinalização horizontal', t: `Legenda "${L.texto}"`, rows: [['Altura das letras', `${fmt(L.h || 0, 2)} m`]], src: '5L-105 xref SIN-002' });
}

// trees (instanced per species/variant)
const SPEC = {   // h = altura adulta ilustrativa; w/vh = abertura/altura relativas da copa; base = centro da copa (fração de h); tf = fuste
  'Jangada-do-campo': { h: 7, leaf: 0x4b7a2f, flower: 0xf3efe2, fr: .18, w: 1.05, vh: .8, base: .66, nb: 7 },
  'Grumixama': { h: 6.5, leaf: 0x2c5626, flower: 0x2c5626, fr: 0, w: .8, vh: 1.05, base: .58, nb: 8, tf: .35 },
  'Ipê-amarelo': { h: 6.5, leaf: 0x6d8a2a, flower: 0xeec21a, fr: .75, w: 1.28, vh: .58, base: .74, nb: 7, tf: .62 },
  'Manacá-da-serra': { h: 6.5, leaf: 0x43702f, flower: 0x9657b3, fr: .5, flower2: 0xf0e6f2, w: .74, vh: 1.18, base: .6, nb: 7, tf: .42 },
  'Pau-cigarra': { h: 6.5, leaf: 0x5d8a32, flower: 0xd9c22c, fr: .4, w: 1.22, vh: .68, base: .7, nb: 6 },
  'Cerejeira-do-mato': { h: 5.5, leaf: 0x3d6a2f, flower: 0xf2f0ea, fr: .08, w: .95, vh: .88, base: .63, nb: 7 },
  'Açoita-cavalo': { h: 9, leaf: 0x5f8a3a, flower: 0xe7b8c9, fr: .14, w: 1.32, vh: .74, base: .7, nb: 8, tf: .55 },
  'Guaritá': { h: 10, leaf: 0x2f5a28, flower: 0x2f5a28, fr: 0, w: .72, vh: 1.28, base: .63, nb: 7, tf: .5 },
  _gen: { h: 6, leaf: 0x4b7a2f, flower: 0x4b7a2f, fr: 0, w: 1, vh: .85, base: .66, nb: 7 },
  _exist: { h: 7.5, leaf: 0x557a36, flower: 0x557a36, fr: 0, w: 1.1, vh: .85, base: .64, nb: 8 },
};
const mTrunk = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
const mLeaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 });
const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, y, z) { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); const fx = x - ix, fy = y - iy, fz = z - iz; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz); let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += hash(ix + a, iy + b, iz + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w); return r; }
function treeProto(sp, seed) {
  const r = rng(seed); const H = sp.h, cr = 2.5; const w = sp.w || 1, vh = sp.vh || .82, base = sp.base || .66, tf = sp.tf || .55; const tparts = [];
  const tr = cyl(.08, .16, H * tf, 8); tr.translate(0, H * tf / 2, 0); tparts.push(tr);
  for (let i = 0; i < 4; i++) { const br = cyl(.03, .065, H * .3, 6); const an = i * 1.57 + r() * .8; _o.position.set(Math.cos(an) * .28 * w, H * (tf + .05), Math.sin(an) * .28 * w); _o.rotation.set(Math.sin(an) * .75, 0, -Math.cos(an) * .75); _o.scale.set(1, 1, 1); _o.updateMatrix(); br.applyMatrix4(_o.matrix); tparts.push(br); }
  const parts = []; const nb = (sp.nb || 7) + Math.floor(r() * 3); const leaf = new THREE.Color(sp.leaf), fl = new THREE.Color(sp.flower), fl2 = sp.flower2 ? new THREE.Color(sp.flower2) : fl; const off = r() * 50;
  for (let i = 0; i < nb; i++) {
    // detalhe 2 (320 triângulos por bolota): o 3 tinha 4× mais e, com o ruído deformando a bolota, não se via a diferença —
    // estas copas só existem no modo Leve (o Alta usa o ez-tree), que é o do celular
    const rad0 = cr * (0.44 + r() * .26); let g = new THREE.IcosahedronGeometry(rad0, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    const ang = r() * Math.PI * 2, rad = cr * .62 * w * Math.sqrt(r()); const cx = Math.cos(ang) * rad, cy = H * base + (r() - .4) * cr * .6 * vh, cz = Math.sin(ang) * rad;
    const hx = Math.sqrt(w), hy = .82 * vh;
    for (let j = 0; j < pos.count; j++) { const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j); const n = vnoise(x * 1.6 + off, y * 1.6, z * 1.6 + i) - .5; const s = 1 + n * .6; pos.setXYZ(j, x * s * hx, y * s * hy, z * s * hx);
      const wy = (cy + y * s * hy - H * .4) / (cr * 1.4); const shade = .66 + .42 * Math.min(1, Math.max(0, wy)); const fn = vnoise(x * 2.3 + 11 + off, y * 2.3, z * 2.3 + i * 3);
      let c = leaf.clone(); if (sp.fr && fn > 1 - sp.fr * .9) c = (sp.flower2 && vnoise(x * 4, y * 4, z * 4 + 7) > .55 ? fl2 : fl).clone(); c.multiplyScalar(shade * (0.9 + hash(x, y, z) * .2)); col.set([c.r, c.g, c.b], 3 * j); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.translate(cx, cy, cz); g.computeVertexNormals(); parts.push(g);
  }
  return { trunk: mergeGeometries(tparts), crown: mergeGeometries(parts), H, cr };
}
const TREESETS = []; let TREE_F = 1;
function setTreeMatrices(S, f) {
  S.items.forEach((it, k) => { const m = instMatrix(it.p, it.rot, it.sxz * f, it.sy * f, it.sxz * f); S.tm.setMatrixAt(k, m); S.cm.setMatrixAt(k, m); });
  S.tm.instanceMatrix.needsUpdate = S.cm.instanceMatrix.needsUpdate = true; S.tm.computeBoundingSphere(); S.cm.computeBoundingSphere(); S.tm.computeBoundingBox?.(); S.cm.computeBoundingBox?.();
}
const treeProtos = new Map();
const getTreeProto = (sp, v) => { const k = sp + '|' + v; if (!treeProtos.has(k)) treeProtos.set(k, treeProto(SPEC[sp], hashStr(sp) + v * 97)); return treeProtos.get(k); };
function plantTrees(list, gid, describe, scalable) { // instanced per species × variant × 200 m bin along the avenue (per-bin frustum/shadow culling)
  const groups = new Map();
  list.forEach((a, k) => { if (!a || !a.p) return; const it = describe(a, k); const v = k % 2, bin = Math.floor((a.p[0] * Uv[0] + a.p[1] * Uv[1]) / 200); const key = `${it.sp}|${v}|${bin}`;
    if (!groups.has(key)) groups.set(key, { sp: it.sp, v, items: [] }); groups.get(key).items.push(it); });
  for (const G of groups.values()) {
    const P = getTreeProto(G.sp, G.v); const n = G.items.length;
    const tm = new THREE.InstancedMesh(P.trunk, mTrunk, n), cm = new THREE.InstancedMesh(P.crown, mLeaf, n); tm.castShadow = cm.castShadow = true; cm.receiveShadow = true;
    const S = { tm, cm, scalable, items: G.items.map(it => ({ ...it, sxz: it.cr / P.cr, sy: it.H / P.H })) }; setTreeMatrices(S, 1);
    if (G.items.some(it => it.tint)) { const c = new THREE.Color(); G.items.forEach((it, k) => { c.setRGB(...(it.tint || [1, 1, 1])); cm.setColorAt(k, c); }); cm.instanceColor.needsUpdate = true; }
    const infos = G.items.map(it => it.info); addInst(gid, tm, infos, false); addInst(gid, cm, infos, true); TREESETS.push(S);
  }
}
// Alta: species trees generated with ez-tree (branch geometry + textured leaf cards), instanced; flowers recoloured per leaf
const EZSPEC = {  // preset, seeds, bark tint, leaf colour, flower colour(s), flower fraction, crown width factor
  'Jangada-do-campo': { pre: 'Oak Medium', leaf: 0x7fa35a, fl: 0xf4f1e6, fr: .16 },
  'Grumixama': { pre: 'Oak Small', leaf: 0x4f7c3e, fr: 0 },
  'Ipê-amarelo': { pre: 'Ash Medium', leaf: 0x9aa84a, fl: 0xf5c518, fr: .72 },
  'Manacá-da-serra': { pre: 'Aspen Medium', leaf: 0x6f9a4c, fl: 0x9a5fc0, fl2: 0xf1e8f4, fr: .5 },
  'Pau-cigarra': { pre: 'Ash Small', leaf: 0x8aa452, fl: 0xe4cc3a, fr: .35 },
  'Cerejeira-do-mato': { pre: 'Oak Small', leaf: 0x6d9448, fl: 0xf6f3ee, fr: .1 },
  'Açoita-cavalo': { pre: 'Oak Large', leaf: 0x86a55c, fl: 0xecc3d2, fr: .12 },
  'Guaritá': { pre: 'Aspen Large', leaf: 0x5c8a45, fr: 0 },
  _gen: { pre: 'Oak Medium', leaf: 0x77a052, fr: 0 },
  _exist: { pre: 'Ash Large', leaf: 0x7a9a50, fr: 0 },
};
const EZ_ITEMS = [], EZ_BUSH = [];
const BUSHPAL = [[0x6d9448, null, 0], [0x86a652, null, 0], [0x557f3c, 0xe4c43a, .22], [0x6a9446, 0xd77fb0, .25]];
const ENT_TREES = [['Oak Medium', 0x7ea356], ['Oak Large', 0x6f9a4c], ['Ash Medium', 0x89a656], ['Ash Large', 0x7c9f52], ['Aspen Medium', 0x74a052], ['Aspen Large', 0x6b9549]];   // [{list, gid, describe, scalable}] kept to plant when the module arrives
function recolorLeaves(m) {  // leaf texture luminance x per-vertex colour (leaf or flower) -> natural colour variety without new textures
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
    vec4 texel = texture2D(map, vMapUv); float L = dot(texel.rgb, vec3(.35, .5, .15)); diffuseColor *= vec4(mix(texel.rgb, vec3(L), .78) * 2.1, texel.a);
    #endif`); };
  m.customProgramCacheKey = () => 'leafRecolor';
}
function ezProto(mod, key, seed, lod) {
  const E = typeof key === 'object' ? key : (EZSPEC[key] || EZSPEC._gen); const t = new mod.Tree(); t.loadPreset(E.pre); t.options.seed = seed;
  if (lod) { const b = t.options.branch; b.levels = Math.min(b.levels, 2); for (const k in b.sections) b.sections[k] = Math.max(2, Math.round(b.sections[k] * .45)); for (const k in b.segments) b.segments[k] = Math.max(3, Math.round(b.segments[k] * .45)); t.options.leaves.count = Math.max(2, Math.round(t.options.leaves.count * lod[0])); t.options.leaves.size *= lod[1]; }
  t.generate();
  const bg = t.branchesMesh.geometry, lg = t.leavesMesh.geometry; bg.computeBoundingBox(); lg.computeBoundingBox();
  const bb = bg.boundingBox.clone().union(lg.boundingBox); const H = bb.max.y - bb.min.y; const W = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  const s = 1 / H; bg.scale(s, s, s); lg.scale(s, s, s); bg.translate(0, -bb.min.y * s, 0); lg.translate(0, -bb.min.y * s, 0);
  // per-leaf colours: leaf colour with small variation, or flowers
  const n = lg.attributes.position.count, col = new Float32Array(n * 3); const r = rng(seed * 7 + 1); const cL = new THREE.Color(E.leaf), cF = new THREE.Color(E.fl ?? E.leaf), cF2 = new THREE.Color(E.fl2 ?? E.fl ?? E.leaf), c = new THREE.Color();
  for (let v = 0; v < n; v += 4) { const f = r() < (E.fr || 0); c.copy(f ? (E.fl2 && r() < .5 ? cF2 : cF) : cL); const j = .86 + r() * .26; c.multiplyScalar(j); if (!f) c.offsetHSL((r() - .5) * .03, 0, 0); for (let q = 0; q < 4 && v + q < n; q++) col.set([c.r, c.g, c.b], 3 * (v + q)); }
  lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const bm = t.branchesMesh.material, lm = t.leavesMesh.material;
  const bark = new THREE.MeshStandardMaterial({ map: bm.map, normalMap: bm.normalMap, roughness: .95, color: 0xb8aa98 }); bark.name = 'casca|' + E.pre;
  const leaf = new THREE.MeshStandardMaterial({ map: lm.map, alphaTest: .25, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true, roughness: .75 });
  recolorLeaves(leaf); leaf.name = 'folha|' + E.pre;
  return { trunk: bg, crown: lg, bark, leaf, H: 1, cr: W / H / 2 };
}
async function plantEZ() {
  const mod = await ezP;
  if (!mod) { for (const it of EZ_ITEMS) plantTrees(it.list, it.gid, it.describe, it.scalable); tileVer++; return; }
  const protos = new Map(); const getP = (sp, v) => { const k = sp + '|' + v; if (!protos.has(k)) protos.set(k, ezProto(mod, sp, 1000 + hashStr(sp) % 5000 + v * 311)); return protos.get(k); };
  for (const { list, gid, describe, scalable } of EZ_ITEMS) {
    const groups = new Map();
    list.forEach((a, k) => { if (!a || !a.p) return; const it = describe(a, k); const v = k % 2, bin = Math.floor((a.p[0] * Uv[0] + a.p[1] * Uv[1]) / 200); const key = `${it.sp}|${v}|${bin}`;
      if (!groups.has(key)) groups.set(key, { sp: it.sp, v, items: [] }); groups.get(key).items.push(it); });
    for (const G of groups.values()) {
      const P = getP(G.sp, G.v); const n = G.items.length;
      const tm = new THREE.InstancedMesh(P.trunk, P.bark, n), cm = new THREE.InstancedMesh(P.crown, P.leaf, n); tm.castShadow = cm.castShadow = true; tm.receiveShadow = cm.receiveShadow = true; cm.userData.noAO = true;
      const S = { tm, cm, scalable, items: G.items.map(it => ({ ...it, sy: it.H, sxz: it.H * Math.max(.75, Math.min(1.35, it.cr / (it.H * P.cr))) })) }; setTreeMatrices(S, scalable ? TREE_F : 1);
      const c = new THREE.Color(); G.items.forEach((it, k) => { c.setRGB(...(it.tint || [1, 1, 1])); cm.setColorAt(k, c); }); cm.instanceColor.needsUpdate = true;
      const infos = G.items.map(it => it.info); addInst(gid, tm, infos, false); addInst(gid, cm, infos, true); TREESETS.push(S);
      if (clipOn) applyClip(true);
    }
  }
  // bushes (ilustrativo) with ez-tree bush presets
  const bushP = BUSHPAL.map(([leaf, fl, fr], v) => ezProto(mod, { pre: ['Bush 1', 'Bush 2', 'Bush 3', 'Bush 1'][v], leaf, fl: fl ?? leaf, fr }, 77 + v * 13, [.6, 1.6]));
  for (const B of EZ_BUSH) { const by = [[], [], [], []]; B.list.forEach(a => by[a.v].push(a));
    by.forEach((list, v) => { if (!list.length) return; const P = bushP[v]; const n = list.length; const tm = new THREE.InstancedMesh(P.trunk, P.bark, n), cm = new THREE.InstancedMesh(P.crown, P.leaf, n); cm.userData.noAO = true;
      list.forEach((a, k) => { const m = instMatrix(a.p, a.r, a.s * 1.3, a.s, a.s * 1.3); tm.setMatrixAt(k, m); cm.setMatrixAt(k, m); }); for (const im of [tm, cm]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); }
      const infos = list.map(() => B.info); addInst(B.gid, tm, infos, false); addInst(B.gid, cm, infos, false); }); }
  HQ.mod = mod; HQ.bushP = bushP;
  tileVer++; envK(); invalidar(3); invalidarSombra();
}
// ---------- entorno ilustrativo (Alta): ground ring + low-detail trees and bushes
async function loadEntorno() {
  try {
    const E = await lerArquivo(M.pacote ? 'entorno.bin' : 'entorno.json');
    const g = geomFrom(E.terr, MAT.terreno.userData.tile); const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const nr = g.attributes.normal, sa = new Float32Array(n); for (let i = 0; i < n; i++) sa[i] = Math.min(1, Math.max(0, (0.93 - nr.getY(i)) / 0.3)) * .6; g.setAttribute('soil', new THREE.BufferAttribute(sa, 1));
    const mR = MAT.terreno.clone(); mR.onBeforeCompile = MAT.terreno.onBeforeCompile; mR.customProgramCacheKey = MAT.terreno.customProgramCacheKey; mR.userData.tile = MAT.terreno.userData.tile; mR.polygonOffset = true; mR.polygonOffsetFactor = 2; mR.polygonOffsetUnits = 4; mR.name = 'terreno';
    const tm = new THREE.Mesh(g, mR); tm.receiveShadow = true; tm.name = 'entorno';
    const info = { disc: 'Ilustrativo', t: 'Entorno ilustrativo', rows: [['Observação', 'continuação suavizada do terreno da borda do modelo, com vegetação aleatória, só para dar horizonte e contexto — não é levantamento nem projeto']], src: 'modelo' };
    addTo('ent', tm, info);
    const sk = new THREE.Mesh(geomFrom(E.skirt, MAT.sk_solo.userData.tile, false), MAT.sk_solo); sk.receiveShadow = true; addTo('ent', sk, null);
    HQ.entOK = true; scene.traverse(o => { if (o.userData.sideSkirt) o.visible = false; }); invalidarSombra();
    if (E.agua) { const wm = new THREE.Mesh(triplanarGeo(unindex(dec(E.agua.p), dec(E.agua.i)), SOLID.agua.userData.tile), SOLID.agua); wm.receiveShadow = true; wm.renderOrder = 2; wm.userData.noAO = true; wm.geometry.computeBoundingSphere(); AGUAS.push(wm);
      addTo('ent', wm, { disc: 'Córrego (fora do modelo)', t: 'Córrego – continuação', rows: [['Traçado', 'levantamento do córrego e, além dele, o curso do OpenStreetMap (waterway=stream)'], ['Água', 'nível do levantamento prolongado pela declividade média; canal de 2 m ilustrativo']], src: 'Lev Canal Teotonio · OpenStreetMap (ODbL)' }); }
    const mod = await ezP; await plantDone;
    const A = dec(E.arv), S = dec(E.arb);
    if (mod) {
      const protos = ENT_TREES.map(([pre, leaf], v) => ezProto(mod, { pre, leaf, fr: 0 }, 500 + v * 37, [.45, 2.0]));
      const cells = new Map(); for (let i = 0; i < A.length / 6; i++) { const x = A[6 * i], y = A[6 * i + 1], v = A[6 * i + 4] | 0; const key = v + '|' + Math.floor(x / 160) + '|' + Math.floor(y / 160); if (!cells.has(key)) cells.set(key, { v, idx: [] }); cells.get(key).idx.push(i); }
      const c = new THREE.Color();
      for (const { v, idx } of cells.values()) { const P = protos[v]; const bm = new THREE.InstancedMesh(P.trunk, P.bark, idx.length), lm = new THREE.InstancedMesh(P.crown, P.leaf, idx.length); lm.userData.noAO = true;
        idx.forEach((i, k) => { const h = A[6 * i + 3]; const m = instMatrix([A[6 * i], A[6 * i + 1], A[6 * i + 2]], A[6 * i + 5], h * (0.9 + (i % 7) * .04), h, h * (0.9 + (i % 5) * .05)); bm.setMatrixAt(k, m); lm.setMatrixAt(k, m); c.setHSL(.24 + ((i * 37) % 11) * .004, .25 + ((i * 13) % 7) * .03, .5 + ((i * 17) % 9) * .02); c.multiplyScalar(2.0); lm.setColorAt(k, c); });
        lm.instanceColor.needsUpdate = true; for (const im of [bm, lm]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); } addInst('ent', bm, idx.map(() => info), false); addInst('ent', lm, idx.map(() => info), false); }
      const bp = HQ.bushP || []; const byv = [[], [], []]; for (let i = 0; i < S.length / 6; i++) byv[(S[6 * i + 4] | 0) % 3].push(i);
      byv.forEach((idx, v) => { const P = bp[v]; if (!P || !idx.length) return; const bm = new THREE.InstancedMesh(P.trunk, P.bark, idx.length), lm = new THREE.InstancedMesh(P.crown, P.leaf, idx.length); lm.userData.noAO = true;
        idx.forEach((i, k) => { const s = S[6 * i + 3] * 1.6; const m = instMatrix([S[6 * i], S[6 * i + 1], S[6 * i + 2]], S[6 * i + 5], s * 1.3, s, s * 1.3); bm.setMatrixAt(k, m); lm.setMatrixAt(k, m); });
        for (const im of [bm, lm]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); } addInst('ent', bm, idx.map(() => info), false); addInst('ent', lm, idx.map(() => info), false); });
    }
    if (clipOn) applyClip(true); envK(); tileVer++; invalidar(3); invalidarSombra();
  } catch (e) { console.warn('Entorno ilustrativo não carregado:', e && e.message); }
}
let plantDone = null;
const plantTreesQ = (list, gid, describe, scalable) => Q_ALTA ? EZ_ITEMS.push({ list, gid, describe, scalable }) : plantTrees(list, gid, describe, scalable);
plantTreesQ(feat('arvores'), 'pai', (a, k) => {
  const sp = SPEC[a.especie] ? a.especie : '_gen'; const r = rng(100 + k); const H = SPEC[sp].h * (0.9 + r() * .2); const cr = Math.max(1.8, Math.min(3.2, (a.copa || 4) / 2));
  return { sp, p: a.p, H, cr, rot: r() * 6.283, info: { disc: 'Paisagismo', t: a.especie || 'Árvore', rows: [['Nome científico', a.cientifico || '—'], ['Porte', a.porte || '—'], ['Plantio', 'muda com 1,30 m, DAP ≥ 3 cm'], ['Altura no modelo', `${fmt(H, 1)} m (adulta, ilustrativa)`]], src: 'DE-VM-TV-01-5L-105-2' } };
}, true);
plantTreesQ(feat('arvores_exist'), 'exi', (a, k) => {
  const r = rng(900 + k); const d = +a.d || 0; const cr = d > 1.5 ? Math.max(1.5, Math.min(5, d / 2)) : 2.4; const H = SPEC._exist.h * (0.85 + r() * .3) * Math.max(.8, Math.min(1.4, cr / 2.5));
  const rem = /remo|supr|cort|erradic|transpl/i.test(a.situacao || '');
  return { sp: '_exist', p: a.p, H, cr, rot: r() * 6.283, tint: rem ? [1.3, .92, .55] : null,
    info: { disc: 'Cadastro existente', t: 'Árvore existente', rows: [['Situação', a.situacao || '—'], ['Diâmetro (cadastro)', d ? `${fmt(d, 2)} m` : '—'], ['Altura no modelo', `${fmt(H, 1)} m (ilustrativa)`]], src: 'Levantamento 5T (ÁRVORE)' } };
}, false);

// ---------- illustrative elements (NOT part of the project): shrubs, cars, buses, people — layer "ilus"
{
  const ILUS = (t, extra = []) => ({ disc: 'Ilustrativo', t, rows: [['Observação', 'elemento ilustrativo para dar escala e realismo — não faz parte do projeto'], ...extra], src: 'modelo' });
  const mBody = Q_ALTA ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .38, metalness: .35, clearcoat: 1, clearcoatRoughness: .06 }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3, metalness: .45 });
  const mCarGlass = new THREE.MeshStandardMaterial({ color: Q_ALTA ? 0x0e1418 : 0x1a232a, roughness: Q_ALTA ? .02 : .06, metalness: Q_ALTA ? .92 : .75 });
  const mTire = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: .9 });
  const mHead = new THREE.MeshStandardMaterial({ color: 0xf4efe0, emissive: 0x3a382c, roughness: .3 });
  const mTail = new THREE.MeshStandardMaterial({ color: 0x8e1612, emissive: 0x2a0503, roughness: .35 });
  const mCloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
  const mSkin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .75 });
  const mShrub = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  mBody.name = 'carro_pintura'; mCarGlass.name = 'vidro'; mTire.name = 'pneu'; mHead.name = 'farol'; mTail.name = 'lanterna'; mCloth.name = 'roupa'; mSkin.name = 'pele';
  const place = (p, azDeg, pitchDeg = 0, sx = 1, sy = 1, sz = 1) => { _o.position.copy(V(p[0], p[1], p[2])); _o.rotation.set((pitchDeg || 0) * Math.PI / 180, bearingRot(azDeg || 0), 0, 'YXZ'); _o.scale.set(sx, sy, sz); _o.updateMatrix(); return _o.matrix; };
  // side profile [[u, y]] (u = rear→front) extruded across the width; front faces -Z (like the other objects' bearings)
  function sideExtrude(pts, L, W, bevel = .035) {
    const sh = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: W - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(W - 2 * bevel) / 2); g.rotateY(Math.PI / 2); g.translate(0, 0, L / 2); g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
  }
  const CARS = {
    sedan: { L: 4.45, W: 1.78, H: 1.44, belt: .9, hood: 1.15, trunk: .95 },
    hatch: { L: 3.95, W: 1.72, H: 1.48, belt: .92, hood: .95, trunk: .25 },
    suv: { L: 4.55, W: 1.85, H: 1.7, belt: 1.05, hood: 1.1, trunk: .15 },
    pickup: { L: 5.2, W: 1.85, H: 1.8, belt: 1.02, hood: 1.2, trunk: 1.85, cab: 1.75 },
    van: { L: 5.0, W: 1.95, H: 2.05, belt: 1.0, hood: .75, trunk: .05 },
  };
  function carProto(t) {
    const c = CARS[t] || CARS.sedan, { L, W, H, belt, hood, trunk } = c;
    const body = sideExtrude([[0.06, .2], [L - .06, .2], [L, .42], [L - .04, belt - .14], [L - hood, belt], [trunk, belt + .02], [.03, belt - .08], [0, .45]], L, W);
    const g0 = trunk - .02, g1 = L - hood + .04, tw = c.cab ? g1 - c.cab : g0;
    const glass = sideExtrude(c.cab ? [[tw, belt - .01], [g1, belt - .01], [g1 - .55, H], [tw + .12, H]] : [[g0, belt - .01], [g1, belt - .01], [g1 - .7, H], [g0 + (t === 'sedan' ? .55 : .12), H - (t === 'hatch' ? .04 : 0)]], L, W - .1, .03);
    const roof = sideExtrude(c.cab ? [[tw + .14, H - .05], [g1 - .58, H - .05], [g1 - .6, H + .02], [tw + .16, H + .02]] : [[g0 + (t === 'sedan' ? .58 : .15), H - .05], [g1 - .72, H - .05], [g1 - .74, H + .02], [g0 + (t === 'sedan' ? .6 : .17), H + .02]], L, W - .06, .02);
    const wheels = []; for (const zz of [-(L / 2 - .82), L / 2 - .9]) for (const xx of [-(W / 2 - .09), W / 2 - .09]) { const w = cyl(.32, .32, .22, 16); w.rotateZ(Math.PI / 2); w.translate(xx, .32, zz); wheels.push(w); }
    const heads = [], tails = []; for (const xx of [-(W / 2 - .28), W / 2 - .28]) { const hb = new THREE.BoxGeometry(.34, .1, .06); hb.translate(xx, belt - .2, -L / 2 + .02); heads.push(hb); const tb = new THREE.BoxGeometry(.3, .12, .06); tb.translate(xx, belt - .12, L / 2 - .03); tails.push(tb); }
    return [[mergeGeometries([body, roof]), mBody, true, 'paint'], [glass, mCarGlass, true], [mergeGeometries(wheels), mTire, true], [mergeGeometries(heads), mHead, false], [mergeGeometries(tails), mTail, false]];
  }
  // Alta: rounded body with wheel arches, tumblehome greenhouse, pillars, bumpers, tyres with rims, mirrors, plates
  const mRim = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: .28, metalness: .9 });
  const mTrim = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: .62, metalness: .1 });
  const mPlate = new THREE.MeshStandardMaterial({ color: 0xe9ebe6, roughness: .5 }); mRim.name = 'aro'; mTrim.name = 'plastico'; mPlate.name = 'placa';
  function tumble(g, y0, y1, k) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > y0) p.setX(i, p.getX(i) * (1 - k * Math.min(1, (y - y0) / (y1 - y0)))); } g.computeVertexNormals(); return g; }
  function extr(shape, W, bev, segs = 3) { const g = new THREE.ExtrudeGeometry(shape, { depth: W - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: segs, curveSegments: 6 }); g.translate(0, 0, -(W - 2 * bev) / 2); g.rotateY(Math.PI / 2); g.deleteAttribute('uv'); return g; }
  function carProtoHQ(t) {
    const c = CARS[t] || CARS.sedan, { L, W, H, belt, hood, trunk } = c; const R = .33, uR = .86, uF = L - .92, bot = .24;
    const sh = new THREE.Shape(); sh.moveTo(.22, bot); sh.lineTo(uR - R - .06, bot); sh.absarc(uR, R, R + .06, Math.PI, 0, true); sh.lineTo(uF - R - .06, bot); sh.absarc(uF, R, R + .06, Math.PI, 0, true);
    sh.lineTo(L - .28, bot); sh.quadraticCurveTo(L + .01, bot + .02, L, .5); sh.quadraticCurveTo(L - .01, belt - .1, L - .3, belt - .05); sh.quadraticCurveTo(L - hood * .5, belt + .02, L - hood, belt + .02);
    if (c.cab) { sh.lineTo(trunk + .05, belt + .02); sh.lineTo(.04, belt + .02); } else { sh.lineTo(trunk + .1, belt + .05); sh.quadraticCurveTo(.03, belt + .03, .02, belt - .18); }
    sh.lineTo(0, .45); sh.quadraticCurveTo(0, bot, .22, bot);
    const body = extr(sh, W, .07); body.translate(0, 0, L / 2);
    const g0 = c.cab ? L - hood - c.cab + .05 : trunk - .02, g1 = L - hood + .02, rs = c.cab ? .08 : (t === 'sedan' ? .6 : t === 'van' ? .05 : .16), fs = t === 'van' ? .5 : .66;
    const gsh = new THREE.Shape(); gsh.moveTo(g0, belt - .02); gsh.lineTo(g1, belt - .02); gsh.quadraticCurveTo(g1 - fs * .55, H - .1, g1 - fs, H - .04); gsh.lineTo(g0 + rs + .08, H - .04); gsh.quadraticCurveTo(g0 + rs * .35, H - .1, g0, belt - .02);
    const glass = tumble(extr(gsh, W - .1, .035, 2), belt, H, .13); glass.translate(0, 0, L / 2);
    const rsh = new THREE.Shape(); rsh.moveTo(g0 + rs + .02, H - .06); rsh.lineTo(g1 - fs - .02, H - .06); rsh.quadraticCurveTo(g1 - fs - .1, H + .025, g1 - fs - .2, H + .03); rsh.lineTo(g0 + rs + .16, H + .03); rsh.quadraticCurveTo(g0 + rs + .06, H + .025, g0 + rs + .02, H - .06);
    const roof = extr(rsh, (W - .1) * .87, .03, 2); roof.translate(0, 0, L / 2);
    const um = (g0 + g1) / 2 + (t === 'sedan' ? .15 : 0); const bp = new THREE.BoxGeometry((W - .1) * .93, H - belt - .02, .09); tumble(bp, 0, (H - belt) / 2, .1); bp.translate(0, (belt + H) / 2, L / 2 - um);
    const parts = [body, roof, bp];
    for (const sx of [-1, 1]) { const m = new THREE.BoxGeometry(.12, .09, .16); m.translate(sx * (W / 2 + .03), belt + .1, L / 2 - (g1 - .1)); parts.push(m); }
    const trim = []; const fb = new THREE.BoxGeometry(W - .06, .16, .1); fb.translate(0, bot + .1, -L / 2 + .03); const rb = fb.clone(); rb.translate(0, 0, L - .06); trim.push(fb, rb);
    for (const sx of [-1, 1]) { const sk = new THREE.BoxGeometry(.04, .09, uF - uR - 2 * R - .2); sk.translate(sx * (W / 2 - .005), bot + .05, L / 2 - (uR + uF) / 2); trim.push(sk); }
    const tp = [[0, 0]]; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 8; tp.push([R - .045 + Math.cos(a) * .045, .11 * Math.sin(a) * 1.0]); } tp.push([0, .11]);
    const tyre = new THREE.LatheGeometry(tp.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), 20); tyre.rotateZ(Math.PI / 2);
    const tyres = [], rims = [];
    for (const u of [uR, uF]) for (const sx of [-1, 1]) { const x = sx * (W / 2 - .13), z = L / 2 - u; const ty = tyre.clone(); ty.translate(x, R, z); tyres.push(ty); const rim = cyl(.215, .215, .225, 18); rim.rotateZ(Math.PI / 2); rim.translate(x, R, z); rims.push(rim); const hub = cyl(.06, .06, .235, 10); hub.rotateZ(Math.PI / 2); hub.translate(x, R, z); rims.push(hub); }
    const heads = [], tails = [], plates = [];
    for (const sx of [-1, 1]) { const hb = new THREE.BoxGeometry(.38, .09, .05); hb.translate(sx * (W / 2 - .3), belt - .16, -L / 2 + .06); heads.push(hb); const tb = new THREE.BoxGeometry(.34, .11, .05); tb.translate(sx * (W / 2 - .27), belt - .1, L / 2 - .05); tails.push(tb); }
    for (const zz of [-L / 2 - .005, L / 2 + .005]) { const pl = new THREE.BoxGeometry(.4, .13, .02); pl.translate(0, bot + .22, zz); plates.push(pl); }
    return [[mergeGeometries(parts.map(g => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); return g; })), mBody, true, 'paint'], [glass, mCarGlass, true], [mergeGeometries(tyres), mTire, true], [mergeGeometries(rims), mRim, false], [mergeGeometries(trim), mTrim, true], [mergeGeometries(heads), mHead, false], [mergeGeometries(tails), mTail, false], [mergeGeometries(plates), mPlate, false]];
  }
  const byType = new Map(); for (const c of feat('carros')) { if (!c || !c.p) continue; const t = CARS[c.tipo] ? c.tipo : 'sedan'; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(c); }
  const carInfo = ILUS('Veículo (ilustrativo)');
  for (const [t, list] of byType) {
    const infos = list.map(() => carInfo); const col = new THREE.Color();
    (Q_ALTA ? carProtoHQ(t) : carProto(t)).forEach(([geo, m, shadow, paint], j) => { const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((c, k) => { im.setMatrixAt(k, place(c.p, c.az, c.pitch)); if (paint) { col.set(c.cor || '#cccccc'); im.setColorAt(k, col); } });
      if (paint) im.instanceColor.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); addInst('ilus', im, infos, false); });
  }
  // buses on the rigid bus pads
  const buses = feat('onibus');
  if (buses.length) {
    const L = 12.4, W = 2.55;
    const body = new THREE.BoxGeometry(W, 2.9, L); body.translate(0, .38 + 1.45, 0);
    const band = new THREE.BoxGeometry(W + .02, 1.05, L - 1.4); band.translate(0, 2.25, .5);
    const ws = new THREE.BoxGeometry(W - .2, 1.45, .04); ws.translate(0, 2.05, -L / 2 - .01);
    const wh = []; for (const zz of [-(L / 2 - 2.6), L / 2 - 3.2]) for (const xx of [-(W / 2 - .2), W / 2 - .2]) { const w = cyl(.5, .5, .3, 16); w.rotateZ(Math.PI / 2); w.translate(xx, .5, zz); wh.push(w); }
    const infos = buses.map(() => ILUS('Ônibus (ilustrativo)')); const col = new THREE.Color();
    let BP = [[body, mBody, true], [mergeGeometries([band, ws]), mCarGlass, false], [mergeGeometries(wh), mTire, true]];
    if (Q_ALTA) {
      const H = 3.15, b0 = .34; const sh = new THREE.Shape(); sh.moveTo(.3, b0); sh.lineTo(L - .25, b0); sh.quadraticCurveTo(L, b0, L, b0 + .3); sh.lineTo(L - .06, H - .3); sh.quadraticCurveTo(L - .1, H, L - .4, H); sh.lineTo(.3, H); sh.quadraticCurveTo(0, H, 0, H - .3); sh.lineTo(0, b0 + .3); sh.quadraticCurveTo(0, b0, .3, b0);
      const bb = extr(sh, W, .09); bb.translate(0, 0, L / 2);
      const gl = []; const band2 = new THREE.BoxGeometry(W + .025, 1.12, L - 3.0); band2.translate(0, 2.2, -.35); gl.push(band2);
      const wsc = new THREE.BoxGeometry(W - .22, 1.75, .06); wsc.translate(0, 1.95, -L / 2 - .015); gl.push(wsc); const rw = new THREE.BoxGeometry(W - .5, .9, .05); rw.translate(0, 2.3, L / 2 + .01); gl.push(rw);
      for (const zz of [-L / 2 + 1.35, -.6, L / 2 - 3.3]) { const d = new THREE.BoxGeometry(.03, 2.35, 1.15); d.translate(W / 2 + .012, .5 + 2.35 / 2, zz); gl.push(d); }
      gl.forEach(g => g.deleteAttribute('uv'));
      const pil = []; for (let i = 0; i < 7; i++) { const zz = -L / 2 + 2.2 + i * 1.3; for (const sx of [-1, 1]) { if (sx > 0 && Math.abs(zz + .6) < .7) continue; const pl = new THREE.BoxGeometry(.035, 1.14, .09); pl.translate(sx * (W / 2 + .014), 2.2, zz); pl.deleteAttribute('uv'); pil.push(pl); } }
      const sk = new THREE.BoxGeometry(W + .01, .32, L - .2); sk.translate(0, b0 + .1, 0); sk.deleteAttribute('uv');
      const tp = [[0, 0]]; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 8; tp.push([.5 - .06 + Math.cos(a) * .06, .15 * Math.sin(a)]); } tp.push([0, .15]);
      const tyre = new THREE.LatheGeometry(tp.map(([r, y]) => new THREE.Vector2(Math.max(.001, r), y)), 20); tyre.rotateZ(Math.PI / 2); tyre.deleteAttribute('uv');
      const ty = [], rm = []; for (const zz of [-(L / 2 - 2.6), L / 2 - 3.2]) for (const sx of [-1, 1]) { const x = sx * (W / 2 - .2); const t = tyre.clone(); t.translate(x, .5, zz); ty.push(t); const r = cyl(.3, .3, .31, 16); r.rotateZ(Math.PI / 2); r.translate(x, .5, zz); r.deleteAttribute('uv'); rm.push(r); }
      BP = [[mergeGeometries([bb, ...pil.map(g => g.toNonIndexed())]), mBody, true], [mergeGeometries(gl), mCarGlass, false], [mergeGeometries(ty), mTire, false], [mergeGeometries(rm), mRim, false], [sk, mTrim, false]];
    }
    BP.forEach(([geo, m, paint]) => {
      const im = new THREE.InstancedMesh(geo, m, buses.length); buses.forEach((b, k) => { im.setMatrixAt(k, place(b.p, b.az)); if (paint) { col.set(b.cor || '#1f6fb5'); im.setColorAt(k, col); } });
      if (paint) im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); addInst('ilus', im, infos, false); });
  }
  // people
  const ppl = feat('pessoas');
  if (ppl.length) {
    const legs = []; for (const xx of [-.1, .1]) { const l = cyl(.065, .075, .86, 8); l.translate(xx, .43, 0); legs.push(l); }
    const torso = cyl(.17, .15, .62, 10); torso.translate(0, 1.18, 0); const arms = []; for (const xx of [-.23, .23]) { const a = cyl(.05, .045, .6, 6); a.translate(xx, 1.16, 0); arms.push(a); }
    const head = new THREE.SphereGeometry(.11, 12, 10); head.translate(0, 1.64, 0);
    const SK = ['#f1c9a5', '#d9a47c', '#a86f4c', '#6e4630'].map(h => new THREE.Color(h));
    const infos = ppl.map(() => ILUS('Pedestre (ilustrativo)')); const col = new THREE.Color();
    const HAIR = ['#1b1512', '#2e211a', '#4a3423', '#0f0e0d', '#6b5a48', '#8f8a83'].map(h => new THREE.Color(h)), SHOE = ['#1a1a1a', '#e8e6e0', '#3b2a20', '#2a3440'].map(h => new THREE.Color(h));
    let PP = [[mergeGeometries(legs), mCloth, 'calca'], [mergeGeometries([torso, ...arms]), mCloth, 'camisa'], [head, mSkin, 'pele']];
    if (Q_ALTA) {
      const cap = (r, l, x, y, z = 0, rz = 0, rx = 0) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); g.deleteAttribute('uv'); return g; };
      const lg = [cap(.068, .72, -.095, .47, 0, .02), cap(.068, .72, .095, .47, .03, -.02, -.08)];
      const hip = new THREE.SphereGeometry(.16, 12, 8); hip.scale(1.05, .55, .75); hip.translate(0, .9, 0); hip.deleteAttribute('uv'); lg.push(hip);
      const tr = cap(.165, .36, 0, 1.21); tr.scale(1, 1, .68); const sho = cap(.075, .3, 0, 1.39, 0, Math.PI / 2); sho.scale(1, 1, .8);
      const ar = [cap(.052, .5, -.235, 1.13, 0, -.1, .06), cap(.052, .5, .235, 1.13, .02, .1, -.08)];
      const hands = [new THREE.SphereGeometry(.045, 8, 6).translate(-.265, .83, .02), new THREE.SphereGeometry(.045, 8, 6).translate(.265, .83, -.01)]; hands.forEach(g => g.deleteAttribute('uv'));
      const hd = new THREE.SphereGeometry(.105, 16, 12); hd.scale(.92, 1.08, 1); hd.translate(0, 1.64, 0); hd.deleteAttribute('uv'); const nk = cap(.05, .08, 0, 1.51); 
      const hair = new THREE.SphereGeometry(.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55); hair.scale(.95, 1.05, 1.04); hair.translate(0, 1.655, .012); hair.deleteAttribute('uv');
      const shoes = [new THREE.BoxGeometry(.1, .07, .26).translate(-.095, .035, -.04), new THREE.BoxGeometry(.1, .07, .26).translate(.095, .035, -.02)]; shoes.forEach(g => g.deleteAttribute('uv'));
      PP = [[mergeGeometries(lg), mCloth, 'calca'], [mergeGeometries([tr, sho, ...ar]), mCloth, 'camisa'], [mergeGeometries([hd, nk, ...hands]), mSkin, 'pele'], [hair, mCloth, 'cabelo'], [mergeGeometries(shoes), mCloth, 'sapato']];
    }
    PP.forEach(([geo, m, key]) => {
      const im = new THREE.InstancedMesh(geo, m, ppl.length);
      ppl.forEach((q, k) => { const s = (q.h || 1.72) / 1.75; im.setMatrixAt(k, place(q.p, q.az, 0, s, s, s)); if (key === 'pele') im.setColorAt(k, SK[k % SK.length]); else if (key === 'cabelo') im.setColorAt(k, HAIR[(k * 7) % HAIR.length]); else if (key === 'sapato') im.setColorAt(k, SHOE[(k * 5) % SHOE.length]); else { col.set(q[key] || '#555555'); im.setColorAt(k, col); } });
      im.instanceColor.needsUpdate = true; im.castShadow = true; im.computeBoundingSphere(); addInst('ilus', im, infos, false); });
  }
  // shrubs (canteiros and surrounding terrain)
  const shr = feat('arbustos');
  if (shr.length && Q_ALTA) EZ_BUSH.push({ list: shr.map(a => ({ p: a.p, s: (a.s || 1) * 1.15, v: (a.v || 0) % 4, r: (a.r || 0) * Math.PI / 180 })), gid: 'ilus', info: ILUS('Arbusto / vegetação (ilustrativo)') });
  if (shr.length && !Q_ALTA) {
    const PAL = [[0x3f6b2a, 0x3f6b2a, 0], [0x557d33, 0x557d33, 0], [0x2f5626, 0xd9c22c, .18], [0x4a7430, 0xc76fa0, .2]];
    const protos = PAL.map(([leaf, fl, fr], v) => { const r = rng(700 + v); const parts = [];
      // arbusto de 0,5 m: 80 triângulos por bolota bastam (detalhe 1; eram 320)
      for (let i = 0; i < 3; i++) { let g = new THREE.IcosahedronGeometry(.42 + r() * .18, 1); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); const pos = g.attributes.position, colA = new Float32Array(pos.count * 3); const c0 = new THREE.Color(leaf), c1 = new THREE.Color(fl);
        for (let j = 0; j < pos.count; j++) { const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j); const n = vnoise(x * 3 + v * 7, y * 3, z * 3 + i) - .5; const sc = 1 + n * .5; pos.setXYZ(j, x * sc, Math.max(-.05, y * sc * .72), z * sc);
          const c = (fr && vnoise(x * 6, y * 6 + i, z * 6) > 1 - fr) ? c1.clone() : c0.clone(); c.multiplyScalar(.75 + .35 * Math.max(0, y + .3) + hash(x, y, z) * .1); colA.set([c.r, c.g, c.b], 3 * j); }
        g.setAttribute('color', new THREE.BufferAttribute(colA, 3)); g.translate((r() - .5) * .5, .32, (r() - .5) * .5); g.computeVertexNormals(); parts.push(g); }
      return mergeGeometries(parts); });
    const by = [[], [], [], []]; shr.forEach(a => by[(a.v || 0) % 4].push(a));
    const info = ILUS('Arbusto / vegetação (ilustrativo)');
    by.forEach((list, v) => { if (!list.length) return; const im = new THREE.InstancedMesh(protos[v], mShrub, list.length); list.forEach((a, k) => im.setMatrixAt(k, place(a.p, a.r || 0, 0, a.s || 1, (a.s || 1) * .9, a.s || 1)));
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); addInst('ilus', im, list.map(() => info), false); });
  }
}

// light poles (Enel) – height adopted 9 m, instanced
function poleProto(nb) {
  const H = 9, armL = 2.0; const galv = [], dark = [], lens = [];
  const pole = cyl(.07, .12, H, 12); pole.translate(0, H / 2, 0); galv.push(pole);
  for (let k = 0; k < nb; k++) { const a = k * Math.PI;
    const am = cyl(.04, .04, armL, 8); am.rotateX(Math.PI / 2); am.translate(0, H - .1, -armL / 2); am.rotateY(a); galv.push(am);
    const lum = new THREE.BoxGeometry(.32, .1, .7); lum.translate(0, H - .18, -armL - .2); lum.rotateY(a); dark.push(lum);
    const ln = new THREE.PlaneGeometry(.26, .6); ln.rotateX(Math.PI / 2); ln.translate(0, H - .235, -armL - .2); ln.rotateY(a); lens.push(ln); }
  return [[mergeGeometries(galv), mGalv, true], [mergeGeometries(dark), mDark, true], [mergeGeometries(lens), mLens, false]];
}
{
  const byArms = new Map(); for (const p of feat('postes')) { if (!p || !p.p) continue; const nb = (+p.bracos || 1) >= 2 ? 2 : 1; if (!byArms.has(nb)) byArms.set(nb, []); byArms.get(nb).push(p); }
  for (const [nb, list] of byArms) {
    const infos = list.map(p => ({ disc: 'Iluminação pública', t: 'Poste de iluminação – LED', rows: [...(p.tipo ? [['Tipo', p.tipo]] : []), ['Braço', `${p.bracos ?? 1} · azimute ${fmt(p.az || 0, 1)}°`], ['Altura', '9 m (adotada – não consta)'], ...ajRow(p)], src: 'ILUMINA COM SPTRANS.dwg (Enel)' }));
    poleProto(nb).forEach(([geo, m, shadow], j) => { const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((p, k) => im.setMatrixAt(k, instMatrix(p.p, bearingRot(p.az || 0)))); im.castShadow = shadow; im.computeBoundingSphere(); addInst('ilu', im, infos, j === 0); });
  }
}
// sign faces
function signTex(code) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
  const txt = (s, y, sz, col) => { g.fillStyle = col; g.font = `700 ${sz}px "Space Grotesk", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, 128, y); };
  const circle = (fill, ring) => { g.fillStyle = fill; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); if (ring) { g.strokeStyle = ring; g.lineWidth = 22; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.stroke(); } };
  const diamond = () => { g.fillStyle = '#f2c230'; g.strokeStyle = '#111'; g.lineWidth = 8; g.beginPath(); g.moveTo(128, 6); g.lineTo(250, 128); g.lineTo(128, 250); g.lineTo(6, 128); g.closePath(); g.fill(); g.stroke(); };
  if (code === 'R-1') { g.fillStyle = '#c21d1d'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(128 + 122 * Math.cos(a), 128 + 122 * Math.sin(a)); } g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke(); txt('PARE', 132, 78, '#fff'); }
  else if (code === 'R-6a') { circle('#fff', '#c21d1d'); txt('E', 132, 130, '#111'); g.strokeStyle = '#c21d1d'; g.lineWidth = 20; g.beginPath(); g.moveTo(52, 52); g.lineTo(204, 204); g.stroke(); }
  else if (code === 'R-24a') { circle('#1f4fa3'); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(60, 115); g.lineTo(160, 115); g.lineTo(160, 80); g.lineTo(215, 128); g.lineTo(160, 176); g.lineTo(160, 141); g.lineTo(60, 141); g.fill(); }
  else if (code === 'R-19') { circle('#fff', '#c21d1d'); txt('km/h', 176, 30, '#111'); txt('R-19', 118, 46, '#111'); }
  else if (code.startsWith('R-32')) { circle('#1f4fa3'); g.fillStyle = '#fff'; g.fillRect(70, 88, 116, 70); g.fillStyle = '#1f4fa3'; g.fillRect(80, 98, 96, 26); g.fillStyle = '#fff'; g.beginPath(); g.arc(92, 166, 12, 0, 7); g.arc(164, 166, 12, 0, 7); g.fill(); }
  else if (code === 'A-14') { diamond(); g.fillStyle = '#111'; g.fillRect(106, 58, 44, 140); for (const [y, cl] of [[82, '#d22'], [128, '#fb3'], [174, '#2b5']]) { g.fillStyle = cl; g.beginPath(); g.arc(128, y, 15, 0, 7); g.fill(); } }
  else if (code.startsWith('A-')) { diamond(); txt(code, 132, 50, '#111'); }
  else if (code.startsWith('ED') || code.startsWith('IS') || code.startsWith('IND')) { g.fillStyle = '#1f4fa3'; g.fillRect(8, 48, 240, 160); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(16, 56, 224, 144); txt(code.replace(/\s*\(.*\)/, ''), 128, 42, '#fff'); }
  else { g.fillStyle = '#fff'; g.fillRect(8, 48, 240, 160); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(8, 48, 240, 160); txt(code, 128, 46, '#111'); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const signMat = new Map();
function signMats(code) { if (!signMat.has(code)) { const map = signTex(code); signMat.set(code, [new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: .5, roughness: .4 }), new THREE.MeshStandardMaterial({ map, color: 0x7c848a, transparent: true, alphaTest: .5, roughness: .5, metalness: .5 })]); } return signMat.get(code); }
const gSignPost = cyl(.035, .035, 2.9, 10), gSign = new THREE.PlaneGeometry(.6, .6), gSignBig = new THREE.PlaneGeometry(1.0, 1.0), gPost6 = cyl(.07, .09, 6.0, 12);
for (const s of feat('placas')) {
  if (!s || !s.p) continue; const code = String(s.codigo || '?'); const grp = new THREE.Group(); const [faceM, backM] = signMats(code);
  if (s.placa_p) {
    const H = 6.0; const post = new THREE.Mesh(gPost6, mGalv); post.position.copy(V(s.p[0], s.p[1], s.p[2] + H / 2)); post.castShadow = true; grp.add(post);
    const A = V(s.p[0], s.p[1], s.p[2] + H - .3), Bp = V(s.placa_p[0], s.placa_p[1], s.p[2] + H - .3); const d = Bp.clone().sub(A); const L = d.length();
    const arm = new THREE.Mesh(cyl(.05, .05, L + .3, 10), mGalv); arm.position.copy(A).addScaledVector(d, .5); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); arm.castShadow = true; grp.add(arm);
    const pl = new THREE.Group(); const f = new THREE.Mesh(gSignBig, faceM); f.rotation.y = Math.PI; f.position.z = -.04; const bk = new THREE.Mesh(gSignBig, backM); bk.position.z = -.045; f.castShadow = true; pl.add(f, bk);
    pl.position.copy(Bp).add(new THREE.Vector3(0, -.75, 0)); pl.rotation.y = bearingRot(s.az ?? 0); grp.add(pl);
  } else {
    const post = new THREE.Mesh(gSignPost, mGalv); post.position.y = 1.45; post.castShadow = true; grp.add(post);
    const face = new THREE.Mesh(gSign, faceM); face.position.set(0, 2.45, -.04); face.rotation.y = Math.PI; face.castShadow = true;
    const back = new THREE.Mesh(gSign, backM); back.position.set(0, 2.45, -.045); grp.add(face, back);
    grp.rotation.y = bearingRot(s.az ?? 0); at(grp, s.p);
  }
  addTo('siv', grp, { disc: 'Sinalização vertical', t: `${code} – ${s.desc || ''}`, rows: [['Suporte', s.suporte || '—'], ['Situação', s.situacao || '—'], ['Dimensão', s.dim || '—'], ['Estaca', s.est || '—'], ['Azimute da face', `${fmt(s.az || 0, 1)}°`], ...ajRow(s)], src: '5S-102/103 · suporte em URB-SIN (5L-105)' });
}
// traffic signals (CET)
const mLensR = new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff2a1a, emissiveIntensity: 1.6 });
const mLensY = new THREE.MeshStandardMaterial({ color: 0x3a2a05, emissive: 0xffb020, emissiveIntensity: .12 });
const mLensG = new THREE.MeshStandardMaterial({ color: 0x06331a, emissive: 0x19e07a, emissiveIntensity: .12 });
function focal(tipo) {
  const g = new THREE.Group(); const n = tipo === 'pedestre' ? 2 : 3; const h = n * .34 + .06;
  const box = new THREE.Mesh(new THREE.BoxGeometry(.36, h, .28), mDark); box.castShadow = true; g.add(box);
  const mats = tipo === 'pedestre' ? [mLensR, mLensG] : [mLensR, mLensY, mLensG];
  for (let i = 0; i < n; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(.12, 20), mats[i]); l.position.set(0, h / 2 - .2 - i * .34, -.145); l.rotation.y = Math.PI; g.add(l);
    const vis = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .16, 20, 1, true, 0, Math.PI), mDark); vis.rotation.x = Math.PI / 2; vis.rotation.z = Math.PI; vis.position.set(0, h / 2 - .2 - i * .34 + .0, -.22); g.add(vis); }
  return g;
}
const semSrc = o => o.src || (/herm/i.test(o.cruz || '') ? 'CET 451-0058/25-0 (ID-0535)' : 'Projeto semafórico CET');
const colById = new Map();
for (const c of feat('colunas')) {
  if (!c || !c.p) continue; const grp = new THREE.Group(); const H = c.braco ? 6.0 : 3.6; const col = new THREE.Mesh(cyl(.07, .09, H, 12), mGalv); col.position.y = H / 2; col.castShadow = true; grp.add(col);
  if (c.braco) { const L = c.alcance || 6.5; const arm = new THREE.Mesh(cyl(.05, .06, L, 10), mGalv); arm.rotation.x = Math.PI / 2; arm.position.set(0, H - .25, -L / 2); const a = new THREE.Group(); a.add(arm); a.rotation.y = bearingRot(c.az || 0); grp.add(a); }
  at(grp, c.p); if (!colById.has(c.id)) colById.set(c.id, []); colById.get(c.id).push({ c, H });
  addTo('siv', grp, { disc: 'Semafórico (CET)', t: `Coluna semafórica ${c.id}`, rows: [...(c.cruz ? [['Cruzamento', c.cruz]] : []), ['Braço projetado', c.braco ? `sim · ${fmt(c.az || 0, 1)}° · ${fmt(c.alcance || 0, 1)} m` : 'não'], ['Altura', `${fmt(H, 1)} m (típica)`], ...ajRow(c)], src: semSrc(c) });
}
for (const f of feat('focais')) {
  const list = colById.get(f.col); if (!list || !f.ps) continue;
  const cc = list.reduce((b, x) => Math.hypot(x.c.p[0] - f.ps[0], x.c.p[1] - f.ps[1]) < Math.hypot(b.c.p[0] - f.ps[0], b.c.p[1] - f.ps[1]) ? x : b, list[0]);
  const g = focal(f.tipo); let p;
  if (f.braco) { p = [f.ps[0], f.ps[1], cc.c.p[2] + cc.H - .9]; } else { const cp = cc.c.p; p = [cp[0], cp[1], cp[2] + (f.tipo === 'pedestre' ? 2.6 : 3.0)]; }
  g.rotation.y = bearingRot(f.az || 0); g.position.copy(V(...p));
  if (!f.braco) { const off = new THREE.Vector3(0, 0, -.22).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y); g.position.add(off); }
  addTo('siv', g, { disc: 'Semafórico (CET)', t: `Grupo focal ${f.tipo} – coluna ${f.col}`, rows: [...(cc.c.cruz ? [['Cruzamento', cc.c.cruz]] : []), ['Azimute da face', `${fmt(f.az || 0, 1)}°`], ['Montagem', f.braco ? 'no braço projetado' : 'na coluna']], src: semSrc(cc.c) });
}
{
  const gBase = new THREE.BoxGeometry(.9, .15, .7), gCab = new THREE.BoxGeometry(.7, 1.3, .45), mCab = new THREE.MeshStandardMaterial({ color: 0x6f7a73, roughness: .6, metalness: .3 });
  for (const c of feat('controladores')) {
    if (!c || !c.p) continue; const grp = new THREE.Group(); const base = new THREE.Mesh(gBase, mConc); base.position.y = .075; const cab = new THREE.Mesh(gCab, mCab); cab.position.y = .8; cab.castShadow = true; grp.add(base, cab);
    at(grp, c.p); grp.rotation.y = bearingRot(axisBearing(c.p[0], c.p[1]));
    addTo('siv', grp, { disc: 'Semafórico (CET)', t: 'Controlador semafórico', rows: [['Tipo', c.tipo || '—'], ...(c.cruz ? [['Cruzamento', c.cruz]] : []), ...ajRow(c)], src: semSrc(c) });
  }
}
// bus shelters: the long edge nearer to an axis is the front
const nearAxisD = (x, y) => { let b = Infinity; for (const P of ['PD', 'PE']) if (ALN[P]) b = Math.min(b, Math.abs(ALN[P].proj([x, y])[1])); return b; };
for (const a of feat('abrigos')) {
  if (!a || !a.p || a.p.length < 4) continue; const P = a.p.map(q => new THREE.Vector2(q[0], q[1])); const z = a.p[0][2];
  const e = [0, 1, 2, 3].map(i => [P[i], P[(i + 1) % 4]]); e.sort((m, n) => n[0].distanceTo(n[1]) - m[0].distanceTo(m[1]));
  const mid = s => s[0].clone().add(s[1]).multiplyScalar(.5);
  const long = e.slice(0, 2); long.sort((m, n) => nearAxisD(mid(m).x, mid(m).y) - nearAxisD(mid(n).x, mid(n).y)); const backE = long[1];
  const grp = new THREE.Group(); const H = 2.6;
  for (const q of [...backE, ...long[0]]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.08, H, .08), mDark); post.position.copy(V(q.x, q.y, z + H / 2)); post.castShadow = true; grp.add(post); }
  const c = P.reduce((s, v) => s.add(v), new THREE.Vector2()).multiplyScalar(.25); const dirL = backE[1].clone().sub(backE[0]); const ang = Math.atan2(dirL.y, dirL.x);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(backE[0].distanceTo(backE[1]) + .3, .08, 1.5), mDark); roof.position.copy(V(c.x, c.y, z + H + .04)); roof.rotation.y = ang; roof.castShadow = true; grp.add(roof);
  const bm = mid(backE); const glass = new THREE.Mesh(new THREE.BoxGeometry(backE[0].distanceTo(backE[1]), 1.9, .02), mGlass); glass.position.copy(V(bm.x, bm.y, z + 1.25)); glass.rotation.y = ang; grp.add(glass);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, .06, .4), mGalv); const bp = bm.clone().lerp(c, .45); bench.position.copy(V(bp.x, bp.y, z + .46)); bench.rotation.y = ang; grp.add(bench);
  addTo('urb', grp, { disc: 'Urbanismo', t: 'Abrigo de ônibus', rows: [['Parada', a.parada || '—'], ['Módulo', '4,06 × 1,20 m']], src: '5L-105 xref ARQ-301' });
}
{ const gT = new THREE.BoxGeometry(.45, 2.3, .18), mT = new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: .5 });
  for (const t of feat('totens')) { if (!t || !t.p) continue; const m = new THREE.Mesh(gT, mT); m.position.copy(V(t.p[0], t.p[1], t.p[2] + 1.15)); m.rotation.y = bearingRot(axisBearing(t.p[0], t.p[1])); m.castShadow = true; addTo('urb', m, { disc: 'Urbanismo', t: 'Totem de parada de ônibus', rows: t.tipo ? [['Tipo', t.tipo]] : [], src: '5L-105 xref ARQ-301' }); } }
// fences (gradil)
{
  const mG = new THREE.MeshStandardMaterial({ map: TX.gradil, transparent: true, alphaTest: .45, side: THREE.DoubleSide, roughness: .5, metalness: .6 });
  for (const P of feat('gradil')) {
    if (!P || P.length < 2) continue; const pos = [], uv = [], idx = []; let acc = 0; const h = 1.1;
    for (let i = 0; i < P.length; i++) { if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); const a = V(P[i][0], P[i][1], P[i][2] + .15), b = V(P[i][0], P[i][1], P[i][2] + .15 + h); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); uv.push(acc / 1.2, 0, acc / 1.2, 1); if (i) { const k = 2 * (i - 1); idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mG); mesh.castShadow = true; addTo('urb', mesh, { disc: 'Urbanismo', t: 'Gradil de proteção', rows: [['Altura', '1,10 m (típica)']], src: '5L-105 (URB)' });
  }
}
// existing cadastre
{
  const list = feat('postes_exist').filter(p => p && p.p);
  if (list.length) { const g = cyl(.1, .16, 9, 10); g.translate(0, 4.5, 0); const im = new THREE.InstancedMesh(g, mConc, list.length); list.forEach((p, k) => im.setMatrixAt(k, instMatrix(p.p, 0))); im.castShadow = true; im.computeBoundingSphere();
    addInst('exi', im, list.map(p => ({ disc: 'Cadastro existente', t: `Poste existente ${p.id || ''}`.trim(), rows: [['Tipo', p.tipo || '—'], ['Altura', '9 m (adotada)']], src: 'Levantamento 5T (POSTE)' }))); }
  const geos = [];
  for (const P of feat('muros')) { if (!P || P.length < 2) continue; const pos = [], uv = [], idx = []; let acc = 0; const h = 2.0; for (let i = 0; i < P.length; i++) { if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); const a = V(P[i][0], P[i][1], P[i][2] - .2), b = V(P[i][0], P[i][1], P[i][2] + h); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); uv.push(acc / 2.4, 0, acc / 2.4, (h + .2) / 2.4); if (i) { const k = 2 * (i - 1); idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); geos.push(g.toNonIndexed()); }
  if (geos.length) { const g = mergeGeometries(geos); g.computeVertexNormals(); const m = MAT.muro; m.side = THREE.DoubleSide; const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; addTo('exi', mesh, { disc: 'Cadastro existente', t: 'Muros e divisas de lote', rows: [['Altura', '2,0 m (adotada – não consta)']], src: 'Levantamento 5T (ALINHAMENTO)' }); }
  const eg = [];
  for (const b of feat('edif')) { const P = b && b.p; if (!P || P.length < 3) continue; const pts = P.map(q => new THREE.Vector2(q[0], q[1])); if (pts[0].distanceTo(pts[pts.length - 1]) < .01) pts.pop(); if (pts.length < 3) continue;
    const zb = Math.min(...P.map(q => q[2] ?? 0)); const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 6, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, zb - .1, 0); eg.push(g.index ? g.toNonIndexed() : g); }
  if (eg.length) { const g = mergeGeometries(eg); g.computeVertexNormals(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: .9 })); mesh.castShadow = mesh.receiveShadow = true;
    addTo('exi', mesh, { disc: 'Cadastro existente', t: 'Edificações (contorno do levantamento)', rows: [['Quantidade', String(eg.length)], ['Altura', '6 m (ilustrativa – não levantada)']], src: 'Levantamento 5T (EDIFICAÇÃO)' }); }
}
// drainage
const mTubo = new THREE.MeshStandardMaterial({ color: 0x9aa0a0, roughness: .8 });
const mTuboIn = new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 1, side: THREE.BackSide });
const mCap = new THREE.MeshBasicMaterial({ color: 0x151719 });
function tube(a, b, rIn, rOut) {
  const A = V(...a), B = V(...b); const d = B.clone().sub(A); const L = d.length(); const g = new THREE.Group();
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rOut, rOut, L, 28, 1, true), mTubo); const i = new THREE.Mesh(new THREE.CylinderGeometry(rIn, rIn, L, 28, 1, true), mTuboIn);
  const ring = new THREE.RingGeometry(rIn, rOut, 28); const r1 = new THREE.Mesh(ring, mTubo); r1.rotation.x = -Math.PI / 2; const r2 = r1.clone(); r2.rotation.x = Math.PI / 2;
  const c1 = new THREE.Mesh(new THREE.CircleGeometry(rIn, 28), mCap); c1.position.y = L / 2 + .015; c1.rotation.x = -Math.PI / 2; const c2 = c1.clone(); c2.position.y = -L / 2 - .015; c2.rotation.x = Math.PI / 2;
  r1.position.y = L / 2 + .02; r2.position.y = -L / 2 - .02; g.add(o, i, r1, r2, c1, c2); g.position.copy(A).addScaledVector(d, .5); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); o.castShadow = true; return g;
}
const TUBOS = ((M.dren || {}).tubos || []).filter(t => t && t.a && t.b);
for (const t of TUBOS) {
  const g = tube(t.a, t.b, t.d / 2, t.d / 2 + (t.wall || .08));
  addTo('dre', g, { disc: 'Drenagem', t: `Tubo Ø${fmt(t.d, 2)} m – ${t.de || '?'} → ${t.para || '?'}`, rows: [['GI montante', t.gim != null ? `${fmt(t.gim)} m` : '—'], ['GI jusante', t.gij != null ? `${fmt(t.gij)} m${t.gij_origem && String(t.gij_origem).startsWith('calc') ? ' (C×i)' : ''}` : '—'], ['Declividade', t.decl != null ? `${fmt(t.decl, 2)} %` : '—'], ['Comprimento', t.C != null ? `${fmt(t.C, 2)} m` : '—'], ['Material', t.mat || '—']], src: 'DE-VM-TV-01-5H-502/503' });
}
{ const mLid = new THREE.MeshStandardMaterial({ map: TX.tampao, roughness: .5, metalness: .6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const l of ((M.dren || {}).lids || [])) {
    if (!l || !l.c) continue; const lid = new THREE.Mesh(new THREE.CircleGeometry(l.r || .4, 32), mLid); lid.rotation.x = -Math.PI / 2; lid.position.copy(V(l.c[0], l.c[1], l.c[2])); lid.receiveShadow = true;
    addTo('dre', lid, { disc: 'Drenagem', t: `Tampão de ferro fundido – ${l.id || ''}`, rows: [['Diâmetro', `${fmt(2 * (l.r || .4), 2)} m`]], src: 'VOLUME-16 PMSP – DH 01' });
  } }
// station labels
function labelSprite(txt, sub) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.92)'; g.strokeStyle = '#c85e14'; g.lineWidth = 5; const r = 14; g.beginPath(); g.roundRect(4, 4, 248, 88, r); g.fill(); g.stroke();
  g.fillStyle = '#1b2125'; g.font = '700 40px "Space Grotesk", Arial, sans-serif'; g.textAlign = 'center'; g.fillText(txt, 128, 46); g.font = '500 26px "JetBrains Mono", monospace'; g.fillStyle = '#5b666d'; g.fillText(sub, 128, 78);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true })); s.scale.set(2.0, .75, 1); return s;
}
{ const gLine = cyl(.02, .02, 1.7, 6), mLine = new THREE.MeshBasicMaterial({ color: 0xc85e14 });
  for (const e of (M.est || [])) {
    if (!e.major || !e.p) continue; const grp = new THREE.Group(); const s = labelSprite(`${e.pista} ${e.lab}`, fmt(e.cota)); s.position.copy(V(e.p[0], e.p[1], e.p[2] + 1.95));
    const line = new THREE.Mesh(gLine, mLine); line.position.copy(V(e.p[0], e.p[1], e.p[2] + .85)); grp.add(s, line);
    addTo('est', grp, { disc: 'Geometria', t: `Estaca ${e.pista} ${e.lab}`, rows: [['Cota do greide (LB≡LP)', `${fmt(e.cota)} m`]], src: 'Perfil 5F-352-B/353-1' });
  } }

// ---------- JUNTAR O QUE É ESTÁTICO (menos chamadas de desenho)
/* Placa, semáforo, tubo, abrigo, tampão: cada peça era um objeto, e cada objeto
   uma chamada de desenho — 834 só nas placas e semáforos, 421 na drenagem (um
   tubo eram 6). No celular, o que pesa no quadro é o NÚMERO de chamadas, não
   os triângulos. Aqui as peças de um grupo que usam o mesmo material viram UMA
   malha, e cada triângulo guarda de qual ficha veio (faceB → infos): o toque, a
   busca (com a caixa da peça guardada) e as camadas continuam iguais. Só o que
   nasce do índice: superfícies dos trechos (TOP/READ), instanciados, sprites e
   linhas ficam como estão. */
const usaUV = m => ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'emissiveMap'].some(k => m[k]);
function consolidar(gid) {
  const G = GRP[gid]; if (!G) return 0; G.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(G.matrixWorld).invert(), lotes = new Map(), infos = [], tops = [];
  for (const top of [...G.children]) {
    const pecas = [], soltos = []; let fora = false;
    top.traverse(o => { if (o.isInstancedMesh || (o.isMesh && (Array.isArray(o.material) || o.userData.stype || o.userData.noAO))) fora = true;
      else if (o.isSprite || o.isPoints || o.isLine) soltos.push(o); else if (o.isMesh) pecas.push(o); });
    if (fora || !pecas.length || !top.visible || (top.isSprite || top.isPoints || top.isLine)) continue;
    const I = top.userData.info || null, ii = I ? infos.push(I) - 1 : -1;
    // e por trecho de 400 m da avenida: uma malha do tamanho da obra inteira não sairia nunca do quadro (recorte de visão)
    // e faria o raio do toque e do zoom testar todos os triângulos dela
    const box = new THREE.Box3().setFromObject(top), c = box.getCenter(new THREE.Vector3()), cel = Math.floor((c.x * Uv[0] - c.z * Uv[1]) / 400);
    for (const o of pecas) {
      if (!o.visible) continue;
      const m = o.material, uv = usaUV(m), k = m.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + o.renderOrder + '|' + cel;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (!(a === 'position' || a === 'normal' || (a === 'uv' && uv))) g.deleteAttribute(a);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (uv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      let L = lotes.get(k); if (!L) lotes.set(k, L = { m, cast: o.castShadow, recv: o.receiveShadow, ord: o.renderOrder, geos: [], faces: [] });
      L.geos.push(g); L.faces.push([ii, g.attributes.position.count / 3]);
    }
    tops.push({ top, ii, box, soltos });
  }
  if (!tops.length) return 0;
  const porInfo = new Map();
  for (const L of lotes.values()) {
    const g = mergeGeometries(L.geos); if (!g) continue; L.geos.forEach(x => x.dispose());
    const faceB = new Int32Array(g.attributes.position.count / 3); let f = 0;
    for (const [ii, n] of L.faces) { faceB.fill(ii, f, f + n); f += n; }
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, L.m); mesh.castShadow = L.cast; mesh.receiveShadow = L.recv; mesh.renderOrder = L.ord;
    mesh.userData.faceB = faceB; mesh.userData.infos = infos; mesh.name = gid + ':' + (L.m.name || L.m.type);
    G.add(mesh); pickables.push(mesh);
    for (const [ii] of L.faces) if (ii >= 0 && !porInfo.has(ii)) porInfo.set(ii, mesh);
  }
  for (const { top, ii, box, soltos } of tops) {
    // o rótulo (sprite) da estaca não se junta: sai do grupo da peça e fica no da camada, com a mesma ficha
    for (const o of soltos) { G.attach(o); if (ii >= 0) { o.userData.info = infos[ii]; pickables.push(o); } }
    G.remove(top); const j = pickables.indexOf(top); if (j >= 0) pickables.splice(j, 1);
    for (const e of searchIdx) if (e.o === top) { e.box = box; e.o = porInfo.get(ii) || soltos[0] || G; }
  }
  return tops.length;
}
{ const t0 = performance.now(); const n = ['siv', 'dre', 'urb', 'sih', 'est'].reduce((a, g) => a + consolidar(g), 0);
  window.__consolidados = { pecas: n, ms: Math.round(performance.now() - t0) }; }

// ---------- title, layers UI
$('ttl').textContent = M.title || 'Modelo 3D'; $('sub').textContent = M.subtitle || '';
$('tbPD').textContent = ALN.PD ? `${estStr(ALN.PD.m0)} → ${estStr(ALN.PD.m1)}` : '—';
$('tbPE').textContent = ALN.PE ? `${estStr(ALN.PE.m0)} → ${estStr(ALN.PE.m1)}` : '—';
const lyrlist = $('lyrlist');
for (const l of LYR) {
  const row = document.createElement('label'); row.className = 'lyr'; row.htmlFor = 'L_' + l.id;
  row.innerHTML = `<span class="sw" style="background:${l.sw}"></span><span class="code">${l.code}</span><span>${l.name}</span><input type="checkbox" id="L_${l.id}" ${l.on ? 'checked' : ''}>`;
  lyrlist.appendChild(row); row.querySelector('input').addEventListener('change', ev => { GRP[l.id].visible = ev.target.checked; invalidarSombra(); });
  if ((l.id === 'rdo' || l.id === 'fot') && !EMBED) row.hidden = true;   // fora do app não há RDO para mostrar
}
const hud = $('hud'); const tHud = $('toggleHud');
tHud.addEventListener('click', () => { const c = hud.classList.toggle('collapsed'); tHud.setAttribute('aria-expanded', String(!c)); });
if (window.innerWidth > 760 && !EMBED) hud.classList.remove('collapsed');   // dentro do app o painel nasce recolhido: a tela é do modelo
function setOpacity(v) {
  const list = [...SURF_MATS, 'barreira', 'sk_cbuq', 'sk_bgtc', 'sk_bgs', 'sk_ccr', 'sk_brita', 'sk_subleito', 'sk_solo', 'sk_humus', 'sk_concreto', 'sk_cmagro'];
  for (const k of list) { const m = MAT[k]; if (!m) continue; m.transparent = v < 1; m.opacity = k.startsWith('sk_') ? v * .55 : v; m.depthWrite = v >= 1; m.needsUpdate = true; }
  for (const m of Object.values(PAINT)) { m.transparent = v < 1; m.opacity = Math.min(1, v + .2); m.needsUpdate = true; }
  $('opacv').textContent = Math.round(v * 100) + '%'; $('opac').value = Math.round(v * 100);
}
$('opac').addEventListener('input', e => setOpacity(e.target.value / 100));
$('ext').addEventListener('change', e => window.__setExt(e.target.checked));
const tA = $('tAdult'), tM = $('tMuda');
function treeMode(adult) { TREE_F = adult ? 1 : 0.2; tA.setAttribute('aria-pressed', adult); tM.setAttribute('aria-pressed', !adult); for (const S of TREESETS) if (S.scalable) setTreeMatrices(S, TREE_F); invalidarSombra(); }
tA.onclick = () => treeMode(true); tM.onclick = () => treeMode(false);
// premissas (index.sources)
{
  const TAGL = { ok: 'projeto', est: 'estimado', ad: 'adotado' }; const rows = [];
  for (const s of M.sources || []) { const [tema, tag, txt] = s; const piece = `<span class="tag ${TAGL[tag] ? tag : 'ad'}">${TAGL[tag] || esc(tag)}</span>${esc(txt)}`; const last = rows[rows.length - 1]; if (last && last.tema === tema) last.html += ' ' + piece; else rows.push({ tema, html: piece }); }
  const o = ALN.PD ? ALN.PD.proj([0, 0]) : null; const oEst = o && o[2] < 1 ? ` em PD ${estStr(o[0])}` : '';
  if (!rows.some(r => /coordenad/i.test(r.tema))) rows.push({ tema: 'Coordenadas', html: `UTM do projeto (origem do modelo${oEst} = E ${fmt(M.origin.E)} · N ${fmt(M.origin.N)} · cota ${fmt(Z0)}). Cotas em metros.` });
  $('premBody').innerHTML = rows.map(r => `<tr><td>${esc(r.tema)}</td><td>${r.html}</td></tr>`).join('');
  if (ALN.PD) $('qHint').textContent = `Quantidades geométricas do modelo (PD ${axisRange('PD')}). Servem para conferência e não substituem a memória de cálculo da medição.`;
}
const prem = $('premissas');
$('openPrem').onclick = () => { prem.hidden = false; $('closePrem').focus(); };
$('closePrem').onclick = () => prem.hidden = true; prem.addEventListener('click', e => { if (e.target === prem) prem.hidden = true; });

// ---------- views + trechos
let tween = null, focusHint = null;
const hint = (x, y) => { focusHint = { p: [x, y], t: performance.now() }; };
function flyTo(p1, q1) { tween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1, q1 }; hint(q1.x, -q1.z); }
const VIEWNAME = { geral: 'Visão geral', pedestre: 'Esquina', motorista: 'Motorista', drenagem: 'Drenagem', corte: 'Corte das camadas', muro: 'Muro E', planta: 'Planta' };
const VIEWS = {};
for (const [k, v] of Object.entries(M.views || {})) { if (!v || !v.pos || !v.tgt) continue; VIEWS[k] = { pos: V(...v.pos), tgt: V(...v.tgt), opac: v.opac ?? 1, layers: v.layers || {}, nome: v.nome || VIEWNAME[k] || (k[0].toUpperCase() + k.slice(1)) }; }
if (!Object.keys(VIEWS).length) { const E = M.extent || { xmin: -50, xmax: 50, ymin: -50, ymax: 50 }; const cx = (E.xmin + E.xmax) / 2, cy = (E.ymin + E.ymax) / 2, R = Math.max(E.xmax - E.xmin, E.ymax - E.ymin); VIEWS.geral = { pos: V(cx - Uv[0] * R * .5 + Rv[0] * R * .45, cy - Uv[1] * R * .5 + Rv[1] * R * .45, R * .45), tgt: V(cx, cy, 3), opac: 1, layers: {}, nome: 'Visão geral' }; }
const vbar = $('views');
for (const [k, v] of Object.entries(VIEWS)) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.view = k; b.textContent = v.nome; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => goView(k)); vbar.appendChild(b); }
function pressView(k) { for (const b of vbar.querySelectorAll('.chip[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === k); }
function goView(k, instant) {
  const v = VIEWS[k]; if (!v) return; pressView(k); $('trechoSel').value = '';
  setOpacity(v.opac); for (const l of LYR) { const want = v.layers[l.id] ?? (k === 'drenagem' ? l.on : null); if (want !== null && want !== undefined) { GRP[l.id].visible = want; $('L_' + l.id).checked = want; } }
  if (k === 'drenagem') { GRP.dre.visible = true; $('L_dre').checked = true; }
  invalidarSombra();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (instant || reduce) { tween = null; camera.position.copy(v.pos); controls.target.copy(v.tgt); controls.update(); hint(v.tgt.x, -v.tgt.z); return; }
  flyTo(v.pos.clone(), v.tgt.clone());
}
const TRECHOS = (M.trechos || []).filter(t => t && t.pos && t.tgt);
{ const ts = $('trechoSel'); ts.innerHTML = `<option value="">Ir para…</option>` + TRECHOS.map((t, i) => `<option value="${i}">${esc(t.nome)}${t.desc ? ' · ' + esc(t.desc) : ''}</option>`).join('');
  if (!TRECHOS.length) $('trechoRow').hidden = true;
  ts.addEventListener('change', () => { const t = TRECHOS[+ts.value]; if (ts.value === '' || !t) return; pressView(null); flyTo(V(...t.pos), V(...t.tgt)); }); }

// ---------- picking + readout
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
const info = $('info');
function infoOf(o, iid) { if (o.userData.infos) return iid != null ? o.userData.infos[iid] : null; let x = o; while (x && !x.userData.info) x = x.parent; return x ? x.userData.info : null; }
function showInfo(I) {
  // estaca do RDO: marca no 3D e avisa o app (que abre a lista de lançamentos dela)
  const chave = I && I.chave ? I.chave : null;
  if (chave !== RDO.sel) { RDO.sel = chave; marcarSel(); }
  // as miniaturas são da estaca: outra coisa tocada, a faixa delas sai; a mesma estaca, ficam
  const fb = $('infoFotos');
  if (!chave || fb.dataset.chave !== chave) { fb.innerHTML = ''; fb.dataset.chave = chave || ''; fb.hidden = true;
    if (chave && PAI && I.fotos > 0) { const s = document.createElement('span'); s.className = 'aviso'; s.textContent = 'Carregando as fotos…'; fb.appendChild(s); fb.hidden = false; } }
  if (chave) avisarApp({ tipo: 'estaca', chave });
  RDO.aberta = chave;
  if (!I) { info.hidden = true; return; }
  preencherInfo(I);
}
function preencherInfo(I) {
  const chave = I.chave || null;
  // a linha curta da estaca ("Base · 101 lançamentos · último 19/11/25"): no celular é ela que aparece, no lugar da tabela
  $('infoLinha').textContent = I.linha || ''; info.classList.toggle('tem-linha', !!I.linha);
  const disc = $('infoDisc'); disc.textContent = I.disc || '';
  if (I.cor) { const sw = document.createElement('span'); sw.className = 'cor'; sw.style.background = String(I.cor); disc.prepend(sw); }
  $('infoT').textContent = I.t || '';
  const dl = $('infoDl'); dl.innerHTML = ''; for (const [k, v] of I.rows || []) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
  // botões que o app mandou junto (ver lançamentos, fotos, lançar aqui): o clique volta para o app
  const ac = $('infoAcoes'); ac.innerHTML = '';
  for (const [rot, acao, primario] of (PAI && I.acoes) || []) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (primario ? ' primary' : ''); b.textContent = rot; b.onclick = () => avisarApp({ tipo: 'acao', acao, chave }); ac.appendChild(b); }
  ac.hidden = !ac.children.length;
  $('infoSrc').textContent = I.src ? 'Fonte: ' + I.src : ''; info.hidden = false;
}
$('infoX').onclick = () => { info.hidden = true; RDO.aberta = null; if (RDO.sel) { RDO.sel = null; marcarSel(); } $('infoFotos').dataset.chave = ''; };
let down = null;
renderer.domElement.addEventListener('pointerdown', e => down = e.button === 0 ? [e.clientX, e.clientY] : null);   // info/measure: left click only
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  // o toque ATRAVESSA o ilustrativo (carro, pessoa, arbusto): quem toca a faixa da estaca com um carro em cima quer a estaca,
  // não a ficha "elemento ilustrativo"; só tocando o ilustrativo sozinho é que a ficha dele aparece
  ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects(pickables.filter(isVis), true);
  const hit = hits.find(h => !ehIlustrativo(h.object)) || hits[0];
  if (window.__measureClick && window.__measureClick(hit)) return;
  const pin = pinNoPonto(e.clientX, e.clientY, hit);
  if (pin != null) { showInfo(RDO.infos[pin]); return; }
  showInfo(hit ? infoOf(hit.object, hit.object.userData.faceB ? hit.object.userData.faceB[hit.faceIndex] : hit.instanceId) : null);
});
// ---------- mouse navigation (AutoCAD-style)
// wheel: zoom to the point under the cursor · left drag or Shift + wheel-button drag: orbit around the point under the cursor
// right drag or wheel-button drag: pan (the grabbed point follows the cursor) · touch: OrbitControls (unchanged)
const NAV = { mode: null, zoom: null, lt: 0 };
const NAV_K = Math.log(1 / 0.8) / 100, NAV_MIN = 0.6, NAV_MAX = 3000, NAV_PMIN = 0.002, NAV_PMAX = Math.PI * 0.495;
const _nv = new THREE.Vector3(), _nf = new THREE.Vector3(), _nr = new THREE.Vector3(), _nu = new THREE.Vector3(), _nq = new THREE.Quaternion(), _UP = new THREE.Vector3(0, 1, 0);
const navCv = renderer.domElement;
function navHit(cx, cy) {   // first visible surface under the screen point; else the horizontal plane at the target height
  const r = navCv.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(READ.filter(isVis).concat(pickables.filter(isVis)), true).find(h => { const m = h.object.material; return !(m && m.transparent && m.opacity < .5); });
  if (h && h.distance < 4000) return { p: h.point.clone(), hit: true, d: h.distance };
  const o = ray.ray.origin, d = ray.ray.direction;
  if (d.y < -1e-3) { const t = (controls.target.y - o.y) / d.y; if (t > 0 && t < 4000) return { p: o.clone().addScaledVector(d, t), hit: false, d: t }; }
  const t = Math.max(5, camera.position.distanceTo(controls.target)); return { p: o.clone().addScaledVector(d, t), hit: false, d: t };
}
function navZoom(P, f) {   // scale camera and target about P: P stays under the cursor
  const dc = camera.position.distanceTo(P);
  if (f < 1 && dc * f < NAV_MIN) f = Math.min(1, NAV_MIN / dc);
  if (f > 1 && dc * f > NAV_MAX) f = Math.max(1, NAV_MAX / dc);
  if (Math.abs(f - 1) < 1e-6) return false;
  camera.position.sub(P).multiplyScalar(f).add(P); controls.target.sub(P).multiplyScalar(f).add(P); return true;
}
function navOrbit(P, dx, dy) {   // same angular speed as before; view kept between the top view and just above the horizon
  const h = navCv.clientHeight;
  _nq.setFromAxisAngle(_UP, -2 * Math.PI * dx / h);
  camera.position.sub(P).applyQuaternion(_nq).add(P); controls.target.sub(P).applyQuaternion(_nq).add(P);
  _nf.subVectors(controls.target, camera.position).normalize();
  const phi = Math.acos(THREE.MathUtils.clamp(-_nf.y, -1, 1)), d = THREE.MathUtils.clamp(phi - 2 * Math.PI * dy / h, NAV_PMIN, NAV_PMAX) - phi;
  if (Math.abs(d) < 1e-7) return;
  _nr.crossVectors(_nf, _UP).normalize(); _nq.setFromAxisAngle(_nr, d);
  _nv.copy(camera.position).sub(P).applyQuaternion(_nq).add(P);
  if (d > 0 && _nv.y < groundZ(_nv.x, -_nv.z) + 0.3) return;   // tilting would put the camera under the ground: stop there
  camera.position.copy(_nv); controls.target.sub(P).applyQuaternion(_nq).add(P);
}
function navPan(depth, dx, dy) {   // the grabbed point (at this depth along the view axis) follows the cursor
  const wpp = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / navCv.clientHeight / camera.zoom;
  camera.updateMatrixWorld(); _nr.setFromMatrixColumn(camera.matrixWorld, 0); _nu.setFromMatrixColumn(camera.matrixWorld, 1);
  _nv.copy(_nr).multiplyScalar(-dx * wpp).addScaledVector(_nu, dy * wpp); camera.position.add(_nv); controls.target.add(_nv);
}
function navRetarget() {   // keep the target on the surface at the centre of the view (mini-map, station readout, touch orbit)
  const r = navCv.getBoundingClientRect(), H = navHit(r.left + r.width / 2, r.top + r.height / 2);
  if (H.hit && H.d < 2400) controls.target.copy(H.p);
}
const navMark = (() => {   // small ring at the orbit pivot while orbiting
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.lineWidth = 7; g.strokeStyle = 'rgba(20,24,27,.75)'; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.stroke(); g.lineWidth = 4; g.strokeStyle = '#ff7a1a'; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.stroke();
  g.fillStyle = '#ff7a1a'; g.beginPath(); g.arc(32, 32, 5, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); sp.scale.set(.045, .045, 1); sp.renderOrder = 12; sp.visible = false; scene.add(sp);
  return p => { sp.visible = !!p; if (p) sp.position.copy(p); };
})();
navCv.addEventListener('contextmenu', e => e.preventDefault());
navCv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // no auto-scroll on the wheel button
navCv.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
navCv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' || !controls.enabled || NAV.mode) return;
  const orbit = e.button === 0 || (e.button === 1 && e.shiftKey), pan = e.button === 2 || (e.button === 1 && !e.shiftKey);
  if (!orbit && !pan) return;
  tween = null; NAV.zoom = null;
  Object.assign(NAV, { mode: orbit ? 'orbit' : 'pan', pid: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, cur: navCv.style.cursor });
  try { navCv.setPointerCapture(e.pointerId); } catch (_) { }
});
navCv.addEventListener('pointermove', e => {
  if (!NAV.mode || e.pointerId !== NAV.pid) return;
  if (!controls.enabled) { navEnd(e); return; }
  if (!NAV.moved) {
    if (Math.hypot(e.clientX - NAV.x0, e.clientY - NAV.y0) < 3) return;
    const H = navHit(NAV.x0, NAV.y0); camera.getWorldDirection(_nf);
    NAV.moved = true; NAV.pivot = H.p; NAV.depth = Math.max(.5, _nv.subVectors(H.p, camera.position).dot(_nf)); NAV.lx = NAV.x0; NAV.ly = NAV.y0;
    if (NAV.mode === 'orbit') navMark(H.p); navCv.style.cursor = NAV.mode === 'orbit' ? 'move' : 'grabbing';
  }
  const dx = e.clientX - NAV.lx, dy = e.clientY - NAV.ly; NAV.lx = e.clientX; NAV.ly = e.clientY;
  if (NAV.mode === 'orbit') navOrbit(NAV.pivot, dx, dy); else navPan(NAV.depth, dx, dy);
});
function navEnd(e) {
  if (!NAV.mode || (e && e.pointerId !== NAV.pid)) return;
  const moved = NAV.moved; NAV.mode = null; navMark(null); navCv.style.cursor = NAV.cur || '';
  if (moved && controls.enabled) navRetarget();
}
navCv.addEventListener('pointerup', navEnd); navCv.addEventListener('pointercancel', navEnd); navCv.addEventListener('lostpointercapture', navEnd);
stage.addEventListener('wheel', e => {   // capture phase on the stage: runs before OrbitControls (whose wheel zooms to the screen centre)
  if (e.target !== navCv) return; e.preventDefault(); e.stopPropagation();
  if (!controls.enabled || NAV.mode) return;
  tween = null;
  const dy = Math.max(-400, Math.min(400, e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1))), now = performance.now(), Z = NAV.zoom;
  const same = Z && Math.hypot(e.clientX - Z.x, e.clientY - Z.y) <= 2 && now - Z.t < 600;
  NAV.zoom = { P: same ? Z.P : navHit(e.clientX, e.clientY).p, x: e.clientX, y: e.clientY, r: (Z ? Z.r : 0) + dy * NAV_K, t: now, done: false };
}, { capture: true, passive: false });
function navStep(now) {   // eases the wheel zoom over ~0.15 s; at the end puts the target back on the surface
  const dt = Math.min(100, now - (NAV.lt || now)); NAV.lt = now;
  const Z = NAV.zoom; if (!Z) return;
  if (!controls.enabled) { NAV.zoom = null; return; }
  if (Math.abs(Z.r) > 1e-4) { const k = Math.abs(Z.r) < 2e-3 ? Z.r : Z.r * (1 - Math.exp(-dt / 55)); Z.r -= k; if (!navZoom(Z.P, Math.exp(k))) Z.r = 0; }
  else if (!Z.done && now - Z.t > 250) { Z.done = true; Z.r = 0; navRetarget(); }
}
window.__nav = { hit: (x, y) => navHit(x, y).p.toArray() };

function nearestAxis(x, y) { // PD/PE with the smallest |D| (inside the axis range when possible)
  let best = null; for (const P of ['PD', 'PE']) { const A = ALN[P]; if (!A) continue; const q = A.proj([x, y]); const s = Math.abs(q[1]) + (q[3] ? 1e4 : 0); if (!best || s < best.s) best = { P, m: q[0], D: q[1], s }; } return best;
}
const roA = $('roA'), roB = $('roB');
let lastMove = 0;
renderer.domElement.addEventListener('pointermove', e => {
  const now = performance.now(); if (now - lastMove < 60) return; lastMove = now; const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(READ.filter(isVis), false)[0]; if (!hit) return;
  const x = hit.point.x, y = -hit.point.z, z = hit.point.y + Z0;
  roA.textContent = `E ${fmt(M.origin.E + x, 2)} · N ${fmt(M.origin.N + y, 2)} · Z ${fmt(z, 3)}`;
  const a = nearestAxis(x, y); const rot = a && RDO.rot[a.P] ? ` (${RDO.rot[a.P]})` : '';
  roB.textContent = a ? `${a.P} ${estStr(a.m)}${rot} · afast. ${a.D >= 0 ? '+' : ''}${fmt(a.D, 2)} m` : '';
  // por cima de uma faixa do RDO: o que foi lançado ali
  if (RDO.mesh && isVis(RDO.mesh)) { const hr = ray.intersectObject(RDO.mesh, false)[0]; if (hr) { const I = RDO.infos[RDO.mesh.userData.faceB[hr.faceIndex]]; if (I) roB.textContent = I.t + ' · ' + (I.linha || I.resumo || ''); } }
});

// ================= tools =================
const toast = (msg, ms = 2600) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._h); toast._h = setTimeout(() => t.hidden = true, ms); };
const tabs = ['lyr', 'tools', 'q'];
for (const k of tabs) $('tb-' + k).addEventListener('click', () => { for (const j of tabs) { $('tb-' + j).setAttribute('aria-selected', j === k); $('t-' + j).hidden = j !== k; } });

// ---------- measuring
const mGroup = new THREE.Group(); scene.add(mGroup);
const mMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, depthTest: false }); const lMat = new THREE.LineBasicMaterial({ color: 0xff7a1a, depthTest: false });
const meas = { mode: null, pts: [] };
function dot(p) { const m = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), mMat); m.position.copy(p); m.renderOrder = 10; mGroup.add(m); }
function line(pts, closed) { const g = new THREE.BufferGeometry().setFromPoints(closed ? [...pts, pts[0]] : pts); const l = new THREE.Line(g, lMat); l.renderOrder = 10; mGroup.add(l); return l; }
function tag(p, text) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.fillStyle = 'rgba(20,24,27,.88)'; g.beginPath(); g.roundRect(2, 2, 508, 92, 14); g.fill(); g.fillStyle = '#fff'; g.font = '600 38px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(text, 256, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.scale.set(3.6, .675, 1); sp.position.copy(p).add(new THREE.Vector3(0, .9, 0)); sp.renderOrder = 11; mGroup.add(sp); }
function setMode(mode) {
  meas.mode = meas.mode === mode ? null : mode; meas.pts = [];
  $('mDist').setAttribute('aria-pressed', meas.mode === 'dist'); $('mArea').setAttribute('aria-pressed', meas.mode === 'area');
  $('mHint').textContent = meas.mode === 'area' ? 'Clique nos vértices; clique no primeiro ponto (ou Enter) para fechar.' : 'Clique em dois pontos do modelo. Esc cancela.';
  renderer.domElement.style.cursor = meas.mode ? 'crosshair' : '';
}
$('mDist').onclick = () => setMode('dist'); $('mArea').onclick = () => setMode('area');
$('mClear').onclick = () => { mGroup.clear(); meas.pts = []; $('mOut').innerHTML = ''; };
let tempLine = null;
function closeArea() {
  const P = meas.pts; if (P.length < 3) return; line(P, true);
  let A = 0, per = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a.x * (-b.z) - b.x * (-a.z); per += Math.hypot(b.x - a.x, b.z - a.z); }
  A = Math.abs(A) / 2; const c = P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length); tag(c, `${fmt(A, 2)} m²`);
  $('mOut').innerHTML = `<span>Área (projeção horizontal): ${fmt(A, 2)} m²</span><span>Perímetro: ${fmt(per, 2)} m · ${P.length} vértices</span>`;
  meas.pts = []; if (tempLine) { mGroup.remove(tempLine); tempLine = null; }
}
window.__measureClick = hit => {
  if (!meas.mode) return false; if (!hit) return true; const p = hit.point.clone();
  if (meas.mode === 'dist') {
    meas.pts.push(p); dot(p);
    if (meas.pts.length === 2) {
      const [a, b] = meas.pts; line([a, b]); const dh = Math.hypot(b.x - a.x, b.z - a.z), dz = b.y - a.y, d3 = a.distanceTo(b);
      tag(a.clone().lerp(b, .5), `${fmt(d3, 2)} m`);
      $('mOut').innerHTML = `<span>Distância 3D: ${fmt(d3, 3)} m</span><span>Horizontal: ${fmt(dh, 3)} m</span><span>Desnível: ${dz >= 0 ? '+' : ''}${fmt(dz, 3)} m</span><span>Declividade: ${dh > 0.001 ? fmt(dz / dh * 100, 2) + ' %' : '—'}</span><span>Cotas: ${fmt(a.y + Z0)} → ${fmt(b.y + Z0)} m</span>`;
      meas.pts = [];
    }
  } else {
    if (meas.pts.length >= 3 && p.distanceTo(meas.pts[0]) < .6) { closeArea(); return true; }
    meas.pts.push(p); dot(p); if (tempLine) mGroup.remove(tempLine); if (meas.pts.length > 1) tempLine = line(meas.pts);
    $('mOut').innerHTML = `<span>${meas.pts.length} vértice(s) — clique no primeiro ponto ou Enter para fechar</span>`;
  }
  return true;
};
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (meas.mode) setMode(meas.mode); if (drive.on) stopDrive(); }
  if (e.key === 'Enter' && meas.mode === 'area') closeArea();
});

// ---------- go to station (any axis)
const AXNAME = { PD: 'PD', PE: 'PE', R1: 'R1 – retorno 1', R2: 'R2 – retorno 2' };
{ const sel = $('gPista'); sel.innerHTML = AXES.map(k => `<option value="${k}">${esc(AXNAME[k] || k)}</option>`).join('');
  const upd = () => { const P = sel.value; $('gRange').textContent = ALN[P] ? `Faixa do eixo ${P}: ${axisRange(P)}` : ''; }; sel.addEventListener('change', upd); upd(); }
const marker = new THREE.Group(); scene.add(marker);
function goStation(P, m) {
  const A = ALN[P]; if (!A) return;
  if (!(m >= A.m0 - 1e-6 && m <= A.m1 + 1e-6)) { $('gOut').innerHTML = `<span>Fora da faixa do eixo ${esc(P)} (${axisRange(P)}).</span>`; return; }
  const p = A.pos(m), d = A.dir(m), r = [d[1], -d[0]]; let z = A.z(m); const hasG = fin(z); let zsrc = 'sup';
  if (!hasG) [z, zsrc] = groundZs(p[0], p[1]);
  const tgt = V(p[0], p[1], z); flyTo(V(p[0] + r[0] * 20 - d[0] * 12, p[1] + r[1] * 20 - d[1] * 12, z + 11), tgt);
  marker.clear(); const ring = new THREE.Mesh(new THREE.RingGeometry(.35, .55, 32), new THREE.MeshBasicMaterial({ color: 0xff7a1a, depthTest: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.copy(tgt).add(new THREE.Vector3(0, .05, 0)); ring.renderOrder = 10; marker.add(ring);
  const tn = A.tnAt(m); const rows = [`<span>${esc(P)} ${estStr(m)}</span>`];
  rows.push(hasG ? `<span>Greide (LB≡LP): ${fmt(z + Z0)} m</span>` : `<span>Cota no eixo (${zsrc === 'sup' ? 'superfície do projeto' : zsrc === 'tin' ? 'terreno natural' : 'aproximada'}): ${fmt(z + Z0)} m</span>`);
  if (hasG && fin(tn)) rows.push(`<span>Terreno natural no eixo: ${fmt(tn + Z0)} m</span><span>${z - tn >= 0 ? 'Aterro' : 'Corte'} no eixo: ${fmt(Math.abs(z - tn), 3)} m</span>`);
  for (const Q of ['PD', 'PE']) if (Q !== P && ALN[Q]) { const q = ALN[Q].proj(p); if (!q[3]) rows.push(`<span>Correspondente: ${Q} ${estStr(q[0])} (afast. ${q[1] >= 0 ? '+' : ''}${fmt(q[1], 2)} m)</span>`); }
  rows.push(`<span>E ${fmt(M.origin.E + p[0], 3)} · N ${fmt(M.origin.N + p[1], 3)}</span>`);
  $('gOut').innerHTML = rows.join('');
  if (!dock.hidden && dockMode === 'sec' && ALN.PD) { const q = P === 'PD' ? [m] : ALN.PD.proj(p); setSec(q[0]); }
}
$('gGo').onclick = () => { const m = parseEst($('gEst').value); if (m == null) { $('gOut').innerHTML = '<span>Use o formato 231+03 ou 231+03,50.</span>'; return; } goStation($('gPista').value, m); };
$('gEst').addEventListener('keydown', e => { if (e.key === 'Enter') $('gGo').click(); });

// ---------- dock: section & long profile
const dock = $('dock'), dc = $('dockC'); let dockMode = null;
const LCOL = { CBUQ: '#1e1f21', BGTC: '#8d8c84', BGS: '#a39680', Concreto: '#b9b6ae', CCR: '#9d9b93', Brita: '#7e7a72' };
const GS = M.greide_str || {}; const lay = (a, top) => (a || []).map(([n, t], i) => [n, +t || 0, i === 0 && top ? top : (LCOL[n] || '#a39680')]);
const STRUCT = {
  asfalto: GS.asf ? lay(GS.asf) : [['CBUQ', .12, '#1e1f21'], ['BGTC', .20, '#8d8c84'], ['BGS', .15, '#a39680']],
  rigido: GS.rig ? lay(GS.rig) : [['Concreto', .24, '#b9b6ae'], ['CCR', .12, '#9d9b93'], ['BGS', .20, '#a39680']],
  sarjeta: [['Concreto', .17, '#c9c6bd'], ['C. magro', .10, '#9d9b93']],
  passeio: GS.walk ? lay(GS.walk, '#c9c6bd') : [['Concreto', .07, '#c9c6bd'], ['Brita', .05, '#7e7a72']],
  plataforma: GS.walk ? lay(GS.walk, '#d2cec6') : [['Concreto', .07, '#d2cec6'], ['Brita', .05, '#7e7a72']],
  ciclovia: GS.walk ? lay(GS.walk, '#b0473c') : [['Concreto', .07, '#b0473c'], ['Brita', .05, '#7e7a72']],
  rampa: GS.walk ? lay(GS.walk, '#c9c6bd') : [['Concreto', .07, '#c9c6bd'], ['Brita', .05, '#7e7a72']],
  grama: [['Solo', .10, '#5d4430']],
};
const thick = L => L.reduce((a, l) => a + l[1], 0);
const TOPCOL = { asfalto: '#2a2c2f', rigido: '#9a978f', sarjeta: '#bdbab2', passeio: '#b9b7b0', plataforma: '#cfcbc3', ciclovia: '#b3261e', rampa: '#c3c0b8', grama: '#4f7a31', guia: '#e6e3dc', muro: '#8f8c85', tampa: '#a3a098', grelha: '#2b2b2b', terreno: '#6b7f3a' };
const T0 = -45, T1 = 30, DT = 0.1, NS = Math.round((T1 - T0) / DT);
const planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(T1 - T0, 22), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false })); planeMesh.visible = false; scene.add(planeMesh);
/* ---------- FATIA 3D (cinema): a pista cortada de verdade numa estaca, com as
   camadas na face do corte. O modelo só tem as camadas nas bordas (as "saias"
   sk_*); aqui um plano de corte global tira tudo o que está à frente da estaca
   e uma TAMPA desenha, na face, a estrutura de cada superfície (a mesma
   STRUCT da seção do painel: CBUQ, BGTC, BGS, concreto, brita…), o solo por
   baixo e o anel de cada tubo que atravessa o plano. */
const FATIA = { mesh: null, plano: new THREE.Plane(), chave: '' };
// sob a pista, o subleito compactado (0,60 m) antes do solo natural — como na seção do projeto
const ESTR_FATIA = Object.assign({}, STRUCT, { asfalto: [...STRUCT.asfalto, ['Subleito', .6]], rigido: [...STRUCT.rigido, ['Subleito', .6]],
  guia: [['Concreto', .30]], muro: [['Concreto', 1.2]], terreno: [['Solo', .25]] });
const MAT_OCO = new THREE.MeshBasicMaterial({ color: 0x0b0d0e, side: THREE.DoubleSide });
/* As cores da face são as da seção do painel (STRUCT), sobre um grão neutro: com as
   texturas das saias, BGTC e BGS saíam do mesmo cinza e o solo, de um laranja que
   tomava a imagem. */
const COR_CAMADA = { CBUQ: '#1e1f21', BGTC: '#8d8c84', BGS: '#b3a588', Concreto: '#c4c1b9', CCR: '#9d9b93', Brita: '#7e7a72', 'C. magro': '#9d9b93', Solo: '#5d4430', Subleito: '#8a6b4c', solo: '#6a4b34' };
let _graoFatia = null; const _matFatia = new Map();
function matFatia(nome) {
  let m = _matFatia.get(nome); if (m) return m;
  if (!_graoFatia) _graoFatia = canvasTex(128, (g, S) => speckle(g, S, '#8a8a8a', 2600, ['#727272', '#a3a3a3', '#5e5e5e'], .4, 1.3, 91));
  m = new THREE.MeshStandardMaterial({ color: new THREE.Color(COR_CAMADA[nome] || COR_CAMADA.solo).multiplyScalar(1.12), map: _graoFatia, roughness: .95, side: THREE.DoubleSide });
  m.name = 'fatia_' + nome; m.userData.tile = 1.2; _matFatia.set(nome, m); return m;
}
/* A TAMPA: a face cortada na estaca m, de t0 a t1 (m, + à direita do eixo),
   com o solo até `prof` abaixo da superfície mais baixa. lado = −1: fica o que
   vem antes da estaca (a tampa encosta desse lado do plano); +1: o que vem depois. */
function tampaDaFatia(A, m, t0, t1, prof, lado) {
  const passo = .25, p = A.pos(m), d = A.dir(m), r = [d[1], -d[0]], ox = d[0] * .02 * lado, oy = d[1] * .02 * lado;
  const amostras = []; let zmin = Infinity;
  for (let t = t0; t <= t1 + 1e-6; t += passo) {
    const x = p[0] + r[0] * t, y = p[1] + r[1] * t, h = sampleTop(x, y, TOP); let z = h ? h.z : ngZ(x, y); if (!fin(z)) z = A.z(m);
    const st = h ? h.o.userData.stype : 'terreno'; amostras.push({ t, z, st }); zmin = Math.min(zmin, z);
  }
  const base = zmin - prof, porMat = new Map();
  const quad = (k, ta, za0, za1, tb, zb0, zb1) => {   // za0/zb0 em cima, za1/zb1 embaixo
    let g = porMat.get(k); if (!g) porMat.set(k, g = { p: [], uv: [], i: [] });
    const tile = 1.2, n0 = g.p.length / 3;
    for (const [t, z] of [[ta, za0], [tb, zb0], [tb, zb1], [ta, za1]]) { const w = V(p[0] + r[0] * t + ox, p[1] + r[1] * t + oy, z); g.p.push(w.x, w.y, w.z); g.uv.push(t / tile, z / tile); }
    g.i.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
  };
  for (let i = 0; i < amostras.length - 1; i++) {
    const a = amostras[i], b = amostras[i + 1], L = ESTR_FATIA[a.st] || ESTR_FATIA.terreno;
    let da = 0;
    for (const [nome, esp] of L) { quad(nome, a.t, a.z - da, a.z - da - esp, b.t, b.z - da, b.z - da - esp); da += esp; }
    quad('solo', a.t, a.z - da, base, b.t, b.z - da, base);
  }
  const grp = new THREE.Group();
  for (const [k, g] of porMat) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2)); geo.setIndex(g.i); geo.computeVertexNormals();
    // sem sombra na face: o que foi cortado fora continua lançando sombra (o passe de sombra ignora o corte global)
    const mesh = new THREE.Mesh(geo, matFatia(k)); mesh.receiveShadow = false; grp.add(mesh);
  }
  // tubos que atravessam o plano: anel de concreto e o oco escuro
  for (const tb of TUBOS) {
    const da = (tb.a[0] - p[0]) * d[0] + (tb.a[1] - p[1]) * d[1], db = (tb.b[0] - p[0]) * d[0] + (tb.b[1] - p[1]) * d[1];
    if (da * db > 0 || Math.abs(da - db) < 1e-6) continue;
    const f = da / (da - db), x = tb.a[0] + f * (tb.b[0] - tb.a[0]), y = tb.a[1] + f * (tb.b[1] - tb.a[1]), tc = (x - p[0]) * r[0] + (y - p[1]) * r[1];
    if (tc < t0 || tc > t1) continue;
    const zc = tb.a[2] + f * (tb.b[2] - tb.a[2]), ri = tb.d / 2, re = ri + (tb.wall || .08), N = 32, pa = [], ia = [], oco = [];
    const ponto = (t, z, k) => V(p[0] + r[0] * t + ox * k, p[1] + r[1] * t + oy * k, z);
    for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a);
      const e = ponto(tc + c * re, zc + s2 * re, 1.5), i2 = ponto(tc + c * ri, zc + s2 * ri, 1.5); pa.push(e.x, e.y, e.z, i2.x, i2.y, i2.z);
      if (k < N) { const q = 2 * k; ia.push(q, q + 1, q + 3, q, q + 3, q + 2); }
      oco.push(ponto(tc + c * ri, zc + s2 * ri, 1.75)); }
    const ga = new THREE.BufferGeometry(); ga.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); ga.setIndex(ia); ga.computeVertexNormals();
    grp.add(new THREE.Mesh(ga, matFatia('Concreto')));
    const go = new THREE.BufferGeometry().setFromPoints([ponto(tc, zc, 1.75), ...oco]); const io = []; for (let k = 1; k <= N; k++) io.push(0, k, k + 1); go.setIndex(io);
    grp.add(new THREE.Mesh(go, MAT_OCO));
  }
  grp.traverse(o => { o.raycast = () => { }; });
  return grp;
}
function largarTampa(g) { if (g) { scene.remove(g); g.traverse(o => o.geometry && o.geometry.dispose()); } }
function fatiaConfig(cfg) {
  if (!cfg) { largarTampa(FATIA.mesh); FATIA.mesh = null; renderer.clippingPlanes = []; FATIA.chave = ''; invalidarSombra(); invalidar(2); return; }
  const A = ALN[cfg.eixo || 'PD']; if (!A) return;
  const m = Math.max(A.m0 + 1, Math.min(A.m1 - 1, +cfg.m)), t0 = cfg.t0 ?? -40, t1 = cfg.t1 ?? 30, prof = cfg.prof ?? 14;
  const chave = [A.key, m.toFixed(3), t0, t1, prof].join('|'); if (chave === FATIA.chave) return; FATIA.chave = chave;
  const p = A.pos(m), d = A.dir(m);
  FATIA.plano.setFromNormalAndCoplanarPoint(new THREE.Vector3(-d[0], 0, d[1]), V(p[0], p[1], 0));   // fica o que vem ANTES da estaca
  renderer.clippingPlanes = [FATIA.plano];
  largarTampa(FATIA.mesh); FATIA.mesh = tampaDaFatia(A, m, t0, t1, prof, -1); scene.add(FATIA.mesh); invalidarSombra(); invalidar(2);
}
// clipping: section plane, limited to ±90 m across the axis (clipIntersection) so far parts of the avenue are not cut
const CLIP = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()], LAT = 90; let clipOn = false;
let secTampa = null, secTampaChave = '';
function applyClip(on) { clipOn = on; if (!on && secTampa) { largarTampa(secTampa); secTampa = null; secTampaChave = ''; } const seen = new Set(); for (const id in GRP) GRP[id].traverse(o => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (seen.has(m)) continue; seen.add(m); m.clippingPlanes = on ? CLIP : null; m.clipIntersection = true; m.needsUpdate = true; } }); invalidarSombra(); }
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function fitCanvas() { const r = dc.getBoundingClientRect(), k = Math.min(devicePixelRatio, 2); dc.width = Math.max(10, r.width * k); dc.height = Math.max(10, r.height * k); const g = dc.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); return [g, r.width, r.height]; }
let secM = null;
if (ALN.PD) { const s = $('secS'); s.min = Math.ceil(ALN.PD.m0 * 2) / 2; s.max = Math.floor(ALN.PD.m1 * 2) / 2; }
const tgtStationPD = () => ALN.PD ? Math.max(ALN.PD.m0, Math.min(ALN.PD.m1, ALN.PD.proj([controls.target.x, -controls.target.z])[0])) : 0;
function setSec(m) { if (!ALN.PD) return; secM = Math.max(ALN.PD.m0, Math.min(ALN.PD.m1, m)); $('secS').value = secM; drawSection(); }
function secStationFor(P) { const mpd = secM ?? tgtStationPD(); if (P === 'PD' || !ALN.PD) return mpd; return ALN[P].proj(ALN.PD.pos(mpd))[0]; }
let secData = null;
function headNote(g, W, padL, padR, left, right, ink, muted, leftShort) { // title at left, note at right only when both fit
  g.textAlign = 'left'; g.fillStyle = ink; g.font = '600 12px "JetBrains Mono", monospace'; if (leftShort && padL + g.measureText(left).width > W - padR) left = leftShort;
  const x0 = Math.min(padL, Math.max(4, W - padR - g.measureText(left).width)); g.fillText(left, x0, 14); const wl = g.measureText(left).width + x0 - padL;
  g.font = '11px "JetBrains Mono", monospace'; if (padL + wl + 24 + g.measureText(right).width <= W - padR) { g.textAlign = 'right'; g.fillStyle = muted; g.fillText(right, W - padR, 14); }
}
function drawSection(hoverT) {
  const A = ALN.PD; if (!A) return; if (secM == null) secM = tgtStationPD(); const m = secM; const ex = +$('vex').value;
  const p = A.pos(m), d = A.dir(m), r = [d[1], -d[0]]; const gpd = A.z(m);
  const pe = ALN.PE ? ALN.PE.proj(p) : null; const mpe = pe && !pe[3] ? pe[0] : null;
  $('secLbl').textContent = `PD ${estStr(m)}` + (mpe != null ? ` · PE ${estStr(mpe)}` : '');
  hint(p[0], p[1]);
  // 3D plane + clip
  const d3 = new THREE.Vector3(d[0], 0, -d[1]), r3 = new THREE.Vector3(r[0], 0, -r[1]), P0 = V(p[0], p[1], 0);
  const zc = fin(gpd) ? gpd : groundZ(p[0], p[1]); const tc = (T0 + T1) / 2;
  planeMesh.position.copy(V(p[0] + r[0] * tc, p[1] + r[1] * tc, zc + 2)); planeMesh.lookAt(planeMesh.position.clone().add(d3)); planeMesh.visible = true;
  const keepBefore = $('secSide').value === 'a'; const n1 = d3.clone().multiplyScalar(keepBefore ? -1 : 1);
  CLIP[0].set(n1, -n1.dot(P0)); CLIP[1].set(r3.clone(), -r3.dot(P0) - LAT); CLIP[2].set(r3.clone().negate(), r3.dot(P0) - LAT);
  // cortado, o modelo mostra na face as camadas da seção (era oco: só a casca da superfície)
  if (clipOn) { const ch = m.toFixed(2) + '|' + keepBefore + '|' + tileVer; if (ch !== secTampaChave) { secTampaChave = ch; largarTampa(secTampa); secTampa = tampaDaFatia(A, m, T0, T1, 3, keepBefore ? -1 : 1); scene.add(secTampa); invalidar(2); } }
  // sample along the normal
  const tops = visTops(); const pts = []; let corte = 0, aterro = 0, hits = 0;
  for (let i = 0; i <= NS; i++) {
    const t = T0 + i * DT, x = p[0] + r[0] * t, y = p[1] + r[1] * t; const h = sampleTop(x, y, tops); const ng = ngZ(x, y);
    const st = h ? h.o.userData.stype : null; const z = h ? h.z : ng; if (h) hits++;
    const L = st && st !== 'terreno' ? STRUCT[st] : null;
    if (L && fin(ng)) { const sub = z - thick(L); if (ng > sub) corte += (ng - sub) * DT; else aterro += (sub - ng) * DT; }
    pts.push({ t, z, st, ng });
  }
  // pipes crossing the plane
  const pipes = [];
  for (const tb of TUBOS) { const da = (tb.a[0] - p[0]) * d[0] + (tb.a[1] - p[1]) * d[1], db = (tb.b[0] - p[0]) * d[0] + (tb.b[1] - p[1]) * d[1]; if (da * db > 0 || Math.abs(da - db) < 1e-6) continue;
    const f = da / (da - db); const x = tb.a[0] + f * (tb.b[0] - tb.a[0]), y = tb.a[1] + f * (tb.b[1] - tb.a[1]); const t = (x - p[0]) * r[0] + (y - p[1]) * r[1]; if (t < T0 - 1 || t > T1 + 1) continue;
    pipes.push({ t, z: tb.a[2] + f * (tb.b[2] - tb.a[2]), r: tb.d / 2, R: tb.d / 2 + (tb.wall || .08), id: tb.id, d: tb.d }); }
  const LB = []; if (fin(gpd)) LB.push([0, 'LB PD', gpd]);
  if (mpe != null) { const q = ALN.PE.pos(mpe); const t = (q[0] - p[0]) * r[0] + (q[1] - p[1]) * r[1]; const z = ALN.PE.z(mpe); if (t >= T0 && t <= T1 && fin(z)) LB.push([t, 'LB PE', z]); }
  secData = { m, mpe, pts, corte, aterro, pipes };
  // draw
  const [g, W, H] = fitCanvas(); const ink = css('--ink'), muted = css('--muted'), line_ = css('--line'); g.clearRect(0, 0, W, H);
  let zmin = Infinity, zmax = -Infinity; for (const q of pts) { if (fin(q.ng)) { zmin = Math.min(zmin, q.ng); zmax = Math.max(zmax, q.ng); } if (fin(q.z)) { zmin = Math.min(zmin, q.z - (STRUCT[q.st] ? .6 : 0)); zmax = Math.max(zmax, q.z); } }
  for (const q of pipes) zmin = Math.min(zmin, q.z - q.R); for (const l of LB) { zmin = Math.min(zmin, l[2]); zmax = Math.max(zmax, l[2]); }
  const padL = 54, padR = 14, padT = 44, padB = 26;
  if (!fin(zmin)) { g.fillStyle = muted; g.font = '13px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText('Sem dados nesta estaca (trecho ainda não carregado ou fora do levantamento).', W / 2, H / 2); dc._map = null; return; }
  zmin -= .4; zmax += .5;
  const sx = (W - padL - padR) / (T1 - T0); let sy = ex ? sx * ex : (H - padT - padB) / (zmax - zmin); if ((zmax - zmin) * sy > H - padT - padB) sy = (H - padT - padB) / (zmax - zmin);
  const X = t => padL + (t - T0) * sx, Y = z => H - padB - (z - zmin) * sy;
  g.strokeStyle = line_; g.lineWidth = 1; g.fillStyle = muted; g.font = '11px "JetBrains Mono", monospace'; g.textAlign = 'right';
  const zstep = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].find(v => v * sy >= 18) || 10; for (let z = Math.ceil(zmin / zstep) * zstep; z <= zmax + 1e-9; z += zstep) { g.beginPath(); g.moveTo(padL, Y(z)); g.lineTo(W - padR, Y(z)); g.stroke(); g.fillText(fmt(z + Z0, zstep < .5 ? 2 : 1), padL - 5, Y(z) + 4); }
  const tst = [5, 10, 15, 25].find(v => v * sx >= 30) || 25; g.textAlign = 'center'; for (let t = Math.ceil(T0 / tst) * tst; t <= T1; t += tst) { g.fillText((t > 0 ? '+' : '') + t, X(t), H - 8); }
  for (let i = 0; i < pts.length - 1; i++) { const q = pts[i], q2 = pts[i + 1]; const L = STRUCT[q.st]; if (!L || q.st === 'grama' || !fin(q.ng)) continue; const sub = q.z - thick(L);
    g.fillStyle = q.ng > sub ? 'rgba(214,120,40,.30)' : 'rgba(60,150,90,.28)'; const y1 = Y(sub), y2 = Y(q.ng); g.fillRect(X(q.t), Math.min(y1, y2), X(q2.t) - X(q.t) + .5, Math.abs(y2 - y1)); }
  for (let i = 0; i < pts.length - 1; i++) { const q = pts[i], q2 = pts[i + 1]; const L = STRUCT[q.st]; if (!L) continue; let off = 0; for (const [, th, col] of L) { g.fillStyle = col; g.fillRect(X(q.t), Y(q.z - off), X(q2.t) - X(q.t) + .5, Math.max(1, th * sy)); off += th; } }
  g.lineWidth = 2.2; for (let i = 0; i < pts.length - 1; i++) { const q = pts[i], q2 = pts[i + 1]; if (!fin(q.z) || !fin(q2.z)) continue; g.strokeStyle = TOPCOL[q.st] || ink; g.beginPath(); g.moveTo(X(q.t), Y(q.z)); g.lineTo(X(q2.t), Y(q2.z)); g.stroke(); }
  g.setLineDash([6, 4]); g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.6; g.beginPath(); let pen = false; for (const q of pts) { if (!fin(q.ng)) { pen = false; continue; } if (pen) g.lineTo(X(q.t), Y(q.ng)); else g.moveTo(X(q.t), Y(q.ng)); pen = true; } g.stroke(); g.setLineDash([]);
  for (const q of pipes) { g.fillStyle = '#9aa0a0'; g.beginPath(); g.ellipse(X(q.t), Y(q.z), q.R * sx, q.R * sy, 0, 0, 7); g.fill(); g.fillStyle = '#1b1d1f'; g.beginPath(); g.ellipse(X(q.t), Y(q.z), q.r * sx, q.r * sy, 0, 0, 7); g.fill(); g.fillStyle = ink; g.font = '11px "JetBrains Mono", monospace'; g.fillText(`Ø${fmt(q.d, 2)}`, X(q.t), Y(q.z) - q.R * sy - 4); }
  g.strokeStyle = css('--accent'); g.lineWidth = 1; g.setLineDash([3, 3]); LB.sort((a, b) => a[0] - b[0]);
  LB.forEach(([t, lab, z], i) => { g.beginPath(); g.moveTo(X(t), 38); g.lineTo(X(t), H - padB); g.stroke(); g.fillStyle = css('--accent'); g.font = '600 11px "JetBrains Mono", monospace';
    g.textAlign = LB.length < 2 ? 'center' : i === 0 ? 'right' : 'left'; g.fillText(`${lab} ${fmt(z + Z0)}`, X(t) + (LB.length < 2 ? 0 : i === 0 ? -4 : 4), 34); }); g.setLineDash([]);
  headNote(g, W, padL, padR, hits ? `Corte ${fmt(corte, 2)} m²  ·  Aterro ${fmt(aterro, 2)} m²  (até o subleito)` : 'Projeto: trecho ainda não carregado — só terreno natural', `afastamento do LB da PD (m, + à direita) · exagero vertical ${fmt(sy / sx, 1)}×`, ink, muted,
    hits ? `Corte ${fmt(corte, 2)} · Aterro ${fmt(aterro, 2)} m²` : 'Trecho não carregado');
  if (hoverT != null) { const q = pts[Math.round((hoverT - T0) / DT)]; if (q) { g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.moveTo(X(q.t), padT); g.lineTo(X(q.t), H - padB); g.stroke(); const txt = `t ${q.t >= 0 ? '+' : ''}${fmt(q.t, 2)} · projeto ${fin(q.z) ? fmt(q.z + Z0) : '—'} · terreno ${fin(q.ng) ? fmt(q.ng + Z0) : '—'}`; g.font = '600 12px "JetBrains Mono", monospace'; const w = g.measureText(txt).width + 12; const xx = Math.min(W - padR - w, Math.max(padL, X(q.t) + 8)); g.fillStyle = css('--panel-solid'); g.fillRect(xx, padT + 2, w, 20); g.fillStyle = ink; g.textAlign = 'left'; g.fillText(txt, xx + 6, padT + 16); } }
  dc._map = { T0, sx, padL };
}
let perfP = 'PD', perfWin = 'all';
function drawProfile(hoverM) {
  const P = perfP; const A = ALN[P]; const ex = +$('vex').value; const [g, W, H] = fitCanvas(); const ink = css('--ink'), muted = css('--muted'), line_ = css('--line'); g.clearRect(0, 0, W, H);
  if (!A || !A.g) { g.fillStyle = muted; g.font = '13px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(`Sem greide para ${P}.`, W / 2, H / 2); dc._map = null; return; }
  let lo = A.m0, hi = A.m1; const cur = secStationFor(P);
  if (perfWin === 'win') { lo = Math.max(A.m0, cur - 100); hi = Math.min(A.m1, lo + 200); lo = Math.max(A.m0, hi - 200); }
  const pts = [{ m: lo, z: A.z(lo), ng: A.tnAt(lo) }]; for (let i = 0; i < A.n; i++) { const m = A.ms[i]; if (m > lo + 1e-6 && m < hi - 1e-6) pts.push({ m, z: A.g[i], ng: A.tn ? A.tn[i] : NaN }); } pts.push({ m: hi, z: A.z(hi), ng: A.tnAt(hi) });
  let zmin = Infinity, zmax = -Infinity; for (const q of pts) for (const v of [q.z, q.ng]) if (fin(v)) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); } zmin -= .5; zmax += 1.2;
  const padL = 54, padR = 14, padT = 50, padB = 26; const sx = (W - padL - padR) / (hi - lo); let sy = ex ? sx * ex : (H - padT - padB) / (zmax - zmin); if ((zmax - zmin) * sy > H - padT - padB) sy = (H - padT - padB) / (zmax - zmin);
  const X = m => padL + (m - lo) * sx, Y = z => H - padB - (z - zmin) * sy;
  g.strokeStyle = line_; g.fillStyle = muted; g.font = '11px "JetBrains Mono", monospace'; g.textAlign = 'right'; g.lineWidth = 1;
  const zs = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].find(v => v * sy >= 18) || 10; for (let z = Math.ceil(zmin / zs) * zs; z <= zmax + 1e-9; z += zs) { g.beginPath(); g.moveTo(padL, Y(z)); g.lineTo(W - padR, Y(z)); g.stroke(); g.fillText(fmt(z + Z0, zs < .5 ? 2 : 1), padL - 5, Y(z) + 4); }
  const step = [20, 40, 100, 200, 400, 1000].find(s => s * sx >= 34) || 1000;
  g.textAlign = 'center'; for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) { g.beginPath(); g.moveTo(X(m), padT); g.lineTo(X(m), H - padB); g.stroke(); g.fillText(String(Math.round(m / 20)), X(m), H - 8); }
  for (let i = 0; i < pts.length - 1; i++) { const q = pts[i]; if (!fin(q.ng) || !fin(q.z)) continue; g.fillStyle = q.ng > q.z ? 'rgba(214,120,40,.25)' : 'rgba(60,150,90,.22)'; g.fillRect(X(q.m), Math.min(Y(q.z), Y(q.ng)), X(pts[i + 1].m) - X(q.m) + .5, Math.abs(Y(q.z) - Y(q.ng))); }
  g.setLineDash([6, 4]); g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.6; g.beginPath(); let pen = false; for (const q of pts) { if (!fin(q.ng)) { pen = false; continue; } if (pen) g.lineTo(X(q.m), Y(q.ng)); else g.moveTo(X(q.m), Y(q.ng)); pen = true; } g.stroke(); g.setLineDash([]);
  g.strokeStyle = css('--accent'); g.lineWidth = 2.4; g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(X(q.m), Y(q.z)) : g.moveTo(X(q.m), Y(q.z))); g.stroke();
  g.font = '600 11px "JetBrains Mono", monospace'; let k = 0;
  for (const v of ((M.piv || {})[P] || [])) { if (v.m < lo - 1 || v.m > hi + 1) continue; const x = X(v.m), y = Y(v.z - Z0); const ly = k++ % 2 ? 29 : 41;
    const lab = perfWin === 'all' ? estStr(v.m).replace(/,00$/, '') : `PIV ${estStr(v.m).replace(/,00$/, '')} · ${fmt(v.z)}${v.L ? ` · L=${v.L}` : ''}`;
    g.fillStyle = ink; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.textAlign = x < padL + 40 ? 'left' : x > W - padR - 40 ? 'right' : 'center'; g.fillText(lab, x, ly);
    g.strokeStyle = ink; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, ly + 4); g.lineTo(x, y); g.stroke(); g.setLineDash([]); }
  if (secM != null && cur >= lo && cur <= hi) { g.strokeStyle = '#ff7a1a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(cur), padT); g.lineTo(X(cur), H - padB); g.stroke(); }
  headNote(g, W, padL, padR, `${P} ${estStr(lo)} → ${estStr(hi)}`, `greide (laranja) · terreno natural no eixo (tracejado) · exagero vertical ${fmt(sy / sx, 1)}×`, ink, muted);
  if (hoverM != null) { let q = pts[0]; for (const c of pts) if (Math.abs(c.m - hoverM) < Math.abs(q.m - hoverM)) q = c;
    g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.moveTo(X(q.m), padT); g.lineTo(X(q.m), H - padB); g.stroke(); const dd = q.z - q.ng;
    const txt = `${P} ${estStr(q.m)} · greide ${fmt(q.z + Z0)} · terreno ${fin(q.ng) ? fmt(q.ng + Z0) : '—'}${fin(dd) ? ` · ${dd >= 0 ? 'aterro' : 'corte'} ${fmt(Math.abs(dd), 2)} m` : ''}`;
    g.font = '600 12px "JetBrains Mono", monospace'; const w = g.measureText(txt).width + 12; const xx = Math.max(0, Math.min(W - padR - w, Math.max(padL, X(q.m) + 8))); g.fillStyle = css('--panel-solid'); g.fillRect(xx, padT + 2, w, 20); g.fillStyle = ink; g.textAlign = 'left'; g.fillText(txt, xx + 6, padT + 16); }
  dc._map = { lo, sx, padL };
}
function openDock(mode) {
  dockMode = mode; dock.hidden = false; document.body.classList.add('dock-open');
  $('dockT').textContent = mode === 'sec' ? 'Seção transversal' : 'Perfil longitudinal'; $('secCtl').hidden = mode !== 'sec'; $('perfCtl').hidden = mode !== 'perf';
  if (mode === 'sec') { if (secM == null) secM = tgtStationPD(); $('secS').value = secM; applyClip($('secClip').checked); drawSection(); } else { planeMesh.visible = false; applyClip(false); drawProfile(); }
}
$('oSec').onclick = () => openDock('sec'); $('oPerf').onclick = () => openDock('perf');
$('dockX').onclick = () => { dock.hidden = true; dockMode = null; planeMesh.visible = false; applyClip(false); document.body.classList.remove('dock-open'); };
$('secS').addEventListener('input', () => { secM = +$('secS').value; drawSection(); }); $('secSide').addEventListener('change', () => drawSection()); $('vex').addEventListener('change', () => dockMode === 'sec' ? drawSection() : drawProfile());
$('secPrev').onclick = () => setSec((secM ?? tgtStationPD()) - 1); $('secNext').onclick = () => setSec((secM ?? tgtStationPD()) + 1);
$('secClip').addEventListener('change', e => { applyClip(e.target.checked); $('secSide').hidden = !e.target.checked; drawSection(); });
const seg2 = (a, b, on) => { $(a).setAttribute('aria-pressed', on); $(b).setAttribute('aria-pressed', !on); };
$('pfPD').onclick = () => { perfP = 'PD'; seg2('pfPD', 'pfPE', true); drawProfile(); };
$('pfPE').onclick = () => { perfP = 'PE'; seg2('pfPD', 'pfPE', false); drawProfile(); };
$('pfAll').onclick = () => { perfWin = 'all'; seg2('pfAll', 'pfWin', true); drawProfile(); };
$('pfWin').onclick = () => { perfWin = 'win'; seg2('pfAll', 'pfWin', false); drawProfile(); };
dc.addEventListener('pointermove', e => { const r = dc.getBoundingClientRect(); const mp = dc._map; if (!mp) return; const x = e.clientX - r.left;
  if (dockMode === 'sec') drawSection(Math.max(T0, Math.min(T1, (x - mp.padL) / mp.sx + mp.T0))); else drawProfile((x - mp.padL) / mp.sx + mp.lo); });
dc.addEventListener('pointerleave', () => dockMode === 'sec' ? drawSection() : dockMode === 'perf' && drawProfile());
window.addEventListener('resize', () => { if (dockMode === 'sec') drawSection(); else if (dockMode === 'perf') drawProfile(); });

// ---------- drive-through (whole axis)
const drive = { on: false, P: 'PD', m: 0, last: 0, z: null };
function stopDrive() { drive.on = false; controls.enabled = true; $('dGo').disabled = false; $('dStop').disabled = true; }
$('dVel').addEventListener('input', e => $('dVelV').textContent = e.target.value + ' km/h');
$('dGo').onclick = () => { drive.P = $('dPista').value; const A = ALN[drive.P]; if (!A) return; drive.m = drive.P === 'PD' ? A.m0 + 2 : A.m1 - 2; drive.z = null; drive.last = performance.now(); drive.on = true; tween = null; controls.enabled = false; $('dGo').disabled = true; $('dStop').disabled = false; info.hidden = true; };
$('dStop').onclick = stopDrive;
function driveStep(now) {
  const dt = Math.min(.1, (now - drive.last) / 1000); drive.last = now; const v = +$('dVel').value / 3.6; const sgn = drive.P === 'PD' ? 1 : -1; drive.m += sgn * v * dt;
  const A = ALN[drive.P]; const end = sgn > 0 ? drive.m > A.m1 - 1 : drive.m < A.m0 + 1; if (end) { stopDrive(); return; }
  const D = drive.P === 'PD' ? 1.8 : -2.0; const p = A.pos(drive.m), d = A.dir(drive.m); const r = [d[1], -d[0]]; const cx = p[0] + r[0] * D, cy = p[1] + r[1] * D;
  const h = sampleTop(cx, cy, visTops()); const g0 = A.z(drive.m); const zs = h ? h.z : fin(g0) ? g0 - 0.02 * Math.abs(D) : groundZ(cx, cy);
  drive.z = drive.z == null ? zs : drive.z + (zs - drive.z) * Math.min(1, dt * 6);
  const m2 = Math.max(A.m0, Math.min(A.m1, drive.m + sgn * 25)); const p2 = A.pos(m2), d2 = A.dir(m2), r2 = [d2[1], -d2[0]]; const g2 = A.z(m2); const z2 = (fin(g2) ? g2 : drive.z) + 1.0;
  camera.position.copy(V(cx, cy, drive.z + 1.25)); controls.target.copy(V(p2[0] + r2[0] * D, p2[1] + r2[1] * D, z2)); camera.lookAt(controls.target); hint(cx, cy);
}

// ---------- search
function focusEntry(h) {
  const o = h.o; const b = new THREE.Box3();
  if (h.box) b.copy(h.box);   // peça que foi juntada às outras do mesmo material (consolidar)
  else if (o.isInstancedMesh && h.iid != null) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const mt = new THREE.Matrix4(); o.getMatrixAt(h.iid, mt); b.copy(o.geometry.boundingBox).applyMatrix4(mt).applyMatrix4(o.matrixWorld); }
  else b.setFromObject(o);
  if (b.isEmpty()) return; const c = b.getCenter(new THREE.Vector3()); const sz = b.getSize(new THREE.Vector3()).length();
  const dir = camera.position.clone().sub(controls.target).normalize(); if (dir.y < .25) dir.y = .35; dir.normalize();
  flyTo(c.clone().addScaledVector(dir, Math.max(7, Math.min(120, sz * 1.8))), c);
  if (!isVis(o)) { let p = o; while (p && p !== scene) { p.visible = true; p = p.parent; } for (const l of LYR) $('L_' + l.id).checked = GRP[l.id].visible; invalidarSombra(); }
  showInfo(h.I);
  const bh = new THREE.Box3Helper(b, 0xff7a1a); bh.material.depthTest = false; bh.renderOrder = 12; scene.add(bh); setTimeout(() => { scene.remove(bh); invalidar(); }, 3500);
}
$('sQ').addEventListener('input', e => {
  const q = normTxt(e.target.value).trim(); const box = $('results'); box.innerHTML = ''; if (q.length < 2) return;
  const hits = searchIdx.filter(x => q.split(/\s+/).every(w => x.key.includes(w))).slice(0, 30);
  if (!hits.length) { box.innerHTML = '<span class="hint">Nada encontrado nos trechos carregados.</span>'; return; }
  for (const h of hits) { const b = document.createElement('button'); b.setAttribute('role', 'listitem'); b.textContent = h.I.t; const sm = document.createElement('small'); sm.textContent = h.I.disc; b.appendChild(sm); b.onclick = () => focusEntry(h); box.appendChild(b); }
});

// ---------- sun
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const sunM = $('sunM'); MONTHS.forEach((m, i) => { const o = document.createElement('option'); o.value = i; o.textContent = m; sunM.appendChild(o); }); sunM.value = new Date().getMonth();
const SUN_COR = new THREE.Color(0xfff1dc), SUN_OURO = new THREE.Color(0xffa860), HEMI_COR = new THREE.Color(0xdfe9f2), HEMI_OURO = new THREE.Color(0xf2c9a4);
function setSun(regenEnv, hora, mes) {   // hora/mes: o cinema anda o sol sem o passo de 15 min do controle
  const mo = mes != null ? +mes : +sunM.value, h = hora != null ? +hora : +$('sunH').value;
  const hm = Math.round(h * 60); $('sunHV').textContent = `${String(Math.floor(hm / 60)).padStart(2, '0')}:${String(hm % 60).padStart(2, '0')}`;
  const N = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][mo]; const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (N + 10)) * Math.PI / 180; const lat = -23.55 * Math.PI / 180;
  const solar = h - 0.11; const HA = (solar - 12) * 15 * Math.PI / 180;           // lon -46,63 vs fuso -45°
  const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(HA));
  const az = Math.atan2(-Math.sin(HA), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(HA));
  const e = Math.max(el, 0.02); sunDir.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)).normalize();
  su.sunPosition.value.copy(sunDir); sky2.material.uniforms.sunPosition.value.copy(sunDir); updSun(true);
  sun.intensity = el > 0 ? SUN_I * Math.min(1, Math.sin(el) * 2.2) : 0.1;
  /* SOL BAIXO É DOURADO. A luz do fim da tarde atravessa mais atmosfera e chega
     alaranjada; com a mesma cor do meio-dia, as 17h30 pareciam meio-dia com
     sombra comprida. A cor vai do branco quente (acima de 30°) ao âmbar (4°). */
  const kOuro = 1 - Math.max(0, Math.min(1, (el * 180 / Math.PI - 4) / 26));
  sun.color.copy(SUN_COR).lerp(SUN_OURO, kOuro * kOuro); hemi.color.copy(HEMI_COR).lerp(HEMI_OURO, kOuro * kOuro * .6);
  invalidar(2);
  if (regenEnv) { const velho = envRT; envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture; velho.dispose(); }   // o reflexo velho saía da GPU só com a página
}
$('sunH').addEventListener('input', () => setSun(false)); $('sunH').addEventListener('change', () => setSun(true)); sunM.addEventListener('change', () => setSun(true));

// ---------- capture & fullscreen
/* Baixar é baixar: um <a download> com o arquivo montado aqui. (A página do
   modelo pedia a permissão "downloads" do Artifact; dentro do app não há isso.) */
async function saveBlob(name, blob) {
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('Arquivo enviado para download.'); return true;
  } catch (e) { return false; }
}
$('shotBtn').onclick = () => { renderNow(); renderer.domElement.toBlob(async blob => { const ok = await saveBlob('teotonio-vilela-vista.png', blob); if (!ok) { $('shotImg').src = URL.createObjectURL(blob); $('shot').hidden = false; } }, 'image/png'); };
$('shotX').onclick = () => $('shot').hidden = true;
// ---------- gallery of photoreal renders
{
  const R = (Array.isArray(M.renders) ? M.renders : []).map(r => ({ ...r, f: BASE + r.f, th: r.th ? BASE + r.th : '' })); let gi = 0;
  if (R.length) { $('galBtn').hidden = false; $('galBtn').textContent = `Imagens fotorrealistas (${R.length})`; }
  const show = i => { gi = (i + R.length) % R.length; const r = R[gi]; $('galI').src = r.f; $('galI').alt = r.t; $('galT').textContent = r.t; $('galD').textContent = r.d || ''; [...$('galTh').children].forEach((b, k) => b.setAttribute('aria-current', k === gi)); };
  R.forEach((r, k) => { const b = document.createElement('button'); b.title = r.t; const im = document.createElement('img'); im.loading = 'lazy'; im.src = r.th || r.f; im.alt = r.t; b.appendChild(im); b.onclick = () => show(k); $('galTh').appendChild(b); });
  $('galBtn').onclick = () => { $('gal').hidden = false; show(gi); };
  $('galX').onclick = () => $('gal').hidden = true; $('galP').onclick = () => show(gi - 1); $('galN').onclick = () => show(gi + 1);
  $('galS').onclick = async () => { const r = R[gi]; try { const b = await (await fetch(r.f)).blob(); const ok = await saveBlob(r.f.split('/').pop(), b); if (!ok) window.open(r.f, '_blank'); } catch { window.open(r.f, '_blank'); } };
  window.addEventListener('keydown', e => { if ($('gal').hidden) return; if (e.key === 'Escape') $('gal').hidden = true; else if (e.key === 'ArrowLeft') show(gi - 1); else if (e.key === 'ArrowRight') show(gi + 1); });
}
$('fsBtn').onclick = () => { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.().catch(() => toast('Tela cheia indisponível aqui.')); };

// ---------- quantities
(function () {
  const t = $('qTable'); let g = null; const Q = M.quant || [];
  let html = '<thead><tr><th>Item</th><th style="text-align:right">Qtd.</th></tr></thead><tbody>';
  for (const r of Q) { if (r.g !== g) { g = r.g; html += `<tr><th colspan="2">${esc(g)}</th></tr>`; } html += `<tr><td>${esc(r.i)}${r.o ? `<small>${esc(r.o)}</small>` : ''}</td><td class="n">${fmt(r.q, r.u === 'un' ? 0 : 2)} ${esc(r.u)}</td></tr>`; }
  t.innerHTML = html + '</tbody>';
  const rows = () => [['Grupo', 'Item', 'Unidade', 'Quantidade', 'Observação'], ...Q.map(r => [r.g, r.i, r.u, fmt(r.q, r.u === 'un' ? 0 : 2), r.o || ''])];
  $('qCopy').onclick = async () => { const txt = rows().map(r => r.join('\t')).join('\n'); try { await navigator.clipboard.writeText(txt); toast('Tabela copiada — cole no Excel.'); } catch { toast('Copie manualmente: o navegador bloqueou a área de transferência.'); } };
  $('qCsv').onclick = async () => { const csv = '﻿' + rows().map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n'); const ok = await saveBlob('quantidades-teotonio-vilela.csv', new Blob([csv], { type: 'text/csv' })); if (!ok) toast('Downloads indisponíveis nesta visualização; use "Copiar tabela".'); };
})();

// ---------- mini-map (plan, rotated so the avenue runs left → right)
const mm = { c: $('miniC'), t: 0, sig: '', map: null };
let mmOn = true; try { mmOn = localStorage.getItem('v5.minimap') !== '0'; } catch { }
function setMM(on) { mmOn = on; document.body.classList.toggle('mm-off', !on); $('mmBtn').setAttribute('aria-pressed', on); mm.sig = ''; try { localStorage.setItem('v5.minimap', on ? '1' : '0'); } catch { } }
setMM(mmOn); $('mmX').onclick = () => setMM(false); $('mmBtn').onclick = () => setMM(!mmOn);
const ST = (x, y) => [x * Uv[0] + y * Uv[1], x * Rv[0] + y * Rv[1]];
let MMB = null; { let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity; for (const A of Object.values(ALN)) for (let i = 0; i < A.n; i++) { const [s, t] = ST(A.xy[2 * i], A.xy[2 * i + 1]); s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); } if (fin(s0)) MMB = [s0 - 15, s1 + 15, t0 - 15, t1 + 15]; }
function mmDraw() {
  const c = mm.c, r = c.getBoundingClientRect(); if (!r.width || !MMB) return; const k = Math.min(devicePixelRatio, 2);
  if (c.width !== Math.round(r.width * k) || c.height !== Math.round(r.height * k)) { c.width = Math.round(r.width * k); c.height = Math.round(r.height * k); }
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); const W = r.width, H = r.height; g.clearRect(0, 0, W, H);
  const [s0, s1, t0, t1] = MMB, pad = 8, top = 16; const sc = Math.min((W - 2 * pad) / (s1 - s0), (H - pad - top) / (t1 - t0)); const ox = W / 2 - sc * (s0 + s1) / 2, oy = top + (H - pad - top) / 2 - sc * (t0 + t1) / 2; mm.map = { sc, ox, oy };
  const P = (x, y) => { const [s, t] = ST(x, y); return [ox + sc * s, oy + sc * t]; };
  const accent = css('--accent'), ink = css('--ink'), muted = css('--muted'), line_ = css('--line'), warn = css('--warn');
  for (const t of TILES) { const b = t.bbox; if (!b) continue; const q = [P(b[0], b[1]), P(b[2], b[1]), P(b[2], b[3]), P(b[0], b[3])]; g.beginPath(); q.forEach((v, i) => i ? g.lineTo(...v) : g.moveTo(...v)); g.closePath();
    if (t.st === 'ok') { g.fillStyle = accent; g.globalAlpha = .13; g.fill(); g.globalAlpha = 1; }
    g.setLineDash(t.st === 'ok' ? [] : [3, 3]); g.strokeStyle = t.st === 'fail' ? warn : t.st === 'load' ? accent : line_; g.lineWidth = t.st === 'load' ? 1.5 : 1; g.stroke(); g.setLineDash([]); }
  for (const [key, A] of Object.entries(ALN)) { g.beginPath(); for (let i = 0; i < A.n; i += 2) { const v = P(A.xy[2 * i], A.xy[2 * i + 1]); i ? g.lineTo(...v) : g.moveTo(...v); } g.strokeStyle = key === 'PD' ? accent : key === 'PE' ? ink : muted; g.lineWidth = key === 'PD' || key === 'PE' ? 1.6 : 1; g.stroke(); }
  g.font = '600 9.5px "JetBrains Mono", monospace'; g.fillStyle = muted; g.textAlign = 'left';
  for (const key of ['PD', 'PE']) { const A = ALN[key]; if (!A) continue; const v = P(A.xy[0], A.xy[1]); g.fillText(key, v[0] + 3, v[1] + (key === 'PD' ? 10 : -4)); }
  // north arrow
  { const [ns, nt] = ST(0, 1); const cx = 62, cy = 9; g.save(); g.translate(cx, cy + 2); g.strokeStyle = muted; g.fillStyle = muted; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-ns * 6, -nt * 6); g.lineTo(ns * 6, nt * 6); g.stroke(); g.beginPath(); g.arc(ns * 6, nt * 6, 1.8, 0, 7); g.fill(); g.textAlign = 'center'; g.fillText('N', ns * 6 + ns * 7 + (ns < 0 ? -2 : 2), nt * 6 + nt * 7 + 3); g.restore(); }
  // camera
  const cam = P(camera.position.x, -camera.position.z), tg = P(controls.target.x, -controls.target.z); const cl = v => [Math.max(3, Math.min(W - 3, v[0])), Math.max(3, Math.min(H - 3, v[1]))]; const cp = cl(cam), tp = cl(tg);
  const dx = tg[0] - cam[0], dy = tg[1] - cam[1], L = Math.hypot(dx, dy);
  if (L > 2) { const a = Math.atan2(dy, dx), h = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect); g.beginPath(); g.moveTo(...cp); g.arc(cp[0], cp[1], 22, a - h, a + h); g.closePath(); g.fillStyle = accent; g.globalAlpha = .28; g.fill(); g.globalAlpha = 1; }
  g.strokeStyle = ink; g.lineWidth = 1; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(...cp); g.lineTo(...tp); g.stroke(); g.setLineDash([]);
  g.fillStyle = ink; g.beginPath(); g.arc(cp[0], cp[1], 3.2, 0, 7); g.fill(); g.strokeStyle = accent; g.lineWidth = 1.5; g.beginPath(); g.arc(tp[0], tp[1], 3, 0, 7); g.stroke();
}
function mmMaybe(now) {
  if (!mmOn || now - mm.t < 100) return; mm.t = now; const q = v => Math.round(v * 2);
  const sig = [q(camera.position.x), q(camera.position.y), q(camera.position.z), q(controls.target.x), q(controls.target.z), tileVer, innerWidth, document.documentElement.dataset.theme || ''].join('|');
  if (sig !== mm.sig) { mm.sig = sig; mmDraw(); }
}
mm.c.addEventListener('click', e => {
  const mp = mm.map; if (!mp) return; const r = mm.c.getBoundingClientRect(); const s = (e.clientX - r.left - mp.ox) / mp.sc, t = (e.clientY - r.top - mp.oy) / mp.sc;
  const x = s * Uv[0] + t * Rv[0], y = s * Uv[1] + t * Rv[1]; const q1 = V(x, y, groundZ(x, y)); const off = camera.position.clone().sub(controls.target); if (off.length() > 140) off.setLength(110); if (off.y < 8) off.y = 8;
  if (drive.on) stopDrive(); pressView(null); flyTo(q1.clone().add(off), q1);
});

// nomes de material (usados pelos renders do pipeline e úteis no console)
for (const [k, m] of Object.entries(MAT)) if (!m.name) m.name = k; for (const [k, m] of Object.entries(PAINT)) m.name = 'pintura_' + k;

// ================= PONTE COM O APP: serviços lançados (RDO) por estaca =================
/* Quem sabe o que foi lançado é o app (index.html, tela "Modelo 3D"): ele lê o
   RDO_Avanco, aplica os filtros da tela e manda para cá, por postMessage, os
   trechos de eixo já no vocabulário do modelo —
     { tipo:'execucao', faixas:[{ chave:'BC:212', eixo:'PD', m0, m1, cor,
       titulo, resumo, rows:[[k,v]…], acoes:[[rótulo, ação, primário]…] }],
       rotulos:{ PD:'…', PE:'…' }, resumo }
   — e o visor só desenha: deita uma faixa colorida sobre a pista entre m0 e m1
   e, quando alguém a toca, devolve a chave ({tipo:'estaca', chave}). Regra de
   RDO não mora aqui: a estaca do 3D é a mesma conta da Avanço Físico, feita uma
   vez só, no app (lerLocalEstaca). Mensagem de outra origem é ignorada. */
const RDO = { dados: null, mesh: null, selMesh: null, sel: null, aberta: null, infos: [], porChave: new Map(), timer: 0, rot: {}, pinos: null };
function avisarApp(msg) { if (!PAI) return; try { PAI.postMessage(Object.assign({ m3d: 1 }, msg), location.origin); } catch (e) { } }
/* A faixa cobre a PISTA daquele eixo, e a pista se acha no próprio modelo: o LB
   da PD e o da PE correm no MEIO de cada pista (asfalto de -4,5 a +4,5 m, com a
   faixa de ônibus de um lado ou do outro), com o canteiro e a ciclovia entre as
   duas. Então, a partir do eixo, anda para cada lado enquanto houver asfalto,
   pavimento rígido ou sarjeta, até 6 m — no cruzamento o asfalto não acaba, e
   pintar a Hermógenes inteira como "serviço na E231" seria mentir. */
const PAV = new Set(['asfalto', 'rigido']), BORDA = new Set(['sarjeta', 'tampa', 'grelha']);
const _larg = new Map();
function faixaDaPista(A, s) {   // -> [t0, t1], afastamentos (m) da pista nesta estaca
  const k = A.key + '|' + Math.round(s / 4); if (_larg.has(k)) return _larg.get(k);
  const p = A.pos(s), d = A.dir(s), r = [d[1], -d[0]];
  const tipo = t => { const h = sampleTop(p[0] + r[0] * t, p[1] + r[1] * t, TOP); return h ? h.o.userData.stype : null; };
  let c = null; for (const t of [0, .5, -.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, 3, -3]) if (PAV.has(tipo(t))) { c = t; break; }
  if (c == null) return [-4.5, 4.5];   // trecho ainda não carregado: a pista típica, sem guardar
  const ate = sg => { let ult = c, falha = 0; for (let t = c + sg * .5; Math.abs(t) <= 6; t += sg * .5) { const q = tipo(t); if (PAV.has(q) || BORDA.has(q)) { ult = t; falha = 0; } else if (++falha > 1) break; } return ult + sg * .25; };
  const v = [ate(-1), ate(1)]; _larg.set(k, v); return v;
}
const MRDO = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, toneMapped: false, fog: false });
const MSEL = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10, toneMapped: false, fog: false });
const LSEL = new THREE.LineBasicMaterial({ color: 0xff7a1a, depthTest: false, toneMapped: false });
function agendarRDO(ms = 300) { if (!RDO.dados) return; clearTimeout(RDO.timer); RDO.timer = setTimeout(montarRDO, ms); }
/* A GEOMETRIA DE CADA FAIXA FICA GUARDADA. A linha do tempo do app manda as
   faixas a cada quadro (450 ms), e cada faixa custa ~70 consultas à
   superfície do modelo (sampleTop) — refazer todas a cada quadro era o que
   travava o celular. A faixa de uma estaca não muda com a data, só com o
   modelo: o cache é esvaziado quando um trecho novo chega (loadTiles). */
/* A SEÇÃO DA FAIXA: miolo translúcido e uma borda cheia de 35 cm de cada lado
   da pista. Chapada a 62%, a faixa escondia o asfalto e a sinalização — o
   projeto sumia debaixo da cor. Assim a cor da estaca se lê pela borda e o
   pavimento aparece por baixo, como numa camada de mapa. As colunas 1–2 e 5–6
   ficam no mesmo lugar: é a costura entre o alfa da borda e o do miolo. */
const _geoFx = new Map(), FX_NC = 8, FX_QUADS = [0, 2, 3, 4, 6], FX_BORDA = .35, FX_A_BORDA = .95, FX_A_MIOLO = .4;
const fxAlfa = j => (j <= 1 || j >= 6) ? FX_A_BORDA : FX_A_MIOLO;
function geoFaixa(A, a, b) {
  const k = A.key + '|' + a.toFixed(2) + '|' + b.toFixed(2); let G = _geoFx.get(k); if (G) return G;
  const ns = Math.max(2, Math.ceil((b - a) / 2) + 1), pos = new Float32Array(ns * FX_NC * 3), borda = [[], []];
  let q = 0;
  for (let i = 0; i < ns; i++) {
    const s = a + (b - a) * i / (ns - 1), [t0, t1] = faixaDaPista(A, s), p = A.pos(s), d = A.dir(s), r = [d[1], -d[0]];
    const e = Math.min(FX_BORDA, (t1 - t0) / 4), L = t1 - t0;
    const cols = [t0, t0 + e, t0 + e, t0 + L / 3, t0 + 2 * L / 3, t1 - e, t1 - e, t1];
    let ult = null;
    for (let j = 0; j < FX_NC; j++) {
      const t = cols[j];
      let w = ult;
      if (!(j === 2 || j === 6)) {   // a costura repete o ponto da coluna anterior
        const x = p[0] + r[0] * t, y = p[1] + r[1] * t;
        const h = sampleTop(x, y, TOP); let z = h ? h.z : A.z(s); if (!fin(z)) z = groundZ(x, y);
        w = V(x, y, z + .06);
      }
      ult = w; pos[q++] = w.x; pos[q++] = w.y; pos[q++] = w.z;
      if (j === 0) borda[0].push(w.clone().setY(w.y + .06)); if (j === FX_NC - 1) borda[1].push(w.clone().setY(w.y + .06));
    }
  }
  // o pino da foto: no meio da faixa, 3,4 m acima da pista — o rótulo da estaca do projeto ("PD 212+00")
  // fica no eixo a 1,95 m, e com o pino a 2 m os dois se sobrepunham (no Alta, uma barra escura no ícone)
  const im = (ns >> 1) * FX_NC + 3, im2 = im + 1;
  const pino = new THREE.Vector3((pos[3 * im] + pos[3 * im2]) / 2, (pos[3 * im + 1] + pos[3 * im2 + 1]) / 2 + 3.4, (pos[3 * im + 2] + pos[3 * im2 + 2]) / 2);
  G = { pos, ns, borda: [...borda[0], ...borda[1].reverse()], pino };
  _geoFx.set(k, G); return G;
}
/* O pino de câmera: um ponto com sprite (um só desenho para todos) com TAMANHO
   DE VERDADE — 1,8 m de ícone: de perto ele cresce (até 46 px), de longe
   encolhe e, abaixo de 8 px, some. Em tamanho fixo, na vista geral os pinos
   de 60 estacas viravam uma corrente de círculos por cima das faixas. O toque
   nele é achado na TELA (pinNoPonto), com o mesmo tamanho: ponto não tem área
   para o raio acertar. */
const PIN_M = 1.8, PIN_MIN = 8, PIN_MAX = 46, _tanFov = () => Math.tan(camera.fov * Math.PI / 360);
const pinPx = dist => Math.min(PIN_MAX, PIN_M * renderer.domElement.clientHeight / (2 * dist * _tanFov()));   // px de CSS
const MPIN = new THREE.PointsMaterial({ size: 1, sizeAttenuation: true, transparent: true, alphaTest: .35, depthWrite: false, toneMapped: false, fog: false,
  map: canvasTex(64, g => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = '#1d4f91'; g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 27, 0, 2 * Math.PI); g.fill(); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(15, 23, 34, 22, 4); g.fill(); g.fillRect(25, 19, 14, 6);
    g.fillStyle = '#1d4f91'; g.beginPath(); g.arc(32, 34, 7, 0, 2 * Math.PI); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 34, 3.5, 0, 2 * Math.PI); g.fill();
  }, { repeat: false }) });
// three: gl_PointSize = size·pr · (altura CSS / 2) / distância → em px de CSS, size·altura/(2·dist); o tamanho de verdade é PIN_M/tan(fov/2)
{ const pr = renderer.getPixelRatio(); MPIN.size = PIN_M / _tanFov();
  MPIN.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <logdepthbuf_vertex>',
    `gl_PointSize = gl_PointSize < ${(PIN_MIN * pr).toFixed(1)} ? 0.0 : min(gl_PointSize, ${(PIN_MAX * pr).toFixed(1)});\n#include <logdepthbuf_vertex>`); };
  MPIN.customProgramCacheKey = () => 'pinoRDO'; }
function pinNoPonto(cx, cy, hit) {   // -> índice em RDO.infos do pino sob o toque, ou null
  const P = RDO.pinos; if (!P || !P.pts.length || !isVis(P.obj)) return null;
  const R = renderer.domElement.getBoundingClientRect(); camera.updateMatrixWorld();
  let best = null, bd = Infinity, bz = 0; const q = new THREE.Vector3();
  P.pts.forEach((p, k) => { q.copy(p).project(camera); if (q.z < -1 || q.z > 1) return;
    const dist = p.distanceTo(camera.position), px = pinPx(dist); if (px < PIN_MIN) return;   // longe demais: o pino nem aparece
    const d = Math.hypot(R.left + (q.x + 1) / 2 * R.width - cx, R.top + (1 - q.y) / 2 * R.height - cy); if (d < Math.max(14, px / 2 + 4) && d < bd) { bd = d; best = k; bz = dist; } });
  if (best == null) return null;
  // atrás de um prédio o pino não aparece (depthTest): também não pega o toque
  if (hit && hit.object !== RDO.mesh && hit.distance < bz - 1.5) return null;
  return P.ii[best];
}
function montarRDO() {
  RDO.timer = 0;
  if (RDO.mesh) { GRP.rdo.remove(RDO.mesh); RDO.mesh.geometry.dispose(); const i = pickables.indexOf(RDO.mesh); if (i >= 0) pickables.splice(i, 1); RDO.mesh = null; }
  if (RDO.pinos) { GRP.fot.remove(RDO.pinos.obj); RDO.pinos.obj.geometry.dispose(); RDO.pinos = null; }
  RDO.infos = []; RDO.porChave.clear();
  const fx = [], c = new THREE.Color(), pinos = { pts: [], ii: [] };
  let nv = 0, ni = 0;
  for (const f of (RDO.dados && RDO.dados.faixas) || []) {
    const A = ALN[f.eixo]; if (!A || !fin(+f.m0) || !fin(+f.m1)) continue;
    // um respiro de 0,3 m entre estacas vizinhas: duas da mesma cor ainda se leem como duas
    const a = Math.max(A.m0, +f.m0 + .3), b = Math.min(A.m1, +f.m1 - .3); if (!(b - a > .5)) continue;
    const ii = RDO.infos.length, G = geoFaixa(A, a, b);
    RDO.infos.push({ disc: f.disc || 'Serviços lançados (RDO)', t: f.titulo || f.chave, resumo: f.resumo || '', linha: f.linha ? String(f.linha) : '', rows: Array.isArray(f.rows) ? f.rows : [], src: f.src || '', acoes: Array.isArray(f.acoes) ? f.acoes : [], cor: f.cor, chave: String(f.chave), fotos: +f.fotos || 0 });
    fx.push({ f, G, ii, A, a, b });
    nv += G.ns * FX_NC; ni += (G.ns - 1) * FX_QUADS.length * 6;
    if (+f.fotos > 0) { pinos.pts.push(G.pino); pinos.ii.push(ii); }
  }
  if (ni) {
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 4), idx = new Uint32Array(ni), faceB = new Int32Array(ni / 3);
    let v0 = 0, k = 0;
    for (const { f, G, ii, A, a, b } of fx) {
      c.set(f.cor || '#e0662a');
      pos.set(G.pos, v0 * 3);
      for (let v = 0; v < G.ns * FX_NC; v++) { const o = 4 * (v0 + v); col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; col[o + 3] = fxAlfa(v % FX_NC); }
      const i0 = k;
      for (let i = 0; i < G.ns - 1; i++) for (const j of FX_QUADS) { const q = v0 + i * FX_NC + j; faceB[k / 3] = ii; faceB[k / 3 + 1] = ii; idx[k++] = q; idx[k++] = q + FX_NC; idx[k++] = q + 1; idx[k++] = q + 1; idx[k++] = q + FX_NC; idx[k++] = q + FX_NC + 1; }
      RDO.porChave.set(String(f.chave), { A, a, b, ii, i0, i1: k, borda: G.borda });
      v0 += G.ns * FX_NC;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MRDO); m.renderOrder = 5; m.userData.noAO = true; m.userData.faceB = faceB; m.userData.stype = 'rdo';
    RDO.mesh = m; addInst('rdo', m, RDO.infos, false);
  }
  if (pinos.pts.length) {
    const g = new THREE.BufferGeometry().setFromPoints(pinos.pts); g.computeBoundingSphere();
    const o = new THREE.Points(g, MPIN); o.renderOrder = 8; o.userData.noAO = true; o.raycast = () => { };
    GRP.fot.add(o); RDO.pinos = { obj: o, pts: pinos.pts, ii: pinos.ii };
  }
  if (clipOn) applyClip(true);
  marcarSel();
  /* A estaca aberta acompanha os dados novos: na linha do tempo, o painel
     dizia "Último 12/03" com a linha em 25/02. Sem a estaca nesta data, o
     painel some — e volta quando ela ganha serviço de novo. */
  if (RDO.aberta) { const e = RDO.porChave.get(RDO.aberta); if (e) preencherInfo(RDO.infos[e.ii]); else info.hidden = true; }
  invalidar(3);
}
function marcarSel() {
  if (RDO.selMesh) { GRP.rdo.remove(RDO.selMesh); RDO.selMesh.traverse(o => { if (o.geometry && o.geometry !== (RDO.mesh && RDO.mesh.geometry)) o.geometry.dispose(); }); RDO.selMesh = null; }
  const e = RDO.sel && RDO.porChave.get(RDO.sel);
  if (e && RDO.mesh) {
    const grp = new THREE.Group(), g = new THREE.BufferGeometry();
    g.setAttribute('position', RDO.mesh.geometry.attributes.position); g.setIndex(Array.from(RDO.mesh.geometry.index.array.subarray(e.i0, e.i1)));
    const m = new THREE.Mesh(g, MSEL); m.renderOrder = 6; m.userData.noAO = true; m.raycast = () => { };
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(e.borda), LSEL); l.renderOrder = 7;
    grp.add(m, l); RDO.selMesh = grp; GRP.rdo.add(grp);
  }
  invalidar();
}
/* A câmera de uma estaca do RDO olha do CANTEIRO para a pista: a PE corre à
   esquerda da PD e a PD à direita da PE. O "Ir para estaca" das ferramentas
   olha do lado de fora, e ali a câmera caía dentro das casas do entorno. */
function voarParaFaixa(e) {
  const A = e.A, s = (e.a + e.b) / 2, p = A.pos(s), d = A.dir(s), r = [d[1], -d[0]], [t0, t1] = faixaDaPista(A, s), tc = (t0 + t1) / 2;
  const lado = A.key === 'PE' ? 1 : -1;
  let z = A.z(s); if (!fin(z)) z = groundZ(p[0], p[1]);
  const alvo = V(p[0] + r[0] * tc, p[1] + r[1] * tc, z);
  const cam = V(p[0] + r[0] * (tc + lado * 16) - d[0] * 22, p[1] + r[1] * (tc + lado * 16) - d[1] * 22, z + 18);
  pressView(null); flyTo(cam, alvo);
}
function irPara(d) {   // {chave} de uma estaca com serviço, ou {eixo, m} de qualquer ponto do eixo
  const e = d.chave != null && RDO.porChave.get(String(d.chave));
  if (e) {
    if (!GRP.rdo.visible) { GRP.rdo.visible = true; $('L_rdo').checked = true; }
    voarParaFaixa(e); RDO.sel = String(d.chave); marcarSel(); showInfo(RDO.infos[e.ii]);
  } else if (d.eixo && ALN[d.eixo] && fin(+d.m)) {
    const A = ALN[d.eixo]; goStation(d.eixo, Math.max(A.m0, Math.min(A.m1, +d.m)));
    if (d.chave != null) { RDO.sel = null; marcarSel(); }
  }
  invalidar();
}
/* As miniaturas da estaca aberta, que o app baixou (a Galeria dele, com o
   login dele). Chegam como imagem pronta (data:image/…); qualquer outra coisa
   vira quadro vazio. O toque devolve só o ÍNDICE: quem sabe qual foto é, e
   abre a foto inteira, é o app. */
const FOTO_OK = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
function mostrarMiniaturas(d) {
  const chave = String(d.chave || ''); if (!chave || chave !== RDO.sel) return;
  const fb = $('infoFotos'); fb.innerHTML = ''; fb.dataset.chave = chave;
  if (d.aviso) { const s = document.createElement('span'); s.className = 'aviso'; s.textContent = String(d.aviso); fb.appendChild(s); }
  (Array.isArray(d.itens) ? d.itens.slice(0, 8) : []).forEach((it, i) => {
    const b = document.createElement('button'); b.type = 'button'; const leg = String((it && it.legenda) || '');
    b.title = leg; b.setAttribute('aria-label', 'Ampliar a foto' + (leg ? ': ' + leg : ''));
    const src = String((it && it.src) || '');
    if (FOTO_OK.test(src)) { const img = document.createElement('img'); img.alt = ''; img.src = src; b.appendChild(img); } else b.classList.add('vazio');
    b.onclick = () => avisarApp({ tipo: 'foto', chave, i });
    fb.appendChild(b);
  });
  fb.hidden = !fb.children.length; invalidar();
}
// filtro de frente no app → o que o 3D precisa para mostrar aquela disciplina
let opacAntes = null;
function realce(camada) {
  if (camada === 'dre') { if (opacAntes == null) opacAntes = +$('opac').value / 100; setOpacity(.3); GRP.dre.visible = true; $('L_dre').checked = true; invalidarSombra(); }
  else if (opacAntes != null) { setOpacity(opacAntes); opacAntes = null; }
  invalidar();
}
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || e.data.m3d !== 1) return;
  if (e.source !== (PAI || window)) return;   // só o app que abriu o visor (ou o próprio visor, aberto sozinho)
  const d = e.data;
  if (d.tipo === 'execucao') {
    RDO.dados = d; RDO.rot = d.rotulos && typeof d.rotulos === 'object' ? d.rotulos : {};
    $('sub').textContent = d.resumo ? String(d.resumo) : (M.subtitle || '');
    for (const o of $('gPista').options) if (RDO.rot[o.value]) o.textContent = `${o.value} – ${RDO.rot[o.value]}`;
    // a data da linha do tempo (ou do dia de RDO), no alto do 3D
    const cb = d.carimbo && typeof d.carimbo === 'object' ? d.carimbo : null;
    $('carimbo').hidden = !cb; $('carimboT').textContent = cb ? String(cb.t || '') : ''; $('carimboS').textContent = cb ? String(cb.s || '') : '';
    // já, e não num setTimeout: o 'ir' que o app manda logo depois tem de achar as faixas NOVAS
    clearTimeout(RDO.timer); montarRDO();
  } else if (d.tipo === 'miniaturas') mostrarMiniaturas(d);
  else if (d.tipo === 'ir') irPara(d);
  else if (d.tipo === 'soltar') { RDO.sel = null; RDO.aberta = null; marcarSel(); info.hidden = true; }   // o app fechou a estaca
  else if (d.tipo === 'realce') realce(d.camada || null);
  else if (d.tipo === 'apresentar') apresentar({ gravar: !!d.gravar });
  else if (d.tipo === 'parar-apresentacao') pararApresentacao(false);
  else if (d.tipo === 'tema') { if (d.tema === 'dark' || d.tema === 'light') document.documentElement.setAttribute('data-theme', d.tema); else document.documentElement.removeAttribute('data-theme'); mm.sig = ''; invalidar(); }
});
// o app troca o tema no MESMO aparelho: o localStorage avisa este documento também
window.addEventListener('storage', e => { if (e.key !== 'teotonio_tema_v1') return; const t = e.newValue; if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); mm.sig = ''; invalidar(); });
window.__rdo = { montar: montarRDO, ir: irPara, get n() { return RDO.infos.length; }, get sel() { return RDO.sel; }, get voando() { return !!tween; }, larg: (P, s) => faixaDaPista(ALN[P], s),
  get pinos() { return RDO.pinos ? RDO.pinos.ii.map(i => RDO.infos[i].chave) : []; }, get cacheFaixas() { return _geoFx.size; }, get aberta() { return RDO.aberta; },
  // diagnóstico: o tamanho (px) do pino de uma estaca na câmera atual, e as chamadas de desenho de um quadro sem refazer a sombra
  pinoPx: chave => { const P = RDO.pinos; if (!P) return null; const k = P.ii.findIndex(i => RDO.infos[i].chave === String(chave)); return k < 0 ? null : +pinPx(P.pts[k].distanceTo(camera.position)).toFixed(1); },
  quadro: () => { renderer.shadowMap.needsUpdate = false; renderNow(); const r = renderer.info.render; return { chamadas: r.calls, triangulos: r.triangles }; },
  // teste/diagnóstico: onde, na tela, cai o pino de foto de uma estaca (px do canvas)
  pino: chave => { const P = RDO.pinos; if (!P) return null; const k = P.ii.findIndex(i => RDO.infos[i].chave === String(chave)); if (k < 0) return null;
    camera.updateMatrixWorld(); const q = P.pts[k].clone().project(camera); const R = renderer.domElement.getBoundingClientRect();
    return [R.left + (q.x + 1) / 2 * R.width, R.top + (1 - q.y) / 2 * R.height]; },
  // teste/diagnóstico: onde, na tela, cai o meio da faixa de uma estaca (px do canvas)
  ponto: chave => { const e = RDO.porChave.get(String(chave)); if (!e) return null; const s = (e.a + e.b) / 2 + (e.b - e.a) * .2, [t0, t1] = faixaDaPista(e.A, s);
    const p = e.A.pos(s), d = e.A.dir(s), r = [d[1], -d[0]], t = (t0 + t1) / 2, x = p[0] + r[0] * t, y = p[1] + r[1] * t, h = sampleTop(x, y, TOP);
    camera.updateMatrixWorld(); const q = V(x, y, (h ? h.z : e.A.z(s)) + .06).project(camera); const R = renderer.domElement.getBoundingClientRect();
    return [R.left + (q.x + 1) / 2 * R.width, R.top + (1 - q.y) / 2 * R.height]; },
  // diagnóstico: as superfícies de cima ao longo da normal do eixo, em trechos ("asfalto -1,5..6,0")
  perfil: (P, s, t0 = -25, t1 = 25) => { const A = ALN[P], p = A.pos(s), d = A.dir(s), r = [d[1], -d[0]], out = []; let cur = null;
    for (let t = t0; t <= t1; t += .5) { const h = sampleTop(p[0] + r[0] * t, p[1] + r[1] * t, TOP); const k = h ? h.o.userData.stype || '?' : '-'; if (!cur || cur[0] !== k) out.push(cur = [k, t, t]); else cur[2] = t; }
    return out.map(([k, a, b]) => `${k} ${a}..${b}`).join(' | '); } };

// ---------- progressive tile loading (nearest to the camera target first)
const TILES = (M.tiles || []).map(t => ({ ...t, st: 'pend' })); let tileVer = 0;
const prog = $('prog'), progT = $('progT'), progB = $('progB');
function updProg() {
  tileVer++; const N = TILES.length; if (!N) { prog.hidden = true; return; }
  const ok = TILES.filter(t => t.st === 'ok').length, fail = TILES.filter(t => t.st === 'fail').length, done = ok + fail; progB.style.width = (100 * done / N) + '%';
  if (done < N) { prog.hidden = false; prog.classList.remove('warn'); progT.textContent = `Carregando trechos ${Math.min(N, done + 1)}/${N}`; return; }
  if (fail) { prog.hidden = false; prog.classList.add('warn'); progT.textContent = `${ok} de ${N} trechos carregados · ${fail} com falha`; prog.title = 'Falharam: ' + TILES.filter(t => t.st === 'fail').map(t => t.id).join(', '); }
  else { progT.textContent = `${N}/${N} trechos carregados`; setTimeout(() => prog.hidden = true, 2500); }
}
function tileDist(t, f) { const b = t.bbox; if (!b) return 1e9; const dx = Math.max(b[0] - f[0], 0, f[0] - b[2]), dy = Math.max(b[1] - f[1], 0, f[1] - b[3]); return Math.hypot(dx, dy) + 1e-3 * Math.hypot((b[0] + b[2]) / 2 - f[0], (b[1] + b[3]) / 2 - f[1]); }
let firstDone = false;
function firstTileDone() {
  if (firstDone) return; firstDone = true; const l = $('loading'); if (l) l.remove(); window.__ready = true;
}
async function loadTiles() {
  updProg();
  for (;;) {
    const pend = TILES.filter(t => t.st === 'pend'); if (!pend.length) break;
    const f = focusHint && performance.now() - focusHint.t < 30000 ? focusHint.p : [controls.target.x, -controls.target.z];
    pend.sort((a, b) => tileDist(a, f) - tileDist(b, f)); const t = pend[0]; t.st = 'load'; updProg();
    try {
      const T = await lerArquivo(t.file); await buildTile(T, t); t.st = 'ok'; invalidar(3); invalidarSombra(); _geoFx.clear(); agendarRDO();
    } catch (e) {
      t.st = 'fail'; console.warn(`Trecho ${t.id} não carregado:`, e && e.message ? e.message : e);
      toast(`Não foi possível carregar o trecho ${t.id}${t.s ? ` (s ${fmt(t.s[0], 0)} a ${fmt(t.s[1], 0)} m)` : ''}. Os demais continuam carregando.`, 5000);
    }
    updProg(); firstTileDone(); if (dockMode === 'sec') drawSection(); await tick();
  }
  firstTileDone(); window.__allTiles = true;
}

// compass
const needle = $('needle');
// ---------- post-processing (Alta)
let composer = null, gtao = null;
if (Q_ALTA) {
  const pr = renderer.getPixelRatio(), w = stage.clientWidth, h = stage.clientHeight;
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(pr); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  try {
    gtao = new GTAOPass(scene, camera, w * pr, h * pr);
    gtao.overrideVisibility = function () { const cache = this._visibilityCache; this.scene.traverse(o => { cache.set(o, o.visible); if (o.isPoints || o.isLine || o.userData.noAO) o.visible = false; }); };
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.6, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = .9; composer.addPass(gtao);
  } catch (e) { console.warn('Oclusão de ambiente indisponível:', e && e.message); gtao = null; }
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - .5; c.rgb *= 1.0 - dot(d, d) * .42; c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), .18); gl_FragColor = c; }' }));
}
const renderNow = () => { if (composer) composer.render(); else renderer.render(scene, camera); };
// resize / loop
window.addEventListener('resize', () => { camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(stage.clientWidth, stage.clientHeight); if (composer) composer.setSize(stage.clientWidth, stage.clientHeight); invalidar(); });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const _d = new THREE.Vector3();
/* ---------- DESENHA SÓ QUANDO ALGO MUDA
   A página do modelo pintava a cena 60 vezes por segundo mesmo parada. No
   celular do canteiro isso é bateria, calor e o 4G do app disputando a CPU.
   Agora o quadro só sai quando há motivo: a câmera andou (o OrbitControls
   avisa 'change' em toda mudança, inclusive as feitas por fora dele — o
   update() roda todo quadro e compara), um trecho ou textura chegou, um
   toque ou tecla mexeu em camada/medição/seção, ou durante a carga (um
   quadro a cada 250 ms, que cobre o que chega sem avisar). A água só ondula
   no modo Alta e com o córrego dentro do quadro. */
controls.addEventListener('change', () => invalidar());
THREE.DefaultLoadingManager.onProgress = () => invalidar();
THREE.DefaultLoadingManager.onLoad = () => { invalidar(3); invalidarSombra(); };   // textura de folha (alphaTest) muda a sombra
for (const ev of ['pointerdown', 'pointerup', 'keydown', 'wheel', 'input', 'change', 'click'])
  document.addEventListener(ev, () => invalidar(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidar(3); });
const _fr = new THREE.Frustum(), _pv = new THREE.Matrix4(); let aguaVista = false, aguaChecada = 0;
function aguaNoQuadro(now) {
  if (!Q_ALTA || !AGUAS.length) return false;
  if (now - aguaChecada > 300) { aguaChecada = now; _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pv);
    aguaVista = AGUAS.some(m => isVis(m) && _fr.intersectsObject(m) && m.geometry.boundingSphere && m.geometry.boundingSphere.center.distanceTo(camera.position) < 700); }
  return aguaVista;
}
/* ---------- CINEMA: "Apresentar a obra" e o gravador do vídeo do modelo
   O módulo (cine.js) só é baixado quando alguém pede. Ao vivo, o relógio é o
   do laço de desenho; no gravador (?cine=1) o laço fica parado (__pause) e
   cada quadro é pedido por tempo: o mesmo roteiro dá o mesmo vídeo. */
const CTX_CINE = { THREE, camera, controls, GRP, ALN, V, scene, renderer, invalidar, invalidarSombra,
  superficie: (x, y) => { const h = sampleTop(x, y, visTops()); if (h) return h.z; const z = ngZ(x, y); return fin(z) ? z : NaN; },
  opacidade: v => setOpacity(v),
  nevoa: d => { if (scene.fog && scene.fog.isFogExp2) scene.fog.density = d == null ? NEVOA0 : d; },
  exposicao: v => { renderer.toneMappingExposure = v == null ? EXPO0 : v; },
  sol: (h, regen, mes) => setSun(regen, h, mes),
  sombra: cfg => sombraConfig(cfg),
  material: nome => MAT[nome] || null,
  fatia: cfg => fatiaConfig(cfg),
  nevoaCor: c => { if (scene.fog) scene.fog.color.set(c == null ? NEVOA_COR0 : c); },
  agua: t => { if (Q_ALTA && SOLID.agua.normalMap) SOLID.agua.normalMap.offset.set((t * 1.2e-2) % 1, (t * .8e-2) % 1); } };   // a ondulação pelo tempo do roteiro
let cineMod = null;
async function cineCarregar() {
  if (!cineMod) { const { criarCine } = await import(new URL('./cine.js' + new URL(import.meta.url).search, import.meta.url).href); cineMod = criarCine(CTX_CINE); }
  return cineMod;
}
const APRES = { on: false, t0: 0, dur: 0, planos: [], leg: -1, grav: null, antes: null };
const cineUI = $('cineUI');
/* O roteiro da apresentação sai do PRÓPRIO modelo (vistas e trechos do
   index.json): abertura do alto, cada trecho com o nome e as estacas, o
   motorista chegando ao cruzamento e, no fim, o que o RDO já lançou. Obra
   nova com modelo ganha a apresentação dela sem ninguém escrever roteiro. */
function roteiroApresentacao() {
  const P = [], tr = TRECHOS.map(t => ({ nome: t.nome, desc: t.desc || '', pos: t.pos, tgt: t.tgt }));
  const vv = k => VIEWS[k] ? { pos: [VIEWS[k].pos.x, -VIEWS[k].pos.z, VIEWS[k].pos.y], tgt: [VIEWS[k].tgt.x, -VIEWS[k].tgt.z, VIEWS[k].tgt.y] } : null;
  const geral = vv('geral') || vv(Object.keys(VIEWS)[0]);
  const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const recua = (t, k, sobe) => { const d = t.pos.map((v, i) => v - t.tgt[i]); return [t.pos[0] + d[0] * k, t.pos[1] + d[1] * k, t.pos[2] + d[2] * k + (sobe || 0)]; };
  const lateral = (t, k) => { const dx = t.tgt[0] - t.pos[0], dy = t.tgt[1] - t.pos[1], L = Math.hypot(dx, dy) || 1; return [dy / L * k, -dx / L * k, 0]; };
  const titulo = M.title || 'Modelo 3D', sub = M.subtitle || '';
  if (!tr.length) {   // modelo sem trechos: as vistas, uma depois da outra
    const ks = Object.keys(VIEWS).filter(k => k !== 'planta');
    ks.forEach((k, i) => { const v = vv(k); P.push({ id: k, dur: 6, cam: { pos: [recua({ pos: v.pos, tgt: v.tgt }, .15, 4), v.pos], alvo: [v.tgt, v.tgt] }, ease: [.45, .45], legenda: { t: i ? VIEWS[k].nome : titulo, s: i ? '' : sub }, corte: i > 0 }); });
    return { planos: P };
  }
  // abertura: do alto, descendo até o primeiro trecho
  const t0 = tr[0], ini = recua(t0, .2, 6);
  if (geral) P.push({ id: 'abertura', dur: 8, cam: { pos: [geral.pos, lerp3(geral.pos, ini, .55).map((v, i) => i === 2 ? v + 40 : v), ini], alvo: [geral.tgt, lerp3(geral.tgt, t0.tgt, .6), t0.tgt] }, ease: [.2, .5], legenda: { t: titulo, s: sub } });
  // o motorista entra antes do cruzamento principal (o trecho com "cruzamento" no nome, ou o do meio)
  let kMot = tr.findIndex(t => /cruzamento/i.test(t.nome)); if (kMot < 0) kMot = Math.floor(tr.length * .6);
  tr.forEach((t, i) => {
    const a = recua(t, .12, 3), b = recua(t, -.06, 0).map((v, j) => v + lateral(t, dist(t.pos, t.tgt) * .07)[j]);
    if (i === kMot && ALN.PD) {
      const A = ALN.PD, m = A.proj([t.tgt[0], t.tgt[1]])[0];
      P.push({ id: 'motorista', dur: 11, corte: true, camadas: { est: false }, cam: { eixo: 'PD', m: [Math.max(A.m0 + 5, m - 160), Math.max(A.m0 + 20, m - 15)], lado: 1.8, alt: 1.25, olhar: 28, altAlvo: 1.0 }, ease: [.15, .3], legenda: { t: 'Na pista', s: 'PD chegando ao ' + t.nome.replace(/^Cruzamento\s*/i, 'cruzamento ') } });
      P.push({ id: 'trecho-' + i, dur: 6, corte: true, cam: { pos: [a, b], alvo: [t.tgt, t.tgt] }, ease: [.4, .4], legenda: { t: t.nome, s: t.desc } });
    } else {
      if (i > 0) {   // voo até o trecho: sobe um pouco no meio, para não atravessar telhado
        const prev = P[P.length - 1], de = prev.cam.pos[prev.cam.pos.length - 1], alvoDe = prev.cam.alvo[prev.cam.alvo.length - 1];
        const meio = lerp3(de, a, .5); meio[2] += Math.min(60, dist(de, a) * .18);
        P.push({ id: 'voo-' + i, dur: Math.max(2.5, Math.min(4.5, dist(de, a) / 70)), cam: { pos: [de, meio, a], alvo: [alvoDe, t.tgt] }, ease: [.5, .5] });
      }
      P.push({ id: 'trecho-' + i, dur: 5.5, cam: { pos: [a, b], alvo: [t.tgt, t.tgt] }, ease: [.4, .4], legenda: { t: t.nome, s: t.desc } });
    }
  });
  // fecho: sobe para ver a avenida inteira, com o que o RDO já lançou (se o app mandou)
  const ult = P[P.length - 1], de = ult.cam.pos[ult.cam.pos.length - 1];
  if (geral) {
    const temRDO = RDO.infos.length > 0;
    P.push({ id: 'fecho', dur: 8, cam: { pos: [de, lerp3(de, geral.pos, .5).map((v, i) => i === 2 ? v + 30 : v), geral.pos], alvo: [ult.cam.alvo[ult.cam.alvo.length - 1], geral.tgt] }, ease: [.4, .3],
      camadas: temRDO ? { rdo: true } : {}, legenda: temRDO ? { t: 'O que o RDO já lançou', s: String((RDO.dados && RDO.dados.resumo) || '') } : { t: titulo, s: sub } });
  }
  return { planos: P };
}
function legendaAparece(L) {   // entra subindo; sai esmaecendo (no voo entre trechos a tela fica limpa)
  const t = $('cineT'), s = $('cineS'), box = $('cineLeg');
  clearTimeout(legendaAparece._h);
  if (!L) { if (!box.hidden) { box.classList.remove('on'); box.classList.add('sai'); legendaAparece._h = setTimeout(() => { box.hidden = true; box.classList.remove('sai'); }, 450); } return; }
  box.classList.remove('on', 'sai'); void box.offsetWidth;   // reinicia a entrada
  t.textContent = String(L.t || ''); s.textContent = String(L.s || ''); s.hidden = !L.s;
  box.hidden = false; box.classList.add('on');
}
async function apresentar({ gravar = false } = {}) {
  if (APRES.on) return;
  let c; try { c = await cineCarregar(); } catch (e) { toast('Não foi possível abrir a apresentação: ' + (e && e.message || e)); return; }
  const R = c.carregar(roteiroApresentacao());
  stopDrive(); tween = null; info.hidden = true;
  APRES.antes = { pos: camera.position.clone(), alvo: controls.target.clone(), hora: +$('sunH').value };
  APRES.on = true; APRES.t0 = performance.now(); APRES.dur = R.dur; APRES.planos = c.planos; APRES.leg = -1;
  controls.enabled = false; document.documentElement.classList.add('cine-on'); cineUI.hidden = false;
  $('cineGrav').hidden = true;
  if (gravar) gravacaoIniciar();
  avisarApp({ tipo: 'apresentacao', on: true });
  invalidar(3);
}
function pararApresentacao(fim) {
  if (!APRES.on) return;
  APRES.on = false; cineMod.soltar(); controls.enabled = true; controls.update();
  document.documentElement.classList.remove('cine-on'); cineUI.hidden = true; legendaAparece(null);
  if (APRES.grav) gravacaoFim(!!fim);
  avisarApp({ tipo: 'apresentacao', on: false });
  invalidar(3);
}
function apresPasso(now) {
  const t = (now - APRES.t0) / 1000 * (window.__apresVel || 1);   // __apresVel: os testes andam devagar, o relógio do WebGL por software não acompanha
  if (t >= APRES.dur) { cineMod.quadro(APRES.dur - 1e-3); pararApresentacao(true); return; }
  const e = cineMod.quadro(t);
  if (e && e.i !== APRES.leg) { APRES.leg = e.i; legendaAparece(APRES.planos[e.i].legenda); }
  $('cineBarra').style.width = (100 * t / APRES.dur).toFixed(2) + '%';
  // corte entre planos: um mergulho rápido no preto, em vez do salto seco de câmera
  let veu = 0; for (const p of APRES.planos) if (p.corte) { const d = Math.abs(t - p.t0); if (d < .35) veu = Math.max(veu, 1 - d / .35); }
  $('cineVeu').style.opacity = veu.toFixed(3);
}
/* GRAVAR: o vídeo sai do próprio aparelho (MediaRecorder), com a legenda
   desenhada no quadro — o WebGL e o texto num canvas só. MP4 onde o navegador
   grava MP4 (Safari, Chrome recente); senão WebM. */
function gravacaoIniciar() {
  const tipos = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const tipo = window.MediaRecorder ? tipos.find(t => MediaRecorder.isTypeSupported(t)) : null;
  if (!tipo) { toast('Este navegador não grava vídeo. A apresentação continua sem gravar.', 5000); return; }
  const src = renderer.domElement, k = Math.min(1, 1920 / src.width, 1080 / src.height);
  const cv = document.createElement('canvas'); cv.width = Math.round(src.width * k / 2) * 2; cv.height = Math.round(src.height * k / 2) * 2;
  const g = cv.getContext('2d'), partes = [];
  let rec; try { rec = new MediaRecorder(cv.captureStream(30), { mimeType: tipo, videoBitsPerSecond: 10e6 }); } catch (e) { toast('Não foi possível gravar aqui: ' + (e && e.message || e), 5000); return; }
  rec.ondataavailable = ev => { if (ev.data && ev.data.size) partes.push(ev.data); };
  APRES.grav = { rec, cv, g, partes, tipo, salvar: false };
  /* O vídeo pronto vira um LINK para tocar: o download tem de nascer de um toque
     (o fim da apresentação não é um, e o navegador pode barrar o arquivo). */
  rec.onstop = () => { const G = APRES.grav; APRES.grav = null; if (!G || !G.salvar || !partes.length) return; const ext = /mp4/.test(tipo) ? 'mp4' : 'webm';
    const nome = 'apresentacao-' + (M.title || 'modelo').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) + '.' + ext;
    const a = $('gravLink'), velho = a.href; a.href = URL.createObjectURL(new Blob(partes, { type: tipo.split(';')[0] })); a.download = nome; if (velho && velho.startsWith('blob:')) URL.revokeObjectURL(velho);
    $('gravMB').textContent = (partes.reduce((s, b) => s + b.size, 0) / 1048576).toFixed(1).replace('.', ',') + ' MB · ' + ext.toUpperCase(); $('gravPronto').hidden = false; };
  rec.start(1000); $('cineGrav').hidden = false;
}
function gravacaoQuadro() {
  const G = APRES.grav; if (!G) return; const { cv, g } = G, W = cv.width, H = cv.height;
  g.drawImage(renderer.domElement, 0, 0, W, H);
  const v = +$('cineVeu').style.opacity || 0; if (v > 0) { g.fillStyle = `rgba(0,0,0,${v})`; g.fillRect(0, 0, W, H); }
  const L = APRES.leg >= 0 && APRES.planos[APRES.leg] && APRES.planos[APRES.leg].legenda;
  if (L) {
    const u = H / 1080, x = 64 * u, y = H - 96 * u;
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 14 * u;
    g.fillStyle = '#c85e14'; g.fillRect(x, y - 62 * u, 46 * u, 4 * u);
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(44 * u)}px "Space Grotesk", sans-serif`; g.fillText(String(L.t || ''), x, y - 16 * u);
    if (L.s) { g.font = `500 ${Math.round(24 * u)}px "JetBrains Mono", monospace`; g.fillStyle = 'rgba(255,255,255,.88)'; g.fillText(String(L.s), x, y + 22 * u); }
    g.restore();
  }
}
function gravacaoFim(salvar) { const G = APRES.grav; if (!G) return; G.salvar = salvar; try { G.rec.stop(); } catch (e) { APRES.grav = null; } $('cineGrav').hidden = true; if (!salvar) toast('Gravação interrompida: o vídeo só sai da apresentação inteira.', 4000); }
$('gravX').onclick = () => { $('gravPronto').hidden = true; };
$('apresBtn').onclick = () => apresentar();
$('gravBtn').onclick = () => apresentar({ gravar: true });
$('cineSair').onclick = () => pararApresentacao(false);
// qualquer toque no 3D devolve a câmera a quem tocou
for (const ev of ['pointerdown', 'wheel']) renderer.domElement.addEventListener(ev, () => { if (APRES.on) pararApresentacao(false); }, { passive: true });
document.addEventListener('keydown', e => { if (APRES.on && e.key === 'Escape') pararApresentacao(false); });
// o gravador do vídeo do modelo (ferramentas/video-modelo3d): sem painel nenhum, um quadro por pedido
if (PARAMS.get('cine') === '1') {
  document.documentElement.classList.add('cine-rec');
  window.__cineAbrir = async () => {
    const c = await cineCarregar();
    window.__cine = { carregar: r => c.carregar(r), quadro: (t, o) => c.quadro(t, o), projetar: p => c.projetar(p), soltar: () => c.soltar(), get dur() { return c.dur; },
      foto: (tipo = 'image/jpeg', q = .95) => { prepararQuadro(performance.now()); renderNow(); return renderer.domElement.toDataURL(tipo, q); } };
    return true;
  };
}
// tudo o que o laço faz antes de desenhar um quadro (o gravador chama o mesmo)
function prepararQuadro(now) {
  sky.position.copy(camera.position); if (sky.userData.dome) sky.userData.dome.position.copy(camera.position); updSun();
  camera.getWorldDirection(_d); const bearing = Math.atan2(_d.x, -_d.z); needle.setAttribute('transform', `rotate(${-bearing * 180 / Math.PI})`);
  mmMaybe(now);
}
renderer.setAnimationLoop(() => {
  if (window.__pause || document.hidden) return;   // test harness: no frames while loading · aba escondida: nada
  const now = performance.now();
  if (APRES.on) apresPasso(now);   // a apresentação manda na câmera: nada de órbita, roda ou voo por cima dela
  else {
    if (drive.on) driveStep(now);
    navStep(now);
    if (tween) { const k = Math.min(1, (now - tween.t0) / 1100), e = ease(k); camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e); if (k >= 1) tween = null; invalidar(); }
    controls.update();
  }
  if (aguaNoQuadro(now) && now - ultimoQuadro > 33) { SOLID.agua.normalMap.offset.set((now * 1.2e-5) % 1, (now * 0.8e-5) % 1); invalidar(1); }
  if (carregando && now - ultimoQuadro > 250) invalidar(1);
  if (sujo <= 0) { quadroAnterior = false; return; }
  sujo--; ultimoQuadro = now;
  prepararQuadro(now);
  renderNow();
  if (APRES.grav) gravacaoQuadro();
  // o aviso de "pesada" mede quadros SEGUIDOS (câmera andando), não o intervalo entre dois toques
  if (Q_ALTA && window.__hqDone && FT.n < 90) { if (quadroAnterior && FT.last) { FT.t.push(now - FT.last); FT.n++; } FT.last = now;
    if (FT.n === 90) { const a = FT.t.slice(10).sort((x, y) => x - y); const med = a[a.length >> 1]; if (med > 70) toast('A imagem está pesada neste computador. Se ficar lenta, use “Qualidade: Leve” em Ferramentas › Tela.', 8000); } }
  quadroAnterior = true;
});
const FT = { t: [], n: 0, last: 0 };
setSun(false);
const firstView = Q_ALTA && VIEWS.aerea ? 'aerea' : VIEWS.geral ? 'geral' : Object.keys(VIEWS)[0];
goView(firstView, true); updSun(true);
window.__goto = (pos, tgt) => { tween = null; camera.position.copy(V(...pos)); controls.target.copy(V(...tgt)); controls.update(); hint(tgt[0], tgt[1]); };
window.__tiles = () => TILES.map(t => ({ id: t.id, st: t.st }));
window.__cam = () => { const x = camera.position.x, y = -camera.position.z; const n = nearestAxis(x, y); return { pos: [x, y, camera.position.y].map(v => +v.toFixed(2)), axis: n && `${n.P} ${estStr(n.m)} D=${n.D.toFixed(2)}` }; };
$('loadingSub').textContent = TILES.length ? 'carregando o primeiro trecho…' : '';
const tilesDone = loadTiles();
$('qBtn').textContent = 'Qualidade: ' + (Q_ALTA ? 'Alta' : 'Leve') + ' → mudar para ' + (Q_ALTA ? 'Leve' : 'Alta');
$('qBtn').onclick = () => { try { localStorage.setItem(Q_KEY, Q_ALTA ? 'leve' : 'alta'); } catch { } const u = new URL(location.href); u.searchParams.delete('q'); try { location.replace(u.toString()); } catch { location.reload(); } };
if (Q_ALTA) { window.__hqDone = false; plantDone = plantEZ(); Promise.all([tilesDone.then(() => loadEntorno()).then(() => loadEdif()), plantDone]).then(() => { window.__hqDone = true; carregando = false; invalidar(3); invalidarSombra(); }); $('sunH').value = 9.5; setSun(true); }
else { window.__edifDone = false; tilesDone.then(() => loadEdif()).then(() => { window.__edifDone = true; carregando = false; invalidar(3); invalidarSombra(); }); }
window.__gz = (x, y) => groundZ(x, y);
// pronto para receber o RDO: o app só manda depois disto (antes, ninguém escutava)
avisarApp({ tipo: 'pronto', eixos: Object.fromEntries(AXES.map(k => [k, [ALN[k].m0, ALN[k].m1]])) });
// ---------- edificações existentes (OpenStreetMap / mapa digital da PMSP): blocos LOD1 extrudados pela altura do OSM
function facadeTex(brick) { return canvasTex(512, (g, S) => {    // 6 m x 6 m: two storeys of 3 m, two bays of 3 m
  if (brick) { g.fillStyle = '#b86a4b'; g.fillRect(0, 0, S, S); const r = rng(83); for (let y = 0; y < S; y += 16) for (let x = (y / 16 % 2) * 20; x < S + 40; x += 40) { const t = 150 + r() * 50 | 0; g.fillStyle = `rgb(${t + 40},${t * .55 | 0},${t * .38 | 0})`; g.fillRect(x - 20 + 1.5, y + 1.5, 37, 13); } }
  else { speckle(g, S, '#e9e6df', 9000, ['#dcd8cf', '#f3f1ec', '#cfcac0'], .6, 2, 81); mottled(g, S, ['#c9c3b6', '#f5f3ee'], 5, 60, 40, 140, .1); }
  const r = rng(brick ? 84 : 85);
  for (let fl = 0; fl < 2; fl++) for (let b = 0; b < 2; b++) { if (r() < .12) continue; const x0 = b * S / 2 + S / 2 * (.3 + r() * .05), y0 = S - (fl * S / 2 + S / 2 * (.36 + .37)), w = S / 2 * .4, h = S / 2 * .37;
    g.fillStyle = '#d8d4cc'; g.fillRect(x0 - 5, y0 - 5, w + 10, h + 10); g.fillStyle = '#2c3438'; g.fillRect(x0, y0, w, h); g.fillStyle = 'rgba(160,190,205,.35)'; g.fillRect(x0 + 3, y0 + 3, w / 2 - 5, h - 6);
    g.strokeStyle = '#9aa0a2'; g.lineWidth = 3; g.strokeRect(x0, y0, w, h); g.beginPath(); g.moveTo(x0 + w / 2, y0); g.lineTo(x0 + w / 2, y0 + h); g.stroke(); }
  g.fillStyle = 'rgba(60,55,48,.18)'; g.fillRect(0, S - 10, S, 10); g.fillRect(0, S / 2 - 6, S, 6); }); }
const EDM = { r: new THREE.MeshStandardMaterial({ map: facadeTex(false), vertexColors: true, roughness: .92, side: THREE.DoubleSide }), t: new THREE.MeshStandardMaterial({ map: facadeTex(true), vertexColors: true, roughness: .95, side: THREE.DoubleSide }),
  c: new THREE.MeshStandardMaterial({ map: canvasTex(256, (g, S) => { speckle(g, S, '#d6d4cf', 6000, ['#c4c1bb', '#e4e2de', '#b3b0a9'], .5, 1.6, 86); g.strokeStyle = 'rgba(80,78,72,.25)'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * S / 8); g.lineTo(S, i * S / 8); g.stroke(); } }), vertexColors: true, roughness: .9, side: THREE.DoubleSide }),
  k: new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: .45 }) };
EDM.r.name = 'edif_reboco'; EDM.t.name = 'edif_tijolo'; EDM.c.name = 'edif_cobertura'; EDM.k.name = 'caixa_dagua';
async function loadEdif() {
  let E; try { E = await lerArquivo('edif.json'); } catch (e) { console.warn('Edificações não carregadas:', e && e.message); return; }
  const list = E.b.filter(b => Q_ALTA || b.e);
  const WALL = ['#f1ece2', '#e9dfc9', '#f3e3b3', '#efcfb0', '#dfe7ea', '#dbe6d2', '#efd6d6', '#d9d6cf', '#f6f3ec', '#e8d8bf', '#cfd8dc', '#f0e6d8'].map(h => new THREE.Color(h));
  const ROOF = [['#bdbab3', .45], ['#9aa0a4', .35], ['#a9583a', .2]].map(([h, p]) => [new THREE.Color(h), p]);
  const cells = new Map(), infos = [], tanks = [];
  const f2 = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const put = (A, x, y, z, u, v, c) => { A.p.push(x, z, -y); A.uv.push(u, v); A.c.push(c.r, c.g, c.b); };
  list.forEach((b, bi) => {
    const polys = (!Q_ALTA && b.fe) ? b.fe : b.f; if (!polys || !polys.length) return;
    const p0 = polys[0].o[0]; const key = Math.floor(p0[0] / 160) + '|' + Math.floor(p0[1] / 160);
    if (!cells.has(key)) cells.set(key, { r: { p: [], uv: [], c: [], b: [] }, t: { p: [], uv: [], c: [], b: [] }, c: { p: [], uv: [], c: [], b: [] } });
    const C = cells.get(key); const v = b.v || 0;
    const brick = !b.c && b.a < 400 && v % 4 === 1; const W = C[brick ? 't' : 'r']; const R = C.c;
    const wc = brick ? new THREE.Color(1, 1, 1).multiplyScalar(.9 + (v % 7) * .02) : WALL[v % WALL.length].clone();
    let acc = 0, rc = ROOF[0][0]; { let q = ((v * 37) % 100) / 100; for (const [c, p] of ROOF) { if (q < p) { rc = c; break; } q -= p; } } if (b.a > 300 || b.c) rc = (v % 3 ? ROOF[1][0] : ROOF[0][0]); rc = rc.clone().multiplyScalar(.92 + (v % 5) * .03);
    const zt = b.z1, zb = b.c ? b.z1 - .8 : b.z0, zg = b.zg;
    const infoI = infos.length;
    infos.push({ disc: 'Existente (OpenStreetMap)', t: b.nm || (b.c ? 'Cobertura existente' : 'Edificação existente'), rows: [['Altura', f2(b.h) + ' m — ' + b.hq], ...(b.a < 600 && !b.c ? [['Pavimentos (estimativa)', String(b.n)]] : []), ['Área do contorno', f2(b.a) + ' m²'], ['Situação', b.st], ['Observação', 'representação mínima (bloco); não é cadastro']], src: 'OpenStreetMap (© colaboradores, ODbL) · mapa digital PMSP' });
    for (const P of polys) {
      const rings = [P.o, ...(P.h || [])];
      for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); const T = (b.c ? R : W); const u0 = acc / 6, u1 = (acc + L) / 6; acc += L;
        const col = b.c ? rc : wc; const v0 = (zb - zg) / 6, v1 = (zt - zg) / 6;
        put(T, a[0], a[1], zb, u0, v0, col); put(T, c[0], c[1], zb, u1, v0, col); put(T, c[0], c[1], zt, u1, v1, col);
        put(T, a[0], a[1], zb, u0, v0, col); put(T, c[0], c[1], zt, u1, v1, col); put(T, a[0], a[1], zt, u0, v1, col); T.b.push(infoI, infoI);
      }
      const ct = P.o.map(q => new THREE.Vector2(q[0], q[1])), hs = (P.h || []).map(h => h.map(q => new THREE.Vector2(q[0], q[1]))); const all = [...ct, ...hs.flat()];
      let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(ct, hs); } catch (e) { }
      for (const zz of b.c ? [zt, zb] : [zt]) for (const [i0, i1, i2] of tris) { for (const k of [i0, i1, i2]) put(R, all[k].x, all[k].y, zz, all[k].x / 4, all[k].y / 4, rc); R.b.push(infoI); }
      if (b.c) { const cx = ct.reduce((s, q) => s + q.x, 0) / ct.length, cy = ct.reduce((s, q) => s + q.y, 0) / ct.length;   // columns
        ct.filter((q, k) => k % Math.max(1, Math.floor(ct.length / 6)) === 0).slice(0, 6).forEach(q => { const x = cx + (q.x - cx) * .7, y = cy + (q.y - cy) * .7, d = .2;
          for (const [a, c] of [[[x - d, y - d], [x + d, y - d]], [[x + d, y - d], [x + d, y + d]], [[x + d, y + d], [x - d, y + d]], [[x - d, y + d], [x - d, y - d]]]) {
            put(W, a[0], a[1], zg - .2, 0, 0, wc); put(W, c[0], c[1], zg - .2, .07, 0, wc); put(W, c[0], c[1], zb, .07, .1, wc); put(W, a[0], a[1], zg - .2, 0, 0, wc); put(W, c[0], c[1], zb, .07, .1, wc); put(W, a[0], a[1], zb, 0, .1, wc); W.b.push(infoI, infoI); } }); }
    }
    if (!b.c && b.a < 350 && b.h <= 7.6 && v % 10 < 6) { const o = polys[0].o; let cx = 0, cy = 0; for (const q of o) { cx += q[0]; cy += q[1]; } cx /= o.length; cy /= o.length;
      let ins = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) if ((o[i][1] > cy) !== (o[j][1] > cy) && cx < (o[j][0] - o[i][0]) * (cy - o[i][1]) / (o[j][1] - o[i][1]) + o[i][0]) ins = !ins;
      if (ins) tanks.push([cx + ((v % 3) - 1) * .8, cy + ((v % 5) - 2) * .5, zt]); }
  });
  for (const C of cells.values()) for (const [k, A] of Object.entries(C)) {
    if (!A.p.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, EDM[k]); m.castShadow = m.receiveShadow = true; m.userData.faceB = Int32Array.from(A.b); m.userData.stype = 'edif'; addInst('edi', m, infos, false);
  }
  if (tanks.length) { const tg = mergeGeometries([new THREE.CylinderGeometry(.6, .55, .95, 14).translate(0, .475, 0), new THREE.CylinderGeometry(.66, .66, .08, 14).translate(0, .98, 0)]);
    const im = new THREE.InstancedMesh(tg, EDM.k, tanks.length); const mt = new THREE.Matrix4(); tanks.forEach((t, k) => { mt.makeTranslation(t[0], t[2], -t[1]); im.setMatrixAt(k, mt); }); im.castShadow = im.receiveShadow = true; im.computeBoundingSphere();
    addInst('edi', im, tanks.map(() => ({ disc: 'Ilustrativo', t: 'Caixa-d\u2019água (ilustrativa)', rows: [['Observação', 'colocada só para dar escala; não vem do OSM']], src: 'modelo' })), false); }
  if (clipOn) applyClip(true); envK(); tileVer++; invalidar(3); invalidarSombra();
}
window.__dbg = { THREE, scene, renderer, sun, sky, su, MAT, PAINT, get composer() { return composer; }, get gtao() { return gtao; }, pmrem, envScene, setSun, updSun, camera, controls, GRP, HQ,
  get tampa() { return secTampa || FATIA.mesh; } };
