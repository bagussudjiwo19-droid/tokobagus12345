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
import { scanNotifBus } from "@/src/scanNotifBus";
import { api } from "@/src/api";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useUnlimitedStock } from "@/src/useUnlimitedStock";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { childEffective } from "@/src/pricing";
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
  const unlimited = useUnlimitedStock();
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
  // Kelompokkan produk anak (variasi datar) di bawah induk. Daftar hanya tampilkan induk.
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      if (p.parent_id) {
        const a = m.get(p.parent_id) || [];
        a.push(p);
        m.set(p.parent_id, a);
      }
    }
    return m;
  }, [products]);
  const roots = useMemo(() => products.filter((p) => !p.parent_id), [products]);
  const variantsOf = (p: Product) => childrenByParent.get(p.id) || [];
  const hasVariants = (p: Product) => (p.variations && p.variations.length > 0) || variantsOf(p).length > 0;

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return roots.slice(0, 60);
    return roots
      .filter((p) => {
        const kids = childrenByParent.get(p.id) || [];
        return (
          p.name.toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          p.variations.some((v) => v.barcode?.toLowerCase().includes(q)) ||
          // cari juga lewat data variasi (anak) → induk tetap muncul
          kids.some((k) => k.name.toLowerCase().includes(q) || (k.barcode || "").toLowerCase().includes(q))
        );
      })
      .slice(0, 100);
  }, [roots, childrenByParent, deferredQuery]);

  const pickForPrice = (p: Product, v: Variation | null) => {
    setPricePick({ productId: p.id, variationId: v?.id ?? null, ts: Date.now() });
    Haptics.selectionAsync();
    router.back(); // kembali otomatis ke Cek Harga
  };

  // Tahap 4: tambah variasi baru langsung saat transaksi — buka form variasi induk
  // (menampilkan variasi sebelumnya), isi & simpan, keranjang tetap utuh.
  const addVariation = (p: Product) => {
    const rootId = p.parent_id || p.id;
    Haptics.selectionAsync();
    router.push({ pathname: "/variasi-cepat", params: { id: rootId } });
  };

  const onTap = (p: Product) => {
    // Produk punya variasi (nested lama ATAU produk anak baru) → tampilkan semua
    // pilihan variasi dulu, baru dipilih.
    if (hasVariants(p)) {
      setSelected(p);
      Haptics.selectionAsync();
      return;
    }
    if (isPrice) { pickForPrice(p, null); return; }
    cart.addProduct(p);
    Haptics.selectionAsync();
    scanNotifBus.emit({ text: `${p.name} ditambahkan`, type: "success" });
    router.back(); // langsung kembali ke Transaksi
  };

  // Pilih satu variasi anak (produk terpisah) → langsung masuk daftar belanja.
  const pickChild = (child: Product) => {
    const root = products.find((p) => p.id === child.parent_id) || child;
    const eff = childEffective(child, root);
    const effChild = { ...child, sell_price: eff.sell_price, tiers: eff.tiers };
    if (isPrice) { pickForPrice(effChild, null); return; }
    cart.addProduct(effChild);
    Haptics.selectionAsync();
    scanNotifBus.emit({ text: `${child.name} ditambahkan`, type: "success" });
    router.back();
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
        scanNotifBus.emit({ text: `${parent.name} — ${v.name} ditambahkan`, type: "success" });
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
          <View style={styles.detailHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName} numberOfLines={2}>{selected.name}</Text>
              <Text style={styles.detailHint}>Pilih variasi — ketuk untuk {isPrice ? "lihat harga" : "tambah ke daftar belanja"}</Text>
            </View>
            <Pressable onPress={() => setSelected(null)} style={styles.detailClose} testID="cari-detail-close">
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {/* Variasi lama (nested) */}
          {selected.variations?.map((v) => (
            <Pressable
              key={v.id}
              style={styles.varRow}
              testID={`cari-var-${v.id}`}
              onPress={() => {
                if (isPrice) { pickForPrice(selected, v); return; }
                cart.addProduct(selected, v);
                Haptics.selectionAsync();
                scanNotifBus.emit({ text: `${selected.name} — ${v.name} ditambahkan`, type: "success" });
                router.back();
              }}
            >
              <Text style={styles.varName} numberOfLines={1}>{v.name}</Text>
              <Text style={styles.varPrice}>{rupiah(v.inherit_tiers ? selected.sell_price : v.sell_price)}</Text>
              <Ionicons name={isPrice ? "chevron-forward" : "add-circle"} size={22} color={colors.brand} />
            </Pressable>
          ))}

          {/* Variasi baru (produk anak tertaut) */}
          {variantsOf(selected).map((c) => (
            <Pressable
              key={c.id}
              style={styles.varRow}
              testID={`cari-child-${c.id}`}
              onPress={() => pickChild(c)}
            >
              <Text style={styles.varName} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.varPrice}>{rupiah(childEffective(c, selected).sell_price)}</Text>
              <Ionicons name={isPrice ? "chevron-forward" : "add-circle"} size={22} color={colors.brand} />
            </Pressable>
          ))}

          {!isPrice && (
            <Pressable style={styles.detailAddVar} onPress={() => addVariation(selected)} testID="cari-detail-addvar">
              <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
              <Text style={styles.detailAddVarTxt}>Tambah Variasi Baru</Text>
            </Pressable>
          )}
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
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>{item.barcode || "Tanpa barcode"}{isPrice || unlimited ? "" : ` • Stok ${item.stock}`}</Text>
              </View>
              <Text style={styles.rowPrice}>{hasVariants(item) ? "Bervariasi" : rupiah(item.sell_price)}</Text>
              {!isPrice && <Ionicons name="add-circle-outline" size={24} color={colors.brand} style={{ marginLeft: 8 }} />}
            </Pressable>
            {!isPrice && (
              <Pressable
                style={styles.addVarBtn}
                testID={`cari-addvar-${item.id}`}
                onPress={() => addVariation(item)}
                hitSlop={6}
              >
                <Ionicons name="git-branch-outline" size={18} color={colors.brand} />
                <Text style={styles.addVarTxt}>Variasi</Text>
              </Pressable>
            )}
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
  detailHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  detailName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  detailHint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  detailClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  varRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.sm },
  varName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  varPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  rowName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, lineHeight: 19 },
  rowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base, marginLeft: spacing.sm },
  trashBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: spacing.xs },
  addVarBtn: { flexDirection: "row", alignItems: "center", gap: 3, height: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, marginLeft: spacing.xs },
  addVarTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xs },
  detailAddVar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandTertiary, backgroundColor: colors.surface, marginTop: spacing.md },
  detailAddVarTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  sep: { height: spacing.md },
  confirmTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  confirmName: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.lg },
  confirmNote: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 18 },
  delBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand },
  delBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  cancelBtn: { alignItems: "center", justifyContent: "center", height: 48 },
  cancelTxt: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.lg },
});
