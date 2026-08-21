# Audit Portabilitas — Toko Bagus Kasir

Dokumen ini adalah hasil **pemeriksaan kode nyata** (bukan klaim), berisi semua
titik yang berpotensi mengikat aplikasi ke Emergent, statusnya, dan perbaikannya.

Tanggal audit: 2026-06. Ruang lingkup: `/app/backend`, `/app/frontend`, konfigurasi.

## Ringkasan
- Inti aplikasi (POS, katalog, transaksi, riwayat, cek harga) **LOCAL-FIRST** dan
  **tidak** butuh Emergent. Data utama tersimpan di **SQLite di HP** (`frontend/src/localdb.ts`).
- Sinkronisasi cloud bersifat **opsional** dan memakai backend FastAPI + MongoDB
  yang **bisa Anda jalankan sendiri** (open-source).
- Backup/Restore memakai **file JSON** — 100% independen dari Emergent.
- Satu-satunya ketergantungan Emergent yang nyata adalah **AI "Miko"** (opsional).
  Sudah dibuat **bisa diganti** ke penyedia sendiri lewat environment variable.

## Temuan detail

| # | Lokasi | Ketergantungan Emergent | Status setelah audit |
|---|--------|--------------------------|----------------------|
| 1 | `backend/server.py` `/api/miko/chat` | `emergentintegrations` + `EMERGENT_LLM_KEY` (proxy LLM Emergent) | ✅ DIPERBAIKI — kini provider-agnostic via `LLM_PROVIDER`. Impor `emergentintegrations` ditunda (lazy) sehingga server sendiri TIDAK wajib memilikinya bila pakai `openai_compatible`. |
| 2 | `backend/.env` `EMERGENT_LLM_KEY=sk-emergent-...` | Credential Emergent di file env | ⚠️ Ada di `.env` **development** (bukan di source code). `.gitignore` sudah diperbarui agar `.env` tak ikut ter-commit. Template aman `backend/.env.example` disediakan tanpa credential. Untuk self-host, kosongkan/ganti. |
| 3 | `frontend/.env` `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PACKAGER_*` | URL menunjuk host preview Emergent | ✅ Hanya **konfigurasi**. `EXPO_PUBLIC_BACKEND_URL` diubah ke server Anda saat self-host. `EXPO_PACKAGER_*` hanya untuk preview Emergent dan **tidak dibaca** kode aplikasi. |
| 4 | Database server | MongoDB | ✅ Bukan Emergent. MongoDB open-source, jalankan sendiri (Docker/VPS). Lihat `docker-compose.yml`. |
| 5 | Penyimpanan data | — | ✅ Tidak ada storage khusus Emergent. Gambar/aset ada di repo (`frontend/assets`). Tidak ada object storage pihak ketiga. |
| 6 | Autentikasi | — | ✅ Aplikasi tidak punya auth berbasis Emergent. Kios Cek Harga pakai PIN lokal (SecureStore di HP). |

## Bukti local-first & antrean offline
- `frontend/src/localdb.ts` — seluruh CRUD produk/transaksi/pengaturan ke **SQLite**.
  Aplikasi jalan penuh tanpa internet.
- `frontend/src/sync.ts` — sinkronisasi **berbasis kursor**:
  - `collectDirty(sinceMs)` mengumpulkan perubahan lokal (produk/transaksi/pengaturan)
    yang `updated_at`-nya lebih baru dari kursor → **antrean push**.
  - `applyRemote(...)` menerapkan data server (Last-Write-Wins).
  - `startAutoSync()` menjalankan `syncOnce()` tiap 45 detik dan saat app kembali aktif.
  - Saat internet mati → status `offline`, perubahan tetap tersimpan lokal dan
    **otomatis terkirim** begitu online lagi (kursor `lastPush` menjamin tidak hilang).
- Backup/Restore: `backend`? Tidak. Ini **lokal**: `frontend/app/backup.tsx` +
  `frontend/src/localdb.ts` (`exportBackup`, `importBackup`, `safeImportProducts`) —
  ekspor/impor **file .json** via share sheet HP. Tidak lewat Emergent.

## Kesimpulan
Setelah perbaikan #1–#3, **tidak ada ketergantungan keras** pada Emergent:
- Tanpa mengatur AI apa pun → aplikasi + sync + backup berjalan penuh di server Anda.
- Fitur AI Miko (opsional) tinggal diarahkan ke penyedia OpenAI-compatible milik Anda.

Emergent murni menjadi **tempat pengembangan**. Lihat `docs/MIGRATE_FROM_EMERGENT.md`
untuk langkah pindah ke server sendiri.
