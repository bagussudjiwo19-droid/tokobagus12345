import type { Settings, Transaction, Bukti } from "./types";
import { numberID, receiptDateTime, shortTxNo } from "./format";

// Lebar kertas thermal 58mm ≈ 32 karakter. Beri margin kiri 1 karakter agar
// tulisan sedikit bergeser ke kanan (tidak terkena cetakan/stempel di sisi kiri
// kertas). Semua kolom dihitung dalam CW=31 lalu diberi 1 spasi di depan → tetap
// dalam 32 karakter, teks tidak keluar dari lebar kertas.
const WIDTH = 32;
const MARGIN = " ";
const CW = WIDTH - MARGIN.length; // 31

// Perintah ESC/POS untuk printer thermal.
const ESC = "\x1B";
const C_CENTER = ESC + "\x61\x01"; // rata tengah (dilakukan oleh printer)
const C_LEFT = ESC + "\x61\x00"; // kembali rata kiri
const C_BIG_BOLD = ESC + "\x21\x18"; // dobel tinggi + tebal (nama toko)
const C_BOLD = ESC + "\x21\x08"; // tebal ukuran normal (judul agar muat 58mm)
const C_NORMAL = ESC + "\x21\x00"; // ukuran normal + tebal mati

function center(text: string): string {
  const t = text.slice(0, CW);
  const pad = Math.max(0, Math.floor((CW - t.length) / 2));
  return MARGIN + " ".repeat(pad) + t;
}

// Bungkus teks per KATA agar tidak terpotong di tengah kata (alamat rapi/cantik).
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.trim().split(/\s+/)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= width) cur += " " + w;
    else { lines.push(cur); cur = w; }
    while (cur.length > width) { lines.push(cur.slice(0, width)); cur = cur.slice(width); }
  }
  if (cur) lines.push(cur);
  return lines;
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

  // Kepala: NAMA TOKO besar & tebal (dobel tinggi, rata tengah oleh printer),
  // lalu ALAMAT (rata tengah, otomatis turun baris per kata → tidak terpotong)
  // + telepon. Kode reset (ukuran normal + rata kiri) diselipkan sebelum baris
  // berikutnya agar nama toko tetap tercetak besar & di tengah.
  let reset = "";
  if (s.showShopName && s.shopName) {
    out.push(C_CENTER + C_BIG_BOLD + s.shopName.toUpperCase());
    reset = C_NORMAL + C_LEFT;
  }
  if (s.showAddress && s.address) {
    wrapWords(s.address, CW).forEach((l) => { out.push(reset + center(l)); reset = ""; });
  }
  if (s.showPhone && s.phone) { out.push(reset + center(s.phone)); reset = ""; }
  out.push(reset + LINE);

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


// Struk versi teks WhatsApp (tanpa kode ESC/POS). Rapi dibaca di chat, memakai
// pengaturan tampilan struk yang sama (nama toko, item, diskon, total, dll).
export function buildReceiptWhatsApp(tx: Transaction, s: Settings): string {
  const L: string[] = [];
  if (s.showShopName && s.shopName) L.push(`*${s.shopName.toUpperCase()}*`);
  if (s.showAddress && s.address) L.push(s.address);
  if (s.showPhone && s.phone) L.push(s.phone);
  L.push("--------------------------------");
  if (s.showTxNumber) L.push(`Id Transaksi : ${shortTxNo(tx.id)}`);
  if (s.showDateTime) L.push(`Tanggal : ${receiptDateTime(tx.created_at)}`);
  if (s.showCashier && s.cashier) L.push(`Kasir : ${s.cashier}`);
  L.push("--------------------------------");
  for (const it of tx.items) {
    const unit = (it.unit || "").trim();
    const suffix = unit && unit.toLowerCase() !== "pcs" ? `, ${unit}` : "";
    const name = (s.showItemName ? it.name : "") + suffix;
    L.push(name);
    L.push(`  ${qtyStr(it.quantity)} x Rp${numberID(it.price)} = Rp${numberID(it.subtotal)}`);
  }
  L.push("--------------------------------");
  const discount = tx.discount || 0;
  if (discount > 0) {
    if (s.showSubtotal) L.push(`Subtotal : Rp${numberID(tx.total + discount)}`);
    if (s.showDiscount) L.push(`Diskon : -Rp${numberID(discount)}`);
  }
  if (s.showTotal) L.push(`*Total : Rp${numberID(tx.total)}*`);
  if (s.showCashPaid) L.push(`Dibayar : Rp${numberID(tx.cash_paid)}`);
  const shortfall = Math.max(0, (tx.total || 0) - (tx.cash_paid || 0));
  if (shortfall > 0) L.push(`Pembayaran Kurang : Rp${numberID(shortfall)}`);
  else if (s.showChange) L.push(`Kembalian : Rp${numberID(tx.change)}`);
  L.push("--------------------------------");
  if (s.showNote && s.note) L.push(s.note);
  if (s.showThanks && s.thanks) L.push(s.thanks);
  return L.join("\n");
}


const GS = "\x1D";

// ---------------- BUKTI PEMBAYARAN (SALINAN dari screenshot) ----------------
// Struk thermal 58mm untuk salinan bukti pembayaran hasil OCR. Judul teratas
// "BUKTI TRANSAKSI TOKO BAGUS". Data murni dari yang dibaca/diperiksa pengguna.
function labeledWrapped(label: string, value: string): string[] {
  const out = [line(label)];
  const v = (value || "-").trim() || "-";
  for (const w of wrapWords(v, CW - 2)) out.push(line("  " + w));
  return out;
}

