#!/usr/bin/env python3
"""
Croqui de estaqueamento: a planta da rua + a posição de cada estaca nela.

Por que existe
--------------
O mapa de estacas do app é uma grade — diz QUANTO foi feito na estaca 7, não
ONDE fica a estaca 7. Quem está no canteiro sabe; quem lê o painel, não. Este
script tira da própria prancha do executivo a planta da via e a posição de
cada estaca sobre o eixo, para o app desenhar o avanço no lugar certo.

As coordenadas não são estimadas: são as dos rótulos de estaca que o
projetista escreveu no desenho ("0", "1", … ao longo do eixo), que no PDF
vetorial vêm com posição exata. O script só confere que a sequência está
completa (0 a N, sem furo) antes de aceitar.

Uso
---
    python ferramentas/croqui-estacas.py            # gera tudo
    python ferramentas/croqui-estacas.py --check    # só confere, não escreve

Saída: `projetos/<obra>/estaqueamento-<eixo>.webp` e, no terminal, o bloco
`croquis` para colar em `dados/<obra>.js`.

Requer: PyMuPDF (fitz) e Pillow.
"""

import argparse
import io
import json
import os
import sys

import fitz
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Onde estão as pranchas originais. Ficam FORA do repositório (são o pacote do
# projeto, não um arquivo do app); só o recorte gerado aqui é versionado.
FONTE = os.environ.get(
    'PRANCHAS_RUAS_DE_TERRA',
    r'C:\Users\leori\Downloads\04 A CLASSIFICAR\Documentos\OneDrive_2026-07-21'
    r'\119 - RUAS DE TERRA_4\Projetos',
)

# Uma entrada por eixo estaqueado. `prancha` é a folha de onde sai o croqui:
# não precisa ser a de pavimentação — precisa ser uma PLANTA em que os rótulos
# de estaca estejam como texto. Na Astrogildo a de pavimentação virou curva no
# PDF, e quem tem os rótulos é a de terraplenagem; as duas desenham a mesma
# via, e é a via que interessa aqui.
CROQUIS = [
    {
        'obra': 'ruas-de-terra',
        'eixo': 'AGR',
        'rua': 'Agrimensor Sugaya',
        'prancha': r'RUA AGRIMENSOR\Pavimentação\CT-AS-101-1001-0F-DE.pdf',
        'cod': 'CT-AS-101-1001-0F-DE',
        'disciplina': 'Pavimentação',
        'fonte_rotulo': 7.9,     # corpo do número da estaca no desenho, em pt
        'estacas': (0, 12),
    },
    {
        'obra': 'ruas-de-terra',
        'eixo': 'AST',
        'rua': 'Astrogildo Pereira',
        'prancha': r'RUA ASTROGILDO PEREIRA\Terraplenagem\CT-AP-103-1001-0F-DE.pdf',
        'cod': 'CT-AP-103-1001-0F-DE',
        'disciplina': 'Terraplenagem',
        'fonte_rotulo': 7.9,
        'estacas': (0, 18),
        # O perfil longitudinal repete os mesmos números mais abaixo na folha,
        # num corpo maior. Este limite mantém só a planta.
        'y_max': 1000,
    },
]

LARGURA_ALVO = 1700   # px do lado maior do recorte — legível no celular e leve
MARGEM = 90           # pt de folga em volta das estacas: menos que isto corta pela
                      # metade as chamadas de área que o projetista pôs ao lado da via
QUALIDADE = 80


def rotulos_de_estaca(pagina, corpo, y_max):
    """As posições dos números de estaca escritos na planta."""
    achados = {}
    for bloco in pagina.get_text('dict')['blocks']:
        for linha in bloco.get('lines', []):
            for span in linha['spans']:
                texto = span['text'].strip()
                if not texto.isdigit():
                    continue
                if abs(span['size'] - corpo) > 0.3:
                    continue
                x0, y0, x1, y1 = span['bbox']
                if y0 > y_max:
                    continue
                # O mesmo número pode aparecer duas vezes (cota, chamada). Fica
                # o primeiro: os rótulos do eixo vêm na ordem do desenho.
                achados.setdefault(int(texto), ((x0 + x1) / 2, (y0 + y1) / 2))
    return achados


def gerar(cfg, escrever):
    caminho = os.path.join(FONTE, cfg['prancha'])
    if not os.path.exists(caminho):
        raise SystemExit(f"prancha não encontrada: {caminho}\n"
                         f"(aponte a variável PRANCHAS_RUAS_DE_TERRA para a pasta do projeto)")

    pagina = fitz.open(caminho)[0]
    achados = rotulos_de_estaca(pagina, cfg['fonte_rotulo'], cfg.get('y_max', 10 ** 6))

    ini, fim = cfg['estacas']
    faltando = [n for n in range(ini, fim + 1) if n not in achados]
    if faltando:
        raise SystemExit(f"{cfg['eixo']}: sem rótulo para as estacas {faltando} — "
                         f"confira `fonte_rotulo` e `y_max`")

    pontos = [(n, *achados[n]) for n in range(ini, fim + 1)]
    xs = [p[1] for p in pontos]
    ys = [p[2] for p in pontos]
    recorte = fitz.Rect(min(xs) - MARGEM, min(ys) - MARGEM,
                        max(xs) + MARGEM, max(ys) + MARGEM)

    dpi = round(72 * LARGURA_ALVO / max(recorte.width, recorte.height))
    pix = pagina.get_pixmap(dpi=dpi, clip=recorte)
    img = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')

    destino = os.path.join(RAIZ, 'projetos', cfg['obra'], f"estaqueamento-{cfg['eixo'].lower()}.webp")
    if escrever:
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        img.save(destino, 'WEBP', quality=QUALIDADE, method=6)

    # Posição de cada estaca em fração da imagem (0–1): assim o app não precisa
    # saber em que resolução o recorte foi gerado, e trocar a prancha por uma
    # revisão nova não mexe em nada além deste arquivo.
    estacas = [{'n': n,
                'x': round((x - recorte.x0) / recorte.width, 4),
                'y': round((y - recorte.y0) / recorte.height, 4)}
               for n, x, y in pontos]

    tamanho = os.path.getsize(destino) if escrever and os.path.exists(destino) else 0
    print(f"{cfg['eixo']} · {cfg['rua']}: {len(estacas)} estacas · "
          f"{img.width}x{img.height} px · {tamanho // 1024} KB · {os.path.relpath(destino, RAIZ)}")

    return {
        'eixo': cfg['eixo'],
        'arquivo': f"projetos/{cfg['obra']}/estaqueamento-{cfg['eixo'].lower()}.webp",
        'prancha': cfg['cod'],
        'disciplina': cfg['disciplina'],
        'largura': img.width,
        'altura': img.height,
        'estacas': estacas,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='confere sem escrever imagem')
    args = ap.parse_args()

    croquis = [gerar(c, not args.check) for c in CROQUIS]

    print('\n--- para colar em dados/<obra>.js ---\n')
    print('  "croquis": [')
    for i, c in enumerate(croquis):
        estacas = c.pop('estacas')
        cabeca = ', '.join(f'"{k}": {json.dumps(v, ensure_ascii=False)}' for k, v in c.items())
        print('    { ' + cabeca + ',')
        print('      "estacas": [')
        for j in range(0, len(estacas), 4):
            linha = ', '.join('{"n":%d,"x":%s,"y":%s}' % (e['n'], e['x'], e['y'])
                              for e in estacas[j:j + 4])
            print('        ' + linha + (',' if j + 4 < len(estacas) else ''))
        print('      ] }' + (',' if i + 1 < len(croquis) else ''))
    print('  ],')


if __name__ == '__main__':
    main()
