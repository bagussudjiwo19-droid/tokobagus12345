import { useCallback, useRef } from "react";

type Opts = {
  /** Sinkronkan teks ke state pencarian manual (opsional). Dipanggil tiap karakter. */
  onChar?: (text: string) => void;
  /** true bila sedang mode scan (bukan ketik manual). Hanya saat scan, jeda memicu proses. */
  isScanMode?: () => boolean;
  /** Jeda (ms) tanpa karakter baru → dianggap scan selesai (fallback bila scanner tanpa ENTER). */
  pauseMs?: number;
};

/**
 * Penerimaan input scanner barcode Bluetooth yang andal.
 *
 * Scanner HID mengetik banyak karakter dengan sangat cepat, biasanya diakhiri ENTER.
 * Masalah pada TextInput terkontrol (`value` + `onChangeText`): setiap karakter memicu
 * setState + re-render yang dapat mereset teks native ke nilai state lama di tengah
 * pengiriman → barcode terpotong / karakter hilang / dianggap tidak ditemukan.
 *
 * Solusi:
 *  - Tampung karakter di ref (bukan state) → tidak ada re-render yang memotong input.
 *  - Gunakan TextInput UNCONTROLLED (tanpa prop `value`, pakai `defaultValue=""`) agar
 *    teks native tidak pernah di-reset saat scanner masih mengirim karakter.
 *  - Proses HANYA setelah scan selesai: ENTER (onSubmitEditing) ATAU jeda singkat.
 *  - Setelah diproses, kosongkan buffer (dan panggil inputRef.clear() di layar) → siap scan berikutnya.
 *
 * Tidak ada karakter yang dibuang; barcode panjang (12–14 digit) diterima utuh.
 * `onChar` tetap memperbarui state pencarian manual sehingga fitur ketik-cari tetap jalan.
 */
export function useBarcodeScan(onComplete: (code: string) => void, opts: Opts = {}) {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeRef = useRef(onComplete);
  const optsRef = useRef(opts);
  completeRef.current = onComplete;
  optsRef.current = opts;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const finish = useCallback(() => {
    clearTimer();
    const code = bufferRef.current.trim();
    bufferRef.current = "";
    if (code) completeRef.current(code);
  }, []);

  const onChangeText = useCallback(
    (text: string) => {
      // Native memberi SELURUH teks saat ini pada tiap perubahan → tidak ada karakter hilang.
      bufferRef.current = text;
      optsRef.current.onChar?.(text);
      clearTimer();
      const scanMode = optsRef.current.isScanMode ? optsRef.current.isScanMode() : true;
      // Hanya saat mode scan: jeda memicu proses otomatis. Saat ketik manual, jangan
      // memproses otomatis agar pencarian manual tidak dianggap barcode.
      // Ambang 300ms: cukup lama untuk menahan jitter Bluetooth di tengah scan
      // (mencegah barcode terpotong → "tidak ditemukan"), tetap terasa instan
      // karena mayoritas scanner diakhiri ENTER (langsung diproses via onSubmitEditing).
      if (scanMode) timerRef.current = setTimeout(finish, optsRef.current.pauseMs ?? 300);
    },
    [finish],
  );

  // ENTER dari scanner (atau tombol enter manual) → langsung proses barcode lengkap.
  const onSubmitEditing = useCallback(() => finish(), [finish]);

  const reset = useCallback(() => {
    clearTimer();
    bufferRef.current = "";
  }, []);

  return { onChangeText, onSubmitEditing, reset };
}
