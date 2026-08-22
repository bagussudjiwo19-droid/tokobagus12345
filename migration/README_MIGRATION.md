# Panduan Migrasi ke Akun / Project Emergent BARU

Paket ini memindahkan **seluruh source code + data** aplikasi *Toko Bagus Kasir*
ke akun/project Emergent baru **tanpa kehilangan fitur maupun data**. Project
lama **tidak diubah/dihapus** — ini salinan & ekspor yang aman.

> Untuk pindah ke server/VPS sendiri (self-host, lepas total dari Emergent),
> lihat `docs/MIGRATE_FROM_EMERGENT.md`. Dokumen ini fokus ke **akun Emergent baru**.

---

## Isi paket migrasi (`migration/`)
```
migration/
├─ README_MIGRATION.md      # dokumen ini
├─ DATABASE_SCHEMA.md       # skema lengkap: koleksi, field, relasi, index
├─ scripts/
│  ├─ export_data.py        # ekspor SEMUA data MongoDB → migration/data/*.json
│  └─ import_data.py        # impor kembali ke MongoDB target (+ buat index)
└─ data/                    # HASIL EKSPOR DATA SAAT INI (sudah dibuat)
   ├─ products.json         #   2261 produk
   ├─ transactions.json     #    123 transaksi
   ├─ settings.json         #      1 pengaturan
   ├─ printer.json          #      1 printer
   ├─ s_products.json       #  23134 (sinkronisasi per Kode Toko) — TIDAK ikut ke GitHub (ukuran besar)
   ├─ s_transactions.json   #    993 (sinkronisasi)
   ├─ s_settings.json       #      3 (sinkronisasi)
   ├─ app_backup.json       # backup format APLIKASI (untuk Restore lewat UI / /api/backup/import)
   └─ manifest.json         # ringkasan jumlah dokumen + waktu ekspor
```
Semua file `*.json` di `data/` memakai *Extended JSON* (lossless) sehingga tipe
data terjaga saat di-impor ulang. `app_backup.json` memakai format backup aplikasi.

> **Catatan ukuran file:** `s_products.json` (~13 MB) sengaja **TIDAK ikut** di-push
> ke GitHub (di-`.gitignore`) agar proses "Save to GitHub" tidak gagal karena file besar.
> File ini **tetap tersimpan lokal** dan bersifat **opsional** (hanya data sinkronisasi
> multi-HP). Untuk membuatnya lagi kapan saja, jalankan di project lama:
> `cd migration/scripts && python3 export_data.py`. Data utama (produk, transaksi,
> pengaturan, printer) tetap lengkap di `products.json`/`transactions.json`/`app_backup.json`.

---

## Bagian A — Pindahkan SOURCE CODE

Seluruh kode aplikasi sudah lengkap dan portable di repo ini:
- `backend/` — FastAPI (`server.py`), `requirements.txt`, `Dockerfile`, `.env.example`
- `frontend/` — Expo/React Native (`app/`, `components/`, `src/`, `assets/`, `app.json`, `.env.example`)
- `docker-compose.yml`, `docs/`, dan `migration/` (paket ini)

Cara memindahkan ke project Emergent baru (pilih salah satu):
1. **GitHub (disarankan):** dari project lama, gunakan tombol **Save to GitHub**
   (panel kanan atas). Lalu di project Emergent baru, **import** repo tersebut.
2. **Download kode:** unduh seluruh kode dari project lama, lalu unggah/klon ke
   project baru.

> Tidak ada dependency yang terkunci ke akun Emergent lama. Satu-satunya nilai
> milik-Emergent adalah `EMERGENT_LLM_KEY` (opsional, hanya untuk AI "Miko") yang
> **tidak** ikut di-commit dan akan diisi ulang di environment baru (lihat Bagian C).

---

## Bagian B — Pindahkan DATA

Ada **dua cara**. Cara 1 paling lengkap (semua koleksi + index). Cara 2 paling
sederhana (lewat aplikasi), cukup untuk data utama produk & transaksi.

### Cara 1 — Import penuh via script (disarankan)
Di **project Emergent baru** (backend sudah punya `MONGO_URL`/`DB_NAME` sendiri
di `backend/.env`), jalankan:
```bash
cd migration/scripts
python3 import_data.py           # GANTI TOTAL isi DB agar identik dengan sumber
# atau:
python3 import_data.py --keep    # TAMBAH tanpa menghapus data yang sudah ada
```
Script otomatis:
- membaca `migration/data/*.json`,
- memasukkan seluruh koleksi (`products, transactions, settings, printer,
  s_products, s_transactions, s_settings`),
- membuat ulang semua **index** seperti server produksi.

