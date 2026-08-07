/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ============================================================
   ÍCONES DO GESTOR — conjunto próprio, desenhado para o app
   ------------------------------------------------------------
   Por que não emoji: cada aparelho desenha do seu jeito (o 🚜 do
   Android não é o do iPhone nem o do Windows), o tamanho varia, a
   cor é fixa e o resultado é genérico — cara de aplicativo de
   celular, não de sistema de engenharia. Aqui é um traço só, mesma
   grade de 24, mesma espessura, e a cor vem do CSS (currentColor),
   então o ícone acompanha o tema claro/escuro sozinho.

   GRAMÁTICA DO DESENHO (vale para TODOS, sem exceção):
     · grade 24×24, viewBox "0 0 24 24";
     · o desenho vive entre 2.6 e 21.4 — sobra de respiro nas bordas,
       para o ícone não encostar no texto nem no botão;
     · só contorno: fill none, stroke currentColor, largura 1.7;
     · pontas e junções arredondadas (stroke-linecap/linejoin round);
     · cantos de retângulo levemente arredondados (rx 1.4 a 2.2) —
       nunca canto vivo, nunca cápsula;
     · preenchimento sólido SÓ em ponto de 1px (o pingo do "!", a
       lente da câmera), onde o traço não resolve;
     · sem detalhe que suma abaixo de 16px: nada de hachura, sombra,
       gradiente, rosto, mãozinha ou desenho "fofo".

   Uso:  ic('nota')            → <svg> de 1em, alinhado ao texto
         ic('nota', 20)        → 20px
         ic('nota', 0, 'cls')  → com classe extra

   ------------------------------------------------------------
   ARQUIVO COMPARTILHADO — mantenha os dois repositórios IGUAIS
   ------------------------------------------------------------
   Este arquivo é o mesmo em `teotonio-vilela` e em `gestor-obras`
   ("Gestor — Controle de Obras"). Ele já divergiu uma vez: um lado
   ganhou 12 desenhos e o icFrente refeito, o outro ficou com a versão
   antiga, e as mesmas frentes passaram a aparecer com ícones
   diferentes em cada sistema.

   Regra: alterou aqui, copie o arquivo INTEIRO para o outro repo no
   mesmo dia. Nunca edite um lado só, e nunca remova um nome — algum
   dos dois apps pode estar chamando por ele.
   ============================================================ */
'use strict';

