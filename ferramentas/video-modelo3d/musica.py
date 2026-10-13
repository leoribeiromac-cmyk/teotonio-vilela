# Sistema de controle de obra — Av. Senador Teotônio Vilela
# Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
# Software proprietário — ver LICENSE, na raiz do repositório.
# TRILHA do vídeo do modelo 3D — sintetizada aqui, sem amostra de ninguém.
# 120 BPM (todo corte do filme cai num tempo), Ré menor → Ré maior no fecho.
# python3 musica.py [saida.wav]   (lê filme.json: os tempos de cada plano no filme)
import json, os, sys, math
import numpy as np
from scipy import signal

AQ = os.environ.get('VIDEO_TRABALHO') or os.path.join(__import__('tempfile').gettempdir(), 'video-modelo3d')
SR = 48000
FIL = json.load(open(os.path.join(AQ, 'filme.json')))
T = {k: v for k, v in FIL['filme'].items()}       # plano → (início, fim) no filme
DUR = FIL['dur']
N = int(DUR * SR) + SR
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(20240509)

def S(t): return int(round(t * SR))
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
NOTA = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
def n(s):   # 'D3' → midi
    nome, o = (s[:-1], int(s[-1])) if s[-2] not in '-' else (s[:-2], int(s[-2:]))
    return 12 * (o + 1) + NOTA[nome]

# ---------- barramentos (estéreo)
mus = np.zeros((N, 2), np.float32); sfx = np.zeros((N, 2), np.float32); amb = np.zeros((N, 2), np.float32)
rev = np.zeros((N, 2), np.float32)       # envio para a reverberação
def put(bus, t, x, pan=0.0, ganho=1.0, envio=0.0):
    """x mono ou estéreo; pan -1..1 (lei de potência constante)"""
    i0 = S(t)
    if i0 >= N: return
    if x.ndim == 1:
        a = (pan + 1) * math.pi / 4
        x = np.stack([x * math.cos(a), x * math.sin(a)], 1) * math.sqrt(2)
    x = x[:max(0, N - i0)] * ganho
    if i0 < 0: x = x[-i0:]; i0 = 0
    bus[i0:i0 + len(x)] += x
    if envio: rev[i0:i0 + len(x)] += x * envio

def env_adsr(L, a, d, s, r, sr=SR):
    L = int(L); a = max(1, int(a * sr)); d = max(1, int(d * sr)); r = max(1, int(r * sr))
    e = np.ones(L + r, np.float32) * s
    e[:a] = np.linspace(0, 1, a) if a <= L else np.linspace(0, 1, a)[:L + r][:a]
    if a + d <= L: e[a:a + d] = np.linspace(1, s, d)
    rel_ini = e[min(L - 1, len(e) - 1)]
    e[L:L + r] = np.linspace(rel_ini, 0, r) ** 1.5 if rel_ini > 0 else 0
    return e

def saw(f, L, fase=0.0):
    """dente de serra com polyBLEP (sem serrilhado)"""
    t = (np.arange(L) * (f / SR) + fase) % 1.0
    y = 2 * t - 1
    dt = f / SR
    m = t < dt; x = t[m] / dt; y[m] -= x + x - x * x - 1
    m = t > 1 - dt; x = (t[m] - 1) / dt; y[m] -= x * x + x + x + 1
    return y.astype(np.float32)

def sine(f, L, fase=0.0):
    return np.sin(2 * np.pi * (np.arange(L) * f / SR + fase)).astype(np.float32)

def glide(f0, f1, L, curva=1.0):
    k = np.linspace(0, 1, L) ** curva
    f = f0 * (f1 / f0) ** k
    return np.sin(2 * np.pi * np.cumsum(f) / SR).astype(np.float32)

def lp(x, fc, ordem=2):
    sos = signal.butter(ordem, min(0.499, fc / (SR / 2)) , 'low', output='sos'); return signal.sosfilt(sos, x, axis=0).astype(np.float32)
def hp(x, fc, ordem=2):
    sos = signal.butter(ordem, max(1e-4, fc / (SR / 2)), 'high', output='sos'); return signal.sosfilt(sos, x, axis=0).astype(np.float32)
def bp(x, f0, f1, ordem=2):
    sos = signal.butter(ordem, [max(1e-4, f0 / (SR / 2)), min(0.499, f1 / (SR / 2))], 'band', output='sos'); return signal.sosfilt(sos, x, axis=0).astype(np.float32)

def lp_varia(x, fcs, bloco=512):
    """passa-baixa que anda (fcs por amostra): blocos com estado contínuo (SVF de Chamberlin)"""
    y = np.zeros_like(x); low = 0.0; band = 0.0; q = 0.75
    # vetorizado por bloco com coeficiente fixo dentro do bloco
    for i in range(0, len(x), bloco):
        fc = float(np.mean(fcs[i:i + bloco])); f = 2 * math.sin(math.pi * min(fc, SR / 6) / SR)
        seg = x[i:i + bloco]
        out = np.empty_like(seg)
        for j in range(len(seg)):
            low += f * band; high = seg[j] - low - q * band; band += f * high; out[j] = low
        y[i:i + bloco] = out
    return y

