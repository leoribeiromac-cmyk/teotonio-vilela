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

1. Instale o `clasp`: `npm install -g @google/clasp@3.3.0`

   Confira com `clasp --version` que veio **3.3.0 mesmo**. A versão importa: o
   formato do `~/.clasprc.json` mudou entre a 2.x (chaves `token` +
   `oauth2ClientSettings`) e a 3.x (chave `tokens`). Credencial gerada por uma
   versão e lida por outra **não falha no login** — falha na primeira
   implantação de verdade, que é o pior momento para descobrir. O fluxo do
   GitHub instala a 3.3.0; se a sua for outra, gere a credencial de novo com
   `npx @google/clasp@3.3.0 login`. (O Cloud Shell já traz o `clasp`
   pré-instalado, e o `npm install -g` pode não sobrescrever.)
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
   > `clasp show-authorized-user` na 3.x (`clasp login --status` é da 2.x e não
   > existe mais).
   >
   > A 3.x aceita `clasp login --redirect-port 8888`, que fixa a porta em vez
   > de sortear uma — deixa o `curl` acima previsível.
4. Descubra o **id do projeto** — e confira que é o **projeto certo**.

   > ⚠ Uma conta do Google costuma ter vários projetos do Apps Script, e todos
   > chamam o arquivo principal de `Code.gs`. Na primeira configuração desta
   > automação o id apontava para "Equipamentos Teotonio - Base" (um `Code.gs`
   > de 13 KB) em vez do backend do RDO (148 KB). Publicar ali teria
   > **substituído um backend inteiro pelo outro**.
   >
   > O jeito seguro de achar o certo: o `index.html` traz a URL que o app
   > chama, em `CONFIG.appsScript` — algo como
   > `https://script.google.com/macros/s/<ID-DA-IMPLANTAÇÃO>/exec`. O projeto
   > procurado é o que tem **essa** implantação no `clasp deployments`.
   >
   > Confirmação rápida: o `clasp pull` do projeto certo traz um `Code.gs` com
   > mais de 140 KB, contendo `NOME_ABA_DIARIO` e `function upsertRDODiario`.

   Com o projeto certo aberto: ⚙ **Configurações do projeto → IDs → ID do
   script**.
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

   > ⚠ **Os nomes dos arquivos têm de bater.** No projeto da Teotônio o arquivo
   > principal chama-se **`Código.gs`**, com acento, enquanto o repositório
   > guarda **`Code.gs`**. Para o `clasp` são dois arquivos diferentes: o push
   > criaria um `Code` novo e **apagaria** o `Código`.
   >
   > A conferência bloqueia isso antes de acontecer, mas a implantação só passa
   > a funcionar quando os nomes coincidirem. O caminho mais simples é
   > **renomear no editor do Apps Script**: painel da esquerda → ⋮ ao lado de
   > `Código` → *Renomear* → `Code`. Renomear arquivo não mexe em função
   > nenhuma, e a versão já implantada continua no ar até a próxima publicação.
7. Descubra o **id da implantação**: `clasp deployments`. Copie o id daquela
   que é o app da web (a que corresponde à URL `/exec` que o app usa).

> ⚠ **O id da implantação é o detalhe que mais importa.** `clasp deploy` sem
> ele **não dá erro** — está escrito no próprio fonte do clasp
> (`core/project.js`): *"If no deploymentId is provided, create a new
> deployment."* Ele cria uma implantação nova, com uma URL `/exec` nova, e
> devolve sucesso. O app continua falando com a URL antiga.
>
> Por isso a automação usa `clasp redeploy <id>`, e não `clasp deploy -i`: no
> `redeploy` o id é argumento **obrigatório**, então a falta dele para o
> comando. Entre um comando que falha e um que publica no lugar errado
> dizendo que deu certo, o que falha é o seguro. Por isso os dois
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

Para copiar o conteúdo da credencial, **não use `cat`**. Abra o arquivo num
editor, com a página do segredo do GitHub já aberta ao lado, e leve o conteúdo
direto de um para o outro:

