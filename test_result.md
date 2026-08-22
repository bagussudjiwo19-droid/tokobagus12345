#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Optimalkan performa aplikasi POS Toko Bagus (ringan, cepat, responsif di HP RAM 4GB) tanpa mengubah fungsi. Fokus: list produk 2262 item, pencarian, scan barcode, riwayat, transaksi. Perubahan hanya optimasi (tidak ubah logika)."

frontend:
  - task: "Produk: list virtualisasi + pencarian (perf optimization)"
    implemented: true
    working: "NA"
    file: "app/(tabs)/produk.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Optimasi: useDeferredValue untuk filter, React.memo row (ProdukRow), getItemLayout, removeClippedSubviews/initialNumToRender/maxToRenderPerBatch/windowSize, dan reload hanya jika products kosong (mutasi tetap reload eksplisit). Perlu verifikasi: list tampil, search 'kopi' memfilter, tap row buka form, menu (...) buka bottom sheet, scan submit input barcode valid menampilkan kartu HASIL SCAN + clear."
  - task: "Cari (Transaksi & Cek Harga price mode): filter + list perf"
    implemented: true
    working: "NA"
    file: "app/cari.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Optimasi: useDeferredValue filter + FlatList perf props. Verifikasi: dari Transaksi > Cari Barang, ketik 'mitubaby', tap item → tertambah ke keranjang & kembali ke Transaksi; tombol Hapus Permanen + konfirmasi tetap berfungsi; dari Cek Harga > Cari Produk Manual, pilih item → kembali ke Cek Harga menampilkan nama+harga."
  - task: "Riwayat: list perf props (no logic change)"
    implemented: true
    working: "NA"
    file: "app/(tabs)/riwayat.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Tambah removeClippedSubviews/initialNumToRender/maxToRenderPerBatch/windowSize. Verifikasi: list transaksi tampil, tap row buka detail (struk), tombol Edit Transaksi buka modal edit."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1