def ruido(L, cor='branco'):
    w = rng.standard_normal(L).astype(np.float32)
    if cor == 'rosa':
        b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]; a = [1, -2.494956002, 2.017265875, -0.522189400]
        return (signal.lfilter(b, a, w) * 4).astype(np.float32)
    if cor == 'marrom':
        y = np.cumsum(w) ; y = y - signal.savgol_filter(y, 4001, 1) if L > 4001 else y - y.mean(); return (y / (np.abs(y).max() + 1e-6)).astype(np.float32)
    return w

# ---------- instrumentos
def pad(notas, t0, t1, vol=0.08, brilho=2200, ataque=1.6, solta=2.5, vozes=5, desafina=0.11, envio=0.5, pan_larg=0.7):
    L = S(t1 - t0); out = np.zeros((L + S(solta), 2), np.float32)
    e = env_adsr(L, ataque, 0.5, 0.85, solta)
    lfo = 1 + 0.25 * np.sin(2 * np.pi * 0.11 * np.arange(len(e)) / SR + rng.random() * 6)
    for k, m in enumerate(notas):
        for v in range(vozes):
            det = (v - (vozes - 1) / 2) / max(1, (vozes - 1) / 2) * desafina
            f = mtof(m + det)
            x = saw(f, len(e), rng.random())
            p = ((v / max(1, vozes - 1)) * 2 - 1) * pan_larg
            a = (p + 1) * math.pi / 4
            out[:, 0] += x * math.cos(a); out[:, 1] += x * math.sin(a)
    out = lp(out, brilho * 1.3, 2)
    out *= (e * lfo)[:, None] * vol / (len(notas) * math.sqrt(vozes))
    put(mus, t0, out, envio=envio)

def cordas(notas, t0, t1, vol=0.06, envio=0.6):
    """'cordas': serras desafinadas com vibrato lento, ataque longo"""
    L = S(t1 - t0); e = env_adsr(L, 2.2, 0.5, 0.9, 2.8)
    out = np.zeros((len(e), 2), np.float32)
    tt = np.arange(len(e)) / SR
    for k, m in enumerate(notas):
        for v in range(4):
            vib = 1 + 0.0035 * np.sin(2 * np.pi * (5.1 + v * 0.13) * tt + rng.random() * 6)
            f = mtof(m + (v - 1.5) * 0.06) * vib
            x = (2 * ((np.cumsum(f) / SR + rng.random()) % 1) - 1).astype(np.float32)
            p = (v / 3 * 2 - 1) * 0.6; a = (p + 1) * math.pi / 4
            out[:, 0] += x * math.cos(a); out[:, 1] += x * math.sin(a)
    out = lp(hp(out, 120), 2600, 2)
    put(mus, t0, out * (e[:, None] * vol / (len(notas) * 2)), envio=envio)

def pluck(m, t, dur=0.6, vol=0.12, pan=0.0, brilho=0.5, envio=0.25, eco=True):
    """corda dedilhada (Karplus-Strong, com o laço resolvido pelo lfilter)"""
    f = mtof(m); P = int(SR / f); L = S(dur + 0.6)
    exc = np.zeros(L, np.float32); burst = rng.standard_normal(P).astype(np.float32)
    burst = lp(burst, 1500 + 6000 * brilho, 1); exc[:P] = burst
    g = 0.996
    a = np.zeros(P + 2); a[0] = 1; a[P] = -g / 2; a[P + 1] = -g / 2
    y = signal.lfilter([1.0], a, exc).astype(np.float32)
    y *= env_adsr(S(dur), 0.002, 0.05, 1.0, 0.5)[:L] if S(dur) + S(0.5) >= L else 1
    y = y[:L] / (np.abs(y).max() + 1e-6)
    put(mus, t, y, pan=pan, ganho=vol, envio=envio)
    if eco:   # eco de colcheia pontuada, alternando lados
        for k, (d, gg) in enumerate([(0.75 * BEAT * 1, 0.38), (0.75 * BEAT * 2, 0.2), (0.75 * BEAT * 3, 0.1)]):
            put(mus, t + d, lp(y, 3000 - k * 800), pan=-pan if k % 2 == 0 else pan, ganho=vol * gg, envio=envio)

def baixo(m, t, dur, vol=0.16):
    L = S(dur); e = env_adsr(L, 0.01, 0.2, 0.75, 0.25)
    x = 0.8 * sine(mtof(m), len(e)) + 0.5 * lp(saw(mtof(m), len(e)), 900, 2)
    put(mus, t, x * e * vol)

def bumbo(t, vol=0.5):
    L = S(0.55); k = np.linspace(0, 1, L)
    f = 45 + 110 * np.exp(-k * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-k * 7.5)
    x[:S(0.004)] += rng.standard_normal(S(0.004)) * 0.3
    put(mus, t, np.tanh(x * 1.6).astype(np.float32) * vol)

def caixa(t, vol=0.2, envio=0.35, pan=0.0):
    L = S(0.35); k = np.linspace(0, 1, L)
    x = bp(ruido(L), 900, 7000) * np.exp(-k * 14) + 0.5 * sine(190, L) * np.exp(-k * 30)
    put(mus, t, x.astype(np.float32), pan=pan, ganho=vol, envio=envio)

def palma(t, vol=0.16, envio=0.4):
    L = S(0.3); out = np.zeros(L, np.float32)
    for d in (0, 0.009, 0.019, 0.028):
        i = S(d); seg = bp(ruido(L - i), 1100, 5200) * np.exp(-np.linspace(0, 1, L - i) * (60 if d < 0.028 else 12))
        out[i:] += seg
    put(mus, t, out, ganho=vol, envio=envio)

