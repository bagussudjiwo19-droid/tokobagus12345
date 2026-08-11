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
