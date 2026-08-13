import * as Speech from "expo-speech";

// Suara feminin: nada lebih tinggi + tempo santai. Pilih otomatis voice
// Bahasa Indonesia bergender perempuan bila tersedia di HP.
let PICKED: string | null = null;
let INITED = false;
async function initVoice(): Promise<void> {
  if (INITED) return;
  INITED = true;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const id = voices.filter((v) => (v.language || "").toLowerCase().startsWith("id"));
    const female =
      id.find((v) => /female|wanita|perempuan|woman/i.test(v.name || "")) ||
      id.find((v) => /#female|_f_|-f-|fem/i.test(v.identifier || "")) ||
      id[0];
    PICKED = female?.identifier || null;
  } catch { PICKED = null; }
}
initVoice();

// Opsi suara feminin & ramah (nada tinggi, tempo santai).
function femaleOpts(rate = 0.85) {
  const o: Speech.SpeechOptions = { language: "id-ID", rate, pitch: 1.18 };
  if (PICKED) o.voice = PICKED;
  return o;
}

// Bacakan teks apa pun dengan suara feminin & kalem (fire-and-forget).
export function speak(text: string, rate = 0.85): void {
  try {
    if (!text) return;
    Speech.stop();
    Speech.speak(text, femaleOpts(rate));
  } catch { /* abaikan */ }
}


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

// Bacakan hasil transaksi dgn suara feminin & ramah. Bila ada kembalian,
// nominal ASLI dibacakan dalam kata (mis. "empat puluh delapan ribu").
export function speakPaymentDone(change: number): void {
  try {
    if (change && change > 0) {
      const words = terbilang(change).trim().replace(/\s+/g, " ");
      speak(`Transaksi berhasil. Kembaliannya, ${words}, rupiah ya, Kak.`, 0.9);
    } else {
      speak("Transaksi berhasil, Kak.", 0.95);
    }
  } catch { /* abaikan */ }
}

// (Dipertahankan) Bacakan hanya jumlah kembalian.
export function speakChange(amount: number): void {
  try {
    if (!amount || amount <= 0) return;
    const words = terbilang(amount).trim().replace(/\s+/g, " ");
    if (!words) return;
    speak(`Kembaliannya, ${words}, rupiah ya, Kak.`, 0.9);
  } catch {
    // abaikan error TTS agar tidak mengganggu transaksi
  }
}
