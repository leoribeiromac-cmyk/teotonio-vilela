/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// ROTEIRO do vídeo do modelo 3D da Teotônio. Coordenadas do modelo (x leste, y norte, z cota relativa).
// Cada plano é um tempo de câmera; a montagem (comp.py) corta, funde e põe texto por cima.
const { pt, em } = require('./eixo.js');
const MES = 4;   // maio: o mês em que a obra começou (09/05/2024); sol baixo no NE de manhã e no NO à tarde
const ESC = { est: false, rdo: false, fot: false, exi: false };   // rótulo de estaca, RDO e cadastro só onde o plano pede
const cam = (pos, alvo) => ({ pos, alvo });
const add = (a, b) => a.map((v, i) => v + (b[i] || 0));
// o meio da avenida, para a planta: entre a Jaceguava e o bueiro; a avenida atravessa a tela da esquerda para a direita
const C = [-120, -170, 0], H0 = 265;
const cima = (ang, r = 3) => [C[0] + Math.sin(ang * Math.PI / 180) * r, C[1] + Math.cos(ang * Math.PI / 180) * r, 0];
const CRUZ = [0, 0, 3.6];
const VARRE = { dre: 0, geo: 35, pav: 62, urb: 88, sih: 116, siv: 132, ilu: 132, pai: 148, ilus: 182 };
const M0 = 4061.5 - 12, M1 = 4870.5 + 190;
const AMPLA = { meia: 460, mapa: 8192, centro: [-60, -130, 6] };
// na obra simulada a sombra é refeita a cada quadro (o corte das camadas muda): 4096² sobre ±330 m custa um quarto
const OBRA_SOMBRA = { meia: 330, mapa: 4096, centro: [-60, -130, 6] };
const planos = [
  // ---------- ATO 0 — da planta ao lugar
  { id: 'planta', dur: 7, marcas: [4064, 4220, 4360, 4520, 4620, 4760, 4866].map(m => ({ p: pt('PD', m, 0, 0) })), cam: cam([add(C, [0, 0, H0]), add(C, [0, 0, H0 - 22])], [cima(-78), cima(-62)]), ease: [.15, .55], hora: 8.65, mes: MES, camadas: { ...ESC, ilus: false }, nevoa: .0006, exposicao: 1.0, sombra: AMPLA },
  { id: 'revela', dur: 11, cam: cam([add(C, [0, 0, H0 - 22]), [-170, -215, 175], [-245, -300, 95], [-262, -318, 78]], [cima(-62), [-115, -150, 0], [-70, -80, 0], [-58, -62, 0]]), ease: [.55, .35], hora: 8.65, mes: MES, camadas: { ...ESC }, nevoa: [.0006, .0009], nevoaCor: '#c9cdd0', exposicao: 1.0, tremor: .15, sombra: AMPLA },
  // ---------- ATO 1 — a avenida
  { id: 'avenida', dur: 6, cam: { eixo: 'PD', m: [4250, 4372], lado: -24, alt: 46, olhar: 100, ladoAlvo: -6, altAlvo: 0 }, ease: [0, 0], rolar: [-2.5, 2], tremor: .3, hora: 9.0, mes: MES, camadas: ESC, nevoa: .0012, nevoaCor: '#c9cdd0', exposicao: .93, sombra: AMPLA },
  { id: 'orbita', dur: 7, cam: { orbita: { centro: CRUZ, raio: [82, 66], alt: [47, 37], ang: [196, 242], alvoZ: 0 } }, ease: [0, .1], tremor: .2, hora: 9.2, mes: MES, camadas: ESC, nevoa: .0011, nevoaCor: '#c9cdd0', exposicao: .93, sombra: AMPLA,
    texto: { tipo: 'lugar', t: 'Cruzamento Hermógenes', s: 'PD 231+03 · PE 128+14', de: 1.2 } },
  { id: 'mergulho', dur: 9, cam: cam([pt('PD', 4462, -24, 38), pt('PD', 4512, -8, 17), pt('PD', 4548, 0, 5), pt('PD', 4575, 1.4, 1.4), pt('PD', 4604, 1.6, 1.35)],
    [pt('PD', 4590, 0, 0), pt('PD', 4610, 0.8, 0.5), pt('PD', 4628, 1.5, 1.0), pt('PD', 4650, 1.6, 1.2), pt('PD', 4675, 1.6, 1.25)]), ease: [.25, 0], hora: 9.4, mes: MES, camadas: ESC, nevoa: .0011, nevoaCor: '#c9cdd0', exposicao: .93,
    texto: { tipo: 'lugar', t: 'Na pista', s: 'PD — sentido crescente das estacas', de: 5.6 } },
  { id: 'esquina', dur: 5.5, cam: cam([[2.4, -13.6, 5.3], [0.9, -10.6, 5.25]], [[-5.6, 9.1, 4.1], [-6.4, 9.6, 3.9]]), ease: [0, .4], hora: 9.5, mes: MES, camadas: ESC, exposicao: .93,
    texto: { tipo: 'dado', t: 'Acessibilidade', s: '34 rampas · 440 m² de piso tátil', de: .6 } },
  { id: 'ciclovia', dur: 5.5, cam: { eixo: 'PD', m: [4652, 4694], lado: -6.5, alt: 1.55, olhar: 22, altAlvo: 1.25 }, ease: [0, 0], tremor: .03, hora: 9.6, mes: MES, camadas: ESC, exposicao: .93,
    texto: { tipo: 'dado', t: 'Ciclovia no canteiro central', s: '1.578 m² · do início ao fim do trecho', de: .5 } },
  { id: 'sinal', dur: 5.5, cam: cam([[0.5, 1.5, 82], [0.5, 1.5, 64]], [[0.5 + 2 * Math.sin(-.6), 1.5 + 2 * Math.cos(-.6), 3.6], [0.5 + 2 * Math.sin(-.25), 1.5 + 2 * Math.cos(-.25), 3.6], [0.5 + 2 * Math.sin(.1), 1.5 + 2 * Math.cos(.1), 3.6]]), ease: [.2, .3], hora: 9.7, mes: MES, camadas: ESC, exposicao: .93, sombra: AMPLA,
    texto: { tipo: 'dado', t: 'Sinalização', s: '1.347 m² de pintura · 62 grupos focais · 27 colunas semafóricas', de: .5 } },
  // ---------- ATO 2 — o que não se vê
  { id: 'raiox', dur: 9, marcas: [{ p: [-91.7, -78.4, 0.6] }], cam: cam([pt('PD', 4418, -2, 26), pt('PD', 4462, -6, 17), pt('PD', 4500, -8, 11.5)], [pt('PD', 4470, -15, -2.5), pt('PD', 4505, -15, -2.5), pt('PD', 4538, -17, -2.5)]), ease: [.3, .35], hora: 11, mes: MES, camadas: { ...ESC, pai: false, ilus: false }, exposicao: .88,
    opac: { v: [1, .14], t: [.1, .42] }, brilho: { mats: ['dren'], cor: '#3d9bff', k: { v: [0, 1.1], t: [.25, .55] } },
    texto: { tipo: 'raiox', t: 'Drenagem', s: '1.173 m de galerias · Ø 0,50 a 1,20 m · 16 poços de visita', de: 4.0 }, secao: 'O QUE NÃO SE VÊ' },
  { id: 'bueiro', dur: 6, cam: cam([[-101, -40.5, 6.2], [-90, -46.5, 3.8]], [[-74, -55, -.4], [-65, -58.5, .2]]), ease: [.2, .35], hora: 11.4, mes: MES, camadas: ESC, exposicao: .9,
    texto: { tipo: 'dado', t: 'Bueiro celular 5,00 × 2,00 m', s: '34,5 m sob a avenida · PD 226+18', de: .6 } },
  { id: 'camadas', dur: 7, fatia: { eixo: 'PD', m: { v: [4438, 4400], t: [0, .32] }, t0: -40, t1: 30, prof: 8 },
    marcas: [.06, .22, .395].map(dz => ({ p: pt('PD', 4399.9, -1.5, -dz) })),
    cam: cam([pt('PD', 4417, 9, 4.2), pt('PD', 4409, 3, 1.6), pt('PD', 4403.6, 0.2, 0.32)], [pt('PD', 4400, 1.5, -0.4), pt('PD', 4400, -0.5, -0.5), pt('PD', 4400, -1.6, -0.42)]),
    ease: [.25, .45], fov: { v: [45, 34], t: [.35, 1] }, hora: 12.2, mes: MES, camadas: ESC, exposicao: .9,
    texto: { tipo: 'camadas', t: 'Pavimento semirrígido', s: '15.852 m² · 47 cm de estrutura', de: .6 } },
  { id: 'muro', dur: 6, cam: cam([pt('PD', 4703, -1.2, 4.6), pt('PD', 4682, -1.6, 4.5)], [pt('PD', 4684, -8.6, 1.4), pt('PD', 4660, -8.6, 1.2)]), ease: [.15, .3], hora: 12.5, mes: MES, camadas: ESC, exposicao: .9,
    texto: { tipo: 'dado', t: 'Muro E', s: '135 m de contenção · PE 129+15 a 136+10', de: .6 } },
  // ---------- ATO 3 — a obra no tempo (SIMULAÇÃO: dito na tela)
  { id: 'volta', dur: 3.5, cam: cam([[-300, -506, 112], [-296, -502, 108]], [pt('PD', 4330, -5, 0), pt('PD', 4330, -5, 0)]), ease: [0, 0], hora: [16, 8.2], mes: MES, regenSol: 'sempre', camadas: ESC, nevoa: .0005, nevoaCor: '#c9cdd0', exposicao: .93, sombra: OBRA_SOMBRA,
    varredura: { eixo: 'PD', m: [M1, M0], grupos: VARRE, t: [.04, .96], ease: 'linear', brilho: .9, largura: 90, altura: 14 }, secao: 'A OBRA NO TEMPO' },
  // a câmera anda de lado com a frente de obra, ~70 m atrás dela: o trem de camadas passa embaixo
  { id: 'obra', dur: 15, cam: { eixo: 'PD', m: [4070, 4850], lado: -78, alt: 58, olhar: 28, ladoAlvo: 0, altAlvo: 0 }, ease: [.18, .18], tremor: .2, hora: [8.2, 16], mes: MES, regenSol: 'sempre', camadas: ESC, nevoa: .0005, nevoaCor: '#c9cdd0', exposicao: .93, sombra: OBRA_SOMBRA,
    varredura: { eixo: 'PD', m: [M0, M1], grupos: VARRE, t: [.03, .97], largura: 80, altura: 12 }, texto: { tipo: 'linha', de: 0 } },
  { id: 'rdo', dur: 6, cam: cam([pt('PD', 4420, -85, 85), pt('PD', 4468, -72, 68)], [pt('PD', 4560, -6, 0), pt('PD', 4585, -6, 0)]), ease: [.1, .45], hora: 16, mes: MES, camadas: { ...ESC, rdo: true }, nevoa: .0005, nevoaCor: '#c9cdd0', exposicao: .93, sombra: OBRA_SOMBRA,
    texto: { tipo: 'rdo', t: 'No app, cada estaca acende com o que o RDO lançou', de: .4 } },
  // ---------- ATO 4 — fecho dourado
  { id: 'dourado', dur: 7, cam: { eixo: 'PD', m: [4795, 4640], lado: -7, alt: 15, olhar: 75, ladoAlvo: -4, altAlvo: 2 }, ease: [0, 0], rolar: [1.5, -1.5], tremor: .25, hora: 16.6, mes: MES, camadas: ESC, nevoa: .0011, nevoaCor: '#d8c7b0', exposicao: 1.02, sombra: AMPLA },
  { id: 'fim', dur: 10, cam: cam([[-22, -38, 15], [-78, -128, 52], [-185, -280, 135]], [[2, 4, 3], [0, 0, 2], [20, 30, 0]]), ease: [.3, .2], hora: 16.75, mes: MES, camadas: ESC, nevoa: [.0008, .00095], nevoaCor: '#d8c7b0', exposicao: [1.05, 1.12], sombra: AMPLA,
    texto: { tipo: 'titulo-fim', de: 4.5 } },
];
// a dança da obra: lançamentos por data (dados ILUSTRATIVOS, gerados pelo app de verdade em faixas.json)
let FX = null; try { FX = JSON.parse(require('fs').readFileSync(require('path').join(process.env.VIDEO_TRABALHO || require('path').join(require('os').tmpdir(), 'video-modelo3d'), 'faixas.json'), 'utf8')); } catch (e) { }
module.exports = {
  roteiro: { planos },
  regenSol: 'fim',
  FX,
  porQuadro: FX ? new Function('a', 'const FX = ' + JSON.stringify(FX) + '; ' + `
    if (a.plano !== 'rdo') { if (window.__fxEnviado) { window.__fxEnviado = null; window.postMessage({ m3d: 1, tipo: 'execucao', faixas: [] }, location.origin); } return; }
    const k = Math.min(FX.datas.length - 1, Math.floor(Math.min(1, (a.u || 0) / .8) * (FX.datas.length - 1)));
    if (window.__fxEnviado === k) return; window.__fxEnviado = k;
    // a mensagem chega no próximo giro: monta já, com o mesmo caminho do app
    window.postMessage({ m3d: 1, tipo: 'execucao', faixas: FX.faixas[k] }, location.origin);
    return new Promise(r => setTimeout(r, 30));`) : null,
};
if (require.main === module) { let t = 0; for (const p of planos) { console.log(p.id.padEnd(10), t.toFixed(1).padStart(6), p.dur); t += p.dur; } console.log('total', t); }
