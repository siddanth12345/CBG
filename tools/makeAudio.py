#!/usr/bin/env python3
"""Procedural audio for Cool Battle Game: python3 tools/makeAudio.py [music|sfx|all]
Music: fast, heavy, industrial-metal / hardcore-synth loops in the spirit of ULTRAKILL (double-kick drums, distorted guitars,
screaming leads, sidechained synths). SFX: punchy, layered Smash-style hits and whooshes with a neon-industrial edge.
Writes audio/bgm/*.wav (32 kHz mono loops), audio/sfx/*.wav and audio/f/*.wav (44.1 kHz)."""
import os, sys, wave, zlib
import numpy as np
from scipy import signal

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')
MSR, FSR = 32000, 44100


def save(path, x, sr, peak=0.92):
    x = np.nan_to_num(x)
    m = np.abs(x).max()
    if m > 0: x = x / m * peak
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x * 32767).astype('<i2').tobytes())


def hz(n): return 440.0 * 2 ** ((n - 69) / 12.0)
def drive(x, g): return np.tanh(x * g) / np.tanh(g)


def lp(x, f, sr, o=2):
    b, a = signal.butter(o, min(f, sr * 0.45) / (sr / 2), 'low'); return signal.lfilter(b, a, x)
def hp(x, f, sr, o=2):
    b, a = signal.butter(o, f / (sr / 2), 'high'); return signal.lfilter(b, a, x)
def bp(x, f0, f1, sr, o=2):
    b, a = signal.butter(o, [f0 / (sr / 2), min(f1, sr * 0.45) / (sr / 2)], 'band'); return signal.lfilter(b, a, x)
def peak(x, f, q, sr):
    b, a = signal.iirpeak(f / (sr / 2), q); return signal.lfilter(b, a, x)


def osc(kind, f, n, sr, ph0=0.0):
    """f may be a scalar or an array (per-sample frequency)"""
    f = np.broadcast_to(np.asarray(f, float), (n,))
    ph = ph0 + np.cumsum(f) / sr
    if kind == 'sin': return np.sin(2 * np.pi * ph)
    if kind == 'saw': return 2 * (ph % 1) - 1
    if kind == 'sq': return np.where((ph % 1) < 0.5, 1.0, -1.0)
    if kind == 'pulse': return np.where((ph % 1) < 0.25, 1.0, -1.0)
    if kind == 'tri': return 2 * np.abs(2 * (ph % 1) - 1) - 1
    raise ValueError(kind)


def noise(n, rng): return rng.standard_normal(n)
def dec(n, sr, tau): return np.exp(-np.arange(n) / (tau * sr))
def adsr(n, sr, a, d, s, r):
    e = np.ones(n) * s
    na, nd, nr = int(a * sr), int(d * sr), int(r * sr)
    na = min(na, n)
    if na: e[:na] = np.linspace(0, 1, na)
    nd = min(nd, max(0, n - na))
    if nd: e[na:na + nd] = np.linspace(1, s, nd)
    nr = min(nr, n)
    if nr: e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def add(buf, i, x, g=1.0):
    if i >= len(buf): return
    j = min(len(buf), i + len(x)); buf[i:j] += x[:j - i] * g


def reverb(x, sr, mix=0.25, size=0.6, rng=None):
    rng = rng or np.random.default_rng(5)
    n = int(sr * size); ir = noise(n, rng) * np.exp(-np.arange(n) / (n * 0.28)); ir = lp(ir, 5000, sr)
    ir[0] = 0; wet = signal.fftconvolve(x, ir)[:len(x)]
    return x + wet / (np.abs(wet).max() + 1e-9) * np.abs(x).max() * mix


def echo(x, sr, t, fb=0.35, mix=0.35, n=3):
    out = x.copy(); d = int(t * sr)
    for k in range(1, n + 1):
        if d * k < len(x): out[d * k:] += x[:len(x) - d * k] * (fb ** k) * mix * 2
    return out


# ------------------------------------------------------------------ drum / instrument one-shots (sr = MSR unless given)
def kick(sr, rng, tight=0.13, f0=200, f1=46):
    n = int(sr * 0.32); t = np.arange(n) / sr
    f = f1 + (f0 - f1) * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t / tight)
    click = hp(noise(n, rng), 2500, sr) * np.exp(-t / 0.004) * 0.55
    return drive(body * 1.4 + click, 2.2)


def snare(sr, rng):
    n = int(sr * 0.36); t = np.arange(n) / sr
    nz = bp(noise(n, rng), 1200, 9000, sr) * np.exp(-t / 0.085)
    tone = np.sin(2 * np.pi * np.cumsum(190 + 90 * np.exp(-t / 0.02)) / sr) * np.exp(-t / 0.07) * 0.8
    return drive(nz * 1.5 + tone, 2.0)


