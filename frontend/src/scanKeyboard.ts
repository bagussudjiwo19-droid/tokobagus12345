import { useEffect } from "react";
import { Keyboard, TextInput } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * Penjaga keyboard untuk kolom Mode Scan (perilaku scanner kasir fisik).
 *
 * Scanner Bluetooth HID mengirim keystroke ke input yang sedang fokus, jadi
 * input HARUS tetap fokus agar barcode tertangkap. Namun keyboard HP TIDAK
 * boleh muncul. Karena mode scan memakai showSoftInputOnFocus={false},
 * fokus (termasuk fokus otomatis yang senyap) tidak memunculkan keyboard.
 *
 * Jika keyboard tetap muncul karena sistem Android atau event koneksi scanner
 * Bluetooth, listener di bawah SEGERA menyembunyikannya. Fokus dipertahankan/
 * dipulihkan (tanpa memicu keyboard lagi) sehingga scanner tetap aktif & siap
 * menerima barcode berikutnya. Tidak terjadi loop karena refokus dilakukan
 * dengan showSoftInputOnFocus={false}.
 *
 * kbdRef.current === true berarti user sengaja mengetik manual → keyboard
 * dibiarkan tampil (tidak diganggu).
 *
 * PENTING: penindasan keyboard HANYA aktif saat layar ini benar-benar tampil
 * (useIsFocused). Layar tab tetap ter-mount di balik modal (Tambah Produk,
 * Checkout, dll) & di antar-tab; tanpa penjaga fokus, listener global di layar
 * yang tersembunyi akan ikut menutup keyboard di layar lain → keyboard tidak
 * pernah muncul. Dengan gating fokus, hanya layar aktif yang menekan keyboard.
 */
export function useHideScanKeyboard(
  inputRef: React.RefObject<TextInput | null>,
  kbdRef: React.MutableRefObject<boolean>,
) {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return; // layar tidak tampil → jangan ganggu keyboard di layar lain
    const hide = () => {
      if (kbdRef.current) return; // user memang sedang mengetik manual
      // Hanya tekan keyboard bila input SCAN yang sedang fokus (perilaku scanner).
      // Bila input LAIN fokus (kolom di bottom sheet, form, dll) → biarkan
      // keyboard-nya tampil, jangan diganggu.
      if (!inputRef.current?.isFocused()) return;
      Keyboard.dismiss();
      // Pulihkan fokus (senyap) hanya bila input kehilangan fokus,
      // agar scanner tetap menerima barcode berikutnya. Tanpa loop.
      setTimeout(() => {
        if (!kbdRef.current && !inputRef.current?.isFocused()) {
          inputRef.current?.focus();
        }
      }, 30);
    };
    const s1 = Keyboard.addListener("keyboardDidShow", hide);
    const s2 = Keyboard.addListener("keyboardWillShow", hide);
    return () => { s1.remove(); s2.remove(); };
  }, [inputRef, kbdRef, focused]);
}
