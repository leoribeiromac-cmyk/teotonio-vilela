# O vídeo do modelo 3D

O filme de apresentação da Av. Sen. Teotônio Vilela sai do **próprio visor do
app**: o cinema do visor (`js/modelo3d/cine.js`) desenha cada quadro como
função só do tempo, e estas ferramentas pedem os quadros um a um, montam e
põem a trilha.

```
ferramentas/video-modelo3d/fazer.sh [pasta de trabalho] [--previz]
```

`--previz` desenha 1 quadro a cada 3, em 960×400 e sem antisserrilhado — é
para conferir câmera e tempo antes do render de verdade (horas, no WebGL por
software). O render pula os quadros que já existem: para refazer um plano,
apague os quadros dele.

| Arquivo | O que faz |
|---|---|
| `roteiro.js` | Os 17 planos: caminho de câmera, hora do sol, névoa, camadas, transparência, varredura, textos |
| `eixo.js` | Posição de qualquer estaca da PD/PE (as mesmas contas do visor), para escrever o roteiro |
| `render.js` | Abre `modelo3d.html?cine=1` em qualidade Alta e grava cada quadro (JPEG) |
| `faixas.js` + `obra-demo.js` | As faixas do RDO do plano final, calculadas pelo **app de verdade** (`m3dDados`) sobre uma obra de demonstração |
| `comp.py` | A montagem: prancha da abertura, transições, cor, véu e textos animados, grão, letterbox 2,4:1, H.264 |
| `musica.py` | A trilha, sintetizada do zero (120 BPM: todo corte cai num tempo), mixada e masterizada: −14 LUFS integrados (BS.1770-4) e pico verdadeiro abaixo de −1,5 dBTP |

As travas:

- **O que é simulação, a tela diz.** A sequência construtiva (planos `volta` e
  `obra`) traz "Simulação da sequência construtiva · não é o avanço real da
  obra"; as faixas do RDO, "dados de demonstração"; o cartão final repete
  que carros, pessoas, céu e entorno são ilustrativos. Não tire.
- **Hora do sol que anda refaz a sombra ampla a cada quadro** (8192²): só
  onde é a intenção. Nos voos, hora fixa.
- **As datas cinzentas passam depressa no plano do RDO.** As primeiras etapas
  da escada (demolição, terraplenagem) são cinza e somem sobre o asfalto visto
  do alto: `KC` (roteiro.js) é a primeira data em que o trecho enquadrado ganha
  cor, e a conta é a mesma no `k_rdo` do comp.py — mudou uma, mude a outra.
- **O vazio além da borda do terreno vira névoa** na montagem (`mascara_vazio`):
  liso, oliva e ligado à borda de cima do quadro. É ligado só onde a câmera vê
  além do modelo (fim do plano `obra`); árvore, telhado e gramado não casam.
- **Exposição na montagem é com ombro** (`expor`): o escuro sobe, o branco não
  estoura. As pontas da `obra` (8h e 16h), o `dourado` e o `fim` usam.
- **Texto mono em JetBrains Mono** (a do app) não tem seta (→): use "a" ou "–".
- Requisitos: Node com o Playwright dos testes, Python 3 com numpy, scipy,
  Pillow e fontTools (+ brotli), ffmpeg.
