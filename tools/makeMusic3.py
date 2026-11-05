#!/usr/bin/env python3
"""Third music pass (python3 tools/makeMusic3.py): complete reworks of the four stage themes, still dark and bloody-minded, new notes and new rhythms.
 03 frontier   150 bpm D harmonic minor: palm-muted 16th chug, double-kick gallop, snare + clap, fiddle lead
 04 frontier+  96 bpm  A minor: half-time war march, brass horn calls, tom hits, drone
 05 horizon    140 bpm F# minor: dark synthwave, octave-jump bass, gated arps, 16th hats, supersaw lead
 06 horizon+   172 bpm G minor: drum & bass, reese bass, breakdown, rolling snare fills"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import makeAudio as M
from makeAudio import MSR as SR, hz, lp, hp, bp, osc, noise, drive, kick, snare, hat, tom, reverb, echo, save
from makeMusic2 import Song, pluck, padv, supersaw, bassv, fiddle, brass, clap, riser, chord, freq

ROOT = M.ROOT

def chug(f, dur, rng):
    return drive(pluck(f, dur, rng, 0.25, 0.985), 3.0) * np.minimum(1, np.maximum(0, np.linspace(dur, 0, int(SR * dur))) / 0.01 + 0)

def reese(f, dur, wob=0.5):
    n = int(SR * dur); t = np.arange(n) / SR
    x = osc('saw', f * 0.994, n, SR) + osc('saw', f * 1.006, n, SR) + 0.6 * osc('sin', f / 2, n, SR)
    x = lp(x, 700, SR, 2)
    x = drive(x * (0.75 + 0.25 * np.sin(2 * np.pi * wob * 4 * t)), 2.2)
    return x * np.minimum(1, t / 0.01) * np.minimum(1, np.maximum(0, dur - t) / 0.03)


# ------------------------------------------------------------ frontier: gallop metal
def frontier():
    s = Song(150, 20, seed=303); r = s.rng
    prog = [(38, 'min'), (34, 'maj'), (36, 'maj'), (33, 'maj')]          # Dm Bb C A
    K, SN, CL = kick(SR, r, 0.1, 150, 50), snare(SR, r), clap(r)
    ph1 = [[(0, 74, .5), (.5, 77, .5), (1, 76, .5), (1.5, 74, .5), (2, 73, 1), (3, 74, 1)], [(0, 77, 1), (1, 79, .5), (1.5, 77, .5), (2, 74, 2)],
           [(0, 76, .5), (.5, 79, .5), (1, 84, 1.5), (2.5, 81, .5), (3, 79, 1)], [(0, 81, 1), (1, 77, .5), (1.5, 76, .5), (2, 73, 1.5), (3.5, 76, .5)]]
    ph2 = [[(0, 81, 1), (1, 79, .5), (1.5, 77, .5), (2, 76, 1), (3, 74, 1)], [(0, 82, 1.5), (1.5, 81, .5), (2, 77, 2)],
           [(0, 79, 1), (1, 84, 1), (2, 88, 1.5), (3.5, 86, .5)], [(0, 85, 1), (1, 81, 1), (2, 76, .5), (2.5, 73, .5), (3, 69, 1)]]
    chugp = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0]
    for bar in range(20):
        rt, kd = prog[bar % 4]; ch = chord(rt + 24, kd); breakd = 16 <= bar
        for st in range(16):
            if chugp[st] and not (bar == 15 and st >= 8):
                s.put('gtr', bar, st * 0.25, chug(freq(rt + 12 if st in (6, 14) else rt), 0.2, r), 0.55 if st % 4 == 0 else 0.38)
        for k in (0, 2): s.put('pw', bar, k, drive(sum(pluck(freq(rt + 12 + o), 0.9, r, 0.4, 0.997) for o in (0, 7)), 2.2), 0.35)
        s.put('bass', bar, 0, bassv(freq(rt - 12), 0.45, 'saw', 450, 1.8), 0.8); s.put('bass', bar, 2, bassv(freq(rt - 12), 0.45, 'saw', 450, 1.8), 0.7)
        if bar >= 2 and not breakd:
            for b in (0, 1.5, 2, 3.25): s.put('kick', bar, b, K, 0.9); s.kicks.append(s.t(bar, b))
            for b in (1, 3): s.put('perc', bar, b, SN, 0.75); s.put('perc', bar, b, CL, 0.35)
            for st in range(8): s.put('hat', bar, st * 0.5 + 0.25, hat(SR, r), 0.3)
        if breakd:
            for b in (0, 2): s.put('kick', bar, b, K, 0.9); s.kicks.append(s.t(bar, b))
            if bar == 19:
                for q in range(16): s.put('perc', bar, 2 + q * 0.125, snare(SR, r), 0.12 + 0.05 * q)
        if 8 <= bar < 16:
            for n0, m, d in (ph1 if bar < 12 else ph2)[bar % 4]: s.put('lead', bar, n0, fiddle(freq(m), d * s.beat * 0.95, 6.0), 0.6)
        if bar == 7: s.put('fx', bar, 0, riser(s.bar, r), 0.6)
    s.tr['bass'] = s.duck(s.tr['bass'], 0.5, 0.1)
    return lp(s.mix(dict(gtr=0.9, pw=0.7, bass=0.8, kick=0.9, perc=0.7, hat=0.5, lead=0.9, fx=0.7), 0.12, 0.45, 1.1), 5000, SR, 1)


# ------------------------------------------------------------ frontier big: war march
def frontier_big():
    s = Song(96, 14, seed=404); r = s.rng
    prog = [(33, 'min'), (29, 'maj'), (31, 'maj'), (28, 'maj')]            # Am F G E
    K, SN = kick(SR, r, 0.18, 120, 42), snare(SR, r); D = tom(SR, r, 52); D2 = tom(SR, r, 78)
    call = [[(0, 76, 1.5), (1.5, 72, .5), (2, 69, 2)], [(0, 72, 1.5), (1.5, 69, .5), (2, 65, 2)], [(0, 71, 1), (1, 74, 1), (2, 79, 2)], [(0, 76, 1), (1, 80, 1), (2, 83, 1.5), (3.5, 80, .5)]]
    for bar in range(14):
        rt, kd = prog[bar % 4]; ch = chord(rt + 24, kd)
        s.put('drone', bar, 0, drive(osc('saw', freq(rt), int(SR * s.bar * 1.02), SR) * 0.4 + osc('sin', freq(rt - 12), int(SR * s.bar * 1.02), SR), 1.6), 0.3)
        s.put('pad', bar, 0, padv([freq(m) for m in ch], s.bar * 1.05, 900, 0.9), 0.35)
        for b in (0, 2.5): s.put('perc', bar, b, D, 1.0)
        s.put('kick', bar, 0, K, 0.9); s.put('kick', bar, 2.5, K, 0.7); s.kicks += [s.t(bar, 0), s.t(bar, 2.5)]
        s.put('perc', bar, 2, SN, 0.8)
        if bar >= 4:
            for st in range(8): s.put('perc', bar, st * 0.5 + 0.25, D2, 0.18 + 0.1 * (st % 2 == 0))
        if bar >= 2:
            for n0, m, d in call[bar % 4]: s.put('lead', bar, n0, brass(freq(m - 12), d * s.beat * 0.95), 0.75 if bar < 8 else 0.9)
        if bar >= 8:
            for n0, m, d in call[(bar + 2) % 4]: s.put('lead2', bar, n0 + 0.5 if n0 < 3.5 else n0, fiddle(freq(m + 7), d * s.beat * 0.7, 5.0), 0.3)
        if bar == 13:
            for q in range(8): s.put('perc', bar, 2 + q * 0.25, D2, 0.2 + 0.08 * q)
    return s.mix(dict(drone=0.9, pad=0.8, perc=1.0, kick=0.8, lead=1.0, lead2=0.9), 0.28, 1.1, 1.05)


# ------------------------------------------------------------ horizon: dark synthwave
def horizon():
    s = Song(140, 18, seed=505); r = s.rng
    prog = [(42, 'min'), (38, 'maj'), (40, 'maj'), (37, 'maj')]            # F#m D E C#
    K, SN, HO, CL = kick(SR, r, 0.12, 170, 46), snare(SR, r), hat(SR, r, True), clap(r)
    mel = [[(0, 85, 1), (1, 88, .5), (1.5, 85, .5), (2, 81, 1), (3, 83, 1)], [(0, 86, 1.5), (1.5, 85, .5), (2, 81, 2)],
           [(0, 88, 1), (1, 86, .5), (1.5, 83, .5), (2, 80, 2)], [(0, 85, 1.5), (1.5, 88, .5), (2, 89, 1), (3, 85, 1)]]
    arp = [0, 2, 1, 2, 0, 2, 1, 3]
    for bar in range(18):
        rt, kd = prog[bar % 4]; ch = chord(rt + 24, kd) + [rt + 36]; sec = 0 if bar < 4 else 1
        for b in range(4): s.put('kick', bar, b, K, 0.9); s.kicks.append(s.t(bar, b))
        s.put('kick', bar, 3.75, K, 0.55); s.kicks.append(s.t(bar, 3.75))
        for st in range(8): s.put('bass', bar, st * 0.5, bassv(freq(rt + (12 if st % 2 else 0)), 0.2, 'saw', 800 + 500 * (st % 2), 2.0), 0.5)
        s.put('pad', bar, 0, padv([freq(m - 12) for m in ch[:3]], s.bar * 1.02, 2200, 0.1), 0.45)
        if bar >= 2:
            for b in (1, 3): s.put('perc', bar, b, SN, 0.75); s.put('perc', bar, b, CL, 0.4)
            for st in range(16): s.put('hat', bar, st * 0.25, HO if st % 4 == 2 else hat(SR, r), 0.35 if st % 2 else 0.22)
        if bar >= 4:
            for st in range(16):
                s.put('arp', bar, st * 0.25, supersaw(freq(ch[arp[st % 8] % 4]), 0.14, 3800, 0.005, 0.03), 0.22)
        if bar >= 8 and bar < 16 or bar == 17 - 0 and False:
            for n0, m, d in mel[bar % 4]: s.put('lead', bar, n0, supersaw(freq(m), d * s.beat * 0.95, 6500, 0.02, 0.12), 0.34)
        if bar == 7 or bar == 15: s.put('fx', bar, 0, riser(s.bar, r), 0.8)
    for k in ('pad', 'arp'): s.tr[k] = s.duck(s.tr[k], 0.7, 0.12)
    s.tr['bass'] = s.duck(s.tr['bass'], 0.5, 0.1)
    return s.mix(dict(kick=0.9, pad=0.8, bass=0.9, perc=0.7, hat=0.55, arp=0.9, lead=0.9, fx=0.7), 0.2, 0.8, 1.3)


# ------------------------------------------------------------ horizon big: drum & bass
def horizon_big():
    s = Song(172, 24, seed=606); r = s.rng
    prog = [(43, 'min'), (39, 'maj'), (46, 'maj'), (41, 'maj')]            # Gm Eb Bb F
    K, SN, HO = kick(SR, r, 0.1, 160, 48), snare(SR, r), hat(SR, r, True)
    mel = [[(0, 86, 1), (1, 87, .5), (1.5, 86, .5), (2, 82, 1.5), (3.5, 79, .5)], [(0, 87, 1.5), (1.5, 86, .5), (2, 82, 2)],
           [(0, 86, 1), (1, 89, 1), (2, 86, 1), (3, 82, 1)], [(0, 89, 1), (1, 88, 1), (2, 84, 2)]]
    for bar in range(24):
        rt, kd = prog[bar % 4]; ch = chord(rt + 12, kd)
        intro, brk = bar < 4, 12 <= bar < 16; drop = not intro and not brk
        s.put('pad', bar, 0, padv([freq(m) for m in ch], s.bar * 1.02, 1800, 0.4), 0.5)
        if not brk:
            for b in range(4): s.put('hat', bar, b * 1 + 0.5, HO if bar >= 2 else hat(SR, r), 0.3)
        if drop:
            for b in (0, 2.5): s.put('kick', bar, b, K, 0.95); s.kicks.append(s.t(bar, b))
            if bar % 4 == 3: s.put('kick', bar, 3.25, K, 0.7); s.kicks.append(s.t(bar, 3.25))
            for b in (1, 3): s.put('perc', bar, b, SN, 0.9)
            s.put('perc', bar, 1.75, SN, 0.25); s.put('perc', bar, 3.5, SN, 0.3)
            for st in range(16): s.put('hat', bar, st * 0.25, hat(SR, r), 0.2 + 0.1 * (st % 2 == 0))
            pat = [(0, 1.5), (1.5, 0.5), (2, 1), (3, 0.5), (3.5, 0.5)]
            for b0, d in pat: s.put('bass', bar, b0, reese(freq(rt), d * s.beat * 0.97, 0.5 + 0.25 * (bar % 4)), 0.8 if b0 != 3.5 else 0.6)
            for n0, m, d in mel[bar % 4]:
                if bar >= 6: s.put('lead', bar, n0, supersaw(freq(m), d * s.beat * 0.95, 6000, 0.01, 0.1), 0.3)
        if brk:
            for n0, m, d in mel[bar % 4]: s.put('lead', bar, n0, supersaw(freq(m), d * s.beat, 5000, 0.02, 0.2), 0.34)
            for st in range(16 if bar >= 14 else 8): s.put('arp', bar, st * (0.25 if bar >= 14 else 0.5), pluck(freq(ch[st % 3] + 24), 0.3, r, 0.8, 0.99), 0.3)
            if bar == 15:
                for q in range(16): s.put('perc', bar, q * 0.25, snare(SR, r), 0.1 + 0.05 * q)
                s.put('fx', bar, 0, riser(s.bar, r), 0.9)
        if intro:
            for st in range(8): s.put('arp', bar, st * 0.5, pluck(freq(ch[st % 3] + 24), 0.3, r, 0.8, 0.99), 0.25)
    for k in ('pad', 'arp'):
        if k in s.tr: s.tr[k] = s.duck(s.tr[k], 0.55, 0.12)
    if 'arp' in s.tr: s.tr['arp'] = echo(s.tr['arp'], SR, s.beat * 0.75, 0.35, 0.4)
    return s.mix(dict(kick=0.9, pad=0.8, bass=0.9, perc=0.8, hat=0.5, arp=0.8, lead=0.9, fx=0.7), 0.2, 0.8, 1.3)


TR = {'03_stage_frontier': frontier, '04_stage_frontier_big': frontier_big, '05_stage_horizon': horizon, '06_stage_horizon_big': horizon_big}
if __name__ == '__main__':
    for name in (sys.argv[1:] or list(TR)):
        x = TR[name]()
        save(os.path.join(ROOT, 'bgm', name + '.wav'), x, SR, 0.9)
        print(name, round(len(x) / SR, 1), 's', 'rms', round(float(np.sqrt((x ** 2).mean())) / float(np.abs(x).max()), 3))