```bash
cloudshell edit ~/.clasprc.json   # Google Cloud Shell
open -e ~/.clasprc.json           # Mac
notepad %USERPROFILE%\.clasprc.json   # Windows
```

Copie **tudo**, incluindo as chaves `{` `}`, e cole no valor do segredo.

> ⚠ **Isto aconteceu de verdade nesta obra.** O `cat` imprime a credencial no
> terminal, e terminal é o que a gente copia e cola em conversa quando algo dá
> errado — foi exatamente assim que o token foi parar num histórico de chat e
> precisou ser revogado.
>
> A regra é simples: **o conteúdo do `~/.clasprc.json` vai do arquivo para o
> campo do segredo, e para mais lugar nenhum.** Não para uma conversa, não para
> um assistente, não para um e-mail, nem "só para conferir". Se ele aparecer em
> qualquer lugar que não seja esse campo, revogue em
> https://myaccount.google.com/permissions e gere outro — leva 5 minutos e o
> app não sente nada, porque essa credencial só serve para publicar.

Depois de criar os três, teste sem esperar merge nenhum: aba **Actions →
implantar-appscript → Run workflow**. Se algo estiver errado, o próprio fluxo
diz o quê — ele foi escrito para parar com o motivo, não para falhar seco.

Sem os três, o fluxo **não falha** — ele avisa que não está configurado e
encerra, e o `Code.gs` segue sendo colado à mão.

> ⚠ **Pese esta escolha.** O `CLASPRC_JSON` é um token de acesso à sua conta
> Google, com escopos amplos (Drive, Apps Script, Cloud). Guardado como segredo
> do GitHub ele não aparece nos registros, mas passa a existir fora da sua
> máquina. Se isso incomodar, fique no caminho A — ele resolve o mesmo
> esquecimento sem tirar a credencial do seu computador.
>
> **Este repositório é público**, então vale ser preciso sobre o que isso muda
> — e o que não muda:
>
> - Segredo **não** é código: fica cifrado e não aparece no que qualquer um
>   lê. O GitHub também mascara o valor nos registros de execução.
> - Fluxo disparado por *pull request* vindo de um fork **não recebe segredo
>   nenhum** — é regra do GitHub. E este fluxo nem escuta `pull_request`: só
>   `push` na `main` e execução manual, que exigem acesso de escrita.
> - O fluxo nunca imprime a credencial, e a apaga no fim mesmo quando a
>   implantação falha.
> - O que sobra de risco é o de sempre: quem tiver acesso de escrita ao
>   repositório, ou à sua conta do GitHub, alcança o segredo. **Rotacione** o
>   token quando não precisar mais dele — revogar em
>   https://myaccount.google.com/permissions desliga a automação e não afeta o
>   app em nada.
>
> Quem cola esse valor é **você**. Não peça a um assistente para ler o arquivo
> e colar por você: credencial viva não deve passar por intermediário nenhum.

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

### A estação é de cada obra

Não existe "a estação do sistema": **cada obra tem a sua**, e ela sai da
coordenada do canteiro. Antes era uma só (`A701`, Mirante de Santana) para
tudo — a 25 km da Teotônio, 17 km das Ruas de Terra e 52 km do Ranário, que
fica noutro município. Chuva de verão em São Paulo é convectiva: chove 30 mm
no Grajaú com Santana seco no mesmo dia, e um pleito de prorrogação apoiado
numa estação tão longe se defende mal.

A escolha **não** é uma tabela de códigos escrita à mão — essa envelhece calada
quando o INMET desativa uma estação. A obra declara a coordenada em
`CLIMA_OBRAS` (no `Code.gs`) e o resto vem do catálogo do próprio INMET,
guardado por 30 dias: ganha a estação automática **em operação mais próxima**.
Se ela estiver muda naquele dia — e estação de campo cai —, a busca desce para
a seguinte, e a resposta diz qual respondeu e a que distância da obra.

Depois de mexer numa coordenada, rode **`conferirEstacoes()`** no editor do
Apps Script: ela imprime, para cada obra, as três estações mais próximas com a
distância. É a conferência que não exige esperar chover.

