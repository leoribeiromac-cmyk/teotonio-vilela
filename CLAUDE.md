# teotonio-vilela

## Publicação / Deploy

**O app é publicado pelo GitHub Pages, a partir da branch `main`.**
Não perguntar como o site é publicado — é sempre GitHub (Pages).
Para uma alteração ir ao ar: fazer o merge do PR na `main`. O GitHub Pages
republica automaticamente. O service worker (`sw.js`) usa "rede primeiro"
para a navegação, então a mudança chega sem precisar limpar cache.

## Estrutura

- `index.html` — app single-page (PWA). Todo o front-end (HTML/CSS/JS) fica aqui.
- `Code.gs` / `limpar_duplicados.gs` — backend Google Apps Script (API de dados).
- `sw.js` — service worker (cache: rede-primeiro na navegação).
- `js/ui/icones.js` — conjunto de ícones do app (SVG em traço, 24×24).
  Usar `ic('nome')`; nada de emoji na interface.
- `js/equip/equipamentos.js` — tela de Equipamentos (hora de máquina). Fala com
  DOIS backends: a Teotônio no Apps Script legado (campo `equipamentos` do
  cadastro dela), as demais no `Code.gs`. `backendEquip()` decide a cada
  chamada — mexer numa ação exige pensar nos dois dialetos.
- `assinar.html` — página de assinatura online do RDO, aberta pelo link do
  e-mail. Autônoma: não carrega o app, só fala com o `Code.gs`.
- `js/rdo/mapa-chuva.js` — o mapa de chuva circular do mês (tela Dias
  Improdutivos + PDF). Ver "O mapa de chuva sai do RDO".
- `js/bf/bota-fora.js` — tela de Bota-Fora: a viagem de caminhão com foto da
  carga/placa, assinatura do motorista e foto do ticket, e a exportação no
  formato da aba FRETE do fechamento. Só fala com o `Code.gs`.

## O RDO do dia sai por e-mail sozinho

Quem MANDA o e-mail é o `Code.gs` (gatilho de tempo, 8h, com o RDO de ONTEM —
às 8h o dia de hoje nem começou). Quem DESENHA o PDF
oficial é o navegador (`_gerarPDFDiario`, jsPDF). O servidor não redesenha o
RDO — dois desenhos do mesmo documento divergem no primeiro ajuste de um lado
só, e este é um papel que a fiscalização assina.

Então são dois tempos: o app **deposita** (`depositarRDOPdf` → ação
`rdoPdfDoDia`, um PDF por data numa pasta privada do Drive) e o gatilho
**envia** o que foi depositado. Só da **Teotônio** — as outras obras nem
depositam (`OBRAS_COM_RDO_POR_EMAIL`), e o servidor recusa se depositarem.

**O PDF oficial sai do que está GRAVADO** — da linha do dia
(`linhaDoDiaRDO`), nunca do formulário (`DIARIO_V4`) nem do rascunho. É o
documento que a fiscalização assina: desenhado da tela, levava o que não
tinha subido. O CSV publicado leva minutos para ver uma gravação, então o
`upsertRDODiario` devolve SEMPRE a linha como ficou (`linha`, com o
`numero_rdo` e a `revisao`), o app a guarda por cima do CSV
(`diarioLocalGuardar`) até ele alcançá-la — pela `revisao`, um carimbo novo a
cada gravação — e o depósito sai dela. Sem isso o primeiro depósito ia com
"RDO Nº —". `tests/rdo-gravado-e-assinado.ui.test.js`.

O gatilho olha para ONTEM, uma vez, e vai embora — o dia que ficou para trás
(domingo e feriado lançados depois, turno fechado tarde, RDO corrigido) não
tem segunda chance sozinho. Para ele existe o botão **Enviar para assinatura**,
na tela do RDO (`enviarRDOParaAssinatura` no index.html →
`rdoEnviarParaAssinatura` no `Code.gs`): repõe o depósito com o PDF de agora e
manda o MESMO e-mail do gatilho, forçado. É do escritório — admin e engenharia,
não o apontador.

O envio é UM E-MAIL POR PESSOA, e cada um é tentado por conta própria: um
endereço que estoura (caixa cheia, domínio fora do ar) não pode levar os
outros junto — o escritório é o primeiro da lista, e o sintoma disso era
"chegou para mim e para mais ninguém". Quem ficou de fora é nomeado no
aviso ao dono do script e volta em `falharam` para a tela contar.