def hat(sr, rng, open_=False):
    n = int(sr * (0.28 if open_ else 0.06)); t = np.arange(n) / sr
    return hp(noise(n, rng), 7000, sr) * np.exp(-t / (0.12 if open_ else 0.018)) * 0.5


def crash(sr, rng, length=2.4):
    n = int(sr * length); t = np.arange(n) / sr
    return hp(noise(n, rng), 3500, sr) * np.exp(-t / 0.7) * 0.6


def tom(sr, rng, f=110):
    n = int(sr * 0.4); t = np.arange(n) / sr
    return drive(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.6 * np.exp(-t / 0.04))) / sr) * np.exp(-t / 0.16), 1.6)


def clank(sr, rng):
    n = int(sr * 0.35); t = np.arange(n) / sr
    x = sum(np.sin(2 * np.pi * f * t + k) * np.exp(-t / d) for k, (f, d) in enumerate([(420, .09), (1130, .06), (1870, .05), (2650, .03)]))
    return drive(x * 0.5 + hp(noise(n, rng), 3000, sr) * np.exp(-t / 0.01), 2.5)


# ------------------------------------------------------------------ the composer
SCALES = {
    'phrygian': [0, 1, 3, 5, 7, 8, 10], 'harmonic': [0, 2, 3, 5, 7, 8, 11], 'minor': [0, 2, 3, 5, 7, 8, 10],
    'lydian': [0, 2, 4, 6, 7, 9, 11], 'major': [0, 2, 4, 5, 7, 9, 11], 'dorian': [0, 2, 3, 5, 7, 9, 10],
}
# 16-step riff cells: semitone offsets from the bar's root; None = rest. (gallops, chugs, stabs)
CELLS = [
    [0, 0, None, 0, 0, None, 0, 0, 3, None, 0, 0, 1, None, 0, None],
    [0, None, 0, 0, None, 0, 0, None, 0, 0, 5, None, 3, None, 1, 0],
    [0, 0, 0, None, 0, 0, 0, None, 7, 7, None, 0, 0, None, 6, None],
    [0, 0, None, 0, 0, 0, None, 0, 0, 0, None, 3, 3, None, 5, 5],
    [0, None, None, 0, None, 0, None, None, 0, None, 0, 0, None, 0, None, 7],
    [0, None, 0, None, 3, None, 0, None, 5, None, 0, None, 7, None, 5, 3],            # 5: syncopated stabs
    [0, 0, 12, 0, 0, 10, 0, 0, 7, 0, 0, 5, 0, 3, 0, 1],                               # 6: octave-jump industrial grind
    [0, None, None, 7, None, None, 5, None, 3, None, None, 5, None, 7, None, None],   # 7: wide, slow-burn heroic
    [0, 7, 0, 7, 12, 7, 0, 7, 3, 10, 3, 10, 15, 10, 3, 10],                           # 8: bright fifths run
]


