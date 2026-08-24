import { useEffect, useState } from "react";
import { api } from "./api";
import { onLocalChange } from "./localdb";

// Mode "Unlimited" (tanpa stok): default AKTIF. Bila aktif, angka stok &
// peringatan stok tidak ditampilkan di seluruh aplikasi. Reaktif terhadap
// perubahan Pengaturan (lewat onLocalChange saat settings disimpan).
export function useUnlimitedStock(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .getSettings()
        .then((s) => { if (alive) setOn(s.unlimitedStock !== false); })
        .catch(() => {});
    load();
    const off = onLocalChange(load);
    return () => { alive = false; off(); };
  }, []);
  return on;
}
