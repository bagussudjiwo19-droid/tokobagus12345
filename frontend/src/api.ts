import type { Product, Settings, Printer, Transaction, TxItem, Bukti } from "./types";
import { local } from "./localdb";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "") + "/api";

// Hasil OCR bukti pembayaran (per-field + tanda "yakin"/ragu).
export type OcrField = { value: string | number | null; confident: boolean };
export type OcrBuktiResult = { fields: Record<"method" | "recipient" | "amount" | "date" | "time" | "ref", OcrField> };

// ============================================================================
// APLIKASI OFFLINE: semua data tersimpan di HP (tidak butuh internet/server).
// `api` tetap memakai nama & bentuk yang sama seperti sebelumnya, tetapi kini
// diarahkan ke mesin data LOKAL (src/localdb.ts). Tidak ada layar yang perlu
// diubah. Printer & scanner Bluetooth tetap bekerja offline seperti biasa.
// ============================================================================

export const api = {
  // Products
  getProducts: (): Promise<Product[]> => local.getProducts(),
  searchProducts: (q: string): Promise<Product[]> => local.searchProducts(q),
  getByBarcode: (code: string): Promise<Product> => local.getByBarcode(code),
  createProduct: (p: Partial<Product>): Promise<Product> => local.createProduct(p),
  updateProduct: (id: string, p: Partial<Product>): Promise<Product> => local.updateProduct(id, p),
  updateStock: (id: string, stock: number, variation_id?: string): Promise<Product> =>
    local.updateStock(id, stock, variation_id),
  deleteProduct: (id: string): Promise<{ ok: boolean }> => local.deleteProduct(id),

  // Transactions
  getTransactions: (limit = 200): Promise<Transaction[]> => local.getTransactions(limit),
  getTransaction: (id: string): Promise<Transaction> => local.getTransaction(id),
  createTransaction: (payload: {
    items: TxItem[];
    total: number;
    discount?: number;
    cash_paid: number;
    change: number;
  }): Promise<Transaction> => local.createTransaction(payload),
  updateTransaction: (
    id: string,
    payload: { items: TxItem[]; total: number; discount?: number; cash_paid: number; change: number; created_at?: string },
  ): Promise<Transaction> => local.updateTransaction(id, payload),

  // Settings & printer
  getSettings: (): Promise<Settings> => local.getSettings(),
  saveSettings: (s: Settings): Promise<Settings> => local.saveSettings(s),
  getPrinter: (): Promise<Printer> => local.getPrinter(),
  savePrinter: (p: Printer): Promise<Printer> => local.savePrinter(p),

  // Reports & backup
  summary: (): Promise<{ total_transaksi: number; total_omzet: number }> => local.summary(),
  exportBackup: (): Promise<any> => local.exportBackup(),
  importBackup: (data: any): Promise<{ ok: boolean; products: number; transactions: number }> =>
    local.importBackup(data),
  // Bukti Pembayaran (OCR)
  getBukti: (limit = 500): Promise<Bukti[]> => local.getBukti(limit),
  saveBukti: (b: Omit<Bukti, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string }): Promise<Bukti> =>
    local.saveBukti(b),
  deleteBukti: (id: string): Promise<{ ok: boolean }> => local.deleteBukti(id),
  // OCR online: kirim gambar (base64) ke backend → JSON terstruktur. Lempar error bila offline.
  ocrBukti: async (image_base64: string, mime_type = "image/jpeg"): Promise<OcrBuktiResult> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(`${BASE}/ocr/bukti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64, mime_type }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  },
};
