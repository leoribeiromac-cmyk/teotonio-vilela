/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ============================================================
   CINEMA DO VISOR (js/modelo3d/cine.js)
   ------------------------------------------------------------
   Câmera e cena descritas como um ROTEIRO de planos, e um quadro que é
   função só do tempo: quadro(t) põe a câmera, o sol, a transparência e as
   camadas exatamente onde o roteiro manda em t — tanto faz se t veio do
   relógio (o "Apresentar a obra", ao vivo) ou de um gravador que desenha
   quadro a quadro (o vídeo do modelo, ferramentas/video-modelo3d/).

   Carregado SÓ quando alguém pede (import() do visor): quem nunca apresenta
   a obra não baixa nem compila nada disto.

   O que um plano sabe dizer (todas as coordenadas são as do modelo: x leste,
   y norte, z cota relativa — as mesmas do index.json):
   · cam.pos/cam.alvo — pontos de passagem (spline centrípeta, velocidade
     constante ao longo do caminho);
   · cam.eixo — andar pelo eixo (PD/PE) a uma altura da superfície: o
     motorista, o ciclista, o drone baixo;
   · cam.orbita — girar em volta de um ponto;
   · ease [entrada, saída] — frações do plano em que a câmera acelera e
     freia (aceleração em seno: sem tranco). [0, 0] é velocidade constante,
     para cortar com a câmera andando;
   · fov, rolar (graus), tremor (m, o balanço de um drone) e hora do sol;
   · opac — a superfície fica transparente (a drenagem aparece por baixo);
   · camadas — liga/desliga camadas;
   · brilho — um material acende (a drenagem no raio X);
   · fatia — a pista cortada numa estaca, com as camadas do pavimento na face;
   · varredura — a obra "se constrói" ao longo do eixo: cada camada aparece
     atrás de uma frente que anda, na ordem da obra. É SIMULAÇÃO: quem chama
     tem de dizer isso na tela (o vídeo e a apresentação dizem).
   Regra de RDO não mora aqui, como no resto do visor.
   ============================================================ */
