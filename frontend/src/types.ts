export type Tier = { min_qty: number; price: number };

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
  parent_id?: string | null;
  buy_price: number;
  sell_price: number;
  stock: number;
  tiers: Tier[];
  inherit_tiers?: boolean;
  variations: Variation[];
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
