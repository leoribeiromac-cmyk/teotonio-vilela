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
**Usuários** no menu. Ali se cria, muda o perfil, troca a senha e exclui — sem
abrir o Apps Script e sem mexer no código. A senha é hasheada no servidor e
nunca volta para o app. Exige `EXIGIR_TOKEN = true`.

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

### Bibliotecas vendorizadas

Nada de CDN: CDN não existe no canteiro. Antes, no primeiro acesso sem sinal, o
gráfico não desenhava e o RDO não saía em PDF nem em Excel. Servidas do próprio
GitHub Pages, o service worker as guarda junto com o app.

| Pasta | Biblioteca | Para quê |
|---|---|---|
| `vendor/chartjs/` | Chart.js 4.4.0 | Curva S, sparklines e gráficos do painel |
| `vendor/jspdf/` | jsPDF 2.5.1 + AutoTable 3.5.31 | RDO e relatório executivo em PDF |
| `vendor/xlsx/` | xlsx-js-style 1.2.0 | Exportação de RDO em Excel, com estilos |
| `vendor/pdfjs/` | PDF.js (Mozilla) | Extrai o texto do PDF da DANFE |

Ao trocar de versão, suba também o `VERSAO` do `sw.js` — é isso que descarta o
cache antigo nos aparelhos.

### Aviso de nova versão

O app não troca mais de versão sozinho no meio do uso: quem estava com um RDO
na tela via a página recarregar e perdia o que tinha digitado. Agora o service
worker novo fica esperando, o app mostra **"Nova versão do sistema disponível ·
Atualizar"** no canto, e a troca só acontece quando o usuário mandar — ou na
próxima vez que ele abrir o app.