"Para quem esse RDO foi, afinal?" se responde na própria tela do RDO, no
botão **Conferir o envio** (`conferirEnvioRDO` → ação `rdoDiagEmail`): quem
está na lista, se ela veio da Propriedade `RDO_EMAILS` ou do código, se o
PDF daquele dia está guardado, para quem ele saiu e quando, e quantos
e-mails a conta ainda pode mandar hoje. Só lê. O irmão de editor é
`conferirEnvioRDOEmail()`.

Mexeu no gerador do PDF, confira que o depósito continua saindo; mexeu no
envio, lembre que o servidor só tem o que o app deixou lá. `tests/rdo-email.ui.test.js` (o depósito, no app de verdade) e
`tests/rdo-email-servidor.test.js` (o envio, com Drive e Gmail falsos).

## A assinatura do RDO é online, e o link é a credencial

O engenheiro e o fiscal assinam pelo LINK PESSOAL que vai no mesmo e-mail das
8h — um e-mail por pessoa, porque num e-mail único o link do fiscal chegaria
também ao engenheiro. Não há login: quem assina não tem usuário no app.
`assinar.html` é a página de quem assina, **fora** do app de propósito (nada de
tela de login, nada de PWA de 1 MB, nenhum acesso ao resto da obra).

A `assinar.html` manda a `action` e o `t` TAMBÉM na querystring, e o corpo
do POST vai urlencoded (nunca mais `FormData`/multipart). Não é preferência:
o fiscal abre o link de dentro da rede da SP Obras, e um filtro corporativo
que mexa no corpo do POST deixa o Apps Script sem parâmetro nenhum — a página
abria em `Ação desconhecida: ""` e ele não conseguia assinar, sem nada parecer
errado de fora daquela rede.

O LINK É TAMBÉM A PORTA DE LEITURA, e não só a de assinar: o e-mail de
quem assina manda GUARDÁ-LO. `rdoAssinaturaAbrir` sempre serviu o PDF que
está DEPOSITADO, então o mesmo endereço entrega a via ASSINADA depois que o
app repõe o depósito — anexo de e-mail se perde e nunca é a via mais nova.
Por isso o link vai no corpo até para quem JÁ assinou. Ele continua sendo
credencial pessoal, e é por isso que `rdoEmailCorpo_` só ganha `minha`
dentro do laço de UM E-MAIL POR PESSOA: o e-mail do RDO ASSINADO vai num
`to` só, para a lista inteira, e link pessoal ali seria o link do fiscal na
caixa do engenheiro. A página avisa qual via está para download
(`pdfComFirmas`) — quem acaba de assinar baixaria, calado, o RDO de antes da
própria firma, porque o depósito só é reposto minutos depois.

O `rdoAssinaturasDoDia` devolve o `link` só para engenharia e admin (ou com
`EXIGIR_TOKEN` desligado): o quadro de andamento aparece para quem preenche
o dia, e o link do fiscal na mão do apontador era assinar por ele. E o
e-mail de "RDO ASSINADO" confere na PLANILHA que todas as firmas online
foram dadas — o `assinaturas` que o app manda no depósito diz quantas o
desenho trouxe, não quantas existem.

Os papéis são TRÊS palavras que têm de bater dos dois lados — `engenheiro`,
`fiscalizacao`, `supervisao`: `rdoPapeisAssinatura()` (index.html) e
`RDO_ASSINANTES` (Code.gs). Trocar uma delas de um lado só põe a firma do
fiscal no quadro da supervisão.

Mas só DOIS assinam online: o engenheiro e a fiscalização. A supervisão assina
A MÃO, e por isso não está no `RDO_ASSINANTES` — o quadro dela sai no PDF em
branco, com a linha para a caneta. Daí "todas as assinaturas" querer dizer as
ONLINE previstas, e não os quadros da folha: quem espera pela firma da caneta
espera para sempre.

### O engenheiro não assina um por um: a firma dele fica arquivada

O engenheiro responsável assina TODO RDO — é o relatório da própria
contratada, e a firma é a mesma todo dia. Então ela fica ARQUIVADA no
servidor (Propriedade `RDO_FIRMA_ARQUIVADA`, imagem na mesma pasta privada
das assinaturas) e o `rdoAssinaturasGarantir_` a aplica sozinho na linha do
papel dele, no nascimento do convite e também no dia que ficou para trás.
Quem arquiva é o escritório, pelo botão **Firma arquivada** da tela do RDO
(`abrirFirmaArquivada` no index.html → `rdoFirmaArquivar` no `Code.gs`).

