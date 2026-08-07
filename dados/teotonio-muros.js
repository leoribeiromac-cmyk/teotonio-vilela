/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ============================================================
   MUROS DE CONTENÇÃO — capítulo 10.0 da Planilha Geral
   ------------------------------------------------------------
   Complemento do cadastro da Teotônio. A obra lê Pacotes e Coeficientes
   da planilha publicada; estes pacotes ainda NÃO estão lá, e ficam aqui
   para o serviço poder ser apontado sem esperar ninguém editar a planilha.

   Quando as linhas forem coladas na planilha (ver `docs/muros-planilha.csv`),
   a planilha PASSA A MANDAR: `complementoDoCadastro()` só acrescenta o
   pacote cujo ID ainda não veio de lá. Colar não duplica nada.

   ------------------------------------------------------------
   COMO O MURO VIRA PACOTE

   Muro não se executa de uma vez ao longo do comprimento: um trecho é
   escavado semanas antes de ser concretado. Por isso cada muro entra como
   QUATRO pacotes em sequência, todos medidos em METRO LINEAR DE MURO —
   que é o que o apontador consegue medir com a trena, e o mesmo desenho
   que o pavimento rígido já usa (P30A / P30B / P30C).

     1. Escavação e fundação — escavação, bota-fora, rachão, BGS, lastro magro
     2. Sapata (base)        — forma, armadura e concreto da sapata
     3. Fuste (parede)       — forma, armadura, concreto, cimbramento, barbacãs
     4. Reaterro e acabamento— reaterro, terra importada, corrimão, guarda-corpo

   Os coeficientes são (quantidade contratual do item ÷ comprimento do muro),
   direto das memórias de cálculo dos itens 169 a 177-J. A conta fecha: com
   os três muros a 100%, cada item contratual cai exatamente na quantidade
   do aditamento — tests/muros-contencao.test.js é a trava disso.

   O Muro A está no capítulo, mas com quantidade ZERO em todas as memórias
   (não será executado). Por isso não virou pacote: pacote com quantidade
   zero apareceria no painel como serviço eternamente parado em 0%%.

   `itemPlanilha` é o nº do item na Planilha Geral (169, 177-B…). Existe
   porque cinco códigos SIURB deste capítulo se repetem em outros capítulos
   (06-06-00, 05-48-00, 05-20-00, 04-11-00, 13-02-47): sem o nº do item, o
   consumo do muro somaria com o da drenagem e do pavimento na mesma linha
   da prévia de medição, e a conferência contra a planilha não fecharia.
   ============================================================ */
