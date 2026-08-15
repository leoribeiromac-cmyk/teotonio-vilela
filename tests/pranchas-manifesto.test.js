// A prancha em pirâmide é servida por um MANIFESTO: `prancha.json` diz
// quantos níveis existem, o tamanho de cada um e — num bitmap — QUAIS
// quadrados existem de fato (papel em branco não vira arquivo).
//
// Se o bitmap e os arquivos saírem de sincronia, o estrago é silencioso: o
// visor pede um quadrado que não existe (404 no meio do desenho, no 4G do
// canteiro) ou deixa de pedir um que existe (buraco branco na prancha).
// Acontece sozinho quando alguém refatia com outra resolução e sobra o
// nível antigo na pasta.
//
// Roda em Node puro, sem navegador:  node tests/pranchas-manifesto.test.js
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// onde as pranchas são declaradas (`tiles: '...'`)
const cadastro = ['index.html'].concat(
  fs.readdirSync(path.join(RAIZ, 'dados')).filter(f => f.endsWith('.js')).map(f => 'dados/' + f)
).map(f => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');

function pastasComManifesto() {
  const out = [];
  const obras = path.join(RAIZ, 'projetos');
  fs.readdirSync(obras).forEach(obra => {
    const dir = path.join(obras, obra);
    if (!fs.statSync(dir).isDirectory()) return;
    fs.readdirSync(dir).forEach(nome => {
      const sub = path.join(dir, nome);
      if (fs.statSync(sub).isDirectory() && fs.existsSync(path.join(sub, 'prancha.json'))) {
        out.push('projetos/' + obra + '/' + nome);
      }
    });
  });
  return out;
}

const pastas = pastasComManifesto();
console.log('PRANCHAS FATIADAS (' + pastas.length + ')');
ok('há pelo menos uma prancha em pirâmide', pastas.length > 0);

pastas.forEach(rel => {
  console.log('\n' + rel);
  const dir = path.join(RAIZ, rel);
  let man = null;
  try { man = JSON.parse(fs.readFileSync(path.join(dir, 'prancha.json'), 'utf8')); } catch (e) { }
  if (!man) { ok('manifesto legível', false); return; }

  ok('o cadastro aponta para esta pasta', cadastro.indexOf(rel + '/') > -1, rel);
  ok('tem folha, tile e níveis', man.tile > 0 && man.larguraPt > 0 && man.alturaPt > 0 && man.niveis.length > 0);
  ok('o nível 0 cabe num quadrado só', man.niveis[0].cols === 1 && man.niveis[0].rows === 1);

  // cada nível tem o dobro da resolução do anterior
  const dobra = man.niveis.every((n, i) => i === 0 || Math.abs(n.res / man.niveis[i - 1].res - 2) < 0.001);
  ok('cada nível dobra a resolução do anterior', dobra, man.niveis.map(n => n.res).join(' '));

  let faltando = [], sobrando = [], marcados = 0;
  man.niveis.forEach((nv, i) => {
    const bits = Buffer.from(nv.mapa, 'base64');
    const tem = (l, c) => {
      const k = l * nv.cols + c;
      return !!(bits[k >> 3] & (0x80 >> (k & 7)));
    };
    const pasta = path.join(dir, String(i));
    const noDisco = new Set(fs.existsSync(pasta) ? fs.readdirSync(pasta) : []);
    for (let l = 0; l < nv.rows; l++) {
      for (let c = 0; c < nv.cols; c++) {
        const arq = l + '_' + c + '.webp';
        if (tem(l, c)) {
          marcados++;
          if (!noDisco.has(arq)) faltando.push(i + '/' + arq);
        } else if (noDisco.has(arq)) sobrando.push(i + '/' + arq);
        noDisco.delete(arq);
      }
    }
    // arquivo fora da grade do nível (sobra de um fatiamento anterior)
    noDisco.forEach(x => sobrando.push(i + '/' + x));
  });
  ok('todo quadrado marcado no bitmap existe no disco', faltando.length === 0, faltando.slice(0, 6).join(', '));
  ok('nenhum arquivo sobrando fora do bitmap', sobrando.length === 0, sobrando.slice(0, 6).join(', '));
  ok('não há pasta de nível além dos declarados',
    !fs.existsSync(path.join(dir, String(man.niveis.length))));
  console.log('    ' + marcados + ' quadrados · ' +
    (man.bytes ? (man.bytes / 1048576).toFixed(2) + ' MB' : 'tamanho não declarado'));
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
