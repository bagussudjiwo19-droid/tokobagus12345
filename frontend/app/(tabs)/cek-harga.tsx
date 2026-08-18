import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { mikoBus, type MikoState } from "@/src/mikoBus";
import { useData } from "@/src/data";
import { familyOptions, childEffective } from "@/src/pricing";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { hasAdminPin, setAdminPin, verifyAdminPin } from "@/src/adminPin";
import { rupiah } from "@/src/format";
import { speakCalm, terbilang } from "@/src/voice";
import { mikoAsk, mikoThinking, collectFacts, searchProductsByName, type ChatCtx } from "@/src/mikoChat";
import { askMikoOnline, type MikoTurn } from "@/src/mikoAI";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Variation, Tier, Settings } from "@/src/types";
import MikoRig from "@/components/MikoRig";

const RESET_MS = 15000;

// Kalimat penutup ramah (dibacakan bergantian) saat Cek Harga menampilkan hasil.
const CLOSINGS: string[] = [
  "Silakan masukkan ke keranjang ya, Kak, siapa tahu kebutuhan di rumah sudah mulai habis.",
  "Kalau cocok, boleh dimasukkan ke keranjang ya, Kak.",
  "Mau beli lebih banyak? Harga grosirnya juga sudah tersedia, Kak.",
  "Silakan dipilih, Kak. Semoga cocok dengan kebutuhannya.",
  "Kalau butuh untuk stok di rumah, bisa ambil lebih banyak ya, Kak.",
  "Cocok untuk persediaan di rumah nih, Kak.",
  "Silakan lanjut belanja, Kak. Miko siap menemani.",
  "Kalau sudah cocok, boleh langsung masukkan ke keranjang ya, Kak.",
  "Kalau memang sedang dibutuhkan, boleh langsung dimasukkan ke keranjang ya, Kak.",
  "Buat persediaan di rumah juga cocok nih, Kak. Silakan dipilih.",
  "Kalau mau sekalian stok, harga grosirnya bisa jadi pilihan, Kak.",
  "Sudah cocok dengan harganya? Boleh langsung masuk keranjang, Kak.",
  "Kalau barangnya memang sedang dicari, jangan lupa masukkan ke keranjang ya, Kak.",
  "Boleh ambil sesuai kebutuhan, Kak. Miko siap bantu cek harga lainnya.",
  "Kalau mau belanja lebih hemat, bisa pertimbangkan jumlah grosirnya ya, Kak.",
  "Silakan lanjut belanjanya, Kak. Siapa tahu masih ada kebutuhan lain di rumah.",
  "Kalau cocok dengan produknya, boleh langsung lanjut ke keranjang ya, Kak.",
  "Mau tambah barang lain juga boleh, Kak. Miko siap menemani.",
  "Semoga harganya cocok ya, Kak. Kalau sudah pas, silakan masukkan ke keranjang.",
  "Nah, kalau sudah sesuai kebutuhan, boleh langsung dimasukkan ke keranjang ya, Kak.",
  "Kalau harganya sudah sesuai, silakan dimasukkan ke keranjang ya, Kak.",
  "Semoga produknya sesuai dengan kebutuhan Kakak.",
  "Kalau ingin sekalian stok di rumah, boleh ambil beberapa ya, Kak.",
  "Harga grosirnya bisa jadi pilihan kalau Kakak ingin membeli lebih banyak.",
  "Silakan dipertimbangkan dulu, Kak. Miko siap membantu.",
  "Kalau cocok dengan produknya, boleh langsung lanjut belanja ya, Kak.",
  "Semoga harga hari ini cocok dengan budget Kakak.",
  "Kalau sedang membutuhkan produk ini, boleh langsung dimasukkan ke keranjang.",
  "Mau cari produk lainnya? Silakan, Miko siap menemani.",
  "Kalau ingin lebih hemat, Kakak bisa melihat pilihan harga grosirnya.",
  "Semoga belanjanya nyaman dan kebutuhan di rumah terpenuhi ya, Kak.",
  "Kalau sudah sesuai, silakan lanjut ke keranjang ya, Kak.",
  "Boleh disimpan untuk pilihan belanja berikutnya, Kak.",
  "Kalau sedang mencari harga yang pas, semoga yang ini cocok ya, Kak.",
  "Silakan pilih jumlah sesuai kebutuhan, Kak.",
  "Kalau kebutuhan di rumah cukup banyak, harga grosirnya bisa dipertimbangkan.",
  "Terima kasih sudah mengecek harga di Toko Bagus, Kak.",
  "Semoga produknya cocok dan belanjanya menyenangkan, Kak.",
  "Kalau sudah menemukan yang dicari, boleh langsung masukkan ke keranjang.",
  "Miko siap membantu kalau Kakak ingin mengecek barang lainnya.",
  "Silakan lanjut mencari kebutuhan lainnya, Kak.",
  "Kalau ingin belanja lebih praktis, produk ini bisa langsung dimasukkan ke keranjang.",
  "Semoga harga yang tampil sesuai dengan yang Kakak cari.",
  "Kalau cocok, jangan ragu untuk memasukkannya ke keranjang ya, Kak.",
  "Mau sekalian lihat barang lainnya? Miko siap menemani.",
  "Semoga belanja hari ini lancar dan menyenangkan ya, Kak.",
  "Kalau ingin persediaan lebih aman di rumah, boleh pertimbangkan membeli beberapa.",
  "Harga sudah Miko tampilkan dengan lengkap, Kak. Silakan dipilih.",
  "Terima kasih sudah berbelanja di Toko Bagus. Semoga harinya menyenangkan.",
  "Kalau sudah cocok, yuk masukkan ke keranjang. Miko siap menemani belanja berikutnya.",
];