window.OBRAS_COMPLEMENTO = window.OBRAS_COMPLEMENTO || {};
window.OBRAS_COMPLEMENTO['teotonio'] = {

  /* Frente nova no menu de lançamento. Comprimento = quantidade prevista;
     produtividade em metros de muro por dia, que é o que dá o PESO do
     pacote no avanço ponderado da obra. */
  pacotes: [
    { id: 'P37A', frente: 'Muro de Contenção', pacote: 'Muros B e C — 1. Escavação e fundação',
      un: 'ML', qtd: 42.25, produtividade: 7,
      obs: 'Est. 103+12 a 106+10 (pista esq.) · 6 trechos: B1, B2, C1 a C4 · 11,3 m³/m de escavação' },
    { id: 'P37B', frente: 'Muro de Contenção', pacote: 'Muros B e C — 2. Sapata (base)',
      un: 'ML', qtd: 42.25, produtividade: 8,
      obs: 'Sapata contra o solo — sem forma · 0,44 m³/m de concreto' },
    { id: 'P37C', frente: 'Muro de Contenção', pacote: 'Muros B e C — 3. Fuste (parede)',
      un: 'ML', qtd: 42.25, produtividade: 3.5,
      obs: 'Muros de 1,20 m a 2,90 m · 4,35 m²/m de forma · 27 barbacãs' },
    { id: 'P37D', frente: 'Muro de Contenção', pacote: 'Muros B e C — 4. Reaterro e acabamento',
      un: 'ML', qtd: 42.25, produtividade: 5,
      obs: 'Reaterro 5,6 m³/m · 27,85 m de corrimão e 16,60 m de guarda-corpo' },
    { id: 'P38A', frente: 'Muro de Contenção', pacote: 'Muro D — 1. Escavação e fundação',
      un: 'ML', qtd: 39, produtividade: 3,
      obs: 'Est. 212 a 215 (pista dir.) · 36,8 m³/m — a escavação mais profunda do lote' },
    { id: 'P38B', frente: 'Muro de Contenção', pacote: 'Muro D — 2. Sapata (base)',
      un: 'ML', qtd: 39, produtividade: 5,
      obs: 'Sapata 39,00 m · 0,79 m³/m de concreto' },
    { id: 'P38C', frente: 'Muro de Contenção', pacote: 'Muro D — 3. Fuste (parede)',
      un: 'ML', qtd: 39, produtividade: 2,
      obs: 'Fuste de 3,05 m · 6,15 m²/m de forma · 30 barbacãs' },
    { id: 'P38D', frente: 'Muro de Contenção', pacote: 'Muro D — 4. Reaterro e acabamento',
      un: 'ML', qtd: 39, produtividade: 8,
      obs: 'Reaterro 15,1 m³/m' },
    { id: 'P39A', frente: 'Muro de Contenção', pacote: 'Muro E — 1. Escavação e fundação',
      un: 'ML', qtd: 135, produtividade: 8,
      obs: 'Est. 129+15 a 136+10 / 232+4,16 a 238+19,15 — canteiro central · 9,0 m³/m' },
    { id: 'P39B', frente: 'Muro de Contenção', pacote: 'Muro E — 2. Sapata (base)',
      un: 'ML', qtd: 135, produtividade: 6,
      obs: 'Sapata 200×30 com dente 30×40 · 0,72 m³/m de concreto' },
    { id: 'P39C', frente: 'Muro de Contenção', pacote: 'Muro E — 3. Fuste (parede)',
      un: 'ML', qtd: 135, produtividade: 2.5,
      obs: 'Fuste de 2,65 m constante · 4,72 m²/m de forma · 90 barbacãs' },
    { id: 'P39D', frente: 'Muro de Contenção', pacote: 'Muro E — 4. Reaterro e acabamento',
      un: 'ML', qtd: 135, produtividade: 20,
      obs: 'Reaterro 5,5 m³/m — faixa contínua no canteiro central' },
    { id: 'P40', frente: 'Muro de Contenção', pacote: 'Rampa da escola (junto ao Muro C2)',
      un: 'm²', qtd: 27.225, produtividade: 8,
      obs: 'Junto ao Muro C2 · piso estrutural 7 cm sobre BGS 10 cm + faixa podotátil' },
  ],

  /* Matriz pacote → item contratual. `coef` é por metro de muro (ou por m²,
     na rampa). Mesmas colunas da aba Coeficientes da planilha, mais o
     `itemPlanilha`. */
  coeficientes: [
    // Muros B e C — 1. Escavação e fundação
    { pid: 'P37A', itemPlanilha: '169', item: '04-01-00', desc: 'Escavação manual p/ fundações e valas (h ≤ 1,50 m)',
      unItem: 'M3', coef: 3.39366, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37A', itemPlanilha: '169-A', item: '04-11-00', desc: 'Escavação mecânica, carga e remoção até 1,0 km',
      unItem: 'M3', coef: 7.91853, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37A', itemPlanilha: '170', item: '04-15-00', desc: 'Carga e remoção de terra até 1,0 km',
      unItem: 'M3', coef: 11.3122, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37A', itemPlanilha: '171', item: '04-60-00', desc: 'Remoção de terra além do 1º km',
      unItem: 'M3XKM', coef: 366.628, unCoef: 'm³xkm/ML', tipo: 'Manual' },
    { pid: 'P37A', itemPlanilha: '172', item: '05.09.007', desc: 'Taxa de destinação de resíduo sólido em aterro',
      unItem: 'M3', coef: 7.91853, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37A', itemPlanilha: '177-B', item: '05-20-00', desc: 'Fundação de rachão',
      unItem: 'M3', coef: 0.93642, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37A', itemPlanilha: '177-A', item: '05-48-00', desc: 'Base de brita graduada',
      unItem: 'M3', coef: 0.187284, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37A', itemPlanilha: '174', item: '06-06-00', desc: 'Lastro de concreto FCK = 10 MPa',
      unItem: 'M3', coef: 0.187284, unCoef: 'm³/ML', tipo: 'Manual' },
    // Muros B e C — 2. Sapata (base)
    { pid: 'P37B', itemPlanilha: '176', item: '07-10-00', desc: 'Aço CA-50 — diâmetro ≥ 1/2"',
      unItem: 'KG', coef: 22.4501, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P37B', itemPlanilha: '177-C', item: '07-09-00', desc: 'Aço CA-50 — diâmetro < 1/2"',
      unItem: 'KG', coef: 26.3874, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P37B', itemPlanilha: '177', item: '03-03-20', desc: 'Concreto FCK = 30 MPa — usinado',
      unItem: 'M3', coef: 0.435917, unCoef: 'm³/ML', tipo: 'Manual' },
    // Muros B e C — 3. Fuste (parede)
    { pid: 'P37C', itemPlanilha: '175', item: '02-03-01', desc: 'Forma comum de tábuas de pinus',
      unItem: 'M2', coef: 4.35136, unCoef: 'm²/ML', tipo: 'Manual' },
    { pid: 'P37C', itemPlanilha: '176', item: '07-10-00', desc: 'Aço CA-50 — diâmetro ≥ 1/2"',
      unItem: 'KG', coef: 35.041, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P37C', itemPlanilha: '177-C', item: '07-09-00', desc: 'Aço CA-50 — diâmetro < 1/2"',
      unItem: 'KG', coef: 41.1865, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P37C', itemPlanilha: '177', item: '03-03-20', desc: 'Concreto FCK = 30 MPa — usinado',
      unItem: 'M3', coef: 0.680396, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37C', itemPlanilha: '177-H', item: '08-18-02', desc: 'Cimbramento metálico de altura maior que 3,00 m',
      unItem: 'M3', coef: 1.1479, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37C', itemPlanilha: '177-G', item: '07-19-00', desc: 'Barbacãs de tubos de PVC — diâmetro 4"',
      unItem: 'UN', coef: 0.639053, unCoef: 'un/ML', tipo: 'Manual' },
    // Muros B e C — 4. Reaterro e acabamento
    { pid: 'P37D', itemPlanilha: '173', item: '04-08-00', desc: 'Reaterro compactado de fundação',
      unItem: 'M3', coef: 5.58698, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37D', itemPlanilha: '177-J', item: '04-31-00', desc: 'Fornecimento de terra (escavação, carga e transporte até 1,0 km)',
      unItem: 'M3', coef: 2.23123, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P37D', itemPlanilha: '171', item: '04-60-00', desc: 'Remoção de terra além do 1º km',
      unItem: 'M3XKM', coef: 103.306, unCoef: 'm³xkm/ML', tipo: 'Manual' },
    { pid: 'P37D', itemPlanilha: '177-D', item: '17-05-24', desc: 'DP.04 — corrimão em tubo galvanizado',
      unItem: 'M', coef: 0.659172, unCoef: 'm/ML', tipo: 'Manual' },
    { pid: 'P37D', itemPlanilha: '177-E', item: '17-05-25', desc: 'DP.05 — corrimão em tubo galvanizado c/ guarda-corpo',
      unItem: 'M', coef: 0.392899, unCoef: 'm/ML', tipo: 'Manual' },
    // Muro D — 1. Escavação e fundação
    { pid: 'P38A', itemPlanilha: '169', item: '04-01-00', desc: 'Escavação manual p/ fundações e valas (h ≤ 1,50 m)',
      unItem: 'M3', coef: 11.0347, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38A', itemPlanilha: '169-A', item: '04-11-00', desc: 'Escavação mecânica, carga e remoção até 1,0 km',
      unItem: 'M3', coef: 25.7476, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38A', itemPlanilha: '170', item: '04-15-00', desc: 'Carga e remoção de terra até 1,0 km',
      unItem: 'M3', coef: 36.7823, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38A', itemPlanilha: '171', item: '04-60-00', desc: 'Remoção de terra além do 1º km',
      unItem: 'M3XKM', coef: 1192.11, unCoef: 'm³xkm/ML', tipo: 'Manual' },
    { pid: 'P38A', itemPlanilha: '172', item: '05.09.007', desc: 'Taxa de destinação de resíduo sólido em aterro',
      unItem: 'M3', coef: 25.7476, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38A', itemPlanilha: '177-B', item: '05-20-00', desc: 'Fundação de rachão',
      unItem: 'M3', coef: 0.5, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38A', itemPlanilha: '177-A', item: '05-48-00', desc: 'Base de brita graduada',
      unItem: 'M3', coef: 0.1, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38A', itemPlanilha: '174', item: '06-06-00', desc: 'Lastro de concreto FCK = 10 MPa',
      unItem: 'M3', coef: 0.29, unCoef: 'm³/ML', tipo: 'Manual' },
    // Muro D — 2. Sapata (base)
    { pid: 'P38B', itemPlanilha: '175', item: '02-03-01', desc: 'Forma comum de tábuas de pinus',
      unItem: 'M2', coef: 1.68846, unCoef: 'm²/ML', tipo: 'Manual' },
    { pid: 'P38B', itemPlanilha: '176', item: '07-10-00', desc: 'Aço CA-50 — diâmetro ≥ 1/2"',
      unItem: 'KG', coef: 71.6607, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P38B', itemPlanilha: '177-C', item: '07-09-00', desc: 'Aço CA-50 — diâmetro < 1/2"',
      unItem: 'KG', coef: 46.826, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P38B', itemPlanilha: '177', item: '03-03-20', desc: 'Concreto FCK = 30 MPa — usinado',
      unItem: 'M3', coef: 0.7875, unCoef: 'm³/ML', tipo: 'Manual' },
    // Muro D — 3. Fuste (parede)
    { pid: 'P38C', itemPlanilha: '175', item: '02-03-01', desc: 'Forma comum de tábuas de pinus',
      unItem: 'M2', coef: 6.14846, unCoef: 'm²/ML', tipo: 'Manual' },
    { pid: 'P38C', itemPlanilha: '176', item: '07-10-00', desc: 'Aço CA-50 — diâmetro ≥ 1/2"',
      unItem: 'KG', coef: 74.3906, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P38C', itemPlanilha: '177-C', item: '07-09-00', desc: 'Aço CA-50 — diâmetro < 1/2"',
      unItem: 'KG', coef: 48.6099, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P38C', itemPlanilha: '177', item: '03-03-20', desc: 'Concreto FCK = 30 MPa — usinado',
      unItem: 'M3', coef: 0.8175, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38C', itemPlanilha: '177-H', item: '08-18-02', desc: 'Cimbramento metálico de altura maior que 3,00 m',
      unItem: 'M3', coef: 1.525, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38C', itemPlanilha: '177-G', item: '07-19-00', desc: 'Barbacãs de tubos de PVC — diâmetro 4"',
      unItem: 'UN', coef: 0.769231, unCoef: 'un/ML', tipo: 'Manual' },
    // Muro D — 4. Reaterro e acabamento
    { pid: 'P38D', itemPlanilha: '173', item: '04-08-00', desc: 'Reaterro compactado de fundação',
      unItem: 'M3', coef: 15.089, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38D', itemPlanilha: '177-J', item: '04-31-00', desc: 'Fornecimento de terra (escavação, carga e transporte até 1,0 km)',
      unItem: 'M3', coef: 6.02597, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P38D', itemPlanilha: '171', item: '04-60-00', desc: 'Remoção de terra além do 1º km',
      unItem: 'M3XKM', coef: 279.002, unCoef: 'm³xkm/ML', tipo: 'Manual' },
    // Muro E — 1. Escavação e fundação
    { pid: 'P39A', itemPlanilha: '169', item: '04-01-00', desc: 'Escavação manual p/ fundações e valas (h ≤ 1,50 m)',
      unItem: 'M3', coef: 2.71311, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39A', itemPlanilha: '169-A', item: '04-11-00', desc: 'Escavação mecânica, carga e remoção até 1,0 km',
      unItem: 'M3', coef: 6.33059, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39A', itemPlanilha: '170', item: '04-15-00', desc: 'Carga e remoção de terra até 1,0 km',
      unItem: 'M3', coef: 9.0437, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39A', itemPlanilha: '171', item: '04-60-00', desc: 'Remoção de terra além do 1º km',
      unItem: 'M3XKM', coef: 293.106, unCoef: 'm³xkm/ML', tipo: 'Manual' },
    { pid: 'P39A', itemPlanilha: '172', item: '05.09.007', desc: 'Taxa de destinação de resíduo sólido em aterro',
      unItem: 'M3', coef: 6.33059, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39A', itemPlanilha: '177-B', item: '05-20-00', desc: 'Fundação de rachão',
      unItem: 'M3', coef: 1.3, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39A', itemPlanilha: '177-A', item: '05-48-00', desc: 'Base de brita graduada',
      unItem: 'M3', coef: 0.26, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39A', itemPlanilha: '174', item: '06-06-00', desc: 'Lastro de concreto FCK = 10 MPa',
      unItem: 'M3', coef: 0.26, unCoef: 'm³/ML', tipo: 'Manual' },
    // Muro E — 2. Sapata (base)
    { pid: 'P39B', itemPlanilha: '175', item: '02-03-01', desc: 'Forma comum de tábuas de pinus',
      unItem: 'M2', coef: 0.75, unCoef: 'm²/ML', tipo: 'Manual' },
    { pid: 'P39B', itemPlanilha: '176', item: '07-10-00', desc: 'Aço CA-50 — diâmetro ≥ 1/2"',
      unItem: 'KG', coef: 70.4827, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P39B', itemPlanilha: '177-C', item: '07-09-00', desc: 'Aço CA-50 — diâmetro < 1/2"',
      unItem: 'KG', coef: 3.84185, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P39B', itemPlanilha: '177', item: '03-03-20', desc: 'Concreto FCK = 30 MPa — usinado',
      unItem: 'M3', coef: 0.72, unCoef: 'm³/ML', tipo: 'Manual' },
    // Muro E — 3. Fuste (parede)
    { pid: 'P39C', itemPlanilha: '175', item: '02-03-01', desc: 'Forma comum de tábuas de pinus',
      unItem: 'M2', coef: 4.7157, unCoef: 'm²/ML', tipo: 'Manual' },
    { pid: 'P39C', itemPlanilha: '176', item: '07-10-00', desc: 'Aço CA-50 — diâmetro ≥ 1/2"',
      unItem: 'KG', coef: 76.0136, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P39C', itemPlanilha: '177-C', item: '07-09-00', desc: 'Aço CA-50 — diâmetro < 1/2"',
      unItem: 'KG', coef: 4.14333, unCoef: 'kg/ML', tipo: 'Manual' },
    { pid: 'P39C', itemPlanilha: '177', item: '03-03-20', desc: 'Concreto FCK = 30 MPa — usinado',
      unItem: 'M3', coef: 0.7765, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39C', itemPlanilha: '177-H', item: '08-18-02', desc: 'Cimbramento metálico de altura maior que 3,00 m',
      unItem: 'M3', coef: 1.175, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39C', itemPlanilha: '177-G', item: '07-19-00', desc: 'Barbacãs de tubos de PVC — diâmetro 4"',
      unItem: 'UN', coef: 0.666667, unCoef: 'un/ML', tipo: 'Manual' },
    // Muro E — 4. Reaterro e acabamento
    { pid: 'P39D', itemPlanilha: '173', item: '04-08-00', desc: 'Reaterro compactado de fundação',
      unItem: 'M3', coef: 5.48519, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39D', itemPlanilha: '177-J', item: '04-31-00', desc: 'Fornecimento de terra (escavação, carga e transporte até 1,0 km)',
      unItem: 'M3', coef: 2.19058, unCoef: 'm³/ML', tipo: 'Manual' },
    { pid: 'P39D', itemPlanilha: '171', item: '04-60-00', desc: 'Remoção de terra além do 1º km',
      unItem: 'M3XKM', coef: 101.424, unCoef: 'm³xkm/ML', tipo: 'Manual' },
    // Rampa da escola (junto ao Muro C2)
    { pid: 'P40', itemPlanilha: '177-I', item: '13.02.11', desc: 'Piso estrutural em concreto armado — 7 cm',
      unItem: 'M2', coef: 1, unCoef: 'm²/m²', tipo: 'Auto' },
    { pid: 'P40', itemPlanilha: '177-A', item: '05-48-00', desc: 'Base de brita graduada',
      unItem: 'M3', coef: 0.1, unCoef: 'm³/m²', tipo: 'Manual' },
    { pid: 'P40', itemPlanilha: '177-F', item: '13-02-47', desc: 'Piso podotátil, alerta ou direcional, ladrilho hidráulico',
      unItem: 'M2', coef: 0.062443, unCoef: 'm²/m²', tipo: 'Manual' },
  ]
};