def chimbal(t, vol=0.05, aberto=False, pan=0.25):
    L = S(0.28 if aberto else 0.06); x = hp(ruido(L), 7500, 2) * np.exp(-np.linspace(0, 1, L) * (6 if aberto else 22))
    put(mus, t, x.astype(np.float32), pan=pan, ganho=vol, envio=0.08)

def tom(t, f0=110, vol=0.22, pan=0.0):
    L = S(0.7); k = np.linspace(0, 1, L)
    x = glide(f0 * 1.6, f0, L, 0.3) * np.exp(-k * 6)
    put(mus, t, x, pan=pan, ganho=vol, envio=0.3)

def impacto(t, vol=0.6, cauda=4.0):
    """o 'bum' de trailer: sub que despenca, estalo de ruído, cauda longa"""
    L = S(cauda); k = np.linspace(0, 1, L)
    sub = glide(110, 34, L, 0.35) * np.exp(-k * 3.6)
    corpo = glide(220, 70, L, 0.4) * np.exp(-k * 7) * 0.5
    crack = lp(ruido(L), 3200, 2) * np.exp(-k * 30)
    x = np.tanh((sub * 1.0 + corpo + crack * 1.2) * 1.2).astype(np.float32)
    x = hp(x, 32, 2)
    put(sfx, t, x, ganho=vol, envio=0.55)

def braam(t, dur=3.5, vol=0.16, raiz='D1'):
    L = S(dur); k = np.linspace(0, 1, L)
    out = np.zeros(L, np.float32)
    for m, g in ((n(raiz), 1.0), (n(raiz) + 12, 0.8), (n(raiz) + 19, 0.45), (n(raiz) + 24, 0.35)):
        for d in (-0.08, 0, 0.09): out += saw(mtof(m + d), L, rng.random()) * g
    fc = 180 + 2600 * np.exp(-k * 2.8) * np.clip(k * 30, 0, 1)
    y = lp_varia(out / 6, fc)
    y = np.tanh(y * 2.4) * np.exp(-k * 1.2) * np.clip(k * 40, 0, 1)
    put(sfx, t, y.astype(np.float32), ganho=vol, envio=0.5)

def riser(t0, t1, vol=0.12, f0=300, f1=6000):
    L = S(t1 - t0); k = np.linspace(0, 1, L)
    x = ruido(L); fc = f0 * (f1 / f0) ** (k ** 1.6)
    y = lp_varia(x, fc) * 0.6 + glide(f0 / 2, f1 / 6, L, 1.6) * 0.15
    e = k ** 2.4
    st = np.stack([y * e, np.roll(y, 240) * e], 1)
    put(sfx, t0, st.astype(np.float32), ganho=vol, envio=0.3)

def prato_reverso(t_fim, dur=1.6, vol=0.12):
    L = S(dur); k = np.linspace(0, 1, L)
    x = hp(ruido(L), 3500, 2) * (k ** 3.2)
    put(sfx, t_fim - dur, np.stack([x, np.roll(x, 300)], 1).astype(np.float32), ganho=vol, envio=0.35)

def whoosh(t_meio, dur=0.9, vol=0.16, de=-0.8, para=0.8, alto=False):
    L = S(dur); k = np.linspace(0, 1, L)
    e = np.exp(-((k - 0.55) / 0.22) ** 2)
    fc = (600 if not alto else 1500) * (1 + 5 * e)
    y = lp_varia(ruido(L), fc) * e
    pan = de + (para - de) * k
    a = (pan + 1) * np.pi / 4
    st = np.stack([y * np.cos(a), y * np.sin(a)], 1) * math.sqrt(2)
    put(sfx, t_meio - dur * 0.55, st.astype(np.float32), ganho=vol, envio=0.25)

def sino(m, t, vol=0.07, pan=0.0, dur=3.0, envio=0.5, razao=3.5, indice=2.2):
    L = S(dur); k = np.arange(L) / SR
    fc = mtof(m); I = indice * np.exp(-k * 2.5)
    x = np.sin(2 * np.pi * fc * k + I * np.sin(2 * np.pi * fc * razao * k)) * np.exp(-k * 1.6)
    put(mus, t, x.astype(np.float32), pan=pan, ganho=vol, envio=envio)

def brilho(t0, t1, notas, vol=0.025):
    """cintilância alta: senos com trêmulo, para a abertura e o fecho"""
    L = S(t1 - t0); e = env_adsr(L, 1.5, 0.2, 1.0, 2.0); tt = np.arange(len(e)) / SR
    out = np.zeros((len(e), 2), np.float32)
    for i, m in enumerate(notas):
        tr = 0.6 + 0.4 * np.sin(2 * np.pi * (3.1 + i * 0.7) * tt + i)
        x = sine(mtof(m), len(e)) * tr
        p = (i / max(1, len(notas) - 1)) * 1.6 - 0.8; a = (p + 1) * math.pi / 4
        out[:, 0] += x * math.cos(a); out[:, 1] += x * math.sin(a)
    put(mus, t0, out * e[:, None] * vol / len(notas), envio=0.7)

def bip(t, f=1800, vol=0.05, pan=0.3):
    L = S(0.09); k = np.linspace(0, 1, L)
    x = glide(f, f * 1.5, L, 0.5) * np.exp(-k * 9)
    put(sfx, t, x, pan=pan, ganho=vol, envio=0.2)

