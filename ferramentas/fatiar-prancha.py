#!/usr/bin/env python3
"""Fatia uma prancha em PDF na pirâmide de quadrados que o app lê.

Uso: python3 ferramentas/fatiar-prancha.py <entrada.pdf> <projetos/<obra>/<nome>/>

Por que quadrados e não o PDF: a prancha tem ~50 mil entidades vetoriais.
Redesenhá-la a cada passo de zoom (PDF.js/SVG) trava o celular. Com a pirâmide,
mover e ampliar é só `transform` — a GPU compõe, nada é rasterizado de novo — e
cada nível só baixa os poucos quadrados que estão na tela.

Depende de `pymupdf` e `pillow`.  Refatiar uma prancha que já está publicada
exige subir o `VERSAO_PRANCHAS` do `sw.js`: os nomes dos arquivos não mudam, e
sem isso o celular segue servindo os quadrados velhos do cache.

A entrada deve vir SEM as fotos coladas em volta e recortada no quadro do
desenho — foi assim que a prancha da Teotônio entrou (as 14 fotos de Street
View saíram por `page.delete_image()` e o `set_cropbox()` cortou o resto).
"""
import base64
import io
import json
import os
import sys
import time

import pymupdf
from PIL import Image

TILE = 512          # lado do quadrado, em pixels
RES_MAX = 12.0      # pixels por ponto do PDF no nível mais fino (~864 dpi no A1)
BRANCO = (255, 255, 255)


def niveis(largura_pt, altura_pt):
    """Do nível 0 (a folha inteira num quadrado só) até RES_MAX, dobrando."""
    n = 0
    while (largura_pt * RES_MAX) / (2 ** n) > TILE or (altura_pt * RES_MAX) / (2 ** n) > TILE:
        n += 1
    return [RES_MAX / (2 ** k) for k in range(n, -1, -1)]


def bitset(flags):
    """Lista de booleanos -> base64 de um bitmap (bit mais significativo primeiro)."""
    b = bytearray((len(flags) + 7) // 8)
    for i, v in enumerate(flags):
        if v:
            b[i >> 3] |= 0x80 >> (i & 7)
    return base64.b64encode(bytes(b)).decode()


def gravar(img, caminho):
    """Grava no menor entre WebP sem perdas e WebP q92. Traço de CAD costuma
    ficar menor (e perfeito) sem perdas; nos níveis reduzidos, que já saem
    suavizados, às vezes o contrário. Testa os dois e fica com o menor."""
    cand = []
    for kw in (dict(format="WEBP", lossless=True, quality=100, method=6),
               dict(format="WEBP", quality=92, method=6)):
        buf = io.BytesIO()
        img.save(buf, **kw)
        cand.append(buf.getvalue())
    dados = min(cand, key=len)
    with open(caminho, "wb") as f:
        f.write(dados)
    return len(dados)


def main():
    src, dest = sys.argv[1], sys.argv[2]
    doc = pymupdf.open(src)
    pg = doc[0]
    W_pt, H_pt = pg.rect.width, pg.rect.height

    resolucoes = niveis(W_pt, H_pt)
    os.makedirs(dest, exist_ok=True)

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
            if faixa.size != (Wpx, alt):        # borda: o MuPDF arredonda para pixel inteiro
                tela = Image.new("RGB", (Wpx, alt), BRANCO)
                tela.paste(faixa, (0, 0))
                faixa = tela

            for c in range(cols):
                x0 = c * TILE
                larg = min(TILE, Wpx - x0)
                tile = faixa.crop((x0, 0, x0 + larg, alt))
                # Papel em branco não vira arquivo: o visor pinta o fundo de branco
                # e o manifesto diz quais quadrados existem de fato.
                branco = all(lo == 255 and hi == 255 for lo, hi in tile.getextrema())
                if branco:
                    presentes.append(False)
                    continue
                n = gravar(tile, os.path.join(pasta, f"{r}_{c}.webp"))
                presentes.append(True)
                bytes_nivel += n
            del faixa

        manifesto["niveis"].append({
            "res": res, "w": Wpx, "h": Hpx, "cols": cols, "rows": rows,
            "mapa": bitset(presentes),
        })
        total_bytes += bytes_nivel
        total_tiles += sum(presentes)
        print(f"  nível {nivel}: {Wpx}x{Hpx} px  {cols}x{rows} quadrados  "
              f"{sum(presentes)}/{len(presentes)} usados  {bytes_nivel/1024:.0f} KB",
              flush=True)

    with open(os.path.join(dest, "prancha.json"), "w") as f:
        json.dump(manifesto, f, separators=(",", ":"))

    print(f"TOTAL {total_tiles} quadrados  {total_bytes/1024/1024:.2f} MB  "
          f"em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
