#!/usr/bin/env python3
# Render three 60-second seamless racing-music loops as 22.05kHz mono WAVs.
# Usage: python3 -I compose.py /path/to/output/dir
# Circular-buffer rendering: every event tail wraps around the loop end, so
# the WAV loops with zero seam (exact periodicity).
import math, random, re, sys, os, time, wave

SR = 22050
TABN = 16384
TAB = [math.sin(2.0 * math.pi * i / TABN) for i in range(TABN)]
MASK = TABN - 1
PC = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}

def nm(name):
    m = re.fullmatch(r'([A-G][b#]?)(-?\d)', name)
    return (int(m.group(2)) + 1) * 12 + PC[m.group(1)]

def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)

class Loop:
    def __init__(self, bars, bpm):
        self.step = 60.0 / bpm / 4.0          # one grid unit = a sixteenth
        self.N = int(round(bars * 16 * self.step * SR))
        self.buf = [0.0] * self.N
    def add(self, step, samps, amp=1.0):
        off = int(round(step * self.step * SR))
        n = len(samps)
        N, b = self.N, self.buf
        if off + n <= N:
            for i in range(n):
                b[off + i] += samps[i] * amp
        else:
            for i in range(n):
                j = off + i
                if j >= N: j -= N
                b[j] += samps[i] * amp

def osc(midi, dur, harm, atk, tau, floor):
    """table-based additive osc. harm = [(weight, detune_cents), ...]"""
    f = hz(midi)
    n = int(dur * SR)
    if n < 2: return [0.0] * max(1, n)
    inc = [f * 2.0 ** (dt / 1200.0) * TABN / SR for _, dt in harm]
    w = [x for x, _ in harm]
    ph = [0.0] * len(harm)
    out = [0.0] * n
    ka = int(atk * SR) or 1
    tautau = tau * SR
    for i in range(n):
        s = 0.0
        for k in range(len(harm)):
            ph[k] += inc[k]
            s += w[k] * TAB[int(ph[k]) & MASK]
        e = 1.0 if i >= ka else i / ka
        out[i] = s * e * (floor + (1.0 - floor) * math.exp(-(i / SR) / tau))
    return out

RNG = random.Random(7)
NOISE = [RNG.uniform(-1, 1) for _ in range(int(SR * 0.5))]

def hp(x, amt=0.9):
    out, prev = [], 0.0
    for v in x:
        out.append(amt * (out[-1] if out else 0.0) + v - prev)
        prev = v
    return out

def make_drums():
    D = {}
    # kick
    n = int(0.4 * SR); ph = 0.0; k = []
    for i in range(n):
        t = i / SR
        f = 44 + 110 * math.exp(-t / 0.045)
        ph += 2.0 * math.pi * f / SR
        k.append(math.sin(ph) * math.exp(-t / 0.14))
    for i in range(int(0.004 * SR)): k[i] += NOISE[i] * 0.4 * (1 - i / (0.004 * SR))
    D['kick'] = k
    # snare
    n = int(0.3 * SR)
    body = [NOISE[i] for i in range(n)]
    body = hp(body)
    for i in range(n):
        t = i / SR
        body[i] = body[i] * 0.55 * math.exp(-t / 0.11) + 0.4 * math.sin(2 * math.pi * 195 * t) * math.exp(-t / 0.07)
    D['snare'] = body
    # clap (Monza)
    n = int(0.3 * SR); c = [0.0] * n
    for b, g in ((0, 1.0), (10, 0.8), (20, 0.62), (30, 0.45)):
        o = int(b * SR / 1000.0)
        for i in range(min(n - o, int(0.06 * SR))):
            c[o + i] += NOISE[i] * g
    c = hp(c)
    for i in range(n):
        c[i] *= math.exp(-(i / SR) / 0.09)
    D['clap'] = c
    # hats
    for name, tau_, amp_ in (('hatc', 0.025, 1.0), ('hato', 0.09, 0.8)):
        n = int(0.2 * SR)
        h = hp([NOISE[i] for i in range(n)], 0.92)
        D[name] = [h[i] * amp_ * math.exp(-(i / SR) / tau_) * 0.6 for i in range(n)]
    # tom
    n = int(0.35 * SR); ph = 0.0; tom = []
    for i in range(n):
        t = i / SR
        f = 150 * math.exp(-t / 0.12) + 85
        ph += 2.0 * math.pi * f / SR
        tom.append(math.sin(ph) * math.exp(-t / 0.15) + NOISE[i] * 0.08 * math.exp(-t / 0.05))
    D['tom'] = tom
    return D