Verifikasi cepat:
```bash
curl "$EXPO_PUBLIC_BACKEND_URL/api/reports/summary"     # jumlah transaksi & omzet
curl "$EXPO_PUBLIC_BACKEND_URL/api/products/pos" | head  # produk tampil
```

> Butuh menghasilkan ekspor terbaru dari project lama? Jalankan di project lama:
> ```bash
> cd migration/scripts && python3 export_data.py
> ```
> Ini menimpa `migration/data/*.json` dengan snapshot terbaru, lalu commit/pindahkan.

### Cara 2 — Restore lewat aplikasi (paling mudah, data utama)
Gunakan `migration/data/app_backup.json`:
- **Via UI HP:** buka **Backup & Pulihkan → Pilih File Backup**, pilih
  `app_backup.json` (mengganti semua) atau **Restore Aman** (hanya menambah).
- **Via API:** `POST /api/backup/import` dengan body isi `app_backup.json`.

Cara 2 memulihkan `products/transactions/settings/printer`. Data sinkronisasi
`s_*` **tidak** termasuk (HP akan mem-*push* ulang saat online dengan Kode Toko sama).

---

## Bagian C — Environment Variables (tanpa credential rahasia)

### `backend/.env` (buat dari `backend/.env.example`)
| Variable | Wajib? | Keterangan |
|---|---|---|
| `MONGO_URL` | ✅ | Koneksi MongoDB project baru. Di Emergent sudah tersedia otomatis. |
| `DB_NAME` | ✅ | Nama database (mis. `toko_bagus`). |
| `DB_ENGINE` | ⬜ | `mongo` (default) atau `postgres` (self-host, `pg_store.py`). |
| `LLM_PROVIDER` | ⬜ | `emergent` (default) atau `openai_compatible`. AI opsional. |
| `EMERGENT_LLM_KEY` | ⬜ | Hanya bila `LLM_PROVIDER=emergent`. Diisi di environment baru. |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | ⬜ | Bila pakai penyedia OpenAI-compatible sendiri. |

> Fitur kasir, scanner, cek harga, riwayat, edit transaksi, pembayaran, struk,
> WhatsApp, laporan, dsb. **berjalan penuh tanpa** variabel AI apa pun. AI hanya
> untuk chat asisten Miko (endpoint `/api/miko/chat`).

### `frontend/.env`
| Variable | Keterangan |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | Alamat backend project baru. Di Emergent otomatis terisi. Untuk self-host: domain/IP server Anda. |
| `EXPO_PACKAGER_PROXY_URL`, `EXPO_PACKAGER_HOSTNAME` | Diatur oleh Emergent — **jangan diubah**. |

**JANGAN** meng-commit `backend/.env` / `frontend/.env` (sudah di `.gitignore`).
Hanya `*.env.example` yang boleh ikut — dan itu **tanpa** password/API key.

---

## Bagian D — Menjalankan di project Emergent baru
1. Import source code (Bagian A).
2. Pastikan `backend/.env` berisi `MONGO_URL`/`DB_NAME` (Emergent menyediakannya),
   dan `frontend/.env` berisi `EXPO_PUBLIC_BACKEND_URL` (otomatis).
3. Import data (Bagian B, Cara 1 disarankan).
4. Restart layanan: `sudo supervisorctl restart backend` dan `sudo supervisorctl restart expo`.
5. Buka aplikasi → cek Produk, Transaksi/Riwayat, Cek Harga, Ringkasan.
6. **Publish** untuk membuat build APK/AAB/IPA baru (nilai `EXPO_PUBLIC_*`
   dibakar saat build — build ulang bila alamat backend berubah).

---

## Bagian E — Checklist "tidak ada yang tertinggal"
- [ ] Source `backend/` + `frontend/` + `assets/` + `app.json` ikut pindah.
- [ ] `migration/data/` berisi ekspor terbaru (cek `manifest.json`).
- [ ] Import sukses: jumlah `products`/`transactions` cocok dengan `manifest.json`.
- [ ] Index terbentuk (script otomatis; lihat `DATABASE_SCHEMA.md`).
- [ ] `backend/.env` & `frontend/.env` diisi ulang di environment baru (tanpa hardcode).
- [ ] Fitur teruji: transaksi, scanner, pencarian, pencarian suara, cek harga,
      stok/stok menipis, riwayat, edit transaksi (perbarui, bukan duplikat),
      pembayaran, cetak & bagikan struk, WhatsApp, laporan/ringkasan & terlaris.
- [ ] (Opsional) `s_*` ikut diimpor bila ingin melanjutkan sinkronisasi multi-HP.

Selesai — project berjalan penuh di akun Emergent baru, data & fitur utuh.
