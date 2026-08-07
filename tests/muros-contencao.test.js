// MUROS DE CONTENÇÃO — a conta tem de fechar com o contrato.
//
// Os pacotes P37A…P40 medem METRO DE MURO, e a matriz de coeficientes é que
// converte isso nos 20 itens do capítulo 10.0 da Planilha Geral. O risco de
// um arranjo assim é silencioso: um coeficiente digitado errado não quebra
// nada na tela — só faz a prévia de medição divergir da planilha, meses
// depois, na conferência da fiscalização.
//
// Este teste é a trava. Com os três muros a 100%, cada item contratual tem
// de cair EXATAMENTE na quantidade do aditamento. As quantidades abaixo
// foram lidas das memórias de cálculo dos itens 169 a 177-J.
//
// Roda com: node tests/muros-contencao.test.js
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

// ---------------------------------------------------------------- o cadastro
global.window = {};
require(path.join(raiz, 'dados', 'teotonio-muros.js'));
const C = (global.window.OBRAS_COMPLEMENTO || {})['teotonio'];

console.log('MUROS DE CONTENÇÃO — cadastro');
ok('o complemento da Teotônio existe', !!C);
ok('13 pacotes (3 muros × 4 etapas + a rampa)', C.pacotes.length === 13, C.pacotes.length);
ok('todos na frente "Muro de Contenção"',
  C.pacotes.every(p => p.frente === 'Muro de Contenção'));
ok('todo pacote tem ID, unidade, quantidade e produtividade',
  C.pacotes.every(p => p.id && p.un && p.qtd > 0 && p.produtividade > 0),
  JSON.stringify(C.pacotes.filter(p => !(p.id && p.un && p.qtd > 0 && p.produtividade > 0)).map(p => p.id)));
ok('nenhum ID repetido', new Set(C.pacotes.map(p => p.id)).size === C.pacotes.length);
ok('nenhum ID colide com os pacotes que já existem (P01–P36)',
  C.pacotes.every(p => !/^P(0\d|[12]\d|3[0-6])[A-C]?$/.test(p.id)),
  JSON.stringify(C.pacotes.map(p => p.id).filter(id => /^P(0\d|[12]\d|3[0-6])[A-C]?$/.test(id))));

const ids = new Set(C.pacotes.map(p => p.id));
ok('todo coeficiente aponta para um pacote que existe',
  C.coeficientes.every(k => ids.has(k.pid)),
  JSON.stringify([...new Set(C.coeficientes.filter(k => !ids.has(k.pid)).map(k => k.pid))]));
ok('todo pacote tem pelo menos um coeficiente',
  [...ids].every(id => C.coeficientes.some(k => k.pid === id)),
  JSON.stringify([...ids].filter(id => !C.coeficientes.some(k => k.pid === id))));
ok('todo coeficiente traz o nº do item da Planilha Geral',
  C.coeficientes.every(k => k.itemPlanilha && k.item && k.coef > 0));

// Um código SIURB só pode aparecer sob UM nº de item — se o mesmo código
// entrasse como 169-A num pacote e como 4 noutro, a prévia se partiria em
// duas linhas que ninguém saberia somar.
const porCodigo = {};
C.coeficientes.forEach(k => { (porCodigo[k.item] = porCodigo[k.item] || new Set()).add(k.itemPlanilha); });
ok('cada código SIURB usa sempre o mesmo nº de item',
  Object.values(porCodigo).every(s => s.size === 1),
  JSON.stringify(Object.entries(porCodigo).filter(([, s]) => s.size > 1).map(([c, s]) => c + '=' + [...s])));

// ------------------------------------------------- quantidades do aditamento
// Capítulo 10.0 — MURO DE ARRIMO, coluna "Aditamento" da Planilha Geral.
const CONTRATO = {
  '169':  ['04-01-00',  940.01],     '169-A': ['04-11-00',  2193.35],
  '170':  ['04-15-00',  3133.36],    '171':   ['04-60-00',  130490.07],
  '172':  ['05.09.007', 2193.352],   '173':   ['04-08-00',  1565.02],
  '174':  ['06-06-00',  54.32275],   '175':   ['02-03-01',  1227.355],
  '176':  ['07-10-00',  27902],      '177':   ['03-03-20',  311.78675],
  '177-A':['05-48-00',  49.63525],   '177-B': ['05-20-00',  234.56375],
  '177-C':['07-09-00',  7655],       '177-D': ['17-05-24',  27.85],
  '177-E':['17-05-25',  16.60],      '177-F': ['13-02-47',  1.70],
  '177-G':['07-19-00',  147],        '177-H': ['08-18-02',  266.59875],
  '177-I':['13.02.11',  27.225],     '177-J': ['04-31-00',  625.01],
};

console.log('\nCOM OS MUROS A 100%, CADA ITEM CAI NA QUANTIDADE DO CONTRATO');
const qtd = {};
C.pacotes.forEach(p => { qtd[p.id] = p.qtd; });
const derivado = {};
C.coeficientes.forEach(k => {
  derivado[k.itemPlanilha] = (derivado[k.itemPlanilha] || 0) + qtd[k.pid] * k.coef;
});

