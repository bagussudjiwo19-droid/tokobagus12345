// Pencocokan nama produk yang TOLERAN terhadap salah dengar / pelafalan (untuk
// hasil suara / STT). Contoh: "rediona" → "Rexona", "royko" → "Royco",
// "sedap" → "Sedaap". Murni offline, tanpa dependency tambahan.
import type { Product } from "./types";

// Normalisasi: huruf kecil, buang tanda baca, rapikan spasi.
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance (iteratif, hemat memori).
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Kemiripan 0..1 antara dua kata berdasarkan Levenshtein.
function simWord(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = lev(a, b);
  const m = Math.max(a.length, b.length);
  return m === 0 ? 0 : 1 - d / m;
}

// Skor kemiripan query vs nama produk (0..1). Menggabungkan:
// - kemiripan token terbaik (query tiap kata dicocokkan ke kata terdekat di nama),
// - bonus bila token muncul sebagai awalan/substring,
// - kemiripan keseluruhan string.
function score(queryNorm: string, nameNorm: string): number {
  if (!queryNorm || !nameNorm) return 0;
  if (nameNorm === queryNorm) return 1;
  if (nameNorm.includes(queryNorm)) return 0.94; // substring langsung → sangat kuat

  const qTokens = queryNorm.split(" ").filter(Boolean);
  const nTokens = nameNorm.split(" ").filter(Boolean);

  let tokenSum = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const nt of nTokens) {
      let s = simWord(qt, nt);
      if (nt.startsWith(qt) || qt.startsWith(nt)) s = Math.max(s, 0.85);
      if (nt.includes(qt) && qt.length >= 3) s = Math.max(s, 0.8);
      if (s > best) best = s;
    }
    tokenSum += best;
  }
  const tokenScore = qTokens.length ? tokenSum / qTokens.length : 0;
  const wholeScore = simWord(queryNorm, nameNorm);
  return Math.max(tokenScore * 0.85 + wholeScore * 0.15, wholeScore);
}

export type FuzzyMatch = { product: Product; score: number };

// Kembalikan produk terurut dari paling mirip. Hanya produk induk/tunggal yang
// bisa dipilih (parent_id null) — sama seperti pencarian ketik biasa.
export function fuzzyMatchProducts(products: Product[], query: string, limit = 5): FuzzyMatch[] {
  const q = norm(query);
  if (!q) return [];
  const roots = products.filter((p) => !p.parent_id);
  const scored: FuzzyMatch[] = roots.map((p) => ({ product: p, score: score(q, norm(p.name)) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// Ambang keyakinan: di atas ini dianggap "cocok" dan langsung dibuka.
export const FUZZY_THRESHOLD = 0.6;
