import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet";

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { rupiah, formatDateID } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { TxItem, Product, Variation } from "@/src/types";

const digits = (s: string) => Number((s || "").replace(/[^\d]/g, "")) || 0;

// Di HP pakai BottomSheetTextInput (agar sheet naik di atas keyboard). Di WEB
// pakai TextInput biasa — BottomSheetTextInput memanggil API RN yang tidak ada
// di react-native-web (TextInput.State.currentlyFocusedInput) sehingga crash.
const SheetInput: any = Platform.OS === "web" ? TextInput : BottomSheetTextInput;

export default function EditTransaksiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { products, reload } = useData();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdAt, setCreatedAt] = useState<string>("");
  const [items, setItems] = useState<TxItem[]>([]);
  const [cashPaid, setCashPaid] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);

  // Tambah Barang
  const addSheet = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["82%"], []);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const scrollRef = useRef<any>(null);

  // Setelah barang ditambahkan: tutup sheet & scroll ke barang baru (paling bawah).
  const afterAdd = () => {
    addSheet.current?.dismiss();
    setTimeout(() => {
      const s: any = scrollRef.current;
      if (!s) return;
      if (typeof s.scrollToEnd === "function") s.scrollToEnd({ animated: true });
      else if (typeof s.scrollTo === "function") s.scrollTo({ y: 100000, animated: true });
    }, 350);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      try {
        const tx = await api.getTransaction(id);
        if (!active) return;
        setItems(tx.items.map((it) => ({ ...it })));
        setCashPaid(tx.cash_paid || 0);
        setDiscount(tx.discount || 0);
        setCreatedAt(tx.created_at);
      } catch {
        toast.show("Gagal memuat transaksi", "error");
        router.back();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const itemsTotal = useMemo(
    () => items.reduce((s, it) => s + it.price * it.quantity, 0),
    [items],
  );
  const total = Math.max(0, itemsTotal - discount);
  const change = cashPaid - total;

  const setQty = (idx: number, q: number) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, q) } : it)));
  };
  const setPrice = (idx: number, p: number) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, price: p } : it)));
  };
  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ——— Tambah Barang: katalog + manual ———
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) if (p.parent_id) { const a = m.get(p.parent_id) || []; a.push(p); m.set(p.parent_id, a); }
    return m;
  }, [products]);
  const roots = useMemo(() => products.filter((p) => !p.parent_id), [products]);
  const variantsOf = (p: Product) => childrenByParent.get(p.id) || [];
  const hasVariants = (p: Product) => (p.variations && p.variations.length > 0) || variantsOf(p).length > 0;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roots.slice(0, 60);
    return roots.filter((p) => {
      const kids = childrenByParent.get(p.id) || [];
      return p.name.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q) ||
        p.variations.some((v) => v.barcode?.toLowerCase().includes(q)) ||
        kids.some((k) => k.name.toLowerCase().includes(q) || (k.barcode || "").toLowerCase().includes(q));
    }).slice(0, 100);
  }, [roots, childrenByParent, query]);

  const priceOf = (p: Product, v: Variation | null) => (v ? (v.inherit_tiers ? p.sell_price : v.sell_price) : p.sell_price);

  const openAdd = () => {
    setQuery(""); setPicked(null); setManualMode(false); setManualName(""); setManualPrice("");
    addSheet.current?.present();
  };

  const addCatalog = (product_id: string, variation_id: string | null, name: string, barcode: string | null, unit: string | undefined, price: number) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.product_id === product_id && (x.variation_id ?? null) === (variation_id ?? null));
      if (idx !== -1) return prev.map((x, i) => (i === idx ? { ...x, quantity: x.quantity + 1 } : x));
      return [...prev, { product_id, variation_id: variation_id ?? null, name, barcode: barcode ?? null, unit, price, quantity: 1, subtotal: price }];
    });
    Haptics.selectionAsync();
    toast.show(`${name} ditambahkan`, "success");
    afterAdd();
  };

  const onPickRoot = (p: Product) => {
    if (hasVariants(p)) { setPicked(p); Haptics.selectionAsync(); return; }
    addCatalog(p.id, null, p.name, p.barcode ?? null, p.unit, p.sell_price);
  };

  const addManual = () => {
    const nm = manualName.trim(); const pr = digits(manualPrice);
    if (!nm) { toast.show("Nama barang wajib diisi", "error"); return; }
    if (pr <= 0) { toast.show("Harga harus lebih dari 0", "error"); return; }
    setItems((prev) => [...prev, { product_id: null, variation_id: null, name: nm, barcode: null, unit: undefined, price: pr, quantity: 1, subtotal: pr }]);
    setManualName(""); setManualPrice("");
    Haptics.selectionAsync();
    toast.show(`${nm} ditambahkan`, "success");
    afterAdd();
  };

  const onSave = async () => {
    if (!id) return;
    if (items.length === 0) { toast.show("Transaksi tidak boleh kosong", "error"); return; }
    setSaving(true);
    try {
      const payloadItems = items.map((it) => ({ ...it, subtotal: it.price * it.quantity }));
      await api.updateTransaction(id, {
        items: payloadItems,
        total,
        discount,
        cash_paid: cashPaid,
        change,
        // created_at sengaja tidak dikirim -> tanggal/waktu asli dipertahankan
      });
      await reload();
      toast.show("Perubahan transaksi disimpan", "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan perubahan", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="edit-tx-close">
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Edit Transaksi</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.centerFill}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <>
        <KeyboardAwareScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          bottomOffset={90}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
            {createdAt ? (
              <View style={styles.dateBox}>
                <Ionicons name="time-outline" size={16} color={colors.muted} />
                <Text style={styles.dateTxt}>Tanggal asli: {formatDateID(createdAt)}</Text>
              </View>
            ) : null}

            {items.map((it, idx) => (
              <View key={`${it.product_id ?? "manual"}-${it.variation_id ?? ""}-${idx}`} style={styles.itemCard} testID={`edit-item-${idx}`}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                  <Pressable onPress={() => removeItem(idx)} style={styles.trashBtn} testID={`edit-remove-${idx}`}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>

                <View style={styles.itemRow}>
                  <View style={styles.qtyBox}>
                    <Pressable onPress={() => setQty(idx, it.quantity - 1)} style={styles.qtyBtn} testID={`edit-dec-${idx}`}>
                      <Ionicons name="remove" size={16} color={colors.onSurface} />
                    </Pressable>
                    <Text style={styles.qtyTxt}>{it.quantity}</Text>
                    <Pressable onPress={() => setQty(idx, it.quantity + 1)} style={styles.qtyBtn} testID={`edit-inc-${idx}`}>
                      <Ionicons name="add" size={16} color={colors.onSurface} />
                    </Pressable>
                  </View>

                  <View style={styles.priceBox}>
                    <Text style={styles.rp}>Rp</Text>
                    <TextInput
                      value={String(Math.round(it.price))}
                      onChangeText={(t) => setPrice(idx, digits(t))}
                      keyboardType="numeric"
                      style={styles.priceInput}
                      testID={`edit-price-${idx}`}
                    />
                  </View>
                </View>

                <View style={styles.subRow}>
                  <Text style={styles.subLabel}>Subtotal</Text>
                  <Text style={styles.subVal}>{rupiah(it.price * it.quantity)}</Text>
                </View>
              </View>
            ))}

            {/* Tombol Tambah Barang di BAWAH barang terbaru */}
            <Pressable style={styles.addItemBtn} onPress={openAdd} testID="edit-add-item">
              <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
              <Text style={styles.addItemTxt}>Tambah Barang</Text>
            </Pressable>

            <View style={styles.payCard}>
              <Text style={styles.payLabel}>Uang Bayar</Text>
              <View style={styles.priceBox}>
                <Text style={styles.rp}>Rp</Text>
                <TextInput
                  value={String(Math.round(cashPaid))}
                  onChangeText={(t) => setCashPaid(digits(t))}
                  keyboardType="numeric"
                  style={styles.priceInput}
                  testID="edit-cash-input"
                />
              </View>
            </View>

            <View style={styles.summary}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Total</Text>
                <Text style={styles.sumTotal} testID="edit-total">{rupiah(total)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{change >= 0 ? "Kembalian" : "Kurang"}</Text>
                <Text style={[styles.sumChange, change < 0 && { color: colors.error }]} testID="edit-change">
                  {rupiah(Math.abs(change))}
                </Text>
              </View>
            </View>
          </KeyboardAwareScrollView>

          <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Pressable style={styles.cancelBtn} onPress={() => router.back()} testID="edit-cancel">
                <Text style={styles.cancelTxt}>Batal</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving} testID="edit-save">
                <Ionicons name="checkmark" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.saveTxt}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</Text>
              </Pressable>
            </View>
          </KeyboardStickyView>
        </>
      )}

      {/* Sheet Tambah Barang: pilih dari katalog (dengan variasi) atau barang manual */}
      <BottomSheetModal
        ref={addSheet}
        snapPoints={snapPoints}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetFlatList
          data={manualMode ? [] : filtered}
          keyExtractor={(p: Product) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListHeaderComponent={
            <View style={{ paddingTop: spacing.xs, gap: spacing.md, marginBottom: spacing.sm }}>
              <View style={styles.addHead}>
                <Text style={styles.sheetTitle}>Tambah Barang</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View style={styles.segRow}>
                    <Pressable style={[styles.seg, !manualMode && styles.segActive]} onPress={() => setManualMode(false)} testID="add-mode-katalog">
                      <Text style={[styles.segTxt, !manualMode && styles.segTxtActive]}>Katalog</Text>
                    </Pressable>
                    <Pressable style={[styles.seg, manualMode && styles.segActive]} onPress={() => setManualMode(true)} testID="add-mode-manual">
                      <Text style={[styles.segTxt, manualMode && styles.segTxtActive]}>Manual</Text>
                    </Pressable>
                  </View>
                  <Pressable style={styles.addClose} onPress={() => addSheet.current?.dismiss()} testID="add-close">
                    <Ionicons name="close" size={22} color={colors.muted} />
                  </Pressable>
                </View>
              </View>

              {manualMode ? (
                <View style={{ gap: spacing.sm }}>
                  <Text style={styles.sheetLabel}>Nama Barang</Text>
                  <SheetInput value={manualName} onChangeText={setManualName} placeholder="cth: Plastik / Jasa" placeholderTextColor={colors.muted} style={styles.textField} testID="add-manual-name" />
                  <Text style={styles.sheetLabel}>Harga (Rp)</Text>
                  <SheetInput value={manualPrice} onChangeText={(t) => setManualPrice(String(digits(t)))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} style={styles.textField} testID="add-manual-price" />
                  <Pressable style={styles.addConfirm} onPress={addManual} testID="add-manual-confirm">
                    <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
                    <Text style={styles.addConfirmTxt}>Tambahkan</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color={colors.muted} />
                    <SheetInput value={query} onChangeText={setQuery} placeholder="Cari nama / barcode…" placeholderTextColor={colors.muted} style={styles.searchInput} testID="add-search" />
                  </View>
                  {picked && (
                    <View style={styles.pickedBox}>
                      <View style={styles.pickedHead}>
                        <Text style={styles.pickedName} numberOfLines={1}>{picked.name}</Text>
                        <Pressable onPress={() => setPicked(null)} testID="add-picked-close"><Ionicons name="close" size={18} color={colors.muted} /></Pressable>
                      </View>
                      {picked.variations?.map((v) => (
                        <Pressable key={v.id} style={styles.varRow} testID={`add-var-${v.id}`} onPress={() => addCatalog(picked.id, v.id, `${picked.name} — ${v.name}`, v.barcode ?? picked.barcode ?? null, picked.unit, priceOf(picked, v))}>
                          <Text style={styles.varName} numberOfLines={1}>{v.name}</Text>
                          <Text style={styles.varPrice}>{rupiah(priceOf(picked, v))}</Text>
                          <Ionicons name="add-circle" size={22} color={colors.brand} />
                        </Pressable>
                      ))}
                      {variantsOf(picked).map((c) => (
                        <Pressable key={c.id} style={styles.varRow} testID={`add-child-${c.id}`} onPress={() => addCatalog(c.id, null, c.name, c.barcode ?? null, c.unit, c.sell_price)}>
                          <Text style={styles.varName} numberOfLines={1}>{c.name}</Text>
                          <Text style={styles.varPrice}>{rupiah(c.sell_price)}</Text>
                          <Ionicons name="add-circle" size={22} color={colors.brand} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          }
          renderItem={({ item }: { item: Product }) => (
            <Pressable style={styles.addRow} onPress={() => onPickRoot(item)} testID={`add-row-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addRowName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.addRowMeta}>{item.barcode || "Tanpa barcode"} • Stok {item.stock}</Text>
              </View>
              <Text style={styles.addRowPrice}>{hasVariants(item) ? "Bervariasi" : rupiah(item.sell_price)}</Text>
              <Ionicons name={hasVariants(item) ? "chevron-forward" : "add-circle-outline"} size={22} color={colors.brand} style={{ marginLeft: 8 }} />
            </Pressable>
          )}
        />
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  dateBox: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md },
  dateTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  itemCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  itemTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  itemName: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  trashBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  qtyBtn: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
  qtyTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, minWidth: 32, textAlign: "center" },
  priceBox: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 42 },
  rp: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base, marginRight: 6 },
  priceInput: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  subRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  subLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  subVal: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  payCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  payLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base, marginBottom: spacing.sm },
  summary: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  sumRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sumLabel: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.lg },
  sumTotal: { color: colors.brand, fontFamily: font.display, fontSize: fontSize["2xl"] },
  sumChange: { color: colors.success, fontFamily: font.bold, fontSize: fontSize.xl },
  footer: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  cancelTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.md, backgroundColor: colors.brand },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  // Tambah Barang
  addItemBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, borderStyle: "dashed", backgroundColor: colors.brandTertiary, marginBottom: spacing.md },
  addItemTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  addHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  sheetLabel: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  segRow: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 2 },
  seg: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm - 2 },
  segActive: { backgroundColor: colors.brand },
  segTxt: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.sm },
  segTxtActive: { color: colors.onBrandPrimary },
  addClose: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  textField: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 48, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  addConfirm: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, marginTop: spacing.xs },
  addConfirmTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  pickedBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.md, gap: spacing.xs },
  pickedHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickedName: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  varRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  varName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  varPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  addRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  addRowName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  addRowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  addRowPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
});
