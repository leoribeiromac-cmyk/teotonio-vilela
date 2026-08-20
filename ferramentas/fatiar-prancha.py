#!/usr/bin/env python3
"""Fatia uma prancha em PDF na pirâmide de quadrados que o app lê.

Uso: python3 ferramentas/fatiar-prancha.py <entrada.pdf> <projetos/<obra>/<nome>/> [res]

`res` é o teto de pixels por ponto do PDF no nível mais fino (padrão 24, que é
~1728 dpi na A1). A Teotônio precisa dos 24: é uma A1 lotada, com cota de 2,9 pt,
e no celular (3 pixels de tela por pixel de CSS) os 12 de antes acabavam na
metade do caminho — dali para a frente o navegador só ampliava o borrão.
Prancha de rua curta, desenhada a 1:500, fica legível com 6 — e cada uma das
cinco Ruas de Terra fica em 1,2 a 2 MB, contra os 16 MB da Teotônio. Isso
importa porque o repositório é o próprio servidor do app.

Por que quadrados e não o PDF: a prancha tem ~50 mil entidades vetoriais.
Redesenhá-la a cada passo de zoom (PDF.js/SVG) trava o celular. Com a pirâmide,
mover e ampliar é só `transform` — a GPU compõe, nada é rasterizado de novo — e
cada nível só baixa os poucos quadrados que estão na tela. Dobrar a resolução
não dobra o que o celular baixa para ver um trecho: a tela cabe sempre os mesmos
~12 quadrados, e no nível mais fino cada um pesa MENOS (a mesma tinta espalhada
em quatro vezes mais pixels). O que cresce é só o total da pasta — que só quem
aperta "Offline" baixa inteiro.

Depende de `pymupdf` e `pillow`, e usa o `cwebp` (pacote `webp`) se ele estiver
instalado — ver `gravar()`.  Refatiar uma prancha que já está publicada exige
subir o `VERSAO_PRANCHAS` do `sw.js`: os nomes dos arquivos não mudam, e sem
isso o celular segue servindo os quadrados velhos do cache.

A entrada deve vir SEM as fotos coladas em volta e recortada no quadro do
desenho — foi assim que a prancha da Teotônio entrou (as 14 fotos de Street
View saíram por `page.delete_image()` e o `set_cropbox()` cortou o resto).
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pymupdf
from PIL import Image

TILE = 512          # lado do quadrado, em pixels
RES_MAX = 24.0      # pixels por ponto do PDF no nível mais fino (~1728 dpi no A1)
BRANCO = (255, 255, 255)

# `-near_lossless` do cwebp: quanto ele pode arredondar o pixel ANTES de
# comprimir. A escala é invertida — 100 não mexe em nada, 0 mexe o máximo — e a
# compressão em si é sempre SEM PERDAS, em qualquer valor. O que ele arredonda
# são os bits baixos de área chapada; borda de traço ele não toca.
#
# Vale o 0. Comparado lado a lado, em tamanho real, num quadrado de texto de
# 2,9 pt: o desenho é o mesmo, e são 26% menos bytes. O erro fica em 16 de 255
# no pior pixel — e só na rampa de antisserrilhado, nunca no traço. Para
# comparar, o q92 que este script usava errava 208 de 255 e comia a linha fina.
QUASE_SEM_PERDAS = 0
# `-z` é o esforço: 9 custa 25× o tempo de 6 para tirar outros 1,7% dos bytes,
# o que não paga numa prancha de 2,5 mil quadrados.
ESFORCO = 6
CWEBP = shutil.which("cwebp")


def niveis(largura_pt, altura_pt, res_max=RES_MAX):
    """Do nível 0 (a folha inteira num quadrado só) até `res_max`, dobrando."""
    n = 0
    while (largura_pt * res_max) / (2 ** n) > TILE or (altura_pt * res_max) / (2 ** n) > TILE:
        n += 1
    return [res_max / (2 ** k) for k in range(n, -1, -1)]


def bitset(flags):
    """Lista de booleanos -> base64 de um bitmap (bit mais significativo primeiro)."""
    b = bytearray((len(flags) + 7) // 8)
    for i, v in enumerate(flags):
        if v:
            b[i >> 3] |= 0x80 >> (i & 7)
    return base64.b64encode(bytes(b)).decode()


def gravar(img, caminho, tmp):
    """Grava o quadrado em WebP SEM PERDAS.

    Traço de CAD é a pior entrada possível para compressão com perdas. Este
    script gravava no menor entre o WebP sem perdas e o q92, e o q92 ganhava
    justamente nos 206 quadrados mais cheios — 7,5 dos 12,6 MB da pirâmide, e
    justamente os que alguém abre para LER. Ali ele errava até 208 de 255:
    comia a linha de eixo fina e sujava a borda de todo texto colorido (o 4:2:0
    borra bem o vermelho e o verde, que é do que a prancha é feita).

    O caminho bom é o "quase sem perdas" do cwebp (ver QUASE_SEM_PERDAS): sai
    menor que o q92 em TODOS os níveis e continua exato onde o desenho está. O
    cwebp não lê da entrada padrão (1.3.x), então o quadrado vai por um PPM cru
    em disco, que é só um cabeçalho e os bytes: escrever custa menos que o
    próprio PNG que ele leria.

    Sem o cwebp instalado, cai no WebP sem perdas do Pillow: fica bem maior (o
    arredondamento é justamente o que dá o ganho), mas exato — e ainda assim
    sem os artefatos da mistura de antes.
    """
    if CWEBP:
        ppm = os.path.join(tmp, "%d.ppm" % threading.get_ident())
        img.save(ppm)
        subprocess.run([CWEBP, "-quiet", "-near_lossless", str(QUASE_SEM_PERDAS),
                        "-z", str(ESFORCO), ppm, "-o", caminho],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    else:
        img.save(caminho, format="WEBP", lossless=True, quality=100, method=6)
    return os.path.getsize(caminho)


def main():
    src, dest = sys.argv[1], sys.argv[2]
    res_max = float(sys.argv[3]) if len(sys.argv) > 3 else RES_MAX
    doc = pymupdf.open(src)
    pg = doc[0]
    W_pt, H_pt = pg.rect.width, pg.rect.height

    resolucoes = niveis(W_pt, H_pt, res_max)
    os.makedirs(dest, exist_ok=True)
    # Nível velho que sobra na pasta é o jeito conhecido de a pirâmide sair
    # torta: o bitmap novo não marca aquele quadrado, o visor não o pede, e ele
    # fica no repositório pesando à toa (ou pior, um refatiamento mais grosso
    # deixa a pasta com dois desenhos misturados). Limpa antes de começar.
    for velho in os.listdir(dest):
        if velho.isdigit():
            shutil.rmtree(os.path.join(dest, velho))
    if not CWEBP:
        print("aviso: sem `cwebp` no PATH (pacote `webp`) — os quadrados saem "
              "~50% maiores. Instale e refatie para o tamanho de referência.")

    manifesto = {
        "versao": 1,
        "tile": TILE,
        "larguraPt": round(W_pt, 2),
        "alturaPt": round(H_pt, 2),
        "formato": "webp",
        "niveis": [],
    }
    total_bytes = total_tiles = 0
    t0 = time.time()
    tmp = tempfile.mkdtemp(prefix="fatiar-")
    # Rasterizar é serial (o MuPDF lê o content stream uma vez por faixa), mas
    # comprimir são 111 quadrados independentes por faixa e o cwebp é um
    # processo à parte — a espera dele não segura o GIL.
    piscina = ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 4)))

    try:
        for nivel, res in enumerate(resolucoes):
            Wpx = max(1, int(round(W_pt * res)))
            Hpx = max(1, int(round(H_pt * res)))
            cols = (Wpx + TILE - 1) // TILE
            rows = (Hpx + TILE - 1) // TILE
            pasta = os.path.join(dest, str(nivel))
            os.makedirs(pasta, exist_ok=True)
            presentes = []
            bytes_nivel = 0

            for r in range(rows):
                # Uma faixa de cada vez: uma leitura do content stream serve a
                # linha inteira de quadrados, em vez de uma por quadrado.
                y0 = r * TILE
                alt = min(TILE, Hpx - y0)
                clip = pymupdf.Rect(pg.rect.x0, pg.rect.y0 + y0 / res,
                                    pg.rect.x0 + Wpx / res, pg.rect.y0 + (y0 + alt) / res)
                pix = pg.get_pixmap(matrix=pymupdf.Matrix(res, res), clip=clip,
                                    alpha=False, colorspace=pymupdf.csRGB)
                faixa = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                del pix
                if faixa.size != (Wpx, alt):    # borda: o MuPDF arredonda para pixel inteiro
                    tela = Image.new("RGB", (Wpx, alt), BRANCO)
                    tela.paste(faixa, (0, 0))
                    faixa = tela

                tarefas = []
                for c in range(cols):
                    x0 = c * TILE
                    larg = min(TILE, Wpx - x0)
                    tile = faixa.crop((x0, 0, x0 + larg, alt))
                    # Papel em branco não vira arquivo: o visor pinta o fundo de branco
                    # e o manifesto diz quais quadrados existem de fato.
                    branco = all(lo == 255 and hi == 255 for lo, hi in tile.getextrema())
                    presentes.append(not branco)
                    if not branco:
                        tarefas.append((tile, os.path.join(pasta, f"{r}_{c}.webp")))
                del faixa
                bytes_nivel += sum(piscina.map(
                    lambda t: gravar(t[0], t[1], tmp), tarefas))
                if rows > 8 and (r + 1) % 5 == 0:
                    print(f"    faixa {r + 1}/{rows}  {bytes_nivel / 1024 / 1024:.1f} MB",
                          flush=True)

            manifesto["niveis"].append({
                # `bytes` é o que o botão "Offline" mostra antes de baixar tudo
                "res": res, "w": Wpx, "h": Hpx, "cols": cols, "rows": rows,
                "mapa": bitset(presentes), "bytes": bytes_nivel,
            })
            total_bytes += bytes_nivel
            total_tiles += sum(presentes)
            print(f"  nível {nivel}: {Wpx}x{Hpx} px  {cols}x{rows} quadrados  "
                  f"{sum(presentes)}/{len(presentes)} usados  {bytes_nivel/1024:.0f} KB",
                  flush=True)
    finally:
        piscina.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)

    manifesto["bytes"] = total_bytes

    with open(os.path.join(dest, "prancha.json"), "w") as f:
        json.dump(manifesto, f, separators=(",", ":"))

    print(f"TOTAL {total_tiles} quadrados  {total_bytes/1024/1024:.2f} MB  "
          f"em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
