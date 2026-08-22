import { Platform } from "react-native";
import type { Product, Transaction, TxItem, Settings, Printer, Bukti } from "./types";
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
let buktiList: Bukti[] = []; // Bukti Pembayaran (terbaru → terlama)
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
  unlimitedStock: true,
  lowStockThreshold: 5,
};

function nowIso(): string { return new Date().toISOString(); }
function genId(): string { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
function sortTx() { transactions.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)); }
function sortBukti() { buktiList.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)); }

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
      "CREATE TABLE IF NOT EXISTS bukti (id TEXT PRIMARY KEY NOT NULL, created_at TEXT, doc TEXT NOT NULL);" +
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
  buktiList = [];
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
  const brows = await db.getAllAsync("SELECT doc FROM bukti ORDER BY created_at DESC");
  buktiList = brows.map((r: any) => JSON.parse(r.doc) as Bukti);
  sortBukti();
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
    await db.execAsync("DELETE FROM bukti;");
    for (const b of buktiList) {
      await db.runAsync("INSERT OR REPLACE INTO bukti (id, created_at, doc) VALUES (?, ?, ?)", b.id, b.created_at, JSON.stringify(b));
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
async function putBukti(b: Bukti): Promise<void> {
  if (isNative && db) await db.runAsync("INSERT OR REPLACE INTO bukti (id, created_at, doc) VALUES (?, ?, ?)", b.id, b.created_at, JSON.stringify(b));
}
async function removeBuktiRow(id: string): Promise<void> {
  if (isNative && db) await db.runAsync("DELETE FROM bukti WHERE id = ?", id);
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
      (p.name || "").toLowerCase().includes(s) || (p.barcode || "").toLowerCase().includes(s) ||
      (p.barcodes || []).some((b) => (b || "").toLowerCase().includes(s)),
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
    // Barcode tambahan (banyak barcode → produk yang sama).
    if (!found) {
      for (const p of products.values()) {
        if ((p.barcodes || []).some((b) => b === code)) { found = p; break; }
      }
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
      barcodes: Array.isArray(data.barcodes) ? data.barcodes.filter((b: string) => !!b && b.trim()).map((b: string) => b.trim()) : [],
      parent_id: data.parent_id ?? null,
      buy_price: data.buy_price ?? 0,
      sell_price: data.sell_price ?? 0,
      stock: data.stock ?? 0,
      tiers: data.tiers ?? [],
      inherit_tiers: data.inherit_tiers ?? false,
      variations: data.variations ?? [],
      price_type: data.price_type ?? undefined,
      quick_qty: data.quick_qty ?? undefined,
      quick_qty2: data.quick_qty2 ?? undefined,
      quick_qty3: data.quick_qty3 ?? undefined,
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

  // ------------------------- BUKTI PEMBAYARAN -------------------------
  async getBukti(limit = 500): Promise<Bukti[]> {
    await ensureInit();
    return buktiList.slice(0, limit).map(clone);
  },

  async saveBukti(payload: Omit<Bukti, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string }): Promise<Bukti> {
    await ensureInit();
    const now = nowIso();
    const existing = payload.id ? buktiList.find((x) => x.id === payload.id) : null;
    const b: Bukti = {
      id: payload.id || genId(),
      method: payload.method || "",
      recipient: payload.recipient || "",
      amount: payload.amount || 0,
      date: payload.date || "",
      time: payload.time || "",
      ref: payload.ref || "",
      customer: payload.customer || "",
      image_uri: payload.image_uri ?? null,
      created_at: existing?.created_at || payload.created_at || now,
      updated_at: now,
    };
    const idx = buktiList.findIndex((x) => x.id === b.id);
    if (idx >= 0) buktiList[idx] = b; else buktiList.unshift(b);
    sortBukti();
    await putBukti(b);
    notifyChange();
    return clone(b);
  },

  async deleteBukti(id: string): Promise<{ ok: boolean }> {
    await ensureInit();
    buktiList = buktiList.filter((x) => x.id !== id);
    await removeBuktiRow(id);
    notifyChange();
    return { ok: true };
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
    notifyChange();
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
      p.barcodes = Array.isArray(p.barcodes) ? p.barcodes.filter((b: any) => !!b) : [];
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

  // RESTORE AMAN (tambah data saja). TIDAK PERNAH menimpa/menghapus produk lama.
  // Sebuah produk dari file DILEWATI bila NAMA (abaikan huruf besar/kecil & spasi)
  // ATAU salah satu barcode-nya (barcode utama + barcode tambahan + barcode variasi)
  // sudah dipakai produk yang ADA. Produk induk + anak/variasinya diperlakukan sebagai
  // SATU paket (induk dilewati → anak ikut dilewati). Hanya menyentuh data Produk;
  // transaksi, pengaturan, printer TIDAK diubah.
  async safeImportProducts(data: any): Promise<{
    ok: boolean; total: number; added: number; skipped: number;
    skippedList: { name: string; reason: string }[];
  }> {
    await ensureInit();
    if (!data || typeof data !== "object") throw new Error("File tidak valid atau rusak.");
    const inProducts = data.products;
    if (!Array.isArray(inProducts)) throw new Error("File tidak valid (data produk tidak ditemukan).");
    if (inProducts.length === 0) throw new Error("File tidak berisi produk.");

    const norm = (s: any) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const barcodesOf = (p: any): string[] => {
      const out: string[] = [];
      if (p?.barcode) out.push(String(p.barcode).trim());
      (Array.isArray(p?.barcodes) ? p.barcodes : []).forEach((b: any) => { if (b) out.push(String(b).trim()); });
      (Array.isArray(p?.variations) ? p.variations : []).forEach((v: any) => { if (v?.barcode) out.push(String(v.barcode).trim()); });
      return out.filter(Boolean);
    };

    // Identitas produk yang SUDAH ADA (data utama — tidak boleh disentuh).
    const existNames = new Set<string>();
    const existBarcodes = new Set<string>();
    for (const p of products.values()) {
      if (p.name) existNames.add(norm(p.name));
      for (const b of barcodesOf(p)) existBarcodes.add(b);
    }

    // Normalisasi + index produk dari file, lalu kelompokkan induk + anak.
    const normalizeIncoming = (raw: any): any => {
      if (!raw || typeof raw !== "object" || !raw.name) throw new Error("File rusak: data produk tidak sesuai format.");
      const p = { ...raw };
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
      p.barcodes = Array.isArray(p.barcodes) ? p.barcodes.filter((b: any) => !!b) : [];
      p.inherit_tiers = !!p.inherit_tiers;
      return p;
    };

    const items: any[] = inProducts.map(normalizeIncoming);
    const byId = new Map<string, any>();
    for (const it of items) byId.set(it.id, it);

    // Cari root (induk paling atas) dalam kumpulan file untuk tiap produk.
    const rootOf = (it: any): string => {
      const seen = new Set<string>();
      let cur = it;
      while (cur && cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.parent_id);
      }
      return cur.id;
    };
    const groups = new Map<string, any[]>();
    for (const it of items) {
      const r = rootOf(it);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(it);
    }

    let added = 0;
    const skippedList: { name: string; reason: string }[] = [];
    const toPersist: Product[] = [];

    for (const [rootId, group] of groups) {
      const root = byId.get(rootId) || group[0];
      const nameHit = existNames.has(norm(root.name));
      let barcodeHit = false;
      for (const g of group) {
        for (const b of barcodesOf(g)) { if (existBarcodes.has(b)) { barcodeHit = true; break; } }
        if (barcodeHit) break;
      }
      if (nameHit || barcodeHit) {
        const reason = nameHit && barcodeHit ? "Nama dan barcode sama" : nameHit ? "Nama sama" : "Barcode sama";
        skippedList.push({ name: root.name, reason });
        continue;
      }

      // Impor seluruh grup. Remap id yang bentrok dengan id produk yang sudah ada.
      const idMap = new Map<string, string>();
      for (const g of group) {
        let newId = g.id;
        if (products.has(newId)) { newId = genId(); }
        idMap.set(g.id, newId);
      }
      for (const g of group) {
        const nid = idMap.get(g.id)!;
        const parentNew = g.parent_id && idMap.has(g.parent_id) ? idMap.get(g.parent_id)! : (g.parent_id ?? null);
        const prod: Product = {
          ...g,
          id: nid,
          parent_id: parentNew,
          created_at: g.created_at || nowIso(),
          updated_at: nowIso(),
        } as Product;
        products.set(prod.id, prod);
        toPersist.push(prod);
        added++;
      }
      // Daftarkan identitas grup baru agar grup berikutnya di file tak jadi duplikat.
      existNames.add(norm(root.name));
      for (const g of group) for (const b of barcodesOf(g)) existBarcodes.add(b);
    }

    for (const prod of toPersist) await putProduct(prod);
    if (added > 0) notifyChange();

    return { ok: true, total: items.length, added, skipped: items.length - added, skippedList };
  },


  // ------------------------- SINKRONISASI CLOUD -------------------------
  // Kumpulkan perubahan lokal setelah `sinceMs` (jam HP ini) untuk dikirim ke server.
  async collectDirty(sinceMs: number): Promise<{ products: any[]; transactions: any[]; bukti: any[]; settings: any }> {
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
    const outB: any[] = [];
    for (const b of buktiList) {
      const ms = Date.parse(b.updated_at || b.created_at || "") || 0;
      // Gambar sumber hanya lokal → jangan disinkron (hemat & privasi).
      if (ms > sinceMs) { const { image_uri, ...doc } = b; outB.push({ id: b.id, doc, updated_at: ms }); }
    }
    let outS: any = null;
    if (settingsUpdatedAt > sinceMs && settings) outS = { doc: settings, updated_at: settingsUpdatedAt };
    return { products: outP, transactions: outT, bukti: outB, settings: outS };
  },

  // Terapkan data dari server (LWW). Kembalikan true bila ada perubahan.
  async applyRemote(remote: { products?: any[]; transactions?: any[]; bukti?: any[]; settings?: any }): Promise<boolean> {
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
    for (const rb of remote.bukti || []) {
      const idx = buktiList.findIndex((x) => x.id === rb.id);
      const local = idx >= 0 ? buktiList[idx] : null;
      const lms = local ? (Date.parse(local.updated_at || local.created_at || "") || 0) : -1;
      if ((!local || rb.updated_at > lms) && rb.doc) {
        const doc = rb.doc as Bukti;
        if (idx >= 0) buktiList[idx] = { ...doc, image_uri: local?.image_uri ?? null };
        else buktiList.push(doc);
        await putBukti(buktiList.find((x) => x.id === rb.id) as Bukti);
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
    if (changed) { sortTx(); sortBukti(); notifyChange(); }
    return changed;
  },

  // Hapus daftar tombstone setelah berhasil dikirim ke server.
  async clearDeletions(): Promise<void> {
    if (deletions.size === 0) return;
    deletions.clear();
    await putKv("deletions", {});
  },
};