| Propriedade do script | Para quê |
|---|---|
| `INMET_ESTACAO_<OBRA>` | Trava a estação de UMA obra (ex.: `INMET_ESTACAO_TEOTONIO` = `A771`). Use quando conhecer a região melhor que a distância em linha reta |
| `INMET_ESTACAO` | Trava a estação de TODAS as obras. Era o ajuste antigo; continua valendo, agora como último recurso |
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
- **`registrarClimaAuto`** (05h) — chuva de ontem gravada em `RDO_Diario` (colunas `Chuva_mm_Auto`/`Clima_Fonte`, criadas sozinhas), **de todas as obras**, pela mesma fonte do botão do RDO (INMET, estação de cada obra). Contraprova objetiva do clima apontado — base para pleitos de prazo.
- **`enviarRDODeOntemPorEmail`** (10h) — manda o RDO oficial de **ontem**, em PDF, para a lista de destinatários. Só da **Teotônio**. Detalhado abaixo.

Utilitário: `criarRDOsVaziosDoMes()` preenche datas sem RDO de qualquer mês (edite `ANO_MES_ALVO` no topo da função antes de rodar).

### O RDO do dia por e-mail

Só da **Teotônio**: este backend atende várias obras, mas o RDO diário na caixa
da fiscalização é exigência do contrato dela. O app das outras obras nem
deposita (`OBRAS_COM_RDO_POR_EMAIL`, no `index.html`), e o depósito de outra
obra é recusado pelo `Code.gs`. Obra que passar a mandar entra nos dois.

O PDF oficial é desenhado **no navegador** (jsPDF, dentro do `index.html`), e o
Apps Script não sabe redesenhá-lo — reescrever lá o layout de um documento que a
fiscalização assina seria manter dois desenhos do mesmo papel, que divergem no
primeiro ajuste feito de um lado só. Então o servidor não gera: ele **recebe**.

1. **Depósito.** Salvou o turno, o app monta o PDF oficial daquele dia e o manda
   para o backend (`rdoPdfDoDia`), que o guarda numa pasta privada do Drive —
   um arquivo por obra e por data. RDO corrigido, ou turno noturno salvo depois
   do diurno, **substitui** o depósito do dia. Gerar o "PDF Oficial" à mão
   também repõe o depósito daquele dia — é a rede de segurança para quando o
   sinal do canteiro derruba o envio na hora de salvar, e é como se põe em dia
   um RDO atrasado: um dia que nunca foi depositado passa a existir para o
   servidor assim que alguém gera o PDF dele, e aí `reenviarRDOPorEmail` tem o
   que mandar.
2. **Envio.** Às 10h o gatilho pega o PDF depositado **do dia anterior** e manda
   para a lista, com o resumo do dia no corpo (nº do RDO, apontadores, clima, nº
   de serviços lançados, visitas, paralisações, ocorrências e observações).

O e-mail da manhã leva o RDO de **ontem**, não o de hoje: às 10h o dia de hoje mal
começou — o turno diurno está no meio — e o que sairia para a fiscalização seria um
relatório quase vazio. O que se manda de manhã é o dia que **fechou**, com os dois
turnos, o efetivo inteiro e as ocorrências.

Cada dia sai **uma vez**: a Propriedade `RDO_EMAIL_LOG` guarda o que já foi
enviado, então o gatilho rodando duas vezes não repete o e-mail.

**Dia sem RDO depositado** (domingo, feriado, turno que ninguém fechou): nada vai
para a fiscalização. O aviso sai só para o dono do script — mandar "ontem não teve
RDO" para o cliente toda segunda-feira é a forma mais rápida de o e-mail diário
virar spam para quem o recebe. De manhã esse aviso ainda serve para alguma coisa:
dá tempo de cobrar o apontador que não fechou o turno antes de o dia seguinte virar.

Configuração, tudo por Propriedade do script (Configurações do projeto →
Propriedades do script) — sem deploy novo:

