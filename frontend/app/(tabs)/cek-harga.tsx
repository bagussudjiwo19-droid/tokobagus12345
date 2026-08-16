import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { mikoBus } from "@/src/mikoBus";
import { useData } from "@/src/data";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { speakCalm, terbilang } from "@/src/voice";
import { mikoAsk, mikoThinking, collectFacts, searchProductsByName, type ChatCtx } from "@/src/mikoChat";
import { askMikoOnline, type MikoTurn } from "@/src/mikoAI";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Variation, Tier, Settings } from "@/src/types";
import Miko from "@/components/Miko";

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

type ScanResult = { name: string; price: number; unit: string; tiers: Tier[] };

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
  type ChatMsg = { who: "miko" | "cust"; text: string };
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
    speakCalm(thinking);
    setChatBusy(true);
    scrollChat();

    // Fakta produk dari DB lokal (anti-ngarang) + perbarui konteks untuk follow-up.
    const { facts, best, matches } = collectFacts(products, q, chatCtx.current);
    if (best) chatCtx.current = { lastProduct: best, lastMatches: matches, lastName: q, at: Date.now() };

    try {
      // ONLINE dulu: AI percakapan penuh (butuh internet + server).
      const reply = await askMikoOnline({
        sessionId: sessionId.current,
        message: q,
        facts,
        history: priorHistory.slice(-6),
        shopName: settings?.shopName || "TOKO BAGUS",
      });
      setChatMsgs((m) => [...m, { who: "miko", text: reply }]);
      speakCalm(cleanTTS(reply));
    } catch {
      // OFFLINE / server mati → mesin percakapan offline (terbatas).
      const res = mikoAsk(products, q, chatCtx.current);
      chatCtx.current = res.ctx;
      setChatMsgs((m) => [...m, { who: "miko", text: res.reply }]);
      speakCalm(cleanTTS(res.speak));
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
    setSearchQuery("");
    setCountdown(0);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // Timer diam untuk layar pilihan (kartu produk / varian): 15 dtk tanpa aktivitas → kembali ke awal.
  const armSelTimer = () => {
    clearTimers();
    setCountdown(RESET_MS / 1000);
    tickTimer.current = setInterval(() => setCountdown((n) => (n > 1 ? n - 1 : 0)), 1000);
    selTimer.current = setTimeout(() => backToScan(), RESET_MS);
  };

  // Tampilkan varian bila LEBIH DARI SATU; 1 varian → langsung hasil; tanpa varian → langsung hasil.
  const pickProduct = (p: Product) => {
    const vars = p.variations || [];
    if (vars.length > 1) {
      setSearchResults(null);
      setVarProduct(p);
      armSelTimer();
      setTimeout(() => inputRef.current?.focus(), 60);
    } else if (vars.length === 1) {
      setSearchResults(null);
      setVarProduct(null);
      showResult(p, vars[0]);
    } else {
      setSearchResults(null);
      setVarProduct(null);
      showResult(p, null);
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
      const msg = `Hmm, Miko belum menemukan "${q}", Kak. Coba ketik nama lain, atau tanya kasir Vita dan Sasa ya.`;
      mikoBus.emit({ type: "say", text: msg, pose: "surprised" });
      speakCalm(msg);
      setTimeout(() => inputRef.current?.focus(), 80);
      return;
    }
    if (found.length === 1) {
      pickProduct(found[0]);
      return;
    }
    setVarProduct(null);
    setResult(null);
    setSearchResults(found);
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
    speakPrice(name, price, product.unit, tiers);
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
    setSearchQuery("");
    try {
      const product = await api.getByBarcode(c);
      const variation = product.variations?.find((v) => v.barcode === c) || null;
      showResult(product, variation);
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
  }, [showResult, toast]);
  // Penerimaan input scanner Bluetooth yang andal (buffer + ENTER/jeda, tanpa terpotong).
  const scan = useBarcodeScan(handleScan, { isScanMode: () => true });

  // Panah kembali (kiri-atas): keluar kios ke Transaksi.
  const onBack = () => {
    router.replace("/");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      {/* Panah kembali kecil di pojok kiri atas (untuk kasir keluar dari kios) */}
      <Pressable style={[styles.backBtn, { top: insets.top + 6 }]} onPress={onBack} testID="kiosk-back" hitSlop={10}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
      </Pressable>

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
          <View style={styles.resultCard} testID="cekharga-result">
            <Text style={styles.shopName}>{(settings?.shopName || "TOKO BAGUS").toUpperCase()}</Text>
            <View style={styles.labelRow}>
              <View style={styles.dashRed} />
              <Text style={styles.cekLabel}>CEK HARGA</Text>
              <View style={styles.dashRed} />
            </View>
            <Text style={styles.resultName} numberOfLines={2}>{result.name}</Text>

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
            </View>
            <ScrollView contentContainerStyle={styles.pickList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
            </View>
            <ScrollView contentContainerStyle={styles.pickList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {searchResults.map((p) => {
                const vars = p.variations || [];
                const hasMulti = vars.length > 1;
                const single = vars.length === 1 ? vars[0] : null;
                const price = single ? (single.inherit_tiers ? p.sell_price : single.sell_price) : p.sell_price;
                return (
                  <Pressable key={p.id} style={styles.pickCard} onPress={() => pickProduct(p)} testID={`prod-${p.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickCardName} numberOfLines={2}>{p.name}</Text>
                      <Text style={styles.pickCardSub}>{hasMulti ? `${vars.length} pilihan ukuran` : rupiah(price)}</Text>
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
                <Miko mode="stage" />
              </View>
            </View>

            {/* Tombol besar: pelanggan bisa ngobrol/tanya harga langsung ke Miko */}
            <Pressable style={styles.askBtn} onPress={openChat} testID="tanya-miko">
              <Ionicons name="chatbubbles" size={24} color={colors.onBrandPrimary} />
              <Text style={styles.askTxt}>TANYA MIKO</Text>
            </Pressable>

            <View style={styles.scanNote}>
              <Ionicons name="information-circle-outline" size={16} color={colors.brand} style={{ marginTop: 1 }} />
              <Text style={styles.scanNoteTxt}>
                Ambil scanner di bawah HP, tekan tombolnya sekali dan tunggu bunyi tanda siap. Setelah berbunyi, arahkan scanner ke barcode barang untuk mengecek harga.
              </Text>
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

            <ScrollView
              ref={chatScrollRef}
              style={styles.chatLog}
              contentContainerStyle={{ padding: spacing.md, gap: 8 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {chatMsgs.map((m, i) => (
                <View key={i} style={[styles.bubble, m.who === "miko" ? styles.bubbleMiko : styles.bubbleCust]}>
                  <Text style={m.who === "miko" ? styles.bubbleMikoTxt : styles.bubbleCustTxt}>{m.text}</Text>
                </View>
              ))}
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
  scanNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, maxWidth: 300, marginTop: spacing.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandTertiary },
  scanNoteTxt: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 17, textAlign: "left" },

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
  bubble: { maxWidth: "82%", paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 18 },
  bubbleMiko: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderTopLeftRadius: 4 },
  bubbleCust: { alignSelf: "flex-end", backgroundColor: colors.brand, borderTopRightRadius: 4 },
  bubbleMikoTxt: { color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base, lineHeight: 21 },
  bubbleCustTxt: { color: colors.onBrandPrimary, fontFamily: font.medium, fontSize: fontSize.base, lineHeight: 21 },
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
