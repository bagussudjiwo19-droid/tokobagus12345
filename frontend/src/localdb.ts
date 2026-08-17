import { Platform } from "react-native";
import type { Product, Transaction, TxItem, Settings, Printer } from "./types";
// Data awal (bekal offline) — dibundel ke aplikasi. Dipakai HANYA saat pertama
// kali (database lokal masih kosong). Setelahnya data dibaca dari DB lokal HP.
import seed from "../assets/seed/toko_bagus_backup.json";

// ============================================================================
// Mesin data LOKAL (OFFLINE). Semua produk/transaksi/pengaturan tersimpan di
// HP — tidak butuh internet. Native (Android/iOS) memakai expo-sqlite sebagai
// penyimpanan permanen + salinan di memori (agar scan cepat). Di web preview
// (tanpa SQLite) memakai memori saja (untuk pengujian tampilan).
// ============================================================================

const isNative = Platform.OS !== "web";

let db: any = null;
// Salinan di memori (sumber baca cepat).
let products = new Map<string, Product>();
let transactions: Transaction[] = []; // urut terbaru → terlama
let settings: Settings | null = null;
let printer: Printer = { address: null, name: null };
// Sinkronisasi cloud: catatan penghapusan (tombstone) & waktu ubah pengaturan.
let deletions = new Map<string, number>(); // productId -> ts(ms) dihapus
let settingsUpdatedAt = 0; // ms terakhir pengaturan diubah (untuk sinkron)

let initPromise: Promise<void> | null = null;

// Pemberitahuan perubahan data (dipakai agar UI reload setelah sinkron masuk).
const changeCbs: (() => void)[] = [];
export function onLocalChange(cb: () => void): () => void {
  changeCbs.push(cb);
  return () => { const i = changeCbs.indexOf(cb); if (i >= 0) changeCbs.splice(i, 1); };
}
function notifyChange() { for (const c of [...changeCbs]) { try { c(); } catch { /* abaikan */ } } }

const DEFAULT_SETTINGS: Settings = {
  shopName: "TOKO BAGUS", address: "", phone: "", cashier: "", note: "",
  thanks: "Terima kasih sudah berbelanja",
  showShopName: true, showAddress: true, showPhone: true, showLogo: false,
  showDateTime: true, showTxNumber: true, showQueue: false, showCashier: false,
  showQR: false, showItemName: true, showVariation: true, showBarcode: false,
  showUnitPrice: true, showQty: true, showSubtotal: true, showDiscount: false,
  showTotal: true, showCashPaid: true, showChange: true, voiceChange: true,
  readPrice: true, priceClosing: true,
  showNote: false, showThanks: true,
  sfxVolume: "keras", sfxOk: "sparkle", sfxFail: "oops", sfxPaid: "premium",
  quickSlots: [],
  hideMiko: false,
};

function nowIso(): string { return new Date().toISOString(); }
function genId(): string { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
function sortTx() { transactions.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)); }

// --------------------------- Init & Seed ---------------------------
export function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = init();
  return initPromise;
}

async function init(): Promise<void> {
  if (isNative) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require("expo-sqlite");
    db = await SQLite.openDatabaseAsync("toko_bagus.db");
    await db.execAsync(
      "PRAGMA journal_mode = WAL;" +
      "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY NOT NULL, created_at TEXT, doc TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);",
    );
    const row = await db.getFirstAsync("SELECT COUNT(*) as c FROM products");
    const empty = !row || Number(row.c) === 0;
    if (empty) {
      loadSeedIntoMemory();
      await persistAll();
    } else {
      await loadFromDb();
    }
  } else {
    loadSeedIntoMemory();
  }
}

function loadSeedIntoMemory(): void {
  products = new Map();
  transactions = [];
  // PRODUKSI (APK publish): __DEV__ = false → database produk KOSONG.
  // Pemilik toko mengisi lewat Restore/Import. Dev/preview tetap pakai seed
  // agar mudah diuji. Struktur DB & fitur tidak berubah.
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const sp: Product[] = (seed as any).products || [];
    for (const p of sp) products.set(p.id, p as Product);
    transactions = ((seed as any).transactions || []) as Transaction[];
    settings = { ...DEFAULT_SETTINGS, ...((seed as any).settings || {}) };
    const pr = (seed as any).printer || {};
    printer = { address: pr.address ?? null, name: pr.name ?? null };
  } else {
    settings = { ...DEFAULT_SETTINGS };
    printer = { address: null, name: null };
  }
  sortTx();
}

