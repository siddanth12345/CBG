#!/usr/bin/env python3
"""Second music set for Cool Battle Game (python3 tools/makeMusic2.py). Every stage has its own genre, tempo and tune:
 01 title      calm-before-the-storm: 96 bpm A minor, soft pad, pulsing bass, bell melody, taiko swells
 03 frontier   western gallop: 142 bpm D mixolydian, plucked guitar triplets, stomp + clap, fiddle lead
 04 frontier+  desolate epic: 88 bpm E minor half-time war drums, low brass, wooden flute with echo
 05 horizon    synthwave: 118 bpm A lydian, four-on-the-floor, sidechained pads, supersaw arps
 06 horizon+   dreamy trance: 132 bpm C# minor, rolling plucks, supersaw chords, long breakdown
 07 training   lo-fi calm: 80 bpm, warm electric piano, brushed drums, vinyl crackle
32 kHz mono loops of ~30-37 s (the tail wraps to the start so they loop seamlessly)."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import makeAudio as M
from makeAudio import MSR as SR, hz, lp, hp, bp, osc, noise, drive, kick, snare, hat, tom, reverb, echo, save

ROOT = M.ROOT


# ---------------------------------------------------------------- voices
def pluck(f, dur, rng, bright=0.5, decay=0.996):
    n = int(SR * dur); P = max(2, int(SR / f)); buf = rng.uniform(-1, 1, P) * 0.8
    buf = lp(buf, 800 + 6000 * bright, SR, 1)
    out = np.zeros(n + P); out[:P] = buf
    for i in range(P, n, P):
        prev = out[i - P:i]; out[i:i + P] = 0.5 * (prev + np.roll(prev, 1)) * decay
    return out[:n] * np.exp(-np.arange(n) / (SR * dur * 0.7))

def epiano(f, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 1.1) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.5) + 0.2 * np.sin(2 * np.pi * 7 * f * t) * np.exp(-t / 0.06)
    return x * np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.08)

def bell(f, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / d) for m, a, d in [(1, 1, 1.4), (2.76, .4, .5), (5.4, .2, .25), (8.9, .1, .1)])
    return x * np.minimum(1, t / 0.003)

def padv(freqs, dur, bright=1800, att=0.5):
    n = int(SR * dur); t = np.arange(n) / SR; x = np.zeros(n)
    for f in freqs:
        for d in (-0.07, 0.0, 0.08):
            x += osc('saw', f * 2 ** (d / 12), n, SR) * 0.2
    x = lp(x, bright, SR)
    return x * np.minimum(1, t / att) * np.minimum(1, (dur - t) / max(0.05, att))

def supersaw(f, dur, bright=7000, att=0.01, rel=0.05):
    n = int(SR * dur); t = np.arange(n) / SR; x = np.zeros(n)
    for d in (-0.2, -0.1, 0, 0.1, 0.2): x += osc('saw', f * 2 ** (d / 12), n, SR, np.random.default_rng(int(f * 10 + d * 100) % 9999).random()) * 0.2
    return lp(x, bright, SR) * np.minimum(1, t / att) * np.minimum(1, np.maximum(0, (dur - t)) / rel)

def bassv(f, dur, kind='sin', bright=500, drv=1.5):
    n = int(SR * dur); t = np.arange(n) / SR
    x = osc('sin', f, n, SR) + 0.5 * osc(kind, f, n, SR)
    x = drive(lp(x, bright, SR), drv)
    return x * np.minimum(1, t / 0.005) * np.minimum(1, np.maximum(0, dur - t) / 0.03)

def fiddle(f, dur, vib=5.5):
    n = int(SR * dur); t = np.arange(n) / SR
    fm = f * (1 + 0.006 * np.sin(2 * np.pi * vib * t) * np.minimum(1, t / 0.25))
    x = lp(osc('saw', fm, n, SR) + 0.4 * osc('saw', fm * 1.004, n, SR), 3200, SR)
    return x * np.minimum(1, t / 0.05) * np.minimum(1, np.maximum(0, dur - t) / 0.08)

def brass(f, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    x = osc('saw', f, n, SR) + osc('saw', f * 1.003, n, SR)
    cut = 250 + 1700 * np.minimum(1, t / 0.35)
    y = np.zeros(n)
    for k in range(0, n, 512): y[k:k + 512] = lp(x[max(0, k - 256):k + 512], float(cut[k]), SR, 2)[min(k, 256):min(k, 256) + len(y[k:k + 512])]
    return y * np.minimum(1, t / 0.12) * np.minimum(1, np.maximum(0, dur - t) / 0.15)

def flute(f, dur, rng):
    n = int(SR * dur); t = np.arange(n) / SR
    fm = f * (1 + 0.004 * np.sin(2 * np.pi * 5 * t))
    x = osc('sin', fm, n, SR) + 0.15 * osc('sin', fm * 2, n, SR) + 0.12 * bp(noise(n, rng), f * 1.5, f * 6, SR, 1)
    return x * np.minimum(1, t / 0.08) * np.minimum(1, np.maximum(0, dur - t) / 0.1)

def clap(rng):
    n = int(SR * 0.25); t = np.arange(n) / SR
    x = bp(noise(n, rng), 900, 6000, SR) * (np.exp(-t / 0.05) + 0.7 * np.exp(-((t - 0.012) / 0.004) ** 2))
    return x

def brush(rng):
    n = int(SR * 0.3); t = np.arange(n) / SR
    return bp(noise(n, rng), 1500, 7000, SR, 1) * np.minimum(1, t / 0.03) * np.exp(-t / 0.09) * 0.7

def riser(dur, rng):
    n = int(SR * dur); t = np.arange(n) / SR; u = t / dur
    return hp(noise(n, rng), 600, SR) * u ** 2.2 * 0.5 + osc('saw', 150 + 900 * u ** 2, n, SR) * 0.15 * u


class Song:
    def __init__(self, bpm, bars, beats=4, seed=1):
        self.bpm, self.bars, self.beats = bpm, bars, beats
        self.beat = 60.0 / bpm; self.bar = self.beat * beats
        self.N = int(SR * self.bar * bars); self.tail = SR * 3
        self.rng = np.random.default_rng(seed)
        self.tr = {}; self.kicks = []
    def t(self, bar, beat=0.0): return int(SR * (bar * self.bar + beat * self.beat))
    def put(self, track, bar, beat, x, g=1.0):
        buf = self.tr.setdefault(track, np.zeros(self.N + self.tail)); i = self.t(bar, beat)
        if i < len(buf): j = min(len(buf), i + len(x)); buf[i:j] += x[:j - i] * g
    def fold(self, x): out = x[:self.N].copy(); tl = x[self.N:]; out[:len(tl)] += tl; return out
    def duck(self, x, depth=0.8, rel=0.16):
        env = np.ones(len(x))
        for kpos in self.kicks:
            k = np.arange(min(len(x) - kpos, int(SR * 0.4)))
            if len(k): env[kpos:kpos + len(k)] = np.minimum(env[kpos:kpos + len(k)], 1 - depth * np.exp(-k / (SR * rel)) * (k > 0))
        return x * env
    def mix(self, gains, wet=0.15, size=0.7, push=1.4):
        y = np.zeros(self.N)
        for k, g in gains.items():
            if k in self.tr: y += self.fold(self.tr[k]) * g
        # reverb on the wrapped signal so the loop point is clean
        y = reverb(np.concatenate([y, y, y]), SR, wet, size)[self.N:2 * self.N]
        return drive(y, push)


def freq(m): return hz(m)
def chord(root, kind):
    return {'min': [0, 3, 7], 'maj': [0, 4, 7], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11], 'dom7': [0, 4, 7, 10], 'sus': [0, 5, 7]}[kind] and [root + i for i in {'min': [0, 3, 7], 'maj': [0, 4, 7], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11], 'dom7': [0, 4, 7, 10], 'sus': [0, 5, 7]}[kind]]


# ---------------------------------------------------------------- 01 title: calm but charged
def title():
    s = Song(96, 12, seed=11); r = s.rng
    prog = [(57, 'min'), (53, 'maj'), (48, 'maj'), (55, 'maj')]      # Am F C G
    K, TM = kick(SR, r, 0.18, 120, 40), tom(SR, r, 70)
    mel = [[(0, 76, 2), (2, 72, 1), (3, 74, 1)], [(0, 72, 2), (2, 69, 2)], [(0, 67, 2), (2, 72, 1), (3, 76, 1)], [(0, 74, 3), (3, 71, 1)]]
    for bar in range(12):
        cyc = bar // 4; rt, kd = prog[bar % 4]; ch = chord(rt + 12, kd)
        s.put('pad', bar, 0, padv([freq(m) for m in ch], s.bar * 1.02, 1400 + 500 * cyc, 0.7), 0.5)
        for b in range(8):                                    # pulsing eighth-note bass: the held-back energy
            s.put('bass', bar, b * 0.5, bassv(freq(rt - 12), 0.42, 'saw', 380 + 120 * cyc), 0.55 + 0.08 * (b % 2 == 0))
        if cyc >= 1:
            pat = [0, 1, 2, 1] * 4
            for st in range(16): s.put('arp', bar, st * 0.25, bell(freq(ch[pat[st] % 3] + 12), 0.6), 0.12 + 0.03 * (st % 4 == 0))
            for b in range(4): s.put('hat', bar, b + 0.5, hat(SR, r), 0.5)
        if cyc >= 1:
            for n0, m, d in mel[bar % 4]: s.put('lead', bar, n0, epiano(freq(m), d * s.beat * 1.1), 0.5)
        if cyc >= 2:
            s.put('perc', bar, 0, TM, 0.9); s.put('perc', bar, 2.5, TM, 0.6)
            s.put('kick', bar, 0, K, 0.8); s.put('kick', bar, 2, K, 0.6)
            s.kicks += [s.t(bar, 0), s.t(bar, 2)]
        if bar == 11:
            for q in range(8): s.put('perc', bar, 2 + q * 0.25, snare(SR, r), 0.15 + 0.07 * q)
            s.put('fx', bar, 0, riser(s.bar, r), 0.9)
        if bar == 3 or bar == 7: s.put('fx', bar, 2, riser(s.bar / 2, r), 0.5)
    return lp(s.mix(dict(pad=1.0, bass=0.8, arp=0.9, lead=1.0, hat=0.35, perc=0.9, kick=0.9, fx=0.7), 0.22, 0.8, 1.1), 5200, SR, 2)   # soft and warm: the energy comes from the pulse, not the brightness


# ---------------------------------------------------------------- 03 frontier: western gallop
def frontier():
    s = Song(142, 18, seed=33); r = s.rng
    prog = [(50, 'maj'), (48, 'maj'), (43, 'maj'), (50, 'maj')]       # D C G D
    K, CL = kick(SR, r, 0.1, 150, 55), clap(r)
    fid = {0: [(0, 74, 1), (1, 76, 0.5), (1.5, 74, 0.5), (2, 72, 1), (3, 69, 1)], 1: [(0, 69, 1.5), (1.5, 72, 0.5), (2, 74, 2)],
           2: [(0, 71, 1), (1, 74, 1), (2, 79, 1.5), (3.5, 78, 0.5)], 3: [(0, 78, 1), (1, 74, 1), (2, 69, 2)]}
    for bar in range(18):
        rt, kd = prog[bar % 4]; ch = chord(rt, kd); sec = 0 if bar < 4 else 1 if bar < 8 else 2 if bar < 16 else 0
        # galloping picked pattern: long-short-short per beat on a triplet grid
        for b in range(4):
            for k, off in enumerate([0, 0.5, 0.75]):
                m = [ch[0] + 12, ch[1] + 12, ch[2] + 12][[0, 2, 1][k]] if kd == 'maj' else ch[k] + 12
                s.put('gtr', bar, b + off, pluck(freq(m), 0.45, r, 0.6), 0.55 if k == 0 else 0.38)
        s.put('bass', bar, 0, pluck(freq(rt - 12), 0.8, r, 0.2), 0.9); s.put('bass', bar, 2, pluck(freq(rt - 5), 0.8, r, 0.2), 0.8)
        if sec >= 1 or bar >= 16:
            for b in (0, 2): s.put('kick', bar, b, K, 0.9); s.kicks.append(s.t(bar, b))
            for b in (1, 3): s.put('perc', bar, b, CL, 0.7)
        if sec == 2 and bar < 16:
            for n0, m, d in fid[(bar - 8) % 4 if (bar // 4) % 2 == 0 else 3 - (bar - 8) % 4]: s.put('lead', bar, n0, fiddle(freq(m), d * s.beat * 0.95), 0.55)
    return s.mix(dict(gtr=1.0, bass=0.8, kick=0.8, perc=0.5, lead=0.9), 0.1, 0.4, 1.2)


# ---------------------------------------------------------------- 04 frontier big: desolate epic
def frontier_big():
    s = Song(88, 12, seed=44); r = s.rng
    prog = [(40, 'min'), (36, 'maj'), (43, 'maj'), (38, 'maj')]        # Em C G D
    D = tom(SR, r, 55); D2 = tom(SR, r, 80)
    fl = [[(0, 76, 3), (3, 74, 1)], [(0, 72, 2), (2, 71, 2)], [(0, 71, 2), (2, 74, 2)], [(0, 79, 4)], [(0, 76, 2), (2, 79, 1), (3, 76, 1)], [(0, 74, 4)]]
    for bar in range(12):
        rt, kd = prog[bar % 4]; ch = chord(rt + 12, kd)
        s.put('brass', bar, 0, brass(freq(rt), s.bar * 1.0), 0.55)
        s.put('pad', bar, 0, padv([freq(m + 12) for m in ch], s.bar * 1.05, 1100, 0.9), 0.4)
        s.put('perc', bar, 0, D, 1.0); s.put('perc', bar, 2.5, D, 0.7)
        if bar >= 4:
            s.put('perc', bar, 1.5, D2, 0.5); s.put('perc', bar, 3.25, D2, 0.4)
        if bar >= 8:
            for q in range(6): s.put('perc', bar, 2 + q / 3, D2, 0.5)
        if bar >= 2:
            for n0, m, d in fl[(bar - 2) % 6]: s.put('lead', bar, n0, flute(freq(m + 12), d * s.beat, r), 0.8)
    y = s.mix(dict(brass=0.9, pad=1.0, perc=1.1, lead=1.0), 0.3, 1.2, 1.2)
    return y


# ---------------------------------------------------------------- 05 horizon: synthwave
def horizon():
    s = Song(118, 16, seed=55); r = s.rng
    prog = [(57, 'maj'), (52, 'maj'), (54, 'min'), (50, 'maj')]          # A E F#m D
    K, SN, HO = kick(SR, r, 0.12, 170, 48), snare(SR, r), hat(SR, r, True)
    mel = {0: [(0, 81, 1), (1, 83, 1), (2, 85, 2)], 1: [(0, 88, 1.5), (1.5, 85, 0.5), (2, 83, 2)], 2: [(0, 86, 1), (1, 85, 1), (2, 81, 2)], 3: [(0, 83, 2), (2, 85, 1), (3, 90, 1)]}
    for bar in range(16):
        rt, kd = prog[bar % 4]; ch = chord(rt + 12, kd); sec = 0 if bar < 4 else 1
        for b in range(4): s.put('kick', bar, b, K, 0.9); s.kicks.append(s.t(bar, b))
        s.put('pad', bar, 0, padv([freq(m) for m in ch], s.bar * 1.02, 2600, 0.15), 0.55)
        for st in range(8): s.put('bass', bar, st * 0.5 + 0.25 if False else st * 0.5, bassv(freq(rt - 12), 0.22, 'saw', 700, 2.0), 0.55 if st % 2 else 0.4)
        if bar >= 2:
            for b in (1, 3): s.put('perc', bar, b, SN, 0.7)
            for b in range(4): s.put('hat', bar, b + 0.5, HO, 0.4)
        if bar >= 4:
            pat = [0, 1, 2, 1, 2, 3, 2, 1]
            for st in range(16): s.put('arp', bar, st * 0.25, supersaw(freq((ch + [ch[0] + 12])[pat[st % 8]] + 12), 0.18, 4500), 0.22)
        if bar >= 8 or bar % 4 >= 2 and bar >= 4:
            for n0, m, d in mel[bar % 4]: s.put('lead', bar, n0, supersaw(freq(m), d * s.beat, 6000, 0.02, 0.15), 0.35)
    for k in ('pad', 'arp'): s.tr[k] = s.duck(s.tr[k], 0.7, 0.14)
    s.tr['bass'] = s.duck(s.tr['bass'], 0.6, 0.12)
    return s.mix(dict(kick=0.9, pad=0.8, bass=0.9, perc=0.6, hat=0.5, arp=0.8, lead=0.8), 0.2, 0.8, 1.3)


# ---------------------------------------------------------------- 06 horizon big: dreamy trance
def horizon_big():
    s = Song(132, 16, seed=66); r = s.rng
    prog = [(49, 'min'), (45, 'maj'), (52, 'maj'), (47, 'maj')]          # C#m A E B
    K, CL = kick(SR, r, 0.14, 180, 46), clap(r)
    mel = {0: [(0, 85, 2), (2, 88, 1), (3, 85, 1)], 1: [(0, 84, 2), (2, 81, 2)], 2: [(0, 88, 1), (1, 92, 3)], 3: [(0, 91, 2), (2, 88, 2)]}
    for bar in range(16):
        rt, kd = prog[bar % 4]; ch = chord(rt + 12, kd)
        breakdown = 4 <= bar < 8; drop = bar >= 8
        s.put('pad', bar, 0, padv([freq(m) for m in ch], s.bar * 1.02, 2000, 0.6), 0.5)
        if not breakdown:
            for b in range(4): s.put('kick', bar, b, K, 0.9); s.kicks.append(s.t(bar, b))
            for st in range(4): s.put('bass', bar, st + 0.5, bassv(freq(rt - 24), 0.4, 'sin', 300, 1.3), 0.9)
            for b in (1, 3): s.put('perc', bar, b, CL, 0.5)
        pat = [0, 2, 1, 2, 0, 2, 1, 2] if not drop else [0, 1, 2, 1, 2, 3, 2, 1]
        for st in range(16 if bar >= 2 else 8):
            m = (ch + [ch[0] + 12, ch[1] + 12])[pat[st % 8] if bar >= 2 else pat[st % 8]] + 12
            s.put('arp', bar, st * (0.25 if bar >= 2 else 0.5), pluck(freq(m), 0.3, r, 0.8, 0.99), 0.4)
        if drop:
            s.put('stab', bar, 0, supersaw(freq(ch[0] + 12), s.beat * 1.5, 3500, 0.01, 0.2), 0.3)
            s.put('stab', bar, 2.5, supersaw(freq(ch[1] + 12), s.beat * 1.0, 3500, 0.01, 0.2), 0.25)
        if bar >= 6 and bar != 7 or drop:
            for n0, m, d in mel[bar % 4]: s.put('lead', bar, n0, supersaw(freq(m), d * s.beat, 5500, 0.02, 0.2), 0.3 if breakdown else 0.35)
        if bar == 7: s.put('fx', bar, 0, riser(s.bar, r), 0.9)
    for k in ('pad', 'arp', 'stab'):
        if k in s.tr: s.tr[k] = s.duck(s.tr[k], 0.55, 0.14)
    for k in ('arp',): s.tr[k] = echo(s.tr[k], SR, s.beat * 0.75, 0.4, 0.4)
    return s.mix(dict(kick=0.9, pad=0.8, bass=0.9, perc=0.5, arp=0.8, stab=0.8, lead=0.9, fx=0.7), 0.25, 0.9, 1.3)


# ---------------------------------------------------------------- 07 training: lo-fi calm
def training():
    s = Song(80, 12, seed=77); r = s.rng
    prog = [(48, 'maj7'), (45, 'm7'), (50, 'm7'), (43, 'dom7')]            # Cmaj7 Am7 Dm7 G7
    K, BR = kick(SR, r, 0.2, 110, 45), brush(r)
    mel = [[(0.5, 76, 1), (2, 79, 1.5)], [(1, 72, 1), (2.5, 76, 1.5)], [(0, 74, 1.5), (2, 69, 2)], [(1, 71, 1), (3, 74, 1)]]
    for bar in range(12):
        rt, kd = prog[bar % 4]; ch = chord(rt + 12, kd); cyc = bar // 4
        for k, m in enumerate(ch): s.put('keys', bar, 0.02 * k, epiano(freq(m), s.bar * 0.55), 0.5)
        if bar % 2 == 1 or cyc: 
            for k, m in enumerate(ch): s.put('keys', bar, 2.5 + 0.02 * k, epiano(freq(m), s.bar * 0.35), 0.35)
        s.put('bass', bar, 0, bassv(freq(rt - 12), 1.3, 'sin', 300, 1.2), 0.9); s.put('bass', bar, 2.5, bassv(freq(rt - 12 + (7 if kd != 'dom7' else 5)), 0.9, 'sin', 300, 1.2), 0.6)
        s.put('kick', bar, 0, K, 0.7); s.put('kick', bar, 2.5, K, 0.45)
        for b in (1, 3): s.put('perc', bar, b, BR, 0.6)
        for b in range(4): s.put('hat', bar, b + (0.1 if b % 2 else 0), hat(SR, r), 0.35); s.put('hat', bar, b + 0.58, hat(SR, r), 0.22)
        if cyc >= 1:
            for n0, m, d in mel[bar % 4]: s.put('lead', bar, n0, bell(freq(m), 1.4), 0.3)
    y = s.mix(dict(keys=1.0, bass=0.9, kick=0.8, perc=0.8, hat=0.8, lead=1.0), 0.28, 0.9, 1.1)
    y = lp(y, 5200, SR, 1)
    crackle = (r.random(len(y)) < 0.0007) * r.standard_normal(len(y)) * 0.12
    return y + lp(crackle, 6000, SR, 1)


TR = {'01_title_start_screen': title, '03_stage_frontier': frontier, '04_stage_frontier_big': frontier_big,
      '05_stage_horizon': horizon, '06_stage_horizon_big': horizon_big, '07_training': training}

if __name__ == '__main__':
    only = sys.argv[1:] or list(TR)
    for name in only:
        x = TR[name]()
        save(os.path.join(ROOT, 'bgm', name + '.wav'), x, SR, 0.9)
        print(name, round(len(x) / SR, 1), 's')
