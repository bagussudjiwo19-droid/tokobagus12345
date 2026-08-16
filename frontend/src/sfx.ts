import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { api } from "./api";

// ============================================================================
// Efek suara umpan balik aksi. Pelanggan/kasir dapat MEMILIH SENDIRI bunyi tiap
// kejadian + tingkat volume (untuk toko ramai) dari menu "Suara Efek".
//   - ok    : barang masuk / aksi berhasil
//   - fail  : gagal / barang tidak masuk
//   - paid  : transaksi lunas
// Hanya berbunyi di HP (build), bukan web preview.
// ============================================================================

export type SfxId =
  | "beep" | "ding" | "dingdong" | "chime" | "chaching" | "coin" | "buzz" | "doublebuzz" | "blip";

// Daftar pilihan bunyi (label untuk ditampilkan di pengaturan).
export const SFX_LIBRARY: { id: SfxId; label: string }[] = [
  { id: "beep", label: "Beep Tegas" },
  { id: "ding", label: "Ding Lonceng" },
  { id: "dingdong", label: "Ding-Dong" },
  { id: "chime", label: "Chime Naik" },
  { id: "chaching", label: "Cha-Ching Kasir" },
  { id: "coin", label: "Koin" },
  { id: "blip", label: "Blip Halus" },
  { id: "buzz", label: "Buzz Rendah" },
  { id: "doublebuzz", label: "Buzz Dobel" },
];

const SOURCES: Record<SfxId, any> = {
  beep: require("../assets/sounds/sfx_beep.wav"),
  ding: require("../assets/sounds/sfx_ding.wav"),
  dingdong: require("../assets/sounds/sfx_dingdong.wav"),
  chime: require("../assets/sounds/sfx_chime.wav"),
  chaching: require("../assets/sounds/sfx_chaching.wav"),
  coin: require("../assets/sounds/sfx_coin.wav"),
  buzz: require("../assets/sounds/sfx_buzz.wav"),
  doublebuzz: require("../assets/sounds/sfx_doublebuzz.wav"),
  blip: require("../assets/sounds/sfx_blip.wav"),
};

// Tingkat volume → nilai 0..1.
export const VOLUME_LEVELS: Record<string, number> = { normal: 0.6, keras: 0.85, maks: 1.0 };

const players: Partial<Record<SfxId, AudioPlayer>> = {};
let ready = false;
let volume = VOLUME_LEVELS.keras;
let okId: SfxId = "dingdong";
let failId: SfxId = "buzz";
let paidId: SfxId = "chaching";

function ensure() {
  if (ready) return;
  ready = true;
  try {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    (Object.keys(SOURCES) as SfxId[]).forEach((id) => {
      try { players[id] = createAudioPlayer(SOURCES[id]); } catch { /* noop */ }
    });
    loadConfig();
  } catch { /* audio tidak tersedia (mis. web) */ }
}

function play(id: SfxId, vol = volume) {
  ensure();
  const p = players[id];
  if (!p) return;
  try { p.volume = vol; p.seekTo(0); p.play(); } catch { /* noop */ }
}

// Muat pilihan bunyi & volume dari Settings (dipanggil saat init & setelah simpan).
export async function loadConfig() {
  try {
    const s: any = await api.getSettings();
    volume = VOLUME_LEVELS[s.sfxVolume] ?? VOLUME_LEVELS.keras;
    if (s.sfxOk && SOURCES[s.sfxOk as SfxId]) okId = s.sfxOk;
    if (s.sfxFail && SOURCES[s.sfxFail as SfxId]) failId = s.sfxFail;
    if (s.sfxPaid && SOURCES[s.sfxPaid as SfxId]) paidId = s.sfxPaid;
  } catch { /* pakai default */ }
}

export const sfx = {
  playOk() { play(okId); },
  playFail() { play(failId); },
  playPaid() { play(paidId); },
  // Untuk tombol "Coba" di pengaturan (volume mengikuti pilihan saat itu).
  preview(id: SfxId, level?: string) { play(id, level ? (VOLUME_LEVELS[level] ?? volume) : volume); },
  reload() { loadConfig(); },
};