Com isso a **fiscalização é a única que ainda assina por link** — que é o
ponto. As travas que não podem cair:

- `RDO_FIRMA_PAPEIS` só aceita `engenheiro`. A firma do fiscal é o aceite de
  quem RECEBE a obra: arquivá-la seria a contratada assinando pelo cliente,
  e o documento inteiro deixaria de valer.
- A origem fica escrita: coluna `origem` na aba das assinaturas (`arquivada`,
  `link` ou `manual`), a observação nomeia quem autorizou e quando, e a
  Auditoria registra cada aplicação. Documento pré-assinado que se apresenta
  como assinado no dia é o que ninguém defende depois.
- `rdoAssinaturaCancelar` marca a linha como `manual`, e linha `manual` nunca
  mais é pré-assinada sozinha — senão o cancelamento se desfazia na chamada
  seguinte.
- Tirar a firma vale para os PRÓXIMOS RDOs. Os que já saíram ficam como
  estão: reescrever documento que já foi para a fiscalização é outra
  decisão, e não se faz por um botão.

**Arquivar não exige foto, e é UMA VEZ SÓ.** Fotografar papel é justamente o
trabalho que o titular não quer ter, então a câmera é a última opção da tela,
não a primeira. Há três portas:

1. **Usar uma firma que ele já deu** — todo RDO que ele assinou pelo link
   deixou o traço na pasta privada (`rdoFirmasJaDadas_`). Um toque, e o
   arquivamento aponta para o MESMO arquivo, não para uma cópia. A trava:
   `rdoFirmaJaDadaPorPonteiro_` confere que o ponteiro é mesmo de uma
   assinatura daquele papel — solto, `dePonteiro` faria o RDO sair assinado
   com qualquer arquivo do Drive, a começar pela firma do fiscal.
2. **Armar para a próxima** (`RDO_FIRMA_ARMADA`) — obra em que ele nunca
   assinou online não tem o que reaproveitar. Armado, a próxima assinatura
   que ele der pelo link é guardada na hora (`rdoFirmaGuardarSeArmada_`,
   chamada DEPOIS da gravação): aquele RDO é o último que ele assina. O
   armado se desfaz sozinho ao pegar, e o dono é avisado por e-mail.
3. A foto, para quem não tem nem uma coisa nem outra.

A FOTO DA FIRMA É LIMPA NO APARELHO (`firmaLimparFoto`, no index.html): a
firma chega como foto de papel, e solta no quadro do PDF isso é um retângulo
cinzento por cima da linha. O branco é MEDIDO na própria foto — o mesmo papel
fotografado na sombra do canteiro e no escritório tem dois brancos, e um
limiar fixo apaga o traço num caso e deixa o fundo sujo no outro. E a imagem
**não entra no repositório**: o site é público pelo GitHub Pages, e firma de
engenheiro com CREA ali é a firma dele na mão de quem quiser.

E vale a mesma regra do RDO inteiro: quem DESENHA é o navegador. O servidor
guarda o traço, o nome e a hora; o app os põe dentro dos quadros ao gerar o PDF
oficial e REDEPOSITA — e é o depósito com todas as firmas que dispara o e-mail
do "RDO ASSINADO". Daí o `assinaturas: N` do `rdoPdfDoDia`: é como o servidor
sabe que o PDF guardado ficou para trás de quem assinou depois.

### Ninguém precisa lembrar de abrir a tela do dia

O fiscal assina à tarde, e a tela daquele dia está fechada em todo lugar —
o e-mail das 8h leva o RDO de ONTEM. O RDO assinado ficava esperando alguém
do escritório abrir aquele dia e gerar o oficial de novo.

Agora o app VARRE: `rdoAssinadosPendentes` (Code.gs) devolve os dias da
janela recente em que todas as firmas online entraram mas o PDF depositado
ainda traz menos do que isso, e `varrerRDOsAssinados` (index.html) redesenha
e redeposita cada um — o depósito é que manda o RDO assinado para a lista
inteira. Roda no fim de toda `carregarTudo()` bem-sucedida: boot e o refresh
de 5 em 5 minutos, de qualquer aparelho com sessão. O servidor continua sem
desenhar nada.

