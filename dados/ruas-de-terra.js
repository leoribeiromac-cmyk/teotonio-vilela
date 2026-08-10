/* ------------------------------------------------------------------
   Ruas de Terra 4 — Agrimensor & Astrogildo
   ------------------------------------------------------------------
   Cadastro da obra: identidade, frentes, cronograma físico por frente e
   os serviços do orçamento (quantidade prevista, sem valores em R$).

   Convertido do app "Gestor — Controle de Obras", que era onde esta obra
   estava cadastrada. Os LANÇAMENTOS não ficam aqui — vão para a mesma
   planilha das outras obras, distinguidos pela coluna `Obra`.

   `fonte: 'arquivo'` diz ao app que o cadastro vem deste arquivo, e não
   de planilha publicada. Para migrar esta obra para planilha um dia,
   basta trocar para 'csv' e preencher as URLs.
   ------------------------------------------------------------------ */
window.OBRAS_ARQ = window.OBRAS_ARQ || {};
window.OBRAS_ARQ['ruas-de-terra'] = {
  "id": "ruas-de-terra",
  "nome": "Ruas de Terra 4 — Agrimensor & Astrogildo",
  "nomeCurto": "Ruas de Terra 4",
  "subtitulo": "Pavimentação de ruas de terra",
  "contrato": "Ata 079/SMSUB/COGEL",
  "contratada": "Gestor Engenharia",
  "local": "Distrito de Itaquera — São Paulo/SP",
  "objeto": "Pavimentação das ruas Agrimensor Sugaya e Astrogildo Pereira",
  "valorGlobal": 3585081.43,
  "prazoMeses": 6,
  /* Data da ordem de início. É daqui que saem a janela do contrato
     (12/08/2026 a 12/02/2027, com os 6 meses de prazo), a curva prevista e
     o "status vs cronograma" do Painel Executivo. Até 10/08/2026 estava
     01/07/2026, que era provisório da conversão da obra. */
  "inicioISO": "2026-08-12",
  "fonte": "arquivo",
  "ruas": [
    "Agrimensor Sugaya",
    "Astrogildo Pereira"
  ],
  "estacas": {
    "Agrimensor Sugaya": 12,
    "Astrogildo Pereira": 18
  },
  /* Eixos estaqueados da obra. Aqui a estaca é da RUA, não do sentido de
     uma avenida: cada rua tem o seu estaqueamento próprio, começando na
     estaca 0. As faixas são as das memórias de cálculo do projeto —
     Agrimensor "Estaca 0+00 a 12+00" (240,00 m) e Astrogildo
     "Estaca 0,00 a 18+00" (360,00 m), 20 m por estaca.

     `id` é o que fica GRAVADO no lançamento, entre parênteses
     ("E4 a E7 (AGR)"). Trocar um id depois cega o histórico já lançado. */
  "eixoRotulo": "Rua",
  /* Pede o lado da via em cada lançamento (LD / LE / LD-LE, como cotam as
     memórias de cálculo). Meia pista é meio serviço: sem isso, "guia da E4
     à E7" tanto pode ser 60 m como 120 m. */
  "lados": true,
  "eixos": [
    { "id": "AGR", "label": "Agrimensor Sugaya",  "ini": 0, "fim": 12, "extensaoM": 240 },
    { "id": "AST", "label": "Astrogildo Pereira", "ini": 0, "fim": 18, "extensaoM": 360 }
  ],

  /* Croqui de estaqueamento: a planta da rua e a posição de cada estaca
     SOBRE ela. O mapa em grade diz quanto foi feito na estaca 7; isto diz
     onde fica a estaca 7. As coordenadas (fração da imagem, 0–1) são as dos
     rótulos que o projetista escreveu no desenho — não são estimadas.
     Gerado por `ferramentas/croqui-estacas.py`, que refaz imagem e números
     juntos a partir da prancha; não editar à mão. */
  "croquis": [
    { "eixo": "AGR", "arquivo": "projetos/ruas-de-terra/estaqueamento-agr.webp", "prancha": "CT-AS-101-1001-0F-DE", "disciplina": "Pavimentação", "largura": 1699, "altura": 598,
      "estacas": [
        {"n":0,"x":0.0464,"y":0.1319}, {"n":1,"x":0.1186,"y":0.2221}, {"n":2,"x":0.1985,"y":0.2603}, {"n":3,"x":0.2791,"y":0.2936},
        {"n":4,"x":0.3598,"y":0.322}, {"n":5,"x":0.4407,"y":0.3473}, {"n":6,"x":0.5217,"y":0.3728}, {"n":7,"x":0.6026,"y":0.3998},
        {"n":8,"x":0.6835,"y":0.4268}, {"n":9,"x":0.7644,"y":0.4552}, {"n":10,"x":0.8391,"y":0.5386}, {"n":11,"x":0.8965,"y":0.704},
        {"n":12,"x":0.9536,"y":0.8681}
      ] },
    { "eixo": "AST", "arquivo": "projetos/ruas-de-terra/estaqueamento-ast.webp", "prancha": "CT-AP-103-1001-0F-DE", "disciplina": "Terraplenagem", "largura": 1702, "altura": 930,
      "estacas": [
        {"n":0,"x":0.1015,"y":0.8924}, {"n":1,"x":0.0588,"y":0.7995}, {"n":2,"x":0.0645,"y":0.6805}, {"n":3,"x":0.0999,"y":0.5818},
        {"n":4,"x":0.1616,"y":0.5421}, {"n":5,"x":0.2266,"y":0.5438}, {"n":6,"x":0.2899,"y":0.5618}, {"n":7,"x":0.3532,"y":0.5797},
        {"n":8,"x":0.4165,"y":0.5975}, {"n":9,"x":0.4796,"y":0.6152}, {"n":10,"x":0.5427,"y":0.6332}, {"n":11,"x":0.6028,"y":0.6186},
        {"n":12,"x":0.6509,"y":0.5468}, {"n":13,"x":0.6972,"y":0.466}, {"n":14,"x":0.7438,"y":0.3855}, {"n":15,"x":0.7902,"y":0.3047},
        {"n":16,"x":0.8366,"y":0.2241}, {"n":17,"x":0.886,"y":0.1471}, {"n":18,"x":0.9412,"y":0.1076}
      ] }
  ],

  /* As pranchas do executivo, na tela Projetos. São PDFs (não pirâmide de
     quadrados como a da Teotônio): A1 de rua curta abre direto no PDF.js
     sem travar o celular. `ref` é o que a fiscalização usa para se referir
     à folha. */
  "projetos": [
    { "grupo": "Agrimensor Sugaya", "disciplina": "Pavimentação", "escala": "1:500",
      "ref": "Rua Agrimensor Sugaya — est. 0 a 12 (240,00 m)",
      "cod": "CT-AS-101-1001-0F-DE",
      "arquivo": "projetos/ruas-de-terra/agrimensor-pavimentacao.pdf" },
    { "grupo": "Agrimensor Sugaya", "disciplina": "Drenagem", "escala": "1:500",
      "ref": "Rua Agrimensor Sugaya — est. 0 a 12",
      "cod": "CT-AS-102-1001-0F-DE",
      "arquivo": "projetos/ruas-de-terra/agrimensor-drenagem.pdf" },
    { "grupo": "Astrogildo Pereira", "disciplina": "Pavimentação", "escala": "1:500",
      "ref": "Rua Astrogildo Pereira — est. 0 a 18 (360,00 m)",
      "cod": "CT-AP-101-1001-0G-DE",
      "arquivo": "projetos/ruas-de-terra/astrogildo-pavimentacao.pdf" },
    { "grupo": "Astrogildo Pereira", "disciplina": "Drenagem", "escala": "1:500",
      "ref": "Rua Astrogildo Pereira — est. 0 a 18",
      "cod": "CT-AP-102-1001-0G-DE",
      "arquivo": "projetos/ruas-de-terra/astrogildo-drenagem.pdf" },
    { "grupo": "Astrogildo Pereira", "disciplina": "Terraplenagem", "escala": "1:500",
      "ref": "Rua Astrogildo Pereira — planta e perfil, est. 0 a 18",
      "cod": "CT-AP-103-1001-0F-DE",
      "arquivo": "projetos/ruas-de-terra/astrogildo-terraplenagem.pdf" }
  ],
  "frentes": [
    {
      "id": 1,
      "nome": "Serviços Preliminares"
    },
    {
      "id": 2,
      "nome": "Pavimentação"
    },
    {
      "id": 3,
      "nome": "Calçada"
    },
    {
      "id": 4,
      "nome": "Demolição / Remanejamento"
    },
    {
      "id": 7,
      "nome": "Drenagem"
    },
    {
      "id": 8,
      "nome": "Terraplenagem"
    }
  ],
  "cronograma": [
    {
      "frenteId": 1,
      "pctMes": [
        85.97,
        3.11,
        3.11,
        4.71,
        1.55,
        1.55
      ]
    },
    {
      "frenteId": 2,
      "pctMes": [
        0.0,
        3.55,
        12.91,
        35.94,
        36.19,
        11.42
      ]
    },
    {
      "frenteId": 3,
      "pctMes": [
        0.0,
        0.0,
        13.6,
        42.99,
        43.41,
        0.0
      ]
    },
    {
      "frenteId": 4,
      "pctMes": [
        17.1,
        39.6,
        33.82,
        9.48,
        0.0,
        0.0
      ]
    },
    {
      "frenteId": 7,
      "pctMes": [
        25.21,
        48.55,
        5.91,
        7.28,
        6.53,
        6.53
      ]
    },
    {
      "frenteId": 8,
      "pctMes": [
        0.0,
        0.0,
        46.59,
        46.59,
        0.0,
        6.83
      ]
    }
  ],
  "coeficientes": [],
  /* As pranchas estão lá em cima, junto com os croquis. Aqui havia uma
     segunda lista `projetos`, herdada da conversão do app "Gestor": ela
     apontava para `projetos/agrimensor/…` e `projetos/astrogildo/…`, que
     nunca existiram neste repositório, e por ser a última do objeto era
     ela que valia — a tela Projetos desta obra abria só com erro 404. */
  "servicos": [
    {
      "rua": "Agrimensor Sugaya",
      "capId": 1,
      "servico": "Limpeza mecanizada geral",
      "descricaoOrig": "LIMPEZA MECANIZADA GERAL, INCLUSIVE REMOÇÃO DA COBERTURA VEGETAL - TRONCOS COM DIÂMETRO ATÉ 10CM - SEM TRANSPORTE",
      "un": "M2",
      "qtdPrev": 1846.2
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Regularização e compactação (IE-5)",
      "descricaoOrig": "REGULARIZAÇÃO E COMPACTAÇÃO DE RUAS DE TERRA (IE-5)",
      "un": "M2",
      "qtdPrev": 1700.65
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Abertura de caixa até 40cm",
      "descricaoOrig": "ABERTURA DE CAIXA ATÉ 40CM, INCLUI ESCAVAÇÃO, COMPACTAÇÃO, TRANSPORTE E PREPARO DO SUB-LEITO",
      "un": "M2",
      "qtdPrev": 1700.65
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Guia PMSP 100",
      "descricaoOrig": "INC.27 - FORNECIMENTO E ASSENTAMENTO DE GUIAS TIPO PMSP 100, INCLUSIVE ENCOSTAMENTO DE TERRA - FCK=25,0MPA",
      "un": "M",
      "qtdPrev": 512.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Base de concreto p/ guia (fck 15)",
      "descricaoOrig": "INC.27 - BASE DE CONCRETO FCK=15,00MPA PARA GUIAS, SARJETAS OU SARJETÕES",
      "un": "M3",
      "qtdPrev": 43.52,
      "medirPor": "area",
      "espessura": 0.1
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Sarjeta ou sarjetão (fck 20)",
      "descricaoOrig": "INC.27 - CONSTRUÇÃO DE SARJETA OU SARJETÃO DE CONCRETO - FCK= 20,0MPA",
      "un": "M3",
      "qtdPrev": 34.56,
      "medirPor": "area",
      "espessura": 0.15
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Base de macadame hidráulico",
      "descricaoOrig": "BASE DE MACADAME HIDRÁULICO",
      "un": "M3",
      "qtdPrev": 255.097,
      "medirPor": "area",
      "espessura": 0.15
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Base de macadame betuminoso",
      "descricaoOrig": "BASE DE MACADAME BETUMINOSO",
      "un": "M3",
      "qtdPrev": 255.097,
      "medirPor": "area",
      "espessura": 0.15
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Reforço de subleito — solo melhorado",
      "descricaoOrig": "REFORÇO DO SUB-LEITO/SUB-BASE DE SOLO MELHORADO COM AGREGADO RECICLADO 10% EM VOLUME, COM FORNECIMENTO DE AGREGADO",
      "un": "M3",
      "qtdPrev": 340.13,
      "medirPor": "area",
      "espessura": 0.2
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Imprimação ligante",
      "descricaoOrig": "INA.01 - IMPRIMAÇÃO BETUMINOSA LIGANTE",
      "un": "M2",
      "qtdPrev": 3401.3
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Imprimação impermeabilizante",
      "descricaoOrig": "IMPRIMAÇÃO BETUMINOSA IMPERMEABILIZANTE",
      "un": "M2",
      "qtdPrev": 1700.65
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 2,
      "servico": "Pré-misturado a quente (PMQ)",
      "descricaoOrig": "INA.01 - REVESTIMENTO DE PRÉ-MISTURADO À QUENTE (SEM TRANSPORTE)",
      "un": "M3",
      "qtdPrev": 170.065,
      "medirPor": "area",
      "espessura": 0.1
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 3,
      "servico": "Passeio de concreto (fck 25)",
      "descricaoOrig": "NC.27 - PASSEIO DE CONCRETO ARMADO, FCK=25MPA, INCLUINDO PREPARO DA CAIXA E LASTRO DE BRITA",
      "un": "M3",
      "qtdPrev": 48.229,
      "medirPor": "area",
      "espessura": 0.08
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 4,
      "servico": "Demolição de pavimento asfáltico",
      "descricaoOrig": "DEMOLIÇÃO DE PAVIMENTO ASFÁLTICO, INCLUSIVE CAPA, INCLUI CARGA NO CAMINHÃO",
      "un": "M2",
      "qtdPrev": 320.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 4,
      "servico": "Demolição de guias de concreto",
      "descricaoOrig": "DEMOLIÇÃO DE GUIAS DE CONCRETO",
      "un": "M",
      "qtdPrev": 80.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 4,
      "servico": "Demolição de sarjetas de concreto",
      "descricaoOrig": "DEMOLIÇÃO DE SARJETAS DE CONCRETO",
      "un": "M",
      "qtdPrev": 80.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Tubo de concreto simples Ø50",
      "descricaoOrig": "FORNECIMENTO E ASSENTAMENTO DE TUBOS DE CONCRETO SIMPLES - DIÂMETRO 50CM",
      "un": "M",
      "qtdPrev": 85.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Tubo de concreto armado Ø60 (PA-2)",
      "descricaoOrig": "FORNECIMENTO E ASSENTAMENTO DE TUBOS DE CONCRETO ARMADO, DIÂMETRO 60CM - TIPO PA-2",
      "un": "M",
      "qtdPrev": 222.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Escavação de vala (até 4,0 m)",
      "descricaoOrig": "ESCAVAÇÃO MECÂNICA PARA FUNDAÇÕES E VALAS COM PROFUNDIDADE MENOR OU IGUAL À 4,0M",
      "un": "M3",
      "qtdPrev": 1649.9
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Reenchimento de vala compactado",
      "descricaoOrig": "REENCHIMENTO DE VALA COM COMPACTAÇÃO, SEM FORNECIMENTO DE TERRA",
      "un": "M3",
      "qtdPrev": 1072.694
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Lastro de brita e pó de pedra",
      "descricaoOrig": "IHD.23 - LASTRO DE BRITA E PÓ DE PEDRA",
      "un": "M3",
      "qtdPrev": 59.395,
      "medirPor": "area"
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Escoramento de vala (madeira)",
      "descricaoOrig": "ESCORAMENTO DESCONTÍNUO DE MADEIRA PARA CANALIZAÇÃO DE TUBOS",
      "un": "M2",
      "qtdPrev": 861.62
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Poço de visita tipo 1",
      "descricaoOrig": "POÇO DE VISITA TIPO 1 - 1,40 X 1,40 X 1,40M",
      "un": "UN",
      "qtdPrev": 8.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Instalação de tampão articulado",
      "descricaoOrig": "INC.27 - INSTALAÇÃO DE TAMPÃO PARA GALERIA DE ÁGUAS PLUVIAIS - ARTICULADO, EXCETO FORNECIMENTO DE TAMPÃO",
      "un": "UN",
      "qtdPrev": 8.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Chaminé de poço de visita",
      "descricaoOrig": "CHAMINÉ DE POÇO DE VISITA COM ALVENARIA DE UM TIJOLO COMUM",
      "un": "M",
      "qtdPrev": 16.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 7,
      "servico": "Boca de lobo simples",
      "descricaoOrig": "BOCA DE LOBO SIMPLES",
      "un": "UN",
      "qtdPrev": 16.0
    },
    {
      "rua": "Agrimensor Sugaya",
      "capId": 8,
      "servico": "Aterro",
      "descricaoOrig": "ATERRO, INCLUSIVE COMPACTAÇÃO MANUAL",
      "un": "M3",
      "qtdPrev": 168.801
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 1,
      "servico": "Limpeza mecanizada geral",
      "descricaoOrig": "LIMPEZA MECANIZADA GERAL, INCLUSIVE REMOÇÃO DA COBERTURA VEGETAL - TRONCOS COM DIÂMETRO ATÉ 10CM - SEM TRANSPORTE",
      "un": "M2",
      "qtdPrev": 4280.4
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Regularização e compactação (IE-5)",
      "descricaoOrig": "REGULARIZAÇÃO E COMPACTAÇÃO DE RUAS DE TERRA (IE-5)",
      "un": "M2",
      "qtdPrev": 2984.4
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Abertura de caixa até 40cm",
      "descricaoOrig": "ABERTURA DE CAIXA ATÉ 40CM, INCLUI ESCAVAÇÃO, COMPACTAÇÃO, TRANSPORTE E PREPARO DO SUB-LEITO",
      "un": "M2",
      "qtdPrev": 2984.4
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Guia PMSP 100",
      "descricaoOrig": "INC.27 - FORNECIMENTO E ASSENTAMENTO DE GUIAS TIPO PMSP 100, INCLUSIVE ENCOSTAMENTO DE TERRA - FCK=25,0MPA",
      "un": "M",
      "qtdPrev": 720.0
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Base de concreto p/ guia (fck 15)",
      "descricaoOrig": "INC.27 - BASE DE CONCRETO FCK=15,00MPA PARA GUIAS, SARJETAS OU SARJETÕES",
      "un": "M3",
      "qtdPrev": 62.531,
      "medirPor": "area",
      "espessura": 0.1
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Sarjeta ou sarjetão (fck 20)",
      "descricaoOrig": "INC.27 - CONSTRUÇÃO DE SARJETA OU SARJETÃO DE CONCRETO - FCK= 20,0MPA",
      "un": "M3",
      "qtdPrev": 51.262,
      "medirPor": "area",
      "espessura": 0.15
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Base de macadame hidráulico",
      "descricaoOrig": "BASE DE MACADAME HIDRÁULICO",
      "un": "M3",
      "qtdPrev": 447.66,
      "medirPor": "area",
      "espessura": 0.15
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Base de macadame betuminoso",
      "descricaoOrig": "BASE DE MACADAME BETUMINOSO",
      "un": "M3",
      "qtdPrev": 447.66,
      "medirPor": "area",
      "espessura": 0.15
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Reforço de subleito — solo melhorado",
      "descricaoOrig": "REFORÇO DO SUB-LEITO/SUB-BASE DE SOLO MELHORADO COM AGREGADO RECICLADO 10% EM VOLUME, COM FORNECIMENTO DE AGREGADO",
      "un": "M3",
      "qtdPrev": 596.88,
      "medirPor": "area",
      "espessura": 0.2
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Imprimação ligante",
      "descricaoOrig": "INA.01 - IMPRIMAÇÃO BETUMINOSA LIGANTE",
      "un": "M2",
      "qtdPrev": 5968.8
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Imprimação impermeabilizante",
      "descricaoOrig": "IMPRIMAÇÃO BETUMINOSA IMPERMEABILIZANTE",
      "un": "M2",
      "qtdPrev": 2984.4
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 2,
      "servico": "Pré-misturado a quente (PMQ)",
      "descricaoOrig": "INA.01 - REVESTIMENTO DE PRÉ-MISTURADO À QUENTE (SEM TRANSPORTE)",
      "un": "M3",
      "qtdPrev": 298.44,
      "medirPor": "area",
      "espessura": 0.1
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 3,
      "servico": "Passeio de concreto (fck 25)",
      "descricaoOrig": "NC.27 - PASSEIO DE CONCRETO ARMADO, FCK=25MPA, INCLUINDO PREPARO DA CAIXA E LASTRO DE BRITA",
      "un": "M3",
      "qtdPrev": 69.026,
      "medirPor": "area",
      "espessura": 0.08
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 4,
      "servico": "Demolição de pavimento asfáltico",
      "descricaoOrig": "DEMOLIÇÃO DE PAVIMENTO ASFÁLTICO, INCLUSIVE CAPA, INCLUI CARGA NO CAMINHÃO",
      "un": "M2",
      "qtdPrev": 2984.4
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 4,
      "servico": "Demolição de guias de concreto",
      "descricaoOrig": "DEMOLIÇÃO DE GUIAS DE CONCRETO",
      "un": "M",
      "qtdPrev": 720.0
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 4,
      "servico": "Demolição de sarjetas de concreto",
      "descricaoOrig": "DEMOLIÇÃO DE SARJETAS DE CONCRETO",
      "un": "M",
      "qtdPrev": 720.0
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 7,
      "servico": "Lastro de brita e pó de pedra",
      "descricaoOrig": "IHD.23 - LASTRO DE BRITA E PÓ DE PEDRA",
      "un": "M3",
      "qtdPrev": 86.4,
      "medirPor": "area"
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 7,
      "servico": "Instalação de tampão articulado",
      "descricaoOrig": "INC.27 - INSTALAÇÃO DE TAMPÃO PARA GALERIA DE ÁGUAS PLUVIAIS - ARTICULADO, EXCETO FORNECIMENTO DE TAMPÃO",
      "un": "UN",
      "qtdPrev": 9.0
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 7,
      "servico": "Chaminé de poço de visita",
      "descricaoOrig": "CHAMINÉ DE POÇO DE VISITA COM ALVENARIA DE UM TIJOLO COMUM",
      "un": "M",
      "qtdPrev": 18.0
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 7,
      "servico": "Boca de lobo simples",
      "descricaoOrig": "BOCA DE LOBO SIMPLES",
      "un": "UN",
      "qtdPrev": 13.0
    },
    {
      "rua": "Astrogildo Pereira",
      "capId": 8,
      "servico": "Aterro",
      "descricaoOrig": "ATERRO, INCLUSIVE COMPACTAÇÃO MANUAL",
      "un": "M3",
      "qtdPrev": 86.283
    }
  ]
};
