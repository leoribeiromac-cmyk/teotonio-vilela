# Sistema de controle de obra — Av. Senador Teotônio Vilela
# Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
# Software proprietário — ver LICENSE, na raiz do repositório.
# MONTAGEM do vídeo do modelo 3D: corte, transições, cor, texto, letterbox e grão.
# python3 comp.py <quadros/> <saida.mp4|quadros_png/> [--previz] [--de s] [--ate s] [--so-video]
# Lê roteiro.json (tempo de cada plano) e faixas.json; escreve vídeo cru para o ffmpeg.
import json, math, os, sys, subprocess, argparse, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage

AQ = os.environ.get('VIDEO_TRABALHO') or os.path.join(__import__('tempfile').gettempdir(), 'video-modelo3d')
ap = argparse.ArgumentParser()
ap.add_argument('quadros'); ap.add_argument('saida')
ap.add_argument('--previz', action='store_true'); ap.add_argument('--de', type=float, default=0); ap.add_argument('--ate', type=float, default=1e9)
ap.add_argument('--png', action='store_true'); ap.add_argument('--passo', type=int, default=1)
ap.add_argument('--audio', default=None); ap.add_argument('--crf', default='15')
A = ap.parse_args()

FPS = 24
W, H = (1920, 1080)
IW, IH = 1920, 800                 # a imagem (2,4:1) dentro do quadro 16:9
IY = (H - IH) // 2
ROT = json.load(open(os.path.join(AQ, 'roteiro.json')))
FX = json.load(open(os.path.join(AQ, 'faixas.json')))
PL = {p['id']: p for p in ROT['planos']}
ORDEM = [p['id'] for p in ROT['planos']]
RENDER_PASSO = 3 if A.previz else 1

# ---------- MONTAGEM (EDL): planos em ordem; transição de cada um para o seguinte
# 'corte' | 'continuo' (mesma câmera) | 'funde' (dissolve, sobrepõe n quadros) | 'zoom' (borrão radial, sem sobrepor)
# | 'preto' (mergulho no preto) | 'clarao' (clarão quente no corte)
TRANS = {
    'planta': ('continuo', 0), 'revela': ('clarao', 0), 'avenida': ('corte', 0), 'orbita': ('zoom', 0),
    'mergulho': ('corte', 0), 'esquina': ('corte', 0), 'ciclovia': ('corte', 0), 'sinal': ('preto', 0),
    'raiox': ('funde', 12), 'bueiro': ('corte', 0), 'camadas': ('corte', 0), 'muro': ('clarao', 0),
    'volta': ('corte', 0), 'obra': ('corte', 0), 'rdo': ('funde', 12), 'dourado': ('corte', 0), 'fim': ('fim', 0),
}
FIM_CARTAO = 7.0   # cartão final, em preto

# tempo do filme de cada plano (início, fim) — os dissolves sobrepõem
FILME = {}
t = 0.0
for i, pid in enumerate(ORDEM):
    d = PL[pid]['dur']
    FILME[pid] = (t, t + d)
    tipo, n = TRANS[pid]
    t += d - (n / FPS if tipo == 'funde' else 0)
DUR = t + FIM_CARTAO
json.dump({'filme': FILME, 'dur': DUR}, open(os.path.join(AQ, 'filme.json'), 'w'), indent=1)

# ---------- fontes: as do app (vendor/fontes, woff2) viram TTF na pasta de trabalho; títulos em Inter Display se houver
F = os.path.join(AQ, 'fontes')
def _garantir_fontes():
    if os.path.exists(os.path.join(F, 'JetBrainsMono-600.ttf')): return
    from fontTools.ttLib import TTFont
    os.makedirs(F, exist_ok=True)
    vend = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'vendor', 'fontes')
    for w in ('400', '500', '600'):
        f = TTFont(os.path.join(vend, 'jetbrains-mono-latin-%s-normal.woff2' % w)); f.flavor = None; f.save(os.path.join(F, 'JetBrainsMono-%s.ttf' % w))
    for w in ('500', '600', '700'):
        f = TTFont(os.path.join(vend, 'space-grotesk-latin-%s-normal.woff2' % w)); f.flavor = None; f.save(os.path.join(F, 'SpaceGrotesk-%s.ttf' % w))
_garantir_fontes()
def fonte(nome, px):
    caminhos = {'disp-l': '/usr/share/fonts/opentype/inter/InterDisplay-Light.otf', 'disp-xl': '/usr/share/fonts/opentype/inter/InterDisplay-ExtraLight.otf',
                'disp-sb': '/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf', 'disp-m': '/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf',
                'inter': '/usr/share/fonts/opentype/inter/Inter-Regular.otf', 'inter-m': '/usr/share/fonts/opentype/inter/Inter-Medium.otf',
                'mono': os.path.join(F, 'JetBrainsMono-400.ttf'), 'mono-m': os.path.join(F, 'JetBrainsMono-500.ttf'), 'mono-sb': os.path.join(F, 'JetBrainsMono-600.ttf')}
    c = caminhos[nome]
    if not os.path.exists(c):   # sem Inter no sistema: o Space Grotesk do app
        c = os.path.join(F, 'SpaceGrotesk-%s.ttf' % ('700' if nome.endswith('sb') else '500' if nome in ('disp-l', 'disp-xl', 'inter') else '600'))
    return ImageFont.truetype(c, px)
