/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// posições dos eixos do modelo (as mesmas contas do visor), para escrever o roteiro
const fs = require('fs');
const M = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../../modelo3d/teotonio/index.json'), 'utf8'));
const dec = o => { const b = Buffer.from(o.b64, 'base64'); return o.t === 'F' ? new Float32Array(b.buffer, b.byteOffset, b.length / 4) : new Uint32Array(b.buffer, b.byteOffset, b.length / 4); };
const AL = {};
for (const [k, a] of Object.entries(M.align)) { const xy = Float32Array.from(dec(a.xy)); const n = xy.length / 2; AL[k] = { xy, n, m0: a.m0, dm: a.dm, g: a.g ? Float32Array.from(dec(a.g)) : null }; }
function em(P, m, lado = 0) {
  const A = AL[P]; const f0 = (m - A.m0) / A.dm; const i = Math.max(0, Math.min(A.n - 2, Math.floor(f0))), f = Math.max(0, Math.min(1, f0 - i));
  const x = A.xy[2 * i] + f * (A.xy[2 * i + 2] - A.xy[2 * i]), y = A.xy[2 * i + 1] + f * (A.xy[2 * i + 3] - A.xy[2 * i + 1]);
  let dx = A.xy[2 * i + 2] - A.xy[2 * i], dy = A.xy[2 * i + 3] - A.xy[2 * i + 1]; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const z = A.g ? A.g[i] + f * (A.g[i + 1] - A.g[i]) : 0;
  return { x: x + dy * lado, y: y - dx * lado, z, dir: [dx, dy], rumo: Math.atan2(dx, dy) * 180 / Math.PI };
}
const pt = (P, m, lado = 0, h = 0) => { const q = em(P, m, lado); return [+q.x.toFixed(2), +q.y.toFixed(2), +(q.z + h).toFixed(2)]; };
module.exports = { M, em, pt };
if (require.main === module) console.log(pt('PD', 4623), pt('PD', 4470, 0, 300), em('PD', 4700).rumo);
