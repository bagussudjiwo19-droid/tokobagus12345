import React, { useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useData } from "@/src/data";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product } from "@/src/types";

export default function ProdukScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { products, loading, reload } = useData();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q) ||
        p.variations.some((v) => v.barcode?.toLowerCase().includes(q)),
    );
  }, [products, query]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const renderRow = ({ item }: { item: Product }) => {
    const hasVar = item.variations.length > 0;
    const stock = hasVar ? item.variations.reduce((s, v) => s + (v.stock || 0), 0) : item.stock;
    return (
      <Pressable
        testID={`produk-row-${item.id}`}
        style={styles.row}
        onPress={() => router.push({ pathname: "/produk-form", params: { id: item.id } })}
      >
        <View style={styles.rowIcon}>
          <Ionicons name="cube" size={20} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.barcode ? item.barcode : "Tanpa barcode"}
            {hasVar ? ` • ${item.variations.length} varian` : ""}
            {item.category ? ` • ${item.category}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.rowPrice}>{hasVar ? "Bervariasi" : rupiah(item.sell_price)}</Text>
          <Text style={[styles.rowStock, stock <= 0 && { color: colors.error }]}>Stok: {stock}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Produk</Text>
            <Text style={styles.subtitle}>{products.length} item • kelola katalog, harga & stok</Text>
          </View>
          <Pressable
            testID="produk-add-button"
            style={styles.addBtn}
            onPress={() => router.push("/produk-form")}
          >
            <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="produk-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Cari produk / barcode…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {loading && products.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="cube-outline" size={40} color={colors.muted} />
              <Text style={styles.dim}>Belum ada produk</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  rowName: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  rowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  rowStock: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 72 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg },
});
