import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";

import { useData } from "@/src/data";
import { useCart } from "@/src/cart";
import { useToast } from "@/src/toast";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product } from "@/src/types";

export default function KasirScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { products, loading, error, reload } = useData();
  const cart = useCart();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [variationProduct, setVariationProduct] = useState<Product | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return ["Semua", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const okCat = category === "Semua" || p.category === category;
      const okQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q) ||
        p.variations.some((v) => v.barcode?.toLowerCase().includes(q));
      return okCat && okQ;
    });
  }, [products, query, category]);

  const onPressProduct = useCallback(
    (p: Product) => {
      if (p.variations && p.variations.length > 0) {
        setVariationProduct(p);
        sheetRef.current?.present();
        return;
      }
      Haptics.selectionAsync();
      cart.addProduct(p);
      toast.show(`${p.name} ditambahkan`, "success");
    },
    [cart, toast],
  );

  const renderCard = ({ item }: { item: Product }) => {
    const hasVar = item.variations && item.variations.length > 0;
    const priceLabel = hasVar ? "Bervariasi" : rupiah(item.sell_price);
    const stock = hasVar
      ? item.variations.reduce((s, v) => s + (v.stock || 0), 0)
      : item.stock;
    return (
      <Pressable
        testID={`kasir-product-${item.id}`}
        onPress={() => onPressProduct(item)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.cardTop}>
          <Ionicons name="pricetag" size={14} color={colors.brand} />
          {hasVar && (
            <View style={styles.varBadge}>
              <Text style={styles.varBadgeTxt}>{item.variations.length} varian</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.cardPrice}>{priceLabel}</Text>
        <Text style={styles.cardStock}>Stok: {stock}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Sticky header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Kasir</Text>
          <Pressable
            testID="kasir-scan-button"
            style={styles.scanBtn}
            onPress={() => router.push("/scan")}
          >
            <Ionicons name="barcode-outline" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.scanTxt}>Scan</Text>
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="kasir-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Cari produk / barcode…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} testID="kasir-search-clear">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(c) => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroller}
          renderItem={({ item: c }) => {
            const active = c === category;
            return (
              <Pressable
                testID={`kasir-chip-${c}`}
                onPress={() => setCategory(c)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c || "Lainnya"}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.dim}>Memuat produk…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="cloud-offline" size={40} color={colors.muted} />
          <Text style={styles.dim}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={reload} testID="kasir-retry">
            <Text style={styles.retryTxt}>Coba lagi</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          renderItem={renderCard}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{
            gap: spacing.md,
            paddingTop: spacing.md,
            paddingBottom: 120 + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="cube-outline" size={40} color={colors.muted} />
              <Text style={styles.dim}>Produk tidak ditemukan</Text>
            </View>
          }
        />
      )}

      {/* Sticky Cart CTA */}
      {cart.count > 0 && (
        <Pressable
          testID="kasir-cart-cta"
          onPress={() => router.push("/checkout")}
          style={[styles.cta, { bottom: spacing.lg }]}
        >
          <View style={styles.ctaBadge}>
            <Text style={styles.ctaBadgeTxt}>{cart.count}</Text>
          </View>
          <Text style={styles.ctaLabel}>Daftar Belanja</Text>
          <Text style={styles.ctaTotal}>{rupiah(cart.total)}</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      )}

      {/* Variation picker */}
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom + spacing.lg }}>
          <Text style={styles.sheetTitle}>{variationProduct?.name}</Text>
          <Text style={styles.sheetSub}>Pilih variasi</Text>
          {variationProduct?.variations.map((v) => {
            const price = v.inherit_tiers ? variationProduct.sell_price : v.sell_price || variationProduct.sell_price;
            return (
              <Pressable
                key={v.id}
                testID={`variation-${v.id}`}
                style={styles.varRow}
                onPress={() => {
                  Haptics.selectionAsync();
                  cart.addProduct(variationProduct, v);
                  toast.show(`${variationProduct.name} — ${v.name} ditambahkan`, "success");
                  sheetRef.current?.dismiss();
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.varName}>{v.name}</Text>
                  <Text style={styles.varStock}>Stok: {v.stock}</Text>
                </View>
                <Text style={styles.varPrice}>{rupiah(price)}</Text>
                <Ionicons name="add-circle" size={26} color={colors.brand} />
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface, letterSpacing: 0.5 },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  scanTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.base },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  chipScroller: { marginTop: spacing.sm, maxHeight: 44 },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.base },
  chipTxtActive: { color: colors.onBrandPrimary, fontFamily: font.bold },
  card: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 116,
  },
  cardPressed: { opacity: 0.7, borderColor: colors.brand },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  varBadge: { backgroundColor: colors.brandTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  varBadgeTxt: { color: colors.onBrandTertiary, fontFamily: font.medium, fontSize: 10 },
  cardName: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base, marginBottom: spacing.xs },
  cardPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  cardStock: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg, textAlign: "center", paddingHorizontal: spacing.xl },
  retryBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  retryTxt: { color: colors.onBrandPrimary, fontFamily: font.bold },
  cta: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  ctaBadge: { backgroundColor: colors.onBrandPrimary, minWidth: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  ctaBadgeTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  ctaLabel: { flex: 1, color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  ctaTotal: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  sheetTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sheetSub: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  varRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  varName: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  varStock: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  varPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
});
