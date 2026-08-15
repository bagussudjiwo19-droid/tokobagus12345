import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

// ============================================================================
// Efek suara halus untuk umpan balik aksi:
//   - BERHASIL → "tok" (nada lebih rendah, satu kali)
//   - GAGAL    → "tik" DUA KALI (nada lebih tinggi, cepat) agar jelas ini gagal
// Volume tipis & natural, tidak melelahkan telinga. Hanya berbunyi di HP (build).
// ============================================================================

let tik: AudioPlayer | null = null; // nada tinggi
let tok: AudioPlayer | null = null; // nada rendah
let ready = false;

function ensure() {
  if (ready) return;
  ready = true;
  try {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    tik = createAudioPlayer(require("../assets/sounds/tik.wav"));
    tok = createAudioPlayer(require("../assets/sounds/tok.wav"));
    if (tik) tik.volume = 0.7;
    if (tok) tok.volume = 0.7;
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
  // Aksi berhasil → satu "tok" lembut.
  playOk() { ensure(); play(tok); },
  // Aksi gagal → "tik" dua kali beruntun.
  playFail() {
    ensure();
    play(tik);
    setTimeout(() => play(tik), 150);
  },
};
