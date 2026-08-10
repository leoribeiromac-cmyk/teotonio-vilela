# Sistema Teotônio Vilela — Controle Integrado

App de planejamento, RDO e apoio à medição da obra de duplicação da **Av. Senador Teotônio Vilela** (Contrato 084/SPOBRAS/2024 · CC 182 · Gestor Engenharia).

**Produção:** https://leoribeiromac-cmyk.github.io/teotonio-vilela/

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | `index.html` único (vanilla JS) no GitHub Pages, instalável como PWA (`manifest.json` + `sw.js`) |
| Dados (leitura) | Google Sheets publicado como CSV — abas `Pacotes`, `Coeficientes`, `RDO_Avanco`, `RDO_Diario`, `Cronograma` |
| Dados (escrita) | Google Apps Script (`Code.gs`) via JSONP, com fila offline no app e deduplicação por `clientId` |
| IA | Google Gemini, chamado do navegador com a chave do próprio usuário (⚙ Configurar IA) |

O modelo de dados central: **pacotes físicos (P01–P36)** lançados no campo × **matriz de coeficientes** = consumo por **item contratual SIURB** (tela Apoio Medição).

## Publicar alterações do backend (`Code.gs`)

1. Abra a planilha → Extensões → Apps Script.
2. Cole o conteúdo de `Code.gs` por cima do existente e salve.
3. **Implantar → Gerenciar implantações → ✏ editar → Nova versão → Implantar.** A URL `/exec` não muda.

> ### ⚠ Nesta versão, rode `migrarObraNasAbasDeRDO()` uma vez
>
> As abas `RDO_Avanco` e `RDO_Diario` ganharam a coluna **`obra`**: o app passou
> a atender várias obras, e todas gravam na mesma planilha. A coluna entra no
> **fim** do cabeçalho — nenhuma coluna existente muda de posição, então
> fórmulas, filtros e os CSVs publicados continuam valendo.
>
> Depois de colar o `Code.gs`, selecione `migrarObraNasAbasDeRDO` no editor e
> clique ▶ Executar. Ela marca tudo que já existe como `teotonio`, que é de
> onde veio. Rodar de novo é seguro: só preenche o que estiver vazio.
>
> Sem isso nada quebra — linha sem valor na coluna é tratada como da Teotônio —
> mas a planilha fica com o histórico sem marcação, e qualquer filtro por obra
> feito à mão deixa o passado de fora.

> ### ⚠ Rode também `migrarAuditoriaParaMultiObra()` uma vez
>
> A aba `Auditoria` ganhou a coluna **`obra`**, na 5ª posição — o mesmo
> formato do app "Gestor — Controle de Obras", que é o que permite os dois
> compartilharem o bloco de Notas Fiscais do backend.
>
> Depois de colar o `Code.gs` e **antes de usar o app**, selecione
> `migrarAuditoriaParaMultiObra` no editor e clique ▶ Executar. Ela insere a
> coluna e marca as linhas já existentes como `teotonio`.
>
> Sem isso, as linhas antigas ficam com `registroId`, `detalhesAnteriores` e
> `detalhesNovos` uma coluna à esquerda das novas: a trilha continua na
> planilha, mas desalinhada — que num log de auditoria equivale a perdida.
> Rodar duas vezes é seguro; se a coluna já existir, a função não faz nada.