def tique(t, vol=0.03, pan=0.0):
    L = S(0.02); x = hp(ruido(L), 5000) * np.exp(-np.linspace(0, 1, L) * 20)
    put(sfx, t, x.astype(np.float32), pan=pan, ganho=vol, envio=0.1)

def rebobina(t0, t1, vol=0.12):
    """fita voltando: grãos de tom que caem, cada vez mais rápidos"""
    tt = t0; i = 0
    while tt < t1:
        k = (tt - t0) / (t1 - t0); d = 0.11 * (1 - 0.75 * k)
        L = S(d); f0 = 2400 - 1600 * k + 300 * math.sin(i)
        x = glide(f0, f0 * 0.55, L, 1.0) * np.hanning(L)
        put(sfx, tt, x.astype(np.float32), pan=math.sin(i * 0.7) * 0.6, ganho=vol * (0.6 + 0.4 * k), envio=0.2)
        tt += d * 0.8; i += 1
    L = S(t1 - t0); k = np.linspace(0, 1, L)
    fita = bp(ruido(L), 300, 3000) * (0.3 + 0.7 * k)
    put(sfx, t0, fita.astype(np.float32), ganho=vol * 0.35)

def cidade(t0, t1, vol=0.05):
    """trânsito ao longe e passarinho: a avenida viva, bem baixinho"""
    L = S(t1 - t0); k = np.linspace(0, 1, L)
    e = np.clip(k * (t1 - t0) / 0.8, 0, 1) * np.clip((1 - k) * (t1 - t0) / 0.8, 0, 1)
    hum = lp(ruido(L, 'marrom'), 380, 2) * 3 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * np.arange(L) / SR))
    st = np.stack([hum, np.roll(hum, 4800)], 1) * e[:, None]
    put(amb, t0, st.astype(np.float32), ganho=vol)
    tt = t0 + 0.6
    while tt < t1 - 1.0:   # carros passando
        d = 2.4; Lc = S(d); kc = np.linspace(0, 1, Lc)
        y = lp_varia(ruido(Lc), 700 + 1300 * np.exp(-((kc - .5) / .2) ** 2)) * np.exp(-((kc - .5) / .28) ** 2)
        pan = -0.9 + 1.8 * kc; a = (pan + 1) * np.pi / 4
        put(amb, tt, (np.stack([y * np.cos(a), y * np.sin(a)], 1) * 1.2).astype(np.float32), ganho=vol * 0.9)
        tt += 2.2 + rng.random() * 2.5
    tt = t0 + 1.1
    while tt < t1 - 0.5:   # passarinho
        for j in range(rng.integers(2, 5)):
            Lb = S(0.07); f0 = 3200 + rng.random() * 1800
            x = glide(f0, f0 * (1.25 + rng.random() * 0.3), Lb, 0.7) * np.hanning(Lb)
            put(amb, tt + j * 0.11, x.astype(np.float32), pan=0.6 - rng.random() * 1.2, ganho=vol * 0.22, envio=0.0)
        tt += 1.8 + rng.random() * 2.2

def subterraneo(t0, t1, vol=0.07):
    L = S(t1 - t0); k = np.linspace(0, 1, L); e = np.clip(k * (t1 - t0) / 1.5, 0, 1) * np.clip((1 - k) * (t1 - t0) / 1.5, 0, 1)
    x = lp(ruido(L, 'marrom'), 260, 2) * 3 + 0.25 * sine(mtof(n('D2')), L)
    put(amb, t0, np.stack([x, np.roll(x, 900)], 1).astype(np.float32) * e[:, None], ganho=vol)

def varredura_som(t0, t1, vol=0.08):
    L = S(t1 - t0); k = np.linspace(0, 1, L)
    y = lp_varia(ruido(L), 300 * (20 ** k)) * np.sin(np.pi * k) ** 0.7
    put(sfx, t0, np.stack([y, np.roll(y, 500)], 1).astype(np.float32), ganho=vol, envio=0.3)

# ---------- HARMONIA (Ré menor; fecho em Ré maior)
Dm9 = [n('D3'), n('A3'), n('C4'), n('E4'), n('F4')]
Bbmaj7 = [n('Bb2'), n('F3'), n('A3'), n('D4')]
Fadd9 = [n('F2'), n('C3'), n('G3'), n('A3'), n('C4')]
Cadd9E = [n('E2'), n('C3'), n('G3'), n('D4')]
Gm9 = [n('G2'), n('D3'), n('F3'), n('A3'), n('Bb3')]
Asus = [n('A2'), n('E3'), n('A3'), n('D4')]
Dmaj9 = [n('D3'), n('A3'), n('C#4'), n('E4'), n('F#4')]
Bbadd9 = [n('Bb2'), n('F3'), n('C4'), n('D4')]
Gadd9 = [n('G2'), n('D3'), n('A3'), n('B3')]
PROG1 = [Dm9, Bbmaj7, Fadd9, Cadd9E]
RAIZ = {id(Dm9): 'D2', id(Bbmaj7): 'Bb1', id(Fadd9): 'F1', id(Cadd9E): 'C2', id(Gm9): 'G1', id(Asus): 'A1', id(Dmaj9): 'D2', id(Bbadd9): 'Bb1', id(Gadd9): 'G1'}
ARP = {id(Dm9): ['D4', 'F4', 'A4', 'C5', 'E5', 'C5', 'A4', 'F4'], id(Bbmaj7): ['Bb3', 'D4', 'F4', 'A4', 'D5', 'A4', 'F4', 'D4'],
       id(Fadd9): ['F3', 'C4', 'G4', 'A4', 'C5', 'A4', 'G4', 'C4'], id(Cadd9E): ['E3', 'G3', 'C4', 'D4', 'G4', 'D4', 'C4', 'G3'],
       id(Gm9): ['G3', 'Bb3', 'D4', 'F4', 'A4', 'F4', 'D4', 'Bb3'], id(Asus): ['A3', 'D4', 'E4', 'A4', 'E5', 'A4', 'E4', 'D4'],
       id(Dmaj9): ['D4', 'F#4', 'A4', 'C#5', 'E5', 'C#5', 'A4', 'F#4'], id(Bbadd9): ['Bb3', 'D4', 'F4', 'C5', 'D5', 'C5', 'F4', 'D4'],
       id(Gadd9): ['G3', 'B3', 'D4', 'A4', 'B4', 'A4', 'D4', 'B3']}

