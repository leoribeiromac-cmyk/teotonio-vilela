/* ------------------------------------------------------------------
   Ranário — Estrada Vicinal SQE-479
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
window.OBRAS_ARQ['ranario'] = {
  "id": "ranario",
  "nome": "Ranário — Estrada Vicinal SQE-479",
  "nomeCurto": "Ranário",
  "subtitulo": "Estrada Vicinal SQE-479",
  "contrato": "Contrato 22.926-0 · DER-SP (Edital 193/2022 — Lote 26)",
  "contratada": "Gestor Engenharia",
  "local": "Estrada do Ranário — São Roque/SP",
  "objeto": "Novas Vicinais Fase 9 — recuperação da estrada vicinal SQE-479 (Estrada do Ranário), ligação Ranaville / São João do Novo, SP-274 km 52,3, São Roque/SP. Lote 26.",
  "valorGlobal": 6471909.89,
  "prazoMeses": 7,
  "inicioISO": "2026-05-06",
  "fonte": "arquivo",
  "ruas": [
    "Estrada do Ranário (SQE-479)"
  ],
  "estacas": {
    "Estrada do Ranário (SQE-479)": 87
  },
  "frentes": [
    {
      "id": 21,
      "nome": "Serviços Preliminares"
    },
    {
      "id": 22,
      "nome": "Terraplenagem"
    },
    {
      "id": 23,
      "nome": "Pavimentação"
    },
    {
      "id": 24,
      "nome": "Drenagem e Obras de Arte Corrente"
    },
    {
      "id": 28,
      "nome": "Sinalização e Segurança"
    },
    {
      "id": 30,
      "nome": "Meio Ambiente"
    }
  ],
  "cronograma": [
    {
      "frenteId": 21,
      "pctMes": [
        0.0,
        0.0,
        35.0,
        55.0,
        10.0,
        0.0,
        0.0
      ]
    },
    {
      "frenteId": 22,
      "pctMes": [
        0.0,
        19.22,
        25.64,
        28.9,
        14.97,
        7.87,
        3.39
      ]
    },
    {
      "frenteId": 23,
      "pctMes": [
        0.0,
        0.0,
        8.86,
        19.83,
        22.03,
        33.03,
        16.25
      ]
    },
    {
      "frenteId": 24,
      "pctMes": [
        0.0,
        0.42,
        29.88,
        34.43,
        24.02,
        8.86,
        2.4
      ]
    },
    {
      "frenteId": 28,
      "pctMes": [
        0.0,
        1.27,
        0.55,
        0.55,
        0.55,
        5.35,
        91.71
      ]
    },
    {
      "frenteId": 30,
      "pctMes": [
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        30.0,
        70.0
      ]
    }
  ],
  "coeficientes": [],
  "projetos": [],
  "servicos": [
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 21,
      "servico": "Remoção de canalização D > 0,60 m",
      "descricaoOrig": "21.03.06 — REMOÇÃO CANALIZAÇÃO D> 0,60 M",
      "un": "M",
      "qtdPrev": 22.26
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 21,
      "servico": "Remoção de canalização D < 0,60 m",
      "descricaoOrig": "21.03.07 — REMOÇÃO CANALIZAÇÃO D< 0,60 M",
      "un": "M",
      "qtdPrev": 34.12
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 21,
      "servico": "Demolição de concreto simples",
      "descricaoOrig": "21.05.02 — DEMOLIÇÃO DE CONCRETO SIMPLES",
      "un": "M3",
      "qtdPrev": 14.63
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 22,
      "servico": "Limpeza do terreno com destocamento",
      "descricaoOrig": "22.01.02 — LIMP. TERRENO COM DESTOCAMENTO DE ÁRVORES PERÍMETRO <= 78 CM",
      "un": "M2",
      "qtdPrev": 34571.26
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 22,
      "servico": "Escavação e carga de material de 1ª/2ª categoria",
      "descricaoOrig": "22.02.01 — ESCAVAÇÃO E CARGA DE MATERIAL DE 1/2º CATEGORIA",
      "un": "M3",
      "qtdPrev": 14100.66
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 22,
      "servico": "Escavação e carga de solo mole sob lâmina d'água",
      "descricaoOrig": "22.02.05 — ESCAVAÇÃO E CARGA DE SOLO MOLE SOB LÂMINA D' ÁGUA",
      "un": "M3",
      "qtdPrev": 130.41
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 22,
      "servico": "Carga de material de limpeza",
      "descricaoOrig": "22.02.06 — CARGA DE MATERIAL DE LIMPEZA",
      "un": "M3",
      "qtdPrev": 5185.69
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 22,
      "servico": "Espalhamento e compactação em bota-fora",
      "descricaoOrig": "22.02.09 — ESPALHAMENTO/ REGULARIZAÇÃO/COMPACTAÇÃO DE MATERIAL EM BOTA-FORA",
      "un": "M3",
      "qtdPrev": 5398.91
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 22,
      "servico": "Compactação de aterro ≥ 95% PS",
      "descricaoOrig": "22.04.01 — COMPACTAÇÃO DE ATERRO MAIOR/IGUAL 95% PS",
      "un": "M3",
      "qtdPrev": 11280.37
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 22,
      "servico": "Fundação de aterro com pedra rachão",
      "descricaoOrig": "22.06.04 — FUNDAÇÃO DE ATERRO C/ PED. RACHÃO",
      "un": "M3",
      "qtdPrev": 130.41
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Melhoramento / preparo do sub-leito",
      "descricaoOrig": "23.02.01 — MELH/PREPARO SUB-LEITO - 100% EN",
      "un": "M2",
      "qtdPrev": 16495.89
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Reforço do sub-leito com solo escolhido",
      "descricaoOrig": "23.03.01 — REFORCO SUB-LEITO ESCAV. SOLO ESCOLHIDO",
      "un": "M3",
      "qtdPrev": 1603.67
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Sub-base ou base de solo-cimento 4%",
      "descricaoOrig": "23.04.01.12.01 — SUB BASE OU BASE SOLO CIM.4%-PULVEMIST.-COM TRANSP.JAZIDA ATE LOCAL APLICACAO",
      "un": "M3",
      "qtdPrev": 1603.67
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Sub-base ou base de brita graduada simples",
      "descricaoOrig": "23.04.03.01 — SUB-BASE OU BASE BRITA GRADUADA SIMPLES",
      "un": "M3",
      "qtdPrev": 2160.12
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Sub-base ou base de macadame seco",
      "descricaoOrig": "23.04.06.03 — SUB-BASE OU BASE MACADAME SECO",
      "un": "M3",
      "qtdPrev": 3986.14
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Imprimadura betuminosa impermeabilizante",
      "descricaoOrig": "23.05.01 — IMPRIMADURA BETUMINOSA IMPERMEABILIZANTE",
      "un": "M2",
      "qtdPrev": 14070.03
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Imprimadura betuminosa ligante",
      "descricaoOrig": "23.05.02 — IMPRIMADURA BETUMINOSA LIGANTE",
      "un": "M2",
      "qtdPrev": 13408.43
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 23,
      "servico": "Camada de rolamento — CBUQ graduação C (com DOP)",
      "descricaoOrig": "23.08.03.03 — CAMADA ROLAMENTO - CBUQ - GRAD.C - COM DOP",
      "un": "M3",
      "qtdPrev": 532.81
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Escavação manual para obras",
      "descricaoOrig": "24.02.01 — ESCAVAÇÃO MANUAL PARA OBRAS S/ EXPLOSIVO",
      "un": "M3",
      "qtdPrev": 1122.55
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Escavação mecânica para obras",
      "descricaoOrig": "24.02.02 — ESCAVAÇÃO MECÂNICA PARA OBRAS S/ EXPLOSIVO",
      "un": "M3",
      "qtdPrev": 26.12
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Escavação de fundação de bueiro ou dreno até 2 m",
      "descricaoOrig": "24.02.08 — ESCAV. FUND. BUEIRO OU DRENO S/ EXPL. ATÉ 2 M",
      "un": "M3",
      "qtdPrev": 1039.02
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Acréscimo de escavação de 1,5 m além de 2 m",
      "descricaoOrig": "24.02.09 — ACRESC. P/ ESCAV. 1,5 M PROFUNDIDADE ALÉM 2M",
      "un": "M3",
      "qtdPrev": 37.39
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Escoramento de valas e cavas",
      "descricaoOrig": "24.03.07 — ESCORAMENTO DE VALAS/CAVAS P/ FUND. DESC.",
      "un": "M2",
      "qtdPrev": 101.88
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Cimbramento de passagem e galeria",
      "descricaoOrig": "24.04.01 — CIMBRAMENTO DE PASSAGEM SECUND. E GALERIA RET.",
      "un": "M3",
      "qtdPrev": 45.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Forma plana para concreto comum",
      "descricaoOrig": "24.05.01 — FORMA PLANA PARA CONCRETO COMUM",
      "un": "M2",
      "qtdPrev": 963.4
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Forma plana para concreto aparente",
      "descricaoOrig": "24.05.02 — FORMA PLANA PARA CONCRETO APARENTE",
      "un": "M2",
      "qtdPrev": 171.15
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Barra de aço CA-50",
      "descricaoOrig": "24.06.02 — BARRA DE AÇO CA-50",
      "un": "KG",
      "qtdPrev": 10643.23
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Concreto fck 10 MPa",
      "descricaoOrig": "24.07.01 — CONCRETO FCK 10 MPA",
      "un": "M3",
      "qtdPrev": 11.75
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Concreto fck 15 MPa",
      "descricaoOrig": "24.07.02 — CONCRETO FCK 15 MPA",
      "un": "M3",
      "qtdPrev": 333.89
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Concreto fck 20 MPa",
      "descricaoOrig": "24.07.04 — CONCRETO FCK 20 MPA",
      "un": "M3",
      "qtdPrev": 45.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Concreto fck 25 MPa",
      "descricaoOrig": "24.07.05 — CONCRETO FCK 25 MPA",
      "un": "M3",
      "qtdPrev": 89.97
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Bombeamento de concreto",
      "descricaoOrig": "24.07.09 — BOMBEAMENTO P/ CONCRETO QUALQUER RESIST.",
      "un": "M3",
      "qtdPrev": 86.42
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Junta elástica em PVC tipo O-12",
      "descricaoOrig": "24.08.01 — JUNTA ELASTICA EM PVC TIPO O-12",
      "un": "M",
      "qtdPrev": 10.88
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Enrocamento de pedra arrumada e rejuntada",
      "descricaoOrig": "24.09.02 — ENROCAMENTO PEDRA ARRUMADA E REJUNTADA",
      "un": "M3",
      "qtdPrev": 84.93
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Alvenaria de bloco de concreto",
      "descricaoOrig": "24.11.05 — ALVENARIA DE BLOCO DE CONCRETO",
      "un": "M3",
      "qtdPrev": 28.23
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Argamassa de cimento e areia 1:3 e = 2 cm",
      "descricaoOrig": "24.11.07 — ARGAM. DE CIMENTO E AREIA TRAÇO 1:3 E=2 CM",
      "un": "M2",
      "qtdPrev": 68.34
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Enchimento de vala com pedra britada 1 e 2",
      "descricaoOrig": "24.12.01.01 — ENCHIMENTO DE VALA COM PEDRA BRITADA 1 E 2",
      "un": "M3",
      "qtdPrev": 179.13
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Enchimento de vala com bica corrida",
      "descricaoOrig": "24.12.01.03 — ENCHIMENTO DE VALA COM BICA CORRIDA",
      "un": "M3",
      "qtdPrev": 35.44
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Enchimento da base do tubo com pedra britada",
      "descricaoOrig": "24.12.05 — ENCHIMENTO BASE TUBO COM PEDRA BRITADA",
      "un": "M3",
      "qtdPrev": 30.36
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Compactação manual com reaterro de solo local",
      "descricaoOrig": "24.12.08 — COMPACTAÇÃO MANUAL C/ REATERRO SOLO LOCAL",
      "un": "M3",
      "qtdPrev": 655.07
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Compactação manual de bases de caixas e valas",
      "descricaoOrig": "24.12.09 — COMPACTAÇÃO MANUAL PARA BASES DE CAIXAS E VALAS",
      "un": "M2",
      "qtdPrev": 187.47
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Manta geotêxtil não tecida 14 kN/m",
      "descricaoOrig": "24.14.01.05 — MANTA GEOTEXTIL NÃO TECIDA RESISTÊNCIA LONGITUDINAL 14 KN/M",
      "un": "M2",
      "qtdPrev": 3201.93
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Tubo de PVC perfurado D = 0,10 m (dreno)",
      "descricaoOrig": "24.15.07 — TUBO DE PVC PERFURADO OU NÃO D=0,10M",
      "un": "M",
      "qtdPrev": 2186.11
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Tubo de concreto D = 0,60 m PA-2",
      "descricaoOrig": "24.16.08 — TUBO DE CONCRETO D=0,60M CLASSE PA-2",
      "un": "M",
      "qtdPrev": 21.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Tubo de concreto D = 0,80 m PA-2",
      "descricaoOrig": "24.16.12 — TUBO DE CONCRETO D=0,80M CLASSE PA-2",
      "un": "M",
      "qtdPrev": 35.5
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Tubo de concreto D = 1,50 m PA-2",
      "descricaoOrig": "24.16.24 — TUBO DE CONCRETO D=1,50M CLASSE PA-2",
      "un": "M",
      "qtdPrev": 16.5
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 24,
      "servico": "Grelha de concreto 10 x 44 x 120 cm",
      "descricaoOrig": "24.19.07.01 — GRELHA DE CONCRETO DE 10 X 44 X 120 CM - FCK 20 MPA",
      "un": "UN",
      "qtdPrev": 8.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Colocação de placa em suporte de madeira/metálico",
      "descricaoOrig": "28.01.24.01 — COLOCAÇÃO DE PLACA EM SUPORTE DE MADEIRA/METÁLICO - SOLO",
      "un": "M2",
      "qtdPrev": 47.53
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Placa de alumínio 3 mm — película tipo III",
      "descricaoOrig": "28.01.31.03 — PLACA EM ALUMINIO COMPOSTO 3MM, EM SOLO, COM PELICULA RETRORRELETIVA TIPO III",
      "un": "M2",
      "qtdPrev": 25.49
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Placa de alumínio 3 mm — película tipo X",
      "descricaoOrig": "28.01.31.04 — PLACA EM ALUMINIO COMPOSTO 3MM, EM SOLO, COM PELICULA RETRORRELETIVA TIPO X",
      "un": "M2",
      "qtdPrev": 22.04
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Sinalização horizontal — tinta para pouco tráfego",
      "descricaoOrig": "28.03.06 — SINALIZAÇÃO HORIZONTAL  TINTA P/ POUCO TRAFEGO",
      "un": "M2",
      "qtdPrev": 285.9
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Sinalização horizontal — acrílica base água",
      "descricaoOrig": "28.03.07 — SINALIZAÇÃO HORIZONTAL ACRÍLICA BASE ÁGUA",
      "un": "M2",
      "qtdPrev": 707.18
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Tacha monodirecional refletiva",
      "descricaoOrig": "28.03.13 — TACHA MONODIRECIONAL REFLETIVO PLASTICO",
      "un": "UN",
      "qtdPrev": 498.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Tacha bidirecional refletiva",
      "descricaoOrig": "28.03.14 — TACHA BIDIRECIONAL REFLETIVO PLASTICO",
      "un": "UN",
      "qtdPrev": 239.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Defensa metálica simples NBR 15486",
      "descricaoOrig": "28.05.11.08 — FORNEC. TRANSP. INST. DE DEFENSA METÁLICA NBR 15486 H1 A W4 SIMPLES",
      "un": "M",
      "qtdPrev": 704.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Suporte de madeira tratada 0,10 x 0,10 m",
      "descricaoOrig": "28.06.10 — SUPORTE MADEIRA TRATADA 0,10 X 0,10M",
      "un": "M",
      "qtdPrev": 250.1
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 28,
      "servico": "Balizador catadióptrico para defensa",
      "descricaoOrig": "28.10.01 — FORN./INSTAL. BALIZ.  (CATADIOPTRICO) P/ DEF. MET. C/ PELÍCULA GT+GT, CONF. OP-06-05",
      "un": "UN",
      "qtdPrev": 56.0
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 30,
      "servico": "Grama em placa com adubo",
      "descricaoOrig": "30.01.02 — GRAMA EM PLACA COM ADUBO",
      "un": "M2",
      "qtdPrev": 5165.74
    },
    {
      "rua": "Estrada do Ranário (SQE-479)",
      "capId": 30,
      "servico": "Irrigação de revestimento vegetal",
      "descricaoOrig": "30.01.08 — IRRIGAÇÃO DE REVESTIMENTO VEGETAL",
      "un": "M2",
      "qtdPrev": 20662.97
    }
  ]
};
