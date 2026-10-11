// O MODELO 3D QUE ESTÁ NO REPOSITÓRIO ABRE — sem navegador.
//
// O modelo entra no app pela ferramentas/modelo3d-importar.py, que grava os
// trechos num formato próprio (.bin "M3DP": milímetro em diferença, bytes
// embaralhados, gzip). Quem lê é o desempacotar() do js/modelo3d/visor.js.
// São dois lados que têm de bater — e quando não batem o estrago é mudo: o
// trecho abre torto (vértice no lugar errado, triângulo ligando pontos do
// outro lado da avenida) ou nem abre, no 4G do canteiro.
//
// Este teste roda o desempacotar() DE VERDADE (o texto da função, tirado do
// visor) sobre cada .bin e confere: índice dentro dos vértices, coordenada
// finita e dentro da caixa do modelo, todo arquivo listado no índice existe
// com o tamanho anotado, e os caminhos que o app e o service worker usam.
//
// Roda em Node puro:  node tests/modelo3d-manifesto.test.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const visor = fs.readFileSync(path.join(RAIZ, 'js/modelo3d/visor.js'), 'utf8');
const ini = visor.indexOf('function desempacotar(ab) {');
let fim = visor.indexOf('\n}\n', ini);
ok('o visor tem o desempacotar()', ini > 0 && fim > ini);
// eslint-disable-next-line no-new-func
const desempacotar = new Function(visor.slice(ini, fim + 2) + '\nreturn desempacotar;')();
const lerBin = f => { const b = zlib.gunzipSync(fs.readFileSync(f)); return desempacotar(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

// a obra que declara modelo (index.html → OBRAS_CFG.<obra>.modelo3d)
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const pastas = [...html.matchAll(/modelo3d:\s*\{\s*pasta:\s*'([^']+)'/g)].map(m => m[1]);
ok('alguma obra declara modelo3d.pasta', pastas.length > 0);

for (const pasta of pastas) {
  console.log('\n' + pasta);
  const dir = path.join(RAIZ, pasta);
  let M = null;
  try { M = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { }
  ok('index.json legível', !!M);
  if (!M) continue;
  ok('índice na versão 5 do pipeline', M.v === 5, M.v);
  ok('o índice traz o pacote (lista de arquivos)', !!(M.pacote && Array.isArray(M.pacote.arquivos) && M.pacote.arquivos.length));
  const faltam = [], tamanho = [];
  for (const a of (M.pacote && M.pacote.arquivos) || []) {
    const f = path.join(dir, a.f);
    if (!fs.existsSync(f)) faltam.push(a.f); else if (fs.statSync(f).size !== a.b) tamanho.push(a.f);
  }
  ok('todo arquivo listado existe', faltam.length === 0, JSON.stringify(faltam.slice(0, 5)));
  ok('e com o tamanho anotado (nada ficou de uma importação antiga)', tamanho.length === 0, JSON.stringify(tamanho.slice(0, 5)));
  const naPasta = [];
  (function andar(d, rel) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) andar(p, r); else naPasta.push(r); } })(dir, '');
  const listados = new Set(((M.pacote && M.pacote.arquivos) || []).map(a => a.f).concat(['index.json']));
  const sobra = naPasta.filter(f => !listados.has(f));
  ok('nenhum arquivo solto na pasta (o "Offline" não o guardaria)', sobra.length === 0, JSON.stringify(sobra.slice(0, 5)));
  ok('as texturas do modo Alta apontam para arquivos que existem',
     Object.values((M.pacote && M.pacote.tex) || {}).every(t => fs.existsSync(path.join(dir, t))));
  ok('as imagens da galeria existem', (M.renders || []).every(r => fs.existsSync(path.join(dir, r.f)) && (!r.th || fs.existsSync(path.join(dir, r.th)))));

  const E = M.extent, folga = 60;
  for (const t of M.tiles || []) {
    let T = null, erro = '';
    try { T = lerBin(path.join(dir, t.file)); } catch (e) { erro = e.message; }
    if (!T) { ok(t.id + ' desempacota', false, erro); continue; }
    const problemas = [];
    const malha = (nome, S, indexado = true) => {
      if (!S || !S.p) return;
      if (!(S.p instanceof Float32Array)) { problemas.push(nome + ': p não é Float32Array'); return; }
      const nv = S.p.length / 3;
      for (let i = 0; i < S.p.length; i += 3) {
        const x = S.p[i], y = S.p[i + 1], z = S.p[i + 2];
        if (!(x >= E.xmin - folga && x <= E.xmax + folga && y >= E.ymin - folga && y <= E.ymax + folga && z >= E.zmin - folga && z <= E.zmax + folga)) {
          problemas.push(nome + ': vértice fora da caixa do modelo ' + [x, y, z].map(v => v.toFixed(2))); break;
        }
      }
      if (S.i) {
        if (!(S.i instanceof Uint32Array)) problemas.push(nome + ': i não é Uint32Array');
        else if (S.i.length % 3) problemas.push(nome + ': índice não fecha triângulo');
        else for (let k = 0; k < S.i.length; k++) if (S.i[k] >= nv) { problemas.push(nome + ': índice ' + S.i[k] + ' ≥ ' + nv + ' vértices'); break; }
      } else if (indexado && nv % 3) problemas.push(nome + ': malha sem índice com vértices soltos');
      if (S.uv && S.uv.length / 2 !== nv) problemas.push(nome + ': uv não acompanha os vértices');
      if (S.x && S.x.length !== nv) problemas.push(nome + ': marca de extrapolado não acompanha os vértices');
    };
    for (const [k, S] of Object.entries(T.surf || {})) malha('surf/' + k, S);
    malha('terr', T.terr);
    for (const [k, S] of Object.entries(T.skirt || {})) malha('skirt/' + k, S);
    (T.mesh || []).forEach((S, i) => malha('mesh[' + i + ']/' + S.m, S));
    for (const [k, S] of Object.entries(T.tat || {})) malha('tat/' + k, S);
    for (const [k, S] of Object.entries(T.paint || {})) malha('paint/' + k, S);
    ok(t.id + ' desempacota inteiro e coerente', problemas.length === 0, problemas.slice(0, 3).join(' | '));
  }
  if (fs.existsSync(path.join(dir, 'entorno.bin'))) {
    let En = null, erro = '';
    try { En = lerBin(path.join(dir, 'entorno.bin')); } catch (e) { erro = e.message; }
    ok('entorno.bin desempacota', !!(En && En.terr && En.terr.p instanceof Float32Array && En.arv instanceof Float32Array), erro);
  }
}

console.log('\nCAMINHOS');
const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
const versaoSW = (sw.match(/const VERSAO = 'teotonio-v(\d+)'/) || [])[1];
const pag = fs.readFileSync(path.join(RAIZ, 'modelo3d.html'), 'utf8');
const vVisor = (pag.match(/src="js\/modelo3d\/visor\.js\?v=(\d+)"/) || [])[1];
ok('o visor no modelo3d.html leva a versão do app (?v= do sw.js)', vVisor === versaoSW, 'visor=' + vVisor + ' sw=' + versaoSW);
ok('o sw.js tem balde próprio para o modelo', /VERSAO_MODELO3D/.test(sw) && /\/modelo3d\//.test(sw));
const mapa = JSON.parse((pag.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1] || '{}');
const imp = (mapa.imports || {});
ok('o import map aponta para o vendor/ (nada de CDN)', Object.values(imp).every(u => /^\.\/vendor\/three\//.test(u)), JSON.stringify(imp));
ok('three.js está no vendor', fs.existsSync(path.join(RAIZ, 'vendor/three/three.module.min.js')));
ok('ez-tree está no vendor', fs.existsSync(path.join(RAIZ, 'vendor/three/ez-tree/ez-tree.es.js')));
// todo complemento importado pelo visor (e pelos complementos) existe
const addons = [...visor.matchAll(/from 'three\/addons\/([^']+)'/g)].map(m => m[1]);
const faltaAddon = addons.filter(a => !fs.existsSync(path.join(RAIZ, 'vendor/three/addons', a)));
ok('os complementos que o visor importa estão no vendor', addons.length > 5 && faltaAddon.length === 0, JSON.stringify(faltaAddon));
// e a lista que o botão "Offline" guarda é a que existe
const tela = fs.readFileSync(path.join(RAIZ, 'js/modelo3d/tela.js'), 'utf8');
const lista = [...((tela.match(/var M3D_VENDOR = \[([\s\S]*?)\];/) || [])[1] || '').matchAll(/'([^']+)'/g)].map(m => m[1]);
const noDisco = [];
(function andar(d, rel) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n), r = rel + '/' + n; if (fs.statSync(p).isDirectory()) andar(p, r); else if (/\.js$/.test(n)) noDisco.push(r); } })(path.join(RAIZ, 'vendor/three/addons'), 'vendor/three/addons');
noDisco.push('vendor/three/three.module.min.js');
ok('o "Offline" guarda todos os .js do three que existem', noDisco.every(f => lista.includes(f)), JSON.stringify(noDisco.filter(f => !lista.includes(f))));
ok('e nenhum que não existe', lista.every(f => fs.existsSync(path.join(RAIZ, f))), JSON.stringify(lista.filter(f => !fs.existsSync(path.join(RAIZ, f)))));

console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
