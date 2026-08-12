import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Variation, Tier, Settings } from "@/src/types";

const RESET_MS = 15000;

type ScanResult = { name: string; price: number; unit: string; tiers: Tier[] };

export default function CekHargaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { products, pricePick, setPricePick } = useData();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [kbd, setKbd] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const skipBlur = useRef(false);
  const kbdRef = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (resetTimer.current) { clearTimeout(resetTimer.current); resetTimer.current = null; }
    if (tickTimer.current) { clearInterval(tickTimer.current); tickTimer.current = null; }
  };

  const backToScan = useCallback(() => {
    clearTimers();
    setResult(null);
    setCountdown(0);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

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
    setCountdown(RESET_MS / 1000);
    tickTimer.current = setInterval(() => {
      setCountdown((n) => (n > 1 ? n - 1 : 0));
    }, 1000);
    resetTimer.current = setTimeout(() => backToScan(), RESET_MS);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [backToScan]);

  // Auto scan mode: focus the hidden scanner input whenever this tab is focused.
  useFocusEffect(
    useCallback(() => {
      setKbd(false);
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => { clearTimeout(t); clearTimers(); };
    }, []),
  );

  // Keyboard HP hanya muncul saat kolom disentuh; saat scan tetap tanpa keyboard.
  const openKeyboard = useCallback(() => {
    setKbd(true);
    kbdRef.current = true;
    skipBlur.current = true;
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  useEffect(() => { kbdRef.current = kbd; }, [kbd]);
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
    try {
      const product = await api.getByBarcode(c);
      const variation = product.variations?.find((v) => v.barcode === c) || null;
      showResult(product, variation);
    } catch {
      setResult(null);
      // Stay in scan mode, ready for the next barcode.
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showResult]);
  // Penerimaan input scanner Bluetooth yang andal (buffer + ENTER/jeda, tanpa terpotong).
  const scan = useBarcodeScan(handleScan, { isScanMode: () => !kbdRef.current });

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Cek Harga</Text>
        <Text style={styles.subtitle}>Arahkan scanner ke barcode untuk lihat harga</Text>
      </View>

      {/* Mode scan aktif — input tersembunyi untuk scanner Bluetooth (tanpa keyboard HP) */}
      <Pressable style={styles.scanModeBox} onPress={openKeyboard}>
        <Ionicons name="barcode-outline" size={20} color={colors.brand} />
        <TextInput
          ref={inputRef}
          testID="cekharga-scan-input"
          defaultValue=""
          onChangeText={scan.onChangeText}
          onPressIn={openKeyboard}
          onSubmitEditing={() => { setKbd(false); scan.onSubmitEditing(); }}
          onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } setKbd(false); }}
          blurOnSubmit={false}
          showSoftInputOnFocus={kbd}
          caretHidden={!kbd}
          placeholder="Mode scan aktif — arahkan scanner ke barcode"
          placeholderTextColor={colors.muted}
          style={styles.scanModeInput}
        />
        <View style={styles.readyDot} />
      </Pressable>

      <View style={styles.body}>
        {result ? (
          <View style={styles.resultCard} testID="cekharga-result">
            <Text style={styles.shopName}>{(settings?.shopName || "TOKO BAGUS").toUpperCase()}</Text>
            <Text style={styles.resultLabel}>CEK HARGA</Text>
            <Text style={styles.resultName} numberOfLines={3}>{result.name}</Text>

            <Text style={styles.ecerLabel}>HARGA ECER</Text>
            <Text style={styles.resultPrice}>{rupiah(result.price)}</Text>

            {result.tiers.length > 0 && (
              <View style={styles.grosirBox} testID="cekharga-grosir">
                <Text style={styles.grosirHead}>HARGA GROSIR</Text>
                {result.tiers.map((t, i) => (
                  <View key={i} style={styles.grosirRow}>
                    <Text style={styles.grosirQty}>Mulai {t.min_qty} {result.unit}</Text>
                    <Text style={styles.grosirPrice}>{rupiah(t.price)}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.countdownRow}>
              <Ionicons name="time-outline" size={16} color={colors.muted} />
              <Text style={styles.countdownTxt}>Reset otomatis dalam {countdown}s · siap scan berikutnya</Text>
            </View>
            <Pressable style={styles.againBtn} onPress={backToScan} testID="cekharga-again">
              <Ionicons name="barcode-outline" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.againTxt}>Scan Barang Lain</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.idle}>
            <Ionicons name="barcode-outline" size={64} color={colors.brand} />
            <Text style={styles.idleTitle}>Siap Cek Harga</Text>
            <Text style={styles.idleDesc}>Scan barcode dengan scanner Bluetooth. Harga akan tampil otomatis.</Text>
            <Pressable style={styles.searchCard} testID="cekharga-search" onPress={() => router.push("/cari?mode=price")}>
              <Ionicons name="search" size={22} color={colors.onSurface} />
              <Text style={styles.searchTxt}>Cari Produk Manual</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  scanModeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 48, borderRadius: radius.md, borderWidth: 2, borderColor: colors.brand, paddingHorizontal: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md },
  scanModeInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  idle: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  idleTitle: { fontFamily: font.bold, fontSize: fontSize["2xl"], color: colors.onSurface, marginTop: spacing.sm },
  idleDesc: { fontFamily: font.regular, fontSize: fontSize.lg, color: colors.muted, textAlign: "center", marginBottom: spacing.lg, paddingHorizontal: spacing.md },
  searchCard: { width: "100%", height: 64, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  searchTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  resultCard: { backgroundColor: colors.brandTertiary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.xl, alignItems: "center" },
  shopName: { color: colors.success, fontFamily: font.bold, fontSize: fontSize.xl, letterSpacing: 1.5 },
  resultLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1.5, marginTop: 2 },
  resultName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize["2xl"], textAlign: "center", marginTop: spacing.sm },
  ecerLabel: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1.5, marginTop: spacing.md },
  resultPrice: { color: colors.brand, fontFamily: font.display, fontSize: fontSize["4xl"], marginTop: 2 },
  grosirBox: { alignSelf: "stretch", marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  grosirHead: { color: colors.success, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1.5, textAlign: "center", marginBottom: spacing.sm },
  grosirRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5 },
  grosirQty: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.base },
  grosirPrice: { color: colors.success, fontFamily: font.bold, fontSize: fontSize.xl },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg },
  countdownTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  againBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignSelf: "stretch", marginTop: spacing.lg },
  againTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
