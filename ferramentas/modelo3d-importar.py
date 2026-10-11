#!/usr/bin/env python3
"""Traz o modelo 3D da obra (a página publicada pelo pipeline) para dentro do app.

Uso: python3 ferramentas/modelo3d-importar.py <pasta-publicada> <modelo3d/<obra>/>

A <pasta-publicada> é o que o `mkpub.py` do pipeline do modelo gera (ou o que o
Artifact devolve num `read` com `paths`): `index.html` com o índice embutido em
`<script id="modeldata">`, `tiles/tNN.json`, `tex/*.jpg`, `entorno.json`,
`edif.json` e `renders/*.jpg`. O resultado é a pasta que o visor do app lê
(`modelo3d.html` + `js/modelo3d/visor.js`):

  index.json         o índice, com os trechos apontando para os .bin
  tiles/tNN.bin      os trechos, compactados (ver "FORMATO" abaixo)
  entorno.bin        o entorno ilustrativo do modo Alta, idem
  edif.json          edificações existentes (OSM/PMSP), igual
  tex/*.webp|jpg     as texturas fotográficas do modo Alta (o menor dos dois)
  renders/*.webp     as imagens fotorrealistas e as miniaturas

POR QUE CONVERTER, e não copiar: os trechos eram 15 MB de JSON com os números em
base64 (6,7 MB mesmo com o gzip do GitHub Pages) — e são o que o celular baixa
no 4G do canteiro para abrir a avenida. Compactados aqui ficam em ~2,4 MB, sem
perder o que importa (ver a tolerância abaixo), e o navegador ainda deixa de
decodificar base64 caractere a caractere.

FORMATO (.bin, "M3DP" versão 1), tudo dentro de um gzip:
  'M3DP' | versão u32 | tamanho do cabeçalho u32 | cabeçalho JSON | (alinha 8) | dados
O cabeçalho é o objeto original com cada vetor trocado por {"@": k}, e
`arrays[k]` diz onde ele está nos dados e como foi gravado:
  e='q'  número real em milímetro inteiro, diferença para o vértice anterior
         (por componente: x,y,z ou u,v), zigue-zague, bytes embaralhados por
         plano. É o que faz o gzip render: a malha é contínua, e a diferença
         entre vértices vizinhos é um número pequeno.
  e='d'  índice inteiro, diferença para o anterior, zigue-zague, embaralhado.
  e='r'  bytes como estão (as marcas de "terreno extrapolado").
  e='f'  float32 como está, só embaralhado — para número fora da escala de
         obra, que não cabe em milímetro de 32 bits.
`w` é a largura de cada valor gravado (1, 2 ou 4 bytes) e `c` o número de
componentes. O decodificador é `desempacotar()` em js/modelo3d/visor.js —
mudou um lado, mude o outro.

TOLERÂNCIA: as coordenadas vão a 0,5 mm do original. O modelo é conferido
contra levantamento e projeto em centímetro; o readout mostra a cota com 3
casas, e a terceira continua certa no arredondamento. Este script CONFERE cada
vetor depois de gravar e para se algum passar disso.

Reimportar um modelo já publicado exige subir o `VERSAO_MODELO3D` do `sw.js`:
os nomes dos arquivos não mudam, e sem isso o celular segue com o modelo velho
guardado. `tests/modelo3d-manifesto.test.js` confere índice × arquivos.

Depende só de `numpy` e `pillow` (com suporte a WebP).
"""
import base64
import gzip
import io
import json
import os
import re
import shutil
import struct
import sys

import numpy as np
from PIL import Image

MAGIC = b'M3DP'
VERSAO_FORMATO = 1
ESCALA = 1000            # milímetro
TOL = 0.0005 + 1e-4      # meio milímetro + folga do float32 em coordenada de ~600 m
# Componentes por vértice de cada vetor real, pelo nome da chave. O que não
# está aqui é escalar (1). `arv`/`arb` são árvores e arbustos do entorno:
# x, y, z, altura, variante e giro.
COMPONENTES = {'p': 3, 'uv': 2, 'arv': 6, 'arb': 6}

# WebP: o mapa de normal leva qualidade mais alta — artefato de compressão nele
# vira relevo falso na luz rasante, e é a luz da manhã que o modo Alta usa.
Q_COR, Q_NORMAL, Q_RENDER = 84, 88, 84


def _b64_para_np(o):
    b = base64.b64decode(o['b64'])
    return np.frombuffer(b, dtype={'F': np.float32, 'U': np.uint32, 'B': np.uint8}[o['t']]).copy()


def _zz(d):
    """inteiro com sinal -> sem sinal, pequeno em módulo -> pequeno."""
    return ((d << 1) ^ (d >> 63)).astype(np.uint64)


def _embaralhar(u, w):
    """grava os bytes por plano: todos os bytes baixos, depois os seguintes…"""
    tipo = {1: np.uint8, 2: np.uint16, 4: np.uint32}[w]
    b = u.astype('<' + np.dtype(tipo).str[1:]).view(np.uint8)
    return b.reshape(-1, w).T.copy().tobytes() if w > 1 else b.tobytes()