def compasso_de(t): return round(t / BAR)

# ================= A PARTITURA (no tempo do filme)
a_planta, b_planta = T['planta']; a_rev, b_rev = T['revela']
a_av = T['avenida'][0]; a_orb = T['orbita'][0]; a_mer, b_mer = T['mergulho']; a_esq = T['esquina'][0]; a_par, b_par = T['sinal']
a_rx, b_rx = T['raiox']; a_bue = T['bueiro'][0]; a_cam, b_cam = T['camadas']; a_muro, b_muro = T['muro']
a_volta, b_volta = T['volta']; a_obra, b_obra = T['obra']; a_rdo, b_rdo = T['rdo']; a_dou, b_dou = T['dourado']; a_fim, b_fim = T['fim']

# --- ABERTURA: prancha (respiração, cintilância, tiques das estacas) → a cidade aparece
pad(Dm9, 0.0, a_rev + 2, vol=0.16, brilho=1200, ataque=2.5)
cordas([n('D2'), n('A2')], 0.5, a_rev + 1, vol=0.05)
brilho(0.4, b_rev, [n('A5'), n('E6'), n('F6'), n('C7')], vol=0.035)
for i in range(7): tique(a_planta + 0.7 + i * 0.28 + 0.15, vol=0.05, pan=-0.6 + i * 0.2); bip(a_planta + 0.7 + i * 0.28 + 0.15, f=1500 + i * 120, vol=0.022, pan=-0.6 + i * 0.2)
riser(3.2, a_rev - 0.05, vol=0.09, f0=250, f1=5000)
whoosh(a_rev + 0.1, dur=1.6, vol=0.12, de=-0.7, para=0.7)
pad(Bbmaj7, a_rev, a_rev + 3.2, vol=0.06, brilho=1300, ataque=1.2)
cordas([n('D2'), n('A2'), n('D3')], a_rev, b_rev + 0.5, vol=0.05)
prato_reverso(a_rev + 3.2, dur=1.8, vol=0.11)
impacto(a_rev + 3.2, vol=0.62); braam(a_rev + 3.2, dur=4.0, vol=0.15)
pad(Dm9, a_rev + 3.2, b_rev, vol=0.12, brilho=1700, ataque=0.3)
cordas([n('D3'), n('F3'), n('A3')], a_rev + 3.2, b_rev + 0.3, vol=0.06)
sino(n('A5'), a_rev + 3.25, vol=0.05, pan=0.3, dur=4); sino(n('D6'), a_rev + 3.9, vol=0.035, pan=-0.3, dur=4)
riser(b_rev - 2.0, b_rev - 0.02, vol=0.08, f0=400, f1=7000)

# --- ATO 1: a avenida — o pulso entra no clarão
impacto(a_av, vol=0.35, cauda=2.5); sino(n('D6'), a_av, vol=0.04, pan=0.4)
def secao_pulso(t0, t1, prog, kick=True, caixa_=True, chimbal_=True, arpejo=True, vol_pad=0.06, vol_arp=0.085, cordas_=False):
    tt = t0; c = 0
    while tt < t1 - 1e-6:
        ac = prog[c % len(prog)]; fim = min(t1, tt + BAR * 2)
        pad(ac, tt, fim, vol=vol_pad, brilho=1700, ataque=0.25, solta=1.2)
        if cordas_: cordas(ac[:3], tt, fim, vol=0.04)
        raiz = n(RAIZ[id(ac)])
        for b in range(int(round((fim - tt) / BEAT))):
            tb = tt + b * BEAT
            if b % 2 == 0: baixo(raiz, tb, BEAT * 1.6, vol=0.09)
            if kick and b % 4 == 0: bumbo(tb, vol=0.32)
            if kick and b % 8 == 6: bumbo(tb + BEAT * 0.5, vol=0.25)
            if caixa_ and b % 4 == 2: palma(tb, vol=0.12); caixa(tb, vol=0.09)
            if chimbal_: chimbal(tb + BEAT / 2, vol=0.035, pan=0.3); chimbal(tb, vol=0.018, pan=-0.2)
            if arpejo:
                seq = ARP[id(ac)]
                for h in range(2):
                    m = n(seq[(b * 2 + h) % len(seq)])
                    pluck(m, tb + h * BEAT / 2, dur=0.32, vol=vol_arp * (1.0 if h == 0 else 0.75), pan=0.35 if (b * 2 + h) % 2 else -0.35, brilho=0.45, eco=(h == 0 and b % 2 == 0))
        tt = fim; c += 1