DRUM = make_drums()

SAW_BASS = [(1, 0), (0.6, 0.004), (0.34, -0.004), (0.2, 0.002), (0.11, -0.001)]
SAW_LEAD = [(1, 0.005), (0.62, -0.005), (0.4, 0.002), (0.27, -0.002), (0.16, 0.001), (0.09, 0)]
SAW_PAD  = [(1, 0.011), (0.8, -0.011), (0.6, 0.006), (0.42, -0.006), (0.25, 0.003)]

def bass(L, step, midi, dur, amp):
    L.add(step, osc(midi, dur, SAW_BASS, 0.004, 0.16, 0.55), amp)
    L.add(step, osc(midi - 12, dur, [(1, 0)], 0.004, 0.16, 0.6), amp * 0.5)

def lead(L, step, midi, dur, amp, echo=True):
    L.add(step, osc(midi, dur, SAW_LEAD, 0.012, max(0.12, dur * 0.6), 0.55), amp)
    if echo:
        L.add(step + 6, osc(midi, dur * 0.8, SAW_LEAD, 0.012, 0.1, 0.3), amp * 0.32)

def pad(L, step, root, quality, dur, amp):
    third = 3 if quality == 'm' else 4
    for j, off in enumerate((0, third, 7, 12)):
        L.add(step, osc(root + off, dur, SAW_PAD, 0.25, dur * 0.9, 0.8), amp * (1.0 if j < 3 else 0.7))

def arp(L, step, root, quality, amp):
    third = 3 if quality == 'm' else 4
    pat = [0, third, 7, 12, third + 12, 12, 7, third]
    for i in range(16):
        L.add(step + i, osc(root + pat[i % 8], 0.09, SAW_LEAD, 0.002, 0.05, 0.25),
              amp * (1.0 if i % 2 == 0 else 0.8))
        L.add(step + i + 8, osc(root + pat[i % 8], 0.06, SAW_LEAD, 0.002, 0.04, 0.2), amp * 0.25)

def drum(L, step, name, amp=1.0):
    L.add(step, DRUM[name], amp)

def fill(L, bar, bpm_kind):
    s = bar * 16
    drum(L, s + 8, 'snare', 0.8); drum(L, s + 10, 'snare', 0.85)
    drum(L, s + 12, 'tom', 0.9); drum(L, s + 13, 'tom', 0.8)
    drum(L, s + 14, 'tom', 1.0); drum(L, s + 15, 'snare', 1.0)

def transpose(seq, sem):
    return [(a, b, c + sem) for a, b, c in seq]

def prog_melody(L, bar0, prog, melody, amp, echo=True):
    """melody = [[(step_in_bar, dur_steps, note_name) per bar] per bar]"""
    for bi, evs in enumerate(melody):
        for st, du, note in evs:
            lead(L, (bar0 + bi) * 16 + st, nm(note), du * L.step, amp, echo)

def render(L, path):
    b = L.buf
    mx = max(abs(v) for v in b) or 1.0
    # soft clip then normalize to 0.85
    k = 1.25
    out = bytearray()
    tgt = 0.85 / (math.tanh(mx * k))
    for v in b:
        s = math.tanh(v * k) * tgt
        out += array_pack(s)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(bytes(out))
    return L.N / SR

import struct
def array_pack(v):
    return struct.pack('<h', int(max(-1, min(1, v)) * 32767))

