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

### v44 — Cek Harga jadi KIOS layar penuh + Scan KAMERA depan + Miko ekspresif
- `(tabs)/cek-harga.tsx`: dirombak jadi kios self-service. Tab bar bawah disembunyikan saat fokus (navigation.setOptions tabBarStyle display none, dipulihkan saat blur). Panah kembali kecil kiri-atas (kamera terbuka → tutup kamera; selain itu → keluar ke Transaksi `router.replace("/")`). Tombol besar "SCAN BARCODE" di tengah, bawah kosong. Tombol "Cari Produk Manual" & tombol "Scan Barang Lain" dihilangkan (kios terkunci). Input scanner Bluetooth tetap aktif (tersembunyi, tanpa keyboard). Hasil harga auto-reset 15 dtk.
- Scan KAMERA: `expo-camera` CameraView `facing="front"` (default), buka saat tombol ditekan; auto-tutup 15 dtk bila tak ada barcode; barcode terbaca → tutup + tampil harga/suara (cooldown 2.5s anti-dobel). Ada tombol balik kamera (depan↔belakang) & bingkai hijau. Izin kamera diminta kontekstual; ditolak → dialog Buka Pengaturan. (Plugin expo-camera + NSCameraUsageDescription + android CAMERA sudah ada.)
- `components/Miko.tsx`: aktifkan SEMUA 28 pose (tambah bag/bye/dance/deepsleep/hug/phone/pout/snack). Di kios: ganti pose lucu tiap ~3.5 dtk + animasi jenaka (lompat/geleng/joget/jalan-jalan via Animated), dan menyapa PELANGGAN acak dari ~90 kalimat (KIOSK_SAY) tiap ~10 dtk. Sapaan idle layar lain tak berubah.
- CATATAN: kamera & suara hanya jalan di HP (Expo Go/APK), bukan preview web. Verified layout kios via screenshot (tab bar hilang, tombol center, Miko menyapa & berpose).

### v43 — AUTO BACKUP (offline, harian, simpan 5 terakhir, selalu nyala)
- Baru `src/autobackup.ts`: simpan cadangan `.json` ke `documentDirectory/auto-backups/` SEKALI SEHARI (dipicu saat app dibuka, senyap). Rotasi simpan 5 terbaru (hapus sisanya). `runAutoBackup()`, `listAutoBackups()`, `getLastAutoBackup()`, `maybeDailyAutoBackup()`. Native-only (expo-file-system/legacy + AsyncStorage utk timestamp). Web = no-op.
- `app/_layout.tsx`: panggil `maybeDailyAutoBackup()` 2.5s setelah ready.
- `app/backup.tsx`: bagian "BACKUP OTOMATIS [AKTIF]" — tampil waktu cadangan terakhir, tombol "Cadangkan Sekarang" (`backup-now`), daftar 5 cadangan dgn Bagikan (`auto-share-*`) & Pulihkan (`auto-restore-*`, pakai dialog konfirmasi restoreWithConfirm). Import file & pulihkan auto-backup memakai helper konfirmasi yang sama.
- UI diverifikasi via screenshot (web). CATATAN: pembuatan/rotasi file backup hanya berjalan di HP/BUILD APK (di web file I/O native tidak tersedia — wajar).

### v42 — Backup/Restore diperkuat (anti hilang & anti-ganda) + konfirmasi
- `src/localdb.ts` `importBackup`: RESTORE = ganti TOTAL (bukan tambah) → tak mungkin menggandakan. Dedupe by id (Map, id kembar ditimpa). Normalisasi field (tiers/variations array, angka) agar tak crash. ATOMIK: tulis ke DB dulu; bila gagal → kembalikan data lama sepenuhnya (tidak hilang sebagian). Validasi ketat (produk kosong/rusak → batal, data lama aman).
- `app/backup.tsx` `importBackup`: tambah dialog KONFIRMASI (`Alert`) "Pulihkan Data? … akan DIGANTI" sebelum menimpa. Export tetap: exportBackup → tulis file → Sharing (simpan ke Drive/WA).
- Uji algoritma pada seed 2261 produk: 2261→2261 (tanpa loss), sengaja gandakan 5 id → tetap 2261 (anti-ganda), round-trip export→import utuh. CATATAN: tulis/baca FILE (expo-file-system/DocumentPicker) hanya jalan di HP/BUILD APK, bukan web preview (di web muncul "not available on web" — wajar).