> ### ⚠ E rode `migrarNumeroRdoPorObra()` uma vez
>
> O número impresso no cabeçalho do RDO oficial saía do `id` (D####), e o
> `id` é gerado varrendo a aba `RDO_Diario` **inteira**. Só que a aba é
> compartilhada por todas as obras: o primeiro RDO de uma obra nova sairia
> numerado na sequência da Teotônio — "RDO nº 88" no primeiro dia de obra —
> e as duas obras ficariam com a numeração entrelaçada no documento que a
> fiscalização assina.
>
> Agora são dois papéis separados. O **`id`** continua sendo a chave técnica,
> global e única (é por ela que o app apaga e edita a linha). O novo
> **`numero_rdo`** é o número que a fiscalização lê, e conta **por obra**,
> a partir de 1.
>
> `migrarNumeroRdoPorObra()` preenche a coluna no que já existe
> **preservando o número que cada RDO já mostrava** — ela copia o número
> derivado do `id` atual, em vez de renumerar por data. Como só a Teotônio
> tem histórico, na prática ela fica idêntica ao que já foi impresso, e
> qualquer obra nova começa do 1. **RDO já entregue à fiscalização não muda
> de número.** Rodar de novo é seguro: só preenche o que estiver vazio.
>
> Se você esquecer, nada quebra: o app volta a derivar o número do `id`
> quando a coluna está vazia, e o próprio `upsertRDODiario` preenche a linha
> assim que ela for tocada.

## Implantar o backend sozinho

Colar o `Code.gs` no editor e lembrar de **Implantar → Nova versão** é o passo
mais fácil de esquecer da publicação. E quando ele é esquecido não aparece erro
nenhum: o código fica salvo, o app continua chamando a versão velha, e a
diferença só aparece quando alguém repara que uma funcionalidade "não veio".

Dá para automatizar. São **dois caminhos** — escolha um.

### Antes dos dois: a preparação (1×)

1. Instale o `clasp`: `npm install -g @google/clasp@2.4.2`

   Confira com `clasp --version` que veio **2.4.2 mesmo**. A versão importa:
   a 3.x mudou o lugar e o formato do arquivo de credencial, e o fluxo do
   GitHub instala a 2.4.2. Credencial gerada por uma versão e lida por outra
   é falha na primeira implantação de verdade. (Ambiente que já traz o `clasp`
   pré-instalado — o Cloud Shell, por exemplo — pode ter outra versão: se o
   `npm install` não sobrescrever, use `npx @google/clasp@2.4.2 login`.)
2. Ligue a API: acesse **https://script.google.com/home/usersettings** e ative
   *API Google Apps Script*.
3. Entre na conta: `clasp login`

   > **Se o `clasp` estiver numa máquina remota** (Google Cloud Shell, um
   > servidor por SSH), o login falha com `ERR_CONNECTION_REFUSED`: o Google
   > devolve a autorização para `http://localhost:PORTA`, e esse "localhost" é
   > a máquina remota, não a sua. O `--no-localhost` **não resolve mais** — o
   > Google desativou esse fluxo em 2023.
   >
   > O contorno é entregar o código por dentro. Com o `clasp login` **rodando
   > e esperando**, autorize no navegador, copie a URL inteira da página de
   > erro e, numa segunda aba do terminal, rode:
   >
   > ```bash
   > curl "http://127.0.0.1:PORTA/?iss=...COLE-A-URL-INTEIRA..."
   > ```
   >
   > A **porta é sorteada a cada login** — leia a que aparece no
   > `redirect_uri` do link, não presuma um número. As aspas são obrigatórias:
   > sem elas o terminal corta a URL no primeiro `&`.
   >
   > O texto de sucesso muda conforme a versão (`Authorization successful.` na
   > 2.x, `You are logged in as ...` em versões mais novas). Para conferir:
   > `clasp login --status` na 2.x, `clasp show-authorized-user` na 3.x.
4. Descubra o **id do projeto**: no editor do Apps Script, ⚙ **Configurações do
   projeto → IDs → ID do script**.
5. Na raiz do repositório, crie o `.clasp.json` (ele é ignorado pelo git):
   ```json
   {"scriptId":"COLE-O-ID-AQUI","rootDir":".","fileExtension":"gs"}
   ```
   > O `fileExtension` importa: sem ele o `clasp` baixa os arquivos como
   > `.js`, e o repositório guarda `.gs`. A conferência acharia que o
   > `Code.gs` sumiu do projeto e travaria a implantação por nada.
6. **Traga o manifesto de verdade**: `clasp pull` — ele baixa o
   `appsscript.json` do projeto (fuso, escopos de OAuth, configuração do app da
   web). **Comite esse arquivo.** Ele nunca deve ser inventado: um manifesto
   chutado reconfigura o backend em produção.
   > Se o `clasp pull` trouxer algum `.gs` que não está no repositório, comite
   > também — senão a implantação apagaria esse arquivo.
7. Descubra o **id da implantação**: `clasp deployments`. Copie o id daquela
   que é o app da web (a que corresponde à URL `/exec` que o app usa).

> ⚠ **O id da implantação é o detalhe que mais importa.** `clasp deploy` sem
> ele **não dá erro**: cria uma implantação nova, com uma URL `/exec` nova, e
> devolve sucesso. O app continua falando com a URL antiga. Por isso os dois
> caminhos abaixo **param** se o id faltar, em vez de publicar no vazio.

### Caminho A — da sua máquina (a credencial não sai daqui)

Guarde o id da implantação em `.appscript-deployment-id` (uma linha, também
ignorado pelo git) e rode:

```bash
./ferramentas/implantar-appscript.sh                # implanta
./ferramentas/implantar-appscript.sh --so-conferir  # confere e não publica
```

Antes de subir qualquer coisa ele confere a sintaxe do `Code.gs` e verifica se
a implantação apagaria algum arquivo do projeto.

### Caminho B — sozinho, a cada merge na main

O fluxo `.github/workflows/implantar-appscript.yml` faz push + implantação
quando o `Code.gs` muda na `main`. Precisa de **três segredos** em
*Settings → Secrets and variables → Actions*:

| Segredo | De onde sai |
|---|---|
| `CLASPRC_JSON` | o conteúdo inteiro do `~/.clasprc.json`, criado pelo `clasp login` |
| `APPSCRIPT_SCRIPT_ID` | passo 4 acima |
| `APPSCRIPT_DEPLOYMENT_ID` | passo 7 acima |

Para copiar o conteúdo da credencial:

```bash
cat ~/.clasprc.json          # Mac/Linux
type %USERPROFILE%\.clasprc.json   # Windows
```

Copie **tudo**, incluindo as chaves `{` `}`, e cole no valor do segredo.

Depois de criar os três, teste sem esperar merge nenhum: aba **Actions →
implantar-appscript → Run workflow**. Se algo estiver errado, o próprio fluxo
diz o quê — ele foi escrito para parar com o motivo, não para falhar seco.

Sem os três, o fluxo **não falha** — ele avisa que não está configurado e
encerra, e o `Code.gs` segue sendo colado à mão.

> ⚠ **Pese esta escolha.** O `CLASPRC_JSON` é um token de acesso à sua conta
> Google: quem conseguir lê-lo consegue mexer nos seus projetos do Apps
> Script. Guardado como segredo do GitHub ele não aparece nos registros, mas
> passa a existir fora da sua máquina. Se isso incomodar, fique no caminho A —
> ele resolve o mesmo esquecimento sem tirar a credencial do seu computador.

`tests/implantacao.test.js` trava as armadilhas dos dois caminhos: implantação
sempre com `-i`, conferência antes de apagar arquivo, manifesto vindo do
projeto, e a credencial apagada no fim (inclusive quando a implantação falha).

## Colunas opcionais da planilha (o que liga cada tela nova)

Nenhuma delas é obrigatória: sem a coluna, a tela correspondente continua
funcionando como antes — só sem o número que ela traria. Todas ficam em abas
que você já mantém.

| Onde | Coluna | O que passa a existir |
|---|---|---|
| `Coeficientes` | **`Qtd Contratual`** | Saldo e % do contrato na prévia de medição, e o aviso de item **acima** do contratado (que pede aditivo, não medição). |
| `Coeficientes` | **`Item Planilha`** | O mesmo código SIURB em capítulos diferentes deixa de somar numa linha só. |
| `Coeficientes` | **`Material Estoque`** | O de-para do **Teórico × Real**: o nome do material como ele aparece na nota fiscal. Sem ele, a tela casa pela descrição e avisa que casou sozinha. |
| `RDO_Diario` | **`paralisacoes_json`** | Criada sozinha pelo backend no primeiro turno salvo. Guarda a paralisação estruturada (motivo, horário, frente, efetivo e equipamento parados). |
| — | aba **`Medicoes`** | Criada sozinha no primeiro fechamento. Guarda o que foi apresentado à fiscalização em cada competência. |

**Fechar a medição do mês** (Apoio à Medição → escolha o mês → *Fechar medição
do mês*) congela o que foi apresentado. Depois disso o lançamento retroativo
continua sendo aceito — ele só deixa de reescrever o passado sem ninguém ver,
porque a tela passa a mostrar as colunas *Medido* e *Diferença*. Só engenharia
e admin fecham; reabrir não apaga o fechamento, marca como reaberto.

## Segurança (fazer 1×, importante)

As senhas antigas ficaram públicas no histórico deste repositório. Para blindar:

1. No editor do Apps Script: ⚙ **Configurações do projeto → Propriedades do script**, crie:
   - `USUARIOS` = `{"Leonardo":"SENHA-NOVA","Wallace":"SENHA-NOVA","Guilherme":"SENHA-NOVA"}` (senhas **novas**!)
   - `EXIGIR_TOKEN` = `true`
2. Republique o backend (seção acima).
3. No editor, rode **`migrarSenhasParaHash()`** uma vez: as senhas continuam as
   mesmas para quem entra, mas param de ficar legíveis na propriedade.

Pronto: o login passa a ser validado no servidor e **toda escrita/exclusão exige token de sessão** (6 h, renovado a cada uso) — quem tiver só a URL do `/exec` não consegue mais injetar nem apagar dados. Sem essas propriedades, tudo funciona como antes (fallback de migração).

## Clima automático no RDO (opcional)

O botão **Buscar chuva registrada**, no RDO Diário, preenche os três períodos
pela chuva medida pela estação automática do **INMET** — chuva digitada de
memória três dias depois não sustenta justificativa de prazo; chuva medida por
estação oficial, sim.

Funciona sem configurar nada (estação padrão `A701`, São Paulo – Mirante de
Santana). Para apontar para a estação mais próxima da obra, crie nas
**Propriedades do script**:

| Propriedade | Para quê |
|---|---|
| `INMET_ESTACAO` | Código da estação automática. Catálogo: portal.inmet.gov.br/paginas/catalogoaut |
| `CLIMA_URL` | Só se quiser outro provedor. Molde de URL com `{ini}`, `{fim}` e `{est}` |

A tradução de milímetros para o vocabulário do RDO: `0` → Bom · até `0,5 mm` →
Garoa · até `5 mm` → Chuva · acima disso → Chuva forte. Sem chuva o retorno é
**Bom** e não *Encoberto*: a estação mede precipitação, não cobertura de nuvem.
O valor preenchido é sempre editável — quem esteve na obra sabe mais que o
pluviômetro a alguns quilômetros.

## Níveis de acesso

Cada pessoa entra com o seu usuário e vê só o que o perfil dela permite:

| Perfil | O que faz |
|---|---|
| **Campo** | Lança serviço e RDO diário. Vê avanço físico e histórico |
| **Administrativo** | Escritório: painel, cronograma, apoio à medição, histórico — não lança |
| **Engenharia** | Tudo da obra: lança, corrige, analisa e exporta |
| **Diretoria** | Só consulta: painel, avanço, cronograma, medição, analista IA |
| **Administrador** | Tudo, e é o único que gerencia usuários |

**Quem apaga:** o administrador, ou a própria pessoa que lançou. A regra vale
também no servidor — esconder o botão no app não impediria ninguém, já que o
pedido pode ir direto para a URL do `/exec`. Tentativa negada fica registrada
na aba **Auditoria** (criada sozinha na primeira gravação), junto de quem
lançou, alterou e apagou cada registro.

**Cadastro pelo próprio app:** entrando como administrador aparece o item
**Usuários** no menu. Ali se cria, muda o perfil, troca a senha, define **quais
obras a pessoa enxerga** e exclui — sem abrir o Apps Script e sem mexer no
código. A senha é hasheada no servidor e nunca volta para o app. Exige
`EXIGIR_TOKEN = true`.

### Obras por usuário

Cada usuário pode ficar restrito a algumas obras, ou enxergar todas (padrão).
Quem já estava cadastrado antes desta versão continua vendo todas: restringir é
ato deliberado do administrador, nunca efeito colateral de uma atualização.
Administrador enxerga tudo por definição — senão não teria como consertar o
acesso de ninguém.

A regra vale **no servidor**, não só na tela: esconder a obra no menu não
impediria um pedido direto para a URL do `/exec`. Tentativa negada fica
registrada na aba **Auditoria**.

### A sessão dura até você sair

O login vale **até clicar em Sair**. Não expira sozinha.

Antes a sessão vivia no `CacheService` do Apps Script. Isso parecia dar 6 horas,
mas `CacheService` é **cache, não armazenamento**: o Google descarta a entrada
quando quer, e **toda republicação do backend limpa tudo**. Na prática as pessoas
eram deslogadas a esmo, quase sempre no meio de lançar alguma coisa.

Agora a sessão fica nas Propriedades do script, que são duráveis. Sair revoga o
token **no servidor** — antes o logout só esquecia o token no aparelho, e ele
seguia aceito por quem o tivesse copiado.

Como sessão não expira mais sozinha, o gatilho `limparSessoesAbandonadas` (03h)
remove o que não é usado há um ano. É o que evita a propriedade crescer sem fim;
o Apps Script tem teto de 500 KB no total. Rode `configurarGatilhos()` de novo
para agendá-lo.

> O `RDO_Avanco` ganha a coluna `usuario` automaticamente na primeira gravação
> após esta versão: é ela que define o dono do lançamento. Registros antigos
> ficam sem dono e, por isso, só o administrador os apaga.

## Automações (fazer 1×)

No editor do Apps Script, selecione a função **`configurarGatilhos`** e clique ▶ Executar. Isso agenda:

- **`backupDiario`** (02h) — cópia completa da planilha na pasta "Backups Teotonio" do Drive, mantendo as 14 mais recentes.
- **`registrarClimaAuto`** (05h) — chuva de ontem via Open-Meteo gravada em `RDO_Diario` (colunas `Chuva_mm_Auto`/`Clima_Fonte`, criadas sozinhas). Contraprova objetiva do clima apontado — base para pleitos de prazo. Ajuste `OBRA_LAT`/`OBRA_LON` se necessário.

Utilitário: `criarRDOsVaziosDoMes()` preenche datas sem RDO de qualquer mês (edite `ANO_MES_ALVO` no topo da função antes de rodar).

## Configuração pela planilha (sem mexer em código)

- **Produtividade**: coluna opcional `Produtividade` na aba `Pacotes` — quando preenchida, sobrepõe o padrão hardcoded no planejamento e nas curvas.
- **Prazo da obra**: o término vem da linha-raiz (Nivel 0) da aba `Cronograma` (export do MS Project). Re-exporte o cronograma revisado para a aba e o baseline do painel acompanha.
- **Curva prevista por pacote**: preencha a coluna `Pacote_ID` da aba `Cronograma` (ex.: `P26`) nas tarefas correspondentes — o app usa min(Início)–max(Término) por pacote no lugar da distribuição linear.

## Notas Fiscais, estoque e preços

Tela **Notas Fiscais** (abas Notas · Estoque · Preços · Painel). O caminho do
apontador é **fotografar a nota e conferir**, não digitar:

1. **Nova nota fiscal** → fotografar, ou escolher PDF/imagem.
2. O app lê nesta ordem: **chave de acesso** (do texto do PDF ou do código de
   barras — tem dígito verificador, ou está certa ou é recusada) → **consulta da
   nota pela chave** (dados oficiais do XML) → **texto do PDF interpretado por
   IA** → **OCR + IA na imagem** → o que faltar, digita.
3. A tela de conferência abre preenchida; campo em que a leitura ficou insegura
   vem **marcado em amarelo com "confira"**.

Junto vêm: fornecedor reconhecido pelo CNPJ (validado por dígito verificador),
catálogo de materiais aprendido das próprias notas, **estoque com lote**
(`NF <número>/<série>`) — reenviar a mesma nota **não** dá entrada em dobro —,
**saída de estoque** (saldo é *o que ainda tem*, não *o que chegou*),
**histórico de preço** por material (menor, médio ponderado, maior, último e o
fornecedor mais barato), apontamento de **divergências** e **auditoria**.

> **Código-fonte compartilhado.** `js/nf/notas.js` e `js/ui/icones.js` são
> **cópias sem alteração** do app "Gestor — Controle de Obras". Quem faz a ponte
> é `js/nf/adaptador.js`, que traduz o vocabulário de lá (`obra()`, `postAcao()`,
> `esc()`…) para o deste app — sem lógica de negócio dentro. Corrigiu de um
> lado, copie o arquivo para o outro.

No backend, o mesmo bloco de `nfListar`/`nfSalvar`/`nfLerIA`/`saidaSalvar` foi
copiado para o `Code.gs`, com as abas `NotasFiscais` e `EstoqueSaidas` criadas
sozinhas. Para a leitura por IA, defina no Apps Script a propriedade
`GEMINI_API_KEY` (e, opcionalmente, `GEMINI_MODEL`).

## Equipamentos

Tela **Equipamentos**: frota da obra (própria e locada) e **apontamento de hora
de máquina** — data, turno, operador, início/fim, **paradas com motivo** (que
descontam da hora trabalhada), horímetro inicial/final, combustível, situação e
**assinatura do operador** (colhida no dedo, guardada privada no Drive).

Hora de máquina é medição: entra em relatório e em cobrança de locadora. Por
isso cada apontamento registra quem lançou, e **só o administrador ou quem
lançou pode apagar**. Equipamento não é excluído, é **desativado** — o histórico
de horas continua valendo depois que a máquina sai da obra.

O backend cria sozinho as abas `Equipamentos`, `Locadoras` e `ApontEquip`.
Sem sinal, o apontamento espera na fila do aparelho, como o RDO.

## Fotos e Galeria

No **Lançar Serviço**, cada linha aceita até **3 fotos** (a câmera traseira abre
direto no celular). A imagem é comprimida no aparelho, sobe para a pasta
**"Fotos RDO Teotônio (Privado)"** do Drive e a planilha guarda só o ponteiro
`drive_id:<id>` na coluna `foto_link` — nada de link público, porque foto de
obra mostra placa, rosto e endereço.

A tela **Galeria de Fotos** lista o registro fotográfico por pacote e por mês.
Como os arquivos são privados, a imagem vem pelo backend (`obterFoto`) e fica
guardada no aparelho (IndexedDB) — a segunda visita abre na hora. **Sem login,
a galeria mostra os cartões mas não as imagens.**

Sem sinal, o serviço e as fotos vão juntos para a fila do aparelho, nessa ordem:
quando a conexão volta, a linha é gravada primeiro e a foto acha o serviço pelo
`id` (que o app gera antes de enviar, justamente para isso).

## Modo Apresentação

Botão **APRESENTAR**, no rodapé do menu lateral. Reunião de obra com a
fiscalização não é lugar de navegar menu: alguém pergunta como está o avanço e
quem apresenta fica rolando tela e clicando filtro, com o projetor mostrando
tudo. Aqui a obra vira uma sequência fechada de telas grandes, em tela cheia,
que passam sozinhas a cada 9 segundos.

Setas ← → trocam de tela, **espaço** pausa e **ESC** sai. Tela sem dado não
entra na sequência — apresentação com tela vazia passa impressão de sistema
vazio.

Os números saem das **mesmas funções do Painel Executivo**
(`calcExecMetrics`, `calcFrentesAnalise`, `calcCurvaPrevista`). Não é um
relatório à parte: se divergisse do painel, viraria uma segunda versão da
verdade.

## Central de Campo

Cartão no topo do Painel Executivo, fora dos filtros de mês e frente — é
sempre **hoje**. Mostra o que já foi registrado no dia (serviços lançados, RDO
Diário, apontamento de equipamento) e o que falta.

O painel responde "como vai a obra"; não respondia "o que falta fazer hoje".
Quando o RDO do dia não é preenchido, ninguém percebe — só na hora de fechar a
medição, semanas depois, quando não dá mais para lembrar o que foi executado.

## Projetos

Tela **Projetos**: as pranchas do executivo **abertas dentro do app**, nunca no
leitor de PDF do aparelho. No celular do canteiro, abrir em app externo tira o
apontador do sistema e, sem sinal, muitas vezes nem abre.

### Por que a prancha grande não é mais um PDF

A prancha da Teotônio é uma folha A1 com ~50 mil entidades vetoriais. Com PDF.js,
cada passo de zoom mandava redesenhar tudo: segundos parado, e no meio de um
gesto de dois dedos a tela simplesmente não acompanhava. Um SVG com 50 mil nós é
pior — o navegador rasteriza de novo a cada mudança de escala.

Então ela é servida como **pirâmide de quadrados**, do jeito que mapa de rua
funciona:

```
projetos/teotonio/implantacao/
  prancha.json          manifesto (856 bytes)
  0/0_0.webp            nível 0 — a folha inteira, 443 px
  …
  6/12_34.webp          nível 6 — 28368 × 8556 px (12 px por ponto do PDF)
```

Cada nível tem o dobro da resolução do anterior, até **12 px por ponto do PDF**
(~864 dpi na folha A1 — dá para ler cota de 2,9 pt sem borrar). Arrastar e
ampliar viram **um `transform`** na camada: a GPU compõe o que já está
desenhado, nada é rasterizado de novo, e só os poucos quadrados que entram na
tela são baixados.

| | |
|---|---|
| Pirâmide inteira | 835 quadrados · 12,6 MB |
| **Custo de abrir a tela** | **~100 KB** (a folha inteira, num nível grosso) |
| Custo de ampliar num ponto | ~10 quadrados, ~150 KB |
| Papel em branco | 393 dos 952 quadrados do nível fino **não existem** |

O manifesto traz um bitmap dizendo quais quadrados existem — quadrado em branco
não vira arquivo no repositório nem pedido de rede. O `sw.js` guarda os
quadrados num **balde próprio** (`VERSAO_PRANCHAS`), que sobrevive à atualização
do app, e os serve **sem revalidar**: são imutáveis, e revalidar dezenas deles a
cada arrastada gastaria o 4G do canteiro para receber o mesmo desenho de volta.

No visor: arrastar (com inércia), pinça, roda do mouse, toque duplo, setas do
teclado, **Girar** (a folha é 3,3× mais larga que alta — deitada, ocupa a tela
do celular em pé) e **Tela cheia** — esta por CSS, porque o Safari do iPhone só
dá fullscreen a vídeo. O botão **Offline** baixa a pirâmide inteira para o
aparelho, para a prancha abrir sem sinal nenhum.

Para fatiar uma prancha nova: `python3 ferramentas/fatiar-prancha.py entrada.pdf
projetos/<obra>/<nome>/` (precisa de `pymupdf` e `pillow`). Refatiar uma prancha
existente pede que se suba o `VERSAO_PRANCHAS` do `sw.js` — o nome do arquivo
não muda, então é a versão do balde que descarta os quadrados velhos.

### Cadastro

Os arquivos ficam em `projetos/<obra>/` e são listados em `projetos`, na
configuração da obra dentro do `index.html`:

```js
projetos: [
  { grupo: 'Implantação', disciplina: 'Plano de ataque — planta', escala: '1:500',
    ref: 'Av. Sen. Teotônio Vilela — extensão inteira (est. 100 a 141 e 203 a 243)',
    cod: 'VM-TV-01-5P-103 rev.1',             // número como está no carimbo
    codObra: '1000-SI060-011-PV3-103_C',      // código interno SPObras
    tiles: 'projetos/teotonio/implantacao/',  // pirâmide (opcional)
    arquivo: 'projetos/teotonio/implantacao.pdf' },
]
```

`grupo` agrupa a lista lateral (Urbanismo, Drenagem, Pavimentação…), que só
aparece quando há mais de uma prancha. Prancha cadastrada **sem** `tiles` abre
pelo PDF.js vendorizado, como antes — é o caso das obras que ainda não passaram
pelo fatiador. `arquivo` é sempre o PDF, que alimenta os botões Abrir e Baixar.
Todos os perfis enxergam a tela — inclusive Campo, que é quem mais precisa saber
o que construir.

## Fila offline

Lançamento feito sem sinal espera no aparelho e sobe sozinho quando a conexão
volta — o reenvio é seguro porque o `addBatchRDO` deduplica por `clientId` e o
RDO Diário grava por (obra, data, turno).

A fila fica em **IndexedDB**, não em `localStorage`. O motivo é concreto: as
fotos entram nela em base64 (~160 a 400 KB cada) e o `localStorage` tem teto de
~5 MB por site. Num teste com 40 fotos de 300 KB, o armazenamento antigo
guardou **17** e perdeu **23 em silêncio** — o `setItem` estourava a cota e o
erro era engolido por um `catch` vazio. O apontador registrava a foto, o app
não reclamava, e a foto não existia. Com IndexedDB as 40 são guardadas, e
falha de gravação vira **aviso na tela**, não silêncio.

Quem já tinha itens na fila antiga não perde nada: eles são migrados na
primeira abertura, e a chave velha só é apagada depois que tudo gravou.

Sem IndexedDB disponível (navegação privada, navegador antigo), a fila volta
para o `localStorage` — mas agora com o erro visível.

## Muros de contenção (capítulo 10.0)

O aditamento trouxe o capítulo **10.0 — MURO DE ARRIMO**: R$ 1.491.057,79 em
20 itens (169 a 177-J), três muros a executar e um que ficou zerado. O serviço
ainda não começou; os pacotes já estão no app.

**Muro não se executa de uma vez ao longo do comprimento** — um trecho é
escavado semanas antes de ser concretado. Se cada muro fosse um pacote só,
lançar 40 m significaria dizer que aqueles 40 m estão prontos do rachão ao
guarda-corpo, e o avanço só apareceria no fim. Por isso cada muro entra como
**quatro pacotes em sequência**, todos medidos em **metro linear de muro** —
o mesmo desenho que o pavimento rígido já usa (P30A / P30B / P30C):

| | 1. Escavação e fundação | 2. Sapata | 3. Fuste (parede) | 4. Reaterro e acabamento |
|---|---|---|---|---|
| **Muros B e C** (42,25 m) | P37A | P37B | P37C | P37D |
| **Muro D** (39,00 m) | P38A | P38B | P38C | P38D |
| **Muro E** (135,00 m) | P39A | P39B | P39C | P39D |

Mais o **P40 — Rampa da escola** (27,225 m², junto ao Muro C2). O **Muro A**
não virou pacote: está no capítulo, mas com quantidade **zero** em todas as
memórias — pacote zerado só apareceria no painel como serviço eternamente
parado em 0%.

Para o apontador, o lançamento é o de sempre: frente → pacote → quantidade.
Ele mede metros de muro com a trena, não metros cúbicos de concreto. Quem
converte é a matriz de coeficientes, tirada direto das memórias de cálculo:
`coeficiente = quantidade contratual do item ÷ comprimento do muro`. Com os
três muros a 100%, **cada um dos 20 itens cai exatamente na quantidade do
aditamento** — `tests/muros-contencao.test.js` é a trava disso, e
`tests/muros-medicao.ui.test.js` refaz a conta dentro do app.

Duas coisas que a tela de lançamento ganhou junto:

- A **observação do pacote** aparece embaixo do seletor ("Est. 129+15 a
  136+10 — canteiro central", "Espessura 15cm"). Estava só na planilha, onde
  ninguém no canteiro olha.
- Aviso quando uma etapa **passa a anterior** — fuste lançado onde ainda não
  há sapata mede serviço que não foi feito. Não bloqueia: a etapa anterior
  pode ter sido executada antes do app, ou num mês que ninguém digitou.

> **O avanço ponderado da obra CAI ao entrar com os muros, e está certo.**
> São ~180 dias-equivalentes de escopo novo sobre ~3.140 que já existiam:
> cerca de **5,4 pontos percentuais** de diluição. A obra não andou para trás
> — ela ficou maior. Foi o que o aditamento fez.

### Enquanto a planilha não tem os muros

Os pacotes e coeficientes vêm de `dados/teotonio-muros.js`, do próprio
repositório, e são somados ao que a planilha publicada devolve. É o que
permitiu o serviço entrar no ar sem esperar alguém editar a planilha — quem
edita a planilha não é quem está no canteiro.

Para levá-los para a planilha, cole os dois blocos de
**`docs/muros-planilha.csv`** nas abas `Pacotes` e `Coeficientes`. A partir
daí **a planilha manda**: `aplicarComplemento()` só acrescenta o pacote cujo
ID não veio de lá, e os coeficientes seguem o pacote. Colar não duplica nada,
e o arquivo não precisa ser removido do código no mesmo instante.

## Prévia de Medição

Tela **Apoio Medição** → selecione o mês → **⬇ CSV p/ conferência**. O arquivo (separador `;`, decimal com vírgula) traz o consumo derivado por item contratual no período, pronto para confrontar com a coluna do mês da Planilha Geral do `.xlsm`.

O backend também expõe `?action=producaoPorPacote&mes=2026-06` (JSON, deduplicado na leitura) para automações externas.

### O mesmo código em dois capítulos

Cinco códigos SIURB do capítulo do muro se repetem em outros capítulos —
`06-06-00` (lastro) também é da drenagem, `05-48-00` (BGS) e `04-11-00`
(escavação mecânica) também são do pavimento, `05-20-00` (rachão) idem,
`13-02-47` (podotátil) também é da via. Cada um é uma **linha diferente** da
Planilha Geral, com a sua própria quantidade contratual: somar os dois numa
linha só daria um número que não confere com nenhuma das duas.

Por isso a matriz de coeficientes aceita a coluna opcional **`Item Planilha`**
com o nº do item (169-A, 177-B…). Quando ela vem preenchida, a prévia separa
as linhas e mostra o nº do item embaixo do código; o CSV ganha a coluna
`Item_Planilha`. As 104 linhas que já existiam não têm a coluna e continuam
agregando por código, como sempre foi.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | O app inteiro (telas, lógica, PDF/Excel de RDO) |
| `Code.gs` | Backend Apps Script (colar no editor da planilha) |
| `limpar_duplicados.gs` | Utilitário antigo de limpeza (o `Code.gs` já cobre via `limparDuplicados`) |
| `manifest.json` / `sw.js` / `icon-*.png` / `favicon.svg` | PWA — a marca é a avenida em perspectiva |
| `pacotes.csv` | Snapshot de referência da aba Pacotes |
| `dados/teotonio-muros.js` | Pacotes e coeficientes dos muros de contenção, enquanto a planilha não os tem (ver acima) |
| `docs/muros-planilha.csv` | As mesmas linhas prontas para colar nas abas `Pacotes` e `Coeficientes` |
| `js/ui/icones.js` | Conjunto de ícones do app — traço único na grade de 24, cor herdada do tema. Cobre navegação, ações e frentes de serviço (`icFrente()` escolhe pelo nome da frente) |
| `vendor/` | Bibliotecas servidas pelo próprio site (ver abaixo) |

### Bibliotecas vendorizadas, carregadas sob demanda

Nada de CDN: CDN não existe no canteiro. Tudo é servido pelo próprio GitHub
Pages, e o service worker guarda junto com o app.

| Pasta | Biblioteca | Quando é buscada |
|---|---|---|
| `vendor/chartjs/` | Chart.js 4.4.0 | ao abrir um painel com gráfico |
| `vendor/jspdf/` | jsPDF 2.5.1 + AutoTable 3.5.31 | ao gerar um PDF |
| `vendor/xlsx/` | xlsx-js-style 1.2.0 | ao exportar Excel |
| `vendor/pdfjs/` | PDF.js (Mozilla) | na leitura da DANFE e nas pranchas ainda em PDF |
| `vendor/fontes/` | Space Grotesk + JetBrains Mono | na abertura (140 KB, subconjunto latino) |

**Nenhuma das quatro primeiras entra no `<head>`.** Somadas são 1,3 MB, e
enquanto o navegador as baixava e compilava a tela ficava branca — 13 segundos
no 4G de campo, medidos. Nada disso é necessário para abrir o app e lançar um
serviço, que é o uso mais frequente.

Agora cada uma é buscada na primeira vez que faz falta, por `usarLib()`:

```js
await usarLib('pdf');            // garante jsPDF + AutoTable na memória
comLib('excel', gerarPlanilha, 'a planilha');   // idem, já com aviso de espera
```

Duas chamadas simultâneas dividem o mesmo download, e o service worker guarda
depois da primeira vez — a segunda é instantânea e funciona sem sinal.

O efeito na abertura, com cache vazio:

| Rede | 1ª pintura antes | depois | App visível antes | depois |
|---|---|---|---|---|
| 4G bom (10 Mbps) | 13,0 s | **0,5 s** | 13,2 s | **1,7 s** |
| 4G ruim (1,6 Mbps) | 13,1 s | **1,9 s** | 13,4 s | **6,7 s** |
| 3G (0,4 Mbps) | 41,9 s | **6,8 s** | 53,0 s | **25,8 s** |

Transferência no primeiro acesso: 2.560 KB → **1.233 KB**.

As fontes saíram do Google Fonts e vieram para `vendor/fontes/`: a folha de
estilo externa bloqueava a pintura, então com sinal ruim a tela esperava um
servidor de fora. Era também a última dependência de terceiros do app.

Ao trocar de versão de qualquer uma, suba também o `VERSAO` do `sw.js` — é
isso que descarta o cache antigo nos aparelhos.

### Aviso de nova versão

O app não troca mais de versão sozinho no meio do uso: quem estava com um RDO
na tela via a página recarregar e perdia o que tinha digitado. Agora o service
worker novo fica esperando, o app mostra **"Nova versão do sistema disponível ·
Atualizar"** no canto, e a troca só acontece quando o usuário mandar — ou na
próxima vez que ele abrir o app.

## Licença

Copyright © 2026 Leonardo Maciel. **Todos os direitos reservados.**

Software **proprietário**. O código estar visível aqui não o torna livre nem de
código aberto, e não autoriza uso, cópia, modificação ou obra derivada — ver
[LICENSE](LICENSE). O direito de uso pelos clientes vem por contrato, na forma
de licença de uso, e não de cessão de propriedade; os dados lançados pelo
cliente são dele.

As bibliotecas em `vendor/` são de terceiros e mantêm as suas próprias licenças
(MIT, Apache-2.0, OFL), listadas no `LICENSE`.