| Propriedade | Para quê | Padrão |
| --- | --- | --- |
| `RDO_EMAILS` | Destinatários, separados por vírgula, ponto-e-vírgula ou quebra de linha. Quando existe, manda na lista do código. | a lista `RDO_EMAIL_DESTINOS` do `Code.gs` |
| `RDO_EMAIL_HORA` | Hora do envio (0 a 23). Vale depois de rodar `configurarGatilhos()` de novo. | `10` |

Funções para rodar no editor:

- **`conferirEnvioRDOEmail()`** — diz para quem vai, a que horas, se o gatilho
  está instalado e se o RDO que o próximo envio vai levar já foi depositado. Não
  manda e-mail nenhum.
- **`reenviarRDOPorEmail('2026-08-24')`** — manda (ou remanda) o RDO da
  Teotônio naquela data. É o caminho do RDO corrigido depois das 10h, e o de
  pôr em dia um dia atrasado (depois de gerar o PDF Oficial dele no app).

> `MailApp` é uma permissão **nova** para o projeto: na primeira execução o
> Google pede a autorização de novo ("app não verificado" → Avançado → Acessar).
> Enquanto ela não for dada, o gatilho falha em silêncio — `conferirEnvioRDOEmail()`
> roda antes e mostra se está tudo de pé.

## Configuração pela planilha (sem mexer em código)

- **Produtividade**: coluna opcional `Produtividade` na aba `Pacotes` — quando preenchida, sobrepõe o padrão hardcoded no planejamento e nas curvas.
- **Prazo da obra**: o término vem da linha-raiz (Nivel 0) da aba `Cronograma` (export do MS Project). Re-exporte o cronograma revisado para a aba e o baseline do painel acompanha.
- **Curva prevista por pacote**: preencha a coluna `Pacote_ID` da aba `Cronograma` (ex.: `P26`) nas tarefas correspondentes — o app usa min(Início)–max(Término) por pacote no lugar da distribuição linear.

## Notas Fiscais, estoque e preços

Tela **Notas Fiscais** (abas Notas · Consultas · Estoque · Preços · Painel). O
caminho do apontador é **fotografar a nota e conferir**, não digitar:

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

### Filtrar e consultar

O filtro é **um só** e vale para a lista, para as Consultas e para o Painel:
pesquisa livre, situação, período (últimos 30/90 dias, este mês, mês passado,
este ano ou mês a mês), **fornecedor**, **material**, **UF**, **quem lançou**,
**faixa de valor**, **intervalo de datas** e a **data base** — recebimento na
obra ou emissão da nota, que são perguntas diferentes e mudam o mês de quem
cruza a virada. Somam-se os marcadores (*a conferir, com divergência,
repetidas, sem produtos, sem imagem, sem chave, com frete*), que valem em
conjunto: dois marcados são as duas condições na mesma nota. A lista sai
ordenada como se pedir e aparece em **cartões ou em tabela** — a tabela mostra
produtos, frete, ICMS e total lado a lado, com a soma do filtro inteiro no pé.

A aba **Consultas** é uma tabela dinâmica pequena: escolha a **linha**
(fornecedor, material, mês, situação, quem lançou, município/UF), a **coluna**
(qualquer outra dimensão, ou nenhuma) e a **medida** (valor, nº de notas,
linhas de produto, quantidade, frete, ICMS). Nove consultas prontas já vêm
montadas (*gasto por fornecedor, material × fornecedor, fornecedor × mês,
quanto entrou de cada material…*). Quando material entra na conta, a apuração
desce para o **item da nota**; frete e ICMS, que são da nota inteira, não
descem junto — ratear inventaria número que a nota não tem. Abaixo, a tabela
**produto por produto** responde ao "o que entrou de tubo em julho, linha por
linha". Tudo sai em CSV: notas, produtos e a própria consulta.

O **Painel** consolida o mesmo recorte: valor, ticket médio, frete, ICMS,
pendências, evolução mês a mês (com variação e acumulado), **concentração da
compra** por fornecedor, **idade da conferência pendente** e quem lançou. O
**Estoque** ganhou filtros, `% consumido`, **materiais parados** e o **consumo
por frente e rua** (para onde o material foi). Os **Preços** ganharam filtros,
a **diferença para o menor preço já pago** e o ranking de **quem cobra mais
barato**, comparando cada compra com a média daquele material.

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

