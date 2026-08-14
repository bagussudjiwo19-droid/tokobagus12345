import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

// ============================================================================
// AUTO BACKUP (offline): otomatis menyimpan file cadangan ke penyimpanan HP
// SEKALI SEHARI (saat aplikasi pertama dibuka hari itu). Menyimpan 5 cadangan
// terakhir (rotasi otomatis). Selalu menyala. Hanya berjalan di HP (native).
// ============================================================================

const isNative = Platform.OS !== "web";
const DIR = (FileSystem.documentDirectory || "") + "auto-backups/";
const KEEP = 5;
const LAST_KEY = "autobackup:last"; // ISO timestamp backup otomatis terakhir
const SHARE_KEY = "backup:lastShare"; // ISO timestamp terakhir kali user BAGIKAN cadangan (Drive/WA/Files)
const REMIND_KEY = "backup:lastRemind"; // tanggal (toDateString) terakhir Miko mengingatkan (agar tidak spam)
const REMIND_AFTER_DAYS = 3; // ingatkan bila sudah > 3 hari tidak membagikan cadangan

export type AutoBackupFile = { name: string; uri: string };

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

function stamp(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function listAutoBackups(): Promise<AutoBackupFile[]> {
  if (!isNative) return [];
  try {
    await ensureDir();
    const names = await FileSystem.readDirectoryAsync(DIR);
    const files = names.filter((n) => n.endsWith(".json")).sort().reverse();
    return files.map((n) => ({ name: n, uri: DIR + n }));
  } catch {
    return [];
  }
}

export async function getLastAutoBackup(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export async function runAutoBackup(): Promise<string | null> {
  if (!isNative) return null;
  await ensureDir();
  const data = await api.exportBackup();
  const uri = `${DIR}auto-${stamp()}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(data), { encoding: FileSystem.EncodingType.UTF8 });
  // Rotasi: sisakan KEEP terbaru, hapus sisanya.
  const files = (await FileSystem.readDirectoryAsync(DIR)).filter((n) => n.endsWith(".json")).sort().reverse();
  for (const old of files.slice(KEEP)) {
    try { await FileSystem.deleteAsync(DIR + old, { idempotent: true }); } catch { /* abaikan */ }
  }
  await AsyncStorage.setItem(LAST_KEY, new Date().toISOString());
  return uri;
}

// Dipanggil saat aplikasi dibuka. Backup hanya dibuat sekali per hari.
export async function maybeDailyAutoBackup(): Promise<void> {
  if (!isNative) return;
  try {
    const last = await AsyncStorage.getItem(LAST_KEY);
    const today = new Date().toDateString();
    const lastDay = last ? new Date(last).toDateString() : null;
    if (lastDay !== today) await runAutoBackup();
  } catch {
    /* jangan ganggu startup bila gagal */
  }
}

// Catat waktu terakhir user MEMBAGIKAN cadangan (ke Drive/WhatsApp/Files).
export async function markBackupShared(): Promise<void> {
  try { await AsyncStorage.setItem(SHARE_KEY, new Date().toISOString()); } catch { /* abaikan */ }
}

export async function getLastBackupShare(): Promise<string | null> {
  try { return await AsyncStorage.getItem(SHARE_KEY); } catch { return null; }
}

// Cek apakah Miko perlu mengingatkan untuk membagikan cadangan ke Drive/WhatsApp.
// True bila belum pernah membagikan ATAU sudah > REMIND_AFTER_DAYS hari, dan
// belum diingatkan hari ini (agar tidak mengganggu berulang).
export async function shouldRemindBackup(): Promise<boolean> {
  try {
    const today = new Date().toDateString();
    const lastRemind = await AsyncStorage.getItem(REMIND_KEY);
    if (lastRemind === today) return false; // sudah diingatkan hari ini
    const share = await AsyncStorage.getItem(SHARE_KEY);
    if (share) {
      const days = (Date.now() - new Date(share).getTime()) / 86400000;
      if (days < REMIND_AFTER_DAYS) return false;
    }
    await AsyncStorage.setItem(REMIND_KEY, today);
    return true;
  } catch {
    return false;
  }
}