test_plan:
  current_focus:
    - "Produk: list virtualisasi + pencarian (perf optimization)"
    - "Cari (Transaksi & Cek Harga price mode): filter + list perf"
    - "Riwayat: list perf props (no logic change)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "PEMERIKSAAN AKHIR MENYELURUH (QA regression, no new features). Tolong uji BACKEND + FRONTEND untuk seluruh alur POS. Base URL: https://app-audit-preview.preview.emergentagent.com. Data: ~2262 produk, ~104 transaksi. Barcode valid contoh: 8992745550396 (produk '1 mitubaby tisu basah', non-grosir/hitam), 8992959508312 ('3 swetty silver xl 2500' grosir/hijau). FOKUS UJI:\n(1) Transaksi: scan-mode-input terima barcode (ketik barcode + Enter) → item masuk keranjang + toast hijau; Cari Barang (cari-barang-button) tambah item; edit harga sementara (edit-price-*) & manual item (Tambah Item); qty edit via cart-qty-* (ketik) + cart-inc-*/cart-dec-*; hapus item konfirmasi (cart-remove-*); checkout (Bayar) → saran nominal → bayar pas/lebih (kembalian) & bayar kurang (change negatif, tidak gagal); toast sukses ✓ hijau, gagal ✕ merah.\n(2) Produk: list virtualisasi render; search manual (toggle produk-keyboard-toggle → ketik) filter; tap row buka form; menu (...) produk-menu-* sheet; scan barcode via produk-search-input Enter → kartu HASIL SCAN (produk-scan-result) + field clear; Tambah Produk stok default 999 (form-stock) & variasi baru stok 999 (form-add-variation → form-var-stock-0); Hapus Permanen dari Cari dengan konfirmasi TIDAK menghapus transaksi lama.\n(3) Cek Harga: TIDAK menampilkan stok; scan cekharga-scan-input → cekharga-result nama+harga; countdown 15s; Cari Produk Manual (cekharga-search) pilih → balik ke Cek Harga tampil harga.\n(4) Riwayat: list render; tap row detail struk (receipt-preview); Edit Transaksi (riwayat-edit) modal edit-save → ubah qty (edit-inc-0) → simpan → transaksi SAMA (id & tanggal asli), stok direkonsiliasi; Bagikan (riwayat-share) & Cetak (riwayat-print) tidak crash.\n(5) Struk: PEMBAYARAN KURANG hanya muncul di struk saat bayar kurang; total/tunai/kembali benar.\n(6) BACKEND: GET/POST/PUT/DELETE /api/products, GET/POST/PUT /api/transactions (update tidak buat baru + stok rekonsiliasi + created_at dipertahankan), GET/PUT /api/settings (voiceChange default true), GET /api/backup/export lengkap, POST /api/backup/import AMAN (validasi, dedupe, tidak hapus data lama saat file rusak → 400 pesan Indonesia).\nCATATAN native (TIDAK bisa diuji di web, jangan tandai gagal): pencetakan fisik printer Bluetooth, penindasan keyboard scan, suara TTS kembalian. Laporkan bug apa pun (kecil/besar)."
  - agent: "main"
    message: "TWO NEW FEATURES to verify. (A) DISKON: Transaksi -> Bayar (pay step) has Diskon input (testID checkout-discount-input); entering it reduces Total (total=subtotal-discount) and shows caption; after completing, receipt-preview shows Subtotal & Diskon then TOTAL when discount>0. Backend POST/PUT /api/transactions store 'discount'. (B) BELUM LUNAS: In Riwayat, tx with cash_paid<total shows red 'BELUM LUNAS' badge (riwayat-unpaid-<id>), red border, 'Kurang RpX'; detail sheet has 'Lunasi Sisa RpX' (riwayat-lunasi) -> PUT cash_paid=total, change=0, keeps items/stock/date/discount -> badge disappears. Create a partial-payment tx via checkout (cash<total) then verify badge + Lunasi. Native items (printer/keyboard-suppression/TTS) must NOT be marked failed. Backend already manually verified (discount persist + lunasi same id/created_at). Verify UI end-to-end + no regression in checkout/riwayat/edit-transaksi."
  - agent: "main"
    message: "FITUR BARU: 'Cetak Struk dari Gambar' (Bukti Pembayaran via OCR). Uji BACKEND + FRONTEND. App tanpa auth. Base URL dari frontend/.env EXPO_PUBLIC_BACKEND_URL.\n\nBACKEND:\n(1) POST /api/ocr/bukti — body {image_base64, mime_type}. Baca file /app/image_testing.md untuk aturan gambar (WAJIB base64 PNG/JPEG dengan teks nyata). Buat gambar bukti pembayaran sintetis berisi teks (mis. 'ShopeePay', 'Rp75.000', 'Kepada TOKO BAGUS', 'Tanggal 22 Agustus 2026', 'Waktu 14:35', 'No. Referensi 2026082212345678'). Verifikasi respons JSON {fields:{method,recipient,amount,date,time,ref}} tiap field {value, confident}. amount harus bilangan bulat (75000). (2) Gambar yang SENGAJA tak lengkap (tanpa nominal/ref/waktu) → field tsb harus value=null & confident=false (JANGAN menebak). (3) Sync: POST /api/sync/push dengan body {store:'TEST-OCR-1', bukti:[{id:'b1',doc:{id:'b1',method:'GoPay',amount:5000,recipient:'X',date:'',time:'',ref:'',customer:'Budi',created_at:'2026-08-22T00:00:00Z',updated_at:'2026-08-22T00:00:00Z'},updated_at: <ms>}]} → lalu GET /api/sync/pull?store=TEST-OCR-1&since=0 harus mengembalikan array 'bukti' berisi b1.\n\nFRONTEND (web preview):\n(4) Buka tab Riwayat → ada ikon kamera baru (testID riwayat-bukti-scan) di baris ikon → tap membuka layar 'Baca Bukti Pembayaran' (route /baca-bukti).\n(5) Di /baca-bukti (tanpa gambar): isi manual field — Metode (bukti-method)='DANA', Nominal (bukti-amount)='25000' (harus tampil bantuan 'Rp25.000'), Penerima (bukti-recipient)='Toko Uji', Tanggal (bukti-date)='22 Agu 2026', Waktu (bukti-time)='10:00', No.Ref (bukti-ref)='REF123', Nama Pelanggan (bukti-customer)='Sari'. Tekan 'Simpan & Kembali ke Transaksi' (bukti-finish) → toast sukses + pindah ke tab Transaksi.\n(6) Kembali ke tab Riwayat → tap chip 'Bukti Bayar' (riwayat-filter-bukti) → muncul kartu bukti (badge 'BUKTI', 'Rp25.000', metode 'DANA', 'Sari'). PENTING: kartu ringkasan omzet TIDAK berubah oleh bukti (bukti tidak masuk omzet). Ganti filter periode ke 'Semua' bila perlu agar bukti tampil.\n(7) Tap kartu bukti → membuka /baca-bukti dengan data ter-prefill (untuk cetak ulang). Long-press kartu bukti → dialog Hapus.\n\nNATIVE-ONLY (JANGAN tandai gagal di web): Cetak Bluetooth (bukti-print), Simpan Gambar PNG (bukti-save-img), Simpan PDF (bukti-save-pdf), Bagikan (bukti-share), pilih dari galeri (file picker), dan OCR via gambar galeri. Cukup pastikan tombol ada & tidak crash. Fokus: endpoint OCR (backend) + alur catat manual ke Riwayat + tampil sebagai Bukti terpisah + tidak masuk omzet."
