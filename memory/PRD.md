# PRD — Toko Bagus (Kasir Warung / POS)

## Session Log (fork) — TAHAP 1 SELESAI: Mode Unlimited (tanpa stok)
- Setting baru `unlimitedStock?: boolean` (types.ts) default `true` (localdb DEFAULT_SETTINGS). Hook global `src/useUnlimitedStock.ts` (baca settings + reaktif via onLocalChange). `saveSettings` di localdb kini panggil `notifyChange()` agar toggle langsung menyebar ke semua layar.
- Bila AKTIF (default): sembunyikan angka stok & peringatan stok di: katalog Produk (kartu + badge low + baris meta + kartu hasil scan), keranjang Transaksi (blok peringatan stok menipis di-skip), form Produk (field Stok disembunyikan, meta anak tanpa stok). Toggle "Mode Unlimited (Tanpa Stok)" ditambah di `pengaturan-suara.tsx`.
- Verified screenshot: katalog Produk tidak menampilkan "Stok" per item. Lint clean.
- BELUM: Tahap 2 (Anak Ikut Induk auto-sync harga), Tahap 3 (scan → popup pilih semua opsi keluarga di transaksi + tampil semua di dinding), Tahap 4 (tombol "Tambah Variasi" dari hasil pencarian saat transaksi).
- CATATAN DESAIN Tahap 2/3: struktur "variasi = produk anak (parent_id)" SUDAH ADA. variasi-cepat sudah prefill harga induk + toggle inherit_tiers. Rencana: (a) child `inherit_tiers===true` → runtime pakai sell_price+tiers induk (auto-sync 2a); (b) helper getFamily(root+children); scan barcode apa pun di keluarga → transaksi buka popup pilih anak, dinding tampil semua. User mau "setiap barcode → selalu pilih variasi".


- BUG SCANNER: setelah fitur 10 Pintasan Produk, menekan chip Pintasan mem-BLUR TextInput scanner tersembunyi (`scan-mode-input`, showSoftInputOnFocus=false, penerima HID Bluetooth) dan tidak pernah difokuskan ulang → scanner mati sampai pindah tab. FIX di `app/(tabs)/index.tsx`: tambah `refocusScanner()` (2x: 60ms & 320ms untuk lolos animasi/re-render) dipanggil di `onQuickTap` (cabang non-variasi), `onPickVariation`, dan `closeVariant` (backdrop + onRequestClose popup variasi). Tidak mengubah logika scanner/useBarcodeScan/keranjang/DB. Verified e2e web: setelah tap chip, document.activeElement TETAP "scan-mode-input" (2x tap), produk masuk (qty 2). Scanner asli hanya jalan di device build.
- FIX KALKULATOR: display ekspresi panjang membungkus & MEMOTONG angka mid-nominal (mis "…+3" pindah baris jadi ".000"). FIX: display kini `ScrollView` horizontal (satu baris, `numberOfLines={1}`, auto `scrollToEnd` via onContentSizeChange, contentContainerStyle flexGrow+justify flex-end) → angka utuh, geser ke kanan seperti kalkulator umum. Style baru `calcScrollContent`. Verified: 7.000+2.000+3.000 tampil 1 baris tanpa terpotong, "= 12.000".


- `app/checkout.tsx` CalculatorModal DIROMBAK dari immediate-execution → model EKSPRESI PENUH. State tunggal `expr` (raw string, operator +-×÷). Display atas menampilkan seluruh ekspresi terformat gaya ID (ribuan ".", desimal ",") mis. "8.000+6.000+3.500+9.000"; baris bawah "= 26.500" (hasil live, muted) muncul otomatis saat ada operator & valid. Tekan `=` → collapse jadi hasil.
- Evaluator sendiri (tanpa eval): tokenize regex, 2-pass (× ÷ dulu, lalu + -), pembagian 0 → "Error". Handlers: inputDigit (anti leading-zero via lastNum), input00, inputDot (desimal "."), setOperator (ganti operator jika beruntun, trim "." di ujung), percent (bagi 100 token terakhir), backspace, clear. Tombol TIDAK berubah (0,00,.,= tetap; % C ⌫ ÷ × − +). Verified e2e: 8000+6000+3500+9000 → display benar + "= 26.500", setelah = → "26.500".
- Ganti style calcExpr→calcResult (muted), display numberOfLines 2 adjustsFontSizeToFit. Lint clean (1 warning pre-existing line 147).


- `app/checkout.tsx` CalculatorModal: baris bawah kini [0][00][.][=] (hapus tombol 0 lebar/`wide`+style calcKeyWide). `input00()`: bila display "0"/waiting → tetap "0", else tambah "00".
- Baris ekspresi baru (`calc-expr`, warna brand pink) di atas display besar: menampilkan `${prev} ${op}` mis. "100 +" saat operator dipilih, sehingga jelas operasi berjalan. `exprLine` diturunkan dari state prev+op; kosong setelah `=`. Verified e2e: 100 + 25 → expr "100 +", display "25", hasil = 125. Operator +,-,×,÷ semua tampil.


- `app/checkout.tsx` step "done": tambah baris `calcRow` (full-width) di bawah actionRow [Bagikan][Cetak Struk], tombol pink-outline "🧮 Kalkulator" (testID receipt-calc, style calcBtn = mirip actionBtn tapi selebar 2 tombol, maxWidth 320). Tombol Bagikan/Cetak Struk/Transaksi Baru/struk TIDAK diubah.
- `CalculatorModal` (komponen di file yg sama): Modal transparent slide dari bawah (bottom sheet), overlay di ATAS halaman Transaksi Berhasil (tidak navigasi/tidak meninggalkan halaman). Kalkulator immediate-execution: digit 0-9, . , + - × ÷, =, C, ⌫, %. Operator = brandTertiary pink, = brand pink (teks putih), fn = surfaceTertiary. State: display/prev/op/waiting. Haptics selectionAsync tiap tap. Verified e2e screenshot: transaksi selesai → tombol tampil sesuai referensi → buka kalkulator → 12×3=36 benar.
- Lint clean (hanya 1 warning pre-existing unused 'e' di line 147, bukan dari perubahan ini). Frontend-only → user Publish untuk ke HP.


