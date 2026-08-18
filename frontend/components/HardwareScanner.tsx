import { useEffect, useRef } from "react";
import { useKeyEventListener } from "expo-key-event";

type Props = {
  /** Aktif hanya saat layar Transaksi fokus (agar tak menangkap scan di layar lain). */
  enabled: boolean;
  /** Dipanggil dgn barcode lengkap saat scan selesai (Enter atau jeda). */
  onScan: (code: string) => void;
};

/**
 * Penerima scanner Bluetooth HID di level HARDWARE KEY EVENT (Android/iOS).
 *
 * Kenapa: scanner HID mengetik seperti keyboard. Pendekatan lama (TextInput
 * tersembunyi yang harus FOKUS) rapuh di HP — fokus bisa lepas → sebagian scan
 * hilang / "tidak ditemukan" sampai pindah halaman. Dengan menangkap key event
 * global, scanner terbaca TANPA bergantung pada fokus kolom sama sekali.
 *
 * Karakter di-buffer di ref (tanpa re-render). "Enter" = scan selesai → proses.
 * Fallback jeda 250ms utk scanner tanpa Enter. Hanya karakter tunggal (angka/
 * huruf/simbol) yang diambil; tombol modifier (Shift/Ctrl/dll) diabaikan.
 *
 * Catatan: expo-key-event butuh build native (tidak jalan di Expo Go/web).
 * Versi web ada di HardwareScanner.web.tsx (no-op).
 */
export default function HardwareScanner({ enabled, onScan }: Props) {
  const bufRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const onScanRef = useRef(onScan);
  enabledRef.current = enabled;
  onScanRef.current = onScan;

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const flush = () => {
    clearTimer();
    const code = bufRef.current.trim();
    bufRef.current = "";
    if (code) onScanRef.current(code);
  };

  useKeyEventListener(
    (event: { key?: string }) => {
      if (!enabledRef.current) return;
      const k = event?.key;
      if (!k) return;
      if (k === "Enter" || k === "\n" || k === "\r") { flush(); return; }
      // Hanya karakter tunggal yang jadi bagian barcode; abaikan tombol khusus.
      if (k.length === 1) {
        bufRef.current += k;
        clearTimer();
        timerRef.current = setTimeout(flush, 250);
      }
    },
    { listenOnMount: true },
  );

  // Bersihkan timer & buffer saat layar tidak aktif atau unmount.
  useEffect(() => {
    if (!enabled) { clearTimer(); bufRef.current = ""; }
    return () => { clearTimer(); bufRef.current = ""; };
  }, [enabled]);

  return null;
}
