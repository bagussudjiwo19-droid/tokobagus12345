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