### Corrigir um apontamento

Errar o horário de fim é o engano mais comum do canteiro, e até aqui o único
conserto era **apagar e lançar de novo** — o que custava o carimbo (a
identidade da linha), o dono e a assinatura do operador, e deixava a hora
daquele equipamento fora da medição no meio do caminho.

Em **Últimos**, cada apontamento tem agora o botão de **corrigir** ao lado do
de apagar. Ele traz o lançamento de volta **para o mesmo formulário** — as
paradas voltam a ser linhas, e só os detalhes escritos pelo apontador voltam
para as observações (o cabeçalho `[Turno: …] | Operação: …` é remontado no
envio). Uma faixa âmbar no alto e o texto do botão dizem que se está
corrigindo, não lançando; **Cancelar correção** desfaz, e sair da tela (ou
trocar de obra) também.

Quem pode corrigir é **o dono da linha, o administrador e a engenharia** — a
mesma régua do `updateRDO`, pelo mesmo motivo: corrigir dado errado para poder
fechar a medição. A obra conferida é a **da linha**, não a que o app declarou.
No backend principal, `equipEditar` reescreve a linha **no lugar** e a
Auditoria guarda o antes e o depois. No Apps Script legado da Teotônio, que
este repositório não publica e não sabe editar, a correção é **reenvio**:
grava o corrigido primeiro e só então apaga o antigo — nessa ordem, porque na
inversa uma falha apagaria a hora da medição e não sobraria nada para ver.

Máquina **desativada** depois do lançamento continua corrigível: ela entra no
`<select>` marcada como *(fora do cadastro)*.

**A tela existe em toda obra, e cada obra vê só a própria frota.** São dois
backends: a **Teotônio** segue no Apps Script legado do app
`Equipamentos-teotonio` (URL no campo `equipamentos` do cadastro dela — os
apontamentos já lançados seguem valendo, nada migra); as **demais obras**
usam o backend principal (`Code.gs`), que guarda tudo nas abas
`Equipamentos`/`Locadoras`/`ApontEquip` separadas pela coluna `obra` — a
coluna nasce sozinha na primeira chamada, e linha antiga sem valor é da
Teotônio, como nas outras abas. A tela é uma só: `backendEquip()` (em
`js/equip/equipamentos.js`) decide URL e dialeto pela obra aberta, e trocar
de obra zera o cache que a Central de Campo e a apresentação leem.

## Bota-Fora

Tela **Bota-Fora**: cada caminhão que sai do canteiro com entulho ou solo é uma
**viagem cobrada**. O controle disso vivia numa planilha do escritório
preenchida de memória no fim do mês, a partir de um maço de tickets — e a
conta do transportador chegava com viagens que ninguém conseguia confirmar nem
contestar.

A viagem passa a ser registrada **na saída**, pelo apontador, com as três
provas que a discussão exige:

- **foto da carga / placa** — o que saiu e em qual caminhão;
- **assinatura do motorista** — colhida no dedo, em tela cheia;
- **foto do ticket** — o comprovante do aterro, que é o documento que o
  transportador anexa à fatura.

As imagens vão para a pasta **"Bota-Fora Teotônio (Privado)"** do Drive e a
planilha guarda só o ponteiro `drive_id:<id>` — nada de link público, mesmo
desenho das fotos do serviço. Sem sinal, a viagem inteira (provas incluídas)
espera na fila do aparelho: bota-fora se registra na boca da obra, que é onde
o 4G falha. O `clientId` impede que o reenvio cobre a mesma viagem duas vezes.

Data, fornecedor, projeto, origem, destino e valor **ficam preenchidos** de uma
viagem para a outra — o que muda a cada carga é placa, motorista e as provas.

O backend cria sozinho a aba `BotaFora`, separada por obra pela coluna `obra`.
Cada viagem registra quem lançou, e **só o administrador ou quem lançou pode
apagá-la**.

### A planilha (aba FRETE)

