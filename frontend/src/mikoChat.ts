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
  pendingOffer?: Product | null; // produk yang baru DITAWARKAN ("Mau Miko tampilkan?")
  declinedIds?: string[]; // produk yang sudah ditolak → jangan ditawarkan lagi
  complementOffered?: boolean; // sudah menawarkan produk pelengkap sekali di percakapan ini
};

export type ChatReply = {
  reply: string; // teks untuk ditampilkan di layar
  speak: string; // teks untuk dibacakan TTS (angka jadi kata)
  product?: Product | null; // produk yang ditemukan (bila ada)
  card?: Product | null; // produk yang harus DITAMPILKAN sebagai kartu besar
  intent: string; // 'price'|'stock'|'offer'|'show'|'decline'|'greet'|'thanks'|'help'|'chitchat'|'none'
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

// Jarak Levenshtein (untuk fallback typo kecil, mis. "trigu" → "terigu").
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

// Teks yang bisa dicari untuk sebuah produk: nama + nama semua variasinya.
function haystack(p: Product): string {
  const vars = (p.variations || []).map((v) => v.name).join(" ");
  return norm(`${p.name} ${vars}`);
}

// Cari produk berdasar nama (COCOK KETAT, offline). Skor dari jumlah token query
// yang benar-benar muncul di nama produk / nama variasinya. TIDAK mengembalikan
// produk yang tak berhubungan. Fallback typo hanya dipakai bila hasil ketat kosong.
function findByName(products: Product[], q: string): Product[] {
  const nq = norm(q);
  if (!nq) return [];
  const nqNoSpace = nq.replace(/\s+/g, "");
  const qTokens = nq.split(" ").filter((t) => t.length >= 2);
  if (qTokens.length === 0) return [];

  const scored = products
    .map((p) => {
      const hay = haystack(p);
      const hayNoSpace = hay.replace(/\s+/g, "");
      let score = 0;
      // Tiap token query harus BENAR-BENAR muncul (substring) di nama/variasi.
      for (const t of qTokens) if (hay.includes(t)) score += 1;
      if (nqNoSpace.length >= 3 && hayNoSpace.includes(nqNoSpace)) score += 2;
      if (hay === nq) score += 4;
      // Bonus induk HANYA bila sudah ada kecocokan nyata (jangan loloskan yang tak cocok).
      if (score > 0 && !p.parent_id) score += 0.2;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        norm(a.p.name).length - norm(b.p.name).length ||
        a.p.sell_price - b.p.sell_price,
    );

  if (scored.length > 0) return scored.map((x) => x.p);

  // FALLBACK typo ringan: hanya untuk token panjang (>=4) dengan jarak edit <= 1.
  const qLong = qTokens.filter((t) => t.length >= 4);
  if (qLong.length === 0) return [];
  const fuzzy = products
    .map((p) => {
      const pTokens = haystack(p).split(" ").filter((t) => t.length >= 3);
      let best = 99;
      for (const qt of qLong) for (const pt of pTokens) {
        const d = lev(qt, pt);
        if (d < best) best = d;
      }
      return { p, d: best };
    })
    .filter((x) => x.d <= 1)
    .sort((a, b) => a.d - b.d || norm(a.p.name).length - norm(b.p.name).length);

  return fuzzy.map((x) => x.p);
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

// Aturan produk PELENGKAP (mudah ditambah). Bila token `match` ada di nama/kategori
// produk, Miko boleh menawarkan produk dari `want`. Tidak dipaksakan.
const COMPLEMENTS: { match: string[]; want: string[] }[] = [
  { match: ["kopi"], want: ["gula"] },
  { match: ["teh"], want: ["gula"] },
  { match: ["gula"], want: ["kopi"] },
  { match: ["mie", "indomie", "mi instan", "mie instan"], want: ["telur", "telor"] },
  { match: ["beras"], want: ["minyak"] },
  { match: ["tepung"], want: ["telur", "telor"] },
  { match: ["sabun"], want: ["shampo", "sampo"] },
  { match: ["shampo", "sampo"], want: ["sabun"] },
  { match: ["rokok"], want: ["korek"] },
  { match: ["susu"], want: ["roti"] },
  { match: ["roti"], want: ["selai", "susu"] },
  { match: ["popok", "pampers", "diapers"], want: ["tisu basah"] },
];

function findComplement(products: Product[], base: Product, declined: string[]): Product | null {
  const nb = norm(base.name) + " " + norm(base.category || "");
  for (const rule of COMPLEMENTS) {
    if (rule.match.some((m) => nb.includes(m))) {
      for (const w of rule.want) {
        const found = findByName(products, w).find(
          (p) => p.id !== base.id && (p.stock || 0) > 0 && !declined.includes(p.id),
        );
        if (found) return found;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fungsi utama (MODE SALES OFFLINE): proses satu ucapan/ketikan pelanggan →
// jawaban Miko + (opsional) kartu produk. Alur tawaran: tawarkan → "boleh"
// tampilkan kartu / "tidak" jangan tawarkan lagi. Tidak cerewet: harga polos
// dijawab polos. Semua fakta dari DB lokal (tanpa mengarang).
// ---------------------------------------------------------------------------
export function mikoAsk(products: Product[], textRaw: string, prev: ChatCtx): ChatReply {
  const now = Date.now();
  const ctxValid = !!prev.at && now - prev.at < CTX_MS && !!prev.lastProduct;
  const declined = prev.declinedIds || [];
  const text = norm(textRaw).replace(/\bmiko\b/g, " ").replace(/\s+/g, " ").trim();

  const done = (
    reply: string,
    speak: string,
    ctx: ChatCtx,
    opts?: { product?: Product | null; card?: Product | null; intent?: string },
  ): ChatReply => ({
    reply,
    speak,
    product: opts?.product ?? null,
    card: opts?.card ?? null,
    intent: opts?.intent ?? "none",
    ctx: { ...ctx, at: now, declinedIds: ctx.declinedIds ?? declined },
  });

  const hasFactIntent = /(murah|mahal|harga|berapa|stok|sisa|ukuran|varian|lebih)/.test(text);
  const affirm = /\b(boleh|iya|iyaa|ya|yaa|yoi|mau|oke|okey|okay|ok|sip|tampilkan|tampilin|lihat|liat|liatin|silakan|silahkan|gas|yuk|ayo)\b/;
  const negate = /\b(tidak|ga|gak|nggak|ngga|enggak|engga|jangan|nanti|skip|gausah|udah|sudah|cukup)\b/;

  // 0) TANGGAPAN atas TAWARAN sebelumnya ("Mau Miko tampilkan?")
  if (prev.pendingOffer && ctxValid && !hasFactIntent) {
    const offered = prev.pendingOffer;
    if (negate.test(text)) {
      const s = pick(["Baik, Kak. 😊", "Oke, Kak, tidak apa-apa. 😊", "Siap, Kak. Kalau butuh, panggil Miko lagi ya."]);
      return done(s, s, { ...prev, pendingOffer: null, declinedIds: [...declined, offered.id] }, { intent: "decline" });
    }
    if (affirm.test(text)) {
      const nm = speakName(offered.name);
      const price = offered.sell_price;
      const reply = pick([
        `Nih, Kak, ${nm} harganya ${rupiah(price)}. Sentuh kartunya untuk lihat detail ya.`,
        `Siap! Ini ${nm}, ${rupiah(price)}, Kak. Boleh disentuh untuk detailnya.`,
      ]);
      const speak = reply.replace(rupiah(price), `${terbilang(price).trim()} rupiah`);
      return done(reply, speak, { ...prev, pendingOffer: null, lastProduct: offered, lastName: offered.name }, { product: offered, card: offered, intent: "show" });
    }
    // Bukan ya/tidak → anggap ganti topik: lupakan tawaran, proses seperti biasa.
  }

  // Sapaan / kosong
  if (!text || /^(halo|hai|hi|hei|hey|hello|selamat|assalam|permisi|misi)\b/.test(text)) {
    const s = pick([
      "Halo, Kak! Ada yang bisa Miko bantu? Tanya saja harga barangnya ya.",
      "Hai, Kak! Mau cek harga apa hari ini? Sebut saja nama barangnya.",
      "Halo! Miko siap bantu cek harga. Contohnya, tanya harga sabun atau harga minyak.",
    ]);
    return done(s, s, { declinedIds: declined, complementOffered: prev.complementOffered }, { intent: "greet" });
  }

  // Terima kasih
  if (/(terima kasih|terimakasih|makasih|makasi|trims|thanks|thank you|suwun)/.test(text)) {
    const s = pick([
      "Sama-sama, Kak! Senang bisa bantu. Semoga belanjanya menyenangkan ya.",
      "Sama-sama, Kak. Kalau mau cek harga lain, panggil Miko lagi ya.",
      "Dengan senang hati, Kak! Semoga harinya menyenangkan.",
    ]);
    return done(s, s, { declinedIds: declined, complementOffered: prev.complementOffered }, { intent: "thanks" });
  }

  // Bantuan / siapa kamu
  if (/(bisa apa|kamu siapa|siapa kamu|kamu bisa apa|fungsi kamu|apa aja)/.test(text)) {
    const s = "Miko bisa bantu cek harga dan stok barang di toko ini, Kak. Sebut saja, misalnya, harga gula, atau stok beras. Nanti Miko carikan.";
    return done(s, s, { declinedIds: declined, complementOffered: prev.complementOffered }, { intent: "help" });
  }

  const isCheaper = /(lebih murah|yang murah|murah lagi|lebih hemat|paling murah|termurah|murahan)/.test(text);
  const isPricier = /(lebih mahal|yang mahal|paling mahal|termahal|premium|bagusan)/.test(text);
  const isStock = /(stok|stoknya|sisa|sisanya|masih ada|ada berapa|tinggal berapa|persediaan|habis)/.test(text);

  // TAWARKAN alternatif lebih murah / lebih mahal (pakai konteks). Belum tampilkan kartu.
  if ((isCheaper || isPricier) && ctxValid) {
    const cur = prev.lastProduct!;
    const pool = (prev.lastMatches && prev.lastMatches.length > 1 ? prev.lastMatches : findByName(products, prev.lastName || cur.name))
      .filter((p) => p.id !== cur.id && !declined.includes(p.id));
    let cand: Product | undefined;
    if (isCheaper) cand = pool.filter((p) => p.sell_price < cur.sell_price).sort((a, b) => a.sell_price - b.sell_price)[0];
    else cand = pool.filter((p) => p.sell_price > cur.sell_price).sort((a, b) => b.sell_price - a.sell_price)[0];
    if (cand) {
      const nm = speakName(cand.name);
      const reply = isCheaper
        ? pick([
            `Ada, Kak. Miko nemu yang lebih hemat: ${nm}, cuma ${rupiah(cand.sell_price)}. Mau Miko tampilkan?`,
            `Ada yang lebih murah, Kak: ${nm} ${rupiah(cand.sell_price)}. Mau Miko tampilkan?`,
          ])
        : pick([
            `Ada yang lebih premium, Kak: ${nm} ${rupiah(cand.sell_price)}. Mau Miko tampilkan?`,
            `Ada pilihan lebih tinggi, Kak: ${nm} ${rupiah(cand.sell_price)}. Mau Miko tampilkan?`,
          ]);
      const speak = reply.replace(rupiah(cand.sell_price), `${terbilang(cand.sell_price).trim()} rupiah`);
      return done(reply, speak, { ...prev, pendingOffer: cand }, { product: cur, intent: "offer" });
    }
    const nm = speakName(cur.name);
    const s = isCheaper
      ? `Untuk ${nm}, sepertinya ini sudah yang paling murah di toko, Kak.`
      : `Untuk ${nm}, belum ada yang lebih tinggi, Kak. Ini sudah teratas.`;
    return done(s, s, { ...prev, pendingOffer: null }, { product: cur, intent: "price" });
  }

  // Cari nama barang (harga / stok / sebut nama saja)
  const nameQ = extractName(text);
  if (!nameQ && ctxValid) {
    const cur = prev.lastProduct!;
    if (isStock) { const s = stockSentence(cur); return done(s.reply, s.speak, prev, { product: cur, intent: "stock" }); }
    const s = priceSentences(cur);
    return done(s.reply, s.speak, prev, { product: cur, intent: "price" });
  }

  if (!nameQ) {
    // Bukan pertanyaan produk (obrolan bebas / curhat) → biar AI online yang bantu (kalau ada).
    const s = pick([
      "Hehe, Miko kurang paham nih, Kak. Kalau mau cek harga, sebut saja nama barangnya ya.",
      "Maaf, Kak, Miko belum menangkap maksudnya. Coba sebut nama barang yang ingin dicek harganya ya.",
    ]);
    return done(s, s, { ...prev }, { intent: "chitchat" });
  }

  const matches = findByName(products, nameQ);
  if (matches.length === 0) {
    const s = pick([
      `Maaf, Kak, Miko belum menemukan "${nameQ}" di data toko. Mungkin bisa tanya ke kasir Vita atau Sasa ya.`,
      `Hmm, "${nameQ}" belum ada di daftar Miko, Kak. Coba tanyakan ke Vita atau Sasa.`,
    ]);
    return done(s, s, { declinedIds: declined, complementOffered: prev.complementOffered }, { intent: "price" });
  }

  const best = matches[0];
  const newCtx: ChatCtx = { ...prev, lastMatches: matches.slice(0, 12), lastProduct: best, lastName: nameQ, pendingOffer: null };

  if (isStock) {
    const s = stockSentence(best);
    return done(s.reply, s.speak, newCtx, { product: best, intent: "stock" });
  }

  const s = priceSentences(best);
  // Produk PELENGKAP: tawarkan MAKSIMAL sekali per percakapan (tidak cerewet).
  if (!prev.complementOffered) {
    const comp = findComplement(products, best, declined);
    if (comp) {
      const cnm = speakName(comp.name);
      const offer = ` Oh iya, kalau perlu ada ${cnm} juga, Kak. Mau Miko tampilkan?`;
      return done(s.reply + offer, s.speak + offer, { ...newCtx, complementOffered: true, pendingOffer: comp }, { product: best, intent: "price" });
    }
  }
  return done(s.reply, s.speak, newCtx, { product: best, intent: "price" });
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