_FC = {}
def fz(nome, px):
    k = (nome, px)
    if k not in _FC: _FC[k] = fonte(nome, px)
    return _FC[k]

AMBAR = (240, 137, 60)
BRANCO = (255, 255, 255)

# ---------- curvas de tempo
def cl(x, a=0.0, b=1.0): return max(a, min(b, x))
def suave(x): x = cl(x); return x * x * (3 - 2 * x)
def sai3(x): x = cl(x); return 1 - (1 - x) ** 3
def sai5(x): x = cl(x); return 1 - (1 - x) ** 5
def entra3(x): x = cl(x); return x ** 3
def rampa(t, t0, t1): return cl((t - t0) / max(1e-6, t1 - t0))
def perfil(ein, eout, N=1000):
    """o mesmo perfil de velocidade do cine.js (acelera em seno, constante, freia em seno) → posição 0..1"""
    u = (np.arange(N) + .5) / N
    v = np.where(u < ein, (1 - np.cos(np.pi * u / max(ein, 1e-9))) / 2, np.where(u > 1 - eout, (1 - np.cos(np.pi * (1 - u) / max(eout, 1e-9))) / 2, 1.0))
    acc = np.concatenate([[0], np.cumsum(v)]); acc /= acc[-1]
    return lambda x: float(np.interp(cl(x), np.linspace(0, 1, N + 1), acc))
PERFIL_VAR = perfil(.18, .18)

# ---------- leitura de quadro do render (com cache pequeno)
_cache = {}
def quadro_render(pid, tl):
    """tl: tempo local no plano (s) → imagem float32 RGB IW×IH (0..1)."""
    p = PL[pid]
    f = int(round((p['t0'] + cl(tl, 0, p['dur'] - 1e-3)) * FPS))
    if RENDER_PASSO > 1: f = (f // RENDER_PASSO) * RENDER_PASSO
    f = max(int(round(p['t0'] * FPS)) + (0 if RENDER_PASSO == 1 else (-int(round(p['t0'] * FPS)) % RENDER_PASSO)), f)
    k = (pid, f)
    if k in _cache: return _cache[k]
    arq = os.path.join(A.quadros, '%05d.jpg' % f)
    if not os.path.exists(arq):
        # procura o vizinho mais próximo (render parcial / previz)
        for d in range(1, 12):
            for g in (f - d, f + d):
                a2 = os.path.join(A.quadros, '%05d.jpg' % g)
                if os.path.exists(a2): arq = a2; break
            else: continue
            break
    if os.path.exists(arq):
        im = Image.open(arq).convert('RGB')
        # quadros com borrão de movimento: média das sub-amostras
        subs = sorted([x for x in os.listdir(A.quadros) if x.startswith('%05d.s' % f)]) if False else []
        if im.size != (IW, IH): im = im.resize((IW, IH), Image.LANCZOS)
        a = np.asarray(im, dtype=np.float32) / 255.0
    else:
        a = np.zeros((IH, IW, 3), np.float32)
    if len(_cache) > 24: _cache.clear()
    _cache[k] = a
    return a

def marcas(pid, tl):
    p = PL[pid]
    f = int(round((p['t0'] + cl(tl, 0, p['dur'] - 1e-3)) * FPS))
    for d in range(0, 8):
        for g in (f - d, f + d):
            arq = os.path.join(A.quadros, '%05d.json' % g)
            if os.path.exists(arq):
                return json.load(open(arq))
    return None

# ---------- COR: o render sai neutro (ACES); aqui ganha o "olhar" do filme
def lut_curva():
    x = np.linspace(0, 1, 4096, dtype=np.float32)
    sm = x * x * (3 - 2 * x)
    s = x + (sm - x) * 0.28                 # S suave: mais contraste nos meios, sem esmagar as pontas
    s = 0.016 + s * (0.978 - 0.016)         # preto levemente levantado, branco que não estoura
    return x, s
_LX, _LS = lut_curva()
def grade(img, quente=0.0):
    a = img
    # contraste em S (sobre a luma), preservando a cor
    luma = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
    l2 = np.interp(luma, _LX, _LS).astype(np.float32)
    k = (l2 + 1e-4) / (luma + 1e-4)
    a = a * k[..., None]
    # split-tone: sombras para o azul-petróleo, luzes para o âmbar (de leve)
    sh = np.clip(1 - luma / 0.45, 0, 1)[..., None]
    hi = np.clip((luma - 0.55) / 0.45, 0, 1)[..., None]
    a = a + sh * np.array([-0.012, 0.004, 0.018], np.float32) + hi * np.array([0.020 + quente * 0.03, 0.008 + quente * 0.01, -0.016 - quente * 0.02], np.float32)
    # saturação +8%
    m = a.mean(axis=2, keepdims=True); a = m + (a - m) * 1.08
    return np.clip(a, 0, 1)

def bloom(a, forca=0.10):
    luma = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
    br = np.clip((luma - 0.72) / 0.28, 0, 1)[..., None] * a
    pe = br[::4, ::4]
    pe = ndimage.gaussian_filter(pe, sigma=(6, 6, 0))
    up = np.asarray(Image.fromarray((np.clip(pe, 0, 1) * 255).astype(np.uint8)).resize((a.shape[1], a.shape[0]), Image.BILINEAR), np.float32) / 255
    return np.clip(a + up * forca, 0, 1)

_VIN = None
def vinheta(a, forca=0.22):
    global _VIN
    if _VIN is None or _VIN.shape[:2] != a.shape[:2]:
        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]].astype(np.float32)
        nx = (xx / a.shape[1] - .5) * 2; ny = (yy / a.shape[0] - .5) * 2
        r = np.sqrt((nx * 0.85) ** 2 + (ny * 1.0) ** 2)
        _VIN = np.clip(1 - forca * np.clip(r - 0.35, 0, None) ** 1.6, 0, 1)[..., None].astype(np.float32)
    return a * _VIN

