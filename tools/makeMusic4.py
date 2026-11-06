#!/usr/bin/env python3
"""Fourth music pass (python3 tools/makeMusic4.py): the four stage themes composed again from scratch, with proper song forms
(intro / verse / chorus / break / final chorus), a real hook in each, voice-led chords and cleaner instrument sounds.
 03 frontier   132 bpm E phrygian-dominant: palm-muted gallop, spaghetti-western twang hook, kick + clap, answering harmony
 04 frontier+   84 bpm A harmonic minor: war-drum march, brass theme, staccato string ostinato, choir pad
 05 horizon    124 bpm B minor: dark synthwave, octave bass, gated snare, 16th arps, supersaw hook
 06 horizon+   140 bpm C# minor: anthem trance, rolling off-beat bass, chord stabs, long break and a drop
Every loop wraps (the reverb tail folds onto the start) so it repeats without a gap."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import makeAudio as M
from makeAudio import MSR as SR, hz, lp, hp, bp, osc, noise, drive, kick, snare, hat, tom, crash, reverb, echo, save
from makeMusic2 import Song, clap, riser, padv, supersaw

ROOT = M.ROOT
def freq(m): return hz(m)


# ------------------------------------------------------------------ voices
def env(n, a=0.004, rel=0.04, dur=None):
    t = np.arange(n) / SR; d = (n / SR) if dur is None else dur
    return np.minimum(1, t / a) * np.minimum(1, np.maximum(0, d - t) / rel)

def guitar(f, dur, mute=0.5):
    """palm-muted distorted power chord: root + fifth + octave"""
    n = int(SR * dur); t = np.arange(n) / SR
    x = 0
    for r, g in ((1, 1.0), (1.5, 0.8), (2, 0.6)):
        x = x + g * (osc('saw', f * r, n, SR) + osc('saw', f * r * 1.006, n, SR))
    x = lp(x, 2200, SR, 2)
    x = drive(x * 0.45, 5.0)
    return lp(x, 3200, SR, 1) * np.exp(-t / (dur * mute + 0.02)) * env(n, 0.002, 0.012)

def twang(f, dur, vib=5.2):
    n = int(SR * dur); t = np.arange(n) / SR
    fm = f * (1 + 0.007 * np.sin(2 * np.pi * vib * t) * np.minimum(1, np.maximum(0, t - 0.12) / 0.3))
    s = osc('saw', fm, n, SR) + 0.6 * osc('pulse', fm * 1.002, n, SR)
    br = np.exp(-t / 0.28)
    x = lp(s, 5500, SR, 2) * br + lp(s, 1500, SR, 2) * (1 - br)
    return x * 0.6 * env(n, 0.004, 0.07)

def brass(f, dur, swell=0.22):
    n = int(SR * dur); t = np.arange(n) / SR
    s = osc('saw', f, n, SR) + osc('saw', f * 1.004, n, SR) + 0.5 * osc('saw', f * 0.996, n, SR)
    u = np.minimum(1, t / swell)
    x = lp(s, 650, SR, 2) * (1 - u) + lp(s, 2600, SR, 2) * u
    return x * 0.5 * env(n, 0.05, 0.12)

def strstac(f, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    x = lp(osc('saw', f, n, SR) + osc('saw', f * 1.007, n, SR) + osc('saw', f * 0.993, n, SR), 1800, SR, 2)
    return x * 0.5 * np.exp(-t / (dur * 0.6)) * env(n, 0.006, 0.02)

def sub(f, dur, bright=420, drv=1.6):
    n = int(SR * dur)
    x = osc('sin', f, n, SR) + 0.45 * osc('saw', f, n, SR)
    return drive(lp(x, bright, SR, 2), drv) * env(n, 0.006, 0.03)

def arpv(f, dur, bright=3600, decay=0.1):
    n = int(SR * dur); t = np.arange(n) / SR
    x = lp(osc('saw', f, n, SR) + osc('saw', f * 1.004, n, SR), bright, SR, 2)
    return x * 0.5 * np.exp(-t / decay) * env(n, 0.002, 0.01)

def lead(f, dur, bright=6500, vib=5.5):
    n = int(SR * dur); t = np.arange(n) / SR
    fm = f * (1 + 0.004 * np.sin(2 * np.pi * vib * t) * np.minimum(1, np.maximum(0, t - 0.15) / 0.3))
    x = np.zeros(n)
    for d in (-0.14, -0.06, 0, 0.06, 0.14):
        x += osc('saw', fm * 2 ** (d / 12), n, SR, (abs(d) * 7.3) % 1) * 0.2
    return lp(x, bright, SR, 2) * env(n, 0.012, 0.09)

def stab(freqs, dur, bright=4500, decay=0.35):
    n = int(SR * dur); t = np.arange(n) / SR; x = np.zeros(n)
    for f in freqs:
        for d in (-0.1, 0, 0.1): x += osc('saw', f * 2 ** (d / 12), n, SR, (f * 0.37 + d * 3) % 1) * 0.12
    return lp(x, bright, SR, 2) * (0.35 + 0.65 * np.exp(-t / decay)) * env(n, 0.003, 0.04)

def offbass(f, dur, bright=900):
    n = int(SR * dur)
    x = osc('saw', f, n, SR) + osc('saw', f * 1.003, n, SR) + 0.6 * osc('sin', f, n, SR)
    return drive(lp(x, bright, SR, 2) * 0.6, 2.2) * env(n, 0.003, 0.02)

def put_notes(s, track, bar0, notes, fn, gain=1.0, bars=1, step=1):
    for n0, m, d in notes: s.put(track, bar0, n0, fn(freq(m), d * s.beat * 0.96), gain)

def roll(s, track, bar, beat0, beats, r, g0=0.15, g1=0.8, steps=16):
    for q in range(steps):
        u = q / max(1, steps - 1); s.put(track, bar, beat0 + q * beats / steps, snare(SR, r), g0 + (g1 - g0) * u)


# ------------------------------------------------------------------ 03 frontier: gunslinger gallop
def frontier():
    s = Song(132, 28, seed=31); r = s.rng
    K, SN, CL, CR = kick(SR, r, 0.1, 150, 48), snare(SR, r), clap(r), crash(SR, r)
    A = [(40, 'E'), (41, 'F'), (35, 'B'), (40, 'E')]                         # Em  F  B  Em
    B = [(45, 'A'), (40, 'E'), (41, 'F'), (35, 'B')]                         # Am  Em F  B
    hookA = [[(0, 71, .5), (.5, 72, .5), (1, 71, .5), (1.5, 68, .5), (2, 69, 1), (3, 71, 1)],
             [(0, 72, 1), (1, 77, 1), (2, 76, .5), (2.5, 72, .5), (3, 69, 1)],
             [(0, 75, .5), (.5, 76, .5), (1, 78, 1), (2, 75, 1), (3, 71, 1)],
             [(0, 76, 2), (2, 71, 1), (3, 64, 1)]]
    hookA2 = hookA[:3] + [[(0, 76, 1), (1, 79, 1), (2, 76, 2)]]
    hookB = [[(0, 76, 1.5), (1.5, 81, .5), (2, 79, 1), (3, 76, 1)],
             [(0, 79, 1), (1, 76, .5), (1.5, 74, .5), (2, 71, 2)],
             [(0, 77, 1), (1, 81, 1), (2, 77, .5), (2.5, 76, .5), (3, 72, 1)],
             [(0, 75, 1), (1, 78, 1), (2, 80, 1), (3, 83, 1)]]
    gal = [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1]
    for bar in range(28):
        sec = 'intro' if bar < 4 else 'A' if bar < 12 else 'B' if bar < 20 else 'A2'
        prog = A if sec in ('A', 'A2', 'intro') else B
        rt, _ = prog[bar % 4]
        guitar_on = bar >= 2
        if guitar_on:
            for st in range(16):
                if gal[st] and not (bar % 8 == 7 and st >= 12):
                    note = rt + (12 if st in (6, 14) and sec != 'intro' else 0)
                    s.put('gtr', bar, st * 0.25, guitar(freq(note + 12), 0.2, 0.45), 0.62 if st % 4 == 0 else 0.4)
        for b in (0, 1.5, 2):
            if bar >= 1: s.put('bass', bar, b, sub(freq(rt), 0.45, 520, 1.8), 0.85)
        if bar >= 2:
            for b in ((0, 1.5, 2, 3.5) if sec != 'intro' else (0, 2)): s.put('kick', bar, b, K, 0.95); s.kicks.append(s.t(bar, b))
            for b in (1, 3):
                s.put('perc', bar, b, SN, 0.8); s.put('perc', bar, b, CL, 0.4)
            for st in range(8): s.put('hat', bar, st * 0.5 + 0.25, hat(SR, r), 0.32)
        elif bar == 0:
            for b in (0, 2): s.put('kick', bar, b, K, 0.8); s.kicks.append(s.t(bar, b))
        if bar in (4, 12, 20): s.put('perc', bar, 0, CR, 0.6)
        if bar in (3, 11, 19, 27): roll(s, 'perc', bar, 2, 2, r, 0.1, 0.7, 16)
        if sec == 'A': put_notes(s, 'lead', bar, (hookA if (bar - 4) // 4 % 2 == 0 else hookA2)[bar % 4], lambda f, d: twang(f, d), 0.8)
        if sec == 'B': put_notes(s, 'lead', bar, hookB[bar % 4], lambda f, d: twang(f, d), 0.8)
        if sec == 'A2':
            put_notes(s, 'lead', bar, (hookA if (bar - 20) // 4 % 2 == 0 else hookA2)[bar % 4], lambda f, d: twang(f, d), 0.8)
            put_notes(s, 'harm', bar, [(a, b - 5, c) for a, b, c in (hookA if (bar - 20) // 4 % 2 == 0 else hookA2)[bar % 4]], lambda f, d: twang(f, d), 0.45)
        if bar in (3, 19) : s.put('fx', bar, 0, riser(s.bar, r), 0.5)
    s.tr['bass'] = s.duck(s.tr['bass'], 0.45, 0.1)
    s.tr['lead'] = echo(s.tr['lead'], SR, s.beat * 0.75, 0.3, 0.28)
    return s.mix(dict(gtr=0.85, bass=0.9, kick=0.95, perc=0.75, hat=0.5, lead=0.95, harm=0.8, fx=0.7), 0.14, 0.5, 1.2)


# ------------------------------------------------------------------ 04 frontier big: war march
def frontier_big():
    s = Song(84, 20, seed=41); r = s.rng
    K, SN, D1, D2, CR = kick(SR, r, 0.18, 120, 42), snare(SR, r), tom(SR, r, 55), tom(SR, r, 80), crash(SR, r)
    prog = [(33, 'Am'), (29, 'F'), (26, 'Dm'), (28, 'E')]
    triad = {'Am': [0, 3, 7], 'F': [0, 4, 7], 'Dm': [0, 3, 7], 'E': [0, 4, 7]}
    theme = [[(0, 69, 1), (1, 72, 1), (2, 76, 2)], [(0, 77, 1.5), (1.5, 76, .5), (2, 72, 2)],
             [(0, 74, 1), (1, 77, 1), (2, 81, 2)], [(0, 80, 1), (1, 76, 1), (2, 71, 1), (3, 68, 1)]]
    answer = [[(0, 81, 1.5), (1.5, 79, .5), (2, 76, 2)], [(0, 77, 1), (1, 79, 1), (2, 81, 2)],
              [(0, 82, 1), (1, 81, 1), (2, 77, 2)], [(0, 80, 2), (2, 83, 1), (3, 80, 1)]]
    for bar in range(20):
        sec = 'intro' if bar < 4 else 'A' if bar < 12 else 'B'
        rt, nm = prog[bar % 4]; ch = [rt + 24 + i for i in triad[nm]]
        n = int(SR * s.bar * 1.03)
        s.put('drone', bar, 0, drive(osc('saw', freq(rt), n, SR) * 0.3 + osc('sin', freq(rt - 12 if rt > 28 else rt), n, SR) * 0.9, 1.4) * env(n, 0.3, 0.3), 0.4)
        s.put('pad', bar, 0, padv([freq(m) for m in ch], s.bar * 1.05, 1100, 0.9), 0.45 if sec != 'intro' else 0.3)
        for b in (0, 2.5): s.put('perc', bar, b, D1, 1.0)
        s.put('kick', bar, 0, K, 0.9); s.put('kick', bar, 2.5, K, 0.75); s.kicks += [s.t(bar, 0), s.t(bar, 2.5)]
        s.put('perc', bar, 2, SN, 0.85)
        if bar >= 4:
            for st in range(8): s.put('perc', bar, st * 0.5 + 0.25, D2, 0.16 + 0.1 * (st % 2 == 0))
            for st in range(8):
                m = ch[0] - 12 + (7 if st % 2 else 0)
                s.put('str', bar, st * 0.5, strstac(freq(m), 0.22), 0.5)
        if bar in (4, 12): s.put('perc', bar, 0, CR, 0.7)
        if bar >= 4 and sec == 'A': put_notes(s, 'brass', bar, theme[bar % 4], lambda f, d: brass(f / 2, d), 1.0)
        if sec == 'B':
            put_notes(s, 'brass', bar, theme[bar % 4], lambda f, d: brass(f / 2, d), 1.0)
            put_notes(s, 'lead2', bar, answer[bar % 4], lambda f, d: lead(f, d, 3200), 0.38)
        if bar == 3 or bar == 11: roll(s, 'perc', bar, 2, 2, r, 0.1, 0.55, 8)
        if bar == 19: roll(s, 'perc', bar, 1, 3, r, 0.1, 0.65, 16)
    s.tr['lead2'] = echo(s.tr['lead2'], SR, s.beat * 0.75, 0.35, 0.3)
    return s.mix(dict(drone=0.7, pad=0.8, perc=1.0, kick=0.85, str=0.8, brass=0.95, lead2=0.8), 0.28, 1.1, 1.1)


# ------------------------------------------------------------------ 05 horizon: dark synthwave
def horizon():
    s = Song(124, 32, seed=51); r = s.rng
    K, SN, CL, HO, CR = kick(SR, r, 0.12, 170, 46), snare(SR, r), clap(r), hat(SR, r, True), crash(SR, r)
    P1 = [(35, 'm'), (31, 'M'), (38, 'M'), (33, 'M')]                          # Bm G D A
    P2 = [(35, 'm'), (31, 'M'), (40, 'm'), (42, 'M')]                          # Bm G Em F#
    hook = [[(0, 78, 1), (1, 81, .5), (1.5, 78, .5), (2, 74, 1), (3, 76, 1)],
            [(0, 79, 1.5), (1.5, 78, .5), (2, 74, 2)],
            [(0, 81, 1), (1, 78, 1), (2, 74, 1), (3, 78, 1)],
            [(0, 81, 1.5), (1.5, 83, .5), (2, 81, 1), (3, 76, 1)]]
    hook2 = [[(0, 83, 1), (1, 81, .5), (1.5, 78, .5), (2, 81, 2)],
             [(0, 79, 1), (1, 83, 1), (2, 81, 1), (3, 79, 1)],
             [(0, 76, 1), (1, 79, 1), (2, 83, 1.5), (3.5, 81, .5)],
             [(0, 78, 2), (2, 80, 1), (3, 82, 1)]]
    arpi = [0, 1, 2, 1, 0, 1, 2, 3]
    for bar in range(32):
        sec = 'intro' if bar < 4 else 'A' if bar < 12 else 'B' if bar < 20 else 'brk' if bar < 24 else 'C'
        prog = P1 if sec in ('intro', 'A', 'brk') or bar % 8 < 4 else P2
        rt, kd = prog[bar % 4]; third = 3 if kd == 'm' else 4
        ch = [rt + 24, rt + 24 + third, rt + 24 + 7, rt + 36]
        full = sec in ('A', 'B', 'C')
        if full or sec == 'intro':
            for b in range(4): s.put('kick', bar, b, K, 0.95 if full else 0.7); s.kicks.append(s.t(bar, b))
        if full:
            for st in range(8): s.put('bass', bar, st * 0.5, offbass(freq(rt + (12 if st % 4 == 3 else 0)), 0.2, 700 + 600 * (st % 2)), 0.62)
            for b in (1, 3): s.put('perc', bar, b, SN, 0.8); s.put('perc', bar, b, CL, 0.45)
            for st in range(16): s.put('hat', bar, st * 0.25, HO if st % 4 == 2 else hat(SR, r), 0.34 if st % 2 else 0.2)
        s.put('pad', bar, 0, padv([freq(m - 12) for m in ch[:3]], s.bar * 1.02, 2000, 0.08), 0.42 if sec != 'brk' else 0.6)
        if sec != 'intro' or bar >= 2:
            for st in range(16): s.put('arp', bar, st * 0.25, arpv(freq(ch[arpi[st % 8] % 4]), 0.16, 3600, 0.08), 0.28 if sec != 'brk' else 0.34)
        if sec == 'B': put_notes(s, 'lead', bar, hook[bar % 4], lambda f, d: lead(f, d, 6000), 0.36)
        if sec == 'C':
            put_notes(s, 'lead', bar, hook2[bar % 4] if bar % 8 >= 4 else hook[bar % 4], lambda f, d: lead(f, d, 6800), 0.38)
        if sec == 'brk' and bar >= 22: put_notes(s, 'lead', bar, hook[bar % 4], lambda f, d: lead(f, d, 4500), 0.3)
        if bar in (4, 12, 24): s.put('perc', bar, 0, CR, 0.6)
        if bar in (11, 19, 23, 31): s.put('fx', bar, 0, riser(s.bar, r), 0.8)
        if bar in (11, 19, 31): roll(s, 'perc', bar, 3, 1, r, 0.2, 0.8, 8)
    for k in ('pad', 'arp'): s.tr[k] = s.duck(s.tr[k], 0.65, 0.12)
    s.tr['bass'] = s.duck(s.tr['bass'], 0.5, 0.1)
    s.tr['lead'] = echo(s.tr['lead'], SR, s.beat * 0.75, 0.35, 0.3)
    return s.mix(dict(kick=0.95, pad=0.8, bass=0.9, perc=0.75, hat=0.5, arp=0.85, lead=0.95, fx=0.7), 0.2, 0.8, 1.2)


# ------------------------------------------------------------------ 06 horizon big: anthem trance
def horizon_big():
    s = Song(140, 32, seed=61); r = s.rng
    K, SN, CL, HO, CR = kick(SR, r, 0.11, 160, 46), snare(SR, r), clap(r), hat(SR, r, True), crash(SR, r)
    prog = [(37, [0, 3, 7]), (33, [0, 4, 7]), (40, [0, 4, 7]), (35, [0, 4, 7])]          # C#m A E B
    hook = [[(0, 76, 1), (1, 80, 1), (2, 83, 2)], [(0, 81, 1.5), (1.5, 80, .5), (2, 76, 2)],
            [(0, 83, 1), (1, 85, 1), (2, 83, 1), (3, 80, 1)], [(0, 78, 1.5), (1.5, 80, .5), (2, 75, 2)]]
    hook2 = [[(0, 88, 1), (1, 85, 1), (2, 83, 2)], [(0, 81, 1), (1, 85, 1), (2, 88, 2)],
             [(0, 86, 1), (1, 83, 1), (2, 80, 1), (3, 83, 1)], [(0, 87, 2), (2, 83, 1), (3, 80, 1)]]
    for bar in range(32):
        sec = 'intro' if bar < 4 else 'A' if bar < 12 else 'brk' if bar < 20 else 'drop'
        rt, tri = prog[bar % 4]; ch = [rt + 24 + i for i in tri] + [rt + 36]
        full = sec in ('A', 'drop')
        if sec in ('intro', 'A', 'drop'):
            for b in range(4): s.put('kick', bar, b, K, 0.95 if sec != 'intro' else 0.7); s.kicks.append(s.t(bar, b))
        if full:
            for b in (1, 3): s.put('perc', bar, b, CL, 0.55); s.put('perc', bar, b, SN, 0.45)
            for b in range(4): s.put('hat', bar, b + 0.5, HO, 0.4)
            for st in range(16): s.put('hat', bar, st * 0.25, hat(SR, r), 0.15)
            for b in range(4):
                for o in (0.25, 0.5, 0.75): s.put('bass', bar, b + o, offbass(freq(rt + 12), 0.16, 650), 0.55)
        s.put('pad', bar, 0, padv([freq(m - 12) for m in ch[:3]], s.bar * 1.02, 2400, 0.12), 0.5 if sec != 'drop' else 0.4)
        if sec == 'intro' and bar >= 2 or sec == 'A' or sec == 'drop':
            for st in range(16): s.put('arp', bar, st * 0.25, arpv(freq(ch[[0, 2, 1, 3][st % 4]] + (12 if st % 8 >= 4 else 0)), 0.18, 4200, 0.09), 0.26)
        if sec == 'A' and bar % 4 in (1, 3) or sec == 'drop':
            for b in (0, 1.5, 3): s.put('stab', bar, b, stab([freq(m) for m in ch[:3]], 0.45), 0.4)
        if sec == 'brk':
            for n0, m, d in (hook[bar % 4] if bar >= 12 else []): s.put('lead', bar, n0, lead(freq(m), d * s.beat * 0.97, 5200), 0.36)
        if sec == 'drop':
            h = hook2[bar % 4] if bar % 8 >= 4 else hook[bar % 4]
            for n0, m, d in h: s.put('lead', bar, n0, lead(freq(m), d * s.beat * 0.97, 7000), 0.4)
        if bar in (4, 12, 20): s.put('perc', bar, 0, CR, 0.65)
        if bar in (11, 19, 31): s.put('fx', bar, 0, riser(s.bar, r), 0.85)
        if bar in (19, 31) or bar == 15: roll(s, 'perc', bar, 2, 2, r, 0.12, 0.85, 16)
    for k in ('pad', 'arp', 'stab'):
        if k in s.tr: s.tr[k] = s.duck(s.tr[k], 0.6, 0.12)
    s.tr['bass'] = s.duck(s.tr['bass'], 0.6, 0.09)
    s.tr['lead'] = echo(s.tr['lead'], SR, s.beat * 0.75, 0.35, 0.3)
    return s.mix(dict(kick=0.95, pad=0.75, bass=0.85, perc=0.8, hat=0.5, arp=0.8, stab=0.75, lead=0.95, fx=0.7), 0.22, 0.9, 1.2)


def master(x):
    """the raw mixes were ~55% sub-bass energy (silent on phone speakers, hiding the melodies): thin the lows, lift the presence, then glue"""
    x = hp(x, 38, SR, 2)
    x = x - 0.62 * lp(x, 140, SR, 2)                       # low shelf down
    x = x + 0.55 * bp(x, 700, 3800, SR, 1)                 # presence for leads / guitars / brass
    x = drive(x, 1.15)
    return x

TR = {'03_stage_frontier': frontier, '04_stage_frontier_big': frontier_big, '05_stage_horizon': horizon, '06_stage_horizon_big': horizon_big}
if __name__ == '__main__':
    for name in (sys.argv[1:] or list(TR)):
        x = master(TR[name]())
        save(os.path.join(ROOT, 'bgm', name + '.wav'), x, SR, 0.78 if name == '03_stage_frontier' else 0.88)
        print(name, round(len(x) / SR, 1), 's', 'rms/peak', round(float(np.sqrt((x ** 2).mean())) / float(np.abs(x).max()), 3))
