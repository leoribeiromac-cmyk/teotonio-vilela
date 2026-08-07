// O cabeçalho do RDO (objeto, local, prazo, responsáveis, fiscalização) é do
// CONTRATO. Ficava escrito no código, e por isso o RDO de qualquer obra saía
// com o objeto da Teotônio — num documento que a fiscalização assina, isso é
// erro grave. Agora vem do cadastro da obra.
//
// Este teste é a trava: falha se algum desses textos voltar para dentro dos
// geradores de PDF ou de Excel.
//
// Roda com: node tests/rdo-cabecalho.test.js
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

// O bloco de cadastro da obra é onde estes textos PODEM estar; os geradores
// ficam do `rdoInfo()` para baixo.
const iHelper = html.indexOf('function rdoInfo()');
const geradores = html.slice(iHelper);

console.log('CABEÇALHO DO RDO — nada do contrato dentro dos geradores');

ok('rdoInfo() existe', iHelper > -1);

const literais = [
  ['objeto do contrato', 'CONTRATAÇÃO DE EMPRESA OU CONSÓRCIO'],
  ['local da obra', 'Av. Sen. Teotônio Vilela ('],
  ['data de início', 'Início: 09/05/2024'],
  ['responsáveis técnicos', 'Roberto V. França'],
  ['órgão fiscalizador', 'SP OBRAS'],
  ['rodapé do PDF', 'Av. Senador Teotônio Vilela, São Paulo'],
  ['nome da contratada', "'Gestor Engenharia  |"],
  ['contratada na assinatura', 'ENGENHEIRO GESTOR ENGENHARIA'],
];
literais.forEach(([rotulo, txt]) => {
  const i = geradores.indexOf(txt);
  ok('sem ' + rotulo + ' escrito no gerador', i === -1,
     i === -1 ? undefined : 'aparece em index.html perto de "' + geradores.slice(i, i + 60) + '"');
});

// E o prazo não pode voltar como número mágico.
ok('prazo não é literal no gerador', !/tx\('669'|'PRAZO \(dias\)', '669'/.test(geradores));

// O cadastro da Teotônio continua declarando tudo — senão o RDO dela sai vazio.
const cadastro = html.slice(0, iHelper);
['objeto:', 'local:', 'inicio:', 'prazoDias:', 'responsaveis:', 'fiscalizacao:', 'rodape:']
  .forEach(campo => ok('cadastro da obra declara ' + campo, cadastro.includes(campo)));

// O carimbo da foto também não pode fixar o nome de uma obra.
ok('carimbo não fixa o nome da obra',
   !/CARIMBO_PADRAO[\s\S]{0,400}obra: 'Av\./.test(html));

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
