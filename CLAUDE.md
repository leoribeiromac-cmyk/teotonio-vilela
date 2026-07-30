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
- `manifest.json`, `favicon.svg`, `icon-*.png` — assets do PWA.
