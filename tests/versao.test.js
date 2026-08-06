// O service worker serve js/ e dados/ CACHE-PRIMEIRO, e o index.html vem
// REDE-PRIMEIRO. Sem `?v=` nas tags <script>, o aparelho abre o index novo
// com os módulos do dia anterior — foi o que fez correções mergeadas não
// aparecerem no celular de quem já usava o app.
//
// Este teste é a trava: se alguém subir o VERSAO do sw.js e esquecer as tags
// (ou o contrário), ele falha.  Roda com: node tests/versao.test.js
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

console.log('VERSÃO DO APP');

const m = sw.match(/const VERSAO = 'teotonio-v(\d+)'/);
ok('sw.js declara a versão no formato esperado', !!m, (sw.match(/const VERSAO = .*/) || [''])[0]);
const versaoSW = m ? m[1] : null;

// toda tag <script src="..."> local tem de carregar a versão
const tags = [...html.matchAll(/<script src="((?:js|dados)\/[^"]+)"/g)].map(x => x[1]);
ok('achou as tags de script locais', tags.length >= 5, tags.length + ' tags');

const semVersao = tags.filter(t => !/\?v=\d+$/.test(t));
ok('toda tag local traz ?v=', semVersao.length === 0, JSON.stringify(semVersao));

const versoes = [...new Set(tags.map(t => (t.match(/\?v=(\d+)$/) || [])[1]).filter(Boolean))];
ok('todas as tags usam a MESMA versão', versoes.length === 1, JSON.stringify(versoes));

ok('e essa versão é a do sw.js', versoes[0] === versaoSW,
  'tags=' + versoes[0] + '  sw.js=' + versaoSW);

// os arquivos referenciados existem de verdade
const faltando = tags.map(t => t.split('?')[0]).filter(f => !fs.existsSync(path.join(raiz, f)));
ok('todos os arquivos referenciados existem', faltando.length === 0, JSON.stringify(faltando));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