# ---------------------------------------------------------------
# 1) GRÜNERING NORDSCHLEIFE — E minor, 144 bpm, 36 bars, epic rock
def grunering(path):
    L = Loop(36, 144)
    A = [('Em', 'm'), ('G', 'M'), ('D', 'M'), ('Em', 'm')]      # phrase prog A
    B = [('C', 'M'), ('G', 'M'), ('Am', 'm'), ('B', 'M')]       # phrase prog B
    bars = [A, A, A, B, B, A, B, B, A]                          # 9 phrases
    chords = [c for ph in bars for c in ph]                     # 36 chords
    for bi, (name, q) in enumerate(chords):
        root = nm(name[0] + (name[1] if len(name) > 1 and name[1] in 'b#' else '') + '4')
        pc = root % 12
        r2 = 36 + pc
        # bass: driving 8ths with octave lift
        pat = [0, 0, 12, 0, 0, 12, 0, 7]
        for i in range(8):
            bass(L, bi * 16 + i * 2, r2 + pat[i], 0.26, 0.5)
        # pad chords every bar, only from phrase 2 on
        if bi >= 4:
            pad(L, bi * 16, r2 + 12, q, 1.62, 0.06 if bi < 8 else 0.09)
    for bi in range(36):
        s = bi * 16
        thin = bi < 4 or bi >= 32
        if bi >= 2 or thin:
            drum(L, s, 'kick', 0.9); drum(L, s + 8, 'kick', 0.8)
            if bi >= 4 or thin: drum(L, s + 6, 'kick', 0.55)
            drum(L, s + 4, 'snare', 0.7); drum(L, s + 12, 'snare', 0.75)
            for i in range(0, 16, 2):
                drum(L, s + i, 'hatc', 0.30 if not thin else 0.2)
            if not thin and bi % 2: drum(L, s + 14, 'hato', 0.25)
        else:
            drum(L, s, 'kick', 0.85); drum(L, s + 8, 'kick', 0.75)
    for pb in (7, 11, 15, 19, 27, 31): fill(L, pb, 'gru')
    # counter-melody in phrase 2 (bars 4-7)
    cm = [[(0, 8, 'G4'), (8, 8, 'B4')], [(0, 8, 'A4'), (8, 8, 'B4')],
          [(0, 8, 'D5'), (8, 8, 'A4')], [(0, 8, 'G4'), (8, 8, 'E4')]]
    for b, ev in enumerate(cm):
        for st, du, note in ev:
            lead(L, b * 16 + st, nm(note), du * L.step, 0.16, False)
    # lead melodies: M1 (ph3), M2 (ph4), arp+lead (ph5,6), M3 x2 (ph7,8)
    M1 = [[(0, 2, 'E5'), (2, 2, 'D5'), (4, 2, 'C5'), (6, 4, 'E5'), (10, 2, 'G5'), (12, 4, 'E5')],
          [(0, 2, 'D5'), (2, 2, 'B4'), (4, 4, 'G4'), (8, 2, 'B4'), (10, 2, 'D5'), (12, 4, 'E5')],
          [(0, 2, 'E5'), (2, 2, 'C5'), (4, 4, 'A4'), (8, 2, 'C5'), (10, 2, 'E5'), (12, 4, 'G5')],
          [(0, 2, 'F#5'), (2, 2, 'D#5'), (4, 4, 'B4'), (8, 4, 'D#5'), (12, 4, 'F#5')]]
    M2 = [[(0, 2, 'G4'), (2, 2, 'A4'), (4, 4, 'B4'), (8, 2, 'C5'), (10, 2, 'D5'), (12, 4, 'E5')],
          [(0, 2, 'E5'), (2, 2, 'D5'), (4, 4, 'B4'), (8, 2, 'D5'), (10, 2, 'E5'), (12, 4, 'G5')],
          [(0, 2, 'A5'), (2, 2, 'G5'), (4, 4, 'E5'), (8, 2, 'D5'), (10, 2, 'E5'), (12, 4, 'C5')],
          [(0, 2, 'D#5'), (2, 2, 'F#5'), (4, 6, 'A5'), (10, 2, 'F#5'), (12, 4, 'D#5')]]
    M3 = [[(0, 4, 'E5'), (4, 4, 'G5'), (8, 6, 'A5'), (14, 2, 'G5')],
          [(0, 6, 'B5'), (6, 2, 'A5'), (8, 4, 'G5'), (12, 4, 'D5')],
          [(0, 4, 'C6'), (4, 4, 'B5'), (8, 4, 'A5'), (12, 4, 'E5')],
          [(0, 2, 'B5'), (2, 6, 'D#6'), (8, 2, 'C6'), (10, 6, 'B5')]]
    prog_melody(L, 8, B, M1, 0.30)
    prog_melody(L, 12, B, M2, 0.30)
    for bi in range(16, 24):                       # arpeggio under ph5-6
        name, q = chords[bi]
        arp(L, bi * 16, nm(name[0] + (name[1] if len(name) > 1 and name[1] in 'b#' else '') + '4') % 12 + 60, q, 0.16)
    prog_melody(L, 24, B, transpose_mel(M3, 0), 0.32)
    prog_melody(L, 28, B, M3, 0.32)
    return render(L, path)

