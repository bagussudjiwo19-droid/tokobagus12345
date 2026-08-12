import type { Settings, Transaction } from "./types";
import { rupiah, formatDateID, shortTxNo } from "./format";

const WIDTH = 32;

function center(text: string): string {
  const t = text.slice(0, WIDTH);
  const pad = Math.max(0, Math.floor((WIDTH - t.length) / 2));
  return " ".repeat(pad) + t;
}

function twoCols(left: string, right: string): string {
  const space = Math.max(1, WIDTH - left.length - right.length);
  if (left.length + right.length + 1 > WIDTH) {
    return left.slice(0, WIDTH - right.length - 1) + " " + right;
  }
  return left + " ".repeat(space) + right;
}

const LINE = "-".repeat(WIDTH);

// Plain-text receipt for a 58mm thermal printer (32 chars).
export function buildReceiptText(tx: Transaction, s: Settings): string {
  const out: string[] = [];
  const shortfall = Math.max(0, (tx.total || 0) - (tx.cash_paid || 0));
  if (shortfall > 0) {
    out.push(center("*** PEMBAYARAN KURANG ***"));
    out.push(center(rupiah(shortfall)));
    out.push(LINE);
  }
  if (s.showShopName && s.shopName) out.push(center(s.shopName.toUpperCase()));
  if (s.showAddress && s.address) {
    s.address.match(/.{1,32}/g)?.forEach((l) => out.push(center(l.trim())));
  }
  if (s.showPhone && s.phone) out.push(center(s.phone));
  out.push(LINE);
  if (s.showTxNumber) out.push(twoCols("No", shortTxNo(tx.id)));
  if (s.showDateTime) out.push(formatDateID(tx.created_at));
  if (s.showCashier && s.cashier) out.push(twoCols("Kasir", s.cashier));
  out.push(LINE);

  for (const it of tx.items) {
    if (s.showItemName) out.push(it.name.slice(0, WIDTH));
    const qtyPrice = `${it.quantity} ${it.unit || "pcs"} x ${rupiah(it.price)}`;
    out.push(twoCols("  " + (s.showQty ? qtyPrice : ""), rupiah(it.subtotal)));
  }
  out.push(LINE);
  const discount = tx.discount || 0;
  if (discount > 0) {
    if (s.showSubtotal) out.push(twoCols("Subtotal", rupiah(tx.total + discount)));
    if (s.showDiscount) out.push(twoCols("Diskon", "-" + rupiah(discount)));
  }
  if (s.showTotal) out.push(twoCols("TOTAL", rupiah(tx.total)));
  if (s.showCashPaid) out.push(twoCols("Tunai", rupiah(tx.cash_paid)));
  if (s.showChange) out.push(twoCols("Kembali", rupiah(tx.change)));
  out.push(LINE);
  if (s.showNote && s.note) out.push(center(s.note));
  if (s.showThanks && s.thanks) out.push(center(s.thanks));
  out.push("\n\n\n");
  return out.join("\n");
}
