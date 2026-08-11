# PRD — Toko Bagus (Kasir Warung / POS)

## Original Problem Statement
User uploaded a `.7z` containing an APK of an existing Indonesian POS app "Toko Bagus". Requested read-only analysis, then (since only the compiled APK existed, no source) approved a **faithful rebuild** on the Emergent stack, in **Bahasa Indonesia**, seeding initial data from their real JSON backup, keeping the original look/flow/features.

## Analysis Findings (APK)
- Original stack = Expo SDK 54 + expo-router + TypeScript + FastAPI + MongoDB (built on Emergent; pkg `com.emergent.quickcheckout`, owner `emergent008`). 100% compatible.
- APK = compiled Hermes bytecode → original source not recoverable → rebuilt from feature blueprint.

## Architecture
- **Frontend**: Expo SDK 54, expo-router (tabs: Kasir/Produk/Riwayat/Pengaturan + modal routes checkout/scan/produk-form). Dark theme #000000, brand emerald #10B981, fonts Barlow Condensed + DM Sans. Global CartProvider + DataProvider + ToastProvider. Keyboard via react-native-keyboard-controller.
- **Backend**: FastAPI + MongoDB (`toko_bagus`). Models: Product (variations + tiers), Transaction (items), Settings, Printer. Seeds from `/app/backend/seed/toko_bagus_backup.json` on startup if empty.
- **Native**: expo-camera (barcode), react-native-bluetooth-classic + with-rn-bluetooth-classic (thermal printer, native-build only, guarded), react-native-view-shot (receipt image), expo-sharing/document-picker/file-system (backup).

## User Personas
- Pemilik/penjaga warung: input cepat via scan/cari, hitung kembalian, cetak/bagikan struk, kelola stok & harga grosir.

## Core Requirements (static)
- Bahasa Indonesia UI, Rupiah formatting (Rp 15.000), offline-friendly POS, keep original data.

## Implemented (2026-08-11)
### v5 — Cek Harga screen
- Hapus header "KASIR WARUNG" + tanggal; judul "Cek Harga" jadi paling atas.
- Auto scan mode aktif saat tab dibuka (input tersembunyi auto-focus, softInput disabled → no keyboard HP).
- Barcode discan → tampil nama barang + harga jual (support varian). Hasil bertahan 15 detik + countdown, lalu auto-reset & refocus siap scan berikutnya.
- Barcode tidak ketemu → tetap di mode scan (siap scan lagi).
- Hasil scan & hasil pencarian TIDAK menampilkan stok (hanya nama + harga jual).
- Pencarian manual: Cari Produk → pilih produk → otomatis kembali ke Cek Harga (via DataProvider.pricePick) → tampil nama + harga → siap scan Bluetooth lagi. Varian → pilih varian dulu.
- Verified via screenshot_tool (idle + scan + manual-pick + countdown 15s).

### v4 — Produk screen improvements
- Hapus header "KASIR WARUNG" + pill "Siap" dari layar Produk; judul "Produk" jadi paling atas.
- Kolom pencarian Produk mendukung scanner barcode Bluetooth: auto-focus saat tab fokus, softInput disabled (no keyboard HP), onSubmitEditing → getByBarcode.
- Barcode ditemukan → tampil kartu "HASIL SCAN" + field auto-clear + refocus siap scan berikutnya.
- Barcode tidak ditemukan → toast error + field clear + tetap fokus.
- Tombol toggle keypad untuk ketik manual (aktifkan keyboard HP) — pertahankan pencarian manual.
- Verified via screenshot_tool (found + not-found + field clear + focus).

### v3 — Transaksi (Kasir) improvements
- Auto scan: mode-scan input auto-focus saat tab Transaksi fokus (siap scan tanpa tekan tombol; softInput disabled untuk HW scanner).
- Auto-scroll ke item terbaru setelah scan + highlight sekilas.
- Edit Harga per baris: 3 opsi (transaksi ini saja / harga permanen via PUT produk / batal).
- Tambah Item dari Transaksi: Nama, Harga Beli, Harga Jual, Barcode, Jumlah + 2 opsi (transaksi ini saja / simpan ke produk permanen via POST).
- Daftar belanja dibuat kompak (baris kecil) agar lebih banyak item terlihat.
- Fix: ganti BottomSheetTextInput → TextInput (hilangkan red overlay web). Verified: testing_agent iteration_3 PASS.

### v2 — Match original screenshots (LIGHT theme)
- Switched to original LIGHT cream (#F5F0E6) + brick-red (#D13A2C) theme, StatusBar dark.
- Tabs → Transaksi / Produk / Cek Harga / Riwayat (removed Pengaturan tab).
- Transaksi (Kasir) redesigned scan-first: Scan Barcode / Cari Barang / Item Manual / mode-scan input / Daftar Belanja inline / Bayar bar → checkout(pay).
- New: Cek Harga tab (scan/cari price check), Item Manual (manual cart line), Kelola Stok modal, global AppHeader (KASIR WARUNG + tanggal + Siap pill), Cari modal (mode cart/price).
- Settings split into modals from Riwayat header icons: Backup & Pulihkan, Pengaturan Struk (grouped INFO TOKO/INFO TRANSAKSI/RINCIAN ITEM/RINGKASAN/PENUTUP, Logo & QR disabled), Pengaturan Printer.
- Produk: 3-dot menu (Edit Produk / Kelola Stok / Duplikat / Hapus), row subtitle "barcode · Stok N pcs".
- Verified: testing_agent iteration_2 PASS (backend 13/13, all redesigned flows, data preserved 2267/TOKO BAGUS).

### v1 (initial rebuild)
- Kasir (POS): search + category chips + product grid, variation picker, sticky cart CTA.
- Checkout: cart edit → numpad + Nominal Cepat → change calc → create transaction (decrements stock) → receipt preview + share/print.
- Produk: catalog list + search + add/edit/delete form with variations & tiered wholesale pricing.
- Riwayat: omzet summary + transaction list + receipt detail (share/print).
- Pengaturan: store info + 15 receipt toggles + printer scan/select/test + backup export/import.
- Data seeded: 2267 produk, 85 transaksi, settings "TOKO BAGUS".
- Tested: backend 13/13 pytest pass; all 4 tabs verified in preview.

## Backlog
- P1: Cetak Struk Bluetooth + live camera scan — only testable on a native build (Publish → build).
- P2: DELETE transaction endpoint; import payload schema validation; laporan penjualan harian/grafik; diskon per-transaksi; kelola stok cepat (bulk); migrate off `expo-file-system/legacy`.

## Next Tasks
- Generate native build to validate barcode scan + Bluetooth printing on device.
- Optional: laporan/omzet per periode, ekspor CSV.
