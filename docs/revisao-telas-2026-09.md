# Revisão completa — telas, funções, processo e visual

**Data:** 07/09/2026 · **Base:** `main` em `231285d` (PR #74) · **Branch desta revisão:** `claude/revisao-telas-funcoes-zyihic`

## 0. Resumo executivo

O app está maduro: fila offline com idempotência de ponta a ponta, rascunho que sobrevive ao descarte da aba, PDF oficial desenhado num lugar só, service worker com três baldes, 54 arquivos de teste que rodam o app de verdade no Chromium. Os problemas que apareceram não são de arquitetura. Eles se concentram em cinco grupos:

1. **Estado que atravessa a troca de obra** (RDO Diário, medições fechadas, recomendação IA): quem trabalha em duas obras vê e grava dado da obra errada.
2. **Dinheiro e data errados por parser e fuso**: frete "900.50" vira R$ 90.050; apontamento noturno e nota fiscal lançados depois das 21h caem no dia seguinte.
3. **Segurança do backend**: uma ação de diagnóstico entrega o token de sessão do administrador a qualquer usuário logado; outra baixa qualquer arquivo do Drive do dono.
4. **O celular, que é por onde o apontador entra**: título do cabeçalho ilegível, filtros da Galeria ocupando a tela inteira, KPIs empilhados, menu lateral cortado no desktop.
5. **O Painel Executivo** calcula a projeção de término com o saldo errado quando há filtro de mês, e o PDF executivo imprime um número que não é o da tela.

Além disso, **a CI da `main` está vermelha desde 01/09** (quatro merges sem porteiro). A causa era uma asserção velha em `tests/muros-contencao.test.js`; corrigi nesta branch. E, a pedido, **"p.p." virou "%"** em todo o Painel, na Curva S, no PDF executivo e no prompt da IA.

### O que fazer primeiro (as dez de maior retorno)

| # | Achado | Onde | Esforço |
|---|--------|------|---------|
| 1 | `nfDiag` devolve as chaves das Propriedades, inclusive os tokens de sessão `SES_*` | `Code.gs:4890` | P |
| 2 | Frete com ponto decimal multiplica por 100 (`num()` em vez de `numCampo()`) | `bota-fora.js:126` | P |
| 3 | Data "hoje" em UTC no Equipamentos e nas Notas | `equipamentos.js:1787`, `adaptador.js:83` | P |
| 4 | RDO Diário, medições fechadas e recomendação IA não são zerados ao trocar de obra | `index.html:3636` | P |
| 5 | Carga de fundo que falha redesenha por cima do formulário aberto | `index.html:6929` | P |
| 6 | Serviço com pacote e quantidade vazia é descartado em silêncio ao gravar | `index.html:16135` | P |
| 7 | Prazo de 60 dias do link de assinatura nunca vence (célula vira `Date`) | `Code.gs:3354` | P |
| 8 | Projeção de término usa `1 − ganho do mês` como saldo quando há filtro de mês | `index.html:9913` | P |
| 9 | Cabeçalho do celular: título com 45 px para um texto de 101 px | `index.html:5788` | P |
| 10 | `obterFoto` entrega qualquer arquivo do Drive do dono por id | `Code.gs:1866` | P/M |

## Andamento — 08/09/2026

A **Onda 1** está implementada na branch (commits `9d202c2` backend, `2dd0333` módulos, `3bfed6c` app) e a suíte completa passa: **54 de 54 arquivos**, com 3 casos de regressão novos (frete "900.50", carga de fundo que falha, rascunho ao sair da tela) e 14 casos novos nos testes de servidor.

- **Backend**: B1 (`nfDiag` só admin, sem `SES_`/`AUDQ_`), B2 (`obterFoto` só de pastas do app), B3 (prazo do link com `normData`; `assinadoEm` legível), B4 (contagem de firmas limitada pela aba).
- **Módulos**: BF1 (frete via `numCampo`), Q1 (datas locais no Equipamentos e nas Notas).
- **Estado por obra**: D1, M1, E6.
- **Formulário**: K1, K3, L1, L8.
- **Painel**: E1, E2, E4, E5.
- **Celular e visual**: S2 (no celular "Sair" sai do topo e "+ Novo Serviço" vira só o "+"), G1, P3, D5, V1, V3, V4.
- Antes disso: "p.p." → "%" e o teste do muro que deixava a CI vermelha.

Ficou de fora da Onda 1, por não ser código: **proteger a `main`** com a regra de branch que exige o workflow "Testes" (Settings → Branches no GitHub). E um lembrete: o `nfDiag` é bloco compartilhado com o `gestor-obras`; a correção precisa ser espelhada lá, adaptando `exigirAdmin` e os prefixos de sessão.

## 1. Como a revisão foi feita

- Leitura do código em seis frentes: núcleo do app, telas analíticas, telas de apontamento, módulos externos (`js/`), sistema visual (CSS) e backend (`Code.gs`). Cada achado foi conferido no código antes de entrar aqui.
- Suíte de testes rodada localmente contra o app servido em `localhost:8099`, com o Chromium 1194 (o mesmo do harness): **53 arquivos passam, 1 falha** (`muros-contencao`, ver §2). Tempo total: 9m54s.
- Screenshots das 16 telas em desktop (1440×950) e celular (390×844, 3×), nos temas claro e escuro, com e sem login, usando o harness de testes (planilha e Apps Script falsos, 1.500 lançamentos, 100 RDOs).
- Medições no DOM: nós por tela, altura de página no celular, largura útil do título, alvos de toque, altura dos blocos de KPI, conteúdo do menu lateral que fica fora da tela.

Tamanhos de referência: `index.html` 1,04 MB (19.716 linhas: 3.160 de CSS, ~16.450 de JS, 450 funções de topo), `Code.gs` 248 KB, `notas.js` 233 KB, `equipamentos.js` 105 KB, `bota-fora.js` 44 KB.

## 2. Estado atual: CI e testes

- **CI vermelha na `main` desde 01/09** (runs 86, 87, 88, 90 e 92). Causa: `tests/muros-contencao.test.js:111` conferia `html.includes('.f-Muro{')`, e a classe saiu no commit `baefd7f` ("uma cor por frente"). O app estava certo, o teste ficou para trás. **Corrigido nesta branch**: a asserção agora confere `function corDaFrente(`, que é o mecanismo que dá cor a toda frente.
- Todos os outros 53 arquivos passam localmente, inclusive os de PDF (paginação e equipamentos), que dependem da versão do Chromium.
- Vale um porteiro na `main`: hoje um merge com teste vermelho vai para o canteiro. Uma regra de proteção de branch exigindo o workflow "Testes" resolve.

## 3. Achados por tela

Legenda: **Impacto** alto / médio / baixo · **Esforço** P (horas) / M (um dia) / G (vários dias).

### 3.1 Barra lateral, cabeçalho e navegação

**S1 · O menu lateral fica cortado no desktop** · `index.html` (`.sidebar-nav`) · alto · P
A lista de telas tem 814 px de conteúdo; o espaço que sobra para ela é 429 px numa tela de 1440×950, 247 px em 1366×768 e 200 px em 1280×720. Fora da tela sem rolar: Usuários (950), mais Galeria, Projetos e Notas (768), mais Equipamentos e Bota-Fora (720). A lista rola, mas nada indica isso, e o rodapé (cartão do usuário, SAIR, status de sincronização, APRESENTAR, seletor de tema com três botões, crédito) ocupa mais de 300 px.
Proposta: compactar o rodapé (tema num só botão cíclico ou dentro de um popover de conta; SAIR só num lugar; crédito menor) e pôr uma sombra de rolagem na lista (`mask-image` ou um `::after` que some quando chega ao fim).

**S2 · No celular o título da tela é ilegível** · `index.html:5788-5800` · alto · P
Medido: o `#pageTitle` recebe 45 px de largura para um texto que precisa de 101 px ("Paine…", "Avan…", "Cron…"). Os quatro botões do topo (sair, buscar, atualizar, "+ Novo Serviço") ficam com o resto. A barra inferior já tem "Lançar", então "+ Novo Serviço" no topo é a terceira porta para a mesma tela (a Central de Campo é a quarta).
Proposta: no celular, tirar "+ Novo Serviço" e "Sair" do topo (a gaveta já tem SAIR) e deixar título + buscar + atualizar. O ícone de "Sair" e "Entrar" é o mesmo desenho (seta saindo da caixa) sem rótulo; no mínimo usar ícones diferentes.

**S3 · `.nav-item` é `<div onclick>`** · `index.html:7253` · médio · P
Sem foco de teclado, sem Enter, sem `aria-current`. Nenhum `:focus-visible` no app inteiro. Trocar por `<button>` e uma regra `:focus-visible` com `outline: 2px solid var(--acc)`.

**S4 · Boot em branco até os cinco CSVs chegarem** · `index.html:19167`, `5231` · médio · P
`navigate('executivo')` retorna na primeira linha porque `currentPage` já é `executivo`, então nenhum `render()` roda antes de `carregarTudo` resolver. No celular fica cabeçalho e vazio durante todo o download. Chamar `render()` logo após `renderShell()`.

**S5 · Perfil "campo" numa obra sem acesso cai em tela bloqueada** · `index.html:5738`, `3684` · baixo · P
`trocarObra` força `currentPage='executivo'`, que o perfil campo não vê. Usar o mesmo fallback de `concluirLogin`.

### 3.2 Painel Executivo

**E1 · Término no ritmo atual com saldo errado quando há filtro de mês** · `index.html:9908-9915`, `10484` · alto · P
`calcExecMetrics` recebe só a fatia do mês; `remaining = 1 − total` usa o ganho do mês como se fosse o acumulado, e a data prevista sai centenas de dias além da que a Curva S mostra na mesma tela. Calcular `remaining` a partir de `pctPondAcum`.

**E2 · O PDF executivo imprime como "avanço realizado" um número que não é o da tela** · `index.html:10848`, `10938-10944`, `11248` · alto · P
`pctPond = metrics.current` (curva) enquanto a tela mostra `pctPondAcum` (pacotes). Com filtro de mês o PDF anuncia o ganho do mês como avanço realizado, ao lado de um gap calculado sobre o acumulado. E o nome do arquivo usa `toISOString`, que às 22h já é amanhã. Gravar `pctPondAcum` em `STATE.dashData` e usar `getLocalISODate`.

**E3 · Curva S, velocidade e mapa de estacas não aplicam as travas do painel** · `index.html:9845`, `9947`, `10161` vs `7031-7052` · alto · M
`calcularAvancoPorPacote` normaliza o ID do pacote (`"p01 "`) e recusa quantidade negativa; `calcCumulativoDia`, `calcFrentesAnalise` e `calcAvancoPorEstaca` fazem `info[pid]` cru. O número grande e a curva divergem em planilha suja, e o próprio comentário admite que 400 de 1.300 unidades já saíram por caixa/espaço. Extrair `normalizarLancamentos()` e usar nos quatro.

**E4 · "Frentes sem lançamento" corta em 3 e enche com frentes concluídas** · `index.html:9957-9970`, `10530`, `10704` · alto · P
O KPI mostra `atencao.length` depois do `slice(0,3)` ("3 de 9" com seis paradas), e a ordenação ignora `pct`: frente terminada há meses e frente que nunca começou ocupam o topo para sempre. Alimenta a narrativa, o prompt da IA e o PDF. Excluir `pct ≥ 0,999` e contar antes do `slice`.

**E5 · O rótulo "Avanço acumulado · últimos 30 dias" fica por baixo da sparkline** · `index.html:2325-2335`, `10615` · médio · P
Confirmado nos screenshots de desktop e celular, mesmo 3 s depois do render: `.hero-spark` tem 64 px (50 no celular) com o rótulo absoluto em `top:12px`, e o Chart.js estica o canvas para a altura toda do contêiner. O canvas precisa começar abaixo do rótulo (`margin-top` ≈ 22 px) ou o contêiner precisa de mais altura.

**E6 · Recomendação IA em cache global de 6 h, sem obra nem filtro na chave** · `index.html:10067-10078` · médio · P
Trocar de obra ou de filtro mostra a recomendação da outra situação. Chave `lsObra(...) + mes + frente`.

**E7 · Cada render varre o CSV 5 a 6 vezes; `montarGraficos` roda duas vezes por navegação** · `index.html:10419-10501`, `5226`, `7903` · médio · M
`calcularAvancoPorPacote` (regex de estaca por linha) 2×, `calcCumulativoDia`, `calcFrentesAnalise` com `find` por linha, `calcAvancoPorEstaca` de novo. E `transitionTo` e `render()` agendam ambos `montarGraficos`: sparkline e Curva S são destruídas e recriadas duas vezes a cada entrada, filtro e troca de tema. Índice `Map` de pacotes por ID em `carregarTudo`, memoização de `lerLocalEstaca`, e os botões de horizonte/ritmo só remontam o gráfico.

**E8 · Três calendários de "dia útil"** · `index.html:9877`, `12266`, `4563` · médio · P
Executivo e motor do Gantt pulam só domingos; Cronograma e Improdutivos usam feriados e sábado configurável. O mesmo saldo dá "N dias úteis" diferentes em duas telas. `contarDiasUteis`/`addWorkingDays` passam a chamar `ehDiaUtil`.

**E9 · Alvos de toque de 26 px** · engrenagem e "gerar nova recomendação" no cartão da IA; "7d" com 33 px · baixo · P

### 3.3 Avanço Físico

**F1 · O parse de estaca roda 3× por render** · `calcularAvancoPorPacote`, `calcAvancoPorEstaca`, `dadosPlantaAvanco` · médio · P (junto de E7)
**F2 · "Histórico" entra no Avanço Físico e sai do Executivo** · `index.html:11963` vs `10360` · baixo · P
O "% da frente" pode divergir entre as duas telas quando o status for usado. Avanço ponderado por frente também é calculado 3× com o mesmo laço (`pctPondDaFrente` já existe).
**F3 · Célula do croqui (`.croqui-pt`) com 22 px, 18 px abaixo de 700 px** · `index.html:12096` · médio · P
Um `::after{inset:-11px}` resolve sem mudar o desenho.

### 3.4 Cronograma

**C1 · A tabela inteira é redesenhada a cada `blur`, mesmo sem mudança** · `index.html:12389-12396`, `12651` · médio · P
`atualizarPlan` no `onblur` destrói o DOM 160 ms depois e o foco se perde: não dá para percorrer a coluna de produtividade com Tab. `onchange` e retorno cedo se o valor não mudou. `sabadoEhUtil()` é um `localStorage.getItem` dentro do laço dia a dia (12448/12465/12477).
**C2 · No celular os cinco KPIs empilham em 516 px** (61 % da tela) antes de qualquer conteúdo · médio · P
Dias Improdutivos e Teórico × Real já usam duas colunas no celular; Cronograma e Medição usam uma. Padronizar `.exec-kpi-grid` em duas colunas abaixo de 768 px.
**C3 · Checkboxes de 24 px** ("Sábado é dia útil", "Ocultar concluídos") · baixo · P

### 3.5 Apoio à Medição

**M1 · Medições fechadas atravessam a troca de obra e o login** · `index.html:7156-7172`, `3636` · alto · P
`MEDICOES_FECHADAS` é cache de módulo; `trocarObra` e `fazerLogout` não zeram. A obra B herda os fechamentos da A; sem login vira `[]` e `medicaoGarantirFechadas` nunca mais busca. `MEDICOES_FECHADAS = null` nos dois pontos.
**M2 · KPIs empilhados no celular** (302 px), igual a C2.

### 3.6 Dias Improdutivos

**I1 · "Parado por chuva" é `JSON.stringify(a).includes('chuva')`** · `index.html:13124-13130` · baixo · P
"sem chuva" na observação vira parada por chuva. Olhar só o status `ParadoChuva`.
**I2 · Jargão de desenvolvedor na tela do usuário** · `index.html:13235-13237` · baixo · P
"O robô `registrarClimaAuto` grava `Chuva_mm_Auto` às 05h (rode `configurarGatilhos()` no editor do Apps Script)". Para o engenheiro: "Sem chuva medida neste mês. A leitura automática da estação ainda não rodou; avise quem administra o sistema."
**I3 · No celular a coluna "Situação", a mais importante, fica fora da tela** na tabela rolável · baixo · P
Trazer Situação para a segunda coluna ou fixá-la à direita.

### 3.7 Teórico × Real

**T1 · O adaptador não entrega `frentes`/`ruas`, então a saída de estoque não tem local** · `adaptador.js:32-43`; `notas.js:3172`, `3188`, `3017` · médio · P
O modal de saída mostra dois selects só com "não informar"; "Consumo por frente e rua" fica sempre "Sem local informado". Montar `frentes` a partir dos pacotes e `ruas` do cadastro.

### 3.8 Analista IA

**A1 · Prompt e KPIs usam a lista `atencao` cortada (E4) e o `metrics` do filtro (E1)**. Corrigir lá corrige aqui.
**A2 · Empty state** é o único no app com ícone grande e frase; Notas, Usuários e Teórico × Real usam três desenhos diferentes para o mesmo momento (ver §6).

### 3.9 Lançar Serviço

**L1 · Serviço com pacote e quantidade vazia some em silêncio, e o rascunho é apagado** · `index.html:16135`, `16213`, `16405` · alto · P
`validarRDO` e `salvarRDO` filtram `pacoteId && qtd > 0`; basta um serviço válido para os outros serem descartados. O `confirm` diz "2 serviços" com 3 na tela, e o sucesso limpa formulário e fotos. Erro explícito "Serviço 2: informe a quantidade".

**L2 · O app não ecoa o que acabou de gravar; o CSV publicado atrasa minutos** · `index.html:3364-3408`, `16283`, `16409`, `14114`, `14201-14243` · alto · M
Após salvar, o Histórico não mostra o lançamento, o banner "Nenhum serviço hoje" continua, a trava anti-duplicação só olha `STATE.rdoavanco` e o backend deduplica só por `clientId`: redigitar gera duplicata de verdade. Mesmo padrão na edição (`histSalvarEdicao` não corrige o STATE) e na exclusão (a linha apagada volta 4 s depois). Espelho local "recém-gravados/editados/apagados" aplicado sobre o CSV até ele trazê-los.

**L3 · Cada foto é decodificada duas vezes em resolução cheia, ao mesmo tempo** · `index.html:6259`, `6185` · alto · P/M
`Promise.all([comprimirImg(f,320), comprimirImg(f,1280)])` faz dois `readAsDataURL` e dois decodes de 12 MP; `desenharCarimbo` decodifica de novo. É o cenário que `nfPrepararFoto` corrigiu na NF. Um decode só, miniatura derivada do canvas.

**L4 · Fotos escolhidas não sobrevivem ao descarte da aba** · `index.html:5820`, `15324` · médio-alto · M
`_fotosPorServico` é memória e o rascunho é localStorage sem imagens; Bota-Fora e Equipamentos já usam `rascunhoDe` (IndexedDB) com imagens. Gravar `rascunhoGravar('rdo-fotos:'+OBRA.id, _fotosPorServico)` com `.agora()` a cada seleção.

**L5 · Validação deixa passar data futura e estaca invertida** · `index.html:16130`, `14114-14140` · médio · P
`<input type="date">` sem `max`; fim < início vira "E120 a E100" na planilha e no PDF; a edição no Histórico aceita qualquer texto de estaca.

**L6 · A dica "acima do saldo" não reage à digitação** · `index.html:15703`, `15929` · médio · P
Calculada só no render; só o `confirm` do salvar avisa.

**L7 · Cada linha de serviço recalcula o avanço da obra inteira** · `index.html:15647`, `15617` · médio · P
`pacotesMaisLancados(3)` e `dicaSaldo` → `calcularAvancoPorPacote()` por linha, a cada troca de frente/pacote.

**L8 · O apontador não vem do login** · `index.html:15333` · médio · P
`defaultDraft` lê o último nome digitado (`CONFIG.ls.apontador`) e, se não há, deixa "Seu nome" vazio, mesmo com a pessoa logada. Usar `STATE.usuarioLogado` como padrão (o mesmo vale para "Operador responsável" no Equipamentos).

**L9 · Foto recusada pelo servidor se perde; fila rotula tudo como "RDO"** · `index.html:6666-6679`, `4228` · médio-baixo · P
`r.ok === false` só incrementa `falhas` com o formulário já limpo; `descricaoDaFila` lê `it.tipo` mas RDO/foto/diário gravam `kind`. E a trava `_envioRDOEmCurso` (16298) é testada depois do `confirm`.

### 3.10 RDO Diário, PDF, depósito e assinaturas

**D1 · RDO Diário vaza de uma obra para outra** · `index.html:3636`, `16865`, `17614` · alto · P
`trocarObra` não zera `DIARIO_V4`/`DIARIO_TURNO_ATIVO` (não há `DIARIO_V4 = null` no arquivo) e o objeto não guarda `obra`. Abrir o RDO Diário da Teotônio, trocar para o Ranário e abrir a tela mostra efetivo e equipamentos da Teotônio; "Salvar turno" grava com `obra: ranario` e o depósito/e-mail sai com dado da obra errada. Zerar em `trocarObra`, gravar `obra` no objeto e conferir no render e no PDF.

**D2 · Turno gravado offline nunca é depositado para o e-mail das 8h** · `index.html:17537`, `4149` · médio · P
`depositarRDOPdf` só roda no ramo online; `outboxFlush` envia o `addRDODiario` e ninguém deposita. Após item `kind==='diario'` de obra em `OBRAS_COM_RDO_POR_EMAIL`, recarregar e depositar.

**D3 · "Já enviado" antes de enviar** · `index.html:17486`, `16978` · médio · P
`td.preenchido = true` acontece antes do request; em falha não-rede o seletor diz "Já enviado por X" para um turno recusado.

**D4 · Copy: "Escolha o dia na lista ao lado"** · `index.html:17011` · baixo · P
No celular a lista fica abaixo. "na lista de dias".

**D5 · Hover dos turnos em hex claro: no escuro o texto some (1,10:1)** · `index.html:2088-2089` · alto · P
`.btn-turno-diurno:hover{background:#fff8e1}` vence a versão tokenizada; no celular o hover gruda após o toque, na primeira tela do RDO Diário. Apagar as duas linhas.

**D6 · Girar o aparelho com o traço começado desalinha a assinatura** · `assinar.html:504`; `equipamentos.js:940`; `bota-fora.js:228` · baixo-médio · P/M
Copiar o canvas para um offscreen, remedir e desenhar de volta.

### 3.11 Histórico

**H1 · Cabeçalho "fixo" de tabela não fixa em lugar nenhum** · `index.html:1409` · médio · M
`th{position:sticky}` dentro de `.card{overflow:hidden}`: nas nove colunas do Histórico o cabeçalho some na segunda rolagem. Contêiner com `max-height` + `overflow:auto` ou remover a regra.
**H2 · Rótulos dos cartões no celular a 10 px** (`td[data-rot]::before`) · médio · P (ver V4)
**H3 · Edição sem regra de estaca** (L5) e **exclusão que volta** (L2).
**H4 · Dois inputs com fonte abaixo de 16 px** no filtro (zoom no iOS ao focar) · baixo · P

### 3.12 Equipamentos

**Q1 · "Hoje" em UTC: turno noturno cai no dia seguinte** · `equipamentos.js:1787`, `1789` · alto · P
`hoje.valueAsDate = new Date()` grava a data UTC; das 21h às 23h59 é amanhã. Usar `getLocalISODate`.
**Q2 · Sem fila offline nem prazo de POST** · `equipamentos.js:665-681` · médio-alto · M
`fetch` cru: sem sinal, toast de erro e o apontador espera; sem `AbortController`, o botão fica em "Enviando…" por minutos. O servidor já deduplica por `clientId` e `descricaoDaFila` já tem a etiqueta `equip`, mas nada enfileira. Bota-Fora, na mesma situação, entra na fila.
**Q3 · Lista de equipamentos falha em silêncio** · `equipamentos.js:379-398` · médio · P
Só `console.warn`; o `<select>` fica vazio sem mensagem. Toast com "Tentar de novo" e última lista em localStorage por obra.
**Q4 · Restos do app antigo** · `equipamentos.js:553-560`, `1107`, `1481-1487`, `1463`, `1317` · baixo · P
Emoji em `STATUS_LABEL` (o CLAUDE.md proíbe), `<i class="ph">` vazio, classes Tailwind que não existem, Esc que procura `.hidden` (não fecha nada), "FrotaSync" no relatório impresso e no Author do XLSX.
**Q5 · Inconsistências com o Lançar Serviço** · baixo · P
Turno é `<select>` aqui e segmentado lá; "Horas apuradas 0.00 h" com ponto decimal (`toFixed(2)`, linha 138) enquanto o resto do app usa vírgula; operador vazio mesmo logado (L8).

### 3.13 Bota-Fora

**BF1 · Frete com ponto decimal vira 100× maior** · `bota-fora.js:126-129` · alto · P
`valorFrete()` usa `num()` (ponto é milhar): "900.50", que é o que o teclado `inputmode=decimal` de vários Androids produz, vira 90.050 na conferência, na planilha e em `guardarPadroes` (repete na próxima viagem). O `numCampo()` do app (`index.html:4443`) existe para isso. Acrescentar o caso "900.50 → 900,5" ao teste.
**BF2 · Planilha pode sair com período diferente dos dados** · `bota-fora.js:606-613`, `700` · baixo · P
`montarPlanilha` usa `VIAGENS` da última consulta, o nome do arquivo usa `bfDe/bfAte` atuais.
**BF3 · Não há "corrigir viagem"**: placa ou valor errado só se conserta apagando e refazendo as três provas · médio (processo) · G
**BF4 · Fornecedor e motorista são texto livre todo dia** · baixo · P
Um `<datalist>` com os últimos valores da obra (o valor do frete já é lembrado; placa, motorista e transportador merecem o mesmo).

### 3.14 Notas Fiscais

**N1 · Cada clique baixa a lista inteira do servidor** · `index.html:7893`; `notas.js:2256`, `2653`, `3802` · médio · P
`render()` chama `nfCarregar` sem `{fundo:true}`; aba, filtro, "mais notas" e busca chamam `render()`. Cada toque = um `nfListar` completo + segundo render na volta, perdendo a rolagem.
**N2 · `nfImagem` grava por índice sem trava** · `Code.gs:4530` · baixo · P
Um `nfExcluir` concorrente desloca as linhas e o `driveId` cai na nota errada.
**N3 · Seletor de obra próprio dentro da tela** duplica o da barra lateral, e no celular a faixa "Notas da obra / atualizado agora / Atualizar" ocupa 280 px antes das abas, que quebram em duas linhas (3 + 2) · médio · P
Tirar o seletor (o da barra já manda) e deixar as abas roláveis numa linha.
**N4 · KPI "Valor recebido" herda CSS morto** (`.kpi-hero` do bloco antigo): rótulo em `#6b6660` sobre `#1a1612` = 3,16:1 a 11 px · alto · P (ver V3)
**N5 · `nfDiag` imprime na tela as Propriedades do servidor** (`notas.js:1599`) — ver B1 do backend.

### 3.15 Galeria

**G1 · No celular os oito filtros ocupam a primeira tela inteira** · alto · P
Mês, frente, pacote, apontador, estaca, de, até e busca empilhados: a primeira foto aparece depois de mais de uma tela de rolagem. Recolher os filtros atrás de um botão "Filtros" (o módulo de Notas já faz isso com "Mais filtros") e mostrar contagem + fotos primeiro.
**G2 · Datas com placeholder "mm/dd/yyyy"** no filtro (locale do navegador, não do app) · baixo · P
`lang="pt-BR"` já está no `<html>`; no iOS/Android o campo nativo respeita o sistema. Só vale um rótulo "dd/mm/aaaa" no placeholder do desktop.

### 3.16 Projetos

**P1 · No celular a prancha abre em "100 %" e cabe num terço da tela** · médio · P
O zoom inicial deveria ser "Ajustar" quando a tela é menor que a prancha.
**P2 · Oito controles em três linhas** (−, %, +, Ajustar, Girar, Tela cheia, Offline, Abrir, Baixar); "Abrir" e "Baixar" sublinhados dentro de botões, mistura de dois estilos · baixo · P
Mover Offline/Abrir/Baixar para um menu "⋯"; − e + têm 36 px de largura.
**P3 · `orientation: portrait` no manifest** tranca o app instalado · `manifest.json:9` · alto · P
Contradiz a intenção escrita para a prancha deitada e para a apresentação no projetor. `"orientation": "any"`.

### 3.17 Usuários e login

**U1 · Senha trafega na querystring** · `index.html:9537`, `5695` · médio · P
`usuarioSalvarUI` e `login` mandam `senha` via JSONP GET: fica no histórico do navegador e no log do Apps Script. `enviarPost` já existe.
**U2 · Login baixa 150 KB que não vê** · `index.html:5591-5594`, `1234` · baixo-médio · P
Duas `<img>` de logo (uma `display:none` por tema, baixada do mesmo jeito) e `planta-trama.webp` (73 KB) não escondida no celular.
**U3 · Botão "Entrar/Sair" do topo aparece igual** com e sem login (S2).

### 3.18 assinar.html

**X1 · É outra marca** · `assinar.html:32-41` · médio · P
`theme-color #1e3a5f`, azul-marinho, fonte de sistema, `.quadro .marca` em 2,52:1. É a única superfície que o fiscal vê, e é anterior ao rebrand. Copiar o `:root` claro e os `@font-face` (fontes já em `vendor/`).
**X2 · Prazo do link nunca vence** — ver backend B3.

## 4. Núcleo: carga, fila, rascunho, service worker

**K1 · Carga de fundo que falha redesenha por cima do formulário** · `index.html:6914-6929` · alto · P
A trava `fundo && (emFormulario || digitando || editandoLinha)` só existe no caminho de sucesso; o `catch` chama `render()` sem condição. É o cenário do Ranário: volta da câmera → `visibilitychange` → `carregarTudo({fundo:true})` → sem sinal → a viagem some. O teste `formulario-nao-se-apaga` cobre só o sucesso. Extrair a guarda e aplicá-la no `catch`.

**K2 · Sem nenhuma carga boa, "Lançar assim mesmo" é beco sem saída** · `index.html:7822-7826`, `6963` · alto · M
`render()` retorna cedo sempre que `!STATE.loaded`; o botão navega para `rdo` e pinta a falha de novo. Nada do STATE é persistido e o SW nunca guarda `docs.google.com`, então todo carregamento a frio sem sinal cai aqui, inclusive a aba descartada durante a foto — o rascunho nunca é restaurado porque o formulário nunca é desenhado. Guardar a última carga boa por obra no IndexedDB e hidratar no boot ("dados de HH:MM").

**K3 · Rascunho apagado ao sair da tela e bloquear o aparelho** · `index.html:4409-4430` · alto · P
`_rascAtivo` nunca é zerado; no `pagehide`, `agora()` chama `coletar()`, que devolve `null` porque o formulário já não está no DOM (`bota-fora.js:276`, `equipamentos.js:227`), e `null` significa apagar. Preencheu a viagem, foi à Galeria, bloqueou o celular: o rascunho foi embora. Ao deixar uma tela de `TELAS_DE_FORMULARIO`, `agora()` final e `_rascAtivo = null`; em `gravar()`, distinguir "formulário ausente" de "vazio".

**K4 · RDO Diário some quando só o CSV dele falha** · `index.html:6876` · médio · P
`fetchCSV(rdodiario).catch(() => [])` com status "Sincronizado": contador zera, Histórico sem RDO, `diasUteisSemRDO` acusa todo dia até o próximo refresh. Devolver `null` e manter o valor anterior.

**K5 · SW: a revalidação em segundo plano não grava, e dispara ~12 pedidos por abertura** · `sw.js:124-137` · médio · P
No acerto de cache, `e.waitUntil()` só é chamado dentro do `fetch().then()`, depois que `respondWith` já resolveu: o Chrome lança `InvalidStateError`, engolido pelo `.catch`. Os estáticos só mudam com troca de balde. E o `fetch` com `cache:'no-cache'` sai para todo estático a cada abertura, disputando o 3G com os CSVs. URLs com `?v=` e `/vendor/` servidas só do cache; para o resto, `e.waitUntil(rede)` síncrono.

**K6 · Período não conversa entre telas** · `STATE.filtros.mes`, `MEDICAO_MES`, `IMPROD_MES`, `TR_MES` · médio · M
Quatro seletores de mês independentes, nenhum persistido; a lista de meses é reimplementada 5× e `labelMes` 4×. Um `STATE.periodo.mes` com `mesesComDados()` como única fonte.

## 5. Backend (Code.gs)

**B1 · `nfDiag` entrega os tokens de sessão de todo mundo** · `Code.gs:4890` · alto · P
`propriedades: props.getKeys()` lista todas as chaves, e as sessões moram lá como `SES_<token>`. Qualquer usuário logado (perfil campo serve) recebe o token do administrador; `notas.js:1599` imprime na tela. Filtrar `SES_`/`AUDQ_` e exigir admin. O bloco é compartilhado com o gestor-obras: provavelmente vaza lá também.

**B2 · `obterFoto` baixa qualquer arquivo do Drive do dono** · `Code.gs:1866` · alto · P/M
`DriveApp.getFileById(fileId)` sem conferir pasta; o script roda como o dono. Aceitar só arquivos das pastas do app ou cujo id conste numa célula das abas de foto/prova.

**B3 · O prazo de 60 dias do link de assinatura nunca vence na planilha real** · `Code.gs:3354` · alto · P
`rdoAssinVencida_` faz `String(linha.convidadoEm).slice(0,10)` e testa `^\d{4}-\d{2}-\d{2}$`; a célula gravada como `'2026-09-07 08:00:00'` vira `Date` no Sheets, `String(Date)` é "Mon Sep 07 2026…", a regex falha e devolve "não vencido". É o mesmo defeito já documentado em `upsertRDODiario`; `rdoAssinLinhasDoDia_` usa `normData` por isso. O fake do teste guarda a string crua, por isso passa. Confira abrindo a aba: se `convidadoEm` está alinhado à direita, é `Date`. Usar `normData` e fazer o fake converter ISO em `Date`.

**B4 · O e-mail "RDO ASSINADO" confia na contagem que o app manda** · `Code.gs:2702-2720` · médio-alto · P
`comAssinaturas = parseInt(p.assinaturas)` vai direto para `rdoEnviarAssinadoSePronto_`; um app velho em cache mandando 2 faz a fiscalização receber um PDF com quadros em branco sob o assunto "ASSINADO", e o log bloqueia o reenvio. `Math.min` com as linhas 'assinada' da aba.

**B5 · Restrição por obra cobre só gravações; auditoria carimba "teotonio" em tudo** · `Code.gs:121` · médio · M
Leituras (`nfListar`, `bfListar`, `equipApontamentos`, `medicaoListar`) aceitam `obra=teotonio` de quem só tem Ranário; `deleteRDO`, `updateRDO`, `deleteRDODiario`, `nfExcluir`, `saidaExcluir`, `equipApagar` acham a linha só pelo id (carimbo de segundo, igual em todas as obras). Helper `linhaPorId(aba, id, obra)` e o front mandando `obra` no delete/update.

**B6 · Trava global segura durante upload no Drive e envio de e-mail** · `Code.gs:146-158` · médio · M
O `getScriptLock()` envolve `rdoFoto` (2 uploads), `rdoPdfDoDia` (PDF de até 12 MB + e-mail) e `rdoAssinaturasDoDia`; enquanto isso todo `addBatchRDO`/`nfSalvar`/`equipApontar` espera 30 s e falha. Fim de turno com três apontadores subindo foto serializa tudo. Drive/e-mail fora da trava.

**B7 · 32 leituras de aba inteira; RDO_Avanco lida por foto** · `Code.gs:1376`, `843`, `793`, `2110` · médio · P/M
`createTextFinder(id).matchEntireCell(true)` para id/clientId; `registrarAuditoria` → `props.getProperties()` lê a loja inteira a cada gravação.

**B8 · Sessão vale 365 dias sem uso e nada limita quantas por usuário** · `Code.gs:324-326` · médio-baixo · P
Corte de ociosidade em 30-45 dias (`usoEm` já existe); no máximo 5 sessões por usuário. A loja tem teto de 500 KB.

**B9 · `medicaoListar` sem token; bloqueio de login por usuário permite trancar qualquer conta** · `Code.gs:4110`, `4208`, `268-276` · baixo-médio · P

**B10 · `callback` JSONP sem validação** · `Code.gs:752` · baixo · P
`/^[\w$.]{1,64}$/`.

**B11 · Código morto/duplicado** · `producaoPorPacote`, `criarRDOsVaziosMaio2026` (×2), `normData` inline em `deleteRDODiario`, poda do log duplicada, `limpar_duplicados.gs` repetindo `limparDuplicadosServidor` linha a linha. O workflow não roda o `node --check` que o `implantar-appscript.sh` roda.

Pares front↔back conferidos: papéis de assinatura, obras com e-mail, ponteiro da foto, nomes das ações, nomes das abas, transporte JSONP/POST — todos batem. Único desvio: o back devolve `SEM_ACESSO_A_OBRA` e `erroLegivel` (`index.html:5570`) não o traduz.

## 6. O visual como um todo

O sistema visual é bom e coerente na maior parte: tokens de tipografia e espaçamento documentados (272 de 285 `font-size` via token), tema por `data-theme` vencendo `prefers-color-scheme`, `color-mix` com `--f-cor` fazendo cartão, selo e gráfico falarem a mesma cor de frente, artes como máscara pintadas pelo `--acc`, ícones em traço com `currentColor`. Os problemas são de acabamento e de resíduo.

**Inventário** (index.html 91-3253): 164,5 KB de CSS, 26 % comentário (vai para o cliente); ~30 tokens de cor, 12 de espaçamento, 8 de fonte, 3 raios; 67 hex e 160 `rgba/oklch` soltos (quase todos no hero e na apresentação); 27 valores distintos de `border-radius`; 19 `!important`; 65 `@media`; 14 `@keyframes` (4 protegidos por `prefers-reduced-motion`).

**V1 · A aba do navegador ainda mostra a avenida** · `index.html:18-21` · alto · P
O único `<link rel="icon">` é o data-URI da marca antiga (placa + trapézio); o `favicon.svg` novo só é referenciado por `manifest.json` e `assinar.html`. O comentário ainda diz "a marca é a própria avenida em perspectiva". Os cabeçalhos de copyright de `index`, `sw`, `icones` e `assinar` seguem "Av. Senador Teotônio Vilela".

**V2 · Contraste dos pares de token** · `index.html:139-155`, `208-232` · médio-alto · M
Branco sobre `--acc` claro 3,93:1 (escuro 3,10:1); `.btn-primary` no tema escuro 3,58:1 (o CTA principal falha AA no escuro); `--grn` sobre `--grn-l` 2,97:1; `--muted-2` sobre branco 2,76:1 (placeholder); `.nav-label` 2,63:1. Os neutros passam.

**V3 · CSS morto do KPI clássico vaza para Notas** · `index.html:1359-1400` vs `notas.js:3540` · alto · P
A família `.kpi-card` (10 classes, 0 usos) ainda define `.kpi-hero` com fundo grafite; Notas usa `kpi kpi-hero` esperando só o tamanho da fonte. Apagar o bloco inteiro.

**V4 · No celular o texto de apoio cai para 10 px** · `index.html:2873`, `2881`, `2953`, `2961`, `3231` · médio · P
O comentário da escala diz que abaixo de 10 px "não se lê no sol", mas o mobile reduz 11 → 10 em `.exec-kpi-sub`, `.kpi-sub`, `.curvas-legend`, `.exec-list-meta` e nos rótulos dos cartões do Histórico. `--fs-2xs:11px` no `@media` e não reduzir abaixo do desktop.

**V5 · Cinco padrões de indicador vivos** (`.exec-kpi` 41, `.kpi` 26, `.eq-kpi` 4, `.cc-box`, `.ap-k`) e **duas gramáticas de cartão** (`.card-header/.card-title/.card-body` e `.card-h/.card-t/.card-b` em `notas.js`) · médio · M
O commit "um só cartão de indicador" unificou três; sobraram estes.

**V6 · Botões: `.btn` + 4 cores + 16 classes próprias fora do `.btn`**; terracota cheio definido 4× (`.btn-acc`, `.btn-pri` morto, `.conta-btn--entrar`, `.curva-hz-btn.on`); `border-radius:7px` em 10 regras onde o token é 6 px; `--r-md` lido 3× e nunca definido; `.nf-tag-confira{color:var(--amarelo)}` sem fallback (cor inválida) · médio-baixo · P

**V7 · 33 classes sem uso** · badge-mini, badge-obra, btn-presentation, btn-pri, btn-remove-custom-row, compact, curvas-legend(-dash/-item/-line/-tag), eq-kpi-ic, field-hint, filter-active-tag, frente-row, grid-2, grid-3, kpi-acc, kpi-bar, kpi-bar-wrap, kpi-card, kpi-label, kpi-trend, kpi-value, kpi-value-small, nf-obra-nota, nf-passo, page-transition, pill-pri, presentation, qty-preset, qty-presets, spinner · baixo · P

**V8 · Empty states com quatro desenhos**: Analista IA (ícone grande + título + frase), Notas (ícone inline de 1em + texto), Usuários (frase solta), Teórico × Real (parágrafo em caixa). Um componente `.vazio` com ícone, título, frase e ação resolve os quatro · baixo · P

**V9 · Movimento sem freio**: `--anim-speed` nunca é alterado; `stagger-item` (55 cartões), `cellPop` (uma por célula do heatmap) e `stage3dIntro` (2,6 s) rodam sempre. `@media (prefers-reduced-motion:reduce){:root{--anim-speed:0}}` · baixo · P

**V10 · Alvos deformados pela regra de altura**: `.btn-remove-custom` (20×20) recebe `button{min-height:40px}` e vira elipse 20×40; `.gantt-edit-btn` ~23 px de largura · médio · P

**V11 · `#outboxIndicator{background:#1f2937}`** é o único azul-cinza numa paleta quente; `.filter-bar select{font-size}` nunca vence o `!important` de 2695 (o corte "Todas as fre…" continua no celular, visível nos screenshots) · baixo · P

## 7. O processo (fluxo de trabalho)

Olhando o dia do apontador e do engenheiro, e não tela por tela:

1. **Quatro portas para a mesma tela.** "+ Novo Serviço" no topo, "Lançar" na barra inferior, "Lançar serviço" na Central de Campo e "Lançar Serviço" no menu. No celular isso custa o título (S2). Uma porta fixa (barra inferior) e uma contextual (Central de Campo) bastam.
2. **Sair em dois lugares** (topo e rodapé do menu), **atualizar** em um só (bom, foi consolidado).
3. **O que acabou de ser gravado não aparece** (L2). Para quem lança, a única confirmação é o toast; o Histórico e o banner do dia continuam dizendo que não há nada. É a maior fonte de duplicata que não é bug de código.
4. **Comportamento diferente com o mesmo sinal**: RDO e Bota-Fora entram na fila offline; Equipamentos dá erro e pede para tentar de novo (Q2). O apontador não sabe qual tela "aguenta" o 3G.
5. **Nome redigitado**: Apontador em Lançar Serviço, Operador em Equipamentos, Motorista/Fornecedor em Bota-Fora, todos vazios mesmo com a pessoa logada (L8, BF4).
6. **Mês escolhido em uma tela não vale na outra** (K6).
7. **RDO gravado offline não vai por e-mail** (D2), e o turno aparece como "já enviado" antes de o servidor aceitar (D3).
8. **Corrigir uma viagem de bota-fora** exige apagar e refazer as três provas (BF3); Equipamentos já tem "Corrigir".
9. **Mensagens para o desenvolvedor na tela do usuário** (I2, N5).
10. **Notas tem um seletor de obra próprio** (N3) que compete com o da barra lateral.

## 8. Código e manutenção

- **`index.html` com 1,04 MB e 19.716 linhas** num arquivo só. Os módulos que já saíram (`equipamentos`, `bota-fora`, `notas`) mostram o caminho; candidatos naturais a sair: o visor de pranchas (~700 linhas), a Galeria + pipeline de foto (~800), o PDF do RDO (~1.100), o Histórico (~1.500). Não é urgente, mas todo bug de "estado que atravessa" (D1, M1, E6) nasce de variáveis de módulo soltas num escopo de 16 mil linhas.
- **Código morto** (0 chamadas, confirmado por grep): `baseDoAvanco` (5080), `toggleTema` (7762, o comentário diz "ainda usado"), `frenteSlug` (4685, só um teste usa), `mesesComDados` (14380, 1 uso), família CSS `.kpi-card`, 33 classes (V7), `producaoPorPacote` e `criarRDOsVaziosMaio2026` no backend.
- **Duplicação entre módulos**: `montarSheet`/`bordaFina`/`STL`, `modal()`, `abrir/fechar`, canvas de assinatura, `escapeHtml`, `formatarData`, `periodoMes` existem em Equipamentos e Bota-Fora, e duas cópias já divergiram (cor do traço, `_hasInk` vs `_temTraco`). `js/ui/assinatura.js` e `js/ui/xlsx.js` compartilhados.
- **Avanço ponderado por frente** calculado 3× com o mesmo laço (10457, 11103, 11952); lista de meses 5×; `labelMes` 4×.
- **O CSS leva 26 % de comentário para o cliente** (43 KB). Vale uma etapa de build mínima que tire comentários do CSS e do JS no deploy, sem mexer no fonte.
- **`README.md` de 65 KB** e um `painel_executivo_state_*.png` e `logo_gestor.png.png` (349 KB) na raiz: lixo de sessão que o `.gitignore` não cobre.

## 9. O que está bom e não deve ser mexido

- `_epocaCarga` + checagem de `minhaObra` em `carregarTudo`: resolve de fato a corrida entre seis gatilhos e a troca de obra.
- Fila offline: IndexedDB com espelho síncrono, `ERROS_TERMINAIS` como lista fechada, token injetado na hora do envio, `clientId` deduplicado no servidor em RDO, equipamento, bota-fora e NF.
- `enviarPost` com `AbortController`; `usarLib` com download compartilhado; três baldes no SW com `?v=` amarrado ao `VERSAO` e teste que cobra isso; aviso de nova versão sob comando do usuário.
- `montarGraficos` destrói antes de recriar e sai cedo fora do Executivo; teto por pacote e teto de 5.000 dias úteis no reverso; `num()`/`ptNum()`/`numCampo()` separados por origem do dado.
- Medição: acumulado/saldo/estouro com snapshot da medição fechada e aviso de duplicata sem deduplicar.
- Anti-duplicação em camadas no Lançar Serviço; estaca com `datalist` e faixa validada; quantidade em `type=text inputmode=decimal`.
- PDF oficial: cabeçalho e rodapé em toda folha, assinaturas com `papel` casado com o backend, depósito reposto ao gerar. Galeria e Projetos: miniaturas por `IntersectionObserver` com cache IDB, `acharTarjaDoCarimbo` com trava de horizonte, visor com um `transform` só.
- Backend: `rotear` com try/catch total e sempre JSON; `seguro()` contra injeção de fórmula; gatilho das 8h com log contra envio duplo e checagem de cota; implantação com guarda de identidade e credencial apagada.
- `salvarEdicao` do Equipamentos (reenvia antes de apagar no legado); `bfConfirmar` com fila e dedupe; `assinar.html` validando só no servidor e sem reescrever assinatura dada.
- Visual: área segura em 27 lugares, `input{font-size:16px}` contra o zoom do iOS, Histórico em cartões no celular, botão de gravar sticky, artes como máscara, fontes locais com `font-display:swap`.

## 10. Plano sugerido

**Onda 1 — uma semana, tudo esforço P.** Segurança e dinheiro: B1, B2, B3, B4 (backend); BF1, Q1 (datas UTC). Estado por obra: D1, M1, E6. Formulário: K1, K3, L1, L8. Painel: E1, E2, E4, E5. Celular: S2, G1, P3, D5, V1, V3, V4. Teste do muro já corrigido; proteger a `main` com o workflow.

**Onda 2 — duas semanas, esforço M.** L2 (espelho local do que foi gravado), K2 (última carga boa no IndexedDB), Q2 (fila offline no Equipamentos), E3 (uma normalização para as quatro contas), E7/F1/L7 (índice de pacotes e memoização), K6 (um período para o app), C2/M2 (KPIs em duas colunas), S1 (rodapé da barra lateral), H1 (cabeçalho de tabela), V2 (contraste), V5/V6 (um cartão, um botão), N1/N3.

**Onda 3 — quando couber.** BF3 ("corrigir viagem"), B5/B6/B7 (obra na auditoria, trava mais curta, `TextFinder`), extração de módulos do `index.html`, `js/ui/assinatura.js` e `js/ui/xlsx.js`, build mínimo sem comentários, V7/V8/V9.

## Anexo — números medidos

| Medida | Valor |
|--------|-------|
| Nós no DOM por tela (desktop, 1.500 lançamentos) | Executivo 876 · Avanço Físico 2.307 · Cronograma 1.676 · Histórico 2.850 (100 linhas) · demais 300–750 |
| Altura da página no celular | Executivo 5.244 px · Cronograma 4.304 · Galeria 4.040 · Lançar Serviço 1.925 · Histórico 29.561 (100 cartões) |
| Título no cabeçalho do celular | 45 px disponíveis para 101 px de texto |
| Menu lateral (conteúdo 814 px) | espaço 429 px @1440×950 · 247 px @1366×768 · 200 px @1280×720 |
| KPIs empilhados no celular | Cronograma 516 px (5 cartões de 92) · Medição 302 px |
| Alvos abaixo de 40 px | Executivo 2 ícones de 26 px + "7d" 33 px · Cronograma 2 checkboxes de 24 px · Projetos −/+ 36 px |
| Inputs com fonte < 16 px | Histórico 2 (os demais 0) |
| Carga inicial no harness | 149–846 ms (dados locais) |
| Suíte de testes | 54 arquivos · 53 passam · 1 falhava (corrigido) · 9m54s |
| CSS | 164,5 KB · 26 % comentário · 33 classes sem uso · 19 `!important` |
