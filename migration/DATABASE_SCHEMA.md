# Skema Database — Toko Bagus Kasir (MongoDB)

Database: **MongoDB** (nama default `toko_bagus`, dari env `DB_NAME`).
Semua dokumen memakai field aplikasi `id` (UUID/string) sebagai kunci logis —
**bukan** `_id` Mongo. Field `_id` diabaikan saat backup/restore.

> Catatan penting: aplikasi ini **local-first**. Sumber kebenaran sebenarnya ada
> di **SQLite pada HP** (`frontend/src/localdb.ts`). MongoDB di backend menyimpan
> (a) salinan REST (products/transactions/settings/printer) dan (b) data
> **sinkronisasi** per-Kode Toko (`s_*`). Skema di bawah mencakup keduanya.

---

## 1. `products` — Katalog produk (REST)
Satu dokumen per produk (induk maupun anak/variasi terpisah).

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | Kunci logis (unik). |
| `name` | string | Nama barang. |
| `category` | string | Kategori (opsional). |
| `unit` | string | Satuan (default `pcs`). |
| `barcode` | string \| null | Barcode utama. |
| `barcodes` | string[] | Barcode tambahan (banyak barcode → 1 produk). |
| `parent_id` | string \| null | Relasi ke induk (`products.id`). Null = produk induk. |
| `buy_price` | number | Harga beli. |
| `sell_price` | number | Harga jual. |
| `stock` | number | Stok (boleh pecahan, mis. 0,25). |
| `tiers` | Tier[] | Harga bertingkat (grosir). `Tier = {min_qty, price, note?, disp_name?, disp_price?}`. |
| `inherit_tiers` | boolean | Variasi mengikuti tier induk. |
| `variations` | Variation[] | Variasi tertanam (lihat di bawah). |
| `price_type` | enum | `biasa` \| `grosir` \| `variasi` \| `ikut` \| `varbarcode`. |
| `quick_qty`, `quick_qty2`, `quick_qty3` | number | Tombol Jumlah Cepat per produk. |
| `created_at`, `updated_at` | ISO string | Waktu buat/ubah (dipakai LWW sync). |

**Variation** (di dalam `products.variations[]`):
`{ id, name, barcode?|null, buy_price, sell_price, stock, tiers[], inherit_tiers }`

**Relasi:** `products.parent_id → products.id` (induk–anak). Variasi bisa berupa
dokumen anak terpisah (punya `parent_id`) atau objek tertanam di `variations[]`.

**Index:** `id`, `barcode` (dibuat otomatis saat startup server).

---

## 2. `transactions` — Riwayat transaksi (REST)

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | Kunci logis (unik). |
| `items` | TxItem[] | Rincian barang (lihat di bawah). |
| `total` | number | Total setelah diskon. |
| `discount` | number | Potongan (Rp), default 0. |
| `cash_paid` | number | Uang diterima. |
| `change` | number | Kembalian (0 bila bayar kurang). |
| `created_at` | ISO string | Tanggal transaksi (dipertahankan saat edit). |
| `updated_at` | ISO string | Waktu ubah terakhir. |

**TxItem** (di dalam `transactions.items[]`):
`{ product_id?|null, variation_id?|null, name, barcode?|null, unit?, price, quantity, subtotal }`

**Relasi (lunak):** `items[].product_id → products.id`, `items[].variation_id →`
`products.variations[].id`. Bersifat historis: transaksi lama tetap valid meski
produk kemudian diubah/dihapus (nama & harga tersimpan di dalam item).

**Index:** `id`.

**Turunan (tidak disimpan sebagai koleksi terpisah):**
- *Ringkasan/laporan* & *barang terlaris* dihitung on-the-fly dari `transactions`.
- *Status "Belum Lunas"* = `cash_paid < total`.

---

## 3. `settings` — Pengaturan aplikasi (dokumen tunggal)
`_id` tetap = `"app_settings"`. Field utama: identitas toko (`shopName`,
`address`, `phone`, `cashier`), toggle tampilan struk (`show*`), suara
(`voiceChange`, `sfx*`), maskot (`hideMiko`), stok (`unlimitedStock`,
`lowStockThreshold`), pintasan (`quickSlots`). (Definisi lengkap:
`frontend/src/types.ts → Settings`.)

## 4. `printer` — Printer tersimpan (dokumen tunggal)
`_id` tetap = `"app_printer"`. `{ address, name }` (alamat Bluetooth thermal printer).

---

## 5. Koleksi Sinkronisasi (`s_products`, `s_transactions`, `s_settings`)
Menyimpan data hasil **sinkronisasi multi-HP**, dipisah per **Kode Toko** (`store`).
Digabung dengan aturan *Last-Write-Wins* memakai `updated_at` (jam HP) dan cursor
`srv_at` (jam server).

**`s_products`** `{ store, id, doc(Product), updated_at(ms), srv_at(ms), deleted(bool) }`
**`s_transactions`** `{ store, id, doc(Transaction), updated_at(ms), srv_at(ms) }`
**`s_settings`** `{ store, doc(Settings), updated_at(ms), srv_at(ms) }`

**Index:**
- `s_products`, `s_transactions`: `(store, id)` dan `(store, updated_at)`.
- `s_settings`: `store`.

> Data `s_*` opsional untuk migrasi: bila diikutkan, HP yang sudah pakai
> **Kode Toko** sama akan langsung tersinkron di server baru. Bila tidak,
> HP akan mem-*push* ulang datanya saat online.

---

## Yang **tidak** ada sebagai tabel (klarifikasi)
- **Pelanggan / nomor WhatsApp** *tidak* disimpan sebagai koleksi. Nomor WhatsApp
  diketik saat menekan "Kirim Struk WhatsApp" dan langsung dibuka via deep-link —
  tidak dipersistensi. (Jika perlu daftar pelanggan tersimpan, itu fitur baru.)
- **Kategori** bukan koleksi terpisah — disimpan sebagai field `category` pada produk.

---

## Ringkasan Index (identik dengan yang dibuat server saat startup)
```
products.id
products.barcode
transactions.id
s_products (store, id)
s_products (store, updated_at)
s_transactions (store, id)
s_transactions (store, updated_at)
s_settings.store
```
Script `migration/scripts/import_data.py` membuat ulang seluruh index ini.
