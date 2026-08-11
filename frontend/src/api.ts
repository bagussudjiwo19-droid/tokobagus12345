import type { Product, Settings, Printer, Transaction, TxItem } from "./types";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  // Products
  getProducts: () => req<Product[]>(`/api/products/pos`),
  searchProducts: (q: string) =>
    req<Product[]>(`/api/products?search=${encodeURIComponent(q)}`),
  getByBarcode: (code: string) =>
    req<Product>(`/api/products/barcode/${encodeURIComponent(code)}`),
  createProduct: (p: Partial<Product>) =>
    req<Product>(`/api/products`, { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id: string, p: Partial<Product>) =>
    req<Product>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  updateStock: (id: string, stock: number, variation_id?: string) =>
    req<Product>(`/api/products/${id}/stock`, {
      method: "PATCH",
      body: JSON.stringify({ stock, variation_id }),
    }),
  deleteProduct: (id: string) =>
    req<{ ok: boolean }>(`/api/products/${id}`, { method: "DELETE" }),

  // Transactions
  getTransactions: (limit = 200) =>
    req<Transaction[]>(`/api/transactions?limit=${limit}`),
  getTransaction: (id: string) => req<Transaction>(`/api/transactions/${id}`),
  createTransaction: (payload: {
    items: TxItem[];
    total: number;
    cash_paid: number;
    change: number;
  }) => req<Transaction>(`/api/transactions`, { method: "POST", body: JSON.stringify(payload) }),
  updateTransaction: (
    id: string,
    payload: { items: TxItem[]; total: number; cash_paid: number; change: number; created_at?: string },
  ) => req<Transaction>(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  // Settings & printer
  getSettings: () => req<Settings>(`/api/settings`),
  saveSettings: (s: Settings) =>
    req<Settings>(`/api/settings`, { method: "PUT", body: JSON.stringify(s) }),
  getPrinter: () => req<Printer>(`/api/printer`),
  savePrinter: (p: Printer) =>
    req<Printer>(`/api/printer`, { method: "PUT", body: JSON.stringify(p) }),

  // Reports & backup
  summary: () =>
    req<{ total_transaksi: number; total_omzet: number }>(`/api/reports/summary`),
  exportBackup: () => req<any>(`/api/backup/export`),
  importBackup: (data: any) =>
    req<{ ok: boolean; products: number; transactions: number }>(`/api/backup/import`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