_RNG = np.random.default_rng(7)
def grao(a, f, forca=0.026):
    rng = np.random.default_rng(1000 + f)
    n = rng.standard_normal((a.shape[0] // 2, a.shape[1] // 2)).astype(np.float32)
    n = np.asarray(Image.fromarray(((n * 0.25 + 0.5).clip(0, 1) * 255).astype(np.uint8)).resize((a.shape[1], a.shape[0]), Image.BICUBIC), np.float32) / 255 - 0.5
    luma = a.mean(axis=2, keepdims=True)
    w = 4 * luma * (1 - luma) + 0.25   # mais grão nos meios-tons
    return np.clip(a + n[..., None] * forca * 2 * w, 0, 1)

# ---------- efeitos de transição
def borrao_radial(a, forca):
    if forca <= 0.002: return a
    im = Image.fromarray((a * 255).astype(np.uint8))
    acc = np.zeros_like(a)
    n = 9
    for i in range(n):
        s = 1 + forca * i / (n - 1)
        w2, h2 = int(IW * s), int(IH * s)
        z = im.resize((w2, h2), Image.BILINEAR).crop(((w2 - IW) // 2, (h2 - IH) // 2, (w2 - IW) // 2 + IW, (h2 - IH) // 2 + IH))
        acc += np.asarray(z, np.float32) / 255
    return acc / n

def clarao(a, k, cx=0.7):
    """clarão quente (light leak) que atravessa a tela; k 0..1..0"""
    if k <= 0.002: return a
    yy, xx = np.mgrid[0:IH:4, 0:IW:4].astype(np.float32)
    nx = xx / IW; ny = yy / IH
    d = np.sqrt(((nx - cx) / 0.55) ** 2 + ((ny - 0.35) / 0.9) ** 2)
    g = np.exp(-d * d * 2.2)
    cor = np.stack([g * 1.0, g * 0.62, g * 0.28], -1)
    up = np.asarray(Image.fromarray((np.clip(cor, 0, 1) * 255).astype(np.uint8)).resize((IW, IH), Image.BILINEAR), np.float32) / 255
    out = 1 - (1 - a) * (1 - up * k * 1.1)          # tela (screen)
    return np.clip(out + k * k * 0.35, 0, 1)

def planta_tecnica(a, f):
    """a imagem vista como planta: arestas claras sobre azul de prancha, com malha"""
    l = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
    l = ndimage.gaussian_filter(l, 0.8)
    gx = ndimage.sobel(l, 1); gy = ndimage.sobel(l, 0)
    e = np.sqrt(gx * gx + gy * gy)
    e = np.clip((e - 0.06) * 3.2, 0, 1)
    fundo = np.array([0.035, 0.105, 0.20], np.float32)
    linha = np.array([0.80, 0.92, 1.0], np.float32)
    out = fundo[None, None, :] * (0.85 + 0.3 * l[..., None]) + e[..., None] * linha[None, None, :] * 0.9
    # malha de prancha
    yy, xx = np.mgrid[0:IH, 0:IW]
    malha = ((xx % 64) == 0) | ((yy % 64) == 0)
    malha2 = ((xx % 16) == 0) | ((yy % 16) == 0)
    out = out + malha[..., None] * 0.05 + malha2[..., None] * 0.012
    return np.clip(out, 0, 1)

# ---------- TEXTO: cada elemento vira um sprite RGBA, posto com posição sub-pixel
def sprite_texto(txt, fonte_, cor=BRANCO, rastro=0.0, sombra=True):
    """texto com espaçamento (rastro em em) → imagem RGBA"""
    fnt = fonte_
    asc, desc = fnt.getmetrics()
    larg = 0; xs = []
    for ch in txt:
        xs.append(larg)
        larg += fnt.getlength(ch) + rastro * fnt.size
    larg = int(math.ceil(larg - rastro * fnt.size)) + 8
    alt = asc + desc + 8
    im = Image.new('RGBA', (max(1, larg), alt), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for ch, x in zip(txt, xs):
        d.text((x + 4, 4), ch, font=fnt, fill=cor + (255,))
    if sombra:
        a = np.asarray(im)[..., 3].astype(np.float32) / 255
        sh = ndimage.gaussian_filter(a, 6) * 0.55
        base = np.zeros((alt, larg, 4), np.float32); base[..., 3] = sh
        top = np.asarray(im).astype(np.float32) / 255
        out = top.copy(); out[..., 3] = top[..., 3] + sh * (1 - top[..., 3])
        rgb = (top[..., :3] * top[..., 3:4]) / np.maximum(out[..., 3:4], 1e-4)
        out[..., :3] = rgb
        im = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA')
    return im, asc

_VEUS = {}
def veu_mascara(tipo):
    """chão escuro e macio atrás do texto: 'baixo' (terço inferior esquerdo), 'centro' (título), 'topo' (rótulos do alto)"""
    if tipo in _VEUS: return _VEUS[tipo]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx, ny = xx / W, (yy - IY) / IH
    if tipo == 'baixo':
        m = np.clip((ny - 0.45) / 0.55, 0, 1) ** 1.3 * np.clip(1.25 - nx * 1.1, 0, 1)
    elif tipo == 'topo':
        m = np.clip((0.42 - ny) / 0.42, 0, 1) ** 1.4
    else:
        m = np.exp(-(((nx - .5) / .42) ** 2 + ((ny - .47) / .32) ** 2))
    _VEUS[tipo] = (m * 0.55).astype(np.float32)[..., None]
    return _VEUS[tipo]

class Camada:
    """o que vai por cima da imagem num quadro: lista de (sprite RGBA, x, y float, alfa)"""
    def __init__(s): s.itens = []; s.veus = {}
    def veu(s, tipo, k):
        if k > 0.003: s.veus[tipo] = max(s.veus.get(tipo, 0), k)
    def poe(s, im, x, y, alfa=1.0):
        if alfa > 0.003: s.itens.append((im, x, y, alfa))
    def retangulo(s, x, y, w, h, cor, alfa=1.0):
        if w <= 0.3 or h <= 0.3 or alfa <= 0.003: return
        im = Image.new('RGBA', (int(math.ceil(w)) + 2, int(math.ceil(h)) + 2), (0, 0, 0, 0))
        ImageDraw.Draw(im).rectangle((1, 1, 1 + w, 1 + h), fill=cor + (255,))
        s.itens.append((im, x - 1, y - 1, alfa))
    def aplica(s, quadro):
        """quadro: float32 H×W×3 (0..1), já com letterbox"""
        for tipo, k in s.veus.items():
            quadro *= 1 - veu_mascara(tipo) * k
        for im, x, y, alfa in s.itens:
            ix, iy = math.floor(x), math.floor(y); fx, fy = x - ix, y - iy
            if fx or fy:
                im2 = im.transform((im.width + 1, im.height + 1), Image.AFFINE, (1, 0, -fx, 0, 1, -fy), resample=Image.BICUBIC)
            else: im2 = im
            a = np.asarray(im2, np.float32) / 255
            x0, y0 = ix, iy; x1, y1 = x0 + a.shape[1], y0 + a.shape[0]
            cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
            if cx1 <= cx0 or cy1 <= cy0: continue
            sub = a[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
            al = sub[..., 3:4] * alfa
            quadro[cy0:cy1, cx0:cx1] = quadro[cy0:cy1, cx0:cx1] * (1 - al) + sub[..., :3] * al
        return quadro

_SP = {}
def sp(txt, nome, px, cor=BRANCO, rastro=0.0, sombra=True):
    k = (txt, nome, px, cor, rastro, sombra)
    if k not in _SP: _SP[k] = sprite_texto(txt, fz(nome, px), cor, rastro, sombra)
    return _SP[k]

def fmt_num(v, casas=0):
    s = f'{v:,.{casas}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return s

def conta(txt, k):
    """os números do texto contam de 0 até o valor (k 0..1)"""
    if k >= 1: return txt
    def tr(m):
        s = m.group(0); casas = len(s.split(',')[1]) if ',' in s else 0
        v = float(s.replace('.', '').replace(',', '.'))
        if v < 10 and casas: return s
        return fmt_num(v * sai3(k), casas)
    return re.sub(r'\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?', tr, txt, count=1)   # só o primeiro: o resto é estaca, diâmetro…

# ---------- os textos do filme
X0 = 104                     # margem esquerda dos textos (dentro da área segura)
BASE = IY + IH - 104         # linha de base do título da legenda

def legenda(C, tl, dur, titulo, sub, de=0.5, conta_num=False, ate=None):
    """terço inferior: filete âmbar cresce, título sobe de uma máscara, a linha técnica entra depois"""
    ate = (dur - 0.55) if ate is None else ate
    k0 = rampa(tl, de, de + 0.55)                  # filete
    ks = 1 - suave(rampa(tl, ate, ate + 0.45))     # saída
    if k0 <= 0 or ks <= 0: return
    C.veu('baixo', suave(rampa(tl, de - 0.2, de + 0.6)) * ks)
    C.retangulo(X0, BASE - 74, 58 * sai5(k0), 3, AMBAR, ks)
    kt = sai5(rampa(tl, de + 0.12, de + 0.85))
    im, asc = sp(titulo, 'disp-sb', 54)
    C.poe(im, X0 - 4, BASE - 58 - 4 + (1 - kt) * 22 + (1 - ks) * 8, kt * ks)
    if sub:
        ksb = sai5(rampa(tl, de + 0.35, de + 1.05))
        txt = conta(sub, rampa(tl, de + 0.35, de + 1.9)) if conta_num else sub
        im2, _ = sp(txt, 'mono', 23, (232, 236, 240), 0.02)
        C.poe(im2, X0 - 4, BASE + 12 + (1 - ksb) * 14 + (1 - ks) * 8, ksb * ks * 0.92)

def secao(C, tl, num, titulo, de=0.0, dur=2.6):
    """cartão de ato, no meio da imagem: número em mono, título espaçado, filetes que se abrem"""
    k = rampa(tl, de, de + 0.7); ks = 1 - suave(rampa(tl, de + dur - 0.6, de + dur))
    if k <= 0 or ks <= 0: return
    C.veu('centro', suave(k) * ks * 0.9)
    cy = IY + IH * 0.46
    im, asc = sp(titulo, 'disp-l', 40, BRANCO, 0.32)
    kt = sai3(rampa(tl, de + 0.15, de + 1.0))
    C.poe(im, (W - im.width) / 2, cy - im.height / 2 + (1 - kt) * 10, kt * ks)
    imn, _ = sp(num, 'mono-m', 18, AMBAR, 0.2)
    C.poe(imn, (W - imn.width) / 2, cy - 58, sai3(k) * ks)
    L = 150 * sai5(rampa(tl, de + 0.2, de + 1.2))
    C.retangulo(W / 2 - im.width / 2 - 34 - L, cy - 1, L, 1.5, BRANCO, 0.75 * ks)
    C.retangulo(W / 2 + im.width / 2 + 34, cy - 1, L, 1.5, BRANCO, 0.75 * ks)

def titulo_principal(C, tl, de, ate, final=False):
    k = rampa(tl, de, de + 0.6); ks = 1 - suave(rampa(tl, ate, ate + 0.8))
    if k <= 0 or ks <= 0: return
    C.veu('centro', suave(k) * ks)
    cy = IY + IH * (0.40 if not final else 0.44)
    kick = 'SÃO PAULO  ·  ZONA SUL' if not final else 'MODELO 3D AMARRADO AO RDO'
    imk, _ = sp(kick, 'mono-m', 18, AMBAR, 0.28)
    C.poe(imk, (W - imk.width) / 2, cy - 92 + (1 - sai3(k)) * 8, sai3(k) * ks)
    # o nome entra letra por letra
    nome = 'Av. Senador Teotônio Vilela'
    fnt = fz('disp-l', 96)
    tot = sum(fnt.getlength(ch) for ch in nome)
    x = (W - tot) / 2
    for i, ch in enumerate(nome):
        kc = sai5(rampa(tl, de + 0.25 + i * 0.028, de + 1.05 + i * 0.028))
        if ch != ' ':
            imc, _ = sp(ch, 'disp-l', 96)
            C.poe(imc, x - 4, cy - 64 + (1 - kc) * 26, kc * ks)
        x += fnt.getlength(ch)
    L = 520 * sai5(rampa(tl, de + 0.9, de + 2.0))
    C.retangulo(W / 2 - L / 2, cy + 56, L, 1.5, BRANCO, 0.6 * ks)
    sub = 'Duplicação  ·  PD 203–243  ·  PE 100–141  ·  ~810 m' if not final else 'Sistema Gestor Engenharia  ·  controle de obra'
    ims, _ = sp(sub, 'mono', 24, (236, 240, 244), 0.03)
    kss = sai3(rampa(tl, de + 1.2, de + 2.0))
    C.poe(ims, (W - ims.width) / 2, cy + 74 + (1 - kss) * 10, kss * ks * 0.92)

def rotulos_estaca(C, tl, pts, rotulos, de=0.6, passo=0.32, sai=None):
    """na planta: as estacas aparecem uma a uma sobre o eixo, como numa prancha"""
    if not pts: return
    for i, (p, r) in enumerate(zip(pts, rotulos)):
        if p is None: continue
        k = sai3(rampa(tl, de + i * passo, de + i * passo + 0.5))
        ks = 1 - suave(rampa(tl, sai, sai + 0.6)) if sai is not None else 1
        if k <= 0 or ks <= 0: continue
        x, y = p[0] * IW / ROT_W, IY + p[1] * IH / ROT_H
        im, _ = sp(r, 'mono-m', 17, (220, 236, 255), 0.06)
        C.retangulo(x - 3, y - 3, 6, 6, AMBAR, k * ks)
        C.retangulo(x - 0.5, y - 34 * k, 1, 30 * k, (220, 236, 255), 0.7 * k * ks)
        C.poe(im, x - im.width / 2, y - 64 + (1 - k) * 8, k * ks)

def chamadas(C, tl, pts, rotulos, de=1.2, passo=0.45, ate=None):
    """chamadas com linha de chamada que acompanham o ponto 3D (as camadas do pavimento)"""
    if not pts: return
    for i, (p, (r, s)) in enumerate(zip(pts, rotulos)):
        if p is None: continue
        k = sai3(rampa(tl, de + i * passo, de + i * passo + 0.6))
        ks = 1 - suave(rampa(tl, ate, ate + 0.5)) if ate is not None else 1
        if k <= 0 or ks <= 0: continue
        x, y = p[0] * IW / ROT_W, IY + p[1] * IH / ROT_H
        lx = x + 160 + i * 0;  ly = IY + 170 + i * 92
        # ponto, linha em cotovelo, rótulo
        C.retangulo(x - 3.5, y - 3.5, 7, 7, AMBAR, k * ks)
        seg = 1.0 * k
        mx = x + (lx - x) * 0.55
        C.retangulo(min(x, mx), y - 0.75, abs(mx - x) * seg, 1.5, BRANCO, 0.8 * ks)
        if seg > 0.55:
            k2 = (seg - 0.55) / 0.45
            y0, y1 = sorted((y, ly));
            C.retangulo(mx - 0.75, y0 if ly < y else y, 1.5, (y1 - y0) * k2, BRANCO, 0.8 * ks)
            C.retangulo(mx, ly - 0.75, (lx - mx) * k2, 1.5, BRANCO, 0.8 * ks)
        im, _ = sp(r, 'disp-sb', 30); ims, _ = sp(s, 'mono', 19, (230, 236, 240), 0.03)
        kt = sai3(rampa(tl, de + i * passo + 0.35, de + i * passo + 0.95))
        C.poe(im, lx + 10, ly - 36, kt * ks); C.poe(ims, lx + 12, ly + 2, kt * ks * 0.9)

MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
def linha_tempo(C, tl, dur, frac):
    """a régua da obra simulada: mai/2024 → mar/2026, com a cabeça andando"""
    k = sai3(rampa(tl, 0.2, 0.9)); ks = 1 - suave(rampa(tl, dur - 0.6, dur - 0.1))
    if k <= 0 or ks <= 0: return
    C.veu('baixo', 0.6 * k * ks); C.veu('topo', 0.5 * k * ks)
    x0, x1, y = 300, W - 300, IY + IH - 70
    C.retangulo(x0, y, (x1 - x0) * k, 1.5, BRANCO, 0.45 * ks)
    C.retangulo(x0, y - 0.5, (x1 - x0) * frac, 2.5, AMBAR, ks)
    # marcas de mês
    m0 = 2024 * 12 + 4; m1 = 2026 * 12 + 2
    for m in range(m0, m1 + 1):
        fx = (m - m0) / (m1 - m0); xx = x0 + (x1 - x0) * fx
        alto = 9 if m % 12 == 0 or m == m0 or m == m1 else 5
        C.retangulo(xx - 0.5, y - alto, 1, alto, BRANCO if fx <= frac else (170, 176, 182), (0.9 if fx <= frac else 0.5) * k * ks)
        if m % 6 == 4 or m == m1:
            im, _ = sp(f'{MESES[m % 12]}/{str(m // 12)[2:]}', 'mono', 15, (215, 222, 228), 0.04)
            C.poe(im, xx - im.width / 2, y + 10, 0.75 * k * ks)
    mm = m0 + frac * (m1 - m0); mi = int(mm)
    im, _ = sp(f'{MESES[mi % 12]}/{mi // 12}', 'mono-sb', 22, BRANCO, 0.03)
    hx = x0 + (x1 - x0) * frac
    C.retangulo(hx - 4, y - 3, 8, 8, AMBAR, ks)
    C.poe(im, hx - im.width / 2, y - 46, k * ks)
    imt, _ = sp('SIMULAÇÃO DA SEQUÊNCIA CONSTRUTIVA', 'mono-m', 15, AMBAR, 0.22)
    C.poe(imt, X0 - 4, IY + 40, 0.95 * k * ks)
    imd, _ = sp('ilustrativa · não é o avanço real da obra', 'mono', 14, (220, 226, 232), 0.04)
    C.poe(imd, X0 - 4, IY + 64, 0.75 * k * ks)

ETAPAS = FX['etapas']
def legenda_rdo(C, tl, dur, k_data):
    k = sai3(rampa(tl, 0.3, 1.0)); ks = 1 - suave(rampa(tl, dur - 0.7, dur - 0.1))
    if k <= 0 or ks <= 0: return
    C.veu('topo', 0.7 * k * ks)
    x = W - 104 - 250; y = IY + 54
    imh, _ = sp('ETAPA DA PISTA', 'mono-m', 14, (230, 234, 238), 0.22)
    C.poe(imh, x, y, k * ks)
    for i, e in enumerate(ETAPAS):
        ki = sai3(rampa(tl, 0.4 + i * 0.06, 0.9 + i * 0.06))
        c = tuple(int(e['cor'][j:j + 2], 16) for j in (1, 3, 5))
        yy = y + 30 + i * 27
        C.retangulo(x, yy + 4, 16, 12, c, ki * ks)
        im, _ = sp(e['nome'], 'inter-m', 17, (240, 242, 244))
        C.poe(im, x + 26, yy - 6, ki * ks * 0.95)
    d = FX['datas'][k_data]; dd = d[8:10] + '/' + d[5:7] + '/' + d[0:4]
    im, _ = sp(dd, 'mono-sb', 26, BRANCO, 0.02)
    C.poe(im, X0 - 4, IY + 46, k * ks)
    im2, _ = sp('LINHA DO TEMPO DO RDO  ·  DADOS DE DEMONSTRAÇÃO', 'mono-m', 14, AMBAR, 0.2)
    C.poe(im2, X0 - 4, IY + 90, k * ks)

def cartao_final(C, tl):
    k = sai3(rampa(tl, 0.5, 1.6)); ks = 1 - suave(rampa(tl, FIM_CARTAO - 1.4, FIM_CARTAO - 0.4))
    if k <= 0 or ks <= 0: return
    cy = H * 0.42
    im, _ = sp('Av. Senador Teotônio Vilela', 'disp-l', 56, BRANCO, 0.0, False)
    C.poe(im, (W - im.width) / 2, cy - 70, k * ks)
    im2, _ = sp('duplicação  ·  modelo 3D do projeto executivo, amarrado ao RDO', 'mono', 20, (205, 212, 218), 0.03, False)
    C.poe(im2, (W - im2.width) / 2, cy + 6, k * ks)
    C.retangulo(W / 2 - 30, cy + 58, 60, 2, AMBAR, k * ks)
    im3, _ = sp('Sistema Gestor Engenharia', 'disp-m', 30, BRANCO, 0.01, False)
    k3 = sai3(rampa(tl, 1.2, 2.2))
    C.poe(im3, (W - im3.width) / 2, cy + 86, k3 * ks)
    av = ['Carros, pessoas, céu e entorno são ilustrativos.', 'A sequência construtiva é simulada e os lançamentos do RDO são de demonstração.']
    for i, s in enumerate(av):
        im4, _ = sp(s, 'inter', 17, (150, 158, 166), 0.0, False)
        C.poe(im4, (W - im4.width) / 2, H - 196 + i * 28, sai3(rampa(tl, 1.8, 2.8)) * ks)

# ---------- o quadro do filme no instante t
ROT_W, ROT_H = IW, IH   # as marcas vêm em px do canvas do render; ajustado na primeira leitura
def plano_em(t):
    """→ lista de (pid, tl, peso) dos planos visíveis em t"""
    vis = []
    for i, pid in enumerate(ORDEM):
        a, b = FILME[pid]
        if a - 1e-6 <= t < b: vis.append((pid, t - a))
    return vis

def imagem_do_plano(pid, tl, f):
    a = quadro_render(pid, tl)
    p = PL[pid]; dur = p['dur']
    if pid == 'planta':
        bp = planta_tecnica(a, f)
        # a prancha vira lugar: uma cortina macia que corre ao longo da avenida, com borda âmbar
        k = rampa(tl, 3.6, 6.9)
        if k <= 0: a = bp
        else:
            xx = np.linspace(0, 1, IW, dtype=np.float32)[None, :] + np.linspace(0, .12, IH, dtype=np.float32)[:, None]
            fr = -0.15 + 1.35 * suave(k)
            m = np.clip((fr - xx) / 0.07, 0, 1)[..., None]
            borda = np.exp(-((xx - fr) / 0.012) ** 2)[..., None] * np.array([1.0, .55, .2], np.float32) * 0.85
            a = bp * (1 - m) + a * m + borda * (1 - k) ** 0.3
    if pid == 'orbita':   # zoom de saída
        a = borrao_radial(a, 0.16 * entra3(rampa(tl, dur - 0.33, dur)))
    if pid == 'mergulho':
        a = borrao_radial(a, 0.16 * (1 - sai3(rampa(tl, 0, 0.30))))
    return np.clip(a, 0, 1)

def textos_do_plano(C, pid, tl):
    p = PL[pid]; dur = p['dur']; tx = p.get('texto') or {}
    global ROT_W, ROT_H
    if pid == 'planta':
        mk = marcas(pid, tl)
        rotulos_estaca(C, tl, mk, ['PD 203', 'PD 211', 'PD 218', 'PD 226', 'PD 231', 'PD 238', 'PD 243'], de=0.7, passo=0.28, sai=3.4)
        im, _ = sp('PROJETO EXECUTIVO  ·  PLANTA', 'mono-m', 15, (200, 222, 255), 0.25)
        C.poe(im, X0 - 4, IY + 40, sai3(rampa(tl, 0.3, 1.0)) * (1 - suave(rampa(tl, 3.4, 4.2))))
    if pid == 'revela':
        titulo_principal(C, tl, de=3.2, ate=dur - 1.0)
    if tx.get('tipo') in ('lugar', 'dado'):
        legenda(C, tl, dur, tx['t'], tx.get('s', ''), de=tx.get('de', 0.5), conta_num=tx['tipo'] == 'dado')
    if tx.get('tipo') == 'raiox':
        mk = marcas(pid, tl)
        chamadas(C, tl, mk, [('Galeria Ø 1,20 m', 'PV-15 a PV-16 · desce até o bueiro')], de=4.6, ate=dur - 0.6)
        legenda(C, tl, dur, tx['t'], tx.get('s', ''), de=tx.get('de', 0.5), conta_num=True)
    if tx.get('tipo') == 'camadas':
        mk = marcas(pid, tl)
        chamadas(C, tl, mk, [('Capa asfáltica', 'CBUQ · 12 cm'), ('Base', 'BGTC · 20 cm'), ('Sub-base', 'BGS · 15 cm')], de=2.5, ate=dur - 0.7)
        legenda(C, tl, dur, tx['t'], tx.get('s', ''), de=tx.get('de', 0.5), conta_num=True)
    if p.get('secao'):
        num = {'O QUE NÃO SE VÊ': '02', 'A OBRA NO TEMPO': '03'}.get(p['secao'], '')
        secao(C, tl, num, p['secao'], de=0.15, dur=2.4 if pid != 'volta' else 3.2)
    if pid == 'obra':
        linha_tempo(C, tl, dur, PERFIL_VAR((tl / dur - 0.03) / 0.94))   # a régua anda com a frente da obra
    if pid == 'rdo':
        kd = min(len(FX['datas']) - 1, int(min(1, (tl / dur) / 0.8) * (len(FX['datas']) - 1)))
        legenda_rdo(C, tl, dur, kd)
        legenda(C, tl, dur, 'No app, cada estaca acende', 'com a etapa que o RDO lançou nela', de=0.6, ate=dur - 0.7)
    if pid == 'fim':
        titulo_principal(C, tl, de=4.4, ate=dur + 2, final=True)

def quadro_filme(t, f):
    out = np.zeros((H, W, 3), np.float32)
    C = Camada()
    if t >= DUR - FIM_CARTAO:
        cartao_final(C, t - (DUR - FIM_CARTAO))
        return C.aplica(out)
    vis = plano_em(t)
    img = None
    for j, (pid, tl) in enumerate(vis):
        a = imagem_do_plano(pid, tl, f)
        if img is None: img = a; peso_pid = pid
        else:
            # dissolve: o plano anterior está nos seus últimos quadros
            pa, tla = vis[0]
            n = TRANS[pa][1] / FPS
            k = suave(rampa(FILME[pa][1] - t, n, 0))
            img = img * (1 - k) + a * k
    if img is None: img = np.zeros((IH, IW, 3), np.float32)
    pid, tl = vis[-1] if vis else (ORDEM[-1], 0)
    quente = 0.0
    if pid in ('dourado', 'fim'): quente = 1.0
    if pid == 'planta' and tl < 3.6: quente = 0.0
    g = grade(img, quente)
    g = bloom(g, 0.11 if pid not in ('raiox',) else 0.07)
    g = vinheta(g, 0.20)
    # mergulho no preto (parada → raio x) e clarões nos cortes
    for pa in ORDEM:
        tipo, n = TRANS[pa]; tc = FILME[pa][1]
        if tipo == 'preto':
            k = 1 - min(abs(t - tc) / 0.42, 1); g = g * (1 - suave(k))
        if tipo == 'clarao':
            k = max(0.0, 1 - abs(t - tc) / 0.30)
            if k > 0: g = clarao(g, k ** 1.5, cx=0.72 if pa == 'revela' else 0.3)
    # fade de entrada do filme e saída para o cartão
    g = g * suave(rampa(t, 0.0, 1.2)) * (1 - suave(rampa(t, FILME['fim'][1] - 1.2, FILME['fim'][1])))
    out[IY:IY + IH] = g
    for pid2, tl2 in vis[-1:]:
        textos_do_plano(C, pid2, tl2)
    if len(vis) > 1:   # o texto do plano que sai também sai esmaecendo
        textos_do_plano(C, vis[0][0], vis[0][1])
    return C.aplica(out)

def main():
    global ROT_W, ROT_H
    # tamanho do canvas do render (para as marcas em px)
    for x in sorted(os.listdir(A.quadros)):
        if x.endswith('.jpg'):
            im = Image.open(os.path.join(A.quadros, x)); ROT_W, ROT_H = im.size; break
    f0 = int(A.de * FPS); f1 = int(min(A.ate, DUR) * FPS)
    print('filme', round(DUR, 2), 's ·', f1 - f0, 'quadros', file=sys.stderr)
    if A.png:
        os.makedirs(A.saida, exist_ok=True)
        for f in range(f0, f1, A.passo):
            q = quadro_filme(f / FPS, f)
            q = grao(q, f, 0.02)
            Image.fromarray((np.clip(q, 0, 1) * 255 + .5).astype(np.uint8)).save(os.path.join(A.saida, '%05d.png' % f))
        return
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
    if A.audio: cmd += ['-i', A.audio, '-c:a', 'aac', '-b:a', '256k', '-shortest']
    cmd += ['-c:v', 'libx264', '-preset', 'slow', '-crf', A.crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'grain' if not A.previz else 'film',
            '-x264-params', 'aq-mode=3', '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', A.saida]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(f0, f1):
        q = quadro_filme(f / FPS, f)
        q = grao(q, f, 0.02 if not A.previz else 0.0)
        pr.stdin.write((np.clip(q, 0, 1) * 255 + .5).astype(np.uint8).tobytes())
        if f % 120 == 0: print('  ', f, '/', f1, file=sys.stderr)
    pr.stdin.close(); pr.wait()

if __name__ == '__main__':
    main()
