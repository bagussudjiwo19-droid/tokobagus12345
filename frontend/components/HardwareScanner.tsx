import { useEffect, useRef } from "react";
import { useKeyEventListener } from "expo-key-event";

type Props = {
  /** Aktif hanya saat layar Transaksi fokus (agar tak menangkap scan di layar lain). */
  enabled: boolean;
  /** Dipanggil dgn barcode lengkap saat scan selesai (Enter atau jeda). */
  onScan: (code: string) => void;
};

/**
 * Terjemahkan kode key GAYA-WEB (yang dikirim expo-key-event di Android/iOS)
 * menjadi karakter mentah. PENTING: di Android event.key BUKAN karakter tunggal
 * melainkan kode seperti "Digit8", "KeyA", "Enter", "Numpad5". Karena itu kita
 * TIDAK boleh menyaring dengan k.length===1 (dulu ini membuang SEMUA digit →
 * barcode tak pernah terbaca). Kita utamakan event.character (unicode asli dari
 * native), lalu fallback ke pemetaan kode ini.
 */
function keyToChar(uniKey: string | undefined, character: string | null | undefined): string | null {
  // 1) Utamakan karakter asli dari native (sudah memperhitungkan shift/layout).
  if (character && character.length === 1) {
    const cc = character.charCodeAt(0);
    // Abaikan karakter kontrol (Enter/Tab/dll) — ditangani terpisah.
    if (cc >= 32) return character;
  }
  if (!uniKey) return null;
  // 2) Fallback: derivasi dari kode gaya-web.
  if (uniKey.length === 1) return uniKey; // sudah berupa karakter tunggal (mis. web)
  if (uniKey.startsWith("Digit")) return uniKey.slice(5); // Digit8 → "8"
  if (uniKey.startsWith("Numpad")) {
    const rest = uniKey.slice(6);
    if (/^\d$/.test(rest)) return rest; // Numpad5 → "5"
    const map: Record<string, string> = { Add: "+", Subtract: "-", Multiply: "*", Divide: "/", Decimal: ".", Equal: "=" };
    return map[rest] ?? null;
  }
  if (uniKey.startsWith("Key") && uniKey.length === 4) return uniKey.charAt(3).toLowerCase(); // KeyA → "a"
  const sym: Record<string, string> = {
    Minus: "-", Equal: "=", Period: ".", Comma: ",", Slash: "/", Backslash: "\\",
    Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backquote: "`", Space: " ",
  };
  return sym[uniKey] ?? null;
}

function isEnter(uniKey: string | undefined, character: string | null | undefined): boolean {
  if (uniKey === "Enter" || uniKey === "NumpadEnter") return true;
  if (character === "\n" || character === "\r") return true;
  return false;
}

/**
 * Penerima scanner Bluetooth HID di level HARDWARE KEY EVENT (Android/iOS).
 *
 * Kenapa: scanner HID mengetik seperti keyboard. Pendekatan lama (TextInput
 * tersembunyi yang harus FOKUS) rapuh di HP — fokus bisa lepas → sebagian scan
 * hilang. Dengan menangkap key event global, scanner terbaca TANPA bergantung
 * pada fokus kolom sama sekali.
 *
 * Karakter di-buffer di ref (tanpa re-render). "Enter" = scan selesai → proses.
 * Fallback jeda 220ms utk scanner tanpa Enter. Karakter diambil dari
 * event.character / pemetaan kode (LIHAT keyToChar) — TIDAK memakai k.length===1.
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
    (event: { key?: string; character?: string | null; eventType?: string }) => {
      if (!enabledRef.current) return;
      // Hanya proses saat tombol DITEKAN (abaikan release bila suatu saat aktif).
      if (event?.eventType && event.eventType !== "press") return;
      if (isEnter(event?.key, event?.character)) { flush(); return; }
      const ch = keyToChar(event?.key, event?.character);
      if (ch) {
        bufRef.current += ch;
        clearTimer();
        timerRef.current = setTimeout(flush, 220);
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