## Session Log (fork) — 4 FITUR CEPAT: Diskon %, Stok Menipis di Keranjang, Hapus Variasi, Sembunyikan Miko
- DISKON PERSEN (`app/checkout.tsx`): tambah toggle mode Rp/% di baris Diskon (state `discMode`). Bila `%`, potongan = round(pct/100 × subtotal) dgn pct dibatasi 0–100; Rp tetap seperti semula (dibatasi ≤ subtotal). `discount` yang tersimpan ke transaksi TETAP nominal rupiah (tidak ubah backend/struk). Caption menampilkan "Diskon N% · Subtotal … · Potongan -Rp…". FIX web: input width fixed 66 + box flexShrink:0 (react-native-web tidak menghormati flex:1 → input meluber; sekarang rapi, verified screenshot input di 251–317px, muat penuh).
- STOK MENIPIS DI KERANJANG (`app/(tabs)/index.tsx`): di tiap kartu keranjang, cari stok produk/variasi terkini dari `products` (variasi via product.variations, atau product.stock). Bila stok ≤ 5 → tampil baris merah kecil: "Stok menipis · sisa N" (Ionicons alert-circle). Bila qty > stok → "Stok kurang! Sisa N". Item manual (product_id null) dilewati. Styles: lowWarn/lowWarnTxt.
- HAPUS VARIASI DARI INDUK (`app/produk-form.tsx`): di tiap kartu variasi anak (childVariations) tambah tombol trash. Ketuk → Alert konfirmasi "Hapus Variasi?" → `api.deleteProduct(c.id)` + reload + emit product_deleted. Style childDel. Import Alert ditambah.
- SEMBUNYIKAN MIKO (`Settings.hideMiko` di types.ts + DEFAULT_SETTINGS false): toggle "Tampilkan Maskot Miko" di `pengaturan-suara.tsx` (Switch). Saat diubah → simpan settings + emit `mikoBus {type:"miko_visibility", hidden}`. `_layout.tsx` baca settings awal (api.getSettings) + subscribe event → state `mikoHidden` → `{!mikoHidden && !cek-harga && <Miko/>}`. CATATAN: hanya menyembunyikan Miko MELAYANG di layar kasir; kios Cek Harga (stage + MikoRig) TIDAK terpengaruh (sengaja, kios = pengalaman Miko khusus). mikoBus event `miko_visibility` ditambah.
- Lint clean. DIVERIFIKASI screenshot: toggle Miko tampil & mascot muncul; checkout Diskon % toggle aktif + input "10%" rapi dalam layar. Frontend-only → user REDEPLOY (Publish). BELUM: Suara Miko/STT (Tahap B, butuh build APK).


## Session Log (fork) — OPTIMASI PERFORMA Tahap 1 (risiko rendah, tanpa ubah fitur)
- AUDIT: FlatList Produk (`produk.tsx`) & Riwayat (`riwayat.tsx`) SUDAH teroptimasi penuh (keyExtractor, getItemLayout[produk], removeClippedSubviews, initialNumToRender, maxToRenderPerBatch, windowSize) → tidak diubah. MikoRig & sync.ts sudah bersih-bersih timer (cleanup ada). Cart pakai ScrollView (biasanya sedikit item) → dibiarkan agar tak ubah layout.
- PERUBAHAN (aman, behavior-preserving) di `src/data.tsx`:
  1. Provider value dibungkus `useMemo` → mencegah SEMUA konsumen `useData()` re-render tiap provider render.
  2. Reload dari `onLocalChange` (dipicu sinkron cloud) di-DEBOUNCE 350ms → badai tulis saat sinkron (chunk 150) jadi 1x reload, bukan puluhan. Aman karena semua aksi user (tambah/edit produk, stok, checkout, item-manual, variasi-cepat, edit-transaksi, backup, cari) memanggil `reload()` LANGSUNG (tidak lewat onLocalChange) → perubahan user tetap instan.
- Tidak menyentuh DB/query, scanner, keranjang, suara, animasi Miko, transaksi, sinkronisasi (logika), backup/restore. Tidak ada fitur dinonaktifkan.
- DIVERIFIKASI (screenshot): Produk render (ikon printer 12), Transaksi header ada, navigasi tab lancar, tidak crash. Lint clean. Frontend-only → user REDEPLOY.
- BELUM dikerjakan (Tahap 2, risiko sedang bila diminta): jeda animasi saat tab tidak fokus (Miko float/kios berjalan di background karena tab tetap mounted), memoisasi row Riwayat, downscale aset gambar. Perlu pengujian ketat.


