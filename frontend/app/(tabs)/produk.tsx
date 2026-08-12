import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
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
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";

import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product } from "@/src/types";

const PRODUK_ROW_H = 63; // tinggi baris tetap → getItemLayout untuk scroll cepat

const ProdukRow = React.memo(function ProdukRow({
  item, onEdit, onMenu,
}: { item: Product; onEdit: (id: string) => void; onMenu: (p: Product) => void }) {
  const hasVar = item.variations.length > 0;
  const stock = hasVar ? item.variations.reduce((s, v) => s + (v.stock || 0), 0) : item.stock;
  return (
    <View style={styles.row} testID={`produk-row-${item.id}`}>
      <Pressable style={{ flex: 1 }} onPress={() => onEdit(item.id)}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.barcode || "-"} · Stok {stock} {item.unit}{hasVar ? ` · ${item.variations.length} varian` : ""}
        </Text>
      </Pressable>
      <Text style={styles.rowPrice}>{hasVar ? "Bervariasi" : rupiah(item.sell_price)}</Text>
      <Pressable onPress={() => onMenu(item)} style={styles.menuBtn} testID={`produk-menu-${item.id}`}>
        <Ionicons name="ellipsis-vertical" size={20} color={colors.onSurfaceSecondary} />
      </Pressable>
    </View>
  );
});

