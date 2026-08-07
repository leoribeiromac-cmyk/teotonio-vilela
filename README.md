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

Tela **Projetos**: as pranchas do projeto executivo, **renderizadas dentro do
app** pelo PDF.js vendorizado (o mesmo que lê a DANFE) — não pelo leitor de PDF
do aparelho. No celular do canteiro, abrir em app externo tira o apontador do
sistema e, sem sinal, muitas vezes nem abre. Aqui funciona offline depois da
primeira vez, com zoom de 40% a 400% e botão de ajustar à largura.

Os arquivos ficam em `projetos/<obra>/` e são listados em `projetos`, na
configuração da obra dentro do `index.html`:

```js
projetos: [
  { grupo: 'Urbanismo', disciplina: 'Planta — folha 101', escala: '1:250',
    ref: 'Rua José Nicolau de Lima',          // trecho ou referência da prancha
    cod: 'DE-VM-TV-01-5U-101 rev.H',          // número como está no carimbo
    codObra: '1000-SI060-015-UB3-101',        // código interno SPObras
    arquivo: 'projetos/teotonio/urbanismo-101.pdf' },
]
```

`grupo` agrupa a lista lateral (Urbanismo, Drenagem, Pavimentação…). Todos os
perfis enxergam a tela — inclusive Campo, que é quem mais precisa saber o que
construir.

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

## Prévia de Medição

Tela **Apoio Medição** → selecione o mês → **⬇ CSV p/ conferência**. O arquivo (separador `;`, decimal com vírgula) traz o consumo derivado por item contratual no período, pronto para confrontar com a coluna do mês da Planilha Geral do `.xlsm`.

O backend também expõe `?action=producaoPorPacote&mes=2026-06` (JSON, deduplicado na leitura) para automações externas.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | O app inteiro (telas, lógica, PDF/Excel de RDO) |
| `Code.gs` | Backend Apps Script (colar no editor da planilha) |
| `limpar_duplicados.gs` | Utilitário antigo de limpeza (o `Code.gs` já cobre via `limparDuplicados`) |
| `manifest.json` / `sw.js` / `icon-*.png` / `favicon.svg` | PWA — a marca é a avenida em perspectiva |
| `pacotes.csv` | Snapshot de referência da aba Pacotes |
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
| `vendor/pdfjs/` | PDF.js (Mozilla) | na leitura da DANFE e na tela de Projetos |
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