export function criarCine(ctx) {
  const { THREE, camera, controls, GRP, ALN, V } = ctx;
  const fin = Number.isFinite;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = k => Math.max(0, Math.min(1, k));
  const suave = k => k * k * (3 - 2 * k);

  /* ---------- perfil de velocidade: acelera em seno, anda constante, freia em seno.
     Tabela da posição acumulada (0..1) para 1.001 instantes: a conta é feita uma vez. */
  function perfil(ein = 0, eout = 0) {
    ein = clamp01(ein); eout = clamp01(eout); if (ein + eout > 1) { const s = ein + eout; ein /= s; eout /= s; }
    const N = 1000, acc = new Float64Array(N + 1);
    const v = u => u < ein ? (1 - Math.cos(Math.PI * u / ein)) / 2 : u > 1 - eout ? (1 - Math.cos(Math.PI * (1 - u) / eout)) / 2 : 1;
    for (let i = 1; i <= N; i++) acc[i] = acc[i - 1] + (v((i - .5) / N));
    const tot = acc[N] || 1;
    return u => { u = clamp01(u); const x = u * N, i = Math.min(N - 1, Math.floor(x)); return lerp(acc[i], acc[i + 1], x - i) / tot; };
  }
  /* ---------- um valor que anda: número fixo, [de, para] ao longo do plano, ou
     { v: [de, para], t: [início, fim] (frações do plano), suave: true } */
  function val(spec, u, uEase) {
    if (spec == null) return null;
    if (typeof spec === 'number') return spec;
    if (Array.isArray(spec)) return lerp(spec[0], spec[1], uEase);
    if (Array.isArray(spec.v)) { const [t0, t1] = spec.t || [0, 1]; let k = clamp01((u - t0) / Math.max(1e-6, t1 - t0)); if (spec.suave !== false) k = suave(k); return lerp(spec.v[0], spec.v[1], k); }
    return null;
  }
  const P3 = a => V(a[0], a[1], a[2]);

  // ---------- a superfície debaixo de um ponto (pista, passeio, terreno…)
  function chao(x, y) { const z = ctx.superficie(x, y); return fin(z) ? z : 0; }

  /* ---------- caminhos da câmera */
  function curva(pts) {
    const v = pts.map(P3);
    if (v.length === 1) return { getPointAt: () => v[0].clone() };
    if (v.length === 2) return { getPointAt: u => v[0].clone().lerp(v[1], u) };
    return new THREE.CatmullRomCurve3(v, false, 'centripetal');
  }
  function caminhoEixo(c) {   // anda pelo eixo, a "lado" metros à direita (+) do sentido do estaqueamento
    const A = ALN[c.eixo]; if (!A) throw new Error('eixo ' + c.eixo + ' não existe no modelo');
    const [m0, m1] = c.m, sg = m1 >= m0 ? 1 : -1, olhar = c.olhar ?? 30, lado = c.lado ?? 0, alt = c.alt ?? 1.3, altAlvo = c.altAlvo ?? alt * .8;
    const ladoAlvo = c.ladoAlvo ?? lado;
    const amostra = (m, D, h) => { m = Math.max(A.m0, Math.min(A.m1, m)); const p = A.pos(m), d = A.dir(m), r = [d[1], -d[0]]; const x = p[0] + r[0] * D, y = p[1] + r[1] * D; return [x, y, h]; };
    const n = Math.max(2, Math.ceil(Math.abs(m1 - m0) / 4) + 1), pos = [], alvo = [], zs = [], za = [];
    for (let i = 0; i < n; i++) { const m = lerp(m0, m1, i / (n - 1)); const q = amostra(m, lado, 0), a = amostra(m + sg * olhar, ladoAlvo, 0); zs.push(chao(q[0], q[1])); za.push(chao(a[0], a[1])); pos.push(q); alvo.push(a); }
    // a altura acompanha o greide sem os degraus de guia e sarjeta: média móvel de ±3 amostras
    const liso = z => z.map((_, i) => { let s = 0, k = 0; for (let j = Math.max(0, i - 3); j <= Math.min(z.length - 1, i + 3); j++) { s += z[j]; k++; } return s / k; });
    const zl = liso(zs), zal = liso(za);
    pos.forEach((q, i) => q[2] = zl[i] + alt); alvo.forEach((a, i) => a[2] = zal[i] + altAlvo);
    return { pos: curva(pos), alvo: curva(alvo) };
  }
  function caminhoOrbita(o) {
    const c = o.centro, rr = o.raio, hh = o.alt, aa = o.ang;   // ang: rumo (graus, horário a partir do norte) do centro até a câmera
    return {
      pos: { getPointAt: u => { const a = lerp(aa[0], aa[1], u) * Math.PI / 180, r = Array.isArray(rr) ? lerp(rr[0], rr[1], u) : rr, h = Array.isArray(hh) ? lerp(hh[0], hh[1], u) : hh; return P3([c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r, c[2] + h]); } },
      alvo: { getPointAt: u => { const z = o.alvoZ != null ? (Array.isArray(o.alvoZ) ? lerp(o.alvoZ[0], o.alvoZ[1], u) : o.alvoZ) : 0; return P3([c[0], c[1], c[2] + z]); } } };
  }

  /* ---------- a varredura: cada camada só aparece atrás da sua frente.
     O material de cada camada vira uma CÓPIA com um plano de corte só dela: o
     mesmo material serve a camadas diferentes (o concreto da guia e o do
     passeio), e o three.js não troca o plano de um objeto para outro quando
     dois seguidos usam o mesmo material. Ao sair, tudo volta como estava. */
  const VAR = { ativa: false, planos: {}, trocas: [], cortina: null };
  function varreduraLigar(spec) {
    if (VAR.ativa) return;
    VAR.ativa = true; VAR.planos = {}; VAR.trocas = [];
    for (const g of Object.keys(spec.grupos)) {
      if (!GRP[g]) continue;
      const pl = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0); VAR.planos[g] = pl;
      const copias = new Map();
      GRP[g].traverse(o => {
        if (!o.material) return;
        const troca = m => { if (!m) return m; let c = copias.get(m); if (!c) { c = m.clone(); c.clippingPlanes = [pl]; c.clipShadows = true; c.clipIntersection = false; copias.set(m, c); } return c; };
        VAR.trocas.push([o, o.material]);
        o.material = Array.isArray(o.material) ? o.material.map(troca) : troca(o.material);
      });
    }
    if (spec.cortina !== false) {
      // a "cortina de luz" na frente da obra: um degradê aditivo, do chão para cima
      const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128; const g2 = cv.getContext('2d');
      const gr = g2.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.7, 'rgba(255,255,255,.18)'); gr.addColorStop(.97, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 4, 128);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(spec.cor || '#ffb15c'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(spec.largura || 70, spec.altura || 9).translate(0, (spec.altura || 9) / 2, 0), mat);
      m.renderOrder = 20; m.userData.noAO = true; m.frustumCulled = false; m.raycast = () => { };
      ctx.scene.add(m); VAR.cortina = m;
    }
    ctx.invalidarSombra();
  }
  function varreduraDesligar() {
    if (!VAR.ativa) return;
    const vistos = new Set();
    for (const [o, m] of VAR.trocas) { const c = o.material; (Array.isArray(c) ? c : [c]).forEach(x => { if (x && !vistos.has(x)) { vistos.add(x); x.dispose(); } }); o.material = m; }
    if (VAR.cortina) { ctx.scene.remove(VAR.cortina); VAR.cortina.geometry.dispose(); VAR.cortina.material.map.dispose(); VAR.cortina.material.dispose(); VAR.cortina = null; }
    VAR.ativa = false; VAR.trocas = []; VAR.planos = {}; ctx.invalidarSombra();
  }
  const _n = new THREE.Vector3(), _p = new THREE.Vector3();
  function pontoNoEixo(A, s) {   // além das pontas o eixo continua reto
    const m = Math.max(A.m0, Math.min(A.m1, s)), p = A.pos(m), d = A.dir(m), ex = s - m;
    return { x: p[0] + d[0] * ex, y: p[1] + d[1] * ex, d };
  }
  function varreduraQuadro(spec, u) {
    const A = ALN[spec.eixo || 'PD']; if (!A) return;
    const [t0, t1] = spec.t || [0, 1]; let k = clamp01((u - t0) / Math.max(1e-6, t1 - t0)); k = spec.ease === 'linear' ? k : perfilVar(k);
    const F = lerp(spec.m[0], spec.m[1], k);
    let lider = null, menor = Infinity;
    for (const [g, off] of Object.entries(spec.grupos)) {
      const pl = VAR.planos[g]; if (!pl) continue;
      const q = pontoNoEixo(A, F - off);
      _n.set(-q.d[0], 0, q.d[1]);                         // aponta para trás da frente (V(x,y,z) = (x, z, −y))
      _p.copy(V(q.x, q.y, 0));
      pl.setFromNormalAndCoplanarPoint(_n, _p);
      if (off < menor) { menor = off; lider = q; }
    }
    if (VAR.cortina && lider) {
      const c = VAR.cortina, z = chao(lider.x, lider.y) - .3;
      c.position.copy(V(lider.x, lider.y, z));
      c.rotation.set(0, Math.atan2(lider.d[0], -lider.d[1]), 0);   // a cortina atravessa a pista: a normal dela é o rumo do eixo
      // some nas pontas: a cortina nasce e morre, não fica parada no começo nem no fim
      const dentro = Math.min(F - (spec.m[0] < spec.m[1] ? spec.m[0] : spec.m[1]), (spec.m[0] < spec.m[1] ? spec.m[1] : spec.m[0]) - F);
      c.material.opacity = clamp01(dentro / 40) * (spec.brilho ?? 1);
      c.visible = c.material.opacity > .01;
    }
    ctx.invalidarSombra();
  }
  const perfilVar = perfil(.18, .18);

  /* ---------- o roteiro carregado: cada plano com o tempo em que começa */
  let R = null;
  function carregar(roteiro) {
    varreduraDesligar();
    const planos = []; let t = 0;
    for (const p of roteiro.planos || []) {
      const c = p.cam || {};
      let cam;
      if (c.eixo) cam = caminhoEixo(c);
      else if (c.orbita) cam = caminhoOrbita(c.orbita);
      else cam = { pos: curva(c.pos || [[0, 0, 50]]), alvo: curva(c.alvo || [[0, 0, 0]]) };
      planos.push({ ...p, t0: t, cam, prog: perfil(...(p.ease || [.25, .25])) });
      t += p.dur;
    }
    R = { planos, dur: t, ultimo: null, camadasAntes: null, op: null, nv: undefined, ex: undefined, sombra: 'null' };
    return { dur: t, planos: planos.length };
  }
  function planoEm(t) {
    if (!R || !R.planos.length) return null;
    let i = R.planos.length - 1; for (let k = 0; k < R.planos.length; k++) if (t < R.planos[k].t0 + R.planos[k].dur) { i = k; break; }
    const P = R.planos[i]; return { P, i, u: clamp01((t - P.t0) / P.dur) };
  }
  const _sol = { h: null, mes: null, regen: null };
  function tremor(t, amp) {   // balanço de drone: soma de senos sem período comum
    return [amp * (.6 * Math.sin(1.31 * t + .7) + .3 * Math.sin(2.93 * t + 2.1) + .1 * Math.sin(5.37 * t + 4.2)),
      amp * (.6 * Math.sin(1.17 * t + 1.9) + .3 * Math.sin(3.11 * t + .4) + .1 * Math.sin(4.79 * t + 3.3)),
      amp * .5 * (.7 * Math.sin(.97 * t + 2.6) + .3 * Math.sin(2.41 * t + 1.2))];
  }
  /* ---------- O QUADRO: tudo o que o roteiro manda no instante t (segundos) */
  function quadro(t, { regenSol = 'fim' } = {}) {
    const e = planoEm(t); if (!e) return null;
    const { P, u } = e, ue = P.prog(u);
    // camadas: as do plano, sobre o estado de antes do roteiro
    if (R.ultimo !== P) {
      if (!R.camadasAntes) { R.camadasAntes = {}; for (const k in GRP) R.camadasAntes[k] = GRP[k].visible; }
      for (const k in GRP) GRP[k].visible = R.camadasAntes[k];
      for (const [k, v] of Object.entries(P.camadas || {})) if (GRP[k]) GRP[k].visible = !!v;
      if (P.varredura) varreduraLigar(P.varredura); else varreduraDesligar();
      brilhoDesfazer();
      if (!P.fatia && R.fatiaM != null) { ctx.fatia(null); R.fatiaM = null; }
      // a sombra ampla e a cor da névoa valem pelo plano inteiro
      const sb = P.sombra || null; if (JSON.stringify(sb) !== R.sombra) { R.sombra = JSON.stringify(sb); ctx.sombra(sb); }
      ctx.nevoaCor(P.nevoaCor ?? null);
      R.ultimo = P; ctx.invalidarSombra();
    }
    if (P.varredura) varreduraQuadro(P.varredura, u);
    if (P.brilho) brilhoQuadro(P.brilho, u, ue);
    // a fatia 3D: a pista cortada numa estaca (que pode andar), com as camadas na face
    if (P.fatia) { const mf = val(P.fatia.m, u, ue); if (mf !== R.fatiaM) { R.fatiaM = mf; ctx.fatia({ ...P.fatia, m: mf }); } }
    // câmera
    const pos = P.cam.pos.getPointAt(ue), alvo = P.cam.alvo.getPointAt(ue);
    if (P.tremor) { const [a, b, c] = tremor(t, P.tremor); alvo.x += a; alvo.z += b; alvo.y += c; const [d, f] = tremor(t + 17.3, P.tremor * .5); pos.x += d; pos.z += f; }
    camera.position.copy(pos); controls.target.copy(alvo); camera.up.set(0, 1, 0); camera.lookAt(alvo);
    const rol = val(P.rolar, u, ue); if (rol) camera.rotateZ(rol * Math.PI / 180);
    const fov = val(P.fov, u, ue) ?? 45; if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    // superfície transparente (raio X da drenagem)
    const op = val(P.opac, u, ue) ?? 1; if (op !== R.op) { R.op = op; ctx.opacidade(op); }
    // névoa (perspectiva aérea) e exposição do plano; sem valor, as do visor
    const nv = val(P.nevoa, u, ue); if (nv !== R.nv) { R.nv = nv; ctx.nevoa(nv); }
    const ex = val(P.exposicao, u, ue); if (ex !== R.ex) { R.ex = ex; ctx.exposicao(ex); }
    // sol: a hora anda com o plano; o reflexo do céu (caro) é refeito no fim do plano, ou a cada quadro se pedido
    const h = val(P.hora, u, ue), mes = P.mes ?? null;
    if (h != null && (h !== _sol.h || mes !== _sol.mes)) {
      _sol.h = h; _sol.mes = mes;
      const regen = regenSol === 'sempre' || (regenSol === 'fim' && (u >= 1 || typeof P.hora === 'number'));
      ctx.sol(h, regen && _sol.regen !== h + '|' + mes, mes); if (regen) _sol.regen = h + '|' + mes;
    }
    if (ctx.agua) ctx.agua(t);
    ctx.invalidar(2);
    return { id: P.id, i: e.i, u, ue };
  }
  /* ---------- brilho: um material do modelo acende (a drenagem no raio X: o
     tubo cinza some contra o terreno transparente). O que era volta ao sair. */
  const BRILHO = new Map();
  function brilhoQuadro(b, u, ue) {
    const k = val(b.k ?? 1, u, ue) || 0, cor = new THREE.Color(b.cor || '#4aa3ff');
    for (const nome of b.mats || []) {
      const m = ctx.material(nome); if (!m || !m.emissive) continue;
      if (!BRILHO.has(m)) BRILHO.set(m, [m.emissive.clone(), m.emissiveIntensity]);
      m.emissive.copy(cor); m.emissiveIntensity = k;
    }
  }
  function brilhoDesfazer() { for (const [m, [c, i]] of BRILHO) { m.emissive.copy(c); m.emissiveIntensity = i; } BRILHO.clear(); }
  function soltar() {   // sai do roteiro: camadas, transparência e câmera voltam ao comando de quem usa
    varreduraDesligar(); brilhoDesfazer(); if (R && R.fatiaM != null) { ctx.fatia(null); R.fatiaM = null; }
    if (R && R.camadasAntes) for (const k in GRP) GRP[k].visible = R.camadasAntes[k];
    if (R) { R.ultimo = null; R.camadasAntes = null; R.op = null; R.nv = undefined; R.ex = undefined; }
    ctx.nevoa(null); ctx.exposicao(null); ctx.nevoaCor(null); if (R && R.sombra !== 'null') { ctx.sombra(null); R.sombra = 'null'; }
    camera.up.set(0, 1, 0); if (camera.fov !== 45) { camera.fov = 45; camera.updateProjectionMatrix(); }
    ctx.opacidade(1); ctx.invalidarSombra(); ctx.invalidar(3);
  }
  // onde, na tela (px do canvas), caem pontos do modelo — para legendas que acompanham a câmera
  function projetar(pts) {
    camera.updateMatrixWorld(); const W = ctx.renderer.domElement.width, H = ctx.renderer.domElement.height;
    return pts.map(a => { const q = P3(a).project(camera); return q.z < -1 || q.z > 1 ? null : [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; });
  }
  return { perfil, val, carregar, quadro, soltar, projetar, planoEm, get dur() { return R ? R.dur : 0; }, get planos() { return R ? R.planos.map(p => ({ id: p.id, t0: p.t0, dur: p.dur, legenda: p.legenda || null, corte: !!p.corte })) : []; } };
}