def _largura(z):
    m = int(z.max()) if z.size else 0
    if m < 256:
        return 1
    if m < 65536:
        return 2
    if m < 2 ** 32:
        return 4
    raise ValueError('diferença grande demais para 32 bits')


def _codificar(chave, a):
    """-> (descritor, bytes)"""
    if a.dtype == np.float32:
        if not np.isfinite(a).all():
            raise ValueError(f'vetor {chave} tem NaN/infinito: não cabe no formato')
        c = COMPONENTES.get(chave, 1)
        if a.size % c:
            c = 1
        q = np.round(a.astype(np.float64) * ESCALA).astype(np.int64).reshape(-1, c)
        d = np.diff(q, axis=0, prepend=np.zeros((1, c), np.int64)).reshape(-1)
        z = _zz(d)
        if z.size and int(z.max()) >= 2 ** 32:
            # número fora da escala de obra (as UV do piso tátil vêm do pipeline
            # em dezenas de milhões): vai como float32, só embaralhado
            return {'t': 'F', 'e': 'f', 'c': 1, 'w': 4, 'n': int(a.size)}, _embaralhar(a.view(np.uint32), 4)
        w = _largura(z)
        # o arredondamento em si (a volta pelo decodificador é conferida em empacotar)
        erro = float(np.max(np.abs((q.reshape(-1) / ESCALA).astype(np.float32) - a))) if a.size else 0.0
        if erro > TOL:
            raise ValueError(f'vetor {chave}: erro de {erro:.6f} m passa da tolerância')
        return {'t': 'F', 'e': 'q', 'c': c, 'w': w, 'n': int(a.size)}, _embaralhar(z, w)
    if a.dtype == np.uint32:
        d = np.diff(a.astype(np.int64), prepend=0)
        z = _zz(d)
        w = _largura(z)
        return {'t': 'U', 'e': 'd', 'c': 1, 'w': w, 'n': int(a.size)}, _embaralhar(z, w)
    return {'t': 'B', 'e': 'r', 'c': 1, 'w': 1, 'n': int(a.size)}, a.astype(np.uint8).tobytes()


def _decodificar(desc, b):
    """o mesmo caminho do visor, em Python — para a conferência."""
    w, n = desc['w'], desc['n']
    if desc['e'] == 'r':
        return np.frombuffer(b, np.uint8)
    if desc['e'] == 'f':
        return np.frombuffer(b, np.uint8).reshape(4, n).T.copy().view('<f4').reshape(-1)
    u = np.frombuffer(b, np.uint8).reshape(w, n).T.copy().view('<u' + str(w)).reshape(-1).astype(np.int64) \
        if w > 1 else np.frombuffer(b, np.uint8).astype(np.int64)
    d = (u >> 1) ^ -(u & 1)
    if desc['e'] == 'd':
        return np.cumsum(d).astype(np.uint32)
    c = desc['c']
    return (np.cumsum(d.reshape(-1, c), axis=0).reshape(-1) / ESCALA).astype(np.float32)


