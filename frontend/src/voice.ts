import * as Speech from "expo-speech";

const SATUAN = [
  "", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
  "sepuluh", "sebelas",
];

// Ubah angka menjadi kata Bahasa Indonesia (terbilang).
export function terbilang(input: number): string {
  const n = Math.floor(Math.abs(input));
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) {
    const sisa = n % 10;
    return `${terbilang(Math.floor(n / 10))} puluh${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 200) {
    const sisa = n - 100;
    return `seratus${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 1000) {
    const sisa = n % 100;
    return `${terbilang(Math.floor(n / 100))} ratus${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 2000) {
    const sisa = n - 1000;
    return `seribu${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 1000000) {
    const sisa = n % 1000;
    return `${terbilang(Math.floor(n / 1000))} ribu${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 1000000000) {
    const sisa = n % 1000000;
    return `${terbilang(Math.floor(n / 1000000))} juta${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  const sisa = n % 1000000000;
  return `${terbilang(Math.floor(n / 1000000000))} miliar${sisa ? ` ${terbilang(sisa)}` : ""}`;
}

// Bacakan jumlah kembalian dengan TTS Bahasa Indonesia. Fire-and-forget,
// tidak mengganggu proses pembayaran / cetak struk.
// Suara santai & natural: kecepatan diperlambat + jeda nyaman (koma).
export function speakChange(amount: number): void {
  try {
    if (!amount || amount <= 0) return;
    const words = terbilang(amount).trim().replace(/\s+/g, " ");
    if (!words) return;
    Speech.stop();
    // Koma memberi jeda alami; nominal (words) tidak dipotong.
    Speech.speak(`Total kembalian, ${words}, rupiah.`, {
      language: "id-ID",
      rate: 0.82,
      pitch: 1.0,
    });
  } catch {
    // abaikan error TTS agar tidak mengganggu transaksi
  }
}