def compose(cfg, seed):
    rng = np.random.default_rng(seed)
    sr = MSR; bpm = cfg['bpm']; step = 60.0 / bpm / 4; bars = 24; spb = 16
    total = int(sr * step * spb * bars); tail = int(sr * 3); N = total + tail
    sc = SCALES[cfg['scale']]; root = cfg['root']
    tr = {k: np.zeros(N) for k in ('kick', 'drums', 'bass', 'gtr', 'lead', 'arp', 'pad', 'fx')}
    S = lambda bar, st: int((bar * spb + st) * step * sr)
    K, SN, HH, HO, CR, TM, CL = kick(sr, rng), snare(sr, rng), hat(sr, rng), hat(sr, rng, True), crash(sr, rng), tom(sr, rng), clank(sr, rng)
    kicks = []   # sample positions, for sidechain

    def kk(i, g=1.0): add(tr['kick'], i, K, g); kicks.append(i)

    # ---- section map (24 bars): intro 0-3, riff A 4-11, breakdown 12-15, section B 16-23 (leads + max energy)
    secs = cfg.get('secs') or (['intro'] * 4 + ['A'] * 8 + ['brk'] * 4 + ['B'] * 8)
    secidx = [len([j for j in range(i) if secs[j] == secs[i]]) for i in range(bars)]      # how many bars of this section came before
    prog = cfg.get('prog', [0, 0, 3, 1])                          # root shift (semitones) per bar of a 4-bar phrase
    cellA = [CELLS[i] for i in cfg['cells']]
    for bar in range(bars):
        sec = secs[bar]; b0 = bar * spb; shift = prog[bar % 4] if sec != 'brk' else [0, 0, -2, -4][bar % 4]
        cell = cellA[(bar // 2) % len(cellA)] if sec != 'brk' else CELLS[4]
        # --- drums
        if sec == 'intro':
            for s in range(0, 16, 4): kk(S(bar, s), 0.8)
            for s in range(0, 16, 2): add(tr['drums'], S(bar, s), HH, 0.5 + 0.2 * (bar / 4))
            if bar >= 2:
                for s in (4, 12): add(tr['drums'], S(bar, s), SN, 0.9)
        elif sec == 'brk':
            for s in (0, 6, 10): kk(S(bar, s), 1.0)
            add(tr['drums'], S(bar, 8), SN, 1.1)
            add(tr['drums'], S(bar, 8), CR if bar % 2 == 0 else CL, 0.5)
            for s in range(0, 16, 4): add(tr['drums'], S(bar, s), HO if s == 12 else HH, 0.6)
            if bar == 15:
                for j, s in enumerate(range(8, 16)): add(tr['drums'], S(bar, s), SN, 0.5 + 0.07 * j)
        else:
            feel = cfg.get('feel', 'metal')
            fast = cfg.get('double', True) and (sec == 'B' or bar % 4 >= 2)
            if feel == 'break':        # breakbeat: syncopated kicks, ghost snares, rolling 16th hats
                for s in ([0, 6, 10, 11] if bar % 2 == 0 else [0, 3, 6, 10, 14]): kk(S(bar, s), 1.0 if s in (0, 10) else 0.75)
                for s in (4, 12): add(tr['drums'], S(bar, s), SN, 1.15)
                for s in (7, 9, 15) if bar % 2 else (7, 15): add(tr['drums'], S(bar, s), SN, 0.35)
                for s in range(16): add(tr['drums'], S(bar, s), HH, 0.55 if s % 2 else 0.35)
                if sec == 'B' and bar % 2: add(tr['drums'], S(bar, 14), HO, 0.6)
            elif feel == 'four':       # driving four-on-the-floor with off-beat open hats and claps: heroic and pumping
                for s in (0, 4, 8, 12): kk(S(bar, s), 1.0)
                if sec == 'B':
                    for s in (14,): kk(S(bar, s), 0.7)
                for s in (4, 12): add(tr['drums'], S(bar, s), SN, 1.0)
                for s in (2, 6, 10, 14): add(tr['drums'], S(bar, s), HO, 0.45)
                for s in range(1, 16, 2): add(tr['drums'], S(bar, s), HH, 0.3)
                if bar % 4 == 0: add(tr['drums'], S(bar, 0), CR, 0.6)
            elif feel == 'halftime':   # massive half-time stomp: kick 1 and the 'and' of 3, one huge snare on 3
                for s in (0, 10) + ((6,) if sec == 'B' else ()): kk(S(bar, s), 1.1)
                add(tr['drums'], S(bar, 8), SN, 1.3); add(tr['drums'], S(bar, 8), CL, 0.5)
                for s in range(0, 16, 2): add(tr['drums'], S(bar, s), HH, 0.45 if s % 4 else 0.65)
                if sec == 'B':
                    for s in (3, 7, 11, 15): add(tr['drums'], S(bar, s), TM, 0.4)
            else:
                kp = list(range(0, 16, 2)) if fast else [0, 3, 6, 8, 10, 12 + (bar % 2) * 2]
                if feel == 'gallop' and not fast: kp = [0, 2, 3, 6, 8, 10, 11, 14]
                if cfg.get('gallop') and not fast: kp = [0, 2, 3, 6, 8, 10, 11, 14]
                for s in kp: kk(S(bar, s), 1.0 if s % 4 == 0 else 0.8)
                for s in (4, 12): add(tr['drums'], S(bar, s), SN, 1.15)
                for s in range(0, 16, 2): add(tr['drums'], S(bar, s), HH, 0.5 if s % 4 else 0.7)
            if bar % 8 == 0 and feel in ('metal', 'gallop'): add(tr['drums'], S(bar, 0), CR, 0.9)
            if bar % 4 == 3 and feel != 'halftime':
                for j, s in enumerate(range(12, 16)): add(tr['drums'], S(bar, s), SN if j % 2 else TM, 0.7)
        if bar in (0, 4, 12, 16): add(tr['drums'], S(bar, 0), CR, 0.8 if bar else 0.5)
        # --- guitars + bass
        if sec != 'intro' or bar >= 2:
            for s, off in enumerate(cell):
                if off is None: continue
                m = cfg['gtr'] + shift + off; f = hz(m)
                ln = int(step * sr * (0.85 if sec != 'brk' else 1.9))
                t = np.arange(ln) / sr
                g = sum(osc('saw', f * (1 + d), ln, sr, rng.random()) for d in (-0.004, 0.0, 0.004)) / 3
                g += 0.8 * sum(osc('saw', f * 1.5 * (1 + d), ln, sr, rng.random()) for d in (-0.003, 0.003)) / 2
                g += 0.6 * osc('saw', f * 2, ln, sr, rng.random())
                e = np.minimum(1, t / 0.003) * np.exp(-t / (0.11 if sec != 'brk' else 0.28))
                add(tr['gtr'], S(bar, s), g * e, 1.0)
                bl = osc('saw', f, ln, sr) * 0.55 + osc('sin', f, ln, sr) * 0.9      # fundamental one octave up from the old sub so small speakers still carry the riff
                add(tr['bass'], S(bar, s), bl * np.minimum(1, t / 0.004) * np.exp(-t / (0.16 if sec != 'brk' else 0.35)), 1.0)
        # --- arps / pads (synth colour)
        arp = cfg.get('arp')
        if arp and sec in ('intro', 'A', 'B'):
            chord = [0, 7, 12, 15 if cfg['scale'] in ('minor', 'harmonic', 'phrygian', 'dorian') else 16]
            for s in range(16):
                m = cfg['gtr'] + 24 + shift + chord[(s * (3 if sec == 'B' else 1)) % 4] + (12 if (s % 8) >= 4 and sec == 'B' else 0)
                ln = int(step * sr * 0.9); t = np.arange(ln) / sr
                a = osc(arp, hz(m), ln, sr) * np.exp(-t / 0.07) * np.minimum(1, t / 0.002)
                add(tr['arp'], S(bar, s), a, 0.8)
        if cfg.get('pad') and sec != 'brk':
            ln = int(step * spb * sr); t = np.arange(ln) / sr
            chord = [0, 7, 12, 19] if cfg['scale'] not in ('major', 'lydian') else [0, 4, 7, 12, 16]
            p = np.zeros(ln)
            for c in chord:
                for d in (-0.006, 0, 0.007): p += osc('saw', hz(cfg['gtr'] + 12 + shift + c) * (1 + d), ln, sr, rng.random())
            p = lp(p / (3 * len(chord)), 1800 if sec != 'B' else 3200, sr) * np.minimum(1, t / 0.4) * np.minimum(1, (ln / sr - t) / 0.3)
            add(tr['pad'], b0 * int(step * sr), p, 0.9)
        # --- lead (section B always; A for 'lead_in_A' tracks)
        if sec == 'B' or (cfg.get('lead_a') and sec == 'A' and secidx[bar] >= 4):
            if secidx[bar] % 2 == 0:
                mot = cfg['motifs'][((secidx[bar] if sec == 'B' else secidx[bar] - 4) // 2) % len(cfg['motifs'])]
                pos = 0
                for deg, ln_ in mot:
                    oct_ = 12 * (deg // 7); m = cfg['gtr'] + 24 + shift + oct_ + sc[deg % 7]
                    L = int(ln_ * step * sr * 1.02) + int(step * sr * 0.4)
                    t = np.arange(L) / sr; vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.25)
                    lk = cfg.get('leadk', 'saw')
                    if lk == 'sq': ldn = osc('sq', hz(m) * vib, L, sr) * 0.55 + osc('pulse', hz(m) * vib * 2.004, L, sr) * 0.3
                    elif lk == 'fm': ldn = np.sin(2 * np.pi * np.cumsum(hz(m) * vib) / sr + 2.4 * np.sin(2 * np.pi * np.cumsum(hz(m) * vib * 2) / sr) * np.exp(-t / 0.35)) * 0.9
                    elif lk == 'tri': ldn = osc('tri', hz(m) * vib, L, sr) * 0.9 + osc('saw', hz(m) * vib * 1.002, L, sr) * 0.3
                    else: ldn = osc('saw', hz(m) * vib, L, sr) * 0.7 + osc('sq', hz(m) * vib * 1.003, L, sr) * 0.4
                    add(tr['lead'], S(bar, pos), ldn * adsr(L, sr, 0.004, 0.05, 0.85, 0.08), 1.0)
                    pos += ln_
        # --- fx: risers into sections, impacts
        if bar + 1 < bars and secs[bar + 1] != sec:           # a riser into every section change
            n = int(sr * step * spb); t = np.arange(n) / sr
            r = hp(noise(n, rng), 300 + 5000 * (t / t[-1]) ** 2, sr) if False else noise(n, rng) * (t / t[-1]) ** 2
            r = bp(r, 800, 9000, sr) * 1.2
            add(tr['fx'], S(bar, 0), r, 0.7)

    # ---- sidechain (pads / arps / lead duck on every kick)
    sc_env = np.ones(N)
    for i in kicks:
        d = int(sr * 0.16); k = np.arange(min(d, N - i)); sc_env[i:i + len(k)] = np.minimum(sc_env[i:i + len(k)], 0.35 + 0.65 * (k / d) ** 1.5)

    # ---- per-track processing
    gt = drive(tr['gtr'], 9.0); gt = bp(gt, 90, 5200, sr); gt = peak(gt, 1700, 1.2, sr) * 0.8
    bs = drive(tr['bass'], 3.0); bs = lp(bs, 700, sr, 3)
    ld = drive(tr['lead'], 2.8); ld = echo(lp(ld, 7500, sr), sr, step * 3, 0.38, 0.4)
    ar = echo(lp(tr['arp'], 9000, sr), sr, step * 3, 0.4, 0.45)
    pd = tr['pad']; fxx = tr['fx']
    dr = tr['drums']; ki = tr['kick']
    ki = hp(ki, 38, sr, 2); bs = hp(bs, 45, sr, 2)
    mix = (ki * 1.0 + dr * 1.0 + gt * 2.1 + bs * 0.55 + (ld * 1.1 + ar * 0.6 + pd * 0.5) * sc_env + fxx * 0.6)
    # pump + glue
    mix = drive(mix, 1.35)
    mix = reverb(mix, sr, 0.12, 0.5)
    mix = drive(mix * 1.1, 1.4)
    out = mix[:total].copy(); out[:tail] += mix[total:total + tail]   # fold the tail over the start: seamless loop
    out = hp(out, 28, sr, 1)
    return out


TRACKS = {
    '01_title_start_screen': dict(bpm=178, scale='harmonic', root=40, gtr=40, cells=[0, 3, 1, 2], arp='sq', pad=True, motifs=[
        [(7, 4), (6, 2), (4, 2), (5, 4), (4, 2), (2, 2), (3, 8), (0, 8)], [(7, 4), (9, 2), (7, 2), (6, 4), (4, 2), (6, 2), (4, 8), (3, 4), (4, 4)],
        [(4, 2), (4, 2), (7, 4), (6, 2), (4, 2), (5, 4), (2, 4), (4, 12)], [(9, 4), (8, 2), (7, 2), (6, 4), (7, 4), (4, 4), (6, 4), (7, 4)]], lead_a=True, prog=[0, 0, 3, 5]),
    '02_duel_1v1': dict(bpm=186, scale='phrygian', root=38, gtr=38, cells=[1, 0, 3, 2], arp='pulse', pad=False, gallop=True, motifs=[
        [(7, 2), (7, 2), (8, 4), (7, 2), (6, 2), (4, 4), (3, 4), (4, 12)], [(4, 2), (6, 2), (7, 4), (8, 4), (7, 2), (6, 2), (4, 4), (3, 8)],
        [(8, 4), (9, 4), (8, 2), (7, 2), (6, 4), (7, 12)], [(4, 4), (3, 2), (4, 2), (6, 4), (4, 4), (3, 4), (1, 4), (3, 6)]], prog=[0, 0, 1, 3]),
    '03_stage_frontier': dict(bpm=176, scale='minor', root=42, gtr=42, cells=[5, 6, 7, 2], arp='pulse', pad=True, feel='break', leadk='sq',
        secs=['intro'] * 2 + ['A'] * 6 + ['brk'] * 2 + ['B'] * 6 + ['A'] * 4 + ['brk'] * 2 + ['B'] * 2,
        motifs=[[(4, 3), (4, 3), (7, 2), (6, 3), (4, 2), (2, 3)], [(7, 3), (7, 1), (6, 2), (4, 3), (4, 3), (2, 2), (4, 2)],
                [(9, 2), (7, 3), (6, 3), (4, 3), (6, 2), (7, 3)], [(2, 3), (4, 3), (7, 3), (6, 1), (4, 2), (2, 2), (0, 2)]], prog=[0, 5, -2, 3]),
    '04_stage_frontier_big': dict(bpm=160, scale='phrygian', root=36, gtr=36, cells=[3, 6, 0, 4], arp='sq', pad=True, feel='halftime', leadk='saw',
        secs=['intro'] * 4 + ['brk'] * 4 + ['A'] * 8 + ['B'] * 8,
        motifs=[[(11, 12), (10, 4)], [(7, 6), (8, 2), (7, 4), (6, 4)], [(9, 8), (11, 8)], [(4, 4), (6, 4), (7, 4), (6, 4)]], prog=[0, 0, 1, 0]),
    '05_stage_horizon': dict(bpm=172, scale='lydian', root=45, gtr=45, cells=[8, 7, 3, 1], arp='tri', pad=True, feel='gallop', leadk='tri',
        secs=['intro'] * 2 + ['A'] * 4 + ['B'] * 6 + ['brk'] * 2 + ['B'] * 6 + ['A'] * 4,
        motifs=[[(7, 2), (9, 2), (11, 4), (9, 2), (7, 2), (4, 4)], [(11, 3), (11, 1), (12, 4), (14, 4), (12, 2), (11, 2)],
                [(14, 2), (12, 2), (11, 2), (9, 2), (7, 4), (9, 4)], [(4, 2), (7, 2), (9, 2), (11, 2), (14, 8)]], lead_a=False, prog=[0, 7, 9, 5]),
    '06_stage_horizon_big': dict(bpm=168, scale='major', root=40, gtr=40, cells=[7, 8, 2, 5], arp='sq', pad=True, feel='four', leadk='fm',
        secs=['intro'] * 4 + ['A'] * 4 + ['B'] * 8 + ['brk'] * 4 + ['B'] * 4,
        motifs=[[(7, 6), (9, 2), (11, 8)], [(14, 4), (12, 2), (11, 2), (9, 8)], [(11, 4), (12, 4), (14, 8)], [(9, 2), (11, 2), (12, 4), (11, 4), (9, 4)]], prog=[0, 5, 9, 7]),
}


def music():
    for i, (name, cfg) in enumerate(TRACKS.items()):
        x = compose(cfg, 100 + i)
        save(os.path.join(ROOT, 'bgm', name.replace('01_title_start_screen', '01_title_start_screen') + '.wav'), x, MSR, 0.93)
        print('music', name, round(len(x) / MSR, 1), 's rms', round(float(np.sqrt((x ** 2).mean())) / np.abs(x).max() * 0.93, 3))


# ------------------------------------------------------------------ sound effects
def tone_sweep(kind, f0, f1, n, sr, curve=2.0):
    t = np.linspace(0, 1, n); f = f1 + (f0 - f1) * (1 - t) ** curve if f1 < f0 else f0 + (f1 - f0) * t ** (1 / curve)
    return osc(kind, f, n, sr)


def fin(x, sr, rev=0.0):
    x = x * np.minimum(1, np.arange(len(x)) / (sr * 0.001))
    if rev: x = reverb(np.concatenate([x, np.zeros(int(sr * 0.4))]), sr, rev, 0.35)
    return x


def sfx_core(rng):
    sr = FSR; out = {}
    def T(d): return np.arange(int(sr * d)) / sr
    # hit_light: thump + crack + "tok"
    n = int(sr * 0.2); t = np.arange(n) / sr
    x = np.sin(2 * np.pi * np.cumsum(60 + 220 * np.exp(-t / 0.02)) / sr) * np.exp(-t / 0.06) * 1.0
    x += hp(noise(n, rng), 1800, sr) * np.exp(-t / 0.018) * 0.9 + bp(noise(n, rng), 500, 3000, sr) * np.exp(-t / 0.04) * 0.6
    x += osc('sq', 520 * np.exp(-t / 0.05) + 180, n, sr) * np.exp(-t / 0.03) * 0.3
    out['hit_light'] = fin(drive(x, 2.2), sr)
    # hit_heavy: boom + crunch + clang
    n = int(sr * 0.7); t = np.arange(n) / sr
    x = np.sin(2 * np.pi * np.cumsum(38 + 160 * np.exp(-t / 0.05)) / sr) * np.exp(-t / 0.22) * 1.3
    cr = lp(noise(n, rng), 7000 * np.exp(-t / 0.2).mean(), sr) * np.exp(-t / 0.09)
    x += drive(cr, 4) * 0.8 + hp(noise(n, rng), 2500, sr) * np.exp(-t / 0.012)
    x += sum(np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, d in [(310, .25), (930, .16), (1640, .1)]) * 0.25
    out['hit_heavy'] = fin(drive(x, 2.4), sr, 0.18)
    # jump: rising "hup"
    n = int(sr * 0.16); t = np.arange(n) / sr
    x = osc('tri', 260 + 520 * (t / t[-1]) ** 0.7, n, sr) * np.exp(-t / 0.08) + 0.4 * osc('sq', 520 + 1040 * (t / t[-1]) ** 0.7, n, sr) * np.exp(-t / 0.04)
    x += bp(noise(n, rng), 1500, 5000, sr) * np.exp(-t / 0.03) * 0.4
    out['jump'] = fin(x, sr)
    # dash: sharp whoosh
    n = int(sr * 0.26); t = np.arange(n) / sr; u = t / t[-1]
    nz = noise(n, rng); w = np.zeros(n)
    for k in range(0, n, 256):
        c = 500 + 4500 * np.sin(np.pi * min(1, k / n)) ** 1.2
        w[k:k + 256] = bp(nz[max(0, k - 128):k + 384], c * 0.6, c * 1.5, sr, 2)[min(k, 128):min(k, 128) + len(w[k:k + 256])]
    x = w * np.sin(np.pi * u) ** 0.7 * 2.2 + osc('saw', 180 + 500 * u, n, sr) * 0.18 * np.exp(-t / 0.1)
    out['dash'] = fin(drive(x, 1.4), sr)
    # grab: click + clunk
    n = int(sr * 0.18); t = np.arange(n) / sr
    x = hp(noise(n, rng), 3000, sr) * np.exp(-t / 0.006) + osc('sq', 620 * np.exp(-t / 0.07) + 230, n, sr) * np.exp(-t / 0.05) * 0.6 + np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.05)
    out['grab'] = fin(drive(x, 2), sr)
    # throw: wind-up whoosh + snap
    n = int(sr * 0.3); t = np.arange(n) / sr; u = t / t[-1]
    x = bp(noise(n, rng), 600, 6000, sr) * (u ** 1.3) * np.exp(-((u - 0.75) ** 2) / 0.04) * 3 + osc('saw', 200 + 900 * u ** 1.5, n, sr) * 0.2 * u
    x[int(n * 0.78):] += (hp(noise(n - int(n * 0.78), rng), 2000, sr) * np.exp(-np.arange(n - int(n * 0.78)) / (sr * 0.02)))
    out['throw'] = fin(drive(x, 1.5), sr)
    # shield: energy bubble
    n = int(sr * 0.28); t = np.arange(n) / sr
    x = osc('saw', 160 + 20 * np.sin(2 * np.pi * 30 * t), n, sr) * 0.5 * (1 + 0.5 * np.sin(2 * np.pi * 40 * t)) * np.exp(-t / 0.2)
    x += np.sin(2 * np.pi * 1320 * t) * np.exp(-t / 0.08) * 0.35 + np.sin(2 * np.pi * 1980 * t) * np.exp(-t / 0.05) * 0.2
    out['shield'] = fin(lp(x, 6000, sr), sr, 0.1)
    # ko: explosion + falling laser + boom + shimmer
    n = int(sr * 1.5); t = np.arange(n) / sr
    ex = lp(noise(n, rng), 6000, sr) * np.exp(-t / 0.35); ex = lp(ex, 900, sr) * 0.5 + ex * 0.5
    boom = np.sin(2 * np.pi * np.cumsum(30 + 120 * np.exp(-t / 0.12)) / sr) * np.exp(-t / 0.55) * 1.4
    las = osc('saw', 1100 * np.exp(-t / 0.35) + 60, n, sr) * np.exp(-t / 0.5) * 0.45
    sh = hp(noise(n, rng), 5000, sr) * np.exp(-t / 0.5) * 0.25
    x = drive(ex * 1.2 + boom + las + sh, 2.0)
    out['ko'] = fin(x, sr, 0.25)
    # extras
    n = int(sr * 0.5); t = np.arange(n) / sr
    out['go'] = fin(drive(osc('saw', 440 * np.exp(-t * 0) * (1 + 0.5 * (t > 0.12)), n, sr) * np.exp(-t / 0.25) + osc('sq', 880 * (1 + 0.5 * (t > 0.12)), n, sr) * 0.3 * np.exp(-t / 0.2), 2.5), sr, 0.15)
    n = int(sr * 0.12); t = np.arange(n) / sr
    out['tick'] = fin(osc('sq', 880, n, sr) * np.exp(-t / 0.03) * 0.6 + osc('sq', 1760, n, sr) * np.exp(-t / 0.015) * 0.2, sr)
    # homing: fire ignition thump, then a rising missile whine with a crackling tail (own rng so older sounds stay byte-identical)
    r2 = np.random.default_rng(777)
    n = int(sr * 0.55); t = np.arange(n) / sr; u = t / t[-1]
    ign = np.sin(2 * np.pi * np.cumsum(50 + 200 * np.exp(-t / 0.03)) / sr) * np.exp(-t / 0.1) * 1.1 + hp(noise(n, r2), 2000, sr) * np.exp(-t / 0.02) * 0.8
    whine = osc('saw', 300 + 1800 * u ** 1.6, n, sr) * 0.35 * np.sin(np.pi * np.minimum(1, u * 1.15) ) + osc('sq', 600 + 3600 * u ** 1.6, n, sr) * 0.12 * u
    fire = bp(noise(n, r2), 800, 5000, sr) * (0.25 + 0.5 * u) * np.exp(-t / 0.4) * (1 + 0.6 * np.sin(2 * np.pi * 38 * t))
    out['homing'] = fin(drive(ign + whine + fire, 2.0), sr, 0.2)
    return out


STYLES = {   # (kind, base Hz, noise band, grit)
    'luminent': ('saw', 620, (1500, 9000), 1.6, 'laser'), 'bulwark': ('sq', 140, (300, 3000), 3.0, 'metal'),
    'zephyr': ('tri', 900, (900, 10000), 1.0, 'air'), 'ember': ('saw', 150, (400, 6000), 3.5, 'fire'),
    'tide': ('sin', 420, (300, 4000), 1.2, 'water'), 'volt': ('sq', 1100, (2000, 12000), 3.0, 'zap'),
    'umbra': ('saw', 95, (150, 2500), 2.4, 'dark'), 'terra': ('sq', 70, (100, 1800), 3.2, 'rock'),
}


def fsound(char, slot, rng):
    kind, base, band, grit, flav = STYLES[char]; sr = FSR
    dur = {'n': 0.4, 's': 0.34, 'u': 0.5, 'dg': 0.55, 'da': 0.55}[slot]
    n = int(sr * dur); t = np.arange(n) / sr; u = t / t[-1]
    nz = noise(n, rng)
    if slot == 'n':
        f = base * (0.8 + 1.2 * np.minimum(1, t / 0.12)); body = osc(kind, f, n, sr) * np.exp(-t / 0.14)
        burst = bp(nz, *band, sr) * np.exp(-t / 0.05)
        thump = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t / 0.04) + 55) / sr) * np.exp(-t / 0.07)
        x = body * 0.8 + burst * 0.9 + thump * 0.9
    elif slot == 's':
        env = np.sin(np.pi * u) ** 0.8
        sw = np.zeros(n)
        for k in range(0, n, 256):
            c = band[0] + (band[1] - band[0]) * (k / n) ** 1.4; sw[k:k + 256] = bp(nz[max(0, k - 128):k + 384], c * 0.7, c * 1.4, sr)[min(k, 128):min(k, 128) + len(sw[k:k + 256])]
        x = sw * env * 2.4 + osc(kind, base * (0.7 + 1.6 * u), n, sr) * 0.3 * env + np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.06) * 0.6
    elif slot == 'u':
        f = base * (1 + 3 * u ** 1.6); x = osc(kind, f, n, sr) * (0.4 + 0.6 * u) * np.exp(-((u - 1) ** 2) / 0.9) + bp(nz, band[0], band[1], sr) * u ** 1.5 * 0.9 * (1 + 0.5 * np.sin(2 * np.pi * 22 * t))
        x[-int(sr * 0.05):] *= np.linspace(1, 0, int(sr * 0.05)); x += np.sin(2 * np.pi * 90 * t) * np.exp(-t / 0.1) * 0.5
    elif slot == 'dg':
        thump = np.sin(2 * np.pi * np.cumsum(46 + 150 * np.exp(-t / 0.05)) / sr) * np.exp(-t / 0.25) * 1.5
        crack = hp(nz, 1500, sr) * np.exp(-t / 0.03) + bp(nz, *band, sr) * np.exp(-t / 0.18) * 0.8
        x = thump + crack + osc(kind, base, n, sr) * np.exp(-t / 0.12) * 0.5
    else:  # da
        fall = osc(kind, base * 4 * np.exp(-t / 0.12) + base * 0.4, n, sr) * np.exp(-t / 0.2) * 0.8
        imp = np.zeros(n); k0 = int(sr * 0.2)
        m = n - k0; tt = np.arange(m) / sr
        imp[k0:] = np.sin(2 * np.pi * np.cumsum(42 + 140 * np.exp(-tt / 0.04)) / sr) * np.exp(-tt / 0.14) * 1.4 + hp(nz[:m], 1200, sr) * np.exp(-tt / 0.03) + bp(nz[:m], *band, sr) * np.exp(-tt / 0.1) * 0.7
        x = fall * np.minimum(1, (0.2 - t) / 0.05).clip(0, 1) + imp
    # flavour on top
    if flav == 'metal': x += sum(np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, d in [(330, .2), (910, .14), (1530, .09)]) * 0.3
    if flav == 'fire': x += hp(nz * (np.random.default_rng(3).random(n) > 0.9), 2500, sr) * 1.2 * np.exp(-t / 0.2)
    if flav == 'water': x += np.sin(2 * np.pi * np.cumsum(500 + 700 * np.sin(2 * np.pi * 9 * t) * (1 - u)) / sr) * 0.35 * np.exp(-t / 0.2)
    if flav == 'zap': x += np.sign(np.sin(2 * np.pi * np.cumsum(np.where(np.random.default_rng(4).random(n // 80 + 1).repeat(80)[:n] > 0.5, 2400, 900)) / sr)) * 0.3 * np.exp(-t / 0.12)
    if flav == 'dark': x = lp(x, 3500, sr) + osc('saw', base * 0.5, n, sr) * 0.4 * np.sin(np.pi * u)
    if flav == 'rock': x += lp(nz, 900, sr) * np.exp(-t / 0.3) * 1.2
    if flav == 'laser': x += osc('sin', base * 3 * (1 - 0.5 * u), n, sr) * 0.25 * np.exp(-t / 0.15)
    x = drive(x * 0.9, grit)
    return fin(x, sr, 0.12)


def sfx():
    rng = np.random.default_rng(7)
    for k, v in sfx_core(rng).items():
        save(os.path.join(ROOT, 'sfx', k + '.wav'), v, FSR, 0.9); print('sfx', k)
    names = {'n': 'neutral', 's': 'side', 'u': 'up', 'dg': 'down_ground', 'da': 'down_air'}
    for c in STYLES if True else []:
        pass
    for c in ['luminent', 'bulwark', 'zephyr', 'ember', 'tide', 'volt', 'umbra', 'terra']:
        for s in names:
            save(os.path.join(ROOT, 'f', f'{c}_{s}_{names[s]}.wav'), fsound(c, s, np.random.default_rng(zlib.crc32((c + s).encode()))), FSR, 0.9)
    print('f sounds done')


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('sfx', 'all'): sfx()
    if what in ('music', 'all'): music()
