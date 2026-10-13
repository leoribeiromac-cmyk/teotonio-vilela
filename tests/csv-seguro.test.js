// O CSV QUE O ESCRITÓRIO ABRE NO EXCEL NÃO RODA FÓRMULA DE NINGUÉM.
//
// Célula de texto que começa com = + - @ é FÓRMULA para o Excel. Observação,
// nome de equipe, estaca e o fornecedor lido pela IA são texto de fora: um
// "=HYPERLINK(...)" digitado no canteiro rodaria no computador do escritório.
// A célula ganha um apóstrofo na frente — e número negativo continua número.
//
// E a chave de acesso da nota (44 dígitos) sai como ="…": aberta crua no
// Excel ela virava 3,51E+43, e os últimos dígitos se perdiam.
//
// Os dois corpos são lidos dos arquivos de verdade (index.html e notas.js).
// Roda sem dependência externa:  node tests/csv-seguro.test.js
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

function funcao(arquivo, nome) {
  const txt = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const i = txt.indexOf('function ' + nome + '(');
  if (i === -1) throw new Error(nome + ' não está em ' + arquivo);
  let prof = 0, j = txt.indexOf('{', i);
  for (; j < txt.length; j++) {
    if (txt[j] === '{') prof++;
    else if (txt[j] === '}' && --prof === 0) break;
  }
  return new Function(txt.slice(i, j + 1) + '\nreturn ' + nome + ';')();
}

const csvCel = funcao('index.html', 'csvCel');
const nfCSVcel = funcao('js/nf/notas.js', 'nfCSVcel');

console.log('\nCSV SEGURO\n');
console.log('index.html — csvCel (Histórico, Medição, Dias Improdutivos, Teórico × Real)');
ok('fórmula vira texto', csvCel('=HYPERLINK("http://x","clique")') === '"\'=HYPERLINK(""http://x"",""clique"")"', csvCel('=HYPERLINK("http://x","clique")'));
['+1+1', '@SUM(A1)', '-2+3', '\t=1'].forEach(v => ok(`"${v.replace('\t', '\\t')}" ganha o apóstrofo`, csvCel(v).charAt(1) === "'", csvCel(v)));
ok('número negativo continua número', csvCel('-12,50') === '"-12,50"', csvCel('-12,50'));
ok('número com milhar continua número', csvCel('-1.234,5') === '"-1.234,5"', csvCel('-1.234,5'));
ok('texto comum não muda', csvCel('Pavimentação · E212') === '"Pavimentação · E212"');
ok('aspas dobradas como manda o CSV', csvCel('caixa "A"') === '"caixa ""A"""');
ok('vazio e nulo viram célula vazia', csvCel('') === '""' && csvCel(null) === '""' && csvCel(undefined) === '""');
ok('número de verdade vira texto do número', csvCel(12.5) === '"12.5"');

console.log('\njs/nf/notas.js — nfCSVcel (Notas, Estoque, Preços, Consultas)');
const chave = '35260912345678000190550010000012341000012345';
ok('a chave de acesso sai como ="…" (o Excel não a vira número)', nfCSVcel({ texto: chave }) === '="' + chave + '"', nfCSVcel({ texto: chave }));
ok('fornecedor com "=" na frente ganha o apóstrofo', nfCSVcel('=cmd|calc') === "'=cmd|calc");
ok('valor negativo continua número', nfCSVcel('-3,20') === '-3,20');
ok('texto comum não muda', nfCSVcel('AREIA MÉDIA') === 'AREIA MÉDIA');

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
