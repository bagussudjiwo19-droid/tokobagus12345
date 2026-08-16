// ============================================================================
// KLIEN AI MIKO (ONLINE). Memanggil backend /api/miko/chat (Gemini 3 Flash via
// Emergent key). Bila internet/server tak ada → melempar error agar pemanggil
// otomatis jatuh ke mesin OFFLINE (mikoAsk). Fakta produk dikirim dari DB lokal.
// ============================================================================
import type { MikoFact } from "./mikoChat";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "") + "/api";

export type MikoTurn = { role: "user" | "miko"; text: string };

export async function askMikoOnline(args: {
  sessionId: string;
  message: string;
  facts: MikoFact[];
  history: MikoTurn[];
  shopName?: string;
  timeoutMs?: number;
}): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 12000);
  try {
    const res = await fetch(`${BASE}/miko/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        session_id: args.sessionId,
        message: args.message,
        facts: args.facts,
        history: args.history,
        shop_name: args.shopName || null,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const reply = (data?.reply || "").trim();
    if (!reply) throw new Error("empty");
    return reply;
  } finally {
    clearTimeout(t);
  }
}