export function buildBuktiReceiptText(b: Bukti, s: Settings): string {
  const L: string[] = [];
  L.push(C_CENTER + C_BIG_BOLD + center("BUKTI PEMBAYARAN").trimStart());
  L.push(center("TOKO BAGUS").trimStart() + C_NORMAL + C_LEFT);
  L.push(LINE);
  L.push(C_BOLD + twoCols("STATUS", (b.status || "BERHASIL")) + C_NORMAL);
  L.push(LINE);
  L.push(line("NOMINAL"));
  L.push(C_CENTER + C_BIG_BOLD + center("Rp" + numberID(b.amount || 0)).trimStart() + C_NORMAL + C_LEFT);
  L.push(LINE);
  L.push(twoCols("DARI", (b.sender_name || "-")));
  L.push(twoCols("BANK", (b.sender_bank || "-")));
  if (b.sender_account) L.push(...labeledWrapped("NO. TUJUAN :", b.sender_account));
  L.push(LINE);
  L.push(twoCols("KE", (b.recipient || "-")));
  if (b.recipient_username) L.push(twoCols("USERNAME", b.recipient_username));
  L.push(LINE);
  L.push(...labeledWrapped("METODE :", b.method || "-"));
  if (b.ref) L.push(...labeledWrapped("NO. REFERENSI :", b.ref));
  if (b.txno) L.push(...labeledWrapped("NO. TRANSAKSI :", b.txno));
  if (b.product) L.push(...labeledWrapped("PRODUK :", b.product));
  L.push(LINE);
  L.push(twoCols("TANGGAL", (b.date || "-")));
  L.push(twoCols("WAKTU", (b.time || "-")));
  L.push(LINE);
  L.push(C_CENTER + center("TERIMA KASIH").trimStart());
  L.push(center("TOKO BAGUS").trimStart() + C_LEFT);
  return L.join("\n") + "\n\n\n";
}

// Versi HTML untuk simpan PDF (ekspo-print). Tampilan mirip struk 58mm.
export function buildBuktiReceiptHTML(b: Bukti, s: Settings): string {
  const esc = (t: string) => (t || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const row = (k: string, v: string) => `<div class="row"><span>${esc(k)}</span><span class="v">${esc(v || "-")}</span></div>`;
  const opt = (k: string, v?: string) => (v && v.trim() ? row(k, v) : "");
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { margin: 6px; }
  * { font-family: 'Courier New', monospace; }
  body { width: 220px; margin: 0 auto; color: #000; }
  .c { text-align: center; }
  .title { font-weight: 700; font-size: 16px; text-align: center; line-height: 1.2; }
  .s { font-size: 11px; text-align:center; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
  .row span:first-child { font-weight: 700; }
  .row .v { text-align: right; max-width: 130px; word-break: break-word; font-weight: 400; }
  .st { display:flex; justify-content: space-between; font-weight: 700; font-size: 13px; }
  .amt { text-align:center; font-weight: 700; font-size: 18px; margin: 4px 0; }
</style></head><body>
  <div class="title">BUKTI PEMBAYARAN<br/>TOKO BAGUS</div>
  <hr/>
  <div class="st"><span>STATUS</span><span>${esc(b.status || "BERHASIL")}</span></div>
  <hr/>
  <div style="font-weight:700;font-size:12px;">NOMINAL</div>
  <div class="amt">Rp${numberID(b.amount || 0)}</div>
  <hr/>
  ${row("DARI", b.sender_name)}
  ${row("BANK", b.sender_bank)}
  ${opt("NO. TUJUAN", b.sender_account)}
  <hr/>
  ${row("KE", b.recipient)}
  ${opt("USERNAME", b.recipient_username)}
  <hr/>
  ${row("METODE", b.method)}
  ${opt("NO. REFERENSI", b.ref)}
  ${opt("NO. TRANSAKSI", b.txno)}
  ${opt("PRODUK", b.product)}
  <hr/>
  ${row("TANGGAL", b.date)}
  ${row("WAKTU", b.time)}
  <hr/>
  <div class="s">TERIMA KASIH<br/>TOKO BAGUS</div>
</body></html>`;
}



// Bangun perintah ESC/POS untuk mencetak label BARCODE produk sebanyak `qty`.
// Tiap label: nama produk (tengah, tebal) + barcode CODE128 + angka barcode.
export function buildBarcodeLabels(name: string, barcode: string | null | undefined, qty: number): string {
  const n = Math.max(1, Math.min(50, Math.floor(qty || 1)));
  const bc = (barcode || "").trim();
  let out = "";
  for (let i = 0; i < n; i++) {
    out += C_CENTER + C_BIG_BOLD + name.slice(0, CW) + "\n" + C_NORMAL;
    if (bc) {
      out += GS + "\x48\x02";                       // HRI teks di bawah barcode
      out += GS + "\x66\x00";                       // font HRI A
      out += GS + "\x68" + String.fromCharCode(70); // tinggi barcode
      out += GS + "\x77" + String.fromCharCode(2);  // lebar modul
      const data = "{B" + bc;                        // CODE128 code set B
      out += GS + "\x6B\x49" + String.fromCharCode(data.length) + data;
      out += "\n";
    } else {
      out += "(tanpa barcode)\n";
    }
    out += C_LEFT + "\n";
  }
  out += "\n\n";
  return out;
}