async function loadFromDb(): Promise<void> {
  products = new Map();
  const prows = await db.getAllAsync("SELECT doc FROM products");
  for (const r of prows) { const p = JSON.parse(r.doc) as Product; products.set(p.id, p); }
  const trows = await db.getAllAsync("SELECT doc FROM transactions ORDER BY created_at DESC");
  transactions = trows.map((r: any) => JSON.parse(r.doc) as Transaction);
  sortTx();
  const s = await db.getFirstAsync("SELECT v FROM kv WHERE k = 'settings'");
  settings = { ...DEFAULT_SETTINGS, ...(s ? JSON.parse(s.v) : {}) };
  const pr = await db.getFirstAsync("SELECT v FROM kv WHERE k = 'printer'");
  printer = pr ? JSON.parse(pr.v) : { address: null, name: null };
  const del = await db.getFirstAsync("SELECT v FROM kv WHERE k = 'deletions'");
  deletions = new Map(Object.entries(del ? JSON.parse(del.v) : {}).map(([k, v]) => [k, Number(v)]));
  const su = await db.getFirstAsync("SELECT v FROM kv WHERE k = 'settings_updated_at'");
  settingsUpdatedAt = su ? Number(JSON.parse(su.v)) : 0;
}

async function persistAll(): Promise<void> {
  if (!isNative || !db) return;
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM products; DELETE FROM transactions;");
    for (const p of products.values()) {
      await db.runAsync("INSERT OR REPLACE INTO products (id, doc) VALUES (?, ?)", p.id, JSON.stringify(p));
    }
    for (const t of transactions) {
      await db.runAsync("INSERT OR REPLACE INTO transactions (id, created_at, doc) VALUES (?, ?, ?)", t.id, t.created_at, JSON.stringify(t));
    }
    await db.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES ('settings', ?)", JSON.stringify(settings || DEFAULT_SETTINGS));
    await db.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES ('printer', ?)", JSON.stringify(printer));
  });
}

// Write-through helpers (native only).
async function putProduct(p: Product): Promise<void> {
  if (isNative && db) await db.runAsync("INSERT OR REPLACE INTO products (id, doc) VALUES (?, ?)", p.id, JSON.stringify(p));
}
async function removeProduct(id: string): Promise<void> {
  if (isNative && db) await db.runAsync("DELETE FROM products WHERE id = ?", id);
}
async function putTx(t: Transaction): Promise<void> {
  if (isNative && db) await db.runAsync("INSERT OR REPLACE INTO transactions (id, created_at, doc) VALUES (?, ?, ?)", t.id, t.created_at, JSON.stringify(t));
}
async function putKv(k: string, v: any): Promise<void> {
  if (isNative && db) await db.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", k, JSON.stringify(v));
}

// --------------------------- Logic helpers ---------------------------
function resolveRootParent(parentId: string): string {
  const seen = new Set<string>();
  let current: string | undefined = parentId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const doc = products.get(current);
    if (!doc) break;
    if (!doc.parent_id) return current;
    current = doc.parent_id;
  }
  return parentId;
}

// Variasi "ikut induk" → harga bertingkat diambil DINAMIS dari induk utama.
function withResolvedTiers(p: Product): Product {
  const c = clone(p);
  if (p.parent_id && p.inherit_tiers) {
    const root = products.get(p.parent_id);
    if (root) c.tiers = clone(root.tiers || []);
  }
  return c;
}

