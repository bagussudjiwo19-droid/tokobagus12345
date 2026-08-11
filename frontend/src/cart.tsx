import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { CartLine, Product, Variation } from "./types";
import { resolvePricing, tierPrice } from "./pricing";

type CartContextType = {
  lines: CartLine[];
  count: number;
  total: number;
  addProduct: (product: Product, variation?: Variation | null) => void;
  addManual: (name: string, price: number, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  inc: (key: string) => void;
  dec: (key: string) => void;
  remove: (key: string) => void;
  setPrice: (key: string, price: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

function lineKey(productId: string, variationId?: string | null): string {
  return variationId ? `${productId}::${variationId}` : productId;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const recomputePrice = (line: CartLine, qty: number): number => {
    return tierPrice(line.base_price, line.tiers, qty);
  };

  const addProduct = useCallback((product: Product, variation?: Variation | null) => {
    const key = lineKey(product.id, variation?.id);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => {
          if (l.key !== key) return l;
          const q = l.quantity + 1;
          return { ...l, quantity: q, price: recomputePrice(l, q) };
        });
      }
      const { base, tiers } = resolvePricing(product, variation);
      const name = variation ? `${product.name} — ${variation.name}` : product.name;
      const newLine: CartLine = {
        key,
        product_id: product.id,
        variation_id: variation?.id ?? null,
        name,
        barcode: variation?.barcode ?? product.barcode ?? null,
        unit: product.unit || "pcs",
        quantity: 1,
        base_price: base,
        price: tierPrice(base, tiers, 1),
        tiers,
      };
      return [...prev, newLine];
    });
  }, []);

  const addManual = useCallback((name: string, price: number, qty: number = 1) => {
    const key = `manual-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        key,
        product_id: null,
        variation_id: null,
        name: name.trim() || "Item Manual",
        barcode: null,
        unit: "pcs",
        quantity: qty,
        base_price: price,
        price,
        tiers: [],
        manual: true,
      },
    ]);
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: qty, price: tierPrice(l.base_price, l.tiers, qty) } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const inc = useCallback((key: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const q = l.quantity + 1;
        return { ...l, quantity: q, price: tierPrice(l.base_price, l.tiers, q) };
      }),
    );
  }, []);

  const dec = useCallback((key: string) => {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.key !== key) return l;
          const q = l.quantity - 1;
          return { ...l, quantity: q, price: tierPrice(l.base_price, l.tiers, q) };
        })
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  // Override the unit price for a line (edit harga). Fixes the price so tier
  // recomputation on qty change won't override the manual choice.
  const setPrice = useCallback((key: string, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, price, base_price: price, tiers: [] } : l)),
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);
  const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);

  const value: CartContextType = {
    lines,
    count,
    total,
    addProduct,
    addManual,
    setQty,
    inc,
    dec,
    remove,
    setPrice,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