As travas: cada dia é tentado UMA vez por sessão (`_ASSIN_VARRIDOS`) — sem
isso, um desenho que saia com menos firmas do que a planilha tem faria o app
subir o mesmo PDF de 5 em 5 minutos do 4G do canteiro, para sempre; e a
varredura compara CONTAGEM de firmas, não quais são, então cancelar uma
assinatura e tomar outra no lugar NÃO repõe o depósito sozinho (reescrever um
documento que já foi para a fiscalização é outra decisão — a mesma regra do
"tirar a firma arquivada vale para os PRÓXIMOS RDOs").
`tests/rdo-assinatura-servidor.test.js` (o servidor) e
`tests/rdo-assinatura.ui.test.js` (a página de assinar e o PDF com as firmas).

### O RDO assinado só muda REABERTO

Firma de pessoa (pelo link — a arquivada do engenheiro não conta,
`rdoFirmasDePessoa_`) é o aceite daquele conteúdo. Gravar o dia por cima
punha a firma do fiscal num documento que ele não viu. Então o
`upsertRDODiario` recusa com `RDO_ASSINADO`, e mudar exige `reabrir: '1'`,
que só o escritório manda (`exigirPodeEnviarRDO`). Reabrir
(`rdoReabrirAssinaturas_`) cancela cada firma dada com LINK NOVO, deixa o
rastro na observação e na Auditoria e esquece o "RDO ASSINADO" do dia; o app
então redeposita e manda o convite de novo (`enviarRDOParaAssinatura(data,
true)`). No app: `editarTurnoV4` avisa antes, `rdoAssinadoAoSalvar` pergunta
ao escritório e barra o apontador (o que ele digitou fica no rascunho), e a
fila guarda o turno recusado e tenta de novo a cada 10 min, sem travar os
outros. `tests/rdo-turno-assinado-servidor.test.js` e
`tests/rdo-gravado-e-assinado.ui.test.js`.

## O RDO Diário é UMA linha por dia, com os dois turnos

A aba `RDO_Diario` guarda o dia inteiro numa linha (diurno e noturno juntos),
chave (obra, data). O dia duplicava sozinho porque o `upsertRDODiario`
procurava a linha com `idxColuna(cab, 'turno')` — a aba não tem coluna
`turno`, e o idxColuna aproximado caía em `apontador_noturno`: salvo o noturno,
o próximo salvamento do dia não achava a linha e criava outra. **Coluna de
chave se procura pelo nome EXATO** (`cab.indexOf`), nunca pelo aproximado.

As travas:

- Quem salva um dia que já está repetido UNE as linhas na mesma gravação
  (`rdoMesclarLinhas_`); o Histórico tem **Unificar** (`mesclarRDODiario`) e o
  editor tem `mesclarTodosRDODiarioRepetidos()`. Cada turno vem da última
  linha que o tem, id/número da primeira, textos somados; a linha retirada
  vai inteira para a Auditoria.
- Turno já gravado que chega EM BRANCO é de um aparelho que não o viu, não
  pedido para apagar (`rdoAplicarEnvio_`). E o app manda em branco, de
  propósito, o turno que não é dele: o `salvarDiarioV4` sobe o turno aberto
  e, do outro, só o que foi mexido NESTE aparelho e ainda não subiu
  (`_editados`, marcado pelo `saveDiarioV4`). Subir o que se VIU horas atrás
  desfazia a correção que outro aparelho fez no outro turno.
  `completarDiarioComPlanilha` continua trazendo o turno de lá para a tela.
- Visitas, ocorrências e observações têm coluna POR TURNO (`visitas_diurno`,
  `ocorrencias_noturno`, `obs_diurno`… — `RDO_TEXTOS_POR_TURNO`) e andam com
  o turno no `RDO_TURNO_PARTES`. A coluna juntada, que o PDF e o e-mail leem,
  é REFEITA delas a cada gravação (`rdoTextosRecalcular_`) — numa célula só,
  corrigir a ocorrência de um turno a somava à errada. Linha de antes tem o
  texto junto no turno que tinha (`rdoTextosSemear_`, e o mesmo no
  `carregarDiarioDaSheet`). O app velho em cache, que só manda o junto,
  deixa a linha "de texto junto" de novo. O `paralisado_motivo` também é
  refeito do `paralisacoes_json` dos dois turnos.
- Toda leitura do dia no app passa por `linhaDoDiaRDO(data)` — a mesma junção
  do servidor. Cartão do turno, lista dos 14 dias e PDF liam linhas
  diferentes, e a tela se desmentia. As partes de cada turno estão em
  `RDO_TURNO_PARTES`, dos dois lados: mudou uma, mude a outra.

`tests/rdo-diario-duplicado-servidor.test.js` (o servidor, com o cabeçalho
real, sem `turno`), `tests/rdo-turno-assinado-servidor.test.js` (turno em
branco e textos por turno) e `tests/rdo-dia-coerente.ui.test.js` (o app de
verdade).