// 1e-4 relativo: a folga é do ARREDONDAMENTO DO PRÓPRIO CONTRATO (a memória
// do item 171 multiplica 2.193,35 já arredondado por 46,3 km), não do
// modelo. Erro de digitação em coeficiente é ordens de grandeza maior.
Object.keys(CONTRATO).forEach(it => {
  const [cod, esperado] = CONTRATO[it];
  const d = derivado[it] || 0;
  const rel = Math.abs(d - esperado) / Math.max(Math.abs(esperado), 1e-9);
  ok(`item ${it} (${cod}) → ${esperado}`, rel < 1e-4,
    `derivado ${d.toFixed(4)} · erro relativo ${rel.toExponential(2)}`);
});
ok('nenhum item derivado a mais do que os 20 do capítulo',
  Object.keys(derivado).every(it => CONTRATO[it]),
  JSON.stringify(Object.keys(derivado).filter(it => !CONTRATO[it])));

// -------------------------------------------------------- fiação no index.html
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
console.log('\nFIAÇÃO NO APP');
ok('o arquivo é carregado no <head>', html.includes('dados/teotonio-muros.js?v='));
ok('aplicarComplemento() existe', html.includes('function aplicarComplemento('));
ok('e é usada ao carregar o cadastro', /const compl = aplicarComplemento\(p, k\)/.test(html));
ok('ptNum() existe', html.includes('function ptNum('));
ok('o cadastro por arquivo passa a quantidade por ptNum()',
  html.includes("'Qtd Estimada': ptNum(") && html.includes("'Produtividade': ptNum(") &&
  html.includes("'Coef': ptNum("));
ok('a prévia de medição separa por nº de item',
  html.includes("getCSVField(c, 'Item Planilha')"));
ok('etapaAnteriorDe() existe', html.includes('function etapaAnteriorDe('));
ok('a frente tem cor própria', html.includes('.f-Muro{'));

// A produtividade está em DOIS lugares: no complemento (que é o que vale
// hoje) e no PRODUTIVIDADE_PADRAO (que é a rede de segurança para quando as
// linhas forem coladas na planilha, cuja aba Pacotes ainda não tem a coluna
// `Produtividade`). Se as duas divergirem, o peso do muro no avanço muda
// sozinho no dia em que alguém colar as linhas — sem nada na tela dizendo.
const bloco = (html.match(/const PRODUTIVIDADE_PADRAO = \{[\s\S]*?\n\};/) || [''])[0];
const padrao = {};
[...bloco.matchAll(/'(P\d+[A-Z]?)':\s*([\d.]+)/g)].forEach(m => { padrao[m[1]] = parseFloat(m[2]); });
ok('PRODUTIVIDADE_PADRAO tem os 13 pacotes de muro',
  C.pacotes.every(p => padrao[p.id] !== undefined),
  JSON.stringify(C.pacotes.map(p => p.id).filter(id => padrao[id] === undefined)));
ok('e com os MESMOS números do complemento',
  C.pacotes.every(p => padrao[p.id] === p.produtividade),
  JSON.stringify(C.pacotes.filter(p => padrao[p.id] !== p.produtividade)
    .map(p => `${p.id}: arquivo ${p.produtividade} × index ${padrao[p.id]}`)));

const icones = fs.readFileSync(path.join(raiz, 'js', 'ui', 'icones.js'), 'utf8');
ok('o ícone da frente existe', icones.includes('fMuroContencao:'));
ok('e icFrente() sabe escolhê-lo', /muro\|arrimo\|conten/.test(icones));

// ---------------------------------------- num() × ptNum(): a armadilha do ponto
// num() trata o ponto como separador de MILHAR (é o formato dos CSVs em
// pt-BR). Número JS entregue cru vira outro número: 42.25 → 4225. Se este
// teste falhar, TODA quantidade quebrada do cadastro por arquivo está 100×
// maior — e nada na tela denuncia.
console.log('\nNÚMERO JS → TEXTO → num() VOLTA IGUAL');
const fnNum = new Function('return ' + (html.match(/function num\(s\) \{[\s\S]*?\n\}/) || [])[0])();
const fnPt  = new Function('return ' + (html.match(/function ptNum\(v\) \{[\s\S]*?\n\}/) || [])[0])();
ok('num() e ptNum() foram extraídos', typeof fnNum === 'function' && typeof fnPt === 'function');
[42.25, 27.225, 3.5, 135, 0.187284, 366.628, 22.26, 1e-3].forEach(v => {
  ok(`ptNum(${v}) → num() → ${v}`, Math.abs(fnNum(fnPt(v)) - v) < 1e-12, fnPt(v) + ' → ' + fnNum(fnPt(v)));
});
ok('e o formato pt-BR da planilha continua sendo lido', fnNum('1.234,56') === 1234.56, fnNum('1.234,56'));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
