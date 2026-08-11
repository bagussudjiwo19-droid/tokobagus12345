import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Product } from "./types";
import { api } from "./api";

type PricePick = { productId: string; variationId: string | null; ts: number } | null;

type DataCtx = {
  products: Product[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  pricePick: PricePick;
  setPricePick: (p: PricePick) => void;
};

const Ctx = createContext<DataCtx | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pricePick, setPricePick] = useState<PricePick>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getProducts();
      setProducts(data);
    } catch (e: any) {
      setError(e?.message || "Gagal memuat produk");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return <Ctx.Provider value={{ products, loading, error, reload, pricePick, setPricePick }}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData must be used within DataProvider");
  return c;
}
