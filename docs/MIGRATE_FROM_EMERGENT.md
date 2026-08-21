# Cara Memindahkan Toko Bagus Kasir dari Emergent ke Server Sendiri

Panduan langkah demi langkah agar aplikasi + datanya berjalan di VPS/server Anda,
tanpa bergantung pada Emergent.

> Ringkas: (1) jalankan backend + MongoDB Anda, (2) build ulang app Expo yang
> menunjuk ke server Anda, (3) pindahkan data lewat fitur Backup/Restore bawaan.

---

## 0. Prasyarat
- Sebuah VPS/server (Ubuntu/Debian disarankan) dengan **Docker** + **Docker Compose**.
- Domain (opsional, untuk HTTPS) — mis. `kasir.tokosaya.com`.
- Untuk build aplikasi: akun Expo (EAS) ATAU tetap pakai tombol Publish/Build di Emergent.

---

## 1. Ambil source code lengkap
Seluruh kode ada di repo ini:
- `backend/` — API FastAPI (Python)
- `frontend/` — aplikasi Expo/React Native
- `docker-compose.yml`, `backend/Dockerfile` — untuk self-host
- `backend/.env.example`, `frontend/.env.example` — template konfigurasi

Unduh/klon repo ke server Anda (via GitHub export dari Emergent, atau `git clone`).

---

## 2. Jalankan Backend + Database di server Anda

```bash
cd /path/ke/project

# Siapkan konfigurasi backend (opsional untuk AI Miko)
cp backend/.env.example backend/.env
# edit backend/.env bila mau mengaktifkan AI Miko (lihat komentar di dalamnya)

# Nyalakan MongoDB + Backend API
docker compose up -d --build

# Cek berjalan
curl http://localhost:8001/api/           # health/router
docker compose logs -f backend
```

Backend kini melayani di `http://SERVER_ANDA:8001` dengan prefix `/api`.
MongoDB berjalan di dalam Docker (volume `mongo_data`) — **data tersimpan di server Anda**.

### (Disarankan) HTTPS via reverse proxy
Pasang Nginx/Caddy di depan port 8001. Contoh Caddy (otomatis TLS):
```
kasir.tokosaya.com {
    reverse_proxy localhost:8001
}
```

---

## 3. Arahkan Aplikasi ke server Anda & build ulang

```bash
cd frontend
cp .env.example .env
```
Edit `frontend/.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://kasir.tokosaya.com   # atau http://IP_VPS:8001
```

Build aplikasi:
- **Termudah:** tetap gunakan tombol **Publish/Build** di Emergent (menghasilkan APK/AAB/IPA)
  — output build adalah milik Anda dan menunjuk ke `EXPO_PUBLIC_BACKEND_URL` di atas.
- **Mandiri (EAS):**
  ```bash
  npm i -g eas-cli
  eas login
  eas build -p android --profile production
  ```

> Catatan: nilai `EXPO_PUBLIC_*` "dibakar" saat build. Jika mengganti alamat server,
> build ulang aplikasi.

---

## 4. Pindahkan data dari perangkat lama (tanpa Emergent)
Data utama ada di **HP** (SQLite), jadi pemindahan cukup lewat fitur bawaan:

1. Di HP lama: buka **Pengaturan → Backup & Pulihkan → Buat File Backup**.
   Simpan file `.json` (mis. kirim ke WhatsApp/Drive diri sendiri).
2. Di HP baru (aplikasi versi server Anda): **Backup & Pulihkan → Pilih File Backup**
   (mengganti semua) atau **Restore Aman** (hanya menambah yang belum ada).
3. Selesai. Untuk multi-HP, aktifkan **Sinkronisasi** (menu Sync) dengan **Kode Toko**
   yang sama → semua HP tersinkron lewat backend Anda.

Backup ini **100% independen** dari Emergent.

---

## 5. (Opsional) Aktifkan AI "Miko" dengan penyedia sendiri
Fitur kasir & cek harga jalan tanpa ini. Bila ingin asisten percakapan Miko:

Edit `backend/.env`:
```
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://api.openai.com/v1     # atau Groq/OpenRouter/Ollama Anda
LLM_API_KEY=sk-....                        # key MILIK ANDA
LLM_MODEL=gpt-4o-mini
```
Lalu `docker compose up -d` ulang. Tidak perlu library Emergent sama sekali
(impornya sudah dibuat lazy). Untuk gratis & lokal, pakai **Ollama**:
```
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.1
```

---

## 6. Melepas ketergantungan Emergent sepenuhnya (opsional bersih-bersih)
Jika TIDAK memakai AI Emergent:
- Di `backend/.env`, set `LLM_PROVIDER=openai_compatible` (atau kosongkan semua LLM_*).
- Anda boleh menghapus baris `emergentintegrations==0.2.0` dari `backend/requirements.txt`
  (impornya lazy, jadi server tetap jalan). Jangan hapus jika masih memakai `LLM_PROVIDER=emergent`.

---

## 7. Backup rutin data server (MongoDB)
```bash
# Ekspor
docker compose exec -T mongo mongodump --db toko_bagus --archive > backup-$(date +%F).archive
# Pulihkan
docker compose exec -T mongo mongorestore --archive --drop < backup-YYYY-MM-DD.archive
```

---

## Checklist "sudah lepas dari Emergent?"
- [ ] `docker compose up -d` jalan di server Anda (backend + mongo).
- [ ] `frontend/.env` → `EXPO_PUBLIC_BACKEND_URL` menunjuk server Anda; app di-build ulang.
- [ ] Data dipindah via Backup/Restore; sync memakai backend Anda.
- [ ] `backend/.env` tidak lagi memakai `EMERGENT_LLM_KEY` (kecuali sengaja).
- [ ] Backup MongoDB terjadwal.

Jika semua tercentang, Emergent hanya menjadi tempat pengembangan.
