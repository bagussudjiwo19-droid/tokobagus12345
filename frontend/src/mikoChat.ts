// ============================================================================
// OTAK PERCAKAPAN MIKO (OFFLINE, TANPA CLOUD/AI).
// Memahami pertanyaan sederhana pelanggan (harga / stok / lebih murah / lebih
// mahal) dengan mencocokkan nama produk ke DATA KASIR LOKAL (SQLite in-memory).
// Menjaga KONTEKS beberapa detik agar pelanggan bisa langsung bertanya lagi
// tanpa menyebut nama barang berulang. Jawaban dibuat senatural mungkin.
//
// TAHAP 1: hanya "otak"-nya. Input teks (uji di preview) / hasil STT (di HP).
// Suara jawaban memakai TTS (expo-speech) lewat layar pemanggil.
// ============================================================================
import type { Product } from "./types";
import { rupiah } from "./format";
import { terbilang } from "./voice";

export type ChatCtx = {
  lastMatches?: Product[]; // hasil pencarian nama terakhir (untuk "lebih murah/mahal")
  lastProduct?: Product; // produk yang sedang dibahas
  lastName?: string; // nama query terakhir (mentah, untuk kalimat natural)
  at?: number; // kapan konteks dibuat (ms)
};

export type ChatReply = {
  reply: string; // teks untuk ditampilkan di layar
  speak: string; // teks untuk dibacakan TTS (angka jadi kata)
  product?: Product | null; // produk yang ditemukan (bila ada)
  ctx: ChatCtx; // konteks diperbarui
};

const CTX_MS = 30000; // konteks percakapan bertahan 30 detik

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nama produk yang enak dibaca TTS (buang tanda "—", spasi ganda).
function speakName(name: string): string {
  return (name || "").replace(/—/g, " ").replace(/\s+/g, " ").trim();
}