var ICONES = {

  /* ================= NAVEGAÇÃO / MÓDULOS ================= */
  // painel executivo: blocos de um quadro de indicadores
  painel: '<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="1.6"/><rect x="13.4" y="3.2" width="7.4" height="4.2" rx="1.6"/><rect x="13.4" y="10.2" width="7.4" height="10.6" rx="1.6"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="1.6"/>',
  // avanço físico: barras subindo dentro do quadro medido
  avanco: '<path d="M3.4 20.6h17.2"/><rect x="4.4" y="12.6" width="3.8" height="5.6" rx="1.4"/><rect x="10.1" y="8.4" width="3.8" height="9.8" rx="1.4"/><rect x="15.8" y="4.6" width="3.8" height="13.6" rx="1.4"/>',
  // serviços: lista conferida
  servicos: '<path d="M9.6 6.2h10.8M9.6 12h10.8M9.6 17.8h10.8"/><path d="M3.6 6.2l1.4 1.4 2.4-2.6"/><path d="M3.6 12l1.4 1.4 2.4-2.6"/><path d="M3.6 17.8l1.4 1.4 2.4-2.6"/>',
  // cronograma: barras de Gantt na linha do tempo
  cronograma: '<rect x="2.8" y="3.4" width="18.4" height="17.2" rx="2.2"/><path d="M2.8 8.2h18.4"/><path d="M6.2 11.6h7.4M6.2 15.4h4.6M6.2 18.6h9.8"/>',
  // medição física: escala graduada
  medicao: '<rect x="2.6" y="8.2" width="18.8" height="7.6" rx="1.8"/><path d="M6.6 8.2v3.2M10.2 8.2v4.6M13.8 8.2v3.2M17.4 8.2v4.6"/>',
  // apoio à medição: planilha contratual com item conferido
  contrato: '<path d="M6 3.4h9.2L19.4 7.6v13H6z"/><path d="M14.8 3.6v4.2h4.4"/><path d="M8.8 12.4h7.2M8.8 16h4.6"/>',
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
  // projetos: prancha de desenho
  projetos: '<path d="M3.2 6.4a2.6 2.6 0 0 1 2.6-2.6h12.4a2.6 2.6 0 0 1 2.6 2.6v11.2a2.6 2.6 0 0 1-2.6 2.6H5.8a2.6 2.6 0 0 1-2.6-2.6z"/><path d="M3.2 8.6h17.6M8 8.6v11.6M3.2 14.4H8"/><path d="M11 12.2h6.4M11 16.2h4"/>',
  // suprimentos / estoque: caixa
  caixa: '<path d="M3.6 8.2 12 4l8.4 4.2v7.6L12 20l-8.4-4.2z"/><path d="M3.6 8.2 12 12.4l8.4-4.2M12 12.4V20"/>',
  // preço: etiqueta com o furo
  dinheiro: '<path d="M12.6 3.4H19a1.6 1.6 0 0 1 1.6 1.6v6.4a1.6 1.6 0 0 1-.47 1.13l-7.4 7.4a1.6 1.6 0 0 1-2.26 0l-6.4-6.4a1.6 1.6 0 0 1 0-2.26l7.4-7.4A1.6 1.6 0 0 1 12.6 3.4z"/><circle cx="16.6" cy="7.4" r="1.5"/>',
  // saída de material: caixa com a seta para fora
  saida: '<path d="M2.8 10.6 10 7l7.2 3.6v6.6L10 20.8l-7.2-3.6z"/><path d="M2.8 10.6 10 14.2l7.2-3.6M10 14.2v6.6"/><path d="M15.6 8.4 21.2 2.8M21.2 2.8h-3.9M21.2 2.8v3.9"/>',
  // mapa de estacas: malha da via em planta
  mapa: '<rect x="2.8" y="4.6" width="18.4" height="14.8" rx="2"/><path d="M2.8 9.5h18.4M2.8 14.5h18.4M9 4.6v14.8M15 4.6v14.8"/>',

  /* ================= AÇÕES ================= */
  baixar: '<path d="M12 3.6v11.2"/><path d="M7.9 10.9 12 15l4.1-4.1"/><path d="M4.6 19.4h14.8"/>',
  enviar: '<path d="M12 20.4V9.2"/><path d="M7.9 13.3 12 9.2l4.1 4.1"/><path d="M4.6 4.6h14.8"/>',
  imprimir: '<path d="M7.2 8.6V4.4h9.6v4.2"/><path d="M7.2 15.4H5.4a1.9 1.9 0 0 1-1.9-1.9v-3.1a1.9 1.9 0 0 1 1.9-1.9h13.2a1.9 1.9 0 0 1 1.9 1.9v3.1a1.9 1.9 0 0 1-1.9 1.9h-1.8"/><path d="M7.2 13.6h9.6v6H7.2z"/>',
  arquivo: '<path d="M13.6 3.4H7.8a2 2 0 0 0-2 2v13.2a2 2 0 0 0 2 2h8.4a2 2 0 0 0 2-2V8.2z"/><path d="M13.6 3.4v4.8h4.6"/><path d="M9 13h6M9 16.4h4"/>',
  // PDF: a mesma folha do "arquivo", com a tarja do formato na base — as
  // letras P-D-F viravam borrão a 16px, a tarja não
  pdf: '<path d="M13.6 3.4H7.8a2 2 0 0 0-2 2v13.2a2 2 0 0 0 2 2h8.4a2 2 0 0 0 2-2V8.2z"/><path d="M13.6 3.4v4.8h4.6"/><rect x="8.4" y="13.2" width="7.2" height="4.6" rx="1.3"/>',
  planilha: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2"/><path d="M3.4 9.6h17.2M3.4 14.4h17.2M9.2 4.6v14.8M14.8 4.6v14.8"/>',
  editar: '<path d="M4.6 19.4 5.5 15.9 15.7 5.8a1.9 1.9 0 0 1 2.7 0l1.4 1.4a1.9 1.9 0 0 1 0 2.7L9.5 20.1z"/><path d="M14.4 7.1l3.1 3.1"/>',
  lixeira: '<path d="M4.4 6.6h15.2"/><path d="M9.4 6.6V4.9a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.7"/><path d="M6.4 6.6l.9 12.1a1.9 1.9 0 0 0 1.9 1.8h5.6a1.9 1.9 0 0 0 1.9-1.8l.9-12.1"/><path d="M10.4 10.4v6M13.6 10.4v6"/>',
  copiar: '<rect x="8.6" y="8.6" width="12" height="12" rx="2.2"/><path d="M5.6 15.4H5.4a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.2"/>',
  salvar: '<path d="M4.4 6.4a2 2 0 0 1 2-2h9.4l4.2 4.2v9a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z"/><path d="M8 4.4v4.8h6.6V4.4"/><path d="M8 19.6v-4.8h8v4.8"/>',
  fechar: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
  lupa: '<circle cx="10.9" cy="10.9" r="6.7"/><path d="M15.7 15.7l4.5 4.5"/>',
  vinculo: '<path d="M10.2 13.6a4.1 4.1 0 0 0 5.8 0l2.4-2.4a4.1 4.1 0 1 0-5.8-5.8l-1.2 1.2"/><path d="M13.8 10.4a4.1 4.1 0 0 0-5.8 0l-2.4 2.4a4.1 4.1 0 1 0 5.8 5.8l1.2-1.2"/>',
  relogio: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 1.9"/>',
  // ajustes: réguas deslizantes (preferências da tela)
  ajustes: '<path d="M4.6 6.6h14.8M4.6 12h14.8M4.6 17.4h14.8"/><circle cx="9.2" cy="6.6" r="2.1"/><circle cx="15.2" cy="12" r="2.1"/><circle cx="8.2" cy="17.4" r="2.1"/>',
  // engrenagem: configuração do sistema
  engrenagem: '<circle cx="12" cy="12" r="3.1"/><path d="M18.9 14.6a1.55 1.55 0 0 0 .31 1.71l.06.06a1.9 1.9 0 1 1-2.68 2.68l-.06-.06a1.55 1.55 0 0 0-1.71-.31 1.55 1.55 0 0 0-.94 1.42v.16a1.9 1.9 0 1 1-3.8 0v-.09a1.55 1.55 0 0 0-1.01-1.42 1.55 1.55 0 0 0-1.71.31l-.06.06a1.9 1.9 0 1 1-2.68-2.68l.06-.06a1.55 1.55 0 0 0 .31-1.71 1.55 1.55 0 0 0-1.42-.94h-.16a1.9 1.9 0 1 1 0-3.8h.09a1.55 1.55 0 0 0 1.42-1.01 1.55 1.55 0 0 0-.31-1.71l-.06-.06a1.9 1.9 0 1 1 2.68-2.68l.06.06a1.55 1.55 0 0 0 1.71.31h.07a1.55 1.55 0 0 0 .94-1.42v-.16a1.9 1.9 0 1 1 3.8 0v.09a1.55 1.55 0 0 0 .94 1.42 1.55 1.55 0 0 0 1.71-.31l.06-.06a1.9 1.9 0 1 1 2.68 2.68l-.06.06a1.55 1.55 0 0 0-.31 1.71v.07a1.55 1.55 0 0 0 1.42.94h.16a1.9 1.9 0 1 1 0 3.8h-.09a1.55 1.55 0 0 0-1.42.94z"/>',
  atualizar: '<path d="M20.4 6.6v4.6h-4.6"/><path d="M3.6 17.4v-4.6h4.6"/><path d="M5.52 10.4a7 7 0 0 1 11.58-2.62l3.3 3.06"/><path d="M18.48 13.6a7 7 0 0 1-11.58 2.62l-3.3-3.06"/>',
  menu: '<path d="M4.2 7.2h15.6M4.2 12h15.6M4.2 16.8h15.6"/>',
  filtro: '<path d="M3.6 5.4h16.8l-6.5 7.7v6l-3.8 2v-8z"/>',
  play: '<path d="M8.4 5.4 19 12 8.4 18.6z"/>',
  pausa: '<path d="M9.2 5.6v12.8M14.8 5.6v12.8"/>',
  camera: '<path d="M3.4 8.8a2 2 0 0 1 2-2h2.2l1.3-2.2h6.2l1.3 2.2h2.2a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.8" r="3.6"/>',
  pasta: '<path d="M3.4 7.2a2 2 0 0 1 2-2h3.7l2 2.4h7.5a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/>',
  grafico: '<path d="M3.8 20.2h16.4"/><path d="M7.4 20.2v-6.6M12 20.2V6.4M16.6 20.2v-9.6"/>',
  nuvem: '<path d="M7.6 18.6a4.3 4.3 0 0 1-.5-8.5 5.5 5.5 0 0 1 10.5-1.1 3.9 3.9 0 0 1-.7 7.8z"/>',
  ampulheta: '<path d="M6.8 3.6h10.4M6.8 20.4h10.4"/><path d="M7.6 3.6v3c0 2 1.9 3.6 4.4 5.4 2.5-1.8 4.4-3.4 4.4-5.4v-3"/><path d="M7.6 20.4v-3c0-2 1.9-3.6 4.4-5.4 2.5 1.8 4.4 3.4 4.4 5.4v3"/>',
  alerta: '<path d="M10.4 4.2a1.8 1.8 0 0 1 3.2 0l7 12.9a1.8 1.8 0 0 1-1.6 2.7H5a1.8 1.8 0 0 1-1.6-2.7z"/><path d="M12 9.6v4"/><circle cx="12" cy="16.4" r=".95" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11.2v5"/><circle cx="12" cy="8.1" r=".95" fill="currentColor" stroke="none"/>',
  bloqueado: '<circle cx="12" cy="12" r="8.4"/><path d="M6.1 6.1 17.9 17.9"/>',
  vazio: '<circle cx="12" cy="12" r="8.4" stroke-dasharray="3.4 3"/>',
  check: '<path d="M4.8 12.6 9.5 17.3 19.2 7.6"/>',
  checkCirculo: '<circle cx="12" cy="12" r="8.4"/><path d="M8.2 12.2 11 15l4.8-5.6"/>',
  caixaMarcada: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/><path d="M7.8 12.2 10.6 15l5.6-6.2"/>',
  caixaVazia: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/>',
  mais: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
  menos: '<path d="M5.4 12h13.2"/>',
  maisCirculo: '<circle cx="12" cy="12" r="8.4"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  voltar: '<path d="M19.2 12H5.2"/><path d="M11 5.8 4.8 12l6.2 6.2"/>',
  seta: '<path d="M4.8 12h14"/><path d="M13 6.2 18.8 12 13 17.8"/>',
  setaCima: '<path d="M12 19.2V5.2"/><path d="M5.8 11.4 12 5.2l6.2 6.2"/>',
  setaBaixo: '<path d="M12 4.8v14"/><path d="M18.2 12.6 12 18.8 5.8 12.6"/>',
  retornar: '<path d="M5.4 9.6h10.2a4.4 4.4 0 0 1 0 8.8H9.2"/><path d="M8.8 5.6 4.6 9.6l4.2 4"/>',
  ramificar: '<path d="M6.6 4.6v8.2a3.2 3.2 0 0 0 3.2 3.2h9"/><path d="M15 12.2 19.2 16 15 19.8"/>',
  chevronBaixo: '<path d="M6.2 9.4 12 15.2l5.8-5.8"/>',
  chevronCima: '<path d="M6.2 14.6 12 8.8l5.8 5.8"/>',
  chevronDir: '<path d="M9.4 6.2 15.2 12l-5.8 5.8"/>',
  // tendência: usados nos indicadores de variação (sobe / desce / estável)
  tendSobe: '<path d="M3.8 16.8 9.6 11l3.8 3.8 6.8-6.8"/><path d="M15.4 8h4.8v4.8"/>',
  tendDesce: '<path d="M3.8 7.2 9.6 13l3.8-3.8 6.8 6.8"/><path d="M15.4 16h4.8v-4.8"/>',
  tendEstavel: '<path d="M3.8 12h16.4"/><path d="M15.6 7.8 19.8 12l-4.2 4.2"/>',

  /* ================= PESSOAS / ACESSO ================= */
  usuario: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0"/>',
  usuarios: '<circle cx="9.6" cy="8.4" r="3.6"/><path d="M3.2 20.2a6.6 6.6 0 0 1 12.8 0"/><path d="M16.4 5.2a3.6 3.6 0 0 1 0 6.9"/><path d="M17.8 14.6a6.6 6.6 0 0 1 3 5.6"/>',
  capacete: '<path d="M3.4 17.6h17.2"/><path d="M5.6 17.6v-2.8a6.4 6.4 0 0 1 12.8 0v2.8"/><path d="M9.8 8.9V6.2a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v2.7"/>',
  entrar: '<path d="M10.2 3.6H6.4a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h3.8"/><path d="M14.8 8.2 18.6 12l-3.8 3.8"/><path d="M18.2 12H9"/>',
  sair: '<path d="M13.8 3.6H6.4a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h7.4"/><path d="M16.4 8.2 20.2 12l-3.8 3.8"/><path d="M19.8 12h-9.2"/>',
  cadeado: '<rect x="4.4" y="10.2" width="15.2" height="10.2" rx="2.2"/><path d="M7.8 10.2V7.6a4.2 4.2 0 0 1 8.4 0v2.6"/><path d="M12 14.2v2.4"/>',
  chave: '<circle cx="7.8" cy="12" r="4.1"/><path d="M11.9 12h9.3"/><path d="M18.4 12v3.2M15.4 12v2.4"/>',
  assinatura: '<path d="M3.6 17.4c3.3 0 3.2-9.4 6-9.4 2.2 0 1.4 6.9 3.5 6.9 1.6 0 2-3.3 3.6-3.3 1.3 0 1.6 2.1 3.5 2.1"/><path d="M4 20.6h16"/>',
  sino: '<path d="M17.8 9.8a5.8 5.8 0 1 0-11.6 0c0 5-1.9 6.4-1.9 6.4h15.4s-1.9-1.4-1.9-6.4z"/><path d="M13.7 19.2a2 2 0 0 1-3.4 0"/>',
  livro: '<path d="M4 5.4a2 2 0 0 1 2-2h5.2v15.4H6a2 2 0 0 0-2 2z"/><path d="M20 5.4a2 2 0 0 0-2-2h-5.2v15.4H18a2 2 0 0 1 2 2z"/>',
  apresentar: '<rect x="3.2" y="4.2" width="17.6" height="12" rx="2"/><path d="M12 16.2v3.4M8.4 19.6h7.2"/><path d="M10.4 8.4 14.8 10.8l-4.4 2.4z"/>',
  codigoBarras: '<path d="M3.6 5.8v12.4M6.6 5.8v12.4M9.6 5.8v12.4M13.2 5.8v12.4M16.2 5.8v12.4M20.4 5.8v12.4"/>',
  olho: '<path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="3.1"/>',
  obra: '<path d="M3 20.4h18"/><path d="M5.4 20.4V9.6l6.6-4.2 6.6 4.2v10.8"/><path d="M9.8 20.4v-5.2h4.4v5.2"/>',
  balanca: '<path d="M12 4.2v16.2"/><path d="M7.2 20.4h9.6"/><path d="M4.6 6.6h14.8"/><path d="M4.6 6.6 2.2 13a3.2 3.2 0 0 0 4.8 0z"/><path d="M19.4 6.6 17 13a3.2 3.2 0 0 0 4.8 0z"/>',
  estrela: '<path d="M12 3.6l2.6 5.5 5.8.85-4.2 4.2 1 6.05L12 17.3l-5.2 2.9 1-6.05-4.2-4.2 5.8-.85z"/>',
  pino: '<path d="M12 21.2s6.6-5.5 6.6-10.4a6.6 6.6 0 1 0-13.2 0C5.4 15.7 12 21.2 12 21.2z"/><circle cx="12" cy="10.6" r="2.5"/>',
  calendario: '<rect x="3.4" y="5.4" width="17.2" height="15.2" rx="2.2"/><path d="M3.4 10h17.2"/><path d="M8.2 3.4v3.6M15.8 3.4v3.6"/>',
  calendarioCheck: '<rect x="3.4" y="5.4" width="17.2" height="15.2" rx="2.2"/><path d="M3.4 10h17.2"/><path d="M8.2 3.4v3.6M15.8 3.4v3.6"/><path d="M9 14.6 11.2 16.8 15.4 12.6"/>',
  rascunho: '<path d="M11 4.6H6.4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4.6"/><path d="M17.1 3.9a1.8 1.8 0 0 1 2.5 2.5L13 13l-3.2.7.7-3.2z"/>',
  antena: '<circle cx="12" cy="12" r="2.1"/><path d="M8.4 15.6a5.1 5.1 0 0 1 0-7.2M15.6 8.4a5.1 5.1 0 0 1 0 7.2"/><path d="M5.6 18.4a9.1 9.1 0 0 1 0-12.8M18.4 5.6a9.1 9.1 0 0 1 0 12.8"/>',

  /* ================= TEMA ================= */
  sol: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.3M12 18.9v2.3M2.8 12h2.3M18.9 12h2.3M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
  lua: '<path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z"/>',
  // "automático": segue o aparelho
  monitor: '<rect x="2.8" y="4.2" width="18.4" height="12.4" rx="2.2"/><path d="M8.4 20.4h7.2M12 16.6v3.8"/>',
  tema: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>',

  /* ================= SINCRONIZAÇÃO ================= */
  syncOk: '<path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1"/><path d="M8.8 11.8 11.6 14.6 20.8 5.4"/>',
  syncPend: '<path d="M20.4 6.6v4.6h-4.6"/><path d="M3.6 17.4v-4.6h4.6"/><path d="M5.5 10.4a7 7 0 0 1 11.6-2.6l3.3 3"/><path d="M18.5 13.6a7 7 0 0 1-11.6 2.6l-3.3-3"/>',
  syncErro: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.8v4.8"/><circle cx="12" cy="16" r=".95" fill="currentColor" stroke="none"/>',
  syncOff: '<path d="M7.6 18.6a4.3 4.3 0 0 1-.5-8.5 5.5 5.5 0 0 1 6.6-3.3"/><path d="M16.9 9.5a3.9 3.9 0 0 1 .6 7.6"/><path d="M3.4 3.4 20.6 20.6"/>',

  /* ================= FRENTES DE SERVIÇO =================
     Estes são os únicos ícones do conjunto com MASSA além do traço: uma
     forma sólida em <g class="ic-fill"> (o CSS pinta com currentColor a
     ~16% de opacidade) por baixo do contorno. Aqui isso não é enfeite —
     eles aparecem grandes no cartão de frente do Painel, e só traço fino
     nesse tamanho fica sem peso, apagado contra o painel escuro.

     A regra de ouro é a SILHUETA: cada frente tem que ser reconhecível
     pelo contorno, de longe, sem ler o rótulo. Duas frentes com desenho
     parecido são duas frentes com desenho errado.
     ======================================================= */

  // serviços preliminares: piquete de topografia com bandeirola
  fPreliminares: '<g class="ic-fill"><path d="M6.6 4.4h10.2l-2.8 3.4 2.8 3.4H6.6z"/></g>' +
    '<path d="M6.6 3.2v17.6"/><path d="M6.6 4.4h10.2l-2.8 3.4 2.8 3.4H6.6"/><path d="M3.8 20.8h5.6"/>',

  // via: a pista vista de cima, com a faixa central seccionada
  fVia: '<g class="ic-fill"><path d="M9 3.6h6l4.6 16.8H4.4z"/></g>' +
    '<path d="M9 3.6h6l4.6 16.8H4.4z"/>' +
    '<path d="M12 6v2.6M12 11.4v2.8M12 17v2.4"/>',
  // pavimento flexível: rolo compactador — a máquina é o que se vê no
  // canteiro quando a frente do asfalto está rodando
  fPavFlexivel: '<g class="ic-fill"><rect x="2.6" y="12.8" width="10.6" height="7.2" rx="3.6"/></g>' +
    '<rect x="2.6" y="12.8" width="10.6" height="7.2" rx="3.6"/>' +
    '<path d="M6.2 12.9v7M9.6 12.9v7"/>' +
    '<path d="M13.2 20V9.8a2 2 0 0 1 2-2h4.4a2 2 0 0 1 2 2V20"/>' +
    '<path d="M15.4 12.6h4"/>',
  // pavimento rígido: placas de concreto e a junta entre elas
  fPavRigido: '<g class="ic-fill"><path d="M2.8 8.8h18.4v5.4H2.8z"/></g>' +
    '<path d="M2.8 8.8h18.4v5.4H2.8z"/>' +
    '<path d="M12 8.8v5.4"/><path d="M9.2 11.5h5.6"/>' +
    '<path d="M2.8 17.6h18.4"/>',
  // calçada: peças intertravadas assentadas
  fCalcada: '<g class="ic-fill"><path d="M3.2 6.8h17.6v10.4H3.2z"/></g>' +
    '<rect x="3.2" y="6.8" width="17.6" height="10.4" rx="1.5"/><path d="M3.2 12h17.6"/>' +
    '<path d="M8.8 6.8V12M14.4 6.8V12M6 12v5.2M11.6 12v5.2M17.2 12v5.2"/>',

  // demolição / remanejamento: marreta batendo no piso
  fDemolicao: '<g class="ic-fill"><path d="M13.6 3.4l7 7-3.2 3.2-7-7z"/></g>' +
    '<path d="M2.8 20.6h18.4"/><path d="M13.6 3.4l7 7-3.2 3.2-7-7z"/>' +
    '<path d="M11.8 8.6 4.6 15.8a1.9 1.9 0 0 0 0 2.7l.5.5a1.9 1.9 0 0 0 2.7 0l7.2-7.2"/>',

  // drenagem: tubo de concreto em perspectiva, com a água correndo
  fDrenagem: '<g class="ic-fill"><circle cx="12" cy="9.4" r="5.8"/></g>' +
    '<circle cx="12" cy="9.4" r="5.8"/><circle cx="12" cy="9.4" r="2.4"/>' +
    '<path d="M3.4 17.9c1.4 0 1.4 1.7 2.9 1.7s1.4-1.7 2.9-1.7 1.4 1.7 2.9 1.7 1.4-1.7 2.9-1.7 1.4 1.7 2.9 1.7 1.4-1.7 2.9-1.7"/>',
  // vala técnica: o corte da vala com os dutos assentados
  fValaTecnica: '<g class="ic-fill"><path d="M4.4 6.4h15.2v13.4H4.4z"/></g>' +
    '<path d="M4.4 6.4v13.4h15.2V6.4"/>' +
    '<path d="M2.2 6.4h4.4M17.4 6.4h4.4"/>' +
    '<circle cx="8.7" cy="16" r="1.9"/><circle cx="15.3" cy="16" r="1.9"/><circle cx="12" cy="11.7" r="1.9"/>',
  // terraplenagem: o perfil do terreno cortado, com o talude
  fTerraplenagem: '<g class="ic-fill"><path d="M2.8 19.8 8.6 9.6l4.4 5.4 4-6.8 4.2 11.6z"/></g>' +
    '<path d="M2.6 19.8h18.8"/><path d="M2.8 19.8 8.6 9.6l4.4 5.4 4-6.8 4.2 11.6"/>' +
    '<path d="M8.6 9.6V5.4M6.8 7l1.8-1.8L10.4 7"/>',

  // sinalização: a placa no poste, com o pé fincado
  fSinalizacao: '<g class="ic-fill"><rect x="5.4" y="3.4" width="13.2" height="9.2" rx="1.8"/></g>' +
    '<rect x="5.4" y="3.4" width="13.2" height="9.2" rx="1.8"/>' +
    '<path d="M9 8h5.4M12.4 5.8 14.6 8l-2.2 2.2"/>' +
    '<path d="M12 12.6v8.2M9 20.8h6"/>',
  // desapropriação: o lote com o marco de divisa e o documento
  fDesapropriacao: '<g class="ic-fill"><path d="M3.4 10.6h9.4v9.8H3.4z"/></g>' +
    '<path d="M3.4 10.6h9.4v9.8H3.4z"/><path d="M3.4 10.6 8.1 6.4l4.7 4.2"/>' +
    '<path d="M16.4 4.2h2.8l2.4 2.4v7.2h-5.2z"/><path d="M19.2 4.2v2.6h2.4"/>' +
    '<path d="M17.8 16.6v3.8M16.2 20.4h3.2"/>',

  // qualquer frente que venha nova e não case com nenhuma acima
  fGenerico: '<g class="ic-fill"><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4"/></g>' +
    '<rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4"/><path d="M12 8.4v7.2M8.4 12h7.2"/>'
};

