// Bus kejadian sederhana agar layar mana pun bisa memberi tahu Miko untuk
// merespons konteks (scan gagal, pembayaran, kembalian, printer, error, dll).
export type MikoEvent =
  | { type: "not_found" }
  | { type: "pay_ok" }
  | { type: "change"; amount: number }
  | { type: "print_ok" }
  | { type: "print_fail" }
  | { type: "error" }
  | { type: "price_changed" }
  | { type: "backup_ok" }
  | { type: "restore_ok" }
  | { type: "low_stock" }
  | { type: "price_found" }
  | { type: "product_saved" }
  | { type: "product_deleted" }
  | { type: "say"; text: string; pose?: string }
  | { type: "backup_reminder" }
  | { type: "speak_start"; ms?: number }
  | { type: "speak_end" }
  | { type: "miko_state"; state: MikoState }
  | { type: "scan_ready" };

// State animasi karakter Miko (rig 2.5D) untuk kios Cek Harga.
export type MikoState =
  | "IDLE" | "TALK" | "THINKING" | "HAPPY" | "CONFUSED"
  | "SAD" | "SURPRISED" | "LAUGH" | "POINT" | "SALES_EXPLAIN";

type Listener = (e: MikoEvent) => void;
const listeners = new Set<Listener>();

export const mikoBus = {
  emit(e: MikoEvent) {
    listeners.forEach((fn) => {
      try { fn(e); } catch { /* ignore */ }
    });
  },
  on(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