// Cari produk berdasar nama (fuzzy sederhana, offline). Skor dari jumlah token
// query yang muncul di nama produk + bonus bila seluruh query menempel.
function findByName(products: Product[], q: string): Product[] {
  const nq = norm(q);
  if (!nq) return [];
  const nqNoSpace = nq.replace(/\s+/g, "");
  const qTokens = nq.split(" ").filter((t) => t.length >= 2);
  if (qTokens.length === 0) return [];

  const scored = products
    .map((p) => {
      const np = norm(p.name);
      const npNoSpace = np.replace(/\s+/g, "");
      let score = 0;
      for (const t of qTokens) if (np.includes(t)) score += 1;
      if (nqNoSpace.length >= 3 && npNoSpace.includes(nqNoSpace)) score += 2;
      if (np === nq) score += 4;
      // sedikit prioritas untuk induk (bukan variasi) agar jawaban lebih umum
      if (!p.parent_id) score += 0.2;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        norm(a.p.name).length - norm(b.p.name).length ||
        a.p.sell_price - b.p.sell_price,
    );

  return scored.map((x) => x.p);
}

// Buang kata pemicu/pengisi agar tersisa dugaan NAMA barang.
function extractName(text: string): string {
  const stop = new Set([
    "harga", "harganya", "berapa", "berapaan", "brp", "brpa",
    "stok", "stoknya", "sisa", "sisanya", "masih", "tinggal", "persediaan",
    "ada", "adakah", "punya", "jual", "dijual",
    "miko", "kak", "kakak", "ya", "yaa", "dong", "donk", "nya", "yg", "yang",
    "itu", "ini", "dari", "untuk", "buat", "tolong", "coba", "cek", "cekin",
    "mau", "pengen", "pingin", "beli", "cari", "cariin", "berapakah",
  ]);
  return norm(text)
    .split(" ")
    .filter((t) => t && !stop.has(t))
    .join(" ")
    .trim();
}

// Kalimat harga natural. Menyertakan grosir bila ada (maks 1 tingkat termurah).
function priceSentences(p: Product): { reply: string; speak: string } {
  const nm = speakName(p.name);
  const openR = pick([
    `Nah, ketemu, Kak. Harga ${nm} ${rupiah(p.sell_price)}.`,
    `Ketemu, Kak. ${nm} harganya ${rupiah(p.sell_price)}.`,
    `Ini dia, Kak. ${nm} ${rupiah(p.sell_price)}.`,
    `${nm} harganya ${rupiah(p.sell_price)}, Kak.`,
  ]);
  const openS = openR
    .replace(rupiah(p.sell_price), `${terbilang(p.sell_price).trim()} rupiah`);

  const tiers = (p.tiers || []).filter((t) => t && t.price > 0).sort((a, b) => a.min_qty - b.min_qty);
  let extraR = "";
  let extraS = "";
  if (tiers.length > 0) {
    const t = tiers[0];
    const u = p.unit && p.unit !== "pcs" ? ` ${p.unit}` : "";
    extraR = ` Kalau beli ${t.min_qty}${u} lebih hemat, cuma ${rupiah(t.price)} per ${p.unit || "pcs"}.`;
    extraS = ` Kalau beli ${t.min_qty}${u} lebih hemat, cuma ${terbilang(t.price).trim()} rupiah per ${p.unit || "pcs"}.`;
  }
  return { reply: openR + extraR, speak: openS + extraS };
}

// ---------------------------------------------------------------------------
// Fungsi utama: proses satu ucapan/ketikan pelanggan → jawaban Miko.
// ---------------------------------------------------------------------------
export function mikoAsk(products: Product[], textRaw: string, prev: ChatCtx): ChatReply {
  const now = Date.now();
  const ctxValid = !!prev.at && now - prev.at < CTX_MS && !!prev.lastProduct;
  let text = norm(textRaw).replace(/\bmiko\b/g, " ").replace(/\s+/g, " ").trim();

  const done = (reply: string, speak: string, ctx: ChatCtx, product?: Product | null): ChatReply => ({
    reply, speak, product: product ?? null, ctx: { ...ctx, at: now },
  });

  // Sapaan / kosong
  if (!text || /^(halo|hai|hi|hei|hey|hello|selamat|assalam|permisi|misi)\b/.test(text)) {
    const s = pick([
      "Halo, Kak! Ada yang bisa Miko bantu? Tanya saja harga barangnya ya.",
      "Hai, Kak! Mau cek harga apa hari ini? Sebut saja nama barangnya.",
      "Halo! Miko siap bantu cek harga. Contohnya, tanya harga sabun atau harga minyak.",
    ]);
    return done(s, s, { at: now });
  }

  // Terima kasih
  if (/(terima kasih|terimakasih|makasih|makasi|trims|thanks|thank you|suwun)/.test(text)) {
    const s = pick([
      "Sama-sama, Kak! Senang bisa bantu. Semoga belanjanya menyenangkan ya.",
      "Sama-sama, Kak. Kalau mau cek harga lain, panggil Miko lagi ya.",
      "Dengan senang hati, Kak! Semoga harinya menyenangkan.",
    ]);
    return done(s, s, { at: now });
  }

  // Bantuan / siapa kamu
  if (/(bisa apa|kamu siapa|siapa kamu|kamu bisa apa|fungsi kamu|apa aja)/.test(text)) {
    const s = "Miko bisa bantu cek harga dan stok barang di toko ini, Kak. Sebut saja, misalnya, harga gula, atau stok beras. Nanti Miko carikan.";
    return done(s, s, { at: now });
  }

  const isCheaper = /(lebih murah|yang murah|murah lagi|lebih hemat|paling murah|termurah|murahan)/.test(text);
  const isPricier = /(lebih mahal|yang mahal|paling mahal|termahal|premium|bagusan)/.test(text);
  const isStock = /(stok|stoknya|sisa|sisanya|masih ada|ada berapa|tinggal berapa|persediaan|habis)/.test(text);

  // "Ada yang lebih murah/mahal?" → gunakan konteks barang terakhir
  if ((isCheaper || isPricier) && ctxValid) {
    const cur = prev.lastProduct!;
    const pool = (prev.lastMatches && prev.lastMatches.length > 1 ? prev.lastMatches : findByName(products, prev.lastName || cur.name))
      .filter((p) => p.id !== cur.id);
    let cand: Product | undefined;
    if (isCheaper) {
      cand = pool.filter((p) => p.sell_price < cur.sell_price).sort((a, b) => a.sell_price - b.sell_price)[0];
    } else {
      cand = pool.filter((p) => p.sell_price > cur.sell_price).sort((a, b) => b.sell_price - a.sell_price)[0];
    }
    if (cand) {
      const diff = Math.abs(cand.sell_price - cur.sell_price);
      const nm = speakName(cand.name);
      const reply = isCheaper
        ? pick([
            `Ada, Kak. ${nm} lebih murah, harganya ${rupiah(cand.sell_price)}. Hemat ${rupiah(diff)}.`,
            `Ada yang lebih hemat, Kak: ${nm} cuma ${rupiah(cand.sell_price)}, selisih ${rupiah(diff)}.`,
          ])
        : pick([
            `Ada, Kak. ${nm} harganya ${rupiah(cand.sell_price)}, ${rupiah(diff)} lebih mahal tapi biasanya lebih besar atau lebih bagus.`,
            `Ada pilihan lain, Kak: ${nm} seharga ${rupiah(cand.sell_price)}.`,
          ]);
      const speak = reply
        .replace(rupiah(cand.sell_price), `${terbilang(cand.sell_price).trim()} rupiah`)
        .replace(rupiah(diff), `${terbilang(diff).trim()} rupiah`);
      return done(reply, speak, { lastMatches: prev.lastMatches, lastProduct: cand, lastName: prev.lastName }, cand);
    }
    const nm = speakName(cur.name);
    const s = isCheaper
      ? `Untuk ${nm}, sepertinya ini sudah yang paling murah di toko, Kak.`
      : `Untuk ${nm}, belum ada pilihan yang lebih mahal, Kak. Ini sudah yang teratas.`;
    return done(s, s, prev, cur);
  }

  // Perlu cari nama barang (harga / stok / sebut nama saja)
  const nameQ = extractName(text);
  // Jika tak ada nama tapi konteks masih hidup → pakai barang terakhir
  if (!nameQ && ctxValid) {
    const cur = prev.lastProduct!;
    if (isStock) {
      const s = stockSentence(cur);
      return done(s.reply, s.speak, prev, cur);
    }
    const s = priceSentences(cur);
    return done(s.reply, s.speak, prev, cur);
  }

  if (!nameQ) {
    const s = pick([
      "Maaf, Kak, Miko belum menangkap nama barangnya. Coba sebutkan lagi, misalnya, harga kopi.",
      "Hmm, barangnya apa ya, Kak? Sebut saja namanya, nanti Miko carikan harganya.",
    ]);
    return done(s, s, prev);
  }

  const matches = findByName(products, nameQ);
  if (matches.length === 0) {
    const s = pick([
      `Maaf, Kak, Miko belum menemukan "${nameQ}" di data toko. Mungkin bisa tanya ke kasir Vita atau Sasa ya.`,
      `Hmm, "${nameQ}" belum ada di daftar Miko, Kak. Coba tanyakan ke Vita atau Sasa.`,
    ]);
    return done(s, s, { at: now });
  }

  const best = matches[0];
  const newCtx: ChatCtx = { lastMatches: matches.slice(0, 12), lastProduct: best, lastName: nameQ };

  if (isStock) {
    const s = stockSentence(best);
    return done(s.reply, s.speak, newCtx, best);
  }
  const s = priceSentences(best);
  // tambah ajakan natural sesekali
  const tailR = matches.length > 1 ? pick(["", "", " Kalau mau, Miko bisa carikan yang lebih murah."]) : "";
  return done(s.reply + tailR, s.speak + tailR, newCtx, best);
}

function stockSentence(p: Product): { reply: string; speak: string } {
  const nm = speakName(p.name);
  const st = Math.max(0, Math.floor(p.stock || 0));
  const u = p.unit || "pcs";
  if (st <= 0) {
    const r = `Wah, ${nm} sedang kosong, Kak. Coba tanya kasir kapan datang lagi ya.`;
    return { reply: r, speak: r };
  }
  const r = pick([
    `${nm} masih ada ${st} ${u}, Kak.`,
    `Stok ${nm} tinggal ${st} ${u}, Kak.`,
    `Untuk ${nm}, tersedia ${st} ${u}, Kak.`,
  ]);
  const s = r.replace(`${st} ${u}`, `${terbilang(st).trim()} ${u}`);
  return { reply: r, speak: s };
}

// Pencarian produk berdasar nama untuk mode KETIK di layar Cek Harga (offline).
// Mengembalikan daftar produk relevan (induk/standalone) untuk ditampilkan
// sebagai kartu besar. Tidak memilih otomatis bila hasil lebih dari satu.
export function searchProductsByName(products: Product[], query: string, limit = 24): Product[] {
  return findByName(products, query).slice(0, limit);
}

// Kumpulkan FAKTA produk (dari DB lokal) untuk dikirim ke AI online agar tidak
// mengarang. Menyertakan hasil pencarian pesan sekarang + konteks terakhir.
export type MikoFact = { name: string; price: number; stock: number; unit: string; tiers: { min_qty: number; price: number }[] };

function toFact(p: Product): MikoFact {
  const tiers = (p.tiers || []).filter((t) => t && t.price > 0).map((t) => ({ min_qty: t.min_qty, price: t.price }));
  return { name: p.name, price: p.sell_price, stock: Math.max(0, Math.floor(p.stock || 0)), unit: p.unit || "pcs", tiers };
}

export function collectFacts(products: Product[], textRaw: string, prev: ChatCtx): { facts: MikoFact[]; best: Product | null; matches: Product[] } {
  const now = Date.now();
  const ctxValid = !!prev.at && now - prev.at < CTX_MS && !!prev.lastProduct;
  const nameQ = extractName(norm(textRaw).replace(/\bmiko\b/g, " ").trim());
  let matches = nameQ ? findByName(products, nameQ) : [];
  if (matches.length === 0 && ctxValid && prev.lastName) matches = findByName(products, prev.lastName);

  const pool: Product[] = [];
  const seen = new Set<string>();
  const add = (p?: Product | null) => { if (p && !seen.has(p.id)) { seen.add(p.id); pool.push(p); } };
  matches.slice(0, 8).forEach(add);
  (prev.lastMatches || []).slice(0, 8).forEach(add);
  if (ctxValid) add(prev.lastProduct);

  const best = matches[0] || (ctxValid ? prev.lastProduct! : null);
  return { facts: pool.slice(0, 12).map(toFact), best, matches: matches.slice(0, 12) };
}


export function mikoThinking(): string {
  return pick([
    "Sebentar ya, Kak, Miko cek dulu.",
    "Oke, Kak. Miko carikan dulu ya.",
    "Bentar ya, Kak, Miko lihat datanya dulu.",
    "Siap, Kak. Miko cek sebentar.",
  ]);
}
