// Indonesian Rupiah formatting: Rp 15.000 (no decimals, dot thousand separator).
export function rupiah(value: number | null | undefined): string {
  const n = Math.round(Number(value || 0));
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}Rp ${s}`;
}

export function numberID(value: number | null | undefined): string {
  const n = Number(value || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatDateID(iso: string): string {
  try {
    const d = new Date(iso);
    const tgl = d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const jam = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${tgl} • ${jam}`;
  } catch {
    return iso;
  }
}

export function shortTxNo(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
