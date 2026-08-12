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
### v10 — Keyboard scan: tampil hanya saat kolom disentuh
- Transaksi (index.tsx), Produk (produk.tsx), Cek Harga (cek-harga.tsx): input scan Bluetooth kini `showSoftInputOnFocus` mengikuti state (default false).
- Saat scan / autofocus (pindah tab / setelah scan) → keyboard HP TIDAK muncul. autoFocus dihapus, fokus dilakukan programatik dengan state false.
- Saat user MENYENTUH/klik kolom (onPressIn + wrapper onPress → openKeyboard) → keyboard HP muncul (blur+refocus dengan state true). Guard ref `skipBlur` mencegah blur programatik mereset state.
- Kembali ke mode scan (tanpa keyboard) saat: submit (Enter scanner), blur asli (tap keluar), atau tab difokuskan ulang.
- Verified (web): ketiga alur scan tetap resolve barcode. Perilaku suppress keyboard bersifat native → uji di Expo Go/build.

### v9 — Optimasi performa (tanpa ubah fungsi)
- produk.tsx & cari.tsx: `useDeferredValue` untuk filter (input tetap responsif saat ketik/scan cepat pada 2262 produk).
- produk.tsx: baris di-`React.memo` (ProdukRow), `getItemLayout` (tinggi baris tetap 63), props virtualisasi FlatList (removeClippedSubviews, initialNumToRender=12, maxToRenderPerBatch=12, windowSize=9) → hanya ~50 baris di memori dari 2262.
- produk.tsx: reload hanya bila `products` kosong (hindari refetch ~700KB tiap pindah tab); semua mutasi tetap reload eksplisit → data tetap segar.
- cari.tsx & riwayat.tsx: props virtualisasi FlatList ditambahkan.
- Data dimuat sekali saat start, tanpa polling background. Scan Bluetooth, pembayaran, printer, backup/restore, transaksi TIDAK diubah.
- Verified: testing_agent iteration_7 → 24/24 assertion lolos, tanpa regresi.

### v8 — Suara Kembalian (TTS)
- Setting baru `voiceChange` (default ON) di Settings model + types; get_settings di-merge dengan default agar field baru selalu ada & tersimpan lintas transaksi.
- Toggle "Suara Kembalian" di Pengaturan Struk (bagian SUARA), diakses via header tab Riwayat → ikon struk.
- src/voice.ts: terbilang (angka→kata Indonesia) + speakChange() pakai expo-speech (language id-ID). Contoh 48.000 → "Kembalian empat puluh delapan ribu rupiah." (terbilang diuji beberapa nilai).
- Trigger di checkout confirmPay SETELAH transaksi sukses: hanya jika voiceChange ON DAN change > 0. Bayar pas (change=0) / kurang (change<0) → tidak bersuara. Fire-and-forget (try/catch) → tidak mengganggu simpan/cetak/pembayaran.
- CATATAN: audio TTS hanya terdengar di perangkat (Expo Go/native build), tidak di preview web.

### v7 — Backup/Restore audit + Printer audit
- Backup export SUDAH lengkap: produk (buy_price/sell_price/barcode/stock/variasi/tiers), transaksi, settings, printer. Verified round-trip 2262 produk + 100 transaksi tanpa kehilangan/duplikat.
- Restore DIPERBAIKI agar aman: validasi struktur + model SEBELUM hapus data; staging ke koleksi *_tmp; baru swap bila sukses; dedupe by id. Data lama TIDAK dihapus jika file rusak. Pesan error jelas dalam Bahasa Indonesia. Verified: 4 skenario rusak → 400 + data lama utuh, tanpa sisa koleksi tmp.
- Printer: koneksi/scan paired devices, pilih dari banyak printer, tersimpan di DB & dipakai ulang. Cetak terpisah dari simpan transaksi (printer tak terhubung → toast info, transaksi TIDAK gagal). Struk (ReceiptPreview & buildReceiptText 32-char) memuat PEMBAYARAN KURANG, nama, qty x harga, subtotal, TOTAL, Tunai, Kembali. Verified via screenshot receipt partial.
- CATATAN: pencetakan fisik Bluetooth hanya bisa diuji di build native (Publish), tidak di Expo Go/preview (modul react-native-bluetooth-classic tidak tersedia di web).

### v6 — Riwayat: Edit Transaksi
- Backend: PUT /api/transactions/{tid} (TransactionUpdate) — update transaksi yang ada (bukan buat baru).
  - Stok direkonsiliasi: delta = qty_lama - qty_baru per produk/varian (kembalikan qty lama, kurangi qty baru).
  - created_at dipertahankan (tanggal/waktu asli) kecuali dikirim eksplisit.
- Frontend: modal /edit-transaksi (dibuka dari tombol "Edit Transaksi" di detail Riwayat).
  - Edit barang (hapus), jumlah (stepper), harga (input); Total & Kembalian/Kurang dihitung ulang otomatis.
  - Uang Bayar dapat diedit. Tombol "Batal" & "Simpan Perubahan".
  - Tanggal asli ditampilkan read-only ("Tanggal asli: ...").
- Verified: backend script (same id, created_at preserved, stok 9998→9996→9998) + UI e2e (qty +1 → total 6.000→12.000, tersimpan ke transaksi yang sama).

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