### Dois apontadores no mesmo turno: as partes SOMAM

Nas Ruas de Terra são duas frentes (duas ruas), cada uma com o seu
apontador, no MESMO diurno. Com o dia numa linha só, o segundo a enviar
trocava o efetivo, os equipamentos e as ocorrências do primeiro pelos dele.

Nas obras de `OBRAS_RDO_VARIOS_APONTADORES` (index.html) o apontador não
edita o turno inteiro: manda a SUA PARTE (`contribuicao`, no mesmo
`updateRDODiario`), e o `Code.gs` guarda todas em `contribuicoes_json`
(`{diurno:{<chave>:parte}, noturno:{…}}`) e recalcula as colunas de sempre
como a SOMA (`rdoPartesAgregar_`): efetivo e equipamentos somados, listas
personalizadas somadas pelo rótulo, paralisações e textos juntados,
apontadores "A / B", e o clima de cada período é o PIOR das partes. Por
isso PDF, e-mail, Dias Improdutivos e mapa de chuva não mudaram nada.

As travas:

- A chave da parte é o nome do apontador sem acento e sem caixa
  (`rdoChaveParte_` / `rdoChaveParte`, dos dois lados). Reenviar TROCA a
  parte; `contribuicao_de` tira a velha quando o nome foi corrigido.
- O formulário abre com a PARTE (`abrirParteV4`), nunca com o dia somado —
  senão o próximo salvar somaria o dia sobre ele mesmo. `DIARIO_V4.parte`
  marca esse estado, e todo PDF que lê o `DIARIO_V4` como "o dia" o ignora
  quando ele é uma parte.
- Turno lançado ANTES das partes vira a parte de quem o assinou, `legado`
  (`rdoPartesLer_`), na primeira parte que chegar — não é apagado.
- Tirar a parte de outra pessoa: o dono, a engenharia ou o admin.
- O CSV publicado demora minutos: a resposta traz a linha somada (`linha`)
  e `diarioLocalAplicar` a mantém por cima do CSV até ele alcançá-la.

`tests/rdo-varios-apontadores-servidor.test.js` e
`tests/rdo-varios-apontadores.ui.test.js` (o app de verdade falando com o
`Code.gs` de verdade, via `tests/servidor-falso.js`).

## O mapa de chuva sai do RDO

O mapa de chuva é o gráfico circular do mês que acompanha a medição: uma
fatia por dia, três anéis (Manhã dentro, Tarde, Noite fora), cada casa em
seco/chuva × produtivo/improdutivo. QUEM ALIMENTA SÃO OS APONTADORES — o
clima marcado em cada período e as paralisações lançadas —, NÃO o INMET (a
chuva medida continua na Dias Improdutivos, como contraprova).

- Período sem o turno lançado fica em branco; a noite só existe com noturno.
- Improdutivo = alguma paralisação do turno toca o período (sem horário, o
  turno inteiro). Parada por chuva é chuva improdutivo mesmo com o período
  marcado seco.

A regra (`mapaChuvaClassificar`) está escrita DUAS vezes, igual letra por
letra: `js/rdo/mapa-chuva.js` (desenha o SVG na tela Dias Improdutivos e o
PDF) e `Code.gs` (aba `Mapa_Chuva`, gravada a cada RDO salvo e refeita
inteira pelo gatilho das 05h — `refazerMapaChuva`). `tests/mapa-chuva.test.js`
confere que os dois corpos são o mesmo texto. Mudou um, mude o outro.

## Formulário aberto é dado do apontador

Tela de formulário **não pode ser redesenhada nem esquecida** por baixo de
quem está preenchendo. São duas travas, e as duas são necessárias:

1. `TELAS_DE_FORMULARIO` (no `index.html`) tira essas telas do `render()`
   da carga de fundo. Tela nova que peça preenchimento entra nessa lista.
2. `rascunhoGravar/Ler/Apagar` + `rascunhoDe()` (também no `index.html`)
   gravam o que está na tela FORA da página — IndexedDB, com localStorage
   de reserva. É o que salva o caso que a trava 1 não alcança: o celular
   do canteiro descarta a aba enquanto a câmera está aberta, e o retorno
   é um carregamento novo, não um re-render. Quem preenche chama
   `rascunhoDe(chave, coletar)` no boot da tela, `.agendar()` a cada
   digitação, `.agora()` quando anexa foto ou assinatura (não dá para
   esperar o debounce) e `.apagar()` quando grava ou descarta.
   `tests/rascunho-formulario.ui.test.js` recarrega a página de verdade.

