import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { mikoBus } from "@/src/mikoBus";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product } from "@/src/types";

const PRODUK_ROW_H = 96; // tinggi kartu (84) + jarak (12) → getItemLayout scroll cepat

const ProdukRow = React.memo(function ProdukRow({
  item, childCount, onEdit, onMenu,
}: { item: Product; childCount: number; onEdit: (id: string) => void; onMenu: (p: Product) => void }) {
  const nestedCount = item.variations.length;
  const totalVar = nestedCount + childCount;
  const hasVar = totalVar > 0;
  const stock = nestedCount > 0 ? item.variations.reduce((s, v) => s + (v.stock || 0), 0) : item.stock;
  const low = !hasVar && stock <= 5;
  return (
    <View style={styles.card} testID={`produk-row-${item.id}`}>
      <View style={styles.thumb}>
        <Ionicons name="cube-outline" size={22} color={colors.brand} />
      </View>
      <Pressable style={{ flex: 1 }} onPress={() => onEdit(item.id)}>
        <View style={styles.nameRow}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          {low && (
            <View style={styles.lowBadge}>
              <Ionicons name="alert-circle" size={11} color={colors.onBrandTertiary} />
              <Text style={styles.lowTxt}>Stok {stock}</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.barcode || "-"} · Stok {stock} {item.unit}{hasVar ? ` · ${totalVar} variasi` : ""}
        </Text>
      </Pressable>
      <View style={styles.pricePill}>
        <Text style={styles.pricePillTxt}>{hasVar ? "Bervariasi" : rupiah(item.sell_price)}</Text>
      </View>
      <Pressable onPress={() => onMenu(item)} style={styles.menuBtn} testID={`produk-menu-${item.id}`}>
        <Ionicons name="ellipsis-vertical" size={20} color={colors.muted} />
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
  const kbdRef = useRef(false);

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
      inputRef.current?.clear();
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
  // Penerimaan input scanner Bluetooth yang andal; onChar menjaga pencarian manual tetap jalan.
  const scan = useBarcodeScan(handleScan, { onChar: setQuery, isScanMode: () => !kbdRef.current });

  const toggleKeyboard = () => {
    const next = !manualMode;
    setManualMode(next);
    skipBlur.current = true;
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  useEffect(() => { kbdRef.current = manualMode; }, [manualMode]);
  useHideScanKeyboard(inputRef, kbdRef);

  const deferredQuery = useDeferredValue(query);
  // Kelompokkan produk anak (punya parent_id) di bawah induk utama.
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      if (p.parent_id) {
        const arr = m.get(p.parent_id) || [];
        arr.push(p);
        m.set(p.parent_id, arr);
      }
    }
    return m;
  }, [products]);

  // Daftar HANYA menampilkan induk (produk tanpa parent_id). Variasi (anak)
  // disembunyikan dari daftar & hanya muncul saat induknya dibuka.
  const roots = useMemo(() => products.filter((p) => !p.parent_id), [products]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return roots;
    return roots.filter((p) => {
      const kids = childrenByParent.get(p.id) || [];
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        p.variations.some((v) => v.barcode?.toLowerCase().includes(q)) ||
        // Cari juga lewat data anak → tetap menemukan induk A saat mengetik nama/barcode B/C.
        kids.some((k) => k.name.toLowerCase().includes(q) || (k.barcode || "").toLowerCase().includes(q))
      );
    });
  }, [roots, childrenByParent, deferredQuery]);

  const onRefresh = async () => { setRefreshing(true); await reload(); setRefreshing(false); };

  const doDelete = async () => {
    if (!menuProduct) return;
    sheetRef.current?.dismiss();
    try { await api.deleteProduct(menuProduct.id); await reload(); toast.show("Produk dihapus", "success"); mikoBus.emit({ type: "product_deleted" }); }
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
    ({ item }: { item: Product }) => (
      <ProdukRow item={item} childCount={(childrenByParent.get(item.id) || []).length} onEdit={openEdit} onMenu={openMenu} />
    ),
    [openEdit, openMenu, childrenByParent],
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
            defaultValue=""
            onChangeText={scan.onChangeText}
            onSubmitEditing={() => { setManualMode(false); scan.onSubmitEditing(); }}
            onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } setManualMode(false); }}
            blurOnSubmit={false}
            showSoftInputOnFocus={manualMode}
            caretHidden={!manualMode}
            placeholder={manualMode ? "Ketik nama / kategori / barcode" : "Mode scan aktif — arahkan scanner ke barcode"}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); inputRef.current?.clear(); }} testID="produk-search-clear"><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>
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
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 24 + insets.bottom }}
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
  titleBlock: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, height: 48, borderRadius: radius.lg, shadowColor: colors.brand, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  addTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: fontSize.lg },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingLeft: 6, paddingRight: spacing.md, height: 52, borderWidth: 1, borderColor: colors.border },
  searchBoxScan: { borderWidth: 2, borderColor: colors.borderStrong },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  kbdBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  scanCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceTertiary },
  scanCardLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1 },
  scanCardName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, marginTop: 2 },
  scanCardMeta: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  scanCardPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  scanCardClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, height: 84, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, shadowColor: "#B0757F", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  thumb: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, flexShrink: 1 },
  lowBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  lowTxt: { color: colors.onBrandTertiary, fontFamily: font.bold, fontSize: 10 },
  rowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 3 },
  pricePill: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pricePillTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  menuBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  sep: { height: spacing.md },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg },
  menuTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  menuItemTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
});