export default function ProdukScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { products, loading, reload } = useData();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [menuProduct, setMenuProduct] = useState<Product | null>(null);
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const inputRef = useRef<TextInput>(null);
  const skipBlur = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Muat sekali; hindari refetch ~700KB tiap pindah tab. Mutasi (simpan/hapus/
      // stok/transaksi) sudah memanggil reload() sendiri sehingga data tetap segar.
      if (products.length === 0) reload();
      setManualMode(false);
      // Keep the search field focused so the Bluetooth scanner works
      // immediately without tapping the field.
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, [reload, products.length]),
  );

  // Handle a barcode scan submitted from the Bluetooth scanner.
  const handleScan = useCallback(
    async (code: string) => {
      const c = code.trim();
      setQuery("");
      if (!c) { inputRef.current?.focus(); return; }
      try {
        const product = await api.getByBarcode(c);
        setScanResult(product);
        Haptics.selectionAsync();
      } catch {
        setScanResult(null);
        toast.show(`Barcode ${c} tidak ditemukan`, "error");
      }
      // Ready for the next scan without touching the field again.
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [toast],
  );

  const toggleKeyboard = () => {
    const next = !manualMode;
    setManualMode(next);
    skipBlur.current = true;
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  // Keyboard HP hanya muncul saat kolom disentuh; saat scan tetap tanpa keyboard.
  const openKeyboard = () => {
    setManualMode(true);
    skipBlur.current = true;
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        p.variations.some((v) => v.barcode?.toLowerCase().includes(q)),
    );
  }, [products, deferredQuery]);

  const onRefresh = async () => { setRefreshing(true); await reload(); setRefreshing(false); };

  const doDelete = async () => {
    if (!menuProduct) return;
    sheetRef.current?.dismiss();
    try { await api.deleteProduct(menuProduct.id); await reload(); toast.show("Produk dihapus", "success"); }
    catch (e: any) { toast.show(e?.message || "Gagal menghapus", "error"); }
  };

  const doDuplicate = async () => {
    if (!menuProduct) return;
    sheetRef.current?.dismiss();
    try {
      const { id, created_at, updated_at, ...rest } = menuProduct as any;
      await api.createProduct({ ...rest, name: `${menuProduct.name} (copy)`, barcode: null });
      await reload();
      toast.show("Produk diduplikat", "success");
    } catch (e: any) { toast.show(e?.message || "Gagal menduplikat", "error"); }
  };

  const openMenu = useCallback((p: Product) => { setMenuProduct(p); sheetRef.current?.present(); }, []);
  const openEdit = useCallback((id: string) => router.push({ pathname: "/produk-form", params: { id } }), [router]);

  const renderRow = useCallback(
    ({ item }: { item: Product }) => <ProdukRow item={item} onEdit={openEdit} onMenu={openMenu} />,
    [openEdit, openMenu],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.titleBlock}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Produk</Text>
          <Text style={styles.subtitle}>Kelola katalog, harga & stok</Text>
        </View>
        <Pressable style={styles.addBtn} testID="produk-add-button" onPress={() => router.push("/produk-form")}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.addTxt}>Tambah</Text>
        </Pressable>
      </View>
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, !manualMode && styles.searchBoxScan]}>
          <Ionicons name={manualMode ? "search" : "barcode-outline"} size={18} color={manualMode ? colors.muted : colors.brand} />
          <TextInput
            ref={inputRef}
            testID="produk-search-input"
            value={query}
            onChangeText={setQuery}
            onPressIn={openKeyboard}
            onSubmitEditing={(e) => { setManualMode(false); handleScan(e.nativeEvent.text); }}
            onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } setManualMode(false); }}
            blurOnSubmit={false}
            showSoftInputOnFocus={manualMode}
            caretHidden={!manualMode}
            placeholder={manualMode ? "Ketik nama / kategori / barcode" : "Mode scan aktif — arahkan scanner ke barcode"}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} testID="produk-search-clear"><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>
          )}
          <Pressable onPress={toggleKeyboard} style={styles.kbdBtn} testID="produk-keyboard-toggle">
            <Ionicons name={manualMode ? "barcode-outline" : "keypad-outline"} size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>
      </View>

      {scanResult && (
        <Pressable
          style={styles.scanCard}
          testID="produk-scan-result"
          onPress={() => { const id = scanResult.id; setScanResult(null); router.push({ pathname: "/produk-form", params: { id } }); }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.scanCardLabel}>HASIL SCAN</Text>
            <Text style={styles.scanCardName} numberOfLines={1}>{scanResult.name}</Text>
            <Text style={styles.scanCardMeta} numberOfLines={1}>
              {scanResult.barcode || "-"} · Stok {scanResult.variations.length ? scanResult.variations.reduce((s, v) => s + (v.stock || 0), 0) : scanResult.stock} {scanResult.unit}
            </Text>
          </View>
          <Text style={styles.scanCardPrice}>{scanResult.variations.length ? "Bervariasi" : rupiah(scanResult.sell_price)}</Text>
          <Pressable onPress={() => { setScanResult(null); inputRef.current?.focus(); }} style={styles.scanCardClose} testID="produk-scan-close">
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </Pressable>
      )}

      {loading && products.length === 0 ? (
        <View style={styles.centerFill}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderRow}
          getItemLayout={(_, index) => ({ length: PRODUK_ROW_H, offset: PRODUK_ROW_H * index, index })}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={40}
          windowSize={9}
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

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom + spacing.lg }}>
          <Text style={styles.menuTitle} numberOfLines={1}>{menuProduct?.name}</Text>
          <MenuItem icon="create-outline" label="Edit Produk" onPress={() => { sheetRef.current?.dismiss(); router.push({ pathname: "/produk-form", params: { id: menuProduct?.id } }); }} testID="menu-edit" />
          <MenuItem icon="layers-outline" label="Kelola Stok" onPress={() => { sheetRef.current?.dismiss(); router.push({ pathname: "/kelola-stok", params: { id: menuProduct?.id } }); }} testID="menu-stock" />
          <MenuItem icon="copy-outline" label="Duplikat" onPress={doDuplicate} testID="menu-duplicate" />
          <MenuItem icon="trash-outline" label="Hapus" danger onPress={doDelete} testID="menu-delete" />
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, testID }: { icon: any; label: string; onPress: () => void; danger?: boolean; testID: string }) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={danger ? colors.error : colors.onSurface} />
      <Text style={[styles.menuItemTxt, danger && { color: colors.error }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleBlock: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, height: 48, borderRadius: radius.md },
  addTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, borderWidth: 1, borderColor: colors.border },
  searchBoxScan: { borderWidth: 2, borderColor: colors.brand },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  kbdBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  scanCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, backgroundColor: colors.brandTertiary },
  scanCardLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1 },
  scanCardName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, marginTop: 2 },
  scanCardMeta: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  scanCardPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  scanCardClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary },
  rowName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  rowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowPrice: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  menuBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  sep: { height: 1, backgroundColor: colors.border },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg },
  menuTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  menuItemTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
});
