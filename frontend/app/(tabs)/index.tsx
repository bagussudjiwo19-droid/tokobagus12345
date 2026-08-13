import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
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

import { api } from "@/src/api";
import { useCart } from "@/src/cart";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { CartLine } from "@/src/types";
import { mikoBus } from "@/src/mikoBus";

export default function TransaksiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const { products, reload } = useData();
  const toast = useToast();
  const [kbd, setKbd] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const skipBlur = useRef(false);
  const kbdRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const prevLen = useRef(0);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Edit harga sheet
  const priceSheet = useRef<BottomSheetModal>(null);
  const [editLine, setEditLine] = useState<CartLine | null>(null);
  const [priceInput, setPriceInput] = useState("");

  // Konfirmasi hapus
  const deleteSheet = useRef<BottomSheetModal>(null);
  const [deleteLine, setDeleteLine] = useState<CartLine | null>(null);

  // 1. Auto scan mode: keep the hardware-scanner input focused whenever the
  // Transaksi tab is focused, so scanning works immediately without tapping.
  useFocusEffect(
    useCallback(() => {
      setKbd(false);
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, []),
  );

  useEffect(() => { kbdRef.current = kbd; }, [kbd]);
  useHideScanKeyboard(inputRef, kbdRef);

  // 2. Auto-scroll to the newest scanned item.
  useEffect(() => {
    if (cart.lines.length > prevLen.current) {
      const newest = cart.lines[cart.lines.length - 1];
      setLastKey(newest.key);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
      const h = setTimeout(() => setLastKey(null), 1600);
      prevLen.current = cart.lines.length;
      return () => clearTimeout(h);
    }
    prevLen.current = cart.lines.length;
  }, [cart.lines]);

  const submitBarcode = useCallback(
    async (code: string) => {
      const c = code.trim();
      inputRef.current?.clear();
      if (!c) { inputRef.current?.focus(); return; }
      try {
        const product = await api.getByBarcode(c);
        const variation = product.variations?.find((v) => v.barcode === c) || null;
        cart.addProduct(product, variation);
        Haptics.selectionAsync();
        toast.show(`${product.name}${variation ? " — " + variation.name : ""} ditambahkan`, "success");
      } catch {
        toast.show(`Barcode ${c} belum terdaftar`, "error");
        mikoBus.emit({ type: "not_found" });
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [cart, toast],
  );
  // Penerimaan input scanner Bluetooth yang andal (buffer + ENTER/jeda, tanpa terpotong).
  const scan = useBarcodeScan(submitBarcode, { isScanMode: () => !kbdRef.current });

  // Keyboard HP hanya muncul saat kolom disentuh; saat scan (autofocus/HID) tetap tanpa keyboard.
  const openKeyboard = useCallback(() => {
    setKbd(true);
    kbdRef.current = true;
    skipBlur.current = true;
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  const openEditPrice = (l: CartLine) => {
    setEditLine(l);
    setPriceInput(String(Math.round(l.price)));
    priceSheet.current?.present();
  };

  const applyTemporary = () => {
    if (!editLine) return;
    const p = Number((priceInput || "0").replace(/[^\d]/g, "")) || 0;
    cart.setPrice(editLine.key, p);
    priceSheet.current?.dismiss();
    toast.show("Harga diubah untuk transaksi ini", "success");
  };

  const applyPermanent = async () => {
    if (!editLine || !editLine.product_id) return;
    const p = Number((priceInput || "0").replace(/[^\d]/g, "")) || 0;
    const product = products.find((x) => x.id === editLine.product_id);
    if (!product) return;
    try {
      const { id, created_at, updated_at, ...rest } = product as any;
      if (editLine.variation_id) {
        rest.variations = (rest.variations || []).map((v: any) =>
          v.id === editLine.variation_id ? { ...v, sell_price: p, inherit_tiers: false } : v,
        );
      } else {
        rest.sell_price = p;
      }
      await api.updateProduct(product.id, rest);
      cart.setPrice(editLine.key, p);
      await reload();
      priceSheet.current?.dismiss();
      toast.show("Harga permanen disimpan", "success");
      mikoBus.emit({ type: "price_changed" });
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan harga", "error");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.top}>
        {/* Header sapaan */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>Halo, Kasir 👋</Text>
            <Text style={styles.pageTitle}>Transaksi</Text>
          </View>
        </View>

        {/* 1) Mode Scan Barcode aktif (scanner Bluetooth) */}
        <Pressable style={styles.scanModeBox} onPress={openKeyboard}>
          <View style={styles.scanIcon}>
            <Ionicons name="barcode-outline" size={22} color={colors.brand} />
          </View>
          <TextInput
            ref={inputRef}
            testID="scan-mode-input"
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

        {/* 2) Aksi: Tambah Item + Cari Barang */}
        <View style={styles.actions}>
          <Pressable style={[styles.actBtn, styles.actBtnFilled]} testID="item-manual-button" onPress={() => router.push("/item-manual")}>
            <Ionicons name="add-circle-outline" size={20} color={colors.onSurface} />
            <Text style={[styles.actTxt, { color: colors.onSurface }]}>Tambah Item</Text>
          </Pressable>
          <Pressable style={[styles.actBtn, styles.actBtnOutline]} testID="cari-barang-button" onPress={() => router.push("/cari?mode=cart")}>
            <Ionicons name="search" size={20} color={colors.brand} />
            <Text style={[styles.actTxt, { color: colors.brand }]}>Cari Barang</Text>
          </Pressable>
        </View>

        <View style={styles.listHead}>
          <Text style={styles.listHeadTxt}>DAFTAR BELANJA</Text>
          <Text style={styles.listHeadCount}>{cart.lines.length} baris</Text>
        </View>
      </View>

      {cart.lines.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="barcode-outline" size={56} color={colors.brand} />
          <Text style={styles.emptyTitle}>Belum ada barang</Text>
          <Text style={styles.emptyDesc}>Scan barcode dengan scanner Bluetooth, atau gunakan Cari Barang untuk mulai transaksi.</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
        >
          {cart.lines.map((l) => (
            <View key={l.key} style={[styles.card, lastKey === l.key && styles.cardNew]} testID={`cart-line-${l.key}`}>
              {/* Baris 1: Nama + variasi + hapus */}
              <View style={styles.line1}>
                <Text style={[styles.lineName, (l.tiers?.length ?? 0) > 0 && styles.lineNameGrosir]} numberOfLines={1}>{l.name}</Text>
                {l.product_id ? (
                  <Pressable
                    style={styles.iconMini}
                    testID={`cart-variasi-${l.key}`}
                    hitSlop={6}
                    onPress={() => router.push({ pathname: "/variasi-cepat", params: { id: l.product_id! } })}
                  >
                    <Ionicons name="git-branch-outline" size={16} color={colors.brand} />
                  </Pressable>
                ) : null}
                <Pressable onPress={() => { setDeleteLine(l); deleteSheet.current?.present(); }} style={styles.iconMini} testID={`cart-remove-${l.key}`} hitSlop={6}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>

              {/* Baris 2: harga×qty · stepper · subtotal */}
              <View style={styles.line2}>
                <Pressable style={styles.unitWrap} onPress={() => openEditPrice(l)} testID={`edit-price-${l.key}`}>
                  <Text style={styles.unitTxt} numberOfLines={1}>{rupiah(l.price)} x {l.quantity}</Text>
                  <Ionicons name="create-outline" size={12} color={colors.brand} />
                </Pressable>
                <View style={styles.qtyBox}>
                  <Pressable onPress={() => cart.dec(l.key)} style={styles.qtyBtn} testID={`cart-dec-${l.key}`}>
                    <Ionicons name="remove" size={18} color={colors.brand} />
                  </Pressable>
                  <QtyInput value={l.quantity} onCommit={(n) => cart.setQty(l.key, n)} testID={`cart-qty-${l.key}`} />
                  <Pressable onPress={() => cart.inc(l.key)} style={styles.qtyBtn} testID={`cart-inc-${l.key}`}>
                    <Ionicons name="add" size={18} color={colors.brand} />
                  </Pressable>
                </View>
                <Text style={styles.lineSub} numberOfLines={1}>{rupiah(l.price * l.quantity)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={[styles.payBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View>
          <Text style={styles.payItems}>{cart.count} item</Text>
          <Text style={styles.payTotal}>{rupiah(cart.total)}</Text>
        </View>
        <Pressable
          testID="bayar-button"
          disabled={cart.count === 0}
          onPress={() => router.push("/checkout?step=pay")}
          style={[styles.payBtn, cart.count === 0 && styles.payBtnDisabled]}
        >
          <Ionicons name="wallet-outline" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.payBtnTxt}>Bayar</Text>
        </Pressable>
      </View>

      {/* Edit Harga */}
      <BottomSheetModal
        ref={priceSheet}
        enableDynamicSizing
        keyboardBehavior="interactive"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{editLine?.name}</Text>
          <Text style={styles.sheetLabel}>Harga Satuan (Rp)</Text>
          <View style={styles.priceInputBox}>
            <Text style={styles.rpPrefix}>Rp</Text>
            <TextInput
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="numeric"
              style={styles.priceInput}
              testID="edit-price-input"
            />
          </View>
          <Pressable style={styles.optRed} onPress={applyTemporary} testID="price-temporary">
            <Ionicons name="pricetag-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.optRedTxt}>Simpan untuk transaksi ini saja</Text>
          </Pressable>
          {editLine?.product_id ? (
            <Pressable style={styles.optDark} onPress={applyPermanent} testID="price-permanent">
              <Ionicons name="save-outline" size={18} color={colors.onSurfaceInverse} />
              <Text style={styles.optDarkTxt}>Simpan sebagai harga permanen</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.optCancel} onPress={() => priceSheet.current?.dismiss()} testID="price-cancel">
            <Text style={styles.optCancelTxt}>Batal</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Konfirmasi hapus barang */}
      <BottomSheetModal
        ref={deleteSheet}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <Text style={styles.sheetTitle}>Hapus barang ini?</Text>
          <Text style={styles.sheetLabel} numberOfLines={2}>{deleteLine?.name}</Text>
          <Pressable
            style={styles.optRed}
            testID="delete-confirm"
            onPress={() => {
              if (deleteLine) cart.remove(deleteLine.key);
              deleteSheet.current?.dismiss();
              toast.show("Barang dihapus", "success");
            }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.optRedTxt}>Hapus</Text>
          </Pressable>
          <Pressable style={styles.optCancel} testID="delete-cancel" onPress={() => deleteSheet.current?.dismiss()}>
            <Text style={styles.optCancelTxt}>Batal</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

function QtyInput({ value, onCommit, testID }: { value: number; onCommit: (n: number) => void; testID?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => { setTxt(String(value)); }, [value]);
  const commit = () => {
    const n = Math.max(1, Math.floor(Number(txt.replace(/[^\d]/g, "")) || 0));
    setTxt(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <TextInput
      value={txt}
      onChangeText={(t) => setTxt(t.replace(/[^\d]/g, ""))}
      onEndEditing={commit}
      onBlur={commit}
      keyboardType="number-pad"
      returnKeyType="done"
      selectTextOnFocus
      style={styles.qtyInput}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  top: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xs },
  hi: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm },
  pageTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 30, marginTop: 2 },
  scanModeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 56, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong, paddingLeft: 6, paddingRight: spacing.md, shadowColor: colors.brand, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  scanIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  scanModeInput: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.lg },
  actBtnFilled: { backgroundColor: colors.brandSecondary },
  actBtnOutline: { backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.borderStrong },
  actTxt: { fontFamily: font.bold, fontSize: fontSize.lg },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  listHeadTxt: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1.5 },
  listHeadCount: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  emptyDesc: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg, textAlign: "center" },
  // kartu belanja compact (2 baris)
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  cardNew: { borderColor: colors.brand, backgroundColor: colors.surfaceTertiary },
  line1: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  line2: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  iconMini: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  unitWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 3 },
  unitTxt: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm },
  qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3, gap: 3 },
  qtyBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  qtyInput: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, minWidth: 26, width: 30, height: 32, paddingVertical: 0, textAlign: "center" },
  lineName: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  lineNameGrosir: { color: colors.success },
  lineSub: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, minWidth: 68, textAlign: "right" },
  payBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 26, borderTopRightRadius: 26, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  payItems: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  payTotal: { color: colors.onSurface, fontFamily: font.display, fontSize: 26 },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, height: 58, borderRadius: radius.lg, paddingHorizontal: 40 },
  payBtnDisabled: { backgroundColor: "#F2B8C2" },
  payBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: fontSize.xl },
  sheetTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  sheetLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base },
  priceInputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 54 },
  rpPrefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.lg, marginRight: 6 },
  priceInput: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  optRed: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand },
  optRedTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  optDark: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceInverse },
  optDarkTxt: { color: colors.onSurfaceInverse, fontFamily: font.bold, fontSize: fontSize.lg },
  optCancel: { alignItems: "center", justifyContent: "center", height: 48 },
  optCancelTxt: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.lg },
});