def empacotar(obj):
    vetores, blocos = [], []
    pos = [0]

    def troca(o, chave):
        if isinstance(o, dict):
            if isinstance(o.get('b64'), str) and o.get('t') in ('F', 'U', 'B'):
                a = _b64_para_np(o)
                desc, b = _codificar(chave, a)
                # cada bloco começa alinhado em 4 bytes (TypedArray no navegador)
                pad = (-pos[0]) % 4
                if pad:
                    blocos.append(b'\0' * pad)
                    pos[0] += pad
                desc['o'] = pos[0]
                blocos.append(b)
                pos[0] += len(b)
                # confere já, com o vetor original na mão
                volta = _decodificar(desc, b)
                if a.dtype == np.float32:
                    erro = float(np.max(np.abs(volta - a))) if a.size else 0.0
                    if erro > TOL:
                        raise ValueError(f'{chave}: erro {erro}')
                elif not np.array_equal(volta, a):
                    raise ValueError(f'{chave}: índice não volta igual')
                vetores.append(desc)
                return {'@': len(vetores) - 1}
            return {k: troca(v, k) for k, v in o.items()}
        if isinstance(o, list):
            return [troca(v, chave) for v in o]
        return o

    raiz = troca(obj, '')
    cab = json.dumps({'root': raiz, 'arrays': vetores}, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    corpo = MAGIC + struct.pack('<II', VERSAO_FORMATO, len(cab)) + cab
    corpo += b'\0' * ((-len(corpo)) % 8)
    corpo += b''.join(blocos)
    return gzip.compress(corpo, 9, mtime=0)


def webp(origem, destino, q, lado_max=None):
    im = Image.open(origem)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGB')
    if lado_max and max(im.size) > lado_max:
        im.thumbnail((lado_max, lado_max), Image.LANCZOS)
    im.save(destino, 'WEBP', quality=q, method=6)


def main():
    if len(sys.argv) != 3:
        print(__doc__.split('\n\n')[1])
        sys.exit(2)
    ori, dst = sys.argv[1], sys.argv[2].rstrip('/')
    html = open(os.path.join(ori, 'index.html'), encoding='utf8').read()
    m = re.search(r'<script type="application/json" id="modeldata">(.*?)</script>', html, re.S)
    if not m:
        sys.exit('index.html sem <script id="modeldata"> — é a página publicada pelo mkpub.py?')
    M = json.loads(m.group(1))
    if M.get('v') != 5:
        sys.exit(f'índice na versão {M.get("v")}: este importador conhece a 5 (FORMAT_V5.md)')

    if os.path.isdir(dst):
        shutil.rmtree(dst)
    os.makedirs(os.path.join(dst, 'tiles'))
    arquivos = []

    def anota(rel):
        arquivos.append({'f': rel, 'b': os.path.getsize(os.path.join(dst, rel))})

    antes = depois = 0
    for t in M.get('tiles', []):
        src = os.path.join(ori, t['file'])
        antes += os.path.getsize(src)
        rel = 'tiles/' + t['id'] + '.bin'
        with open(os.path.join(dst, rel), 'wb') as f:
            f.write(empacotar(json.load(open(src, encoding='utf8'))))
        t['file'] = rel
        t['bytes'] = os.path.getsize(os.path.join(dst, rel))
        depois += t['bytes']
        anota(rel)
        print(f'  {t["id"]}: {os.path.getsize(src) // 1024} KB -> {t["bytes"] // 1024} KB')
    print(f'trechos: {antes / 1e6:.1f} MB de JSON -> {depois / 1e6:.2f} MB')

    if os.path.exists(os.path.join(ori, 'entorno.json')):
        with open(os.path.join(dst, 'entorno.bin'), 'wb') as f:
            f.write(empacotar(json.load(open(os.path.join(ori, 'entorno.json'), encoding='utf8'))))
        anota('entorno.bin')
        print(f'entorno: {os.path.getsize(os.path.join(ori, "entorno.json")) // 1024} KB -> '
              f'{os.path.getsize(os.path.join(dst, "entorno.bin")) // 1024} KB')
    if os.path.exists(os.path.join(ori, 'edif.json')):
        E = json.load(open(os.path.join(ori, 'edif.json'), encoding='utf8'))
        with open(os.path.join(dst, 'edif.json'), 'w', encoding='utf8') as f:
            json.dump(E, f, ensure_ascii=False, separators=(',', ':'))
        anota('edif.json')

    tex = os.path.join(ori, 'tex')
    texturas = {}
    if os.path.isdir(tex):
        os.makedirs(os.path.join(dst, 'tex'))
        for fn in sorted(os.listdir(tex)):
            base, ext = os.path.splitext(fn)
            if ext.lower() not in ('.jpg', '.jpeg', '.png'):
                continue
            q = Q_NORMAL if base.endswith('_n') else Q_COR
            src = os.path.join(tex, fn)
            webp(src, os.path.join(dst, 'tex', base + '.webp'), q)
            # Fica o menor dos dois. No mapa de normal (ruído fino, sem área
            # chapada) o WebP de qualidade alta sai MAIOR que o JPG de origem.
            if os.path.getsize(os.path.join(dst, 'tex', base + '.webp')) >= os.path.getsize(src):
                os.remove(os.path.join(dst, 'tex', base + '.webp'))
                shutil.copy(src, os.path.join(dst, 'tex', fn))
                rel = 'tex/' + fn
            else:
                rel = 'tex/' + base + '.webp'
            texturas[base] = rel
            anota(rel)

    if M.get('renders'):
        os.makedirs(os.path.join(dst, 'renders'))
        for r in M['renders']:
            for k in ('f', 'th'):
                if not r.get(k):
                    continue
                base = os.path.splitext(os.path.basename(r[k]))[0]
                rel = 'renders/' + base + '.webp'
                webp(os.path.join(ori, r[k]), os.path.join(dst, rel), Q_RENDER)
                r[k] = rel
                anota(rel)

    # As exportações (DXF, SketchUp, OBJ, GLB, LandXML) ficam na página do
    # modelo: são para o escritório levar ao CAD, não para o canteiro, e o
    # LandXML sozinho seriam 7,5 MB no repositório que é o servidor do app.
    M.pop('exports', None)
    M['pacote'] = {'formato': VERSAO_FORMATO, 'arquivos': arquivos, 'tex': texturas,
                   'bytes': sum(a['b'] for a in arquivos)}
    with open(os.path.join(dst, 'index.json'), 'w', encoding='utf8') as f:
        json.dump(M, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(a['b'] for a in arquivos) + os.path.getsize(os.path.join(dst, 'index.json'))
    print(f'pronto: {dst} — {len(arquivos) + 1} arquivos, {total / 1e6:.1f} MB')
    print('Lembrete: suba o VERSAO_MODELO3D do sw.js se este modelo já estava publicado.')


if __name__ == '__main__':
    main()
