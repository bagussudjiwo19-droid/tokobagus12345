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
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { CartLine } from "@/src/types";

export default function TransaksiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const { products, reload } = useData();
  const toast = useToast();
  const [scanBuffer, setScanBuffer] = useState("");
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
      if (!c) return;
      setScanBuffer("");
      try {
        const product = await api.getByBarcode(c);
        const variation = product.variations?.find((v) => v.barcode === c) || null;
        cart.addProduct(product, variation);
        Haptics.selectionAsync();
        toast.show(`${product.name}${variation ? " — " + variation.name : ""} ditambahkan`, "success");
      } catch {
        toast.show(`Barcode ${c} belum terdaftar`, "error");
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [cart, toast],
  );

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
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan harga", "error");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.top}>
        {/* 1) Mode Scan Barcode aktif — paling atas (scanner Bluetooth) */}
        <Pressable style={styles.scanModeBox} onPress={openKeyboard}>
          <Ionicons name="barcode-outline" size={20} color={colors.brand} />
          <TextInput
            ref={inputRef}
            testID="scan-mode-input"
            value={scanBuffer}
            onChangeText={setScanBuffer}
            onPressIn={openKeyboard}
            onSubmitEditing={(e) => { setKbd(false); submitBarcode(e.nativeEvent.text); }}
            onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } setKbd(false); }}
            blurOnSubmit={false}
            showSoftInputOnFocus={kbd}
            caretHidden={!kbd}
            placeholder="Mode scan aktif — arahkan scanner ke barcode"
            placeholderTextColor={colors.muted}
            style={styles.scanModeInput}
          />
          <View style={styles.readyDot} />
        </Pressable>

        {/* 2) Tambah Item */}
        <Pressable style={styles.rowBtn} testID="item-manual-button" onPress={() => router.push("/item-manual")}>
          <Ionicons name="add-circle-outline" size={18} color={colors.onSurface} />
          <Text style={styles.rowBtnTxt}>Tambah Item / Biaya Tambahan</Text>
        </Pressable>

        {/* 3) Cari Barang — kotak ringkas seperti Tambah Item */}
        <Pressable style={styles.rowBtn} testID="cari-barang-button" onPress={() => router.push("/cari?mode=cart")}>
          <Ionicons name="search" size={18} color={colors.onSurface} />
          <Text style={styles.rowBtnTxt}>Cari Barang</Text>
        </Pressable>

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
            <View key={l.key} style={[styles.line, lastKey === l.key && styles.lineNew]} testID={`cart-line-${l.key}`}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[styles.lineName, (l.tiers?.length ?? 0) > 0 && styles.lineNameGrosir]} numberOfLines={1}>{l.name}</Text>
                <Pressable style={styles.priceEdit} onPress={() => openEditPrice(l)} testID={`edit-price-${l.key}`}>
                  <Text style={styles.linePrice}>{rupiah(l.price)} / {l.unit}</Text>
                  <Ionicons name="create-outline" size={13} color={colors.brand} />
                </Pressable>
                {l.product_id ? (
                  <Pressable
                    style={styles.variasiBtn}
                    testID={`cart-variasi-${l.key}`}
                    onPress={() => router.push({ pathname: "/variasi-cepat", params: { id: l.product_id! } })}
                  >
                    <Ionicons name="git-branch-outline" size={13} color={colors.brand} />
                    <Text style={styles.variasiTxt}>Tambah Variasi</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.qtyBox}>
                <Pressable onPress={() => cart.dec(l.key)} style={styles.qtyBtn} testID={`cart-dec-${l.key}`}>
                  <Ionicons name="remove" size={16} color={colors.onSurface} />
                </Pressable>
                <QtyInput value={l.quantity} onCommit={(n) => cart.setQty(l.key, n)} testID={`cart-qty-${l.key}`} />
                <Pressable onPress={() => cart.inc(l.key)} style={styles.qtyBtn} testID={`cart-inc-${l.key}`}>
                  <Ionicons name="add" size={16} color={colors.onSurface} />
                </Pressable>
              </View>

              <View style={styles.lineRight}>
                <Text style={styles.lineSub}>{rupiah(l.price * l.quantity)}</Text>
                <Pressable onPress={() => { setDeleteLine(l); deleteSheet.current?.present(); }} style={styles.delBtn} testID={`cart-remove-${l.key}`}>
                  <Ionicons name="trash-outline" size={17} color={colors.error} />
                </Pressable>
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
          <Ionicons name="cash-outline" size={22} color={colors.onBrandPrimary} />
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
  rowBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowBtnTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  scanModeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 48, borderRadius: radius.md, borderWidth: 2, borderColor: colors.brand, paddingHorizontal: spacing.md },
  scanModeInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listHeadTxt: { color: colors.onSurfaceSecondary, fontFamily: font.bold, fontSize: fontSize.base, letterSpacing: 1 },
  listHeadCount: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  emptyDesc: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg, textAlign: "center" },
  // kartu belanja
  line: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  lineNew: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  qtyBtn: { width: 30, height: 32, alignItems: "center", justifyContent: "center" },
  qtyTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, minWidth: 26, textAlign: "center" },
  qtyInput: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, minWidth: 26, width: 30, height: 32, paddingVertical: 0, paddingHorizontal: 2, textAlign: "center" },
  lineName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  lineNameGrosir: { color: colors.success },
  priceEdit: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  variasiBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" },
  variasiTxt: { color: colors.brand, fontFamily: font.medium, fontSize: fontSize.sm },
  linePrice: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base },
  lineRight: { alignItems: "flex-end", marginLeft: spacing.sm, minWidth: 78 },
  lineSub: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, textAlign: "right" },
  delBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center", marginTop: 3 },
  payBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  payItems: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  payTotal: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  payBtn: { flex: 1, maxWidth: 260, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, height: 56, borderRadius: radius.md },
  payBtnDisabled: { backgroundColor: "#E7A9A2" },
  payBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.xl },
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
