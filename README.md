# Toko Bagus Kasir (POS) — Local-First, Portable

Aplikasi kasir/POS untuk warung: transaksi, katalog produk (variasi/grosir/multi-barcode),
riwayat, dan **Cek Harga** mandiri. Dirancang **local-first**: kasir tetap jalan saat
internet mati; perubahan otomatis tersinkron saat online kembali.

> Portabilitas: aplikasi ini **tidak terkunci** ke Emergent. Lihat
> [`docs/PORTABILITY_AUDIT.md`](docs/PORTABILITY_AUDIT.md) dan
> [`docs/MIGRATE_FROM_EMERGENT.md`](docs/MIGRATE_FROM_EMERGENT.md).
>
> **Pindah ke akun/project Emergent baru (source + SEMUA data):** lihat
> [`migration/README_MIGRATION.md`](migration/README_MIGRATION.md).
> Skema DB lengkap: [`migration/DATABASE_SCHEMA.md`](migration/DATABASE_SCHEMA.md).
> Ekspor/impor data: `migration/scripts/export_data.py` & `import_data.py`
> (snapshot data terkini tersedia di `migration/data/`).

## Arsitektur singkat
- **Frontend** (`frontend/`): Expo / React Native. Database utama = **SQLite di HP**
  (`src/localdb.ts`). UI pakai file-based routing (`app/`).
- **Backend** (`backend/`): FastAPI + **MongoDB** (open-source). Perannya **opsional**:
  sinkronisasi multi-perangkat dan endpoint AI Miko. Bukan tempat data satu-satunya.
- **Data mengalir**: HP (SQLite) ⇄ (sync opsional) ⇄ Backend (MongoDB Anda).

## Struktur folder
```
/
├─ backend/
│  ├─ server.py            # FastAPI: /api/products, /api/transactions, /api/settings,
│  │                       #          /api/backup/*, /api/sync/{push,pull}, /api/miko/chat
│  ├─ requirements.txt     # dependency Python
│  ├─ Dockerfile           # image backend portable
│  ├─ .env.example         # template env (DB + AI opsional) — TANPA credential
│  └─ tests/               # test backend
├─ frontend/
│  ├─ app/                 # layar (expo-router): (tabs)/index=Transaksi, produk, cek-harga,
│  │                       #   riwayat; produk-form, checkout, backup, dll.
│  ├─ components/          # UI reusable (CalculatorModal, HardwareScanner, Miko, TierEditor…)
│  ├─ src/                 # inti logika:
│  │   ├─ localdb.ts       #   DB SQLite lokal (sumber kebenaran di HP)
│  │   ├─ sync.ts          #   sinkronisasi berbasis kursor (antrean offline → online)
│  │   ├─ api.ts           #   fasad data (memanggil localdb)
│  │   ├─ cart.tsx         #   state keranjang
│  │   ├─ useVoiceSearch.ts#   pencarian suara hybrid (online→offline)
│  │   └─ ...              #   toast, format, voice, mikoAI, dll.
│  ├─ assets/              # gambar, ikon, seed (assets/seed/*.json)
│  ├─ app.json             # konfigurasi Expo + izin (kamera/mikrofon)
│  └─ .env.example         # template env frontend (EXPO_PUBLIC_BACKEND_URL)
├─ docker-compose.yml      # self-host: MongoDB + Backend
└─ docs/                   # audit portabilitas + panduan migrasi
```

## Menjalankan secara lokal (development)

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set MONGO_URL, DB_NAME (AI opsional)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
Butuh MongoDB berjalan (mis. `docker run -d -p 27017:27017 mongo:7`).

### Frontend
```bash
cd frontend
yarn install
cp .env.example .env          # set EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
yarn expo start
```
Buka di Expo Go / emulator. Semua rute API berprefix `/api` (otomatis ditambah kode).

## Konfigurasi (environment variable)
Semua alamat/kunci lewat env — **tidak ada** yang di-hardcode:
- Backend: `MONGO_URL`, `DB_NAME`, dan (opsional AI) `LLM_PROVIDER`,
  `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, atau `EMERGENT_LLM_KEY`.
- Frontend: `EXPO_PUBLIC_BACKEND_URL` (alamat API Anda).

Lihat `backend/.env.example` dan `frontend/.env.example`.

## Deploy ke VPS/server sendiri
Ringkas (detail di `docs/MIGRATE_FROM_EMERGENT.md`):
```bash
cp backend/.env.example backend/.env      # sesuaikan
docker compose up -d --build              # MongoDB + Backend
# lalu set frontend/.env EXPO_PUBLIC_BACKEND_URL ke domain Anda, build ulang app
```

## Backup & Restore (tanpa Emergent)
- **Data HP**: menu **Backup & Pulihkan** di aplikasi → ekspor/impor file `.json`
  (juga ada **Restore Aman** = tambah data tanpa menimpa).
- **Data server (MongoDB)**: `mongodump`/`mongorestore` (contoh di panduan migrasi).

## Fitur AI "Miko" (opsional)
Endpoint `/api/miko/chat` bisa memakai penyedia OpenAI-compatible **milik Anda**
(OpenAI/Groq/OpenRouter/Ollama) via env — atau dimatikan tanpa memengaruhi kasir.

## Catatan native
Scanner HID Bluetooth, TTS, dan pengenalan suara hanya berfungsi penuh pada
**build native (APK/AAB/IPA)**, bukan pratinjau web.