O botão **Viagens e planilha** abre o período, mostra o que já foi gasto e
gera o `.xlsx`. A aba **FRETE** sai no formato do fechamento que a empresa já
usa, com as colunas na mesma ordem:

`FORNECEDOR` · `DATA FRETE` · `PLACA` · `TIPO MATERIAL` · `MOTORISTA` ·
`FRETE OU FRESA` · `PROJETO` · `VALOR FRETE` · `OBSERVAÇÕES`

O título da primeira linha é o trajeto — `FRETE - <origem> >> <destino>` — e
a última linha fecha o total do período. **Data é data e valor é número**, não
texto: a planilha do escritório soma e ordena por essas colunas, e texto ali
obriga a refazer tudo à mão.

Vai junto uma segunda aba, **COMPROVAÇÃO**, com o link de cada prova no Drive
— é com ela que se confere a fatura do transportador linha a linha. Onde a
prova não existe, a célula diz isso em vez de ficar vazia.

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
  prancha.json          manifesto (1,5 KB)
  0/0_0.webp            nível 0 — a folha inteira, 443 px
  …
  7/16_16.webp          nível 7 — 56736 × 17112 px (24 px por ponto do PDF)
```

Cada nível tem o dobro da resolução do anterior, até **24 px por ponto do PDF**
(~1728 dpi na folha A1). Arrastar e ampliar viram **um `transform`** na camada:
a GPU compõe o que já está desenhado, nada é rasterizado de novo, e só os poucos
quadrados que entram na tela são baixados.

Os 24 vieram no lugar de 12 porque o celular tem 3 pixels de tela para cada
pixel de CSS: com 12, o desenho de verdade acabava na metade do zoom que o visor
oferece, e dali para a frente o navegador só ampliava o borrão. Agora o traço é
real até o fim — e o quadrado do nível fino ficou MAIS leve, porque é a mesma
tinta espalhada em quatro vezes mais pixels:

| | antes (12 px/pt) | agora (24 px/pt) |
|---|---|---|
| Pirâmide inteira | 835 quadrados · 12,6 MB | 2.586 quadrados · 15,8 MB |
| **Custo de abrir a tela** | ~150 KB | **~120 KB** (a folha inteira, num nível grosso) |
| Custo de ampliar num ponto | ~12 quadrados, ~160 KB | **~12 quadrados, ~60 KB** |
| Papel em branco | 393 dos 952 do nível fino | 2.023 dos 3.774 do nível fino |

O que cresceu foi só o total da pasta — que só quem aperta **Offline** baixa
inteiro. Ver e ampliar ficou mais barato, não mais caro.

Os quadrados são gravados em WebP **sem perdas**, com o pré-arredondamento do
`cwebp` (`-near_lossless`). Traço de CAD é a pior entrada possível para
compressão com perdas, e a versão q92 que o fatiador usava antes errava até 208
de 255 num quadrado cheio: comia a linha de eixo fina e sujava a borda de todo
texto colorido. O modo atual erra no máximo 16 de 255, e só na rampa de
antisserrilhado — em tamanho real, lado a lado, é o mesmo desenho. De quebra,
saiu **menor em todos os sete níveis que já existiam** (−43% no nível de 12
px/pt), o que é o que pagou boa parte do nível novo.

O manifesto traz um bitmap dizendo quais quadrados existem — quadrado em branco
não vira arquivo no repositório nem pedido de rede. O `sw.js` guarda os
quadrados num **balde próprio** (`VERSAO_PRANCHAS`), que sobrevive à atualização
do app, e os serve **sem revalidar**: são imutáveis, e revalidar dezenas deles a
cada arrastada gastaria o 4G do canteiro para receber o mesmo desenho de volta.

A camada da GPU é do **movimento**, não da folha. `will-change: transform` (e o
`translate3d`) fazem o navegador guardar a prancha como camada e compor o gesto
na placa de vídeo — mas camada é rasterizada UMA VEZ, numa escala escolhida na
hora, e o `will-change` é literalmente o pedido para NÃO refazer esse raster
quando o transform muda. Parada, a prancha ficava sendo esticada a partir de um
raster velho: desenho borrado, que só endireitava quando outra coisa da página
obrigava o navegador a redesenhar — minutos depois, de uma vez só. Por isso a
classe `.movendo` entra quando o dedo (ou a roda, ou a inércia, ou a animação de
zoom) encosta e sai quando tudo para: em movimento vale a fluidez, parada vale a
nitidez. `tests/prancha-camada.ui.test.js` é a trava.

No visor: arrastar (com inércia), pinça, roda do mouse, toque duplo, setas do
teclado, **Girar** (a folha é 3,3× mais larga que alta — deitada, ocupa a tela
do celular em pé) e **Tela cheia** — esta por CSS, porque o Safari do iPhone só
dá fullscreen a vídeo. O botão **Offline** baixa a pirâmide inteira para o
aparelho, para a prancha abrir sem sinal nenhum.

Para fatiar uma prancha nova: `python3 ferramentas/fatiar-prancha.py entrada.pdf
projetos/<obra>/<nome>/` (precisa de `pymupdf` e `pillow`; com o `cwebp` do
pacote `webp` no PATH, os quadrados saem bem menores). Refatiar uma prancha
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

## Estaqueamento: o eixo é da obra

Onde o serviço foi executado é dito por **estaca**, e a estaca pertence a um
**eixo** da obra — não à avenida da Teotônio. Na Teotônio o eixo é o sentido
da pista (Centro→Bairro E99–E141, Bairro→Centro E201–E244); nas Ruas de Terra
é a **rua**, cada uma estaqueada a partir do zero (Agrimensor Sugaya E0–E12,
Astrogildo Pereira E0–E18, conforme as memórias de cálculo do projeto).

A obra declara os eixos no cadastro (`dados/<obra>.js`):

```js
eixoRotulo: 'Rua',                 // como o campo se chama na tela de lançamento
eixos: [
  { id: 'AGR', label: 'Agrimensor Sugaya',  ini: 0, fim: 12 },
  { id: 'AST', label: 'Astrogildo Pereira', ini: 0, fim: 18 },
]
```

O `id` é o que fica **gravado** no lançamento, entre parênteses —
`Local_Estaca` = `"E4 a E7 (AGR)"`. Trocar um id depois cega o histórico já
lançado; é para durar o contrato inteiro.

Quem não declara `eixos` continua funcionando: a Teotônio cai nos seus
`estacasCB`/`estacasBC`, e a obra vinda do "Gestor" no mapa `estacas`
(rua → nº de estacas). Obra **sem** estaqueamento nenhum não pergunta estaca
no lançamento, e as telas de mapa e de avenida 3D não aparecem para ela.

**Trecho é trecho, não duas pontas.** `E0 a E4` conta como cinco estacas —
o trecho foi executado inteiro, e a quantidade é dividida entre elas. Sem
isso, E1, E2 e E3 apareciam apagadas no mapa como se nada tivesse sido feito
ali. Estacas soltas continuam soltas: `E10, E12` são duas, não três — o que
manda é o separador (`a`, `até`, `-`).

### A rua vem antes do serviço

Numa obra em que o cadastro traz a coluna `Rua`, o lançamento começa pela
**rua**, e a lista de serviços passa a ser só a dela — sem o `— Nome da Rua`
no fim de cada nome. O sufixo continua no cadastro (as telas de avanço e de
medição precisam distinguir a mesma "base de brita" das duas ruas), mas no
formulário ele só fazia a lista aparecer em duplicata para o apontador poder
escolher a rua no fim do nome. Trocar de rua limpa o serviço e as estacas:
são de outra rua, e a numeração de uma não vale na outra.

### O nome curto na tela, a descrição do contrato embaixo

O nome do serviço na lista é **curto de propósito** — "Tubo de concreto armado
Ø60 (PA-2)" cabe na tela do celular e diz o que é. O que está no orçamento
("FORNECIMENTO E ASSENTAMENTO DE TUBOS DE CONCRETO ARMADO, DIÂMETRO 60CM -
TIPO PA-2") continua em `descricaoOrig`, e aparece inteiro logo abaixo do
serviço escolhido: é por ele que a fiscalização mede.

O que se corta do nome é condição comercial do orçamento ("com fornecimento
de agregado", "sem transporte", "exceto fornecimento") e dimensão que não
distingue nada. O que fica é o que identifica o serviço no canteiro:
material, bitola, fck, tipo.

### Camada: área × espessura

O contrato paga a camada em **m³**, mas quem executa mede **m²**: ninguém
sai do canteiro dizendo "fizemos 45 m³ de macadame". O serviço marcado com
`medirPor: 'area'` no cadastro pergunta **área executada** e **espessura**
(já preenchida com a de projeto, `espessura` em metros), e o app faz o m³ que
vai para a planilha. A conta vai na observação do lançamento —
`300,00 m² × 15,0 cm` — senão quem confere a medição recebe "45,00 m³" sem ter
como refazer o número. O saldo do pacote também aparece em área: *saldo:
255,10 M3 · 1.700,65 m² a 15,0 cm*.

Serviço em m³ que **não** é camada (escavação de vala, reenchimento, aterro)
continua com a quantidade digitada direto: ali o volume não é área vezes
espessura, e fingir que é só produziria número errado com aparência de conta.

### Lado da via

`lados: true` no cadastro põe no lançamento o campo **Lado da via** (LD / LE /
LD/LE, o vocabulário das memórias de cálculo), obrigatório onde aparece, e o
lado fica no fim do campo gravado: `"E4 a E7 (AGR) LD"`. Meia pista é meio
serviço — sem o lado, "guia da E4 à E7" tanto pode ser 60 m como 120 m, e a
conferência da medição não separa o que já foi medido do que falta no outro
lado. A obra pode declarar a própria lista em vez de `true`. Sem a chave, o
campo não existe — é o caso da Teotônio, cujo formulário segue o de sempre.

Quando o pacote sabe em que rua está (coluna `Rua` do cadastro, que é o caso
das Ruas de Terra), o eixo do lançamento **vem do pacote** e não é perguntado —
não há como registrar a produção de uma rua no estaqueamento da outra.

### Croqui: onde fica a estaca

O mapa em grade responde *quanto* foi feito na estaca 7. Quem lê o painel sem
ter estado no canteiro precisa antes saber *onde fica* a estaca 7 — e isso é a
**Planta de estaqueamento**, no topo do Avanço Físico: a planta do executivo
com uma bolha em cada estaca, cinza sem lançamento e laranja (mais escura,
mais RDOs) com produção. Clicar numa bolha lista o que foi lançado ali.

As posições **não são estimadas**: são as coordenadas dos rótulos de estaca que
o projetista escreveu no desenho, lidas do PDF vetorial por
`ferramentas/croqui-estacas.py`. O script recorta a planta, gera o `.webp` em
`projetos/<obra>/` e imprime o bloco `croquis` para colar no cadastro:

```bash
python ferramentas/croqui-estacas.py           # gera imagem + coordenadas
python ferramentas/croqui-estacas.py --check   # só confere a sequência
```

Ele **recusa** gerar se faltar o rótulo de alguma estaca da faixa — croqui com
estaca faltando é pior que croqui nenhum. A folha usada como base precisa ser
uma planta com os rótulos em texto: na Astrogildo a de pavimentação virou curva
no PDF, e a base é a de terraplenagem, que desenha a mesma via.

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
| `ferramentas/croqui-estacas.py` | Gera o croqui de estaqueamento (planta + posição de cada estaca) a partir da prancha em PDF |
| `docs/muros-planilha.csv` | As mesmas linhas prontas para colar nas abas `Pacotes` e `Coeficientes` |
| `js/ui/icones.js` | Conjunto de ícones do app — traço único na grade de 24, cor herdada do tema. Cobre navegação, ações e frentes de serviço (`icFrente()` escolhe pelo nome da frente) |
| `js/equip/equipamentos.js` | Tela de Equipamentos: apontamento de hora de máquina, correção de apontamento, painel e medição mensal |
| `js/bf/bota-fora.js` | Tela de Bota-Fora: a viagem de caminhão com as três provas, e a planilha no formato da aba FRETE |
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
