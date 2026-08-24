import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Product } from "./types";
import { api } from "./api";
import { onLocalChange } from "./localdb";

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
    // Muat ulang produk saat data lokal berubah karena sinkron cloud masuk.
    // Sinkron bisa menulis banyak item beruntun → debounce agar hanya reload
    // sekali per "burst", tidak membebani CPU/render saat sinkron berjalan.
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onLocalChange(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { reload(); }, 350);
    });
    return () => { if (t) clearTimeout(t); off(); };
  }, [reload]);

  const value = useMemo<DataCtx>(
    () => ({ products, loading, error, reload, pricePick, setPricePick }),
    [products, loading, error, reload, pricePick],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData must be used within DataProvider");
  return c;
}
