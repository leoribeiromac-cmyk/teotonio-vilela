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
depositam (`OBRAS_COM_RDO_POR_EMAIL`), e o servidor recusa se depositarem. Mexeu no gerador do PDF, confira que o
depósito continua saindo; mexeu no envio, lembre que o servidor só tem o que o
app deixou lá. `tests/rdo-email.ui.test.js` (o depósito, no app de verdade) e
`tests/rdo-email-servidor.test.js` (o envio, com Drive e Gmail falsos).

## A assinatura do RDO é online, e o link é a credencial

O engenheiro e o fiscal assinam pelo LINK PESSOAL que vai no mesmo e-mail das
8h — um e-mail por pessoa, porque num e-mail único o link do fiscal chegaria
também ao engenheiro. Não há login: quem assina não tem usuário no app.
`assinar.html` é a página de quem assina, **fora** do app de propósito (nada de
tela de login, nada de PWA de 1 MB, nenhum acesso ao resto da obra).

Os papéis são TRÊS palavras que têm de bater dos dois lados — `engenheiro`,
`fiscalizacao`, `supervisao`: `rdoPapeisAssinatura()` (index.html) e
`RDO_ASSINANTES` (Code.gs). Trocar uma delas de um lado só põe a firma do
fiscal no quadro da supervisão.

E vale a mesma regra do RDO inteiro: quem DESENHA é o navegador. O servidor
guarda o traço, o nome e a hora; o app os põe dentro dos quadros ao gerar o PDF
oficial e REDEPOSITA — e é o depósito com todas as firmas que dispara o e-mail
do "RDO ASSINADO". Daí o `assinaturas: N` do `rdoPdfDoDia`: é como o servidor
sabe que o PDF guardado ficou para trás de quem assinou depois.
`tests/rdo-assinatura-servidor.test.js` (o servidor) e
`tests/rdo-assinatura.ui.test.js` (a página de assinar e o PDF com as firmas).

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

## App irmão

`leoribeiromac-cmyk/gestor-obras` ("Gestor — Controle de Obras") é o sistema
multi-obra da mesma empresa e compartilha código com este:
`js/nf/notas.js` e `js/ui/icones.js` são cópias, com `js/nf/adaptador.js`
fazendo a ponte de vocabulário. Corrigiu de um lado, copie para o outro —
e cuidado com os nomes das variáveis de CSS, que diferem (lá `--accent`,
aqui `--acc`).