O gravador é da tela ABERTA: `navigate()` e `trocarObra()` gravam o que ela
tem e o soltam (`_rascAtivo = null`). Deixado ligado, o `pagehide` de mais
tarde chamava o coletor sem o formulário na tela — "não há nada digitado" —
e APAGAVA o rascunho. E `trocarObra()` zera também o `DIARIO_V4` e as
`MEDICOES_FECHADAS`: são da obra que sai.

O RDO Diário de QUALQUER data abre por `abrirDiaV4(iso)`: rascunho presente
(que não seja parte) manda sobre a planilha — é trabalho que não subiu. O
turno que sobe pela FILA limpa o rascunho só se ele não foi editado depois
de ir para a fila (`_salvoEm` × `rascunhoEm`) e deposita o PDF do dia.

## Sem sinal, o app abre com a última carga boa

Cada carga boa guarda o TEXTO dos CSVs no aparelho (`cargaGuardar`,
IndexedDB `teotonioDados`, por obra, no máximo a cada 10 min). Abrindo sem
sinal, `cargaFalhou()` usa essa cópia e a barra diz "dados guardados de
DD/MM HH:MM" (`STATE.dadosDoAparelho`) — antes, todas as telas davam a
tela de falha e não havia pacote para escolher no Lançar Serviço.

O refresh de fundo compara os textos com a carga anterior (`_textosCarga`)
e, se nada mudou, não reinterpreta nem redesenha. Voltar para a frente
(câmera) só recarrega se a última carga tem mais de 1 min. Lançamento
apagado fica em `_APAGADOS_LOCAL` até o CSV publicado também parar de
trazê-lo — antes ele "voltava" 4 s depois de apagado.
`tests/abrir-sem-sinal.ui.test.js`.

## Texto de fora nunca vai cru para a tela

Planilha, campo digitado e resposta de IA são texto de FORA. A sessão do
admin mora no `localStorage`: um `<img onerror>` nas ocorrências que rode
na tela dele apaga lançamento e arquiva firma. Três ferramentas:

- `escHtml(v)` para conteúdo e atributo entre aspas duplas (escapa também `'`);
- `jsArg(v)` para valor DENTRO de `onclick="fn(…)"` — sem aspas em volta:
  `onclick="ampliarFoto(${jsArg(id)})"`. O navegador desfaz as entidades
  antes de rodar o handler, então `'${escHtml(x)}'` NÃO protege (e
  "caixa d'água" quebrava o clique);
- `htmlSeguroIA(html)` para HTML que vem pronto (Analista IA): lista do que
  pode ficar, sem atributo nenhum.

`resumoRDO()` já devolve escapado (é só para tela). `tests/telas-seguras.ui.test.js`.

O Histórico acha o lançamento pelo ID guardado na linha (`histLinha(idx)`,
`data-id`), nunca pela posição: com a edição aberta o refresh troca o
`STATE.rdoavanco`, e a posição andava para o lançamento vizinho.

## Senha não vai na URL

O login e a troca de senha (`usuarioSalvar`) vão por POST
(`enviarPost(params, ms, true)`): corpo urlencoded e a `action` também na
querystring, como a `assinar.html`. O JSONP é GET, e a URL de um GET fica no
histórico, no log do Google e em proxy — a senha do admin ficava ali. O
harness lê o corpo do POST (urlencoded e multipart) e responde JSON quando
não há `callback`; mock de teste que só responde JSONP quebra o login.
`tests/login.ui.test.js`.

## A chuva do INMET é do dia de São Paulo

O dia do INMET é em UTC: 00h–23h UTC é 21h da véspera até 20h59 daqui.
`climaDaEstacao_` pede `d` e `d+1` (salvo quando `d+1` ainda não começou em
UTC) e o `somarChuva_` fica só com as horas cujo dia LOCAL é `d` — antes, a
chuva das 21h de ontem entrava na noite de hoje e a das 21h–meia-noite de
hoje sumia. `tests/clima-estacao.test.js` (INMET falso com `DT_MEDICAO`).

## Previsão do tempo da obra

