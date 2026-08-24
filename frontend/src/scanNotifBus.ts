// Bus kecil untuk notifikasi "barang ditambahkan" yang tampil LOKAL di kolom
// Scan Barcode (layar Transaksi). Dipakai oleh layar lain (Cari Barang, Tambah
// Item manual) agar—setelah menambah & kembali ke Transaksi—notif muncul di
// tempat yang sama & konsisten (bukan toast global di atas tombol pintasan).
export type ScanNotif = { text: string; type: "success" | "error" };
type Listener = (n: ScanNotif) => void;

const listeners = new Set<Listener>();

export const scanNotifBus = {
  emit(n: ScanNotif) {
    listeners.forEach((l) => l(n));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