- Kartu produk (produk.tsx `ProdukRow`): tambah ikon printer pink kecil (Ionicons print-outline, 20px, style `printBtn` 34×34) di antara price pill/"Bervariasi" dan tombol ⋮ (hanya mode normal, bukan selectMode). Tidak menambah tinggi kartu.
- Ketuk ikon → Modal "Cetak Barcode" (RN Modal, tema pink): tampil Produk (nama), Barcode, stepper Jumlah (1–50), tombol "Pilih Printer" (router.push `/pengaturan-printer`, menampilkan nama printer tersimpan), tombol Cetak & Batal.
- Cetak: `printText(printer.address, buildBarcodeLabels(name, barcode, qty))`. Helper BARU `buildBarcodeLabels()` di `src/receipt.ts` → ESC/POS: nama (tengah, tebal) + barcode CODE128 (GS k 73, code set {B) + angka HRI, diulang qty kali. Guard `isBluetoothAvailable()` (web → toast NATIVE_ONLY_MSG). Printer dimuat via `api.getPrinter()` di `useFocusEffect` (auto refresh setelah kembali dari Pilih Printer).
- Tidak mengubah layout/fitur produk lain. types import Printer ditambah di produk.tsx.
- DIVERIFIKASI (screenshot preview): ikon tampil di tiap kartu; popup muncul dgn Produk/Barcode/Jumlah/Pilih Printer(RPP02N)/Cetak. Lint clean. Cetak barcode NATIVE-ONLY (butuh HP + build). Frontend-only → user REDEPLOY.


- Chip pintasan di HEADER Transaksi (2 baris × 5, kecil ~28px, font 10, bingkai pink, bg surfaceTertiary, nama dipotong "…"; tidak digeser — sesuai permintaan user). Slot kosong TIDAK ditampilkan. Ikon ⚙️ "Atur Pintasan" di kanan header. Tombol Cari Barang & Tambah Item TIDAK diubah.
- Simpan sebagai `Settings.quickSlots: (string|null)[]` (ID produk, panjang 10) → ikut sinkron via mekanisme Settings yang sudah ada (tidak buat sistem baru). Default `[]` (kosong; user isi sendiri). types.ts + localdb DEFAULT_SETTINGS diperbarui.
- Ketuk chip: produk TANPA variasi → `cart.addProduct(p,null)` langsung (sama seperti scanner) + toast; produk DENGAN variasi (`p.variations.length>0`) → Modal "Pilih Variasi" muncul DI halaman Transaksi (tanpa pindah halaman), pilih 1 → `cart.addProduct(p,v)` + popup tutup. Harga & nama SELALU dari `products` (DB terbaru); produk terhapus → slot otomatis dianggap kosong (tak error).
- Layar baru `app/atur-pintasan.tsx`: 10 slot, isi/ganti/kosongkan, pemilih produk dgn pencarian (hanya produk non-anak). Simpan ke Settings.
- index.tsx: state `slots`+`variantFor`, `loadSlots()` dipanggil di focus & `onLocalChange` (agar ikut update saat sinkron/kembali dari pengaturan).
- DIVERIFIKASI e2e (screenshot preview): TEST1 tanpa variasi→langsung masuk (beras Rp14.000); TEST2 variasi→popup "Pilih Variasi Beras" (7 opsi) tanpa pindah halaman; TEST3 pilih 14100→masuk keranjang Rp14.100 & popup tutup; TEST4 ganti slot→chip berubah; TEST5 harga dari DB; TEST6 chip kecil rapi portrait. Lint clean. Akses pengaturan: BEBAS (tanpa PIN) sesuai keputusan. Frontend-only → user perlu REDEPLOY.


- Keluhan: di layar hasil Miko terlalu sering menahan pose MENUNJUK. Target: menunjuk hanya saat benar-benar menunjuk; selebihnya gerak natural bervariasi.
- `components/MikoRig.tsx`: tambah prop `story?: Step[]` (urutan {state,hold}) + `rest?: MikoState`. Efek koreografi memainkan urutan lalu `storyDoneRef=true` & settle ke `rest`. `stopTalk` kini kembali ke `rest` (mis. WARM) saat story selesai (bukan menahan POINT). Aksen saat bicara kini DINAMIS (baca stateRef terkini) → mengikuti perpindahan koreografi (menunjuk→menjelaskan) sambil mulut bergerak. Variasi "bahasa wajah" (WARM/HAPPY/IDLE/THINKING/MISCHIEF/SLEEPY) kini juga jalan untuk rig non-ambient SETELAH story selesai (tak pernah menunjuk di fase ini).
- `app/(tabs)/cek-harga.tsx`: STORY_RESULT = HAPPY(0.85s)→POINT(1.2s)→SALES_EXPLAIN(1.5s)→rest WARM; STORY_PICK = THINKING(1s)→POINT(1s)→SALES_EXPLAIN(1.5s)→rest WARM. Rig hasil & 2 layar pilihan pakai `story` + `rest="WARM"`; efek THINKING→POINT lama dihapus.
- DIVERIFIKASI (screenshot preview): layar hasil pada ~3.8s menampilkan pose WARM/ramah (bukan menunjuk). Lint clean. Frontend-only → perlu REDEPLOY (Publish) agar aktif di produksi.


- 3 frame ekspresi BARU (gaya sama, di-edit dari base.png via Nano Banana): `mischief.png` (usil/kedip+smirk), `sleepy.png` (mengantuk mata setengah), `warm.png` (ramah/hangat 🥰). Total 15 frame rig. Skrip `/app/scripts/gen_miko_rig.py` (+ bg flood-fill transparan).
- `src/mikoBus.ts`: MikoState tambah MISCHIEF, SLEEPY, WARM.
- `components/MikoRig.tsx`:
  - REST map + F sources utk 3 frame baru.
  - TRANSISI HALUS antar-ekspresi: `transitionTo()` redup(opacity→0.2,110ms)→tukar frame→terang(→1,190ms) + pop scale; dipakai di goState (blink/mulut tetap swap instan). Opacity `fade` dipasang di Animated.View.
  - IDLE "bahasa wajah": exprId tiap 4.5s memilih acak dari pool (IDLE/WARM/HAPPY/THINKING/MISCHIEF/SLEEPY; mengantuk & usil jarang) dgn transisi halus — Miko tak lagi berwajah sama terus.
  - `not_found` → SAD sebentar (1.6s) lalu WARM (kecewa lalu ramah lagi).
- `app/(tabs)/cek-harga.tsx`:
  - Layar "Pilih Barang" (searchResults) & "Pilih Varian" (varProduct): tambah `<MikoRig size=92 ambient=false initial=THINKING>` di header. useEffect saat layar pilihan aktif: emit THINKING (melihat) lalu POINT (menunjuk daftar) setelah 1.1s → terasa dilayani sales.
  - `salesToState`: intent 'none' → CONFUSED (tidak paham → bingung).
- DIVERIFIKASI (screenshot preview): Pilih Barang → Miko menunjuk daftar; Pilih Varian → Miko menunjuk; layar hasil → Miko menunjuk harga; idle render OK (ekspresi berputar). Lint clean. CATATAN: animasi mulus & suara paling terlihat di HP/BUILD APK; frontend-only → REDEPLOY.


## Session Log (fork) — GANTI EFEK SUARA jadi 11 "Suara Miko" lembut (sesuai mockup user)
- User kirim mockup layar "Suara Efek": daftar bunyi Miko dgn ikon warna + deskripsi + centang + tombol Coba, pemisah grup positif/subtil. Minta ganti efek suara lama (keras: beep/buzz/coin/chaching/ding/dll) → suara Miko lembut.
- ASET baru `assets/sounds/miko_*.wav` (11) disintesis stdlib (sinus + harmonik + envelope halus, peak 0.5, no click). Skrip `/app/scripts/gen_miko_sfx.py`. Daftar: sparkle (2-3 nada naik), bell (bel hangat), magic (chime berkilau), happy (3 nada ceria), pop (pop+chime), premium (chime elegan) [POSITIF]; oops (2 nada turun), warning (rendah halus), tryagain (nada menurun), blip (blip lembut), hmm (nada berpikir) [SUBTIL].
- `src/sfx.ts` DITULIS ULANG library: SfxId 11 baru + SfxMeta {id,label,emoji,desc,icon,bg,fg,group} + SOURCES map. Default: ok=sparkle, fail=oops, paid=premium. loadConfig tetap guard id invalid → fallback default (aman utk settings lama yg simpan id lama). Volume Normal/Keras/Maks tetap.
- `app/pengaturan-suara.tsx`: baris pemilih dirombak sesuai mockup — centang (checkmark-circle) + chip ikon berwarna (bg/fg) + nama+emoji + deskripsi + tombol Coba; divider antar grup (positif↔subtil); `cur` divalidasi thd SFX_LIBRARY (kalau id lama tak valid → pakai default sehingga selalu ada yg tercentang). Struktur 3 kejadian (Berhasil/Gagal/Lunas) dipertahankan.
- `src/localdb.ts` DEFAULT_SETTINGS sfx id diperbarui (sparkle/oops/premium).
- DIVERIFIKASI (screenshot preview): layar Suara Efek tampil sesuai mockup (Sparkle tercentang, chip warna, deskripsi, Coba, divider). Lint clean. Aset wav lama (sfx_*/tik/tok) tak lagi di-require → tidak ikut bundle. CATATAN: suara hanya berbunyi di HP/BUILD APK; frontend-only → user REDEPLOY.


## Session Log (fork) — MIKO RIG 2.5D (karakter hidup, sinkron TTS) — Jalur B
- Permintaan user: naikkan Miko dari pergantian pose ke ANIMASI KARAKTER 2.5D (kedip, mulut gerak saat bicara, kepala/tangan/badan bergerak, banyak ekspresi, state machine, sinkron TTS). Jalur B disetujui (tanpa animator, aset di-generate AI, identitas Miko dipertahankan).
- ASET (baru) `assets/miko_rig/` 12 frame konsisten via Nano Banana (`gemini-3.1-flash-image-preview`, EMERGENT_LLM_KEY), di-edit dari `mascot/miko_happy.png` sbg referensi agar identitas (pita, apron, bunga, ekor, warna) terjaga: base, blink, talk_mid, talk_open, happy, laugh, thinking, confused, sad, surprised, point, sales. Latar putih dibersihkan jadi transparan (flood-fill dari tepi) + autocrop + resize sisi 512. Skrip: `/app/scripts/gen_miko_rig.py`, `/app/scripts/miko_rig_bg.py`.
- KOMPONEN baru `components/MikoRig.tsx`: rig sprite frame-swap + transform Animated (napas loop, angguk/miring, geser sales, pop kaget, lompat ceria). Mulut BICARA = flap [base,talk_mid,talk_open] + sisipan aksen ekspresi tiap ~1.5s (laugh lebih sering) selaras TTS. Kedip mata natural tiap 2.2–5.4s (dilewati saat bicara / frame mata-tertutup). State machine: IDLE/TALK/THINKING/HAPPY/CONFUSED/SAD/SURPRISED/LAUGH/POINT/SALES_EXPLAIN. Props: `size`, `ambient` (kios sayings+tap), `initial` (state awal). Ambient kios (teks bubble dari KIOSK_SAY tiap 12s + tap KIOSK_TAP) hanya saat ambient=true.
- SINKRON TTS: `src/voice.ts` semua fungsi bicara (speak/speakCalm/speakPaymentDone) kini lewat `runSpeech()` yang emit `mikoBus` `speak_start{ms}`/`speak_end` (via callback onDone/onStopped/onError + emit start langsung agar jalan walau web tak berbunyi; ada pengaman auto-stop = est durasi). `src/mikoBus.ts` tambah event `speak_start`,`speak_end`,`miko_state` + tipe `MikoState`.
- WIRING `app/(tabs)/cek-harga.tsx`: stage kios `<Miko mode="stage" />` → `<MikoRig />` (rig penuh, ambient). Emit state: askMiko→THINKING; jawaban sales→`salesToState(intent)` (offer/show/help=SALES_EXPLAIN, price/stock=POINT, greet/thanks=HAPPY, decline=IDLE); chitchat online/fallback→HAPPY; backToScan→IDLE. Layar HASIL harga: tambah `<MikoRig size=116 initial=POINT>` di atas kartu (Miko menunjuk harga); `speakPrice` ditunda 90ms agar rig sempat mount & menangkap sinyal bicara. Panel chat (saat ini belum ada tombol pemicu/unused) diberi `<MikoRig size=132 ambient=false>` (siap pakai). `Miko.tsx`: KIOSK_SAY & KIOSK_TAP di-`export`.
- DIVERIFIKASI (screenshot preview): idle kios = Miko 2.5D hi-res di panggung (identitas terjaga); cari "beras" → 24 kartu; pilih → layar harga menampilkan Miko MENUNJUK di atas "Rp 13.700". Lint clean.
- CATATAN: mulut sinkron TTS, kedip, & suara paling penuh terlihat di HP/BUILD APK (TTS tak berbunyi di web; di web animasi flap tetap jalan via pengaman durasi). Frontend-only → user REDEPLOY (Publish) agar aktif di produksi. Belum dikerjakan: rig di layar multi-pilihan (searchResults/varProduct) & STT (tekan-bicara) menyusul bila diminta.


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

- CEK HARGA VOICE SETTINGS: 2 toggle di pengaturan-struk (SUARA CEK HARGA): readPrice (Suara Baca Harga) & priceClosing (Suara Setelah Baca Harga), default ON (types.ts optional + DEFAULT_SETTINGS). cek-harga.speakPrice gate: readOn->nama+harga+tier, closingOn->kalimat penutup; kosong->diam. Pakai voice.ts speakCalm (rate 0.9, pitch 1.02, volume 0.55, jeda via titik, tanpa efek). Not-found juga pakai speakCalm. Settings di-refetch on focus. Hanya untuk Cek Harga.

- TRANSAKSI UI: tombol Tambah Item & Cari Barang dipindah dari atas ke BAWAH daftar (akhir ScrollView, di bawah barang terbaru karena item append ke bawah) + di empty state. Desain baru: addBar/addBtnBig, primary (brand + shadow + ikon lingkaran putih) & ghost (outline). Style lama actions/actBtn dibiarkan (tak terpakai).

- EDIT RIWAYAT UI: tombol "Tambah Barang" dipindah dari atas (setelah dateBox) ke BAWAH daftar barang (setelah items.map, sebelum payCard) → di bawah barang terbaru. Auto-scroll (afterAdd -> scrollToEnd) tetap aktif.


## Session Log (fork) — DIAGNOSA "Sinkron Offline" + chunked push
- Keluhan user: 2 HP tidak bisa saling terhubung meski Kode Toko sama; layar Sinkron Cloud menampilkan "Offline — menunggu internet".
- DIAGNOSA MENYELURUH:
  - Backend `/api/sync/pull` & `/api/sync/push` SEHAT. Push penuh 2261 produk (958KB) ke URL eksternal = HTTP 200 dalam ~1.8 dtk (dengan User-Agent HP normal: okhttp/iOS → 200).
  - 403 (Cloudflare error 1010) yang sempat muncul HANYA saat memakai tool testing tanpa UA (urllib/curl default) — proteksi bot Cloudflare, BUKAN batas ukuran body & BUKAN bug kode.
  - Alur klien diverifikasi end-to-end di preview web: buat kode TOKO-6964-ALHB → status "Tersinkron" → server menerima 2261 produk + 123 transaksi.
  - KESIMPULAN: kode & server benar. Penyebab "Offline" di HP user = APK menembak backend URL yang TIDAK terjangkau (URL preview berubah setelah fork / preview tidur saat workspace idle). Cloud Sync hanya andal bila backend DI-DEPLOY (Publish) → dapat URL produksi stabil & selalu online, lalu APK di-build ulang.
- PERBAIKAN KODE (robustness 4G lemah): `src/sync.ts` push kini BERTAHAP (chunk 150 item/request, timeout 20 dtk/request; settings dititip di request pertama) via `pushDirty()` → hindari 1 request 958KB timeout di 4G lemah. Cursor K_LAST_PUSH hanya maju setelah semua chunk sukses. Pull tetap 1 GET. Lint clean, diverifikasi round-trip di preview.
- CATATAN untuk agent berikutnya: Cloud Sync = butuh backend deployed. Arahkan user ke tombol Publish + build ulang APK bila ingin sinkron antar-HP jalan permanen.

## Session Log (fork, PRODUCTION) — FIX: produk baru dari HP1 tidak muncul di HP lain
- Keluhan: setelah deploy, tambah produk di HP1 → di HP lain "produk tidak ditemukan".
- ROOT CAUSE: cursor sinkron PULL memakai jam SERVER (pull.now), tetapi produk disimpan dengan `updated_at` = jam HP pengirim. Bila jam HP1 sedikit di belakang jam server, `updated_at` produk baru < cursor HP2 → produk difilter keluar di `/sync/pull` → tak pernah sampai (permanen).
- FIX (backend/server.py): server kini mencap `srv_at` (jam SERVER) pada SETIAP tulisan (push products/transactions/settings). `/sync/pull` memakai `srv_at` sebagai cursor: `since==0` → kirim SEMUA (bootstrap HP baru, migrasi-aman untuk data lama tanpa srv_at); `since>0` → hanya `srv_at > since`. `updated_at` (jam HP) tetap dipakai HANYA untuk LWW konten (siapa terbaru menang). `push` mengembalikan `now = srv`.
- DIVERIFIKASI (localhost): simulasi jam HP1 mundur 60 dtk → produk baru TETAP sampai ke HP2 (sebelumnya pasti hilang). Bootstrap store lama (2261 produk tanpa srv_at) since=0 → 2261 terkirim; incremental since=now → 0 (tanpa duplikasi/spam).
- PENTING: perbaikan ada di BACKEND → user WAJIB REDEPLOY (Publish) agar aktif di produksi. Tanpa perubahan kode frontend.

## Session Log (fork, PRODUCTION) — MIKO ASISTEN SUARA (Tahap 1: otak percakapan OFFLINE)
- Permintaan user: di kios Cek Harga, Miko jadi asisten yang bisa diajak bicara pelanggan ("Miko, harga Soklin berapa?" → jawab; lalu "ada yang lebih murah?" tanpa sebut nama lagi). Wajib OFFLINE, tanpa cloud/AI, pakai DATA KASIR yang ada. Jujur soal komponen yang belum tersedia.
- KEPUTUSAN & KEJUJURAN TEKNIS (disampaikan ke user):
  - Tahap 1 (SELESAI, bisa dites preview): OTAK percakapan murni JS/offline.
  - Tahap 2 (butuh native build/EAS, tak bisa di preview): STT offline `react-native-vosk` + model Indonesia (~50MB) + tombol "tekan-bicara".
  - Tahap 3 (opsional, ADA SYARAT): wake word "Miko" via Picovoice Porcupine — butuh AccessKey, keyword gratis kedaluwarsa ~30 hari, & internet sesekali utk validasi lisensi (jadi TIDAK 100% offline). Alternatif andal: tombol "Tanya Miko" (tekan-bicara), full offline.
- IMPLEMENTASI Tahap 1:
  - BARU `src/mikoChat.ts`: `mikoAsk(products, text, ctx)` + `mikoThinking()`. Deteksi intent Indonesia (harga/stok/lebih murah/lebih mahal/sapaan/terima kasih/bantuan), fuzzy match nama produk ke DATA LOKAL (skor token + bonus substring + prioritas induk; tie-break: nama terpendek lalu termurah). KONTEKS 30 dtk (barang & daftar match terakhir) → follow-up tanpa sebut nama. Jawaban natural + `terbilang()` untuk TTS, `rupiah()` untuk layar. Sertakan grosir termurah bila ada.
  - `app/(tabs)/cek-harga.tsx`: tombol besar "TANYA MIKO" di kios + Modal "Ngobrol dengan Miko" (bubble chat, input teks utk uji preview + hint; di HP nanti disambung suara). Alur: kirim → Miko "cek dulu" (mikoThinking, TTS) → 850ms → jawaban (TTS speakCalm) → auto-scroll. FITUR SCAN & harga lama TIDAK diubah.
- DIVERIFIKASI (screenshot preview): "harga gula" → "Gula Pasir 1kg harganya Rp 15.000"; "stok beras" → jumlah stok; "ada yang lebih murah?" → ingat konteks, temukan alternatif termurah + hitung hemat. Lint clean (1 warning lama tak berbahaya).
- CATATAN: suara TTS hanya bunyi di HP/build. Tahap 2/3 (suara masuk & wake word) menunggu keputusan user + native build. Perubahan ini FRONTEND saja → aktif di produksi setelah user REDEPLOY.

## Session Log (fork, PRODUCTION) — MIKO AI PERCAKAPAN (online) + fallback offline
- Permintaan user: Miko jadi AI percakapan sungguhan (paham bahasa bebas, konteks, bercanda, curhat), pakai internet saat ada; harga/stok WAJIB dari DB Kasir (tak boleh ngarang); offline tetap jalan terbatas; jelaskan API/biaya dulu (SUDAH dijelaskan & disetujui).
- KEPUTUSAN USER: Model **Gemini 3 Flash** (`gemini-3-flash-preview`) via **Emergent Universal Key** (pakai kredit Emergent). Bangun otak AI (teks) dulu; suara/STT menyusul saat build APK. Offline cukup versi terbatas.
- BACKEND (server.py): endpoint baru `POST /api/miko/chat` pakai `emergentintegrations.LlmChat` (gemini-3-flash-preview, non-stream send_message). ANTI-NGARANG: HP mengirim `facts` (nama/harga/stok/tiers dari DB LOKAL) → disuntik ke system prompt; model diinstruksikan HANYA pakai angka dari DATA PRODUK, kalau tak ada → sarankan scan/tanya kasir. Persona Miko lengkap (ramah, usil, bisa curhat), jawaban singkat utk TTS, Bahasa Indonesia. History 6 turn terakhir dirangkai ke prompt (stateless per request). `EMERGENT_LLM_KEY` sudah ada di backend/.env.
- FRONTEND: `src/mikoAI.ts` (`askMikoOnline`, timeout 12s → lempar error saat offline). `src/mikoChat.ts` tambah `collectFacts()` (kumpulkan fakta produk dari DB lokal + konteks). `app/(tabs)/cek-harga.tsx` `askMiko` kini ASYNC: coba ONLINE dulu (AI penuh) → gagal/timeout → OTOMATIS fallback ke mesin OFFLINE (`mikoAsk`). Konteks tetap diperbarui via collectFacts agar follow-up "lebih murah" jalan di dua mode. Emoji dibersihkan sebelum TTS. session_id per buka chat.
- DIVERIFIKASI: curl 4 skenario (harga real, "lebih murah" konteks, curhat hangat, TANYA EMAS tidak ngarang → arahkan ke kasir). UI preview 3 skenario (minyak real Rp18.000 + alternatif, "lebih murah" konteks, curhat capek → jawaban manusiawi). Lint clean (1 warning lama).
- SISA (Tahap B, butuh build APK): STT offline (react-native-vosk) + tombol tekan-bicara agar input SUARA; TTS jawaban sudah pakai speakCalm (bunyi di HP). 
- CATATAN: BACKEND + FRONTEND berubah → user WAJIB REDEPLOY (Publish) agar aktif di produksi. AI online butuh internet+server; offline otomatis fallback. Fitur Cek Harga (scan) & DB Kasir TIDAK diubah.

## Session Log (fork, PRODUCTION) — AUTO-CLOSE chat + PENCARIAN KETIK Cek Harga
### A. Auto-close panel "Ngobrol dengan Miko" (10 dtk)
- `cek-harga.tsx`: `autoCloseRef` + `armAutoClose()` (10 dtk → closeChat) + `clearAutoClose()`. Dipasang setelah greeting & setelah tiap jawaban Miko (finally askMiko). Dibatalkan saat pelanggan mengetik (onChangeText) & saat kirim pertanyaan baru (awal askMiko). closeChat membersihkan timer. Transisi lembut via Modal slide (tema Toko Bagus). Riwayat/produk TIDAK dihapus; Miko & Cek Harga tidak dimatikan.

### B. Pencarian KETIK di layar Cek Harga (OFFLINE penuh, tanpa AI online)
- Tujuan: ketik nama → Enter → kartu produk besar → pilih → (varian bila >1) → kartu harga + Miko baca. Scan barcode tetap langsung ke hasil.
- `src/mikoChat.ts`: export `searchProductsByName(products, query, limit=24)` (pakai findByName offline).
- `cek-harga.tsx`:
  - State baru: `searchQuery`, `searchResults: Product[]|null`, `varProduct: Product|null`, `selTimer`.
  - Kolom pencarian (search bar) di layar idle (TextInput terlihat + tombol). `useHideScanKeyboard` hanya menekan keyboard saat input SCANNER fokus → kolom ketik tetap memunculkan keyboard.
  - `doTextSearch`: cari lokal; 0 hasil → Miko bilang belum ketemu (balon+TTS), tetap idle; 1 hasil → pickProduct; >1 → tampilkan kartu produk (`searchResults`).
  - `pickProduct`: varian >1 → tampilkan kartu varian (`varProduct`); varian ==1 → langsung showResult(p, var[0]); tanpa varian → showResult(p, null). (sesuai spec: 1 pilihan tak perlu halaman varian).
  - `pickVariation` → showResult(p, v). showResult (LAMA, offline) menampilkan kartu harga ecer+grosir & Miko membacakan via speakPrice/TTS.
  - Precedence render: result > varProduct > searchResults > idle(+search bar).
  - handleScan: bersihkan searchResults/varProduct/searchQuery → scan SELALU langsung ke hasil (barcode → varian tepat via product.variations match). Barcode tak ada → NOT_FOUND lama (tanpa mengarang).
  - Auto-reset 15 dtk (RESET_MS) untuk layar pilihan via `armSelTimer` (countdown tampil), batal saat interaksi; kembali ke idle. clearTimers kini juga membersihkan selTimer.
  - Kartu produk/varian BESAR & mudah disentuh (minHeight 68). Hubungan Induk→Variasi→Barcode→Harga TIDAK diubah; DB Kasir tidak disentuh.
- DIVERIFIKASI (screenshot preview): "tepung" → 24 kartu produk (nama+harga, countdown 14s); "sukses" → pilih "Sukses" → kartu varian "Goreng Rp4.000" → hasil "Sukses — Goreng Rp4.000 + grosir mulai 5 pcs Rp3.600"; "beras 5kg" → banyak kartu; tanpa hasil → kembali idle. Lint clean (1 warning lama).
- CATATAN: TTS bunyi hanya di HP/build. FRONTEND-only (+ endpoint AI dari sesi sebelumnya) → user REDEPLOY agar aktif di produksi. Pencarian ketik & harga MURNI OFFLINE (tak pakai AI online).

## Session Log (fork, PRODUCTION) — MODE SALES MIKO (offline, rule-based) + hybrid
- Permintaan: Miko jadi sales assistant offline: rekomendasi dari DB lokal (lebih murah/mahal, varian, ukuran, stok, pelengkap), alur TAWARKAN→"boleh" tampilkan KARTU / "tidak" jangan tawarkan lagi, tidak cerewet, gaya lembut tak memaksa. Hybrid: offline=rule-based; online=AI hanya untuk obrolan bebas. Harga/stok SELALU dari DB (online & offline). Arsitektur extensible.
- `src/mikoChat.ts` (SALES ENGINE offline, tanpa AI):
  - ChatCtx tambah: `pendingOffer`, `declinedIds[]`, `complementOffered`. ChatReply tambah: `card` (produk utk ditampilkan) & `intent` ('price'|'stock'|'offer'|'show'|'decline'|'greet'|'thanks'|'help'|'chitchat'|'none').
  - `mikoAsk` di-refactor jadi state machine: (0) tanggapi tawaran → affirm(boleh/iya/mau/oke/tampilkan…)=tampilkan KARTU; negate(tidak/gak/jangan/nanti…)="Baik, Kak 😊" + declinedIds.push (tak ditawarkan lagi). (C) lebih murah/mahal → TAWARKAN kandidat (exclude declined & current) + set pendingOffer (belum kartu). (Harga polos) → jawab polos TANPA tawaran (tidak cerewet). Pelengkap via `COMPLEMENTS` map (kopi→gula, mie→telur, beras→minyak, dst) → ditawarkan MAKSIMAL 1x/percakapan (`complementOffered`), hanya bila ada aturan & stok. Stok → jawab langsung. Semua fakta dari DB lokal (anti-ngarang). `findComplement()` extensible.
  - Guard: tanggapan tawaran hanya diproses bila pesan pendek tanpa fact-intent (murah/mahal/harga/stok/lebih) → hindari salah tafsir "ada yang lebih murah tidak?".
- `app/(tabs)/cek-harga.tsx` (client hybrid + kartu chat):
  - ChatMsg tambah `card?`. `askMiko` kini: jalankan SALES OFFLINE dulu (deterministik). Jika intent≠'chitchat' → pakai hasil offline (jalan online & offline), render bubble + KARTU produk bila ada. Jika 'chitchat' (obrolan bebas/curhat) → coba AI ONLINE (natural), fallback offline. Emoji dibersihkan utk TTS.
  - Kartu produk di chat (chatCard) → tombol "Lihat" → closeChat + `pickProduct(card)` → hasil lengkap (nama/varian/harga/grosir) di layar utama (reuse showResult, offline).
- DIVERIFIKASI (screenshot preview): "harga kopi" → "Kopi Sachet Rp2.000. Oh iya, ada Gula Pasir 1kg juga. Mau Miko tampilkan?" → "boleh" → KARTU Gula Pasir muncul di chat. "harga minyak goreng"→"lebih murah"→TAWARAN→"tidak usah"→"Baik, Kak" (no card, tak diulang). "lebih murah lagi"→tawaran beda→"boleh"→kartu→TAP→hasil "sasa pisang goreng Rp3.000" di layar utama. Lint clean (1 warning lama).
- CATATAN: Sales Mode 100% OFFLINE (rule-based, DB lokal). AI online HANYA untuk obrolan bebas (butuh internet, fallback offline). FRONTEND-only → user REDEPLOY. Fitur Kasir/Cek Harga/scan/varian/stok/import TIDAK diubah. Aturan COMPLEMENTS mudah ditambah tanpa ubah sistem inti.

## Session Log (fork, PRODUCTION) — FIX BUG PENCARIAN (relevansi) + layar "Belum Ketemu"
- BUG: ketik "terigu" memunculkan produk tak relevan (R3, R5, hs, giv, pln, dst). ROOT CAUSE di `findByName` (mikoChat.ts): baris `if (!p.parent_id) score += 0.2` memberi skor ke SEMUA produk induk walau tak cocok → `filter(score>0)` meloloskan semua.
- FIX `src/mikoChat.ts`:
  - Bonus induk kini HANYA bila sudah ada kecocokan nyata: `if (score > 0 && !p.parent_id) score += 0.2`.
  - Pencocokan kini terhadap `haystack(p)` = nama produk + nama SEMUA variasinya (dukung "induk/variasi mengandung kata").
  - Fuzzy DIKETATKAN: substring token match sebagai utama; Levenshtein hanya FALLBACK saat hasil ketat KOSONG, khusus token panjang (>=4) dengan jarak edit <=1 (mis. "trigu"→"terigu"). Tidak lagi mencocokkan kode/angka acak.
  - `searchProductsByName` tetap pakai findByName (kini ketat).
- `app/(tabs)/cek-harga.tsx`:
  - Tak ada hasil → TIDAK menampilkan seluruh DB. Muncul layar "Belum Ketemu" + pesan Miko + tombol "Coba Cari Lagi" (backToScan) & "Tampilkan Semua Produk" (`showAllProducts`: semua produk urut nama, dibatasi 200 demi performa). State `noResultQuery`. Auto-reset 15 dtk.
  - FIX overlap: tombol keluar kios (kiosk-back, absolute kiri-atas) DISEMBUNYIKAN saat layar pilihan/belum-ketemu aktif (searchResults||varProduct||noResultQuery) agar tak menumpuk tombol back header (pick-back). 
- DIVERIFIKASI (screenshot preview): "terigu"→2 produk terigu saja; "gula"→9 produk gula relevan; "qwertyxx"→layar Belum Ketemu + 2 tombol; "Tampilkan Semua Produk"→200 produk urut. Data DB TIDAK diubah (hanya algoritma filter). Lint clean (1 warning lama).
- CATATAN: FRONTEND-only → user REDEPLOY. Relasi Induk→Variasi→Harga tetap utuh.

## Session Log (fork, PRODUCTION) — KUNCI PIN ADMIN untuk kios Cek Harga + hapus tombol Tanya Miko
- Tujuan: HP di dinding sebagai kios pelanggan; tidak bisa keluar Cek Harga tanpa PIN Admin. Fitur lain tidak diubah.
- Paket: `expo-crypto@15.0.9` (baru) + `expo-secure-store` (sudah ada).
- BARU `src/adminPin.ts`: simpan PIN AMAN & TIDAK plaintext → hash SHA-256(salt+pin). Device: SecureStore (Keystore/Keychain). Web preview: fallback AsyncStorage (agar bisa diuji). API: `hasAdminPin`, `setAdminPin`, `verifyAdminPin`.
- `app/(tabs)/cek-harga.tsx`:
  - Setup pertama (belum ada PIN) → Modal "Buat PIN Admin" (2 input: buat + konfirmasi, 4–6 angka, secureTextEntry numeric). "Simpan PIN" → setAdminPin → tidak diminta lagi. Ada "Nanti saja (keluar)" → router.replace('/') agar admin tak terjebak.
  - Tombol back kios (kiri-atas) `onBack` kini BUKAN keluar langsung → buka Modal peringatan + PIN.
  - BackHandler (Android) di-intercept via useFocusEffect → selalu return true (blokir keluar default), buka Modal keluar. (Hanya jalan di APK Android, bukan web.)
  - Modal Keluar: teks peringatan persis permintaan ("...dibuat dan dirancang oleh Mas Bagus..."), input PIN, tombol Batal (tetap di kios) & Keluar (verify → benar: router.replace('/'); salah: "PIN salah." tetap di kios).
  - HAPUS tombol "TANYA MIKO" (chat/sales AI kini tak terjangkau dari kios; kode chat masih ada namun dorman — openChat unused warning, tidak mengganggu). Pencarian ketik tetap ada.
- BARU `app/admin-pin.tsx` (modal, terdaftar di `_layout.tsx`): Ubah/atur PIN Admin. Bila PIN ada → minta PIN lama dulu, lalu PIN baru + konfirmasi. Diakses via ikon gembok baru di header Riwayat (`riwayat-admin-pin`).
- DIVERIFIKASI (screenshot preview, 1 sesi): buat PIN 1234 → masuk kios; back → modal peringatan+PIN; PIN salah(9999) → tetap di kios; Batal → tetap; PIN benar(1234) → keluar ke Transaksi; setelah dibuat tak minta buat lagi (dalam sesi yang sama). Catatan: tiap panggilan screenshot = browser/localStorage baru → modal buat muncul lagi (artefak web saja; di HP SecureStore permanen). Lint clean (2 warning lama tak berbahaya).
- CATATAN: BackHandler Android hanya efektif di APK (bukan preview web). FRONTEND-only → user REDEPLOY & build APK untuk uji penuh (termasuk gesture/tombol back Android). Fitur Kasir/Cek Harga/scan/pencarian/varian/suara Miko/Import-Restore/DB TIDAK diubah.

## Session Log — Ganti note petunjuk Cek Harga
- `cek-harga.tsx` scanNote diganti jadi 4 baris besar & ramah (persis permintaan): "👋 Mau cek harga?" / "📱 Ada barcode? Arahkan ke scanner." / "⌨️ Tidak ada barcode? Ketik nama barang." / "Miko akan membantu menemukan harga untuk Kakak. 😊". Style dibesarkan (title xl, baris lg, tengah). Diverifikasi screenshot. FRONTEND-only → redeploy.

## Session Log — Fitur "Rapikan Item Produk" (multi-select hapus massal) di Produk
- `app/(tabs)/produk.tsx`: mode Rapikan.
  - Tombol ikon "checkmark-done" di header (produk-tidy-button) → masuk mode seleksi; header berubah jadi "N dipilih" + tombol "Selesai" (exit).
  - Toolbar: "Pilih Semua" (produk-select-all, memilih semua hasil filter), "Batalkan Semua" (produk-clear-all), jumlah terpilih.
  - Baris produk: checkbox (checkbox/square-outline), tap toggle (bukan edit), menu titik-tiga disembunyikan, kartu ter-highlight saat dipilih. Seleksi via Set<string> (ringan untuk banyak produk; FlatList tetap virtualized).
  - Bar bawah "Hapus N Produk" (produk-delete-selected) muncul bila ada yang dipilih.
  - Modal konfirmasi: "Hapus N produk yang dipilih?" + PERINGATAN bila ada produk terpilih yang punya variasi/turunan ("...Menghapus produk induk dapat menghapus variasinya juga. Lanjutkan?") + catatan "Hanya menghapus dari data aplikasi. File backup Kasir asli tidak terpengaruh." + tombol Batal / Hapus (dengan loading).
  - `doBulkDelete`: hapus induk terpilih + anak turunannya (childrenByParent, agar tak yatim) via `api.deleteProduct` (DB lokal saja). Setelah selesai reload + toast "N produk dihapus. Sisa X produk." + keluar mode seleksi.
  - Pencarian produk tetap aktif di mode Rapikan; hanya menghapus yang dicentang; harga/stok/barcode/variasi produk lain tidak diubah; file backup tidak disentuh.
- DIVERIFIKASI (screenshot preview): pilih 2 → bar "Hapus 2 Produk" & "2 dipilih"; konfirmasi tampil dgn peringatan variasi + catatan backup; Batal tetap di mode; Hapus → keluar mode + toast sisa. Lint clean.
- CATATAN: FRONTEND-only → user REDEPLOY.

## Session Log — Pengaturan "Suara Efek" (pilih bunyi + volume, untuk toko ramai)
- Keluhan: SFX (barang masuk/gagal/lunas) kurang terdengar saat ramai.
- BARU 9 file nada di assets/sounds/ (sfx_beep/ding/dingdong/chime/chaching/coin/blip/buzz/doublebuzz.wav) di-generate via python stdlib (amplitudo ~0.9, bersih, fade anti-klik).
- `src/sfx.ts` ditulis ulang: registry SFX_LIBRARY (9 bunyi), VOLUME_LEVELS {normal .6, keras .85, maks 1.0}, loadConfig() baca Settings (sfxVolume/sfxOk/sfxFail/sfxPaid). API: playOk/playFail/playPaid + preview(id,level) untuk tombol "Coba" + reload(). Default: keras + dingdong/buzz/chaching (sudah lebih keras & tegas dari sebelumnya).
- `src/types.ts` + DEFAULT_SETTINGS: tambah sfxVolume/sfxOk/sfxFail/sfxPaid.
- `toast.tsx` tetap memicu playOk (success) / playFail (error). `checkout.tsx` tambah `sfx.playPaid()` saat transaksi lunas (import sfx).
- BARU `app/pengaturan-suara.tsx` (modal, terdaftar _layout): pilih Tingkat Volume (Normal/Keras/Maksimal) + pilih bunyi tiap kejadian (Barang Masuk/Berhasil, Gagal/Tidak Masuk, Transaksi Lunas) dari 9 opsi + tombol "Coba" (preview). Simpan otomatis ke Settings + sfx.reload(). Diakses via ikon speaker di header Riwayat (riwayat-suara).
- DIVERIFIKASI (screenshot preview): layar tampil lengkap (volume, 3 kejadian, 9 bunyi, radio+Coba), pilih Maksimal + Koin tersimpan. SFX/preview HANYA berbunyi di HP/build (bukan web) — diberi toast pengingat.
- CATATAN: FRONTEND-only → user REDEPLOY. Tips toko ramai: pakai volume Maksimal + naikkan volume media HP / speaker Bluetooth.