def transpose_mel(mel, sem):
    out = []
    for bar in mel:
        out.append([(st, du, shift_note(n, sem)) for st, du, n in bar])
    return out

def shift_note(name, sem):
    m = nm(name) + sem
    octv, pc = divmod(m, 12)
    NAT = {0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F', 6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B'}
    return NAT[pc] + str(octv - 1)

# ---------------------------------------------------------------
# 2) SAKURA CIRCUIT 8 — A minor, 160 bpm, 40 bars, J-synthwave
def sakura(path):
    L = Loop(40, 160)
    PA = [('Am', 'm'), ('F', 'M'), ('G', 'M'), ('C', 'M')]
    PB = [('F', 'M'), ('G', 'M'), ('Em', 'm'), ('Am', 'm')]
    bars = [PA, PB, PA, PB, PA, PB, PA, PB, PA, PA]
    chords = [c for ph in bars for c in ph]
    def root4(name):
        return nm(name[0] + (name[1] if len(name) > 1 and name[1] in 'b#' else '') + '4')
    for bi, (name, q) in enumerate(chords):
        r2 = 36 + root4(name) % 12
        thin = bi < 2 or bi >= 36
        # 16th driving bass
        if not (bi < 2):
            for i in range(16):
                octv = 12 if (i == 6 or i == 14) else (7 if i == 10 else 0)
                bass(L, bi * 16 + i, r2 + octv, 0.085, 0.42 if not thin else 0.25)
        if bi >= 2:
            pad(L, bi * 16, r2 + 12, q, 1.5, 0.05)
        if bi >= 4 and bi not in (16, 17, 18, 19):
            arp(L, bi * 16, root4(name) % 12 + 60, q, 0.15)
    for bi in range(40):
        s = bi * 16
        thin = bi < 2 or bi >= 36
        drum(L, s, 'kick', 0.85)
        if not thin:
            drum(L, s + 3, 'kick', 0.6); drum(L, s + 11, 'kick', 0.7)
        drum(L, s + 4, 'snare', 0.7); drum(L, s + 12, 'snare', 0.72)
        for i in range(0, 16, 2):
            drum(L, s + i, 'hatc', 0.28)
            if not thin: drum(L, s + i + 1, 'hato', 0.12)
        if bi in (7, 15, 23): fill(L, bi, 'sak')
    M1 = [[(0, 2, 'A5'), (2, 2, 'B5'), (4, 4, 'C6'), (8, 2, 'B5'), (10, 2, 'A5'), (12, 4, 'E5')],
          [(0, 2, 'A5'), (2, 2, 'G5'), (4, 4, 'F5'), (8, 4, 'A5'), (12, 4, 'C6')],
          [(0, 2, 'B5'), (2, 2, 'A5'), (4, 4, 'G5'), (8, 2, 'D5'), (10, 2, 'G5'), (12, 4, 'B5')],
          [(0, 4, 'C6'), (4, 2, 'B5'), (6, 2, 'A5'), (8, 4, 'G5'), (12, 4, 'E5')]]
    M2 = [[(0, 2, 'F5'), (2, 2, 'G5'), (4, 4, 'A5'), (8, 4, 'C6'), (12, 4, 'A5')],
          [(0, 2, 'B5'), (2, 2, 'C6'), (4, 6, 'D6'), (10, 2, 'B5'), (12, 4, 'G5')],
          [(0, 4, 'E6'), (4, 2, 'D6'), (6, 2, 'B5'), (8, 4, 'G5'), (12, 4, 'B5')],
          [(0, 6, 'A5'), (6, 2, 'E5'), (8, 4, 'A5'), (12, 4, 'C6')]]
    M3 = [[(0, 6, 'E6'), (6, 2, 'C6'), (8, 4, 'A5'), (12, 4, 'C6')],
          [(0, 2, 'A5'), (2, 2, 'C6'), (4, 6, 'F6'), (10, 2, 'E6'), (12, 4, 'C6')],
          [(0, 4, 'D6'), (4, 4, 'B5'), (8, 4, 'G5'), (12, 4, 'B5')],
          [(0, 2, 'C6'), (2, 6, 'E6'), (8, 8, 'G6')]]
    prog_melody(L, 8, PA, M1, 0.28)
    prog_melody(L, 12, PB, M2, 0.28)
    prog_melody(L, 20, PA, M1, 0.26)
    prog_melody(L, 24, PB, transpose_mel(M2, 12), 0.26)
    prog_melody(L, 32, PA, M3, 0.30)
    return render(L, path)

