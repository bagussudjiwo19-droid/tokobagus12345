export type Tier = { min_qty: number; price: number; note?: string; disp_name?: string; disp_price?: number };

export type Variation = {
  id: string;
  name: string;
  barcode?: string | null;
  buy_price: number;
  sell_price: number;
  stock: number;
  tiers: Tier[];
  inherit_tiers: boolean;
};

export type Product = {
  id: string;
  name: string;
  category?: string;
  unit?: string;
  barcode?: string | null;
  barcodes?: string[]; // barcode tambahan (banyak barcode → 1 produk → daftar variasi yang sama)
  parent_id?: string | null;
  buy_price: number;
  sell_price: number;
  stock: number;
  tiers: Tier[];
  inherit_tiers?: boolean;
  variations: Variation[];
  price_type?: "biasa" | "grosir" | "variasi" | "ikut" | "varbarcode"; // mode harga tersimpan (agar form buka di mode yang benar)
  quick_qty?: number; // Jumlah Cepat 1 per-produk (tombol [N] di keranjang, TAMBAH nilai). 0/undefined = sembunyikan.
  quick_qty2?: number; // Jumlah Cepat 2
  quick_qty3?: number; // Jumlah Cepat 3
  created_at?: string;
  updated_at?: string;
};

export type TxItem = {
  product_id?: string | null;
  variation_id?: string | null;
  name: string;
  barcode?: string | null;
  unit?: string;
  price: number;
  quantity: number;
  subtotal: number;
};

export type Transaction = {
  id: string;
  items: TxItem[];
  total: number;
  discount?: number;
  cash_paid: number;
  change: number;
  created_at: string;
  updated_at?: string;
};

// Bukti Pembayaran (SALINAN dari screenshot e-wallet/bank via OCR). Dicatat
// TERPISAH dari penjualan — tidak dihitung di omzet/laporan/laba.
export type Bukti = {
  id: string;
  method: string;      // metode/aplikasi pembayaran (ShopeePay, GoPay, dll)
  recipient: string;   // nama penerima/merchant
  amount: number;      // nominal (rupiah, bulat)
  date: string;        // tanggal apa adanya seperti terbaca
  time: string;        // waktu
  ref: string;         // nomor referensi/ID transaksi
  customer: string;    // nama pelanggan (diisi kasir, opsional)
  image_uri?: string | null; // path gambar sumber (lokal saja, tidak disinkron)
  created_at: string;
  updated_at?: string;
};

export type Settings = {
  shopName: string;
  address: string;
  phone: string;
  cashier: string;
  note: string;
  thanks: string;
  showShopName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showLogo: boolean;
  showDateTime: boolean;
  showTxNumber: boolean;
  showQueue: boolean;
  showCashier: boolean;
  showQR: boolean;
  showItemName: boolean;
  showVariation: boolean;
  showBarcode: boolean;
  showUnitPrice: boolean;
  showQty: boolean;
  showSubtotal: boolean;
  showDiscount: boolean;
  showTotal: boolean;
  showCashPaid: boolean;
  showChange: boolean;
  voiceChange: boolean;
  readPrice?: boolean; // Cek Harga: bacakan nama & harga setelah barcode ditemukan
  priceClosing?: boolean; // Cek Harga: bacakan kalimat penutup setelah baca harga
  showNote: boolean;
  showThanks: boolean;
  sfxVolume?: "normal" | "keras" | "maks"; // tingkat volume efek suara
  sfxOk?: string; // bunyi: barang masuk / berhasil
  sfxFail?: string; // bunyi: gagal / tidak masuk
  sfxPaid?: string; // bunyi: transaksi lunas
  quickSlots?: (string | null)[]; // 10 slot Pintasan Produk (menyimpan ID produk; null = kosong)
  hideMiko?: boolean; // sembunyikan maskot Miko di layar kasir (default: tampil)
  unlimitedStock?: boolean; // mode tanpa stok: sembunyikan angka & peringatan stok (default: aktif)
  lowStockThreshold?: number; // ambang batas "Stok Menipis" (default 5) — produk dengan stok <= nilai ini ditandai
};

export type Printer = { address?: string | null; name?: string | null };

export type CartLine = {
  key: string;
  product_id?: string | null;
  variation_id?: string | null;
  name: string;
  barcode?: string | null;
  unit?: string;
  quantity: number;
  base_price: number; // reference sell price
  price: number; // effective unit price (after tiers)
  tiers: Tier[];
  manual?: boolean;
};