A Central de Campo (Painel) mostra os próximos 5 dias na coordenada do
canteiro (`COORD_OBRAS` no index.html — as mesmas de `CLIMA_OBRAS` no
Code.gs; obra nova declara nos dois). Vem do Open-Meteo (aberto, sem
chave), fica guardada 1 h por obra e, sem sinal, a guardada aparece
dizendo de quando é. Dia com ≥ 5 mm é risco; ≥ 20 mm, chuva forte. É apoio
ao planejamento, NÃO registro: nada disso vai para o RDO. `api.open-meteo.com`
está em `SO_REDE` no `sw.js`. `tests/previsao-tempo.ui.test.js`.

## Repetir a equipe do último dia

No formulário do turno, **Repetir efetivo e equipamentos do último dia**
(`copiarEquipeDoUltimoDia`) traz as QUANTIDADES do último turno igual
lançado — nunca apontador, paralisação ou texto, que são do dia. Na obra de
várias partes vem a parte da MESMA pessoa (`turnoAnteriorParaCopiar` com a
chave dela), não a soma do dia. `tests/repetir-equipe.ui.test.js`.

## Feriados não acabam

`feriadosDoAno(ano)` (index.html) e `feriadosDoAnoObra_` (Code.gs) fazem a
conta: fixos nacionais + 25/01 e 09/07 de São Paulo, e os móveis
(Carnaval, Sexta-feira Santa, Corpus Christi) pela Páscoa. Conferido igual à
tabela manual de 2025–2028 que existia. Feriado municipal de outra cidade
entra em `FERIADOS_FIXOS`.

## A foto é daquele serviço, daquela obra

A foto escolhida no formulário NÃO mora no rascunho: fica em
`_fotosPorServico` (`index.html`), um mapa em memória cuja chave é a
**posição** do serviço na tela — `'0'`, `'1'`, `'o0'`. A posição se repete em
toda obra e muda quando um serviço sai do meio da lista, então o mapa tem de
ser mexido junto: `limparFotosDoFormulario()` ao trocar de obra, ao gravar e
ao limpar o RDO; `reindexarFotosDoFormulario()` quando um serviço é removido.
Sem isso a foto do Ranário reaparecia no serviço de mesma posição das Ruas de
Terra e subia ligada a ELE.
Do outro lado, o servidor anexa o ponteiro da foto pelo **id do serviço** — e
o id é um carimbo de segundo, igual em todas as obras, que dividem a mesma
planilha. Por isso o app manda `obra` junto no `rdoFoto` e o `Code.gs` só
aceita a linha daquela obra (`linhaDoServicoParaFoto`).
`tests/foto-fica-na-obra.ui.test.js` (o app de verdade) e
`tests/multiobra.test.js` (o servidor, com planilha falsa).

## A foto tem duas versões: a que prova e a que se usa

O carimbo é queimado NA IMAGEM (`desenharCarimbo`) — é o que o faz sobreviver
a download, e-mail, impressão e PDF, e por isso a foto vale como prova. O
preço é que ele apaga o pixel: a versão limpa, a que vai para relatório,
ofício e apresentação, deixava de existir no instante da escolha, ainda
dentro do aparelho.

Agora sobem as DUAS (chave "Guardar também a foto original", na tela do
carimbo), e o ponteiro da planilha carrega as duas:
`drive_id:<carimbada>|<limpa>`. O `|` foi escolhido porque o `[\w-]+` do
`fotoFileId` PARA nele — o aparelho com o app velho lê o ponteiro novo e
enxerga a carimbada, como sempre. São dois lados que têm de bater:
`fotoLimpaId` (index.html) e o `ponteiro` do `rdoFoto` (`Code.gs`).

Para o acervo que subiu ANTES disso não há original em lugar nenhum. Ali a
Galeria RECORTA a tarja (`acharTarjaDoCarimbo`): o filete de acento é a única
linha da foto que atravessa a imagem inteira com uma cor só. A foto sai limpa
e mais baixa, e a mensagem diz quanto se perdeu. A trava que não pode cair:
horizonte liso NÃO é tarja — recortar foto sem carimbo seria comer pedaço de
prova. `tests/foto-sem-carimbo.ui.test.js` (o app de verdade) e
`tests/foto-limpa-servidor.test.js` (o servidor, com Drive falso).

- `vendor/` — bibliotecas servidas pelo próprio site (Chart.js, jsPDF +
  AutoTable, xlsx-js-style, PDF.js). **Não voltar a usar CDN**: o app precisa
  abrir offline no canteiro. Ao trocar uma versão, subir também o `VERSAO`
  do `sw.js`.
