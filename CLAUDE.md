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
- `js/bf/bota-fora.js` — tela de Bota-Fora: a viagem de caminhão com foto da
  carga/placa, assinatura do motorista e foto do ticket, e a exportação no
  formato da aba FRETE do fechamento. Só fala com o `Code.gs`.

## O RDO do dia sai por e-mail sozinho

Quem MANDA o e-mail é o `Code.gs` (gatilho de tempo, 10h, com o RDO de ONTEM —
às 10h o dia de hoje mal começou). Quem DESENHA o PDF
oficial é o navegador (`_gerarPDFDiario`, jsPDF). O servidor não redesenha o
RDO — dois desenhos do mesmo documento divergem no primeiro ajuste de um lado
só, e este é um papel que a fiscalização assina.

Então são dois tempos: o app **deposita** (`depositarRDOPdf` → ação
`rdoPdfDoDia`, um PDF por obra e por data numa pasta privada do Drive) e o
gatilho **envia** o que foi depositado. Mexeu no gerador do PDF, confira que o
depósito continua saindo; mexeu no envio, lembre que o servidor só tem o que o
app deixou lá. `tests/rdo-email.ui.test.js` (o depósito, no app de verdade) e
`tests/rdo-email-servidor.test.js` (o envio, com Drive e Gmail falsos).

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
