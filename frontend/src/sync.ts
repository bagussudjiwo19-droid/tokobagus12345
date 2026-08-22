import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { local } from "./localdb";

// ============================================================================
// SINKRONISASI HYBRID (offline-first + cloud). Tanpa login: 3 HP disatukan
// lewat "Kode Toko". Saat ada internet, perubahan lokal naik ke server &
// perubahan dari HP lain turun ke sini. Bila offline, aplikasi tetap jalan.
// Stok TIDAK ikut dipedulikan dalam penggabungan (produk = "terbaru menang").
// ============================================================================

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "") + "/api";

const K_STORE = "sync:storeCode";
const K_LAST_PULL = "sync:lastPull"; // cursor jam SERVER (ms)
const K_LAST_PUSH = "sync:lastPush"; // cursor jam HP INI (ms)

export type SyncStatus = { state: "idle" | "syncing" | "ok" | "offline" | "nostore"; lastAt?: number };
let status: SyncStatus = { state: "nostore" };
const statusCbs: ((s: SyncStatus) => void)[] = [];
export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  statusCbs.push(cb);
  cb(status);
  return () => { const i = statusCbs.indexOf(cb); if (i >= 0) statusCbs.splice(i, 1); };
}
function setStatus(s: SyncStatus) { status = s; for (const c of [...statusCbs]) { try { c(s); } catch { /* abaikan */ } } }
export function getStatus(): SyncStatus { return status; }

export async function getStoreCode(): Promise<string | null> {
  try { return await AsyncStorage.getItem(K_STORE); } catch { return null; }
}
export async function setStoreCode(code: string): Promise<void> {
  const c = (code || "").trim().toUpperCase();
  await AsyncStorage.setItem(K_STORE, c);
  // Kode baru → tarik ulang semua data toko tsb dari awal.
  await AsyncStorage.setItem(K_LAST_PULL, "0");
  await AsyncStorage.setItem(K_LAST_PUSH, "0");
}
export async function clearStoreCode(): Promise<void> {
  await AsyncStorage.multiRemove([K_STORE, K_LAST_PULL, K_LAST_PUSH]);
  setStatus({ state: "nostore" });
}

export function makeStoreCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return `TOKO-${n}-${s}`;
}

async function fetchJSON(url: string, opts?: RequestInit, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

let inFlight = false;

// Batas aman: ingress/proxy menolak body POST besar (±1MB). Kirim bertahap
// per potongan kecil agar tiap request ringan & tidak diblokir/timeout di 4G.
const PUSH_CHUNK = 150;

async function pushBody(store: string, body: any): Promise<void> {
  await fetchJSON(`${BASE}/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store, ...body }),
  }, 20000);
}

// Kirim perubahan lokal ke server SECARA BERTAHAP (chunk) supaya tidak
// menembus batas ukuran body proxy. Settings dititipkan di request pertama.
async function pushDirty(store: string, dirty: { products: any[]; transactions: any[]; bukti: any[]; settings: any }): Promise<void> {
  let settingsSent = false;
  const takeSettings = () => { if (settingsSent) return null; settingsSent = true; return dirty.settings || null; };

  for (let i = 0; i < dirty.products.length; i += PUSH_CHUNK) {
    const chunk = dirty.products.slice(i, i + PUSH_CHUNK);
    await pushBody(store, { products: chunk, transactions: [], bukti: [], settings: takeSettings() });
  }
  for (let i = 0; i < dirty.transactions.length; i += PUSH_CHUNK) {
    const chunk = dirty.transactions.slice(i, i + PUSH_CHUNK);
    await pushBody(store, { products: [], transactions: chunk, bukti: [], settings: takeSettings() });
  }
  for (let i = 0; i < dirty.bukti.length; i += PUSH_CHUNK) {
    const chunk = dirty.bukti.slice(i, i + PUSH_CHUNK);
    await pushBody(store, { products: [], transactions: [], bukti: chunk, settings: takeSettings() });
  }
  // Belum ada apa pun yang terkirim, tetapi settings berubah → kirim sendiri.
  if (!settingsSent && dirty.settings) {
    await pushBody(store, { products: [], transactions: [], bukti: [], settings: dirty.settings });
  }
}

// Satu putaran sinkron: PUSH perubahan lokal → PULL perubahan server.
export async function syncOnce(): Promise<SyncStatus> {
  const store = await getStoreCode();
  if (!store) { setStatus({ state: "nostore" }); return status; }
  if (inFlight) return status;
  inFlight = true;
  setStatus({ state: "syncing" });
  try {
    // ---- PUSH ----
    const lastPush = Number(await AsyncStorage.getItem(K_LAST_PUSH)) || 0;
    const startedAt = Date.now();
    const dirty = await local.collectDirty(lastPush);
    if (dirty.products.length || dirty.transactions.length || dirty.bukti.length || dirty.settings) {
      await pushDirty(store, dirty);
    }
    await AsyncStorage.setItem(K_LAST_PUSH, String(startedAt));
    await local.clearDeletions();

    // ---- PULL ----
    const since = Number(await AsyncStorage.getItem(K_LAST_PULL)) || 0;
    const pull = await fetchJSON(`${BASE}/sync/pull?store=${encodeURIComponent(store)}&since=${since}`);
    await local.applyRemote(pull);
    if (pull && typeof pull.now === "number") await AsyncStorage.setItem(K_LAST_PULL, String(pull.now));

    const ok: SyncStatus = { state: "ok", lastAt: Date.now() };
    setStatus(ok);
    return ok;
  } catch {
    const off: SyncStatus = { state: "offline", lastAt: status.lastAt };
    setStatus(off);
    return off;
  } finally {
    inFlight = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let appSub: { remove: () => void } | null = null;

// Mulai sinkron otomatis di latar belakang (tiap 45 dtk + saat aplikasi dibuka).
export function startAutoSync(): () => void {
  stopAutoSync();
  syncOnce();
  timer = setInterval(() => { syncOnce(); }, 45000);
  appSub = AppState.addEventListener("change", (st) => { if (st === "active") syncOnce(); });
  return stopAutoSync;
}
export function stopAutoSync() {
  if (timer) { clearInterval(timer); timer = null; }
  if (appSub) { appSub.remove(); appSub = null; }
}
