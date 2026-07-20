# Prompt — Revisão de Design: 3D avançado + KPIs ultramodernos

> Copie tudo abaixo da linha e cole em uma nova sessão do Claude (Code ou Designer).

---

Você é um **designer de produto sênior especializado em dashboards de engenharia** (nível Linear / Vercel / Stripe). Sua missão é fazer uma **revisão completa de design** do app **Sistema Teotônio Vilela** e depois **implementar** a modernização visual, elevando-o a um padrão premium com **profundidade 3D avançada** e **KPIs ultramodernos** — sem quebrar nenhuma funcionalidade.

## Contexto do produto

- App de gestão de obra pública (duplicação da Av. Senador Teotônio Vilela — Contrato 084/SPOBRAS/2024): planejamento, RDO e apoio à medição.
- **Produção:** https://leoribeiromac-cmyk.github.io/teotonio-vilela/
- **Arquitetura:** `index.html` **único** (vanilla JS, ~7.800 linhas) no GitHub Pages, instalável como **PWA offline** (`manifest.json` + `sw.js`). Backend Google Apps Script via JSONP.
- **Telas** (função `navigate()`): `executivo` (Painel Executivo), `avancofisico` (Avanço Físico / curvas), `cronograma`, `medicao` (Apoio Medição), `analista` (IA), `rdo`, `rdodiario`, `historico`.
- **Usuários:** engenheiros e apontadores **em campo, no celular, sob sol** — legibilidade e performance são inegociáveis.

## Fase 1 — Auditoria de design (entregar antes de codar)

Percorra todas as telas e produza um relatório curto com nota 0–10 por tela em: hierarquia visual, densidade de informação, consistência (cores/espaçamento/tipografia), microinterações, acessibilidade (contraste WCAG AA, alvos de toque ≥44px) e "efeito uau". Liste os 10 problemas de maior impacto, priorizados.

## Fase 2 — Implementação

### 2.1 Profundidade e 3D avançado (CSS puro — ver restrições)

- **Camadas de elevação** consistentes (tokens `--elevation-1..4`): sombras multicamada suaves + realce superior 1px (estilo "keyline light").
- **Cards com tilt 3D** no hover/gesto (`perspective` + `rotateX/rotateY` sutis, ≤6°), com brilho especular (`radial-gradient` seguindo o cursor) nos cards de KPI do Painel Executivo.
- **Glassmorphism criterioso** (blur + saturação) em barras fixas, sidebar e modais — nunca sobre texto denso.
- **Parallax sutil** no header do painel e transições de tela com profundidade (`translateZ`/scale + fade, 200–300ms, `cubic-bezier` expressivo).
- **Ícones das frentes** (`icon_*.webp`) apresentados em "moedas 3D": anel de gradiente cônico + sombra projetada.

### 2.2 KPIs ultramodernos (Painel Executivo e Avanço Físico)

- **Stat cards** com: valor em destaque (fonte tabular), **contador animado** ao entrar na tela, delta vs. período anterior (▲/▼ com cor semântica), **sparkline SVG inline** de tendência e micro-rótulo de contexto.
- **Anéis de progresso radiais** (SVG, gradiente + glow discreto) para avanço físico geral e por frente, com animação de preenchimento ao carregar.
- **Barras de progresso** com listras animadas sutis quando "em andamento" e marco do baseline visível.
- Curva S prevista × realizada com **gradiente de área**, tooltip flutuante com glass e linha "hoje" pulsante.
- Semáforo de status (prazo/medição/chuva) como **pills com ponto pulsante** em vez de texto cru.

### 2.3 Sistema visual

- **Design tokens** em `:root` (cores, raios, sombras, espaçamentos, tipografia) — refatore os estilos existentes para usá-los.
- **Dark mode elegante** como tema principal do painel (fundo quase-preto azulado, superfícies elevadas por luz, acentos vibrantes), mantendo modo claro legível ao sol para telas de campo (RDO).
- Tipografia: escala modular clara; números de KPI com `font-variant-numeric: tabular-nums`.
- Microinterações em todos os elementos interativos (hover/active/focus-visible) e `skeleton loading` shimmer no lugar de "Carregando…".

## Restrições técnicas (obrigatórias)

1. **Tudo dentro do `index.html`** — CSS/JS/SVG inline. **Proibido CDN ou dependência externa** (o PWA funciona offline; qualquer recurso remoto quebra isso).
2. 3D via **CSS transforms/SVG apenas** — nada de WebGL/Three.js (peso e bateria em campo).
3. Respeitar `prefers-reduced-motion` (desligar tilt, parallax e contadores).
4. **Zero regressão funcional**: não alterar lógica de dados, fila offline, JSONP, geração de PDF/Excel nem `Code.gs`. Só camada visual/apresentação.
5. Performance: animações só com `transform`/`opacity`; `backdrop-filter` com parcimônia; testar em viewport 360px.
6. Contraste mínimo WCAG AA em ambos os temas; alvos de toque ≥44px.

## Entregáveis

1. Relatório da auditoria (Fase 1) com notas e prioridades.
2. `index.html` atualizado, commit em branch própria com mensagens descritivas.
3. Screenshots antes/depois das telas Painel Executivo, Avanço Físico e RDO (desktop 1366px e mobile 390px).
4. Lista do que ficou de fora e por quê (débitos de design).

Comece pela Fase 1 e apresente o relatório antes de partir para o código.
