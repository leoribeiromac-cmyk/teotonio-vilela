#!/usr/bin/env bash
# IMPLANTAR O BACKEND NO APPS SCRIPT, DA SUA MÁQUINA
#
# Mesma coisa que o fluxo .github/workflows/implantar-appscript.yml faz
# sozinho, para quem prefere NÃO guardar a credencial do Google no GitHub.
# A credencial fica só no seu computador, no ~/.clasprc.json.
#
#   ./ferramentas/implantar-appscript.sh                 implanta
#   ./ferramentas/implantar-appscript.sh "corrige X"     com descrição própria
#   ./ferramentas/implantar-appscript.sh --so-conferir   confere e não publica
#
# Antes da primeira vez, ver o README: "Implantar o backend sozinho".
set -euo pipefail

cd "$(dirname "$0")/.."
AZUL='\033[0;34m'; VERDE='\033[0;32m'; VERM='\033[0;31m'; ZERO='\033[0m'
erro() { printf "${VERM}✗ %s${ZERO}\n" "$1" >&2; exit 1; }
passo() { printf "${AZUL}▸ %s${ZERO}\n" "$1"; }
feito() { printf "${VERDE}✓ %s${ZERO}\n" "$1"; }

SO_CONFERIR=0
DESCRICAO=""
for arg in "$@"; do
  case "$arg" in
    --so-conferir) SO_CONFERIR=1 ;;
    *) DESCRICAO="$arg" ;;
  esac
done

command -v clasp >/dev/null 2>&1 || erro "clasp não instalado. Rode: npm install -g @google/clasp@3.3.0"
[ -f "$HOME/.clasprc.json" ] || erro "Você ainda não entrou na conta Google. Rode: clasp login"
[ -f .clasp.json ] || erro "Falta o .clasp.json (o id do projeto). Ver o README: \"Implantar o backend sozinho\"."
[ -f appsscript.json ] || erro "Falta o appsscript.json. Rode 'clasp pull' uma vez e comite o arquivo — ele guarda fuso, escopos e a configuração do app da web."

ID_IMPL="${APPSCRIPT_DEPLOYMENT_ID:-}"
if [ -z "$ID_IMPL" ] && [ -f .appscript-deployment-id ]; then
  ID_IMPL="$(tr -d ' \n\r' < .appscript-deployment-id)"
fi
# Sem o id, `clasp deploy` criaria uma implantação NOVA — com uma URL /exec
# nova, que o app não conhece. Parar aqui é melhor que publicar no vazio.
[ -n "$ID_IMPL" ] || erro "Falta o id da implantação. Rode 'clasp deployments', copie o id do app da web e salve em .appscript-deployment-id (ou exporte APPSCRIPT_DEPLOYMENT_ID)."

passo "Conferindo se a implantação apagaria algum arquivo…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp .clasp.json "$TMP/.clasp.json"
( cd "$TMP" && clasp pull >/dev/null )
# Compara pelo NOME SEM EXTENSÃO: no Apps Script o arquivo não tem extensão,
# quem põe é o clasp ao baixar (.js ou .gs, conforme a configuração).
# Comparar "Code.gs" com "Code.js" daria falso alarme e travaria tudo.
SOBRANDO=""
for f in "$TMP"/*.gs "$TMP"/*.js "$TMP"/*.html; do
  [ -e "$f" ] || continue
  nome="$(basename "$f")"
  raiz="${nome%.*}"
  achou=0
  for ext in gs js html; do
    [ -e "$raiz.$ext" ] && achou=1
  done
  [ "$achou" = "1" ] || SOBRANDO="$SOBRANDO $nome"
done
[ -z "$SOBRANDO" ] || erro "Estes arquivos existem no Apps Script e não no repositório:$SOBRANDO
   'clasp push -f' apagaria os três. Traga-os com 'clasp pull' e comite antes de implantar."
feito "Nada seria apagado."

passo "Conferindo a sintaxe do Code.gs…"
for arq in Code.gs limpar_duplicados.gs; do
  [ -f "$arq" ] || continue
  cp "$arq" "$TMP/conferir.js"
  node --check "$TMP/conferir.js" >/dev/null 2>&1 || erro "$arq tem erro de sintaxe — não vou subir isso para o backend da obra."
done
feito "Sintaxe boa."

if [ "$SO_CONFERIR" = "1" ]; then
  feito "Só conferindo — nada foi publicado."
  exit 0
fi

[ -n "$DESCRICAO" ] || DESCRICAO="$(git log -1 --pretty=%s 2>/dev/null || echo 'atualização manual')"

passo "Empurrando o código…"
clasp push -f
feito "Código no projeto."

passo "Publicando a versão (mesma URL de sempre)…"
# `redeploy` e não `deploy`: no redeploy o id é argumento obrigatório, então
# sem ele o comando PARA. O `deploy` sem id cria uma implantação nova, com URL
# /exec nova, e devolve sucesso.
clasp redeploy "$ID_IMPL" -d "$DESCRICAO"
feito "No ar: $DESCRICAO"
