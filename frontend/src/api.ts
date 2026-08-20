import type { Product, Settings, Printer, Transaction, TxItem } from "./types";
import { local } from "./localdb";

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
  safeImportProducts: (
    data: any,
  ): Promise<{ ok: boolean; total: number; added: number; skipped: number; skippedList: { name: string; reason: string }[] }> =>
    local.safeImportProducts(data),
};
