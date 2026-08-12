import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";

import { useData } from "@/src/data";
import { useCart } from "@/src/cart";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Variation } from "@/src/types";

export default function CariScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isPrice = mode === "price";
  const { products, reload, setPricePick } = useData();
  const cart = useCart();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [kbd, setKbd] = useState(false);
  const deleteSheet = useRef<BottomSheetModal>(null);
  const inputRef = useRef<TextInput>(null);
  const skipBlur = useRef(false);
  const kbdRef = useRef(false);

  // Siap scan langsung tanpa menyentuh kolom; keyboard tidak muncul saat scan.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { kbdRef.current = kbd; }, [kbd]);
  useHideScanKeyboard(inputRef, kbdRef);

  // Keyboard HP hanya muncul saat kolom disentuh.
  const openKeyboard = () => {
    setKbd(true);
    kbdRef.current = true;
    skipBlur.current = true;
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          p.variations.some((v) => v.barcode?.toLowerCase().includes(q)),
      )
      .slice(0, 100);
  }, [products, deferredQuery]);

  const pickForPrice = (p: Product, v: Variation | null) => {
    setPricePick({ productId: p.id, variationId: v?.id ?? null, ts: Date.now() });
    Haptics.selectionAsync();
    router.back(); // kembali otomatis ke Cek Harga
  };

  const onTap = (p: Product) => {
    if (isPrice) {
      // Produk dengan varian: tampilkan detail agar user pilih varian.
      if (p.variations && p.variations.length > 0) {
        setSelected(p);
        Haptics.selectionAsync();
        return;
      }
      pickForPrice(p, null);
      return;
    }
    // mode cart
    if (p.variations && p.variations.length > 0) {
      setSelected(p);
      return;
    }
    cart.addProduct(p);
    Haptics.selectionAsync();
    toast.show(`${p.name} ditambahkan`, "success");
    router.back(); // 1) langsung kembali ke Transaksi
  };

  // Scanner Bluetooth: setelah seluruh barcode diterima, resolusi persis → langsung pilih.
  const onScanComplete = (code: string) => {
    const c = code.trim();
    inputRef.current?.clear();
    if (!c) { inputRef.current?.focus(); return; }
    const exact = products.find((p) => p.barcode === c);
    if (exact) { setQuery(""); onTap(exact); return; }
    const parent = products.find((p) => p.variations?.some((v) => v.barcode === c));
    if (parent) {
      const v = parent.variations.find((vv) => vv.barcode === c)!;
      setQuery("");
      if (isPrice) { pickForPrice(parent, v); }
      else {
        cart.addProduct(parent, v);
        Haptics.selectionAsync();
        toast.show(`${parent.name} — ${v.name} ditambahkan`, "success");
        router.back();
      }
      return;
    }
    // Tidak ada barcode persis → tampilkan sebagai filter pencarian (barcode tidak dipotong/diubah).
    setQuery(c);
    inputRef.current?.focus();
  };
  const scan = useBarcodeScan(onScanComplete, { onChar: setQuery, isScanMode: () => !kbdRef.current });

  const confirmDelete = async () => {
    if (!deleteProduct) return;
    const p = deleteProduct;
    deleteSheet.current?.dismiss();
    try {
      await api.deleteProduct(p.id);
      await reload();
      if (selected?.id === p.id) setSelected(null);
      toast.show(`${p.name} dihapus permanen`, "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal menghapus produk", "error");
    }
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

      <Pressable style={styles.searchBox} onPress={openKeyboard}>
        <Ionicons name={kbd ? "search" : "barcode-outline"} size={18} color={kbd ? colors.muted : colors.brand} />
        <TextInput
          ref={inputRef}
          testID="cari-input"
          defaultValue=""
          onChangeText={scan.onChangeText}
          onPressIn={openKeyboard}
          onSubmitEditing={() => scan.onSubmitEditing()}
          onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } setKbd(false); }}
          blurOnSubmit={false}
          showSoftInputOnFocus={kbd}
          caretHidden={!kbd}
          placeholder={kbd ? "Ketik nama / barcode…" : "Mode scan aktif — atau ketuk untuk ketik"}
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
      </Pressable>

      {selected && (
        <View style={styles.detail} testID="cari-detail">
          <Text style={styles.detailName}>{selected.name}</Text>
          <Text style={styles.detailPrice}>{rupiah(selected.sell_price)}</Text>
          <Text style={styles.detailMeta}>
            {selected.barcode || "Tanpa barcode"}{isPrice ? "" : ` • Stok ${selected.stock} ${selected.unit}`}
          </Text>
          {selected.variations?.length > 0 &&
            selected.variations.map((v) => (
              <Pressable
                key={v.id}
                style={styles.varRow}
                testID={`cari-var-${v.id}`}
                onPress={() => {
                  if (isPrice) { pickForPrice(selected, v); return; }
                  cart.addProduct(selected, v);
                  toast.show(`${selected.name} — ${v.name} ditambahkan`, "success");
                  router.back();
                }}
              >
                <Text style={styles.varName}>{v.name}</Text>
                <Text style={styles.varPrice}>{rupiah(v.inherit_tiers ? selected.sell_price : v.sell_price)}</Text>
                <Ionicons name={isPrice ? "chevron-forward" : "add-circle"} size={22} color={colors.brand} />
              </Pressable>
            ))}
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + 24 }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.rowMain} onPress={() => onTap(item)} testID={`cari-row-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowMeta}>{item.barcode || "Tanpa barcode"}{isPrice ? "" : ` • Stok ${item.stock}`}</Text>
              </View>
              <Text style={styles.rowPrice}>{item.variations.length ? "Bervariasi" : rupiah(item.sell_price)}</Text>
              {!isPrice && <Ionicons name="add-circle-outline" size={24} color={colors.brand} style={{ marginLeft: 8 }} />}
            </Pressable>
            {!isPrice && (
              <Pressable
                style={styles.trashBtn}
                testID={`cari-delete-${item.id}`}
                onPress={() => { setDeleteProduct(item); deleteSheet.current?.present(); }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            )}
          </View>
        )}
      />

      {/* Konfirmasi hapus permanen */}
      <BottomSheetModal
        ref={deleteSheet}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <Text style={styles.confirmTitle}>Hapus barang ini secara permanen?</Text>
          <Text style={styles.confirmName} numberOfLines={2}>{deleteProduct?.name}</Text>
          <Text style={styles.confirmNote}>Barang dihapus dari data produk. Riwayat transaksi lama tidak terpengaruh.</Text>
          <Pressable style={styles.delBtn} onPress={confirmDelete} testID="cari-delete-confirm">
            <Ionicons name="trash-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.delBtnTxt}>Hapus Permanen</Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => deleteSheet.current?.dismiss()} testID="cari-delete-cancel">
            <Text style={styles.cancelTxt}>Batal</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
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
  varRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.sm },
  varName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  varPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  rowName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  rowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  trashBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: spacing.xs },
  sep: { height: spacing.md },
  confirmTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  confirmName: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.lg },
  confirmNote: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 18 },
  delBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand },
  delBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  cancelBtn: { alignItems: "center", justifyContent: "center", height: 48 },
  cancelTxt: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.lg },
});
