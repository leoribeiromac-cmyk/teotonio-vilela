#!/bin/bash
# O VÍDEO DO MODELO 3D, do roteiro ao MP4.
#   ferramentas/video-modelo3d/fazer.sh [pasta de trabalho] [--previz]
# Etapas (cada uma pode ser refeita sozinha; o render pula os quadros que já existem):
#   1. faixas do RDO de demonstração, calculadas pelo app de verdade (faixas.js)
#   2. o roteiro em JSON, para a montagem saber o tempo de cada plano
#   3. o render quadro a quadro no visor (render.js — horas no WebGL por software)
#   4. a trilha (musica.py), composta em cima da montagem
#   5. a montagem: transições, cor, texto, grão, letterbox, H.264 + AAC (comp.py)
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
export VIDEO_TRABALHO="${1:-${TMPDIR:-/tmp}/video-modelo3d}"
mkdir -p "$VIDEO_TRABALHO"
if [ "$2" = "--previz" ]; then R="--q alta --w 960 --h 400 --msaa 0 --passo 3 --jpeg .85"; C="--previz"; Q="$VIDEO_TRABALHO/previz"
else R="--q alta --w 1920 --h 800 --msaa 4 --jpeg .95"; C=""; Q="$VIDEO_TRABALHO/quadros"; fi
node "$AQUI/faixas.js"
node -e "
const R = require('$AQUI/roteiro.js'); let t = 0;
const pl = R.roteiro.planos.map(p => { const o = { id: p.id, t0: t, dur: p.dur, texto: p.texto || null, secao: p.secao || null }; t += p.dur; return o; });
require('fs').writeFileSync('$VIDEO_TRABALHO/roteiro.json', JSON.stringify({ planos: pl, dur: t }, null, 1));"
node "$AQUI/render.js" "$AQUI/roteiro.js" "$Q" $R
python3 "$AQUI/comp.py" "$Q" "$VIDEO_TRABALHO/nada" --png --ate 0 $C      # só escreve filme.json (o tempo de cada plano no filme)
python3 "$AQUI/musica.py" "$VIDEO_TRABALHO/trilha.wav"
python3 "$AQUI/comp.py" "$Q" "$VIDEO_TRABALHO/video-sem-som.mp4" $C
ffmpeg -y -loglevel error -i "$VIDEO_TRABALHO/video-sem-som.mp4" -i "$VIDEO_TRABALHO/trilha.wav" -map 0:v -map 1:a -c:v copy \
  -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$VIDEO_TRABALHO/teotonio-vilela-modelo3d.mp4"
echo "pronto: $VIDEO_TRABALHO/teotonio-vilela-modelo3d.mp4"
