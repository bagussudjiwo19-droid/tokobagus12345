import type { Product, Variation, Tier } from "./types";

export function resolvePricing(
  product: Product,
  variation?: Variation | null,
): { base: number; tiers: Tier[] } {
  if (variation) {
    if (variation.inherit_tiers) {
      return { base: product.sell_price, tiers: product.tiers || [] };
    }
    return {
      base: variation.sell_price || product.sell_price,
      tiers: variation.tiers || [],
    };
  }
  return { base: product.sell_price, tiers: product.tiers || [] };
}

// Effective unit price given quantity + wholesale tiers (harga bertingkat).
export function tierPrice(base: number, tiers: Tier[], qty: number): number {
  if (!tiers || tiers.length === 0) return base;
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  let price = base;
  for (const t of sorted) {
    if (qty >= t.min_qty) price = t.price;
  }
  return price;
}

export function stockOf(product: Product, variation?: Variation | null): number {
  if (variation) return variation.stock;
  return product.stock;
}