// Kalimat saat barcode TIDAK ditemukan (dibacakan + tampil balon, bergantian).
const NOT_FOUND: string[] = [
  "Hmm, barangnya belum ditemukan. Coba tanya Vita dulu ya, Kak.",
  "Barangnya belum ada di data. Mungkin Sasa bisa membantu.",
  "Miko belum menemukan barangnya. Coba tanyakan ke Vita ya.",
  "Barcode-nya belum ditemukan. Mungkin Sasa tahu barangnya.",
  "Sepertinya produk ini belum terdaftar. Coba tanya Vita atau Sasa ya.",
  "Miko belum menemukan produk ini. Mungkin Vita bisa membantu mencarinya.",
  "Barangnya belum muncul, Kak. Coba tanyakan ke Sasa dulu.",
  "Barcode ini belum dikenal Miko. Mungkin Vita tahu produknya.",
  "Hmm, sepertinya barang ini belum masuk data. Coba tanya Sasa ya, Kak.",
  "Miko sudah mencari, tapi barangnya belum ketemu. Mungkin Vita bisa membantu.",
  "Produk ini belum ditemukan, Kak. Coba tanyakan ke Vita atau Sasa.",
  "Barcode-nya belum ada di daftar. Mungkin Sasa bisa cek dulu.",
  "Wah, Miko belum menemukan barangnya. Coba tanya Vita ya.",
  "Barang ini sepertinya belum terdaftar. Mungkin Sasa tahu informasinya.",
  "Miko sudah coba cari, Kak, tapi belum ketemu. Coba tanya Vita atau Sasa.",
  "Produknya belum muncul di sistem. Mungkin Vita bisa membantu mengeceknya.",
  "Hmm, barang ini belum Miko kenali. Coba tanyakan ke Sasa ya.",
  "Barcode sudah discan, tapi produknya belum ditemukan. Mungkin Vita bisa membantu.",
  "Sepertinya data barangnya belum tersedia. Coba tanya Sasa atau Vita ya, Kak.",
  "Miko belum berhasil menemukan produk ini. Jangan khawatir, coba tanya Vita atau Sasa ya.",
];

type ScanResult = { name: string; price: number; unit: string; tiers: Tier[]; variations?: { name: string; price: number }[] };

// Petakan intent jawaban Miko (offline sales) → state animasi rig 2.5D.
function salesToState(intent: string): MikoState {
  switch (intent) {
    case "offer": case "show": case "help": return "SALES_EXPLAIN";
    case "greet": case "thanks": return "HAPPY";
    case "decline": return "IDLE";
    case "price": case "stock": return "POINT";
    case "none": return "CONFUSED";
    default: return "HAPPY";
  }
}

// Koreografi gerak Miko (bukan pose menunjuk yang ditahan terus).
// Hasil harga: antusias ketemu → sebentar menunjuk harga → menjelaskan → ramah.
const STORY_RESULT: { state: MikoState; hold: number }[] = [
  { state: "HAPPY", hold: 850 },
  { state: "POINT", hold: 1200 },
  { state: "SALES_EXPLAIN", hold: 1500 },
];
// Layar pilihan: melihat-lihat (berpikir) → sebentar menunjuk daftar → menjelaskan → ramah.
const STORY_PICK: { state: MikoState; hold: number }[] = [
  { state: "THINKING", hold: 1000 },
  { state: "POINT", hold: 1000 },
  { state: "SALES_EXPLAIN", hold: 1500 },
];