secao_pulso(a_av, a_mer, PROG1, caixa_=True, chimbal_=False)
# o mergulho: zoom com whoosh, e a música abre o filtro descendo à rua
whoosh(a_mer, dur=0.8, vol=0.2, de=0.6, para=-0.6, alto=True); impacto(a_mer, vol=0.28, cauda=2)
secao_pulso(a_mer, a_esq, PROG1, chimbal_=True)
riser(a_esq - 2.5, a_esq - 0.02, vol=0.07)
# na rua: a batida sai, fica o dedilhado; a avenida respira
cidade(a_esq - 0.3, b_par + 0.2, vol=0.06)
secao_pulso(a_esq, a_par, [Gm9, Bbmaj7, Fadd9], kick=False, caixa_=False, chimbal_=False, vol_pad=0.05, vol_arp=0.07)
secao_pulso(a_par, b_par - BEAT, [Cadd9E], kick=True, caixa_=False, chimbal_=True, vol_pad=0.05)
prato_reverso(b_par, dur=1.2, vol=0.08)

# --- ATO 2: o que não se vê — o grave, o tique de prancheta, o raio X
impacto(a_rx, vol=0.55, cauda=4.5); braam(a_rx, dur=3.0, vol=0.10, raiz='D1')
subterraneo(a_rx, b_cam, vol=0.05)
varredura_som(a_rx + 1.0, a_rx + 4.5, vol=0.07)
pad([n('D2'), n('A2'), n('F3'), n('C4')], a_rx, b_muro + 0.6, vol=0.09, brilho=900, ataque=2.5)
tt = a_rx + 2 * BEAT
i = 0
while tt < b_muro - 0.1:
    tique(tt, vol=0.022 if i % 4 else 0.04, pan=0.4 if i % 2 else -0.4); tt += BEAT / 2; i += 1
for k, (m, dt) in enumerate([('D5', 0), ('F5', 1.5), ('A5', 3), ('E5', 4.5), ('C5', 6), ('D5', 7.5), ('A4', 9), ('F5', 10.5), ('E5', 12), ('D5', 13.5), ('A5', 15), ('C6', 16.5), ('A5', 18), ('F5', 19.5), ('E5', 21), ('D5', 22.5), ('A4', 24)]):
    if a_rx + 4 + dt < b_muro: sino(n(m), a_rx + 4 + dt, vol=0.035, pan=0.5 * math.sin(k), dur=3.5, razao=3.5, indice=1.4)
for i in range(3): bip(a_cam + 2.5 + i * 0.45 + 0.35, f=1200 + 300 * i, vol=0.045, pan=0.4)   # as chamadas das camadas
bip(a_rx + 4.6 + 0.35, f=1500, vol=0.04, pan=0.3)   # a chamada da galeria
whoosh(a_bue + 0.25, dur=1.0, vol=0.08)
for b in range(int((b_muro - a_bue) / BEAT)):
    if b % 4 == 0: bumbo(a_bue + b * BEAT, vol=0.2)
    if b % 8 == 4: tom(a_bue + b * BEAT, 90, vol=0.12, pan=-0.3)

# --- ATO 3: a obra no tempo — rebobina, depois constrói num crescendo
impacto(a_volta, vol=0.45, cauda=2.0); sino(n('A6'), a_volta, vol=0.04)
rebobina(a_volta + 0.05, b_volta - 0.05, vol=0.13)
riser(a_volta + 0.8, b_volta - 0.02, vol=0.08, f0=200, f1=4000)
impacto(a_obra, vol=0.5, cauda=3)
# crescendo: cada 2 compassos entra uma camada (como a obra: drenagem, guias, pavimento…)
PROG_OBRA = [Dm9, Bbmaj7, Gm9, Asus]
tt = a_obra; c = 0
while tt < b_obra - 1e-6:
    ac = PROG_OBRA[c % 4]; fim = min(b_obra, tt + BAR * 2); nivel = c / 3.5
    pad(ac, tt, fim, vol=0.05 + 0.02 * nivel, brilho=1200 + 1400 * nivel, ataque=0.2, solta=1.0)
    cordas(ac[:3], tt, fim, vol=0.03 + 0.02 * nivel)
    raiz = n(RAIZ[id(ac)])
    for b in range(int(round((fim - tt) / BEAT))):
        tb = tt + b * BEAT
        baixo(raiz, tb, BEAT * 0.9, vol=0.08 + 0.02 * nivel)
        bumbo(tb, vol=0.26 + 0.08 * min(1, nivel)) if (b % 2 == 0 or c >= 2) else None
        if c >= 1 and b % 2 == 1: palma(tb, vol=0.08 + 0.04 * nivel); caixa(tb, vol=0.06 + 0.04 * nivel)
        for h in range(4 if c >= 2 else 2):   # semicolcheias na reta final
            seq = ARP[id(ac)]; m = n(seq[(b * 4 + h) % len(seq)]) + (12 if c >= 3 and h % 2 else 0)
            pluck(m, tb + h * BEAT / (4 if c >= 2 else 2), dur=0.22, vol=0.06 + 0.02 * nivel, pan=0.4 if h % 2 else -0.4, brilho=0.5 + 0.3 * nivel, eco=False)
        chimbal(tb + BEAT / 2, vol=0.03 + 0.02 * nivel, aberto=(b % 4 == 3 and c >= 2))
        if c >= 3 and b % 2 == 1: tom(tb + BEAT / 2, 140 - (b % 4) * 20, vol=0.1)
    tt = fim; c += 1