/* Apelidos: os desenhos antigos continuam respondendo pelo nome antigo,
   para nada que já use ic('fPavimentacao') quebrar. */
ICONES.fPavimentacao = ICONES.fPavFlexivel;

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
  // A ORDEM IMPORTA: o mais específico primeiro. "Pav. Rígido" tem que
  // ser testado antes de qualquer regra de pavimento, senão cai na
  // flexível e as duas frentes ficam com o mesmo desenho.
  //
  // Os padrões seguem o que está ESCRITO na aba Pacotes, não o nome por
  // extenso: a planilha usa "Pav. Flexível" e "Pav. Rígido" abreviados,
  // e a primeira versão desta função procurava "pavimenta" — resultado,
  // as duas frentes de pavimentação caíam no ícone genérico junto com
  // Via, Vala Técnica e Desapropriações. Cinco frentes, um só desenho.
  if (/prelimin|mobiliza|canteiro|topograf|impla?nta[çc]/.test(n)) return 'fPreliminares';
  if (/desapropri|deso?bstru[çc]|imissao|indeniza/.test(n))        return 'fDesapropriacao';
  if (/vala|duto|conduite|multidut/.test(n))                       return 'fValaTecnica';
  if (/drenagem|galeria|boca de lobo|tubo|pluvial|pv\b|po[çc]o/.test(n)) return 'fDrenagem';
  if (/demoli|remanej|remo[çc]ao|retirada|fresa/.test(n))          return 'fDemolicao';
  if (/sinaliza/.test(n))                                          return 'fSinalizacao';
  if (/terraplen|escava|aterro|corte|refor[çc]o|subleito/.test(n)) return 'fTerraplenagem';
  if (/calcada|passeio|guia|sarjeta|meio-?fio|intertrav/.test(n))  return 'fCalcada';
  if (/(pav\.?|pavimenta\w*)\s*(rigid|concret)|rigid|concreto|placa/.test(n)) return 'fPavRigido';
  if (/(pav\.?|pavimenta\w*)|asfalt|cbuq|binder|imprima|flexiv/.test(n))      return 'fPavFlexivel';
  if (/\bvia\b|viario|pista|faixa|rodovi|duplica/.test(n))         return 'fVia';
  return 'fGenerico';
}

if (typeof window !== 'undefined') { window.ICONES = ICONES; window.ic = ic; window.icFrente = icFrente; }
