import * as Speech from "expo-speech";
import { mikoBus } from "./mikoBus";

// Perkiraan durasi ucapan (ms) dari jumlah kata → dipakai sebagai pengaman
// agar animasi "bicara" tetap berhenti walau callback onDone tak terpanggil
// (mis. di preview web TTS tidak berbunyi).
function estSpeakMs(text: string): number {
  const words = (text.trim().match(/\S+/g) || []).length;
  return Math.max(1200, Math.min(12000, Math.round(words * 360) + 500));
}

// Pembungkus terpusat: jalankan TTS + pancarkan sinyal mulai/selesai bicara
// ke mikoBus supaya rig 2.5D bisa menggerakkan mulut selaras dengan suara.
function runSpeech(text: string, opts: any): void {
  try {
    if (!text) return;
    Speech.stop();
    const ms = estSpeakMs(text);
    let ended = false;
    const end = () => { if (ended) return; ended = true; mikoBus.emit({ type: "speak_end" }); };
    mikoBus.emit({ type: "speak_start", ms });
    Speech.speak(text, {
      ...opts,
      onDone: end,
      onStopped: end,
      onError: end,
    });
  } catch { mikoBus.emit({ type: "speak_end" }); }
}

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
  runSpeech(text, femaleOpts(rate));
}


// Suara TENANG untuk Cek Harga: lembut, damai, tempo sedang, volume rendah,
// nyaman didengar berulang. Tanpa efek/alarm. Jeda antar info via titik.
export function speakCalm(text: string): void {
  const opts: any = { language: "id-ID", rate: 0.9, pitch: 1.02, volume: 0.55 };
  if (PICKED) opts.voice = PICKED;
  runSpeech(text, opts);
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

// Bacakan ringkasan pembayaran dengan suara HANGAT & tempo sedang, volume rendah,
// dan jeda singkat antar bagian. Tanpa musik/efek/suara hewan.
// Contoh: "Diterima lima puluh ribu rupiah. Total empat puluh delapan ribu rupiah.
//          Kembalian dua ribu rupiah. Terima kasih."
export function speakPaymentDone(cash: number, total: number, change: number): void {
  try {
    const w = (n: number) => (terbilang(Math.max(0, Math.floor(n))).trim().replace(/\s+/g, " ") || "nol");
    // Titik di antara bagian → jeda alami singkat.
    const text =
      `Diterima ${w(cash)} rupiah. ` +
      `Total ${w(total)} rupiah. ` +
      `Kembalian ${w(change)} rupiah. ` +
      `Terima kasih.`;
    const opts: any = { language: "id-ID", rate: 0.9, pitch: 1.03, volume: 0.6 };
    if (PICKED) opts.voice = PICKED;
    runSpeech(text, opts);
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