- `manifest.json`, `favicon.svg`, `icon-*.png` — assets do PWA.
- `dados/` — cadastro que não vem da planilha publicada. `<obra>.js` é a obra
  inteira (`window.OBRAS_ARQ`); `teotonio-muros.js` é um **complemento** da
  Teotônio (`window.OBRAS_COMPLEMENTO`), acrescentado ao que a planilha
  devolve. Ver `aplicarComplemento()` no `index.html`.
- `projetos/<obra>/` — as pranchas do executivo. Toda prancha é uma
  **pirâmide de quadrados** (`<prancha>/<nível>/<linha>_<coluna>.webp` +
  `prancha.json`), não um PDF: A1 redesenhada a cada passo de zoom trava o
  celular. Gerada por `ferramentas/fatiar-prancha.py <pdf> <pasta> [res]`;
  `res` é o teto de pixels por ponto (24 na Teotônio, que é uma A1 lotada;
  6 nas Ruas de Terra, plantas de rua curta). Refatiar exige subir o
  `VERSAO_PRANCHAS` do `sw.js` — os nomes dos arquivos não mudam, então é a
  versão do balde que descarta os quadrados velhos. O `.pdf` ao lado é o
  mesmo desenho, só para os botões Abrir/Baixar.
  `tests/pranchas-manifesto.test.js` confere bitmap × arquivos no disco.

## Números de cadastro escritos em arquivo

`num()` trata o ponto como separador de MILHAR — é o formato pt-BR que chega
dos CSVs. Então **número JS nunca vai cru para o STATE**: `String(22.26)` é
lido como 2226. Todo valor que nasce número (`Qtd Estimada`, `Produtividade`,
`Coef`) passa por `ptNum()` antes. `tests/muros-contencao.test.js` cobre o
ida-e-volta.

## A nota fiscal é lida em quatro tentativas, nessa ordem

Código de barras → chave de acesso → IA (`nfLerIA`, no `Code.gs`, com o
Gemini) → digitação. Nada bloqueia: o que não foi lido, se digita.

O que segura o tempo dessa tela, e as travas que não podem cair:

- **A foto é decodificada UMA vez** (`nfPrepararFoto`). Miniatura, cópia
  guardada, cópia da IA e a segunda fonte do leitor de código saem todas do
  mesmo canvas de 1600 px. Era aí que o celular simples do canteiro estourava
  a memória e devolvia tela em branco "às vezes".
- **Sobem DUAS qualidades da mesma imagem**: a guardada (0.88) é prova e não
  encolhe; a que vai para a IA (`NF_IA_Q`) é mais leve e é descartada quando a
  resposta chega. A subida é o passo mais lento no 3G do canteiro.
- **Preparar folha não segura a leitura.** PDF com texto embutido dispensa a
  imagem: a IA lê o texto (`nfAbrirPDF`) enquanto as folhas viram imagem em
  segundo plano (`nfPDFImagens`). Quem mexer aí tem de esperar `prontoPaginas`
  antes de gravar ou de trocar a imagem pela oficial da SEFAZ — senão a folha
  chega depois e sobrescreve, ou a nota é gravada sem prova.
- **O POST tem prazo** (`POST_TEMPO`, no index.html). Sem ele um pedido
  pendurado ficava para sempre e a tela dizia "Lendo os dados…" até a pessoa
  desistir. Estourado o prazo vira erro de rede, então o lançamento vai para a
  fila em vez de se perder.
- **Sobrecarga do Google (503) não é nota ilegível**: o `Code.gs` repete uma
  vez e depois troca para o modelo reserva, como já fazia com a cota estourada.
  Nota comprida que estoura o teto de saída é relida só no cabeçalho
  (`semItens`), em vez de se perder inteira.

`tests/nf-leitura-ia.ui.test.js` (o aparelho, no app de verdade) e
`tests/nf-leitura-ia-servidor.test.js` (o servidor, com o Gemini falso).

## Sem app irmão

O `gestor-obras` ("Gestor — Controle de Obras") não é mais usado.
`js/nf/notas.js` e `js/ui/icones.js` nasceram cópias dele e agora são só
deste app — corrige-se aqui, sem copiar para lugar nenhum. O
`js/nf/adaptador.js` continua sendo a ponte de vocabulário do módulo de
notas com o resto do app.

Nota e saída de estoque regravadas pelo mesmo id (`nfSalvar`/`saidaSalvar`)
passam por `regravarNaObra_`: linha de OUTRA obra é recusada (`OUTRA_OBRA`,
erro terminal na fila) e o dono (`usuario`) e o `criadoem` ficam os da linha
— quem edita a nota de outro não vira dono dela (e não ganha o direito de
apagá-la). `tests/multiobra.test.js`.
