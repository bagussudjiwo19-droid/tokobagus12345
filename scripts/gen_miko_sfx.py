"""Sintesis 11 efek suara Miko yang LEMBUT & menyenangkan (kawaii) memakai stdlib.
Nada berbasis sinus + sedikit harmonik + envelope halus (tanpa klik). Peak ~0.5.
Output 44.1kHz 16-bit mono WAV ke assets/sounds/."""
import math
import struct
import wave
import os

SR = 44100
OUT = "/app/frontend/assets/sounds"
os.makedirs(OUT, exist_ok=True)

# Frekuensi nada (Hz)
N = {
    "C5": 523.25, "D5": 587.33, "E5": 659.25, "G5": 783.99, "A5": 880.00,
    "C6": 1046.50, "D6": 1174.66, "E6": 1318.51, "G6": 1567.98, "A6": 1760.00, "B6": 1975.53,
}


def note(freq, dur, amp=0.5, harmonics=(1.0, 0.28, 0.12), decay=6.0, attack=0.008, shimmer=0.0):
    """Satu nada bell-ish: fundamental + harmonik, envelope attack cepat + decay eksponensial."""
    n = int(SR * dur)
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        # envelope
        if t < attack:
            env = t / attack
        else:
            env = math.exp(-decay * (t - attack))
        s = 0.0
        vib = 1.0 + (shimmer * math.sin(2 * math.pi * 6.5 * t)) if shimmer else 1.0
        for k, h in enumerate(harmonics, start=1):
            s += h * math.sin(2 * math.pi * freq * k * vib * t)
        out[i] = amp * env * s
    return out


def pop(dur=0.08, f0=240, f1=120, amp=0.5):
    """Bunyi 'pop' lembut: pitch turun cepat."""
    n = int(SR * dur)
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        frac = i / n
        f = f0 + (f1 - f0) * frac
        env = math.sin(math.pi * frac) ** 0.6  # naik-turun mulus
        out[i] = amp * env * math.sin(2 * math.pi * f * t)
    return out


def mix(layers):
    """Gabung beberapa (offset_detik, samples) → satu track."""
    total = 0
    for off, buf in layers:
        total = max(total, int(off * SR) + len(buf))
    track = [0.0] * total
    for off, buf in layers:
        start = int(off * SR)
        for i, v in enumerate(buf):
            track[start + i] += v
    return track


def seq(notes, gap=0.0):
    """Rangkai nada berurutan: list of (freq,dur,amp,decay). Kembalikan layers."""
    layers = []
    t = 0.0
    for spec in notes:
        f, dur, amp, dec = spec
        layers.append((t, note(f, dur, amp=amp, decay=dec)))
        t += dur * (1 - 0) + gap
    return layers


def save(name, track):
    # normalisasi ke peak 0.5 agar aman & seragam
    peak = max(1e-6, max(abs(x) for x in track))
    scale = 0.5 / peak
    # sedikit fade-out 5ms agar tak ada klik di akhir
    fade = int(0.005 * SR)
    n = len(track)
    frames = bytearray()
    for i, x in enumerate(track):
        v = x * scale
        if i > n - fade:
            v *= (n - i) / fade
        vi = int(max(-1.0, min(1.0, v)) * 32767)
        frames += struct.pack("<h", vi)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(frames))
    print(f"[OK] {name} ({n/SR:.2f}s)")


# ---------- POSITIF / BERHASIL ----------
# Miko Sparkle: 2-3 nada lembut, naik di akhir (+shimmer di nada terakhir)
save("miko_sparkle.wav", mix([
    (0.00, note(N["A5"], 0.16, amp=0.42, decay=7)),
    (0.12, note(N["C6"], 0.18, amp=0.44, decay=6)),
    (0.26, note(N["E6"], 0.42, amp=0.5, decay=4.5, shimmer=0.015)),
]))

# Miko Bell: satu bunyi bel hangat (harmonik kaya, decay panjang)
save("miko_bell.wav", mix([
    (0.00, note(660, 0.75, amp=0.5, harmonics=(1.0, 0.5, 0.25, 0.12), decay=3.4)),
]))

# Miko Magic: chime kecil berkilauan (arpeggio tinggi cepat + shimmer)
save("miko_magic.wav", mix([
    (0.00, note(N["E6"], 0.12, amp=0.34, decay=8, shimmer=0.02)),
    (0.08, note(N["G6"], 0.12, amp=0.36, decay=8, shimmer=0.02)),
    (0.16, note(N["B6"], 0.34, amp=0.42, decay=6, shimmer=0.03)),
]))

# Miko Happy: 3 nada pendek ceria
save("miko_happy.wav", mix([
    (0.00, note(N["G5"], 0.11, amp=0.46, decay=9)),
    (0.12, note(N["A5"], 0.11, amp=0.46, decay=9)),
    (0.24, note(N["C6"], 0.20, amp=0.5, decay=7)),
]))

# Miko Pop: pop lembut + chime kecil
save("miko_pop.wav", mix([
    (0.00, pop(0.09, 260, 120, amp=0.5)),
    (0.10, note(N["C6"], 0.26, amp=0.4, decay=6, shimmer=0.01)),
]))

# Miko Premium: chime bersih & elegan (interval C6+G6 sinus murni, ekor panjang)
save("miko_premium.wav", mix([
    (0.00, note(N["C6"], 0.7, amp=0.4, harmonics=(1.0, 0.15), decay=3.0)),
    (0.06, note(N["G6"], 0.7, amp=0.34, harmonics=(1.0, 0.12), decay=3.0)),
]))

# ---------- SUBTIL / GAGAL ----------
# Miko Oops: dua nada lembut, turun di akhir
save("miko_oops.wav", mix([
    (0.00, note(N["E6"], 0.16, amp=0.44, decay=7)),
    (0.14, note(N["C6"], 0.30, amp=0.46, decay=5)),
]))

# Miko Gentle Warning: pendek, rendah, halus
save("miko_warning.wav", mix([
    (0.00, note(330, 0.22, amp=0.46, harmonics=(1.0, 0.3), decay=6)),
]))

# Miko Try Again: nada pendek menurun (G5→E5→C5)
save("miko_tryagain.wav", mix([
    (0.00, note(N["G5"], 0.10, amp=0.44, decay=9)),
    (0.11, note(N["E5"], 0.10, amp=0.44, decay=9)),
    (0.22, note(N["C5"], 0.18, amp=0.46, decay=7)),
]))

# Miko Soft Blip: blip lembut (satu nada mid singkat)
save("miko_blip.wav", mix([
    (0.00, note(600, 0.10, amp=0.46, harmonics=(1.0, 0.2), decay=10)),
]))

# Miko Hmm: nada kecil seperti berpikir (naik sedikit lalu bertanya)
save("miko_hmm.wav", mix([
    (0.00, note(300, 0.16, amp=0.42, harmonics=(1.0, 0.35), decay=6)),
    (0.15, note(360, 0.22, amp=0.42, harmonics=(1.0, 0.35), decay=5)),
]))

print("DONE")