export default function CekHargaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { products, pricePick, setPricePick } = useData();
  const toast = useToast();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [countdown, setCountdown] = useState(0);
  // --- Mode KETIK: cari nama → kartu produk → pilih varian (offline) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);
  const [varProduct, setVarProduct] = useState<Product | null>(null);
  const [noResultQuery, setNoResultQuery] = useState<string | null>(null);
  // --- Kunci PIN Admin untuk kios Cek Harga ---
  const [needCreate, setNeedCreate] = useState(false); // wajib buat PIN saat pertama
  const [cPin, setCPin] = useState("");
  const [cPin2, setCPin2] = useState("");
  const [cErr, setCErr] = useState("");
  const [exitOpen, setExitOpen] = useState(false); // popup peringatan + PIN keluar
  const [xPin, setXPin] = useState("");
  const [xErr, setXErr] = useState("");
  const needCreateRef = useRef(false);
  const exitOpenRef = useRef(false);
  useEffect(() => { needCreateRef.current = needCreate; }, [needCreate]);
  useEffect(() => { exitOpenRef.current = exitOpen; }, [exitOpen]);
  const searchRef = useRef<TextInput>(null);
  const selTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const kbdRef = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastClosing = useRef(-1);
  const lastNF = useRef(-1);
  const navigation = useNavigation();

  // --- Ngobrol dengan Miko (asisten suara, Tahap 1: otak offline) ---
  type ChatMsg = { who: "miko" | "cust"; text: string; card?: Product | null };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatCtx = useRef<ChatCtx>({});
  const chatScrollRef = useRef<ScrollView>(null);
  const sessionId = useRef<string>(`miko-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoClose = () => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  };
  // Setelah Miko selesai menjawab / panel dibuka: 10 dtk tanpa aktivitas → tutup lembut.
  const armAutoClose = () => {
    clearAutoClose();
    autoCloseRef.current = setTimeout(() => {
      autoCloseRef.current = null;
      closeChat();
    }, 10000);
  };

  useEffect(() => () => clearAutoClose(), []);

  const openChat = () => {
    clearTimers();
    setResult(null);
    setCountdown(0);
    sessionId.current = `miko-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const greet = "Halo, Kak! Miko siap bantu cek harga. Tanya saja, misalnya, harga Soklin berapa?";
    chatCtx.current = {};
    setChatMsgs([{ who: "miko", text: greet }]);
    setChatBusy(false);
    setChatInput("");
    setChatOpen(true);
    speakCalm(greet);
    armAutoClose();
  };
  const closeChat = () => {
    clearAutoClose();
    setChatOpen(false);
    setTimeout(() => inputRef.current?.focus(), 150);
  };
  const scrollChat = () => setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);

  // Buang emoji agar tidak ikut terbaca aneh oleh TTS.
  const cleanTTS = (s: string) => s.replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\uFE0F]/gu, "").replace(/\s+/g, " ").trim();

  const askMiko = async (raw: string) => {
    const q = (raw || "").trim();
    if (!q || chatBusy) return;
    clearAutoClose(); // pelanggan bertanya lagi → batalkan timer tutup
    setChatInput("");
    const priorHistory: MikoTurn[] = chatMsgs.map((m) => ({ role: m.who === "miko" ? "miko" : "user", text: m.text }));
    setChatMsgs((m) => [...m, { who: "cust", text: q }]);
    const thinking = mikoThinking();
    setChatMsgs((m) => [...m, { who: "miko", text: thinking }]);
    mikoBus.emit({ type: "miko_state", state: "THINKING" });
    speakCalm(thinking);
    setChatBusy(true);
    scrollChat();

    // 1) MODE SALES OFFLINE (deterministik): kuasai fakta harga/stok, tawaran, & kartu produk.
    const sales = mikoAsk(products, q, chatCtx.current);
    chatCtx.current = sales.ctx;

    if (sales.intent !== "chitchat") {
      // Pertanyaan produk / sales → jawab dari DB lokal (jalan online & offline).
      setChatMsgs((m) => [...m, { who: "miko", text: sales.reply, card: sales.card || null }]);
      mikoBus.emit({ type: "miko_state", state: salesToState(sales.intent) });
      speakCalm(cleanTTS(sales.speak));
      setChatBusy(false);
      scrollChat();
      armAutoClose();
      return;
    }

    // 2) Obrolan bebas / curhat → coba AI ONLINE (natural), fallback ke offline.
    const { facts } = collectFacts(products, q, chatCtx.current);
    try {
      const reply = await askMikoOnline({
        sessionId: sessionId.current,
        message: q,
        facts,
        history: priorHistory.slice(-6),
        shopName: settings?.shopName || "TOKO BAGUS",
      });
      setChatMsgs((m) => [...m, { who: "miko", text: reply }]);
      mikoBus.emit({ type: "miko_state", state: "HAPPY" });
      speakCalm(cleanTTS(reply));
    } catch {
      setChatMsgs((m) => [...m, { who: "miko", text: sales.reply }]);
      mikoBus.emit({ type: "miko_state", state: "HAPPY" });
      speakCalm(cleanTTS(sales.speak));
    } finally {
      setChatBusy(false);
      scrollChat();
      armAutoClose(); // Miko selesai menjawab → mulai hitung 10 dtk untuk tutup otomatis
    }
  };

  // Sembunyikan menu tab bawah saat di kios Cek Harga (pelanggan tak bisa pindah layar).
  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ tabBarStyle: { display: "none" } });
      return () => navigation.setOptions({
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, borderTopWidth: 1,
          height: 60 + insets.bottom, paddingBottom: insets.bottom > 0 ? insets.bottom : 8, paddingTop: 8,
        },
      });
    }, [navigation, insets.bottom]),
  );

  // Bacakan hasil cek harga (suara HP / TTS). Nama + harga ecer + tiap tingkat
  // grosir + kalimat penutup ramah (bergantian). Hanya terdengar di HP/APK build.
  const speakPrice = (name: string, price: number, unit: string, tiers: Tier[]) => {
    // Pengaturan khusus Cek Harga (default aktif bila belum diset).
    const readOn = settings?.readPrice !== false;
    const closingOn = settings?.priceClosing !== false;
    const clean = (s: string) => s.replace(/—/g, " ").replace(/\s+/g, " ").trim();
    const parts: string[] = [];
    if (readOn) {
      parts.push(`${clean(name)}.`, `Harga ${terbilang(price).trim()} rupiah.`);
      const u = unit && unit !== "pcs" ? ` ${unit}` : "";
      tiers.forEach((t) => {
        parts.push(`Beli ${t.min_qty}${u} harganya ${terbilang(t.price).trim()} rupiah.`);
      });
    }
    if (closingOn) {
      let i = Math.floor(Math.random() * CLOSINGS.length);
      if (i === lastClosing.current) i = (i + 1) % CLOSINGS.length;
      lastClosing.current = i;
      // Buang emoji agar tidak ikut terbaca aneh oleh TTS.
      const closing = CLOSINGS[i].replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\uFE0F]/gu, "").trim();
      if (closing) parts.push(closing);
    }
    if (parts.length === 0) return; // kedua suara OFF → diam
    speakCalm(parts.join(" "));
  };

  const clearTimers = () => {
    if (resetTimer.current) { clearTimeout(resetTimer.current); resetTimer.current = null; }
    if (tickTimer.current) { clearInterval(tickTimer.current); tickTimer.current = null; }
    if (selTimer.current) { clearTimeout(selTimer.current); selTimer.current = null; }
  };

  const backToScan = useCallback(() => {
    clearTimers();
    setResult(null);
    setSearchResults(null);
    setVarProduct(null);
    setNoResultQuery(null);
    setSearchQuery("");
    setCountdown(0);
    mikoBus.emit({ type: "miko_state", state: "IDLE" });
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // Timer diam untuk layar pilihan (kartu produk / varian): 15 dtk tanpa aktivitas → kembali ke awal.
  const armSelTimer = () => {
    clearTimers();
    setCountdown(RESET_MS / 1000);
    tickTimer.current = setInterval(() => setCountdown((n) => (n > 1 ? n - 1 : 0)), 1000);
    selTimer.current = setTimeout(() => backToScan(), RESET_MS);
  };

  // Tampilkan hasil untuk satu produk ANAK (harga efektif: ikut induk bila di-set).
  const showResultChild = (child: Product, root: Product) => {
    const eff = childEffective(child, root);
    showResult({ ...child, sell_price: eff.sell_price, tiers: eff.tiers }, null);
  };

  // CEK HARGA: tampilkan SEMUA harga variasi sekaligus (tanpa memilih). Untuk
  // produk ber-variasi (nested variations dan/atau produk anak). Berbeda dgn
  // Transaksi yang tetap memunculkan popup pilih variasi.
  const showResultAll = useCallback((root: Product) => {
    clearTimers();
    const children = products.filter((p) => p.parent_id === root.id);
    const list: { name: string; price: number }[] = [];
    (root.variations || []).forEach((v) => {
      list.push({ name: v.name, price: v.inherit_tiers ? root.sell_price : v.sell_price });
    });
    children.forEach((c) => {
      const eff = childEffective(c, root);
      list.push({ name: c.name, price: eff.sell_price });
    });
    setResult({ name: root.name, price: root.sell_price, unit: root.unit || "pcs", tiers: [], variations: list });
    Haptics.selectionAsync();
    mikoBus.emit({ type: "price_found" });
    // Bacakan semua variasi (TTS) — hanya terdengar di HP/APK build.
    setTimeout(() => {
      const readOn = settings?.readPrice !== false;
      if (readOn) {
        const parts = [`${root.name}.`, ...list.map((it) => `${it.name.replace(/—/g, " ")}, ${terbilang(it.price).trim()} rupiah.`)];
        speakCalm(parts.join(" "));
      }
    }, 120);
    setCountdown(RESET_MS / 1000);
    tickTimer.current = setInterval(() => setCountdown((n) => (n > 1 ? n - 1 : 0)), 1000);
    resetTimer.current = setTimeout(() => backToScan(), RESET_MS);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [products, settings, backToScan]);

  // Tampilkan varian bila LEBIH DARI SATU; 1 varian → langsung hasil; tanpa varian → langsung hasil.
  const pickProduct = (p: Product) => {
    const { root, children } = familyOptions(p, products);
    const vars = root.variations || [];
    const optCount = children.length + vars.length;
    if (optCount > 1) {
      // Cek Harga = lihat semua harga sekaligus (tidak memilih variasi).
      setSearchResults(null);
      setVarProduct(null);
      showResultAll(root);
    } else if (children.length === 1) {
      setSearchResults(null);
      setVarProduct(null);
      showResultChild(children[0], root);
    } else if (vars.length === 1) {
      setSearchResults(null);
      setVarProduct(null);
      showResult(root, vars[0]);
    } else {
      setSearchResults(null);
      setVarProduct(null);
      showResult(root, null);
    }
  };

  const pickVariation = (p: Product, v: Variation) => {
    setVarProduct(null);
    showResult(p, v);
  };

  // Pencarian KETIK (offline, dari DB Kasir lokal). Enter → cari nama.
  const doTextSearch = (raw: string) => {
    const q = (raw || "").trim();
    if (!q) return;
    clearTimers();
    Keyboard.dismiss();
    const found = searchProductsByName(products, q);
    setSearchQuery("");
    if (found.length === 0) {
      setSearchResults(null);
      setVarProduct(null);
      setNoResultQuery(q);
      const msg = `Miko belum menemukan barang "${q}", Kak. Mau coba lagi, atau lihat semua produk?`;
      mikoBus.emit({ type: "say", text: msg, pose: "surprised" });
      speakCalm(msg);
      armSelTimer();
      setTimeout(() => inputRef.current?.focus(), 80);
      return;
    }
    if (found.length === 1) {
      setNoResultQuery(null);
      pickProduct(found[0]);
      return;
    }
    setVarProduct(null);
    setResult(null);
    setNoResultQuery(null);
    setSearchResults(found);
    armSelTimer();
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  // Escape hatch: tampilkan semua produk (dibatasi & urut nama) — hanya bila diminta.
  const showAllProducts = () => {
    const all = [...products].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
    setNoResultQuery(null);
    setVarProduct(null);
    setResult(null);
    setSearchResults(all);
    armSelTimer();
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  // Show a product + sell price, keep it for 15s, then reset to scan mode.
  const showResult = useCallback((product: Product, variation: Variation | null) => {
    clearTimers();
    const useVarOwn = variation && !variation.inherit_tiers;
    const price = useVarOwn ? variation!.sell_price : product.sell_price;
    // Ambil harga grosir LANGSUNG dari data produk/variasi (tidak dihitung sendiri).
    const rawTiers = useVarOwn ? variation!.tiers : product.tiers;
    const tiers = (rawTiers || []).filter((t) => t && t.price > 0).sort((a, b) => a.min_qty - b.min_qty);
    const name = variation ? `${product.name} — ${variation.name}` : product.name;
    setResult({ name, price, unit: product.unit, tiers });
    Haptics.selectionAsync();
    mikoBus.emit({ type: "price_found" });
    // Tunda sedikit agar rig di layar hasil sempat ter-mount & menangkap sinyal
    // bicara → mulut Miko bergerak selaras saat membacakan harga.
    setTimeout(() => speakPrice(name, price, product.unit, tiers), 90);
    setCountdown(RESET_MS / 1000);
    tickTimer.current = setInterval(() => {
      setCountdown((n) => (n > 1 ? n - 1 : 0));
    }, 1000);
    resetTimer.current = setTimeout(() => backToScan(), RESET_MS);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [backToScan]);

  // Auto scan mode: focus the hidden scanner input whenever this tab is focused.
  // Kolom KHUSUS scanner: keyboard HP tidak pernah muncul (manual lewat tombol
  // "Cari Produk Manual").
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      // Muat ulang pengaturan tiap layar dibuka agar toggle suara langsung berlaku.
      api.getSettings().then(setSettings).catch(() => {});
      return () => { clearTimeout(t); clearTimers(); };
    }, []),
  );

  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  useHideScanKeyboard(inputRef, kbdRef);

  // Cek PIN Admin saat masuk kios + INTERCEPT tombol Back Android (APK).
  useFocusEffect(
    useCallback(() => {
      hasAdminPin().then((has) => { needCreateRef.current = !has; setNeedCreate(!has); });
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (needCreateRef.current) return true; // sedang setup PIN → blokir keluar
        if (!exitOpenRef.current) { exitOpenRef.current = true; setXPin(""); setXErr(""); setExitOpen(true); }
        return true; // SELALU cegah keluar default dari kios
      });
      return () => sub.remove();
    }, []),
  );

  // Simpan PIN baru (setup pertama). Tidak disimpan sebagai teks biasa.
  const submitCreatePin = async () => {
    const a = cPin.trim(), b = cPin2.trim();
    if (!/^\d{4,6}$/.test(a)) { setCErr("PIN harus 4–6 angka."); return; }
    if (a !== b) { setCErr("Konfirmasi PIN tidak sama."); return; }
    await setAdminPin(a);
    setCPin(""); setCPin2(""); setCErr("");
    setNeedCreate(false);
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  // Verifikasi PIN untuk KELUAR dari kios.
  const submitExitPin = async () => {
    const ok = await verifyAdminPin(xPin.trim());
    if (ok) {
      setExitOpen(false); setXPin(""); setXErr("");
      router.replace("/");
    } else {
      setXErr("PIN salah.");
      setXPin("");
    }
  };

  // Manual search: when a product is picked on the Cari screen (price mode),
  // it lands here via pricePick — show name + price, then ready to scan again.
  useEffect(() => {
    if (!pricePick) return;
    const product = products.find((p) => p.id === pricePick.productId);
    if (product) {
      const variation = pricePick.variationId
        ? product.variations.find((v) => v.id === pricePick.variationId) || null
        : null;
      showResult(product, variation);
    }
    setPricePick(null);
  }, [pricePick, products, showResult, setPricePick]);

  const handleScan = useCallback(async (code: string) => {
    const c = code.trim();
    inputRef.current?.clear();
    if (!c) { inputRef.current?.focus(); return; }
    clearTimers();
    setSearchResults(null);
    setVarProduct(null);
    setNoResultQuery(null);
    setSearchQuery("");
    try {
      const product = await api.getByBarcode(c);
      // Keluarga: bila punya anak / variasi → tampilkan SEMUA pilihan di dinding.
      const { root, children } = familyOptions(product, products);
      const vars = root.variations || [];
      // VARIASI BARCODE: barcode menentukan satu variasi → tampil nama+harga variasi itu saja.
      const matchedVar = vars.find((v) => v.barcode && v.barcode === c);
      if (matchedVar) {
        showResult(root, matchedVar);
      } else if (children.length + vars.length > 1) {
        // CEK HARGA: langsung tampil SEMUA harga variasi (tanpa layar pilih).
        showResultAll(root);
      } else if (children.length === 1) {
        showResultChild(children[0], root);
      } else if (vars.length === 1) {
        showResult(root, vars[0]);
      } else {
        showResult(root, null);
      }
    } catch {
      setResult(null);
      toast.show(`Barcode ${c} tidak ditemukan`, "error");
      // Balon + suara "belum ditemukan" (arahkan ke kasir Vita/Sasa), bergantian.
      let i = Math.floor(Math.random() * NOT_FOUND.length);
      if (i === lastNF.current) i = (i + 1) % NOT_FOUND.length;
      lastNF.current = i;
      const msg = NOT_FOUND[i];
      mikoBus.emit({ type: "say", text: msg, pose: "surprised" });
      speakCalm(msg.replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\uFE0F]/gu, "").trim());
      // Stay in scan mode, ready for the next barcode.
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showResult, showResultAll, toast, products]);
  // Penerimaan input scanner Bluetooth yang andal (buffer + ENTER/jeda, tanpa terpotong).
  const scan = useBarcodeScan(handleScan, { isScanMode: () => true });

  // Panah kembali (kiri-atas): TIDAK langsung keluar. Munculkan peringatan + PIN.
  const onBack = () => {
    setXPin(""); setXErr(""); setExitOpen(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      {/* Panah kembali kecil di pojok kiri atas (untuk kasir keluar dari kios).
          Disembunyikan saat layar PILIHAN aktif agar tak menumpuk tombol back header. */}
      {!(searchResults || varProduct || noResultQuery) && (
        <Pressable style={[styles.backBtn, { top: insets.top + 6 }]} onPress={onBack} testID="kiosk-back" hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
      )}

      {/* Input scanner Bluetooth tersembunyi — tetap aktif tanpa keyboard HP */}
      <TextInput
        ref={inputRef}
        testID="cekharga-scan-input"
        defaultValue=""
        onChangeText={scan.onChangeText}
        onSubmitEditing={scan.onSubmitEditing}
        blurOnSubmit={false}
        showSoftInputOnFocus={false}
        caretHidden
        style={styles.hiddenInput}
      />

      <View style={styles.body}>
        {result ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultScroll}>
          <View style={styles.resultMiko}>
            <MikoRig size={116} ambient={false} story={STORY_RESULT} rest="WARM" />
          </View>
          <View style={styles.resultCard} testID="cekharga-result">
            <Text style={styles.shopName}>{(settings?.shopName || "TOKO BAGUS").toUpperCase()}</Text>
            <View style={styles.labelRow}>
              <View style={styles.dashRed} />
              <Text style={styles.cekLabel}>CEK HARGA</Text>
              <View style={styles.dashRed} />
            </View>
            <Text style={styles.resultName} numberOfLines={2}>{result.name}</Text>

            {result.variations && result.variations.length > 0 ? (
              /* CEK HARGA produk VARIASI: tampilkan SEMUA harga variasi sekaligus */
              <View style={styles.grosirBox} testID="cekharga-variations">
                <View style={styles.labelRow}>
                  <View style={styles.dashRed} />
                  <Text style={styles.grosirHead}>DAFTAR HARGA</Text>
                  <View style={styles.dashRed} />
                </View>
                {result.variations.map((v, i) => (
                  <View key={i} style={styles.grosirPill} testID={`cekharga-var-${i}`}>
                    <View style={styles.grosirLeft}>
                      <Text style={styles.grosirQty} numberOfLines={2}>{v.name}</Text>
                    </View>
                    <View style={styles.grosirRight}>
                      <Text style={styles.grosirPrice}>{rupiah(v.price)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <>
            {/* HARGA ECER — kartu 3D merah */}
            <View style={styles.ecerPill}>
              <View style={styles.ecerChip}>
                <Text style={styles.ecerChipTxt}>HARGA</Text>
              </View>
              <Text style={styles.ecerPrice}>{rupiah(result.price)}</Text>
            </View>

            {result.tiers.length > 0 && (
              <View style={styles.grosirBox} testID="cekharga-grosir">
                <View style={styles.labelRow}>
                  <View style={styles.dashGreen} />
                  <Text style={styles.grosirHead}>HARGA GROSIR</Text>
                  <View style={styles.dashGreen} />
                </View>
                {result.tiers.map((t, i) => (
                  <View key={i} style={styles.grosirPill}>
                    <View style={styles.grosirLeft}>
                      <Text style={styles.grosirQty}>Mulai {t.min_qty} {result.unit}</Text>
                    </View>
                    <View style={styles.grosirRight}>
                      <Text style={styles.grosirPrice}>{rupiah(t.price)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
              </>
            )}

            <View style={styles.countdownRow}>
              <Ionicons name="time-outline" size={16} color={colors.muted} />
              <Text style={styles.countdownTxt}>Kembali otomatis dalam {countdown}s</Text>
            </View>
          </View>
          </ScrollView>
        ) : varProduct ? (
          // PILIH VARIAN: tombol besar tiap ukuran/varian (offline)
          <View style={styles.pickWrap}>
            <View style={styles.pickHeader}>
              <Pressable onPress={backToScan} style={styles.pickBack} testID="pick-back" hitSlop={8}>
                <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickTitle} numberOfLines={1}>{varProduct.name}</Text>
                <Text style={styles.pickSub}>Pilih ukuran / varian</Text>
              </View>
              <View style={styles.pickMiko}>
                <MikoRig size={92} ambient={false} story={STORY_PICK} rest="WARM" />
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.pickList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {products.filter((p) => p.parent_id === varProduct.id).map((child) => {
                const eff = childEffective(child, varProduct);
                return (
                  <Pressable key={child.id} style={styles.pickCard} onPress={() => showResultChild(child, varProduct)} testID={`var-child-${child.id}`}>
                    <Text style={styles.pickCardName} numberOfLines={2}>{child.name}</Text>
                    <Text style={styles.pickCardPrice}>{rupiah(eff.sell_price)}</Text>
                    <Ionicons name="chevron-forward" size={24} color={colors.brand} />
                  </Pressable>
                );
              })}
              {varProduct.variations.map((v) => {
                const price = v.inherit_tiers ? varProduct.sell_price : v.sell_price;
                return (
                  <Pressable key={v.id} style={styles.pickCard} onPress={() => pickVariation(varProduct, v)} testID={`var-${v.id}`}>
                    <Text style={styles.pickCardName} numberOfLines={2}>{v.name}</Text>
                    <Text style={styles.pickCardPrice}>{rupiah(price)}</Text>
                    <Ionicons name="chevron-forward" size={24} color={colors.brand} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.countdownRow}>
              <Ionicons name="time-outline" size={16} color={colors.muted} />
              <Text style={styles.countdownTxt}>Kembali otomatis dalam {countdown}s</Text>
            </View>
          </View>
        ) : searchResults ? (
          // PILIH BARANG: beberapa hasil pencarian ketik → kartu besar
          <View style={styles.pickWrap}>
            <View style={styles.pickHeader}>
              <Pressable onPress={backToScan} style={styles.pickBack} testID="pick-back" hitSlop={8}>
                <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickTitle}>Pilih Barang</Text>
                <Text style={styles.pickSub}>{searchResults.length} barang ditemukan</Text>
              </View>
              <View style={styles.pickMiko}>
                <MikoRig size={92} ambient={false} story={STORY_PICK} rest="WARM" />
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.pickList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {searchResults.map((p) => {
                const { root, children } = familyOptions(p, products);
                const vars = root.variations || [];
                const optCount = children.length + vars.length;
                const hasMulti = optCount > 1;
                let price = root.sell_price;
                if (optCount === 1) {
                  if (children.length === 1) price = childEffective(children[0], root).sell_price;
                  else price = vars[0].inherit_tiers ? root.sell_price : vars[0].sell_price;
                }
                return (
                  <Pressable key={p.id} style={styles.pickCard} onPress={() => pickProduct(p)} testID={`prod-${p.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickCardName} numberOfLines={2}>{p.name}</Text>
                      <Text style={styles.pickCardSub}>{hasMulti ? `${optCount} pilihan ukuran` : rupiah(price)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={colors.brand} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.countdownRow}>
              <Ionicons name="time-outline" size={16} color={colors.muted} />
              <Text style={styles.countdownTxt}>Kembali otomatis dalam {countdown}s</Text>
            </View>
          </View>
        ) : noResultQuery ? (
          // BELUM KETEMU: pesan + opsi (jangan tampilkan seluruh DB otomatis)
          <View style={styles.pickWrap}>
            <View style={styles.pickHeader}>
              <Pressable onPress={backToScan} style={styles.pickBack} testID="pick-back" hitSlop={8}>
                <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickTitle}>Belum Ketemu</Text>
                <Text style={styles.pickSub} numberOfLines={1}>&quot;{noResultQuery}&quot; tidak ditemukan</Text>
              </View>
            </View>
            <View style={styles.nrBody}>
              <Ionicons name="search-outline" size={48} color={colors.brandTertiary} />
              <Text style={styles.nrMsg}>Miko belum menemukan barang &quot;{noResultQuery}&quot;, Kak.</Text>
              <Pressable style={styles.nrBtnPrimary} onPress={backToScan} testID="nr-retry">
                <Ionicons name="create-outline" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.nrBtnPrimaryTxt}>Coba Cari Lagi</Text>
              </Pressable>
              <Pressable style={styles.nrBtnSecondary} onPress={showAllProducts} testID="nr-showall">
                <Ionicons name="grid-outline" size={20} color={colors.brand} />
                <Text style={styles.nrBtnSecondaryTxt}>Tampilkan Semua Produk</Text>
              </Pressable>
            </View>
            <View style={styles.countdownRow}>
              <Ionicons name="time-outline" size={16} color={colors.muted} />
              <Text style={styles.countdownTxt}>Kembali otomatis dalam {countdown}s</Text>
            </View>
          </View>
        ) : (
          // Tampilan kios: layar penuh, hanya tombol Scan Barcode di tengah. Bawah kosong.
          <View style={styles.kioskIdle}>
            <Text style={styles.kioskTitle}>{(settings?.shopName || "TOKO BAGUS").toUpperCase()}</Text>
            <Text style={styles.kioskSub}>Cek Harga Mandiri</Text>

            {/* Cari dengan ketik: nama barang lalu Enter (offline) */}
            <View style={styles.searchRow}>
              <Ionicons name="search" size={20} color={colors.muted} />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Ketik nama barang lalu Enter…"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                onSubmitEditing={() => doTextSearch(searchQuery)}
                testID="cekharga-search-input"
              />
              <Pressable style={styles.searchBtn} onPress={() => doTextSearch(searchQuery)} testID="cekharga-search-btn">
                <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
              </Pressable>
            </View>

            {/* Panggung Miko: Miko berdiri di atas pedestal, menyapa pelanggan */}
            <View style={styles.stage}>
              <View style={styles.spotlight} />
              <View style={styles.pedestal} />
              <View style={styles.pedestalTop} />
              <View style={styles.mikoSlot}>
                <MikoRig />
              </View>
            </View>

            <View style={styles.scanNote}>
              <Text style={styles.scanNoteTitle}>👋 Mau cek harga?</Text>
              <Text style={styles.scanNoteLine}>📱 Ada barcode? Arahkan ke scanner.</Text>
              <Text style={styles.scanNoteLine}>⌨️ Tidak ada barcode? Ketik nama barang.</Text>
              <Text style={styles.scanNoteFoot}>Miko akan membantu menemukan harga untuk Kakak. 😊</Text>
            </View>
          </View>
        )}
      </View>

      {/* Panel Ngobrol dengan Miko (asisten harga). Ketik di preview; di HP pakai suara. */}
      <Modal visible={chatOpen} transparent animationType="slide" onRequestClose={closeChat}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.chatBackdrop}
        >
          <View style={[styles.chatSheet, { paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.chatHead}>
              <View style={styles.chatMikoDot}>
                <Ionicons name="happy" size={22} color={colors.brand} />
              </View>
              <Text style={styles.chatTitle}>Ngobrol dengan Miko</Text>
              <Pressable onPress={closeChat} style={styles.chatClose} testID="miko-chat-close" hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.chatMikoStage}>
              <MikoRig size={132} ambient={false} />
            </View>

            <ScrollView
              ref={chatScrollRef}
              style={styles.chatLog}
              contentContainerStyle={{ padding: spacing.md, gap: 8 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {chatMsgs.map((m, i) => {
                const card = m.card;
                return (
                  <View key={i} style={{ gap: 6, alignItems: m.who === "miko" ? "flex-start" : "flex-end", width: "100%" }}>
                    {!!m.text && (
                      <View style={[styles.bubble, m.who === "miko" ? styles.bubbleMiko : styles.bubbleCust]}>
                        <Text style={m.who === "miko" ? styles.bubbleMikoTxt : styles.bubbleCustTxt}>{m.text}</Text>
                      </View>
                    )}
                    {card && (
                      <Pressable
                        style={styles.chatCard}
                        onPress={() => { closeChat(); setTimeout(() => pickProduct(card), 260); }}
                        testID={`chat-card-${card.id}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.chatCardName} numberOfLines={2}>{card.name}</Text>
                          <Text style={styles.chatCardPrice}>{rupiah(card.sell_price)}</Text>
                        </View>
                        <View style={styles.chatCardBtn}>
                          <Text style={styles.chatCardBtnTxt}>Lihat</Text>
                          <Ionicons name="chevron-forward" size={18} color={colors.onBrandPrimary} />
                        </View>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {chatBusy && (
                <View style={[styles.bubble, styles.bubbleMiko]}>
                  <ActivityIndicator color={colors.brand} />
                </View>
              )}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={(t) => {
                  setChatInput(t);
                  if (t) clearAutoClose(); // sedang mengetik → jangan tutup dulu
                }}
                placeholder="Ketik pertanyaan… (di HP nanti pakai suara)"
                placeholderTextColor={colors.muted}
                onSubmitEditing={() => askMiko(chatInput)}
                returnKeyType="send"
                blurOnSubmit={false}
                testID="miko-chat-input"
              />
              <Pressable style={styles.chatSend} onPress={() => askMiko(chatInput)} testID="miko-chat-send">
                <Ionicons name="send" size={20} color={colors.onBrandPrimary} />
              </Pressable>
            </View>
            <Text style={styles.chatHint}>{`Contoh: "harga Soklin berapa?" · "stok beras" · "ada yang lebih murah?"`}</Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Buat PIN Admin (setup pertama, wajib). PIN disimpan aman (hash). */}
      <Modal visible={needCreate} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <View style={styles.pinIconWrap}><Ionicons name="lock-closed" size={26} color={colors.brand} /></View>
            <Text style={styles.pinTitle}>Buat PIN Admin</Text>
            <Text style={styles.pinDesc}>Sekali saja. PIN ini dipakai admin untuk keluar dari mode Cek Harga (kios). Simpan baik-baik ya, Kak.</Text>
            <TextInput
              style={styles.pinInput}
              value={cPin}
              onChangeText={(t) => { setCPin(t.replace(/\D/g, "")); setCErr(""); }}
              placeholder="Buat PIN (4–6 angka)"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              testID="create-pin-1"
            />
            <TextInput
              style={styles.pinInput}
              value={cPin2}
              onChangeText={(t) => { setCPin2(t.replace(/\D/g, "")); setCErr(""); }}
              placeholder="Konfirmasi PIN"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              onSubmitEditing={submitCreatePin}
              testID="create-pin-2"
            />
            {!!cErr && <Text style={styles.pinErr}>{cErr}</Text>}
            <Pressable style={styles.pinPrimary} onPress={submitCreatePin} testID="create-pin-save">
              <Text style={styles.pinPrimaryTxt}>Simpan PIN</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/")} hitSlop={8} testID="create-pin-cancel">
              <Text style={styles.pinCancel}>Nanti saja (keluar)</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL: Peringatan + PIN untuk KELUAR dari kios. */}
      <Modal visible={exitOpen} transparent animationType="fade" onRequestClose={() => { setExitOpen(false); setXPin(""); setXErr(""); }}>
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <View style={styles.pinIconWrap}><Ionicons name="shield-checkmark" size={26} color={colors.brand} /></View>
            <Text style={styles.pinTitle}>Keluar dari Cek Harga?</Text>
            <Text style={styles.pinDesc}>
              Miko dibuat dan dirancang oleh Mas Bagus untuk tetap berada di menu Cek Harga agar pelanggan dapat menggunakan Miko dengan nyaman. Jika Kakak memang ingin keluar dari menu ini, silakan masukkan PIN Admin.
            </Text>
            <TextInput
              style={styles.pinInput}
              value={xPin}
              onChangeText={(t) => { setXPin(t.replace(/\D/g, "")); setXErr(""); }}
              placeholder="Masukkan PIN Admin"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              onSubmitEditing={submitExitPin}
              testID="exit-pin-input"
            />
            {!!xErr && <Text style={styles.pinErr}>{xErr}</Text>}
            <View style={styles.pinRow}>
              <Pressable style={styles.pinGhost} onPress={() => { setExitOpen(false); setXPin(""); setXErr(""); setTimeout(() => inputRef.current?.focus(), 120); }} testID="exit-pin-cancel">
                <Text style={styles.pinGhostTxt}>Batal</Text>
              </Pressable>
              <Pressable style={styles.pinPrimaryHalf} onPress={submitExitPin} testID="exit-pin-confirm">
                <Text style={styles.pinPrimaryTxt}>Keluar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  scanModeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 56, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong, paddingLeft: 6, paddingRight: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.sm, shadowColor: colors.brand, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  scanIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  scanModeInput: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  backBtn: { position: "absolute", left: 10, zIndex: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  flipBtn: { position: "absolute", right: 10, zIndex: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0, top: 0, left: 0 },
  resultScroll: { flexGrow: 1, justifyContent: "center", paddingVertical: spacing.xl },
  kioskIdle: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  kioskTitle: { fontFamily: font.display, fontSize: 34, color: colors.brand, letterSpacing: 1, textAlign: "center" },
  kioskSub: { fontFamily: font.medium, fontSize: fontSize.lg, color: colors.muted, marginBottom: spacing.lg },
  stage: { width: "100%", height: 300, alignItems: "center", justifyContent: "flex-end", marginBottom: spacing.md },
  spotlight: { position: "absolute", bottom: 24, width: 210, height: 210, borderRadius: 105, backgroundColor: colors.brandTertiary, opacity: 0.4 },
  pedestal: { position: "absolute", bottom: 8, width: 176, height: 34, borderRadius: 18, backgroundColor: colors.brandSecondary, borderBottomWidth: 7, borderBottomColor: colors.brand, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  pedestalTop: { position: "absolute", bottom: 30, width: 150, height: 16, borderRadius: 10, backgroundColor: colors.surfaceSecondary, opacity: 0.95 },
  mikoSlot: { position: "absolute", bottom: 26, alignSelf: "center" },
  scanBigBtn: { minWidth: 240, paddingHorizontal: spacing.xl, paddingVertical: 20, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderBottomWidth: 8, borderBottomColor: colors.brandSecondary, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  scanBigTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: 28, letterSpacing: 2, textAlign: "center" },
  scanNote: { alignSelf: "stretch", gap: 8, maxWidth: 440, marginTop: spacing.xl, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.brandTertiary },
  scanNoteTitle: { color: colors.brand, fontFamily: font.display, fontSize: fontSize.xl, textAlign: "center", marginBottom: 2 },
  scanNoteLine: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg, lineHeight: 26, textAlign: "center" },
  scanNoteFoot: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.base, lineHeight: 22, textAlign: "center", marginTop: 4 },

  // Modal PIN Admin
  pinBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  pinCard: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  pinIconWrap: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  pinTitle: { fontFamily: font.display, fontSize: fontSize.xl, color: colors.onSurface, textAlign: "center" },
  pinDesc: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 19, marginBottom: spacing.sm },
  pinInput: { width: "100%", height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.lg, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl, textAlign: "center", letterSpacing: 6 },
  pinErr: { color: colors.error, fontFamily: font.medium, fontSize: fontSize.sm, textAlign: "center" },
  pinPrimary: { width: "100%", height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  pinPrimaryHalf: { flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  pinPrimaryTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  pinCancel: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm, marginTop: spacing.md, textDecorationLine: "underline" },
  pinRow: { flexDirection: "row", gap: spacing.sm, width: "100%", marginTop: spacing.sm },
  pinGhost: { flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  pinGhostTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },

  // Kolom pencarian ketik (idle)
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, width: "100%", maxWidth: 420, marginTop: spacing.lg, paddingLeft: spacing.md, paddingRight: 6, height: 54, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brandTertiary, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  searchBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },

  // Layar pilihan (kartu produk / varian)
  pickWrap: { flex: 1, width: "100%", paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  pickHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.md },
  pickBack: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  pickTitle: { fontFamily: font.display, fontSize: fontSize.xl, color: colors.onSurface, letterSpacing: 0.5 },
  pickSub: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  pickList: { gap: spacing.sm, paddingBottom: spacing.xl },
  pickCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 68, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brandTertiary, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  pickCardName: { flex: 1, fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface },
  pickCardSub: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  pickCardPrice: { fontFamily: font.display, fontSize: fontSize.lg, color: colors.brand },

  askBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minWidth: 240, paddingHorizontal: spacing.xl, paddingVertical: 16, borderRadius: 26, backgroundColor: colors.brand, borderBottomWidth: 6, borderBottomColor: colors.brandSecondary, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  askTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: 24, letterSpacing: 2 },

  // Panel Ngobrol dengan Miko
  chatBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  chatSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "82%", minHeight: "58%", paddingTop: spacing.md },
  chatHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  chatMikoDot: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  chatTitle: { flex: 1, fontFamily: font.bold, fontSize: fontSize.xl, color: colors.onSurface },
  chatClose: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  chatLog: { flex: 1 },
  chatMikoStage: { alignItems: "center", justifyContent: "flex-end", height: 140, marginTop: 4 },
  resultMiko: { alignItems: "center", justifyContent: "flex-end", height: 122, marginBottom: 2 },
  pickMiko: { width: 92, height: 96, alignItems: "center", justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 18 },
  bubbleMiko: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderTopLeftRadius: 4 },
  bubbleCust: { alignSelf: "flex-end", backgroundColor: colors.brand, borderTopRightRadius: 4 },
  bubbleMikoTxt: { color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base, lineHeight: 21 },
  bubbleCustTxt: { color: colors.onBrandPrimary, fontFamily: font.medium, fontSize: fontSize.base, lineHeight: 21 },
  // Kartu produk di dalam chat (hasil tawaran sales Miko)
  chatCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "flex-start", maxWidth: "88%", paddingLeft: spacing.md, paddingRight: 6, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brandTertiary },
  chatCardName: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  chatCardPrice: { fontFamily: font.display, fontSize: fontSize.lg, color: colors.brand, marginTop: 2 },
  chatCardBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.brand },
  chatCardBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.sm },
  // Layar "belum ketemu"
  nrBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  nrMsg: { textAlign: "center", fontFamily: font.medium, fontSize: fontSize.lg, color: colors.onSurface, marginBottom: spacing.sm },
  nrBtnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, width: "100%", maxWidth: 320, height: 54, borderRadius: radius.pill, backgroundColor: colors.brand },
  nrBtnPrimaryTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  nrBtnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, width: "100%", maxWidth: 320, height: 54, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brand },
  nrBtnSecondaryTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  chatInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  chatInput: { flex: 1, height: 50, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base },
  chatSend: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  chatHint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, textAlign: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  camOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 20 },
  camFrame: { position: "absolute", top: "30%", left: "12%", right: "12%", height: "26%", borderWidth: 3, borderColor: "#7CFC00", borderRadius: 16 },
  camHint: { position: "absolute", alignSelf: "center", color: "#FFFFFF", fontFamily: font.bold, fontSize: fontSize.lg, textShadowColor: "#000", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  resultCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 28, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.lg, alignItems: "center", shadowColor: "#B0757F", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  shopName: { color: colors.brand, fontFamily: font.display, fontSize: 24, letterSpacing: 1, textAlign: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: 2 },
  dashRed: { width: 26, height: 3, borderRadius: 2, backgroundColor: colors.brand },
  dashGreen: { width: 26, height: 3, borderRadius: 2, backgroundColor: colors.success },
  cekLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xl, letterSpacing: 3, textShadowColor: "rgba(176,42,32,0.3)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 },
  resultName: { color: colors.onSurface, fontFamily: font.display, fontSize: 26, lineHeight: 30, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.xs },

  // HARGA ECER — pil 3D merah
  ecerPill: { alignSelf: "stretch", backgroundColor: colors.brand, borderRadius: 24, paddingTop: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.md, alignItems: "center", borderBottomWidth: 8, borderBottomColor: colors.brandSecondary, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8, marginTop: spacing.sm },
  ecerChip: { backgroundColor: "#FFFFFF", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 22, borderBottomWidth: 3, borderBottomColor: "#E8D2CE", marginBottom: 4 },
  ecerChipTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base, letterSpacing: 3 },
  ecerPrice: { color: "#FFFFFF", fontFamily: font.display, fontSize: 52, lineHeight: 58, letterSpacing: 1, textShadowColor: "rgba(0,0,0,0.28)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 2 },

  // HARGA GROSIR — pil 3D hijau dua nada
  grosirBox: { alignSelf: "stretch", marginTop: spacing.lg },
  grosirHead: { color: colors.success, fontFamily: font.bold, fontSize: fontSize.lg, letterSpacing: 2, textAlign: "center" },
  grosirPill: { flexDirection: "row", alignSelf: "stretch", borderRadius: 20, marginTop: spacing.md, borderBottomWidth: 6, borderBottomColor: "#0B5C33", overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  grosirLeft: { flex: 1, backgroundColor: colors.success, paddingVertical: 16, paddingHorizontal: 18, justifyContent: "center" },
  grosirRight: { minWidth: 128, backgroundColor: "#FFFFFF", paddingVertical: 16, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  grosirQty: { color: "#FFFFFF", fontFamily: font.bold, fontSize: fontSize.base },
  grosirPrice: { color: colors.success, fontFamily: font.display, fontSize: 26, letterSpacing: 0.5 },

  countdownRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xl },
  countdownTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  againBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 60, borderRadius: 20, backgroundColor: colors.brand, alignSelf: "stretch", marginTop: spacing.md, borderBottomWidth: 6, borderBottomColor: colors.brandSecondary, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  againTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.xl },
});
