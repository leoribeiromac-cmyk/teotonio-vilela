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

Pronto: o login passa a ser validado no servidor e **toda escrita/exclusão exige token de sessão** (6 h, renovado a cada uso) — quem tiver só a URL do `/exec` não consegue mais injetar nem apagar dados. Sem essas propriedades, tudo funciona como antes (fallback de migração).

## Automações (fazer 1×)

No editor do Apps Script, selecione a função **`configurarGatilhos`** e clique ▶ Executar. Isso agenda:

- **`backupDiario`** (02h) — cópia completa da planilha na pasta "Backups Teotonio" do Drive, mantendo as 14 mais recentes.
- **`registrarClimaAuto`** (05h) — chuva de ontem via Open-Meteo gravada em `RDO_Diario` (colunas `Chuva_mm_Auto`/`Clima_Fonte`, criadas sozinhas). Contraprova objetiva do clima apontado — base para pleitos de prazo. Ajuste `OBRA_LAT`/`OBRA_LON` se necessário.

Utilitário: `criarRDOsVaziosDoMes()` preenche datas sem RDO de qualquer mês (edite `ANO_MES_ALVO` no topo da função antes de rodar).

## Configuração pela planilha (sem mexer em código)

- **Produtividade**: coluna opcional `Produtividade` na aba `Pacotes` — quando preenchida, sobrepõe o padrão hardcoded no planejamento e nas curvas.
- **Prazo da obra**: o término vem da linha-raiz (Nivel 0) da aba `Cronograma` (export do MS Project). Re-exporte o cronograma revisado para a aba e o baseline do painel acompanha.
- **Curva prevista por pacote**: preencha a coluna `Pacote_ID` da aba `Cronograma` (ex.: `P26`) nas tarefas correspondentes — o app usa min(Início)–max(Término) por pacote no lugar da distribuição linear.

## Prévia de Medição

Tela **Apoio Medição** → selecione o mês → **⬇ CSV p/ conferência**. O arquivo (separador `;`, decimal com vírgula) traz o consumo derivado por item contratual no período, pronto para confrontar com a coluna do mês da Planilha Geral do `.xlsm`.

O backend também expõe `?action=producaoPorPacote&mes=2026-06` (JSON, deduplicado na leitura) para automações externas.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | O app inteiro (telas, lógica, PDF/Excel de RDO) |
| `Code.gs` | Backend Apps Script (colar no editor da planilha) |
| `limpar_duplicados.gs` | Utilitário antigo de limpeza (o `Code.gs` já cobre via `limparDuplicados`) |
| `manifest.json` / `sw.js` / `icon-*.png` | PWA |
| `pacotes.csv` | Snapshot de referência da aba Pacotes |
| `icon_*.png` | Ícones das frentes usados pelo app |
