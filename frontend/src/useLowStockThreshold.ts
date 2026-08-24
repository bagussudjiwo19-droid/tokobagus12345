import { useEffect, useState } from "react";
import { api } from "./api";
import { onLocalChange } from "./localdb";

// Ambang batas "Stok Menipis" (default 5). Reaktif terhadap perubahan Pengaturan.
export function useLowStockThreshold(): number {
  const [n, setN] = useState(5);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .getSettings()
        .then((s) => { if (alive) setN(typeof s.lowStockThreshold === "number" ? s.lowStockThreshold : 5); })
        .catch(() => {});
    load();
    const off = onLocalChange(load);
    return () => { alive = false; off(); };
  }, []);
  return n;
}
