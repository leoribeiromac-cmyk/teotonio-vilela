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
- `vendor/` — bibliotecas servidas pelo próprio site (Chart.js, jsPDF +
  AutoTable, xlsx-js-style, PDF.js). **Não voltar a usar CDN**: o app precisa
  abrir offline no canteiro. Ao trocar uma versão, subir também o `VERSAO`
  do `sw.js`.
- `manifest.json`, `favicon.svg`, `icon-*.png` — assets do PWA.
- `dados/` — cadastro que não vem da planilha publicada. `<obra>.js` é a obra
  inteira (`window.OBRAS_ARQ`); `teotonio-muros.js` é um **complemento** da
  Teotônio (`window.OBRAS_COMPLEMENTO`), acrescentado ao que a planilha
  devolve. Ver `aplicarComplemento()` no `index.html`.

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
