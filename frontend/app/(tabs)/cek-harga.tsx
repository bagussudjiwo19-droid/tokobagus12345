import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Variation, Tier, Settings } from "@/src/types";

const RESET_MS = 15000;

type ScanResult = { name: string; price: number; unit: string; tiers: Tier[] };

export default function CekHargaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { products, pricePick, setPricePick } = useData();
  const toast = useToast();
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
      toast.show(`Barcode ${c} tidak ditemukan`, "error");
      // Stay in scan mode, ready for the next barcode.
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showResult, toast]);
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
        <View style={styles.scanIcon}><Ionicons name="barcode-outline" size={22} color={colors.brand} /></View>
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
          placeholder="Scan barcode di sini…"
          placeholderTextColor={colors.muted}
          style={styles.scanModeInput}
        />
        <View style={styles.readyDot} />
      </Pressable>

      <View style={styles.body}>
        {result ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
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
                <Text style={styles.ecerChipTxt}>HARGA ECER</Text>
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
              <Text style={styles.countdownTxt}>Reset otomatis dalam {countdown}s · siap scan berikutnya</Text>
            </View>
            <Pressable style={styles.againBtn} onPress={backToScan} testID="cekharga-again">
              <Ionicons name="barcode-outline" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.againTxt}>Scan Barang Lain</Text>
            </Pressable>
          </View>
          </ScrollView>
        ) : (
          <View style={styles.idle}>
            <Ionicons name="barcode-outline" size={64} color={colors.brand} />
            <Text style={styles.idleTitle}>Siap Cek Harga</Text>
            <Text style={styles.idleDesc}>Scan barcode dengan scanner Bluetooth. Harga akan tampil otomatis.</Text>
            <Pressable style={styles.searchCard} testID="cekharga-search" onPress={() => router.push("/cari?mode=price")}>
              <Ionicons name="search" size={22} color={colors.brand} />
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
  titleBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  scanModeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 56, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong, paddingLeft: 6, paddingRight: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.sm, shadowColor: colors.brand, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  scanIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  scanModeInput: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  idle: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  idleTitle: { fontFamily: font.bold, fontSize: fontSize["2xl"], color: colors.onSurface, marginTop: spacing.sm },
  idleDesc: { fontFamily: font.regular, fontSize: fontSize.lg, color: colors.muted, textAlign: "center", marginBottom: spacing.lg, paddingHorizontal: spacing.md },
  searchCard: { width: "100%", height: 60, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  searchTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xl },
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
