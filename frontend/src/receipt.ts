import type { Settings, Transaction } from "./types";
import { numberID, receiptDateTime, shortTxNo } from "./format";

// Lebar kertas thermal 58mm ≈ 32 karakter. Beri margin kiri 1 karakter agar
// tulisan sedikit bergeser ke kanan (tidak terkena cetakan/stempel di sisi kiri
// kertas). Semua kolom dihitung dalam CW=31 lalu diberi 1 spasi di depan → tetap
// dalam 32 karakter, teks tidak keluar dari lebar kertas.
const WIDTH = 32;
const MARGIN = " ";
const CW = WIDTH - MARGIN.length; // 31

function center(text: string): string {
  const t = text.slice(0, CW);
  const pad = Math.max(0, Math.floor((CW - t.length) / 2));
  return MARGIN + " ".repeat(pad) + t;
}

function line(text: string): string {
  return MARGIN + text.slice(0, CW);
}

// Label di kiri, nominal di kanan. Bila terlalu panjang, potong sisi kiri agar
// tidak bertabrakan dengan nominal kanan & tidak melebihi lebar kertas.
function twoCols(left: string, right: string): string {
  const r = right;
  if (left.length + r.length + 1 > CW) {
    const cut = left.slice(0, Math.max(0, CW - r.length - 1));
    return MARGIN + cut + " " + r;
  }
  const space = Math.max(1, CW - left.length - r.length);
  return MARGIN + left + " ".repeat(space) + r;
}

const LINE = MARGIN + "-".repeat(CW);

const qtyStr = (q: number) => (Number.isInteger(q) ? String(q) : String(q));

// Struk teks-murni untuk printer thermal 58mm (32 karakter). Seluruh isi dikirim
// sebagai teks (tanpa gambar/latar).
export function buildReceiptText(tx: Transaction, s: Settings): string {
  const out: string[] = [];

  // Kepala: nama toko (rata tengah) + alamat (rata tengah) + telepon
  if (s.showShopName && s.shopName) out.push(center(s.shopName.toUpperCase()));
  if (s.showAddress && s.address) {
    s.address.match(new RegExp(`.{1,${CW}}`, "g"))?.forEach((l) => out.push(center(l.trim())));
  }
  if (s.showPhone && s.phone) out.push(center(s.phone));
  out.push(LINE);

  // Info transaksi: label kiri, nilai kanan
  if (s.showTxNumber) out.push(twoCols("Id Transaksi", shortTxNo(tx.id)));
  if (s.showDateTime) out.push(twoCols("Tanggal", receiptDateTime(tx.created_at)));
  if (s.showCashier && s.cashier) out.push(twoCols("Kasir", s.cashier));
  out.push(LINE);

  // Daftar barang: nama+total pada baris 1, "qty x harga" pada baris 2
  for (const it of tx.items) {
    const unit = (it.unit || "").trim();
    const suffix = unit && unit.toLowerCase() !== "pcs" ? `, ${unit}` : "";
    const name = (s.showItemName ? it.name : "") + suffix;
    out.push(twoCols(name, numberID(it.subtotal)));
    if (s.showQty || s.showUnitPrice) {
      out.push(line(`  ${qtyStr(it.quantity)} x ${numberID(it.price)}`));
    }
  }
  out.push(LINE);

  // Ringkasan pembayaran
  const discount = tx.discount || 0;
  if (discount > 0) {
    if (s.showSubtotal) out.push(twoCols("Subtotal", numberID(tx.total + discount)));
    if (s.showDiscount) out.push(twoCols("Diskon", "-" + numberID(discount)));
  }
  if (s.showTotal) out.push(twoCols("Total", numberID(tx.total)));
  if (s.showCashPaid) out.push(twoCols("Dibayar", numberID(tx.cash_paid)));
  const shortfall = Math.max(0, (tx.total || 0) - (tx.cash_paid || 0));
  if (shortfall > 0) {
    out.push(twoCols("Pembayaran Kurang", numberID(shortfall)));
  } else if (s.showChange) {
    out.push(twoCols("Kembalian", numberID(tx.change)));
  }
  out.push(LINE);

  if (s.showNote && s.note) out.push(center(s.note));
  if (s.showThanks && s.thanks) out.push(center(s.thanks));
  out.push("\n\n\n");
  return out.join("\n");
}