// ============================================================================
// API LOKAL — meniru bentuk endpoint backend agar layar tidak perlu diubah.
// ============================================================================
export const local = {
  async getProducts(): Promise<Product[]> {
    await ensureInit();
    const arr = Array.from(products.values()).map(withResolvedTiers);
    arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return arr;
  },

  async searchProducts(q: string): Promise<Product[]> {
    await ensureInit();
    const s = (q || "").toLowerCase();
    const arr = Array.from(products.values()).filter((p) =>
      (p.name || "").toLowerCase().includes(s) || (p.barcode || "").toLowerCase().includes(s),
    );
    arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return arr.map(clone);
  },

  async getByBarcode(code: string): Promise<Product> {
    await ensureInit();
    let found: Product | undefined;
    for (const p of products.values()) {
      if (p.barcode && p.barcode === code) { found = p; break; }
    }
    if (!found) {
      for (const p of products.values()) {
        if ((p.variations || []).some((v) => v.barcode === code)) { found = p; break; }
      }
    }
    if (!found) throw new Error("Barcode belum terdaftar");
    return withResolvedTiers(found);
  },

  async createProduct(payload: Partial<Product>): Promise<Product> {
    await ensureInit();
    const data: any = { ...payload };
    if (data.parent_id) data.parent_id = resolveRootParent(data.parent_id);
    const prod: Product = {
      id: genId(),
      name: data.name,
      category: data.category ?? "",
      unit: data.unit ?? "pcs",
      barcode: data.barcode ?? null,
      parent_id: data.parent_id ?? null,
      buy_price: data.buy_price ?? 0,
      sell_price: data.sell_price ?? 0,
      stock: data.stock ?? 0,
      tiers: data.tiers ?? [],
      inherit_tiers: data.inherit_tiers ?? false,
      variations: data.variations ?? [],
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    products.set(prod.id, prod);
    await putProduct(prod);
    return clone(prod);
  },

  async updateProduct(id: string, payload: Partial<Product>): Promise<Product> {
    await ensureInit();
    const existing = products.get(id);
    if (!existing) throw new Error("Produk tidak ditemukan");
    const updated: Product = { ...existing, ...payload, id, created_at: existing.created_at, updated_at: nowIso() } as Product;
    products.set(id, updated);
    await putProduct(updated);
    return clone(updated);
  },

  async updateStock(id: string, stock: number, variationId?: string): Promise<Product> {
    await ensureInit();
    const p = products.get(id);
    if (!p) throw new Error("Produk tidak ditemukan");
    if (variationId) {
      p.variations = (p.variations || []).map((v) => (v.id === variationId ? { ...v, stock } : v));
    } else {
      p.stock = stock;
    }
    p.updated_at = nowIso();
    products.set(id, p);
    await putProduct(p);
    return clone(p);
  },

  async deleteProduct(id: string): Promise<{ ok: boolean }> {
    await ensureInit();
    if (!products.has(id)) throw new Error("Produk tidak ditemukan");
    products.delete(id);
    deletions.set(id, Date.now());
    await removeProduct(id);
    await putKv("deletions", Object.fromEntries(deletions));
    return { ok: true };
  },

  async getTransactions(limit = 200): Promise<Transaction[]> {
    await ensureInit();
    return transactions.slice(0, limit).map(clone);
  },

  async getTransaction(id: string): Promise<Transaction> {
    await ensureInit();
    const t = transactions.find((x) => x.id === id);
    if (!t) throw new Error("Transaksi tidak ditemukan");
    return clone(t);
  },

  async createTransaction(payload: { items: TxItem[]; total: number; discount?: number; cash_paid: number; change: number }): Promise<Transaction> {
    await ensureInit();
    const tx: Transaction = {
      id: genId(),
      items: payload.items,
      total: payload.total,
      discount: payload.discount ?? 0,
      cash_paid: payload.cash_paid ?? 0,
      change: payload.change ?? 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    transactions.unshift(tx);
    sortTx();
    await putTx(tx);
    // Kurangi stok (produk / variasi).
    const touched = new Set<string>();
    for (const item of payload.items) {
      if (!item.product_id) continue;
      const p = products.get(item.product_id);
      if (!p) continue;
      if (item.variation_id) {
        p.variations = (p.variations || []).map((v) =>
          v.id === item.variation_id && typeof v.stock === "number" ? { ...v, stock: (v.stock || 0) - item.quantity } : v,
        );
      } else if (typeof p.stock === "number") {
        p.stock = (p.stock || 0) - item.quantity;
      }
      products.set(p.id, p);
      touched.add(p.id);
    }
    for (const id of touched) { const p = products.get(id); if (p) await putProduct(p); }
    return clone(tx);
  },

  async updateTransaction(id: string, payload: { items: TxItem[]; total: number; discount?: number; cash_paid: number; change: number; created_at?: string }): Promise<Transaction> {
    await ensureInit();
    const idx = transactions.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error("Transaksi tidak ditemukan");
    const existing = transactions[idx];

    // Rekonsiliasi stok: kembalikan qty lama, kurangi qty baru.
    const oldMap = new Map<string, number>();
    for (const it of existing.items || []) {
      if (!it.product_id) continue;
      const k = `${it.product_id}::${it.variation_id || ""}`;
      oldMap.set(k, (oldMap.get(k) || 0) + (it.quantity || 0));
    }
    const newMap = new Map<string, number>();
    for (const it of payload.items) {
      if (!it.product_id) continue;
      const k = `${it.product_id}::${it.variation_id || ""}`;
      newMap.set(k, (newMap.get(k) || 0) + (it.quantity || 0));
    }
    const keys = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
    const touched = new Set<string>();
    for (const k of keys) {
      const delta = (oldMap.get(k) || 0) - (newMap.get(k) || 0);
      if (delta === 0) continue;
      const [pid, vid] = k.split("::");
      const p = products.get(pid);
      if (!p) continue;
      if (vid) {
        p.variations = (p.variations || []).map((v) =>
          v.id === vid && typeof v.stock === "number" ? { ...v, stock: (v.stock || 0) + delta } : v,
        );
      } else if (typeof p.stock === "number") {
        p.stock = (p.stock || 0) + delta;
      }
      products.set(pid, p);
      touched.add(pid);
    }
    for (const pid of touched) { const p = products.get(pid); if (p) await putProduct(p); }

    const updated: Transaction = {
      ...existing,
      items: payload.items,
      total: payload.total,
      discount: payload.discount ?? 0,
      cash_paid: payload.cash_paid,
      change: payload.change,
      created_at: payload.created_at || existing.created_at,
      updated_at: nowIso(),
    };
    transactions[idx] = updated;
    sortTx();
    await putTx(updated);
    return clone(updated);
  },

  async getSettings(): Promise<Settings> {
    await ensureInit();
    return { ...DEFAULT_SETTINGS, ...(settings || {}) };
  },

  async saveSettings(s: Settings): Promise<Settings> {
    await ensureInit();
    settings = { ...DEFAULT_SETTINGS, ...s };
    settingsUpdatedAt = Date.now();
    await putKv("settings", settings);
    await putKv("settings_updated_at", settingsUpdatedAt);
    return clone(settings);
  },

  async getPrinter(): Promise<Printer> {
    await ensureInit();
    return clone(printer);
  },

  async savePrinter(p: Printer): Promise<Printer> {
    await ensureInit();
    printer = { address: p.address ?? null, name: p.name ?? null };
    await putKv("printer", printer);
    return clone(printer);
  },

  async summary(): Promise<{ total_transaksi: number; total_omzet: number }> {
    await ensureInit();
    let omzet = 0;
    for (const t of transactions) omzet += t.total || 0;
    return { total_transaksi: transactions.length, total_omzet: omzet };
  },

  async exportBackup(): Promise<any> {
    await ensureInit();
    const prods = Array.from(products.values()).map(clone);
    const txs = transactions.map(clone);
    return {
      app: "kasir-warung",
      version: 1,
      exported_at: nowIso(),
      counts: { products: prods.length, transactions: txs.length },
      products: prods,
      transactions: txs,
      settings: { ...DEFAULT_SETTINGS, ...(settings || {}) },
      printer: clone(printer),
    };
  },

  async importBackup(data: any): Promise<{ ok: boolean; products: number; transactions: number }> {
    await ensureInit();
    if (!data || typeof data !== "object") throw new Error("File backup tidak valid atau rusak.");
    const inProducts = data.products;
    const inTx = Array.isArray(data.transactions) ? data.transactions : [];
    if (!Array.isArray(inProducts)) throw new Error("File backup tidak valid (data produk tidak ditemukan).");
    if (inProducts.length === 0) throw new Error("File backup tidak berisi produk. Pemulihan dibatalkan agar data lama tetap aman.");

    // Validasi + normalisasi + dedupe by id (mencegah barang ganda/rusak).
    const newProducts = new Map<string, Product>();
    for (const raw of inProducts) {
      if (!raw || typeof raw !== "object" || !raw.name) throw new Error("File backup rusak: data produk tidak sesuai format.");
      const p = { ...raw } as any;
      delete p._id;
      if (!p.id) p.id = genId();
      p.tiers = Array.isArray(p.tiers) ? p.tiers : [];
      p.variations = Array.isArray(p.variations) ? p.variations : [];
      p.stock = typeof p.stock === "number" ? p.stock : Number(p.stock) || 0;
      p.buy_price = typeof p.buy_price === "number" ? p.buy_price : Number(p.buy_price) || 0;
      p.sell_price = typeof p.sell_price === "number" ? p.sell_price : Number(p.sell_price) || 0;
      p.unit = p.unit || "pcs";
      p.category = p.category ?? "";
      p.parent_id = p.parent_id ?? null;
      p.barcode = p.barcode ?? null;
      p.inherit_tiers = !!p.inherit_tiers;
      newProducts.set(p.id, p as Product); // id kembar → otomatis ditimpa (tidak ganda)
    }
    const newTx: Transaction[] = [];
    const seenT = new Set<string>();
    for (const raw of inTx) {
      if (!raw || !Array.isArray(raw.items)) throw new Error("File backup rusak: data transaksi tidak sesuai format.");
      const t = { ...raw } as any;
      delete t._id;
      if (!t.id) t.id = genId();
      if (seenT.has(t.id)) continue; // buang transaksi kembar
      seenT.add(t.id);
      newTx.push(t as Transaction);
    }

    // Ganti TOTAL data lama. Tulis ke DB dulu (atomik); bila gagal → kembalikan
    // data lama sepenuhnya agar TIDAK ada barang yang hilang sebagian.
    const prevProducts = products;
    const prevTx = transactions;
    const prevSettings = settings;
    const prevPrinter = printer;
    products = newProducts;
    transactions = newTx;
    sortTx();
    if (data.settings) settings = { ...DEFAULT_SETTINGS, ...data.settings };
    if (data.printer) printer = { address: data.printer.address ?? null, name: data.printer.name ?? null };
    try {
      await persistAll();
    } catch {
      products = prevProducts;
      transactions = prevTx;
      settings = prevSettings;
      printer = prevPrinter;
      throw new Error("Gagal menyimpan data pulihan ke HP. Data lama tetap aman, silakan coba lagi.");
    }
    return { ok: true, products: newProducts.size, transactions: newTx.length };
  },

  // ------------------------- SINKRONISASI CLOUD -------------------------
  // Kumpulkan perubahan lokal setelah `sinceMs` (jam HP ini) untuk dikirim ke server.
  async collectDirty(sinceMs: number): Promise<{ products: any[]; transactions: any[]; settings: any }> {
    await ensureInit();
    const outP: any[] = [];
    for (const pr of products.values()) {
      const ms = Date.parse(pr.updated_at || pr.created_at || "") || 0;
      if (ms > sinceMs) outP.push({ id: pr.id, doc: pr, updated_at: ms, deleted: false });
    }
    for (const [id, ts] of deletions) outP.push({ id, doc: null, updated_at: ts, deleted: true });
    const outT: any[] = [];
    for (const tx of transactions) {
      const ms = Date.parse((tx as any).updated_at || tx.created_at || "") || 0;
      if (ms > sinceMs) outT.push({ id: tx.id, doc: tx, updated_at: ms });
    }
    let outS: any = null;
    if (settingsUpdatedAt > sinceMs && settings) outS = { doc: settings, updated_at: settingsUpdatedAt };
    return { products: outP, transactions: outT, settings: outS };
  },

  // Terapkan data dari server (LWW). Kembalikan true bila ada perubahan.
  async applyRemote(remote: { products?: any[]; transactions?: any[]; settings?: any }): Promise<boolean> {
    await ensureInit();
    let changed = false;
    for (const rp of remote.products || []) {
      const local = products.get(rp.id);
      const lms = local ? (Date.parse(local.updated_at || local.created_at || "") || 0) : -1;
      if (rp.deleted) {
        if (local && rp.updated_at >= lms) { products.delete(rp.id); await removeProduct(rp.id); changed = true; }
        continue;
      }
      if ((!local || rp.updated_at > lms) && rp.doc) {
        const doc = rp.doc as Product;
        products.set(doc.id, doc);
        await putProduct(doc);
        changed = true;
      }
    }
    for (const rt of remote.transactions || []) {
      const idx = transactions.findIndex((x) => x.id === rt.id);
      const local = idx >= 0 ? transactions[idx] : null;
      const lms = local ? (Date.parse((local as any).updated_at || local.created_at || "") || 0) : -1;
      if ((!local || rt.updated_at > lms) && rt.doc) {
        const doc = rt.doc as Transaction;
        if (idx >= 0) transactions[idx] = doc; else transactions.push(doc);
        await putTx(doc);
        changed = true;
      }
    }
    if (remote.settings && remote.settings.doc) {
      settings = { ...DEFAULT_SETTINGS, ...remote.settings.doc };
      settingsUpdatedAt = Number(remote.settings.updated_at) || settingsUpdatedAt;
      await putKv("settings", settings);
      await putKv("settings_updated_at", settingsUpdatedAt);
      changed = true;
    }
    if (changed) { sortTx(); notifyChange(); }
    return changed;
  },

  // Hapus daftar tombstone setelah berhasil dikirim ke server.
  async clearDeletions(): Promise<void> {
    if (deletions.size === 0) return;
    deletions.clear();
    await putKv("deletions", {});
  },
};
