// A ESCALA NÃO PODE VOLTAR A SE DESFAZER.
//
// O app tinha 31 tamanhos de fonte diferentes (9; 9,5; 10; 10,5; 11; 11,5;
// 12; 12,5; 13; 13,5; 14; 14,5; 15…) e 25 valores de espaçamento — quase
// todos os inteiros de 1 a 18. Meio pixel de diferença não é decisão de
// design: é o que sobra de escolher no olho, tela por tela, ao longo do
// tempo. O mesmo rótulo saía 11px numa tela e 11,5px na vizinha, e ninguém
// conseguia dizer qual era o certo.
//
// A escala foi congelada em tokens (--fs-* e --sp-*). Este teste é a trava:
// ele não conserta nada, só impede que a contagem volte a subir. Se você
// PRECISA de um degrau novo, acrescente o token e suba o limite aqui, de
// propósito — que é diferente de deixar entrar um 11,5px sem ninguém ver.
//
// Como rodar:  node tests/escala-visual.test.js
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

// o <style> grande (o segundo do arquivo) é onde vive o sistema visual
const iniCSS = html.indexOf('<style>', 3000);
const css = html.slice(iniCSS, html.indexOf('</style>', iniCSS));

console.log('ESCALA VISUAL');

// ---------------------------------------------------------------- tokens
const TOKENS_FS = ['--fs-2xs', '--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-3xl'];
const TOKENS_SP = ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6',
                   '--sp-7', '--sp-8', '--sp-9', '--sp-10', '--sp-11', '--sp-12'];

const faltando = TOKENS_FS.concat(TOKENS_SP).filter(t => !new RegExp(t + ':\\s*[0-9]').test(css));
ok('todos os tokens da escala estão definidos', faltando.length === 0, faltando.join(' '));

// Os tokens têm de morar no :root NU. Definidos só dentro de @media ou de
// [data-theme], eles não valem no estado sem marcação — que é o padrão de
// quem nunca tocou no seletor de tema — e o texto sairia no tamanho herdado.
const rootNu = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
const foraDoRoot = TOKENS_FS.filter(t => rootNu.indexOf(t + ':') === -1);
ok('a escala de fonte está no :root base, não atrás de @media', foraDoRoot.length === 0, foraDoRoot.join(' '));

// ---------------------------------------------------------------- fontes
// Fora da escala só ficam os tamanhos de DISPLAY (26px para cima): número
// grande de painel, escolhido um a um.
const fontesPx = [...html.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m => parseFloat(m[1]));
const abaixoDoDisplay = [...new Set(fontesPx.filter(v => v < 26))].sort((a, b) => a - b);
ok('nenhum tamanho de fonte cru abaixo de 26px (display) escapou dos tokens',
   abaixoDoDisplay.length === 0, abaixoDoDisplay.join('px ') + 'px');

const meioPixel = [...new Set(fontesPx.filter(v => v % 1 !== 0))];
ok('nenhum tamanho de fonte com meio pixel', meioPixel.length === 0, meioPixel.join(' '));

const distintasDisplay = new Set(fontesPx.filter(v => v >= 26));
ok('os tamanhos de display continuam poucos (≤ 10)', distintasDisplay.size <= 10,
   [...distintasDisplay].sort((a, b) => a - b).join(' '));

// ---------------------------------------------------------------- espaço
const esp = [...css.matchAll(/\b(?:gap|padding|margin)(?:-top|-bottom|-left|-right)?:\s*([0-9]+)px\s*[;}]/g)]
  .map(m => parseInt(m[1], 10));
const distintos = [...new Set(esp)].sort((a, b) => a - b);
const LIMITE_ESP = 16;
ok(`o espaçamento não passa de ${LIMITE_ESP} valores distintos`,
   distintos.length <= LIMITE_ESP, distintos.length + ': ' + distintos.join(' '));

// Os ímpares soltos até 18 eram o grosso do ruído — nenhum deve voltar.
const imparesSoltos = distintos.filter(v => v < 19 && v % 2 !== 0);
ok('nenhum espaçamento ímpar solto abaixo de 19px', imparesSoltos.length === 0, imparesSoltos.join(' '));

// ---------------------------------------------------------------- emoji
// O CLAUDE.md pede ícone em traço (ic('nome')), não emoji, na interface.
// A varredura ignora o que está em comentário e os poucos emoji que vão em
// texto de confirm()/toast, que não são interface desenhada.
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const emojiNoCSS = semComentarios.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2139}]/gu) || [];
ok('nenhum emoji no CSS da interface', emojiNoCSS.length === 0, emojiNoCSS.join(' '));

console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