riser(b_obra - 3.0, b_obra - 0.02, vol=0.10, f0=300, f1=9000)
prato_reverso(b_obra, dur=2.0, vol=0.12)
# a obra pronta: o maior impacto, e o RDO acende nota por nota
impacto(b_obra, vol=0.7, cauda=5); braam(b_obra, dur=4.5, vol=0.13, raiz='D1')
pad(Dmaj9, b_obra, b_rdo + 0.8, vol=0.07, brilho=2200, ataque=0.05)
cordas([n('D3'), n('A3'), n('F#4')], b_obra, b_rdo + 1.0, vol=0.05)
for k in range(10):
    sino(n(['D5', 'E5', 'F#5', 'A5', 'B5', 'C#6', 'D6', 'E6', 'F#6', 'A6'][k]), a_rdo + 0.5 + k * 0.36, vol=0.03, pan=-0.7 + k * 0.15, dur=2.5)

# --- ATO 4: o fecho dourado — Ré maior, largo
whoosh(a_dou, dur=1.4, vol=0.08)
PROG_FIM = [Bbadd9, Fadd9, Gadd9, Dmaj9]
tt = a_dou; c = 0
while tt < b_fim - 1e-6:
    ac = PROG_FIM[min(c, 3)]; fim = min(b_fim + 2.5, tt + BAR * 2 if c < 3 else b_fim + 2.5)
    pad(ac, tt, fim, vol=0.1, brilho=2000, ataque=0.8, solta=3)
    cordas(ac[:4], tt, fim, vol=0.075)
    baixo(n(RAIZ[id(ac)]), tt, min(BAR * 2, fim - tt), vol=0.1)
    seq = ARP[id(ac)]
    for b in range(int(round(min(BAR * 2, fim - tt) / BEAT))):
        pluck(n(seq[b % len(seq)]) + 12, tt + b * BEAT, dur=0.5, vol=0.045, pan=0.45 if b % 2 else -0.45, brilho=0.35)
    if c >= 3: break
    tt = fim; c += 1
# a melodia: poucas notas, no tempo largo
for m, dt, d in [('F#5', 0.0, 1.5), ('E5', 1.5, 0.5), ('D5', 2.0, 2.0), ('A4', 4.0, 1.5), ('B4', 5.5, 0.5), ('C#5', 6.0, 2.0), ('E5', 8.0, 1.0), ('F#5', 9.0, 3.0)]:
    if a_dou + dt < b_fim: sino(n(m), a_dou + dt, vol=0.05, pan=0.15, dur=d + 2.5, razao=2.0, indice=1.1)
t_tit = a_fim + 4.4
prato_reverso(t_tit, dur=2.2, vol=0.1)
impacto(t_tit, vol=0.55, cauda=6); sino(n('D6'), t_tit, vol=0.05, pan=-0.3, dur=6); sino(n('A6'), t_tit + 0.5, vol=0.035, pan=0.3, dur=6)
brilho(t_tit, DUR - 0.5, [n('D6'), n('A6'), n('F#6'), n('E7')], vol=0.018)
pad(Dmaj9, b_fim, DUR - 0.3, vol=0.1, brilho=1200, ataque=1.0, solta=3.0)

# ================= mixagem
def reverb_ir(seg=3.2):
    L = S(seg); k = np.linspace(0, 1, L)
    ir = np.zeros((L, 2), np.float32)
    for c in range(2):
        x = rng.standard_normal(L).astype(np.float32) * np.exp(-k * 6.5)
        x = lp(x, 6500, 1); ir[:, c] = x
    for d, g in ((0.011, 0.5), (0.019, 0.4), (0.027, 0.33), (0.041, 0.25)):   # primeiras reflexões
        ir[S(d), 0] += g; ir[S(d * 1.13), 1] += g
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))
ir = reverb_ir()
wet = np.stack([signal.fftconvolve(rev[:, c], ir[:, c])[:N] for c in range(2)], 1).astype(np.float32)
wet = hp(wet, 180)

def compressor(x, limiar=-18, razao=3.0, ataque=0.01, solta=0.2):
    lvl = np.sqrt(signal.lfilter([1 - math.exp(-1 / (SR * 0.02))], [1, -math.exp(-1 / (SR * 0.02))], (x ** 2).mean(1)) + 1e-12)
    db = 20 * np.log10(lvl + 1e-9)
    over = np.maximum(0, db - limiar); gr = -over * (1 - 1 / razao)
    # suaviza ganho (ataque/solta)
    g = np.empty_like(gr); cur = 0.0
    aa = math.exp(-1 / (SR * ataque)); rr = math.exp(-1 / (SR * solta))
    gr_s = signal.lfilter([1 - rr], [1, -rr], gr)   # aproximação barata
    return (x * (10 ** (gr_s / 20))[:, None]).astype(np.float32)

