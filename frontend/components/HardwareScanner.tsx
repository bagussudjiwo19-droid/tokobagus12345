import { useEffect, useRef } from "react";
import { useKeyEventListener } from "expo-key-event";

type Props = {
  /** Aktif hanya saat layar Transaksi fokus (agar tak menangkap scan di layar lain). */
  enabled: boolean;
  /** Naikkan nilai ini untuk MEMINTA fokus ulang ke view penangkap (setelah popup/tombol). */
  refocusSignal?: number;
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
  if (character && character.length === 1) {
    const cc = character.charCodeAt(0);
    if (cc >= 32) return character; // abaikan karakter kontrol (Enter/Tab/dll)
  }
  if (!uniKey) return null;
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
 * Kenapa: scanner HID mengetik seperti keyboard. Native `ExpoKeyEventView` HANYA
 * menerima tombol saat IA yang FOKUS. Karena itu di layar Transaksi kita TIDAK
 * boleh memfokuskan TextInput (akan mencuri fokus → key event tak sampai). View
 * ini di-`startListening` (yang otomatis requestFocus) saat layar aktif, dan
 * di-`stopListening` saat tidak aktif. Setelah popup/tombol menutup, parent
 * menaikkan `refocusSignal` → kita stop+start agar view merebut fokus lagi.
 *
 * Karakter di-buffer di ref (tanpa re-render). "Enter" = scan selesai → proses.
 * Fallback jeda 220ms utk scanner tanpa Enter. Karakter diambil dari
 * event.character / pemetaan kode (LIHAT keyToChar) — TIDAK memakai k.length===1.
 *
 * Catatan: expo-key-event butuh build native (tidak jalan di Expo Go/web).
 * Versi web ada di HardwareScanner.web.tsx (no-op).
 */
export default function HardwareScanner({ enabled, refocusSignal = 0, onScan }: Props) {
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

  // listenOnMount:false → view penangkap TIDAK ditambahkan sampai kita panggil
  // startListening (mencegah view merebut fokus saat layar lain aktif).
  const { startListening, stopListening } = useKeyEventListener(
    (event: { key?: string; character?: string | null; eventType?: string }) => {
      if (!enabledRef.current) return;
      if (event?.eventType && event.eventType !== "press") return;
      if (isEnter(event?.key, event?.character)) { flush(); return; }
      const ch = keyToChar(event?.key, event?.character);
      if (ch) {
        bufRef.current += ch;
        clearTimer();
        timerRef.current = setTimeout(flush, 220);
      }
    },
    { listenOnMount: false },
  );

  // Aktif hanya saat layar Transaksi fokus → view penangkap dipasang & merebut fokus.
  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      stopListening();
      clearTimer();
      bufRef.current = "";
    }
    return () => { stopListening(); clearTimer(); bufRef.current = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Refokus setelah popup variasi / tombol Pintasan menutup ATAU setelah selesai
  // mengetik Jumlah (keyboard menutup). Karena animasi keyboard Android ~250-300ms
  // membuat requestFocus tunggal sering "tidak menempel", kita coba BEBERAPA KALI
  // (60/300/600ms) sampai view penangkap benar-benar memegang fokus lagi.
  useEffect(() => {
    if (!enabled || refocusSignal <= 0) return;
    stopListening();
    const timers = [60, 300, 600].map((d) =>
      setTimeout(() => { if (enabledRef.current) startListening(); }, d),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refocusSignal]);

  return null;
}
