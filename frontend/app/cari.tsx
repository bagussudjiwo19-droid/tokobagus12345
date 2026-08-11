import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useData } from "@/src/data";
import { useCart } from "@/src/cart";
import { useToast } from "@/src/toast";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product } from "@/src/types";

export default function CariScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isPrice = mode === "price";
  const { products } = useData();
  const cart = useCart();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          p.variations.some((v) => v.barcode?.toLowerCase().includes(q)),
      )
      .slice(0, 100);
  }, [products, query]);

  const onTap = (p: Product) => {
    if (isPrice) {
      setSelected(p);
      Haptics.selectionAsync();
      return;
    }
    if (p.variations && p.variations.length > 0) {
      // add first? better: show price for variation selection — keep simple: open detail
      setSelected(p);
      return;
    }
    cart.addProduct(p);
    Haptics.selectionAsync();
    toast.show(`${p.name} ditambahkan`, "success");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="cari-close">
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{isPrice ? "Cari Produk" : "Cari Barang"}</Text>
        <View style={styles.closeBtn} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          testID="cari-input"
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Ketik nama / barcode…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
      </View>

      {selected && (
        <View style={styles.detail} testID="cari-detail">
          <Text style={styles.detailName}>{selected.name}</Text>
          <Text style={styles.detailPrice}>{rupiah(selected.sell_price)}</Text>
          <Text style={styles.detailMeta}>
            {selected.barcode || "Tanpa barcode"} • Stok {selected.stock} {selected.unit}
          </Text>
          {selected.tiers?.length > 0 && (
            <Text style={styles.detailTier}>
              Grosir: {selected.tiers.map((t) => `≥${t.min_qty} ${rupiah(t.price)}`).join(" · ")}
            </Text>
          )}
          {selected.variations?.length > 0 &&
            selected.variations.map((v) => (
              <Pressable
                key={v.id}
                style={styles.varRow}
                testID={`cari-var-${v.id}`}
                onPress={() => {
                  if (isPrice) return;
                  cart.addProduct(selected, v);
                  toast.show(`${selected.name} — ${v.name} ditambahkan`, "success");
                  setSelected(null);
                }}
              >
                <Text style={styles.varName}>{v.name}</Text>
                <Text style={styles.varPrice}>{rupiah(v.inherit_tiers ? selected.sell_price : v.sell_price)}</Text>
                {!isPrice && <Ionicons name="add-circle" size={22} color={colors.brand} />}
              </Pressable>
            ))}
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onTap(item)} testID={`cari-row-${item.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta}>
                {item.barcode || "Tanpa barcode"} • Stok {item.stock}
              </Text>
            </View>
            <Text style={styles.rowPrice}>{item.variations.length ? "Bervariasi" : rupiah(item.sell_price)}</Text>
            {!isPrice && <Ionicons name="add-circle-outline" size={24} color={colors.brand} style={{ marginLeft: 8 }} />}
          </Pressable>
        )}
      />

      {!isPrice && cart.count > 0 && (
        <Pressable style={[styles.doneBar, { paddingBottom: insets.bottom + spacing.md }]} onPress={() => router.back()} testID="cari-done">
          <Text style={styles.doneTxt}>Selesai • {cart.count} item</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 48, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  detail: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  detailName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  detailPrice: { color: colors.brand, fontFamily: font.display, fontSize: fontSize["3xl"], marginTop: 2 },
  detailMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base, marginTop: 4 },
  detailTier: { color: colors.success, fontFamily: font.medium, fontSize: fontSize.sm, marginTop: 4 },
  varRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  varName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  varPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowName: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  rowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },
  doneBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.brand, alignItems: "center", paddingTop: spacing.md },
  doneTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