def biquad(tipo, f0, db, q=0.707):
    A = 10 ** (db / 40); w = 2 * math.pi * f0 / SR; al = math.sin(w) / (2 * q); c = math.cos(w)
    if tipo == 'graves':
        sq = 2 * math.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    else:   # sino
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    return np.array(b) / a[0], np.array(a) / a[0]
mix = mus * 1.0 + sfx * 0.95 + amb * 0.8 + wet * 0.42
mix = hp(mix, 30, 2)
for tipo, f0, db, q in (('graves', 90, -4.5, 0.707), ('sino', 2600, 2.5, 0.8), ('sino', 300, -1.5, 0.9)):
    b_, a_ = biquad(tipo, f0, db, q); mix = signal.lfilter(b_, a_, mix, axis=0).astype(np.float32)
mix = compressor(mix, limiar=-20, razao=2.2)
# fades antes da masterização: ela mede o que vai sair
fade = np.ones(N, np.float32); fi = S(DUR - 2.5); fade[fi:] = np.linspace(1, 0, N - fi) ** 2; mix *= fade[:, None]
fade_in = np.clip(np.arange(N) / S(0.08), 0, 1); mix *= fade_in[:, None]
# ---------- MASTER: −14 LUFS integrados (BS.1770-4) e pico verdadeiro abaixo de −1,5 dBTP já no AAC.
# A trilha tem impactos ~22 dB acima da média: o volume vem de ganho + limitador com olhar à frente e
# soltura suave (a redução forte fica só nos impactos), não de um loudnorm dinâmico, que "bombeia".
from scipy.ndimage import minimum_filter1d, uniform_filter1d
def lufs(x, sr=48000):
    """volume integrado BS.1770-4 (ponderação K, blocos de 400 ms com 75% de sobreposição, portões −70 e −10)"""
    assert sr == 48000
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]; a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]; a2 = [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    p = (y ** 2).sum(axis=1)
    c = np.concatenate([[0], np.cumsum(p)])
    ini = np.arange(0, len(p) - blk + 1, hop)
    z = (c[ini + blk] - c[ini]) / blk
    l = -0.691 + 10 * np.log10(z + 1e-20)
    z1 = z[l > -70]
    lr = -0.691 + 10 * np.log10(z1.mean() + 1e-20) - 10
    z2 = z1[(-0.691 + 10 * np.log10(z1 + 1e-20)) > lr]
    return -0.691 + 10 * np.log10(z2.mean() + 1e-20)

def pico_verdadeiro(x):
    """pico com sobreamostragem 4× (o que o conversor do aparelho vai ver)"""
    return 20 * math.log10(np.abs(signal.resample_poly(x, 4, 1, axis=0)).max() + 1e-12)

def limitar(x, teto_db=-1.8, olhar_ms=5, solta_ms=140, sr=48000):
    """limitador com olhar à frente, em blocos de 1 ms: ataque dentro do olhar, soltura exponencial"""
    teto = 10 ** (teto_db / 20)
    ov = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(axis=1)
    n = len(x); ov = ov[:n * 4].reshape(n, 4).max(axis=1)        # pico verdadeiro por amostra
    r = np.minimum(1.0, teto / np.maximum(ov, 1e-9))
    B = sr // 1000; nb = int(math.ceil(n / B))
    rb = np.ones(nb * B); rb[:n] = r; rb = rb.reshape(nb, B).min(axis=1)
    L = olhar_ms
    gmin = minimum_filter1d(rb, size=L + 1, origin=-(L // 2))     # o mínimo de agora até L blocos à frente
    k = 1 - math.exp(-1.0 / solta_ms)
    g = np.empty(nb); cur = 1.0
    for i in range(nb):
        cur = min(gmin[i], cur + (1 - cur) * k); g[i] = cur
    gs = uniform_filter1d(g, size=L, origin=(L - 1) // 2)          # média dos L blocos que terminam aqui
    gs = np.minimum(gs, g)
    t = (np.arange(nb) + 0.5) * B
    gn = np.interp(np.arange(n), t, gs)
    return (x * gn[:, None]).astype(np.float32), gn

def masterizar(x, alvo=-14.0, teto_tp=-1.5, sr=48000, log=print):
    i0 = lufs(x, sr); ganho = alvo - i0; teto = teto_tp - 0.3
    for it in range(5):
        y, gn = limitar(x * 10 ** (ganho / 20), teto, sr=sr)
        i1 = lufs(y, sr); tp = pico_verdadeiro(y)
        if tp > teto_tp: teto -= (tp - teto_tp) + 0.05; continue
        log(f'  master {it}: ganho {ganho:+.2f} dB · {i1:.2f} LUFS · pico verdadeiro {tp:.2f} dBTP · redução máx {20 * math.log10(gn.min()):.1f} dB')
        if abs(i1 - alvo) < 0.1: break
        ganho += alvo - i1
    return y

# teto de −2,7 dBTP no WAV: o AAC da entrega passa ~1 dB por cima do original e tem de ficar abaixo de −1,5
mix = masterizar(mix[:S(DUR)], -14.0, -2.7, SR)
mix = mix[:S(DUR)]
saida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQ, 'trilha.wav')
from scipy.io import wavfile
wavfile.write(saida, SR, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
print('trilha', round(DUR, 2), 's ·', round(lufs(mix, SR), 2), 'LUFS · pico verdadeiro', round(pico_verdadeiro(mix), 2), 'dBTP ->', saida)
