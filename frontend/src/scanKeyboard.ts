import { useEffect } from "react";
import { Keyboard, TextInput } from "react-native";

/**
 * Penjaga keyboard untuk kolom Mode Scan.
 * Jika keyboard HP tetap muncul otomatis (mis. saat scanner Bluetooth HID
 * aktif di sebagian perangkat Android) padahal sedang mode scan, keyboard
 * langsung disembunyikan lalu input difokuskan ulang. Karena input memakai
 * showSoftInputOnFocus={false} saat mode scan, fokus ulang TIDAK memunculkan
 * keyboard lagi sehingga scanner tetap aktif & siap menerima barcode berikutnya.
 *
 * kbdRef.current === true berarti user sengaja mengetik manual → keyboard
 * dibiarkan tampil.
 */
export function useHideScanKeyboard(
  inputRef: React.RefObject<TextInput | null>,
  kbdRef: React.MutableRefObject<boolean>,
) {
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (!kbdRef.current) {
        Keyboard.dismiss();
        setTimeout(() => inputRef.current?.focus(), 30);
      }
    });
    return () => sub.remove();
  }, [inputRef, kbdRef]);
}