# ---------------------------------------------------------------
# 3) AUTODROMO VELOCE — F minor, 128 bpm, 32 bars, electro-Italo
def autodromo(path):
    L = Loop(32, 128)
    PA = [('Fm', 'm'), ('Db', 'M'), ('Ab', 'M'), ('Eb', 'M')]
    PZ = [('Db', 'M'), ('Eb', 'M'), ('Fm', 'm'), ('Fm', 'm')]
    bars = [PA, PA, PA, PA, PA, PA, PA, PZ]
    chords = [c for ph in bars for c in ph]
    def root4(name):
        return nm(name[0] + (name[1] if len(name) > 1 and name[1] in 'b#' else '') + '4')
    for bi, (name, q) in enumerate(chords):
        r2 = 36 + root4(name) % 12
        # offbeat stab bass
        for i in (2, 6, 10, 14):
            bass(L, bi * 16 + i, r2, 0.12, 0.42)
            bass(L, bi * 16 + i + 1, r2 + 12, 0.1, 0.2)
        pad(L, bi * 16, r2 + 12, q, 1.86, 0.055)
        if bi >= 4 and bi < 24:
            arp(L, bi * 16, root4(name) % 12 + 60, q, 0.12)
    for bi in range(32):
        s = bi * 16
        thin = bi >= 28
        for i in range(0, 16, 4):
            drum(L, s + i, 'kick', 0.95)
        if not thin:
            drum(L, s + 4, 'clap', 0.75); drum(L, s + 12, 'clap', 0.8)
            for i in range(2, 16, 4): drum(L, s + i, 'hato', 0.3)
            for i in range(0, 16, 2): drum(L, s + i, 'hatc', 0.14)
            if bi % 4 == 3:
                for i in (3, 7, 11, 13): drum(L, s + i, 'tom', 0.25)
        else:
            for i in range(0, 16, 2): drum(L, s + i, 'hatc', 0.12)
        if bi in (15, 27): fill(L, bi, 'aut')
    M1 = [[(0, 3, 'C5'), (3, 3, 'F5'), (6, 4, 'Ab5'), (10, 2, 'G5'), (12, 4, 'F5')],
          [(0, 3, 'Ab5'), (3, 3, 'F5'), (6, 4, 'Db5'), (10, 2, 'F5'), (12, 4, 'Ab5')],
          [(0, 4, 'C6'), (4, 2, 'Bb5'), (6, 2, 'Ab5'), (8, 4, 'Eb5'), (12, 4, 'Ab5')],
          [(0, 3, 'Bb5'), (3, 3, 'G5'), (6, 4, 'Eb5'), (10, 2, 'G5'), (12, 4, 'Bb5')]]
    M2 = [[(0, 4, 'F5'), (4, 4, 'Ab5'), (8, 6, 'C6'), (14, 2, 'Bb5')],
          [(0, 4, 'Ab5'), (4, 2, 'Bb5'), (6, 2, 'C6'), (8, 8, 'Db6')],
          [(0, 3, 'C6'), (3, 3, 'Bb5'), (6, 4, 'Ab5'), (10, 2, 'Eb5'), (12, 4, 'F5')],
          [(0, 2, 'G5'), (2, 2, 'Ab5'), (4, 4, 'Bb5'), (8, 8, 'Eb6')]]
    prog_melody(L, 12, PA, M1, 0.28)
    prog_melody(L, 16, PA, M2, 0.28)
    prog_melody(L, 20, PA, transpose_mel(M1, 12), 0.24)
    prog_melody(L, 24, PA, transpose_mel(M2, 12), 0.24)
    return render(L, path)

def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for fn, name in ((grunering, 'grunering'), (sakura, 'sakura'), (autodromo, 'autodromo')):
        t0 = time.time()
        p = os.path.join(out, name + '.wav')
        dur = fn(p)
        b = os.path.getsize(p)
        print(f'{name}: {dur:.2f}s {b/1e6:.2f}MB rendered in {time.time()-t0:.1f}s -> {p}')

if __name__ == '__main__':
    main()
