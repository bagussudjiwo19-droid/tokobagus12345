import React, { useCallback, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { useCart } from "@/src/cart";
import { useToast } from "@/src/toast";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

export default function TransaksiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const [scanBuffer, setScanBuffer] = useState("");
  const inputRef = useRef<TextInput>(null);

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
    },
    [cart, toast],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.top}>
        <View style={styles.topRow}>
          <Pressable style={styles.scanBtn} testID="scan-barcode-button" onPress={() => router.push("/scan")}>
            <Ionicons name="scan-outline" size={22} color={colors.onBrandPrimary} />
            <Text style={styles.scanTxt}>Scan Barcode</Text>
          </Pressable>
          <Pressable style={styles.cariBtn} testID="cari-barang-button" onPress={() => router.push("/cari?mode=cart")}>
            <Ionicons name="search" size={20} color={colors.onSurface} />
            <Text style={styles.cariTxt}>Cari Barang</Text>
          </Pressable>
        </View>

        <Pressable style={styles.manualBtn} testID="item-manual-button" onPress={() => router.push("/item-manual")}>
          <Ionicons name="pricetag-outline" size={18} color={colors.onSurface} />
          <Text style={styles.manualTxt}>Item Manual / Biaya Tambahan</Text>
        </Pressable>

        <View style={styles.scanModeBox}>
          <Ionicons name="barcode-outline" size={20} color={colors.brand} />
          <TextInput
            ref={inputRef}
            testID="scan-mode-input"
            value={scanBuffer}
            onChangeText={setScanBuffer}
            onSubmitEditing={(e) => submitBarcode(e.nativeEvent.text)}
            blurOnSubmit={false}
            autoFocus
            placeholder="Mode scan aktif — arahkan scanner ke barcode"
            placeholderTextColor={colors.muted}
            style={styles.scanModeInput}
          />
          <View style={styles.readyDot} />
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
          <Text style={styles.emptyDesc}>Scan barcode atau cari barang untuk mulai transaksi.</Text>
          <Pressable style={styles.startBtn} testID="mulai-scan-button" onPress={() => router.push("/scan")}>
            <Text style={styles.startTxt}>Mulai Scan</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {cart.lines.map((l) => (
            <View key={l.key} style={styles.line} testID={`cart-line-${l.key}`}>
              <View style={styles.lineAccent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {l.name}
                </Text>
                <Text style={styles.linePrice}>
                  {rupiah(l.price)} / {l.unit}
                  {l.price < l.base_price ? " • grosir" : ""}
                </Text>
                <View style={styles.qtyBox}>
                  <Pressable onPress={() => cart.dec(l.key)} style={styles.qtyBtn} testID={`cart-dec-${l.key}`}>
                    <Ionicons name="remove" size={18} color={colors.onSurface} />
                  </Pressable>
                  <Text style={styles.qtyTxt}>{l.quantity}</Text>
                  <Pressable onPress={() => cart.inc(l.key)} style={styles.qtyBtn} testID={`cart-inc-${l.key}`}>
                    <Ionicons name="add" size={18} color={colors.onSurface} />
                  </Pressable>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: spacing.sm }}>
                <Pressable onPress={() => cart.remove(l.key)} testID={`cart-remove-${l.key}`}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
                <Text style={styles.lineSub}>{rupiah(l.price * l.quantity)}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  top: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  topRow: { flexDirection: "row", gap: spacing.md },
  scanBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, height: 64, borderRadius: radius.md },
  scanTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  cariBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cariTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  manualBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  manualTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  scanModeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 56, borderRadius: radius.md, borderWidth: 2, borderColor: colors.brand, paddingHorizontal: spacing.md },
  scanModeInput: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  listHeadTxt: { color: colors.onSurfaceSecondary, fontFamily: font.bold, fontSize: fontSize.base, letterSpacing: 1 },
  listHeadCount: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  emptyDesc: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg, textAlign: "center" },
  startBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing["2xl"], paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  startTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  line: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md, overflow: "hidden" },
  lineAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.brand },
  lineName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  linePrice: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  qtyBox: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  qtyBtn: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  qtyTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, minWidth: 32, textAlign: "center" },
  lineSub: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  payBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  payItems: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  payTotal: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  payBtn: { flex: 1, maxWidth: 260, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, height: 60, borderRadius: radius.md },
  payBtnDisabled: { backgroundColor: "#E7A9A2" },
  payBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.xl },
});
