import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

// ============================================================================
// Efek suara halus untuk umpan balik aksi:
//   - "tik"  (lembut, pendek, nada agak tinggi)  → aksi BERHASIL
//   - "tok"  (sedikit lebih rendah & pelan)       → aksi GAGAL / belum tercatat
// Volume tipis & natural, tidak melelahkan telinga. Hanya berbunyi di HP (build).
// ============================================================================

let ok: AudioPlayer | null = null;
let fail: AudioPlayer | null = null;
let ready = false;

function ensure() {
  if (ready) return;
  ready = true;
  try {
    // Tetap berbunyi walau HP dalam mode senyap (silent switch).
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    ok = createAudioPlayer(require("../assets/sounds/tik.wav"));
    fail = createAudioPlayer(require("../assets/sounds/tok.wav"));
    if (ok) ok.volume = 0.7;
    if (fail) fail.volume = 0.7;
  } catch {
    /* abaikan bila audio tidak tersedia (mis. web) */
  }
}

function play(p: AudioPlayer | null) {
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    /* abaikan */
  }
}

export const sfx = {
  playOk() { ensure(); play(ok); },
  playFail() { ensure(); play(fail); },
};