### v41 — APLIKASI OFFLINE PENUH (data di HP, tanpa server/internet)
- Data terbaru diekspor dari backend → dibundel: `assets/seed/toko_bagus_backup.json` (2261 produk, 123 transaksi, settings, printer) sebagai BEKAL awal offline.
- Baru: `src/localdb.ts` — mesin data lokal. Native (Android/iOS) pakai **expo-sqlite** (tabel products/transactions/kv, seed sekali di awal, write-through per mutasi) + salinan memori utk scan cepat. Web preview pakai memori (seed dari JSON, non-persisten — hanya utk uji tampilan). Meniru persis logika backend: resolusi induk utama (`resolveRootParent`), warisan tier variasi (`withResolvedTiers`), pengurangan/rekonsiliasi stok saat create/update transaksi, omzet, export/import backup (validasi + anti-produk-kosong).
- `src/api.ts` DITULIS ULANG: tetap nama/bentuk sama, tapi delegasi ke `local.*` (bukan fetch). TIDAK ada layar yang diubah. Printer & scanner Bluetooth tetap offline seperti biasa.
- expo-sqlite@16 dipasang (config plugin otomatis — efektif setelah BUILD APK/native, bukan Expo Go web).
- Verified: testing_agent iteration_11 — 8/8 alur PASS, **0 panggilan /api/** (benar-benar offline): Produk (2261) + search, scan tambah/tak-dikenal, qty desimal 1.5, Bayar→struk (transaksi dibuat lokal + stok turun), Cek Harga ecer+grosir, Riwayat + filter tanggal + omzet, CRUD produk, backup export/import. Tanpa crash/network error.
- CATATAN: persistensi permanen (SQLite) hanya di HP/BUILD APK. Data hanya di perangkat → andalkan fitur Backup ke file.

### v40 — Suara + balon "barang tidak ditemukan" di Cek Harga (arahkan ke kasir Vita/Sasa)
- `(tabs)/cek-harga.tsx`: pada catch not-found, pilih 1 dari 20 kalimat `NOT_FOUND` (bergantian, anti-ulang) → emit `mikoBus.say` (balon Miko tampil PERSIS kalimat itu) + `speak()` (TTS, emoji dibuang). Toast tetap.
- `src/mikoBus.ts`: event generik baru `{ type: "say"; text; pose? }`. `components/Miko.tsx`: handler `say` menampilkan teks apa adanya (pose default surprised, hold 3.4s) → balon = suara (sinkron). Selalu aktif (kios). CATATAN: TTS hanya bunyi di HP/BUILD APK. Verified via screenshot.

### v39 — Suara Cek Harga (TTS) — bacakan nama + harga ecer + grosir + penutup
- `(tabs)/cek-harga.tsx`: saat hasil tampil (scan Bluetooth / pilih manual), otomatis dibacakan via TTS (`speak()` di `src/voice.ts`, suara feminin id-ID). Format: "[Nama]. Harga ecer [terbilang] rupiah. Beli {min_qty} harganya [terbilang] rupiah." per tingkat grosir + 1 kalimat PENUTUP dari 50 kalimat (bergantian, anti-ulang, emoji dibuang). Tanpa grosir → nama + ecer + penutup saja. SELALU aktif (permintaan user, kios). Angka dibacakan via `terbilang()`. CATATAN: TTS hanya bunyi di HP/BUILD APK, bukan preview web. Verified via screenshot: hasil tampil tanpa error/regresi.

## Implemented (2026-08-12)
### v38 — Jumlah desimal di keranjang (barang timbangan spt beras: 0.5 / 0.75 / 1.5)
- `(tabs)/index.tsx` `QtyInput`: dulu paksa bilangan bulat (floor, min 1). Kini menerima DESIMAL — sanitasi hanya angka + 1 pemisah desimal (koma dinormalkan ke titik), `keyboardType="decimal-pad"`, commit parse float (maks 3 desimal), jumlah harus > 0 (kosong/0 → kembalikan nilai lama). Lebar kolom qty dilebarkan (28→44) agar muat "1.75". Subtotal & total otomatis = harga × jumlah (logika cart sudah float, tak diubah). Stok backend juga sudah float. Verified via screenshot: beras 1.5 → Rp 4.000 x1.5 = Rp 6.000, total Rp 6.000.

## Implemented (2026-08-12)
### v37 — FIX: keyboard menutupi kolom Edit Harga di Transaksi
- `(tabs)/index.tsx`: kolom Edit Harga (bottom sheet) diganti dari `TextInput` biasa → `BottomSheetTextInput` (@gorhom/bottom-sheet) agar gorhom mendeteksi fokus input & mengangkat sheet ke atas keyboard. Ditambah `keyboardBlurBehavior="restore"` + `autoFocus`. `keyboardBehavior="interactive"` & `android_keyboardInputMode="adjustResize"` tetap. Verified via screenshot: sheet Edit Harga terbuka, input fokus. CATATAN: lift di atas keyboard bersifat native → uji final di HP/BUILD APK.

## Implemented (2026-08-12)
### v36 — Balon Miko saat Cek Harga berhasil (20 variasi, bergantian)
- `src/mikoBus.ts`: event baru `price_found`. `(tabs)/cek-harga.tsx` emit di `showResult()` (berlaku untuk scan Bluetooth & pilih manual). `components/Miko.tsx`: array `PRICE_FOUND` (20 kalimat) dipilih anti-ulang (pickRot), hold 3 dtk (rentang 2–4 dtk). Balon di sudut kanan-bawah → tidak menutupi nama/harga, tidak mengganggu reset 15 dtk maupun scan berikutnya. Verified via screenshot ("Ini dia barang yang dicari." + kartu harga tetap utuh).

## Implemented (2026-08-12)
### v35 — Keyboard Mode Scan dipisah tegas dari Mode Manual (scanner-only = keyboard OFF)
- Kolom scanner MURNI (Transaksi `index.tsx`, Cek Harga `cek-harga.tsx`) kini `showSoftInputOnFocus={false}` + `caretHidden` PERMANEN, dan tap/onPressIn tidak lagi membuka keyboard (openKeyboard/kbd state dihapus). Scanner tetap fokus & menerima barcode (isScanMode selalu true). Input manual lewat tombol "Item Manual"/"Cari Barang" (Transaksi) & "Cari Produk Manual" (Cek Harga).
- Produk `produk.tsx`: field pencarian tetap dwi-mode TAPI tap kolom tidak lagi buka keyboard; keyboard hanya via tombol toggle keypad eksplisit (manualMode). Scan mode = keyboard OFF, Manual mode = keyboard ON.
- Cari `cari.tsx`: dibiarkan (dwi-mode: default scan keyboard OFF, tap untuk ketik manual → keyboard ON) sesuai aturan.
- `useHideScanKeyboard` (defensif) tetap: bila keyboard sempat muncul dari sistem/koneksi BT saat input scan fokus → langsung Keyboard.dismiss() lalu refokus senyap (tanpa loop, tanpa memotong input scanner). Di-gating `useIsFocused` agar tidak ganggu layar lain.
- Verified: testing_agent iteration_10 — 5/5 flow PASS (scan Transaksi tambah/belum-terdaftar, Cek Harga hasil+manual, Produk toggle scan↔manual filter, Cari filter, navigasi tab & checkout tanpa regresi). CATATAN: penindasan keyboard native hanya bisa dipastikan di HP/BUILD APK, bukan preview web.

### v34 — Balon teks Miko diperkaya (kontekstual, banyak variasi) + Cek Harga dirapikan (kios)
- `components/Miko.tsx`: seluruh koleksi balon teks diperbanyak sesuai spek user (teks SAJA, bukan suara). Dipilih per-kondisi (tidak semua sekaligus):
  - ITEM(8), BIG(5), EMPTY(5), NF(6), PAY(6), POK(3), PF(4), PRICE(5), BACKUP(4), RESTORE(3), LOW(5), ERR(3), SAVED(4), DELETED(2), CHEER(8) + CHEER_MULTI(4, saat di-tap ≥3x dalam 3 dtk), OPEN(8), WARM(30), SEPI(10), HUMOR(15 baru & lebih lucu).
  - Idle: layar kerja → jeda panjang & acak 60–105 dtk, humor ~18%, TIDAK muncul saat checkout/cari/produk-form/variasi/edit-transaksi (prioritas kerja kasir). Kios Cek Harga → CEK_HARGA_IDLE tiap ±22 dtk (mengajak pelanggan). Humor tidak dipakai pada handler error serius.
- Event bus (`src/mikoBus.ts`): tambah `product_saved` & `product_deleted`. Di-emit di `produk-form.tsx` (simpan/hapus) & `(tabs)/produk.tsx` (hapus dari menu). Handler `price_changed/backup_ok/restore_ok/low_stock` kini pakai array (pickRot), bukan string tunggal.
- `(tabs)/cek-harga.tsx`: font kartu hasil dikecilkan agar tidak berantakan/kepotong (nama toko 38→24, nama produk 44→26, harga ecer 66→52, grosir 32→26), padding kartu dilonggarkan. Miko tetap mungil di sudut & menyapa pelanggan (kios dinding self-service).
- CATATAN: suara/TTS Miko hanya bunyi di HP (APK build), bukan preview web.

### v33 — Transaksi dikecilkan & dirapikan (lebih lega)
- `app/(tabs)/index.tsx`: judul "Transaksi" (30→xl), sapaan (xs), scan box (56→44, ikon 34, border 1.5), tombol Tambah Item & Cari Barang (52→40, teks base, ikon 18), listHead (xs), pay bar dikecilkan (paddingHorizontal lg, radius 20, Rp total→xl, tombol Bayar 58→46 paddingH 26, ikon 18), kartu barang lebih ramping (marginTop 6, paddingV 6, nama & subtotal base, qtyBtn 30). Fungsi tidak berubah. Verified via screenshot: 4 barang tampil lega, elemen atas & bar bawah mungil.


- `app/(tabs)/index.tsx`: kartu tiap barang dibuat pendek & padat. Baris 1 = Nama (tebal) + ikon variasi + hapus (mini). Baris 2 = "Rp harga x qty" (kiri, kecil) · stepper − [qty] + (tengah) · subtotal (kanan, tebal). Thumbnail & shadow besar dihapus, padding dikurangi, border tipis. Stepper tetap 32px (mudah disentuh). Tidak ada perubahan fungsi/logika. Verified via screenshot: 3 barang muat lega dalam 1 layar.


- `components/Miko.tsx`: `timeGreet()` → "Selamat pagi/siang/sore/malam, Kak!" berdasar jam; dipakai di sapaan layar utama (±70%, sisanya sapaan OPEN lain). Pose wave.


- `cek-harga.tsx`: header tanpa garis, scan input jadi pill + ikon bulat, tombol "Cari Produk Manual" pill, kartu hasil putih bershadow lembut, nama toko warna brand (bukan hijau). Fungsi scan/cari/countdown tetap.
- `riwayat.tsx`: kartu omzet HERO (background brand, teks putih), chip filter jadi pill, ikon aksi header jadi bulat tinted, baris transaksi jadi kartu mengambang + ikon struk bulat. Filter tanggal & lunasi tetap.
- Pengaturan: `pengaturan-struk.tsx` (input radius lg, tombol simpan bershadow, tombol close bulat, header tanpa garis), `backup.tsx` & `pengaturan-printer.tsx` (tombol utama radius lg + shadow, close bulat, header lembut, alamat BT tampil di bawah nama perangkat).
- Verified via screenshot: Cek Harga, Riwayat, Pengaturan Struk — semua senada Soft Rose.
- SELESAI: seluruh layar utama (Transaksi, Produk, Cek Harga, Riwayat) + layar pengaturan sudah bergaya Soft Rose feminin. Maskot Miko tunggal global aktif.


- Atas permintaan user (Momo mengganggu): `components/Miko.tsx` dikembalikan ke SATU maskot (Miko), SIZE 74→60, tetap bisa diseret (POS_KEY v2, AsyncStorage) & posisi diingat, di sudut kanan bawah (bottom insets+138) di ATAS pay bar. Momo tidak lagi di-require (aset momo_* tidak ikut bundle). Semua konteks tetap: greet per-layar, item/big/empty, not_found, pay, change (nominal), print ok/fail, price_changed, backup/restore, low_stock, sepi (idle>45s), tap cheer. Suara feminin pelan tetap.
- Verified via screenshot: hanya 1 gambar (miko), mungil di sudut, tidak menutupi tombol Bayar.


- `app/(tabs)/produk.tsx`: kartu mengambang (radius 20, shadow) + thumbnail bulat, nama tebal, meta, HARGA sebagai pil pink, menu 3-titik; search jadi pill (tombol keypad bulat); tombol "Tambah" pill bershadow. Badge "Stok N" merah muncul bila stok ≤ 5 (stok menipis). PRODUK_ROW_H 76→96 (getItemLayout tetap cepat). Fungsi scan/cari/menu/CRUD tidak diubah.
- Reaksi Miko-Momo diperluas (mikoBus + handler): price_changed (index applyPermanent), backup_ok & restore_ok (backup.tsx), low_stock (handler siap). Semua tampil sebagai dialog berdua.
- Verified via screenshot: Produk baru rapi + duo maskot tampil.
- SISA: Cek Harga, Riwayat, Pengaturan masih layout lama (sudah warna baru) — menunggu giliran.


- Pose ditambah via Nano Banana (green-key + downscale 220px + optimize): Miko total 28 pose, Momo 8 pose (scripts/gen_more.py). Ukuran tiap file ~55-65KB.
- `components/Miko.tsx` (export default Mascots): dua karakter berdampingan di dock kanan bawah. BISA DISERET (PanResponder) & posisi diingat (AsyncStorage POS_KEY). Mesin dialog `run(turns[])` menampilkan balon bergiliran (Miko↔Momo), termasuk sapaan, debat lucu, curhat, penyemangat, + komentar berdua saat aksi (barang masuk/big/empty/not_found/pay/print/change/error). KALEM: obrolan santai hanya bila idle >40s (cek tiap 20s). Tap karakter → cheer.
- Suara `src/voice.ts` dibuat lebih pelan & lembut (rate 0.85, pitch 1.18).
- Verified via screenshot: Miko+Momo tampil, dialog sapaan bergiliran jalan; not_found sebelumnya OK. (Suara & seret paling mantap di APK build.)


- `src/mikoBus.ts`: event-bus global (not_found, pay_ok, change, print_ok, print_fail, error, scan_ready) agar layar mana pun memicu respons Miko.
- `components/Miko.tsx`: kumpulan kalimat lengkap sesuai permintaan user (OPEN/sapaan, ITEM_MASUK gabungan scan+found+keranjang, BIG, EMPTY, NOT_FOUND, PAY, PRINT_OK/FAIL, ERROR, CHEERS, SEPI 23 kalimat). Dipilih bergantian (pickRot anti-ulang). Sapaan per-layar (usePathname). Reaksi keranjang (masuk/total besar/kosong). Kejadian via bus (kembalian sebut nominal ASLI via terbilang). Pesan "toko sepi" hanya bila idle >45s (jeda panjang, tidak saat aktif). Pose mengikuti kondisi.
- `src/voice.ts`: suara feminin (auto-pilih voice id-ID perempuan bila ada, pitch 1.25, rate ~0.9) + `speak()` umum + `speakPaymentDone(change)` (bacakan hasil + kembalian dalam kata, persona "Kak"). `speakChange` diperbarui.
- Wiring: checkout (pay_ok+change+printer emit, suara via speakPaymentDone gated voiceChange), index (not_found), riwayat (printer ok/fail). Suara hanya di HP/APK build.
- Verified via screenshot: scan barcode tak dikenal → Miko pose kaget + "Hmm, barangnya belum ditemukan." Sapaan per-layar & sudut kanan bawah OK.


- 4 pose baru di-generate (wink, money, sleepy, thumbsup) via Nano Banana + green-screen chroma key → transparan (scripts/gen_mascot2.py). Total 8 pose.
- `components/Miko.tsx` ditulis ulang: DIAM di sudut kanan bawah (tidak wandering, tidak menutupi tombol), animasi napas+goyang di tempat, entrance pop. Kumpulan kata banyak: IDLE_TIPS(15), ON_ADD, ON_BIG, ON_EMPTY, CHEERS(8) + sapaan per-layar via usePathname (Transaksi/Produk/Cek Harga/Riwayat/Checkout/Cari/Variasi). Bereaksi ke keranjang (barang masuk/total besar/kosong). Tap = cheer acak.
- Di-mount GLOBAL di `app/_layout.tsx` (sibling <Stack>) → tampil di SEMUA layar termasuk checkout. Dihapus dari index.tsx.
- Verified via screenshot: Transaksi (sapaan+wave) & Riwayat (sapaan cuan+money) — Miko di sudut, tidak menutupi tombol.


- Tema global diganti ke "Soft Rose & Lilac" (`src/theme.ts`): surface #FFF5F7, brand pink #FF758F, lilac #CDB4DB, tint #FFD6DF, dst. LIGHT ONLY.
- Font baru dimuat via expo-font (`_layout.tsx`, unduh TTF dari jsdelivr ke assets/fonts): Nunito (400/700/800) untuk display/heading/total, Plus Jakarta Sans (400/500/700) untuk teks. Token `font` diarahkan ke font baru. DMSans & BarlowCondensed tetap dimuat (dipakai komponen lain).
- Layar Transaksi (`app/(tabs)/index.tsx`) DIROMBAK total: header sapaan "Halo, Kasir 👋", scan input pill dgn ikon bulat, dua tombol aksi (Tambah Item lilac + Cari Barang outline), kartu belanja MENGAMBANG (radius 20, shadow) dgn thumbnail, stepper qty besar bulat, pay bar melengkung di bawah. Semua fungsi (scan buffer, edit harga, hapus, qty, variasi, cari, item manual, bayar) TIDAK diubah.
- Maskot **Miko** 🐱 (`components/Miko.tsx`): kucing chibi (4 pose: happy/wave/surprised/love) di-generate via Gemini Nano Banana (EMERGENT_LLM_KEY), background dijadikan transparan + crop (scripts/transparent_mascot.py), disimpan di assets/mascot. Melayang bebas (onLayout container → posisi akurat semua layar), mengambang + goyang, ganti pose & balon kata sesuai aksi (sapaan, barang masuk, total besar, keranjang kosong, tips acak, tap = cheer). Pakai Animated API bawaan RN.
- Pratinjau 3 palet dibuat di `app/design-preview.tsx` (?v=1|2|3) — user memilih Versi 1 (Soft Rose).
- Verified via screenshot: Transaksi baru + Miko tampil & ngobrol; Produk/menu lain tetap jalan dgn warna baru (layout lama, belum dirombak).
- CATATAN: menu lain (Produk, Cek Harga, Riwayat, Pengaturan) baru berganti WARNA; tata letaknya belum dirombak — menunggu konfirmasi user.


### v23 — Riwayat filter tanggal + struk: nama toko besar/tebal + alamat rapi
- `riwayat.tsx`: chip filter periode (Hari Ini [default] / Kemarin / Bulan Ini / Pilih Tanggal / Semua). "Pilih Tanggal" menampilkan stepper ◀ tanggal ▶ (per hari). Omzet & jumlah transaksi IKUT periode terpilih. Data lama TIDAK dihapus (hanya disaring tampilan). Limit fetch dinaikkan 200→5000 agar data lama bisa dibuka. Verified via screenshot: Hari Ini 23 tx Rp 243.100; step ke Sel 11 Agu → 33 tx Rp 1.484.755.
- `receipt.ts` (printer thermal): NAMA TOKO kini ESC/POS dobel-tinggi + tebal (ESC ! 0x18), rata tengah oleh printer (ESC a). Reset ukuran/rata (ESC ! 0x00 + ESC a 0) diselipkan sebelum baris berikutnya agar nama tercetak besar. ALAMAT dibungkus PER KATA (wrapWords) → tidak terpotong di tengah kata, tetap rata tengah. CATATAN: hasil cetak fisik hanya bisa diuji di BUILD APK (bukan Expo Go/preview).
- `ReceiptPreview.tsx`: nama toko diperbesar (fontSize 26, bold 800) agar preview cocok dengan hasil cetak. Verified via screenshot: "TOKO BAGUS" besar, alamat "jln mangir rt 4 rw 1 sumber bahagia" tampil utuh.


### v22 — Tambah Variasi (dari Transaksi): auto-nama induk + toggle grosir ikut induk + cegah duplikat
- `variasi-cepat.tsx` (rombak, tanpa ubah transaksi/fitur lain):
  1. Auto-nama: input hanya isi NAMA VARIAN (suffix). Nama produk tersimpan = "[Nama Induk] [Varian]" (mis. "Mie Sedaap" + "Goreng" = "Mie Sedaap Goreng"), dgn preview live. Prefix selalu memakai nama INDUK UTAMA (root), bukan nama variasi sumber.
  2. Barcode: opsional, boleh beda dari induk.
  3. Toggle "Harga Bertingkat Ikut Induk" ON/OFF. ON → inherit_tiers=true, tiers=[] (grosir ikut induk, DINAMIS). OFF → editor grosir sendiri (TierEditor) → inherit_tiers=false, tiers milik variasi. Tidak mengubah harga/grosir induk.
  4. Harga jual/beli prefill dari induk (via useEffect saat root tersedia), tetap bisa diedit.
  5. Cegah duplikat sebelum simpan: nama produk akhir sudah dipakai → toast merah "✕ Nama produk sudah digunakan"; barcode sudah dipakai (produk/variasi lain) → "✕ Barcode sudah digunakan".
  6. Root parent konsisten: variasi dari variasi tetap tertaut ke induk utama (A→B, A→C; tanpa A→B→C).
- Backend `server.py`: `ProductIn.inherit_tiers` ditambah. `/products/pos` & `/products/barcode` resolve tiers DINAMIS dari induk untuk anak dgn inherit_tiers=true (ikut perubahan grosir induk). Root-parent safeguard (create) tetap.
- Shared `components/TierEditor.tsx` (mandiri) untuk editor grosir variasi.
- Verified: backend (Goreng inherit→ikut tiers induk 6/12; Soto dari Goreng→root Mie Sedaap, tiers sendiri) + UI (preview auto-nama, toggle→editor grosir, tolak duplikat nama & barcode dgn ✕ merah, simpan valid sukses). Data uji dibersihkan.

### v21 — Cek Harga tampilan 3D (harga besar & jelas) + notifikasi barcode tidak ditemukan
- `cek-harga.tsx` (UI): kartu hasil dibuat gaya 3D sesuai mockup. TOKO BAGUS hijau (font display, text-shadow), "CEK HARGA" merah dgn garis dash kiri-kanan, nama produk besar. HARGA ECER = pil 3D merah (borderBottom tebal + shadow/elevation) berisi chip putih "HARGA ECER" + harga putih raksasa (font display 66). HARGA GROSIR = header hijau + tiap tier pil 3D hijau dua-nada: kiri hijau "Mulai N unit", kanan putih harga hijau (font display). Tombol "Scan Barang Lain" jadi tombol 3D merah. Konten dibungkus ScrollView agar tidak terpotong di layar kecil.
- Notifikasi: bila barcode tidak ditemukan → toast error "Barcode {kode} tidak ditemukan" (sebelumnya diam saja).
- Harga grosir tetap diambil langsung dari data (tidak dihitung); tanpa tier → bagian grosir tidak muncul. Reset 15s, Scan Barang Lain, scanner, pencarian — tidak berubah.
- Verified: dove → Rp 1.000 + grosir 6→916 & 12→833 tampil 3D; barcode 0000000000000 → toast "tidak ditemukan".

### v20 — Cari (pilih, bukan scan): tampilkan semua variasi dulu sebelum dipilih
- `cari.tsx`: daftar hasil cari kini HANYA menampilkan induk (produk tanpa parent_id) — produk anak (variasi datar) disembunyikan; pencarian tetap menemukan induk lewat nama/barcode anak. Baris induk ditandai "Bervariasi".
- Ketuk produk ber-variasi → tampil panel "Pilih variasi" berisi SEMUA variasi (nested lama + produk anak baru) lengkap harga; ketuk salah satu → otomatis masuk daftar belanja & kembali ke Transaksi. Untuk mode harga (Cek Harga) → memilih variasi menampilkan harganya.
- Panel punya tombol tutup (X). Scan barcode TETAP langsung (tidak lewat panel) sesuai permintaan ("saat dipilih, bukan discan").
- Tidak mengubah logika harga/stok/transaksi/scanner. Verified: cari "ZBERAS" → hanya induk tampil → ketuk → 2 variasi anak → pilih → masuk keranjang; cari "Mie Instan" (nested lama) → ketuk → Ayam Bawang & Soto → pilih Soto → "Mie Instan — Soto" masuk keranjang. Data uji dibersihkan.

### v19 — Cek Harga: identitas toko + harga ecer & grosir
- `cek-harga.tsx` (UI only, tanpa ubah scanner/pencarian/harga/stok/transaksi/variasi/reset): kartu hasil kini urut: NAMA TOKO (hijau, tebal, sedang; dari settings.shopName, fallback "TOKO BAGUS") → "CEK HARGA" → nama produk → "HARGA ECER" + harga (merah) → "HARGA GROSIR" + semua tingkat grosir (hijau).
- Harga grosir diambil LANGSUNG dari data (`variation.inherit_tiers ? product.tiers : variation.tiers`, atau `product.tiers`), difilter price>0, diurutkan min_qty. Tiap baris: "Mulai {min_qty} {unit}" ↔ "Rp harga". Jika tidak ada tier → bagian grosir tidak ditampilkan (tidak ada Rp 0 kosong). Tidak menghitung grosir sendiri.
- shopName di-fetch via `api.getSettings()` (seperti checkout). Reset otomatis 15s & tombol Scan Barang Lain tetap. Konsisten untuk scan Bluetooth & pencarian manual (keduanya lewat showResult).
- Verified: dove → ecer Rp 1.000 + grosir 5→900 & 10→833 (dua tier tampil); mitubaby (tanpa tier) → hanya HARGA ECER; TOKO BAGUS/CEK HARGA/label tampil; reset & Scan Barang Lain jalan.

### v18 — FIX KRITIS: input scanner barcode Bluetooth (terpotong/hilang/tidak ditemukan)
- Akar masalah: TextInput terkontrol (`value` + `onChangeText`) — scanner HID mengetik sangat cepat; tiap karakter memicu setState+re-render yang mereset teks native ke nilai lama di tengah pengiriman → barcode terpotong/karakter hilang → dianggap tidak ditemukan / diproses sebelum lengkap.
- Solusi: hook baru `src/useBarcodeScan.ts`. Karakter ditampung di REF (bukan state) → tak ada re-render yang memotong. Input jadi UNCONTROLLED (`defaultValue=""`, tanpa `value`) → teks native tak pernah di-reset saat scan berlangsung. Diproses HANYA saat scan selesai: ENTER (onSubmitEditing) ATAU jeda 140ms (fallback scanner tanpa Enter). Jeda hanya aktif di mode scan (isScanMode=!kbd) sehingga ketik manual tidak pernah diproses otomatis (fitur pencarian manual tetap jalan via onChar). Setelah proses → buffer & native input dikosongkan (inputRef.clear()) → siap scan berikutnya.
- Diterapkan di: Transaksi (`index.tsx`), Produk (`produk.tsx`), Cek Harga (`cek-harga.tsx`), Pencarian (`cari.tsx`). Di Cari ditambah resolusi barcode-persis → auto-pilih/masuk keranjang; jika tidak persis → jadi filter pencarian (barcode tidak dipotong).
- Tidak mengubah logika harga/stok/transaksi/variasi. Penindasan keyboard scanner (useHideScanKeyboard) tetap.
- Verified (web, simulasi HID ketik cepat): Transaksi 3 scan beruntun barcode 13 digit (2 via Enter, 1 via jeda) → semua utuh, 3 item; Produk → kartu hasil scan benar; Cek Harga (tanpa Enter) → harga tampil; Cari (barcode persis) → auto masuk keranjang & kembali ke Transaksi. Tidak ada karakter hilang/terpotong.
- CATATAN: perilaku final di perangkat harus diuji via BUILD APK BARU (scanner fisik).

### v17 — Variasi: satukan variasi lama (nested) + baru (produk anak) dalam satu bagian
- Konteks: user uji di APK lama; kode terbaru sudah benar (diverifikasi ulang end-to-end: A→B lalu C dari B → C tetih induk A; berlaku juga saat B adalah variasi NESTED lama, mis. Mie Instan/Ayam Bawang → variasi baru tetap tertaut ke Mie Instan; data nested lama utuh).
- Masalah nyata yang ditemukan di build terbaru: saat induk dibuka, variasi BARU (produk anak/datar) tampil di bagian "Variasi (N)" ATAS, tapi variasi LAMA (nested di `variations[]`) tampil di bagian editor terpisah JAUH di bawah → hitungan "(N)" hanya menghitung yang datar, terasa seperti variasi tidak tergrup.
- Fix `produk-form.tsx` (UI only, tanpa ubah/rusak data): satu bagian "Variasi (N)" dengan N = jumlah anak datar + nested. Isi: kartu variasi baru (produk anak, ketuk → form anak) lalu editor variasi lama (nested, tetap bisa diedit inline). Tombol "Tambah Variasi" di form induk kini membuat PRODUK ANAK datar (router → variasi-cepat dgn id induk) agar konsisten dgn alur Transaksi; untuk produk BARU (belum ada id) tombol tetap menambah nested seperti semula.
- Verified: buka Mie Instan → "Variasi (3)" = Ayam Bawang + Soto (nested lama, tier/stok/barcode utuh) + MIETEST C (anak baru). Data uji dibersihkan; nested lama tetap utuh.
- CATATAN: perbaikan v14–v17 hanya aktif setelah user membuat BUILD APK BARU (Publish). Build lama tidak memuat perbaikan ini.

### v16 — Gaya kartu konsisten untuk semua daftar barang (referensi: kartu Riwayat)
- UI-only, tanpa ubah fungsi/logika/data/alur. Kartu seragam: bg surfaceSecondary, border 1px colors.border, radius.md, jarak antar kartu spacing.md, padding cukup, nama tebal, harga posisi konsisten.
- `produk.tsx`: baris produk → kartu terpisah (height 64, border, radius); pemisah jadi jarak spacing.md; list diberi paddingHorizontal spacing.lg. PRODUK_ROW_H 63→76 (kartu 64 + gap 12) agar getItemLayout scroll tetap cepat. Induk tetap kartu utama; variasi tetap disembunyikan & muncul saat induk dibuka.
- `cari.tsx` (hasil pencarian / pilih produk untuk Transaksi & Cek Harga): tiap hasil → kartu (border, radius, bg surfaceSecondary) + tombol tambah/hapus; pemisah jadi jarak; baris variasi di panel detail → kartu kecil (bg surface + border). Fungsi pilih (masuk keranjang / pilih harga / kelola) tetap.
- `index.tsx` Daftar Belanja: kartu belanja bg surfaceSecondary + border tipis + jarak spacing.md (hapus shadow berat). Layout: nama kiri/atas (hijau bila grosir), harga satuan + edit di bawah, Tambah Variasi, kontrol − qty +, total kanan, hapus. Semua fungsi (edit harga, qty, hapus, variasi) tetap.
- `produk-form.tsx`: kartu variasi anak diselaraskan ke gaya seragam (surfaceSecondary + border).
- `edit-transaksi.tsx` & editor variasi di produk-form sudah kartu → dibiarkan.
- Verified via screenshot: Produk (kartu), Cari (kartu), Cart (kartu) + uji interaksi qty +/− (qty 3, harga grosir hijau Rp 5.750, total Rp 17.250) & tombol hapus berfungsi. Lint clean.

### v15 — Tata letak struk mengikuti referensi thermal
- `src/format.ts`: tambah `receiptDateTime` → "DD/MM/YYYY - HH:MM".
- `src/receipt.ts` (teks printer 58mm/32 kolom, DIKIRIM sebagai teks murni): margin kiri 1 karakter (geser ke kanan, hindari cetakan/stempel sisi kiri) dgn kolom dihitung dalam 31 lalu +1 spasi → tetap ≤32. Kepala: nama toko (tengah) + alamat (tengah) + garis "-". Info transaksi 2 sisi: "Id Transaksi"/no, "Tanggal"/tgl-jam, "Kasir"/nama. Barang: baris1 nama(+", unit" bila bukan pcs) kiri & total kanan; baris2 "  qty x hargaSatuan". Nama panjang dipotong agar tak bertabrakan/keluar lebar. Ringkasan: Total (tebal), Dibayar, Kembalian; bila kurang → "Pembayaran Kurang" + nominal. Nominal tanpa "Rp" (numberID) meniru struk.
- `components/ReceiptPreview.tsx`: preview layar mengikuti tata letak sama (nama toko besar 19px tengah, info 2 sisi, barang nama+total lalu qty x harga, Total tebal, Dibayar, Kembalian / Pembayaran Kurang). Banner atas "PEMBAYARAN KURANG" dipindah jadi baris di ringkasan. paddingLeft lebih besar agar sedikit geser kanan. Tanpa gambar latar.
- Verified: screenshot preview di Riwayat cocok referensi; cek lebar teks printer via Node → semua baris ≤32 kolom, nama panjang terpotong rapi.

### v14 — Variasi Produk: kelompok datar 1 induk + tampil di dalam induk
- Aturan: 1 produk induk utama (A) dengan banyak variasi datar (A→B, A→C, A→D). Produk yang sudah punya induk TIDAK boleh jadi induk baru; variasi dari B otomatis memakai induk A. Tanpa rantai bertingkat.
- Backend (`server.py`): `create_product` kini menelusuri `parent_id` ke atas sampai root (`_resolve_root_parent`) → variasi SELALU tertaut ke induk utama walau client mengirim id anak. Verified via curl: buat A→B, lalu C dgn parent_id=B → C.parent_id resolve ke A.
- Frontend logika induk sudah benar sebelumnya (`variasi-cepat`: parentId = source.parent_id || source.id) + kini dijamin server.
- Produk list (`produk.tsx`): HANYA menampilkan induk (produk tanpa parent_id). Produk anak disembunyikan dari daftar. Pencarian tetap menemukan induk A saat mengetik nama/barcode anak (B/C). Baris induk menampilkan "Bervariasi · N variasi".
- Produk form (`produk-form.tsx`): saat induk A dibuka, muncul section "Variasi (N)" berisi kartu tiap anak (nama, barcode, stok, harga jual/beli) yang bisa diketuk → buka form anak untuk edit terpisah. Tiap variasi punya data sendiri; membuka/menyimpan induk tidak mengubah data anak.
- Verified: backend curl chain (A→B→C resolve ke A) + UI (list hanya induk 1 baris; form induk tampil 2 variasi tappable). Data uji dibersihkan.

### v13 — Fix bug keyboard global (keyboard tidak muncul di form/modal)
- Root cause: `useHideScanKeyboard` memasang listener keyboard GLOBAL via useEffect di 3 layar tab (Transaksi/Produk/Cek Harga). Layar tab tetap ter-mount di balik modal (Tambah Produk, Item Manual, Checkout, Variasi, Edit Transaksi, Cari) & antar-tab, sehingga listener tersembunyi (kbdRef=false) ikut memanggil Keyboard.dismiss() di layar lain → keyboard tidak pernah muncul saat kolom disentuh.
- Fix di `src/scanKeyboard.ts` (TANPA ubah fungsi lain):
  1. Gating `useIsFocused()` (@react-navigation/native) → listener HANYA aktif saat layar itu benar-benar tampil. Layar tersembunyi tidak lagi mengganggu keyboard di layar lain.
  2. Guard `inputRef.current?.isFocused()` → hanya menekan keyboard bila input SCAN yang fokus. Bila input LAIN fokus (kolom bottom sheet Edit Harga, form, dll) → keyboard dibiarkan tampil.
- Hasil: kolom disentuh → keyboard muncul normal (Cari Produk, Nama/Barcode/Harga Beli/Harga Jual/Stok Produk, Jumlah, Uang Bayar). Scanner Bluetooth pada layar scan aktif TETAP tanpa keyboard; koneksi scanner tidak memunculkan keyboard. Tidak ada aturan "keyboard selalu sembunyi" global.
- Verified: app render + navigasi (Transaksi/Produk/form) OK, lint clean. Perilaku keyboard bersifat native → uji final di Expo Go/build.


- Backend: Product menambah field `parent_id` (Optional). Variasi = produk baru yang menyimpan parent_id ke induk ASLI.
- Frontend: ikon kecil "Tambah Variasi" pada tiap baris keranjang (hanya bila punya product_id) → modal /variasi-cepat.
- Form: Nama, Barcode, Harga Jual, Harga Beli (harga prefilled dari induk, tetap bisa diedit). Stok variasi baru = 999. Barcode boleh berbeda/kosong.
- Hierarki DATAR (tanpa rantai A→B→C): parentId = source.parent_id || source.id. Duplikat dari variasi tetap memakai induk original.
- Tidak mengubah produk induk maupun fungsi transaksi/scan/harga/stok.
- Verified: backend (parent_id persist, duplikat-dari-variasi tetap root, stok 999) + UI (form prefill 6000/5250, simpan, kembali ke Transaksi). Data uji dibersihkan.

### v11 — Penjaga keyboard Mode Scan (anti keyboard saat scan)
- Hook baru `src/scanKeyboard.ts` (useHideScanKeyboard): listener `keyboardDidShow` → bila sedang mode scan (kbdRef=false), `Keyboard.dismiss()` lalu fokus ulang input. Karena mode scan pakai `showSoftInputOnFocus={false}`, fokus ulang TIDAK memunculkan keyboard lagi → scanner tetap aktif & siap barcode berikutnya (tanpa loop, tanpa menghentikan input).
- Diterapkan di 4 kolom scan: Transaksi (scan-mode-input), Cek Harga (cekharga-scan-input), Produk (produk-search-input), dan Cari Barang (cari-input).
- Cari Barang kini default mode scan (siap scan langsung tanpa menyentuh; autoFocus dihapus, fokus programatik). Keyboard hanya muncul saat kolom disentuh (onPressIn → openKeyboard), balik ke mode scan saat blur asli.
- kbdRef disinkronkan dgn state via useEffect; guard `skipBlur` cegah blur programatik mereset mode.
- Verified (web): scan Transaksi/Produk/Cek Harga tetap resolve; Cari Barang filter + tap add tetap jalan. Penindasan keyboard bersifat native → uji di Expo Go/build.

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


## Session Log (fork) — Cek Harga Kiosk & Miko refinements
- Balon teks Miko di kios Cek Harga: durasi 7 dtk + jeda 5 dtk sebelum balon berikutnya (siklus 12 dtk). `Miko.tsx` interval 12000ms (animId 3500ms terpisah).
- Menambah 80+ kalimat kios Miko (KIOSK_SAY): cerita Vita, Sasa, keduanya, jahil sopan, Toko Bagus.
- Keyboard fix: `variasi-cepat.tsx` & `edit-transaksi.tsx` diubah dari KeyboardAvoidingView(behavior undefined di Android) → `KeyboardAwareScrollView` + `KeyboardStickyView` (footer ikut naik). Edit Harga (index.tsx bottom sheet) sudah pakai BottomSheetTextInput.
- Pengingat Backup (Miko): `autobackup.ts` tambah `markBackupShared/getLastBackupShare/shouldRemindBackup` (ingatkan >3 hari tak share, 1x/hari). `backup.tsx` catat waktu saat Sharing. `_layout.tsx` emit `backup_reminder` 6s setelah buka. Miko handler + array BACKUP_REMIND.
- Cek Harga kios redesign: **Panggung Miko** (pedestal + spotlight, style pedestal 3D) dengan `<Miko mode="stage" />` (tidak bisa digeser). Global `<Miko />` disembunyikan saat pathname cek-harga (via usePathname di `_layout.tsx`). Tombol SCAN BARCODE jadi pill teks-saja (ikon barcode dihapus). Note petunjuk scanner fisik di bawah.
- Miko `mode="stage"`: saat dipencet pelanggan → array KIOSK_TAP (60+ reaksi: senang/kaget/pura marah/genit/nangis/jahil/sapaan + rahasia Vita&Sasa), hold 4.5 dtk.
- CATATAN: fitur hardware (TTS suara Miko, kamera, printer/scanner BT, auto-backup file) hanya jalan di HP/build, bukan preview web. Perubahan perlu redeploy (Publish) agar masuk ke HP.

## Session Log (fork) — Edit Transaksi: Tambah Barang + fixes
- Cek Harga kios: tombol SCAN BARCODE + fitur kamera (expo-camera) DIHAPUS total (hanya scanner fisik). openCamera/camOn/overlay/onBack camera dibersihkan. Physical scanner (hidden input) tetap aktif. Stage Miko height 300 agar balon tak menutupi subjudul.
- Miko KIOSK_SAY +30 kalimat pengingat kebutuhan rumah/dapur (acak, bukan tap).
- Edit Harga (index.tsx bottom sheet): HAPUS `android_keyboardInputMode="adjustResize"` — penyebab kolom mentok di keyboard (konflik gorhom v5 + keyboard-controller). Fix per web research.
- BARU: edit-transaksi.tsx "Tambah Barang" — BottomSheetModal (snap 82%) berisi BottomSheetFlatList katalog (roots + ekspansi variasi nested & anak) + mode Manual (nama+harga). addCatalog() merge qty by product_id+variation_id; addManual() append item product_id null. Tombol X tutup (add-close). WEB FIX: `SheetInput = Platform.OS==="web" ? TextInput : BottomSheetTextInput` (BottomSheetTextInput crash di react-native-web: TextInput.State.currentlyFocusedInput). Divalidasi via screenshot: buat tx manual → Riwayat → Edit → Tambah Barang (katalog variasi + manual) sukses, toast hijau, tanpa crash.
- CATATAN: perubahan perlu redeploy (Publish) agar masuk ke HP. Keyboard/printer/scanner/TTS/kamera = native-only.


- UX: Tambah Barang (edit-transaksi) sekarang auto-dismiss sheet + scroll list ke atas setelah item ditambahkan (katalog biasa, setelah pilih variasi, dan manual). Via scrollRef pada KeyboardAwareScrollView + afterAdd(). Divalidasi screenshot.

## Session Log (fork) — HYBRID CLOUD SYNC (Fase 1) SELESAI & TERUJI
- Backend (server.py): endpoint /api/sync/push & /api/sync/pull, data per "store" (Kode Toko), LWW by updated_at(ms). Collections: s_products, s_transactions, s_settings (+indexes). Tombstone via field deleted pada produk.
- localdb.ts: tambah deletions map (tombstone) + settingsUpdatedAt; tx create/update set updated_at; onLocalChange/notifyChange (UI reload); methods collectDirty(sinceMs)/applyRemote(remote)/clearDeletions. deleteProduct catat tombstone.
- src/sync.ts (BARU): Kode Toko (get/set/clear/makeStoreCode), syncOnce (push lalu pull, timeout 12s = deteksi offline), startAutoSync (interval 45s + AppState active). Base = EXPO_PUBLIC_BACKEND_URL + /api. Keys AsyncStorage: sync:storeCode, sync:lastPull(server ms), sync:lastPush(device ms).
- data.tsx: subscribe onLocalChange -> reload produk saat sinkron masuk.
- _layout.tsx: startAutoSync saat ready.
- app/sync-toko.tsx (BARU): layar Kode Toko (buat/gabung/salin/sinkron/putus + status). Link ikon cloud di header Riwayat (testID riwayat-sync). Pakai expo-clipboard (baru diinstall ~8.0.8).
- TERUJI end-to-end di preview: create code -> server terima 2261 produk + 123 tx; simulasi HP2 push produk -> HP ini pull -> muncul di Cari (cari-row-zzz-sync-1 = 1).
- DESAIN: tanpa login, 3 HP (2 kasir + 1 cek harga dinding), stok DIABAIKAN saat merge (produk LWW, transaksi union). Butuh internet+server aktif (50 kredit/bulan, koordinasi owner). Offline & Backup/Restore manual tetap jalan bila server mati.

- SUARA (sfx): expo-audio ~1.1.1 + assets/sounds/tik.wav (berhasil) & tok.wav (gagal), disintesis stdlib (volume tipis). src/sfx.ts (playOk/playFail, lazy init, playsInSilentMode, try/catch web-safe). Disambung ke src/toast.tsx: type success->tik, error->tok. Otomatis mencakup: barang masuk keranjang, tambah produk, edit barang, stok masuk (success toast) & barcode tidak ditemukan/aksi gagal (error toast). Hanya berbunyi penuh di HP/build.

- SUARA BAYAR: speakPaymentDone(cash,total,change) di voice.ts diubah -> bacakan "Diterima X rupiah. Total Y rupiah. Kembalian Z rupiah. Terima kasih." (hangat, rate 0.9, pitch 1.03, volume 0.6, jeda via titik, tanpa efek/hewan). checkout.tsx kirim cash,total,change. Toggle "Suara Pembayaran" (voiceChange, default ON) di pengaturan-struk. Hanya berbunyi di HP/build.
