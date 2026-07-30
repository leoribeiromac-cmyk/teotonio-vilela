/* ============================================================
   ÍCONES DO GESTOR — conjunto próprio, desenhado para o app
   ------------------------------------------------------------
   Por que não emoji: cada aparelho desenha do seu jeito (o 🚜 do
   Android não é o do iPhone nem o do Windows), o tamanho varia, a
   cor é fixa e o resultado é genérico. Aqui é um traço só, mesma
   grade de 24, mesma espessura, e a cor vem do CSS (currentColor),
   então o ícone acompanha o tema claro/escuro sozinho.

   Uso:  ic('nota')            → <svg> de 1em, alinhado ao texto
         ic('nota', 20)        → 20px
         ic('nota', 0, 'cls')  → com classe extra

   Regras do desenho: viewBox 24×24, fill none, stroke currentColor,
   largura 1.7, pontas e junções arredondadas. Detalhe sólido só
   quando o traço não resolve (ponto do "!" no alerta, por exemplo).
   ============================================================ */
'use strict';

var ICONES = {

  /* ---------- navegação ---------- */
  // painel executivo: blocos de um quadro de indicadores
  painel: '<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="1.6"/><rect x="13.4" y="3.2" width="7.4" height="4.2" rx="1.6"/><rect x="13.4" y="10.2" width="7.4" height="10.6" rx="1.6"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="1.6"/>',
  // serviços: lista conferida
  servicos: '<path d="M9.6 6.2h10.8M9.6 12h10.8M9.6 17.8h10.8"/><path d="M3.6 6.2l1.4 1.4 2.4-2.6"/><path d="M3.6 12l1.4 1.4 2.4-2.6"/><path d="M3.6 17.8l1.4 1.4 2.4-2.6"/>',
  // medição física: escala graduada
  medicao: '<rect x="2.6" y="8.2" width="18.8" height="7.6" rx="1.8"/><path d="M6.6 8.2v3.2M10.2 8.2v4.6M13.8 8.2v3.2M17.4 8.2v4.6"/>',
  // apoio à medição: planilha contratual com item conferido
  contrato: '<path d="M6 3.4h9.2L19.4 7.6v13H6z" /><path d="M14.8 3.6v4.2h4.4"/><path d="M8.8 12.4h7.2M8.8 16h4.6"/>',
  // analista IA: faísca de análise sobre a leitura dos dados
  ia: '<path d="M12 3.4l1.5 3.9 3.9 1.5-3.9 1.5-1.5 3.9-1.5-3.9-3.9-1.5 3.9-1.5z"/><path d="M18.4 14.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/><path d="M4.6 16.4v4M8.2 13.8v6.6"/>',
  // lançar serviço: alvo com mais
  lancar: '<circle cx="12" cy="12" r="8.3"/><path d="M12 8.1v7.8M8.1 12h7.8"/>',
  // diário de obra: prancheta
  diario: '<path d="M9.2 4.6H7.4a2 2 0 0 0-2 2v11.8a2 2 0 0 0 2 2h9.2a2 2 0 0 0 2-2V6.6a2 2 0 0 0-2-2h-1.8"/><rect x="9.2" y="2.9" width="5.6" height="3.4" rx="1.3"/><path d="M8.8 11.4h6.4M8.8 15.2h4.2"/>',
  // equipamentos: escavadeira
  equipamentos: '<path d="M2.8 19.8h18.4"/><rect x="3.4" y="13.6" width="7.4" height="4.4" rx="1.4"/><path d="M10.8 14.2V9.8h3.4"/><path d="M14.2 9.8 19.6 5.6"/><path d="M14.6 18v-2.2a1.6 1.6 0 0 1 1.6-1.6h4.2L19.8 18z"/>',
  // histórico: relógio que volta no tempo
  historico: '<path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1"/><path d="M3.3 4.6v4.3h4.3"/><path d="M12 7.9V12l3.1 1.9"/>',
  // notas fiscais: cupom com o recorte serrilhado
  notas: '<path d="M6.2 3.4h11.6v17.2l-2.3-1.6-2.3 1.6-2.4-1.6-2.3 1.6-2.3-1.6z"/><path d="M9.2 8.4h5.6M9.2 12.2h5.6"/>',
  // galeria: fotografia
  galeria: '<rect x="3.2" y="4.8" width="17.6" height="14.4" rx="2.2"/><circle cx="8.6" cy="9.8" r="1.7"/><path d="M3.6 16.8l4.6-4.4 3.4 3.2 3.6-3.6 5.2 5"/>',
  // projetos: compasso de desenho
  projetos: '<path d="M3.2 6.4a2.6 2.6 0 0 1 2.6-2.6h12.4a2.6 2.6 0 0 1 2.6 2.6v11.2a2.6 2.6 0 0 1-2.6 2.6H5.8a2.6 2.6 0 0 1-2.6-2.6z"/><path d="M3.2 8.6h17.6M8 8.6v11.6M3.2 14.4H8"/><path d="M11 12.2h6.4M11 16.2h4"/>',
  // suprimentos / estoque: caixa
  caixa: '<path d="M3.6 8.2 12 4l8.4 4.2v7.6L12 20l-8.4-4.2z"/><path d="M3.6 8.2 12 12.4l8.4-4.2M12 12.4V20"/>',
  // preco: etiqueta com o furo
  dinheiro: '<path d="M12.6 3.4H19a1.6 1.6 0 0 1 1.6 1.6v6.4a1.6 1.6 0 0 1-.47 1.13l-7.4 7.4a1.6 1.6 0 0 1-2.26 0l-6.4-6.4a1.6 1.6 0 0 1 0-2.26l7.4-7.4A1.6 1.6 0 0 1 12.6 3.4z"/><circle cx="16.6" cy="7.4" r="1.5"/>',
  // saida de material: caixa com a seta para fora
  saida: '<path d="M2.8 10.6 10 7l7.2 3.6v6.6L10 20.8l-7.2-3.6z"/><path d="M2.8 10.6 10 14.2l7.2-3.6M10 14.2v6.6"/><path d="M15.6 8.4 21.2 2.8M21.2 2.8h-3.9M21.2 2.8v3.9"/>',

  /* ---------- ações ---------- */
  baixar: '<path d="M12 3.6v11.2"/><path d="M7.9 10.9 12 15l4.1-4.1"/><path d="M4.6 19.4h14.8"/>',
  imprimir: '<path d="M7.2 8.6V4.4h9.6v4.2"/><path d="M7.2 15.4H5.4a1.9 1.9 0 0 1-1.9-1.9v-3.1a1.9 1.9 0 0 1 1.9-1.9h13.2a1.9 1.9 0 0 1 1.9 1.9v3.1a1.9 1.9 0 0 1-1.9 1.9h-1.8"/><path d="M7.2 13.6h9.6v6H7.2z"/>',
  arquivo: '<path d="M13.6 3.4H7.8a2 2 0 0 0-2 2v13.2a2 2 0 0 0 2 2h8.4a2 2 0 0 0 2-2V8.2z"/><path d="M13.6 3.4v4.8h4.6"/><path d="M9 13h6M9 16.4h4"/>',
  planilha: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2"/><path d="M3.4 9.6h17.2M3.4 14.4h17.2M9.2 4.6v14.8M14.8 4.6v14.8"/>',
  editar: '<path d="M4.6 19.4 5.5 15.9 15.7 5.8a1.9 1.9 0 0 1 2.7 0l1.4 1.4a1.9 1.9 0 0 1 0 2.7L9.5 20.1z"/><path d="M14.4 7.1l3.1 3.1"/>',
  fechar: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
  lupa: '<circle cx="10.9" cy="10.9" r="6.7"/><path d="M15.7 15.7l4.5 4.5"/>',
  vinculo: '<path d="M10.2 13.6a4.1 4.1 0 0 0 5.8 0l2.4-2.4a4.1 4.1 0 1 0-5.8-5.8l-1.2 1.2"/><path d="M13.8 10.4a4.1 4.1 0 0 0-5.8 0l-2.4 2.4a4.1 4.1 0 1 0 5.8 5.8l1.2-1.2"/>',
  relogio: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 1.9"/>',
  ajustes: '<path d="M4.6 6.6h14.8M4.6 12h14.8M4.6 17.4h14.8"/><circle cx="9.2" cy="6.6" r="2.1"/><circle cx="15.2" cy="12" r="2.1"/><circle cx="8.2" cy="17.4" r="2.1"/>',
  play: '<path d="M8.4 5.4 19 12 8.4 18.6z"/>',
  pausa: '<path d="M9.2 5.6v12.8M14.8 5.6v12.8"/>',
  camera: '<path d="M3.4 8.8a2 2 0 0 1 2-2h2.2l1.3-2.2h6.2l1.3 2.2h2.2a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.8" r="3.6"/>',
  pasta: '<path d="M3.4 7.2a2 2 0 0 1 2-2h3.7l2 2.4h7.5a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/>',
  grafico: '<path d="M3.8 20.2h16.4"/><path d="M7.4 20.2v-6.6M12 20.2V6.4M16.6 20.2v-9.6"/>',
  nuvem: '<path d="M7.6 18.6a4.3 4.3 0 0 1-.5-8.5 5.5 5.5 0 0 1 10.5-1.1 3.9 3.9 0 0 1-.7 7.8z"/>',
  ampulheta: '<path d="M6.8 3.6h10.4M6.8 20.4h10.4"/><path d="M7.6 3.6v3c0 2 1.9 3.6 4.4 5.4 2.5-1.8 4.4-3.4 4.4-5.4v-3"/><path d="M7.6 20.4v-3c0-2 1.9-3.6 4.4-5.4 2.5 1.8 4.4 3.4 4.4 5.4v3"/>',
  alerta: '<path d="M10.4 4.2a1.8 1.8 0 0 1 3.2 0l7 12.9a1.8 1.8 0 0 1-1.6 2.7H5a1.8 1.8 0 0 1-1.6-2.7z"/><path d="M12 9.6v4"/><circle cx="12" cy="16.4" r=".95" fill="currentColor" stroke="none"/>',
  vazio: '<circle cx="12" cy="12" r="8.4" stroke-dasharray="3.4 3"/>',
  check: '<path d="M4.8 12.6 9.5 17.3 19.2 7.6"/>',
  checkCirculo: '<circle cx="12" cy="12" r="8.4"/><path d="M8.2 12.2 11 15l4.8-5.6"/>',
  mais: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
  voltar: '<path d="M19.2 12H5.2"/><path d="M11 5.8 4.8 12l6.2 6.2"/>',
  seta: '<path d="M4.8 12h14"/><path d="M13 6.2 18.8 12 13 17.8"/>',
  chevronBaixo: '<path d="M6.2 9.4 12 15.2l5.8-5.8"/>',
  chevronCima: '<path d="M6.2 14.6 12 8.8l5.8 5.8"/>',
  chevronDir: '<path d="M9.4 6.2 15.2 12l-5.8 5.8"/>',
  sol: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.3M12 18.9v2.3M2.8 12h2.3M18.9 12h2.3M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
  lua: '<path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z"/>',
  tema: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>',
  capacete: '<path d="M3.4 17.6h17.2"/><path d="M5.6 17.6v-2.8a6.4 6.4 0 0 1 12.8 0v2.8"/><path d="M9.8 8.9V6.2a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v2.7"/>',
  assinatura: '<path d="M3.6 17.4c3.3 0 3.2-9.4 6-9.4 2.2 0 1.4 6.9 3.5 6.9 1.6 0 2-3.3 3.6-3.3 1.3 0 1.6 2.1 3.5 2.1"/><path d="M4 20.6h16"/>',
  sino: '<path d="M17.8 9.8a5.8 5.8 0 1 0-11.6 0c0 5-1.9 6.4-1.9 6.4h15.4s-1.9-1.4-1.9-6.4z"/><path d="M13.7 19.2a2 2 0 0 1-3.4 0"/>',
  livro: '<path d="M4 5.4a2 2 0 0 1 2-2h5.2v15.4H6a2 2 0 0 0-2 2z"/><path d="M20 5.4a2 2 0 0 0-2-2h-5.2v15.4H18a2 2 0 0 1 2 2z"/>',
  apresentar: '<rect x="3.2" y="4.2" width="17.6" height="12" rx="2"/><path d="M12 16.2v3.4M8.4 19.6h7.2"/><path d="M10.4 8.4 14.8 10.8l-4.4 2.4z"/>',
  chave: '<circle cx="7.8" cy="12" r="4.1"/><path d="M11.9 12h9.3"/><path d="M18.4 12v3.2M15.4 12v2.4"/>',
  codigoBarras: '<path d="M3.6 5.8v12.4M6.6 5.8v12.4M9.6 5.8v12.4M13.2 5.8v12.4M16.2 5.8v12.4M20.4 5.8v12.4"/>',
  filtro: '<path d="M3.6 5.4h16.8l-6.5 7.7v6l-3.8 2v-8z"/>',
  olho: '<path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="3.1"/>',
  obra: '<path d="M3 20.4h18"/><path d="M5.4 20.4V9.6l6.6-4.2 6.6 4.2v10.8"/><path d="M9.8 20.4v-5.2h4.4v5.2"/>',

  /* ---------- sincronização ---------- */
  syncOk: '<path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1"/><path d="M8.8 11.8 11.6 14.6 20.8 5.4"/>',
  syncPend: '<path d="M20.4 6.6v4.6h-4.6"/><path d="M3.6 17.4v-4.6h4.6"/><path d="M5.5 10.4a7 7 0 0 1 11.6-2.6l3.3 3"/><path d="M18.5 13.6a7 7 0 0 1-11.6 2.6l-3.3-3"/>',
  syncErro: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.8v4.8"/><circle cx="12" cy="16" r=".95" fill="currentColor" stroke="none"/>',
  syncOff: '<path d="M7.6 18.6a4.3 4.3 0 0 1-.5-8.5 5.5 5.5 0 0 1 6.6-3.3"/><path d="M16.9 9.5a3.9 3.9 0 0 1 .6 7.6"/><path d="M3.4 3.4 20.6 20.6"/>',

  /* ---------- frentes de serviço ---------- */
  // serviços preliminares: piquete com bandeirola
  fPreliminares: '<path d="M6.8 3.6v16.8"/><path d="M6.8 4.6h9.8l-2.6 3.2 2.6 3.2H6.8"/>',
  // pavimentação: via com faixa central
  fPavimentacao: '<path d="M8.6 3.6 5 20.4M15.4 3.6 19 20.4"/><path d="M12 5.2v2.6M12 10.8v2.6M12 16.4V19"/>',
  // calçada: peças assentadas
  fCalcada: '<rect x="3.2" y="6.8" width="17.6" height="10.4" rx="1.5"/><path d="M3.2 12h17.6"/><path d="M8.8 6.8V12M14.4 6.8V12M6 12v5.2M11.6 12v5.2M17.2 12v5.2"/>',
  // demolição / remanejamento: marreta
  fDemolicao: '<path d="M2.8 20.4h18.4"/><path d="M4.4 20.4V8.6h9.6v11.8"/><path d="M4.4 14.4h9.6M9.2 8.6v11.8"/><path d="M17.4 9.2l2.2-2.8 2.4 1.9-2.2 2.8z"/><path d="M15.8 14.6l1.8-2.2 2 1.6-1.8 2.2z"/>',
  // drenagem: tubo e a água
  fDrenagem: '<path d="M12 2.8s3.4 4.2 3.4 6.4a3.4 3.4 0 0 1-6.8 0c0-2.2 3.4-6.4 3.4-6.4z"/><rect x="2.8" y="14.4" width="18.4" height="5.8" rx="2.6"/><path d="M9 14.4v5.8M15 14.4v5.8"/>',
  // terraplenagem: perfil do terreno
  fTerraplenagem: '<path d="M2.8 19.6h18.4"/><path d="M3.4 19.6 9 9.8l4.2 5.2L17 8.4l3.8 11.2"/>',
  // qualquer frente que venha nova
  fGenerico: '<circle cx="12" cy="12" r="7.6"/><path d="M12 8.2v7.6M8.2 12h7.6"/>'
};

