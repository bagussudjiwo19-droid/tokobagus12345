import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Variation } from "@/src/types";

const RESET_MS = 15000;

type ScanResult = { product: Product; variation: Variation | null; name: string; price: number };

export default function CekHargaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const inputRef = useRef<TextInput>(null);
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

  // Auto scan mode: focus the hidden scanner input whenever this tab is focused.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => { clearTimeout(t); clearTimers(); };
    }, []),
  );

  const handleScan = useCallback(async (code: string) => {
    const c = code.trim();
    setQuery("");
    if (!c) { inputRef.current?.focus(); return; }
    clearTimers();
    try {
      const product = await api.getByBarcode(c);
      const variation = product.variations?.find((v) => v.barcode === c) || null;
      const price = variation
        ? (variation.inherit_tiers ? product.sell_price : variation.sell_price)
        : product.sell_price;
      const name = variation ? `${product.name} — ${variation.name}` : product.name;
      setResult({ product, variation, name, price });
      Haptics.selectionAsync();

      // Keep the result visible for 15 seconds, then reset to scan mode.
      setCountdown(RESET_MS / 1000);
      tickTimer.current = setInterval(() => {
        setCountdown((n) => (n > 1 ? n - 1 : 0));
      }, 1000);
      resetTimer.current = setTimeout(() => backToScan(), RESET_MS);
    } catch {
      setResult(null);
      // Stay in scan mode, ready for the next barcode.
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [backToScan]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Cek Harga</Text>
        <Text style={styles.subtitle}>Arahkan scanner ke barcode untuk lihat harga</Text>
      </View>

      {/* Mode scan aktif — input tersembunyi untuk scanner Bluetooth (tanpa keyboard HP) */}
      <Pressable style={styles.scanModeBox} onPress={() => inputRef.current?.focus()}>
        <Ionicons name="barcode-outline" size={20} color={colors.brand} />
        <TextInput
          ref={inputRef}
          testID="cekharga-scan-input"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={(e) => handleScan(e.nativeEvent.text)}
          blurOnSubmit={false}
          showSoftInputOnFocus={false}
          caretHidden
          autoFocus
          placeholder="Mode scan aktif — arahkan scanner ke barcode"
          placeholderTextColor={colors.muted}
          style={styles.scanModeInput}
        />
        <View style={styles.readyDot} />
      </Pressable>

      <View style={styles.body}>
        {result ? (
          <View style={styles.resultCard} testID="cekharga-result">
            <Text style={styles.resultLabel}>HARGA JUAL</Text>
            <Text style={styles.resultName} numberOfLines={3}>{result.name}</Text>
            <Text style={styles.resultPrice}>{rupiah(result.price)}</Text>
            <Text style={styles.resultMeta}>
              {result.product.barcode || result.variation?.barcode || "-"} · Stok{" "}
              {result.variation ? result.variation.stock : result.product.stock} {result.product.unit}
            </Text>
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
  resultLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1.5 },
  resultName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize["2xl"], textAlign: "center", marginTop: spacing.sm },
  resultPrice: { color: colors.brand, fontFamily: font.display, fontSize: fontSize["4xl"], marginTop: spacing.sm },
  resultMeta: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.base, marginTop: spacing.xs, textAlign: "center" },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg },
  countdownTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  againBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignSelf: "stretch", marginTop: spacing.lg },
  againTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
