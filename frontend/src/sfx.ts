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
  | "sparkle" | "bell" | "magic" | "happy" | "pop" | "premium"
  | "oops" | "warning" | "tryagain" | "blip" | "hmm";

// Daftar pilihan bunyi Miko (lembut & menyenangkan). Ditampilkan di menu
// "Suara Efek": ikon berwarna + nama + deskripsi + tombol Coba.
export type SfxMeta = {
  id: SfxId; label: string; emoji: string; desc: string;
  icon: string; bg: string; fg: string; group: "positif" | "subtil";
};
export const SFX_LIBRARY: SfxMeta[] = [
  { id: "sparkle",  label: "Miko Sparkle",        emoji: "✨", desc: "2-3 nada lembut, naik di akhir", icon: "sparkles",        bg: "#FFE6EC", fg: "#F59FB4", group: "positif" },
  { id: "bell",     label: "Miko Bell",           emoji: "🔔", desc: "Satu bunyi bel hangat",         icon: "notifications",   bg: "#FFF2D6", fg: "#F5B301", group: "positif" },
  { id: "magic",    label: "Miko Magic",          emoji: "✨", desc: "Chime kecil berkilauan",        icon: "sparkles",        bg: "#DCEBFF", fg: "#4FA3F7", group: "positif" },
  { id: "happy",    label: "Miko Happy",          emoji: "😊", desc: "3 nada pendek ceria",           icon: "happy",           bg: "#FFE0E8", fg: "#FF7BA3", group: "positif" },
  { id: "pop",      label: "Miko Pop",            emoji: "💕", desc: "Pop lembut + chime kecil",      icon: "heart",           bg: "#FFDCEC", fg: "#FF5FA2", group: "positif" },
  { id: "premium",  label: "Miko Premium",        emoji: "💎", desc: "Chime bersih dan elegan",       icon: "diamond",         bg: "#EADCFF", fg: "#9B6BF5", group: "positif" },
  { id: "oops",     label: "Miko Oops",           emoji: "🌱", desc: "Dua nada lembut, turun di akhir", icon: "leaf",          bg: "#DCF5E4", fg: "#3FB966", group: "subtil" },
  { id: "warning",  label: "Miko Gentle Warning", emoji: "⚠️", desc: "Pendek, rendah, dan halus",     icon: "warning",         bg: "#FBECCF", fg: "#E6A100", group: "subtil" },
  { id: "tryagain", label: "Miko Try Again",      emoji: "↩️", desc: "Nada pendek menurun",           icon: "arrow-undo",      bg: "#E6DEFB", fg: "#8B6BE0", group: "subtil" },
  { id: "blip",     label: "Miko Soft Blip",      emoji: "🔵", desc: "Blip lembut",                   icon: "ellipse",         bg: "#E6E0FA", fg: "#7A6BD8", group: "subtil" },
  { id: "hmm",      label: "Miko Hmm",            emoji: "🤔", desc: "Nada kecil seperti berpikir",   icon: "chatbubble-ellipses", bg: "#EDE4FB", fg: "#9070D8", group: "subtil" },
];

const SOURCES: Record<SfxId, any> = {
  sparkle: require("../assets/sounds/miko_sparkle.wav"),
  bell: require("../assets/sounds/miko_bell.wav"),
  magic: require("../assets/sounds/miko_magic.wav"),
  happy: require("../assets/sounds/miko_happy.wav"),
  pop: require("../assets/sounds/miko_pop.wav"),
  premium: require("../assets/sounds/miko_premium.wav"),
  oops: require("../assets/sounds/miko_oops.wav"),
  warning: require("../assets/sounds/miko_warning.wav"),
  tryagain: require("../assets/sounds/miko_tryagain.wav"),
  blip: require("../assets/sounds/miko_blip.wav"),
  hmm: require("../assets/sounds/miko_hmm.wav"),
};

// Tingkat volume → nilai 0..1.
export const VOLUME_LEVELS: Record<string, number> = { normal: 0.6, keras: 0.85, maks: 1.0 };

const players: Partial<Record<SfxId, AudioPlayer>> = {};
let ready = false;
let volume = VOLUME_LEVELS.keras;
let okId: SfxId = "sparkle";
let failId: SfxId = "oops";
let paidId: SfxId = "premium";

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