/* devolve o SVG pronto. tam em px; sem tam, acompanha o texto (1em) */
function ic(nome, tam, cls) {
  var d = ICONES[nome];
  if (!d) return '';
  var m = tam ? ('width="' + tam + '" height="' + tam + '"') : 'width="1em" height="1em"';
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" ' + m +
         ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
         'stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
}

/* ícone da frente de serviço, pelo nome dela — assim uma obra nova já
   entra com o desenho certo, sem ninguém cadastrar nada */
function icFrente(nome) {
  var n = String(nome || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/prelimin|mobiliza|canteiro|topograf/.test(n)) return 'fPreliminares';
  if (/pavimenta|asfalt|cbuq|binder|imprima/.test(n)) return 'fPavimentacao';
  if (/calcada|passeio|guia|sarjeta|meio-fio/.test(n)) return 'fCalcada';
  if (/demoli|remanej|remocao|retirada/.test(n)) return 'fDemolicao';
  if (/drenagem|galeria|boca de lobo|tubo|pluvial/.test(n)) return 'fDrenagem';
  if (/terraplen|escava|aterro|corte|reforc|subleito/.test(n)) return 'fTerraplenagem';
  if (/sinaliza/.test(n)) return 'fPreliminares';
  return 'fGenerico';
}

if (typeof window !== 'undefined') { window.ICONES = ICONES; window.ic = ic; window.icFrente = icFrente; }
