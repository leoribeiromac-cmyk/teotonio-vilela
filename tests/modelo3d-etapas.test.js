// A ETAPA DA PISTA SAI DO NOME DO PACOTE — sem navegador.
//
// Na tela Modelo 3D, a cor "Etapa" diz até onde a pista chegou em cada
// estaca: demolição → terraplenagem → drenagem e redes → guias e sarjetas →
// sub-base → base → imprimação → binder → capa/placa → sinalização. O
// cadastro de pacotes não tem coluna de etapa: quem diz é o NOME do pacote
// (m3dEtapaDe, em js/modelo3d/tela.js), e na falta dele, a frente.
//
// O estrago de errar aqui é mudo: um "Muro D — 2. Sapata (base)" lido como
// BASE pintaria a pista da E212 como pronta para o binder. Este teste roda a
// função de verdade (o tela.js inteiro, num contexto sem navegador) sobre os
// nomes REAIS dos pacotes da Teotônio — os da planilha e os do complemento
// dos muros (dados/teotonio-muros.js).
//
// Roda em Node puro:  node tests/modelo3d-etapas.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const ctx = { console };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/modelo3d/tela.js'), 'utf8'), ctx, { filename: 'tela.js' });
const etapa = (nome, frente) => { const i = ctx.m3dEtapaDe(nome, frente || ''); return i < 0 ? 'fora' : ctx.M3D_ETAPAS[i].id; };

console.log('A ESCADA');
ok('as dez etapas, na ordem em que a pista é feita',
   ctx.M3D_ETAPAS.map(e => e.id).join(' ') === 'demolicao terra redes guias subbase base imprimacao binder capa sinal',
   ctx.M3D_ETAPAS.map(e => e.id).join(' '));
ok('cada etapa tem a sua cor', new Set(ctx.M3D_ETAPAS.map(e => e.cor)).size === ctx.M3D_ETAPAS.length);

console.log('\nOS PACOTES DA TEOTÔNIO');
// [nome do pacote, frente, etapa esperada]
const REAIS = [
  ['Tubo Ø500mm', 'Drenagem', 'redes'], ['Tubo Ø1200mm', 'Drenagem', 'redes'],
  ['Boca de Lobo Dupla', 'Drenagem', 'redes'], ['Boca de Lobo Tripla', 'Drenagem', 'redes'],
  ['PV Tipo 2 (1,6×1,6×1,6)', 'Drenagem', 'redes'],
  ['Bacia de Captação', 'Drenagem', 'redes'], ['Bacia de Dissipação', 'Drenagem', 'redes'],
  ['Galeria', 'Drenagem', 'redes'],
  ['Demolição de sarjeta', 'Demolição', 'demolicao'], ['Demolição de passeio', 'Demolição', 'demolicao'],
  ['Demolição de piso rígido (paradas)', 'Demolição', 'demolicao'],
  ['Demolição de pavimento asfáltico', 'Demolição', 'demolicao'],
  ['Guia PMSP 100 - via nova', 'Via', 'guias'], ['Guia PMSP 100 - reposição', 'Via', 'guias'],
  ['Superguia SPTrans', 'Via', 'guias'], ['Sarjeta', 'Via', 'guias'], ['Sarjetão', 'Via', 'guias'],
  ['Passeio cimentado', 'Via', 'fora'], ['Piso podotátil', 'Via', 'fora'],
  ['Vala técnica + dutos', 'Vala Técnica', 'redes'],
  ['Caixa subterrânea R1', 'Vala Técnica', 'redes'], ['Caixa subterrânea R2', 'Vala Técnica', 'redes'],
  ['Rachão', 'Pav. Flexível', 'subbase'], ['BGS', 'Pav. Flexível', 'subbase'],
  ['BGTC', 'Pav. Flexível', 'base'], ['Binder asfáltico', 'Pav. Flexível', 'binder'],
  ['SMA - Capa de rolamento', 'Pav. Flexível', 'capa'],
  ['Pav. rígido: Preparo + Bases', 'Pav. Rígido', 'base'],
  ['Pav. rígido: Lona + Imprimações', 'Pav. Rígido', 'imprimacao'],
  ['Pav. rígido: Placa armada', 'Pav. Rígido', 'capa'],
  ['Pintura horizontal', 'Sinalização', 'sinal'], ['Tachas/Tachões', 'Sinalização', 'sinal'],
  ['Sinalização vertical', 'Sinalização', 'sinal'],
  ['Demolição de muros', 'Desapropriações', 'fora'],
  ['Reconstrução de muros de divisa', 'Desapropriações', 'fora'],
];
// o complemento dos muros, lido do arquivo (é o que o app acrescenta à planilha)
const comp = { window: {} };
vm.createContext(comp);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'dados/teotonio-muros.js'), 'utf8'), comp);
const muros = ((comp.window.OBRAS_COMPLEMENTO || {}).teotonio || {}).pacotes || [];
ok('o complemento dos muros foi lido', muros.length >= 10, muros.length);
for (const p of muros) REAIS.push([p.pacote, p.frente, 'fora']);

const erradas = REAIS.filter(([n, f, e]) => etapa(n, f) !== e).map(([n, f, e]) => `${n} → ${etapa(n, f)} (esperado ${e})`);
ok(`os ${REAIS.length} pacotes caem na etapa certa`, erradas.length === 0, erradas.join(' | '));
ok('"Muro D — 2. Sapata (base)" é muro, não base da pista', etapa('Muro D — 2. Sapata (base)', 'Muro de Contenção') === 'fora');
ok('"Muros B e C — 1. Escavação e fundação" é muro, não terraplenagem', etapa('Muros B e C — 1. Escavação e fundação', 'Muro de Contenção') === 'fora');
ok('"Demolição de muros" é desapropriação, não demolição da pista', etapa('Demolição de muros', 'Desapropriações') === 'fora');
ok('"Pintura horizontal" é sinalização, não imprimação', etapa('Pintura horizontal', '') === 'sinal');

console.log('\nSEM NOME QUE DIGA, VALE A FRENTE');
ok('pacote de nome genérico na frente Drenagem', etapa('Serviço 1', 'Drenagem') === 'redes');
ok('…na frente Terraplanagem (com "a")', etapa('Serviço 2', 'Terraplanagem') === 'terra');
ok('…na frente Terraplenagem (com "e")', etapa('Serviço 2', 'Terraplenagem') === 'terra');
ok('…na frente Sinalização', etapa('Serviço 3', 'Sinalização') === 'sinal');
ok('frente que não diz etapa ("Pav. Flexível") fica fora da escada', etapa('Serviço 4', 'Pav. Flexível') === 'fora');
ok('o nome manda sobre a frente', etapa('BGTC', 'Drenagem') === 'base');
ok('sem nome e sem frente: fora', etapa('', '') === 'fora');
ok('caixa e acento não importam', etapa('BINDER ASFALTICO', '') === 'binder' && etapa('rachao', '') === 'subbase');

console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
