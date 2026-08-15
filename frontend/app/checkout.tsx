import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import { useCart } from "@/src/cart";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { rupiah, numberID } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Settings, Transaction } from "@/src/types";
import ReceiptPreview from "@/components/ReceiptPreview";
import { isBluetoothAvailable, printText, NATIVE_ONLY_MSG } from "@/src/printer";
import { buildReceiptText } from "@/src/receipt";
import { speakPaymentDone } from "@/src/voice";
import { mikoBus } from "@/src/mikoBus";

type Step = "cart" | "pay" | "done";

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ step?: string }>();
  const cart = useCart();
  const { reload } = useData();
  const toast = useToast();

  const [step, setStep] = useState<Step>(params.step === "pay" ? "pay" : "cart");
  const [cashStr, setCashStr] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [printer, setPrinter] = useState<{ address?: string | null; name?: string | null }>({});
  const [tx, setTx] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const receiptRef = useRef<View>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    api.getPrinter().then(setPrinter).catch(() => {});
  }, []);

  const subtotal = cart.total;
  const [discountStr, setDiscountStr] = useState("");
  const discount = Math.min(subtotal, Math.max(0, Number(discountStr || "0")));
  const total = Math.max(0, subtotal - discount);
  const cash = Number(cashStr || "0");
  const change = cash - total;

  const pressDigit = (d: string) => {
    Haptics.selectionAsync();
    if (d === "back") {
      setCashStr((s) => s.slice(0, -1));
      return;
    }
    if (d === "000") {
      setCashStr((s) => (s === "" ? "" : s + "000"));
      return;
    }
    setCashStr((s) => (s + d).replace(/^0+/, ""));
  };

  const setCash = (amount: number) => {
    Haptics.selectionAsync();
    setCashStr(String(Math.round(amount)));
  };

  // Saran nominal pembayaran otomatis: 2 kelompok (terdekat & pecahan besar).
  const suggestions = useMemo(() => {
    if (total <= 0) return { nearest: [] as number[], big: [] as number[] };
    const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;
    const base = ceilTo(total, 1000);
    const nearest = [base, base + 1000, base + 2000, base + 3000];
    const bigRaw = [10000, 25000, 50000, 100000].map((s) => ceilTo(base, s));
    const big = Array.from(new Set(bigRaw))
      .filter((v) => v > base + 3000)
      .sort((a, b) => a - b);
    return { nearest, big };
  }, [total]);

  const confirmPay = useCallback(async () => {
    if (cart.lines.length === 0) return;
    setSaving(true);
    try {
      const created = await api.createTransaction({
        items: cart.lines.map((l) => ({
          product_id: l.product_id,
          variation_id: l.variation_id,
          name: l.name,
          barcode: l.barcode,
          unit: l.unit,
          price: l.price,
          quantity: l.quantity,
          subtotal: l.price * l.quantity,
        })),
        total,
        discount,
        cash_paid: cash,
        change: Math.max(0, change),
      });
      setTx(created);
      setStep("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Miko: rayakan pembayaran + sebutkan kembalian (bubble).
      mikoBus.emit({ type: "pay_ok" });
      if (change > 0) mikoBus.emit({ type: "change", amount: change });
      // Suara feminin: bacakan hasil transaksi bila fitur suara aktif.
      if (settings?.voiceChange) speakPaymentDone(cash, total, change);
      cart.clear();
      reload();
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan transaksi", "error");
    } finally {
      setSaving(false);
    }
  }, [cash, total, discount, change, cart, reload, toast, settings]);

  const shareReceipt = useCallback(async () => {
    try {
      const uri = await captureRef(receiptRef, { format: "png", quality: 1 });
      const ok = await Sharing.isAvailableAsync();
      if (!ok) {
        toast.show("Berbagi tidak tersedia di perangkat ini", "error");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Bagikan Struk" });
    } catch (e: any) {
      toast.show("Gagal membuat gambar struk", "error");
    }
  }, [toast]);

  const printReceipt = useCallback(async () => {
    if (!isBluetoothAvailable()) {
      toast.show(NATIVE_ONLY_MSG, "info");
      mikoBus.emit({ type: "print_fail" });
      return;
    }
    if (!printer.address) {
      toast.show("Belum ada printer terpasang. Buka Pengaturan → Printer.", "info");
      mikoBus.emit({ type: "print_fail" });
      return;
    }
    if (!tx || !settings) return;
    try {
      await printText(printer.address, buildReceiptText(tx, settings));
      toast.show("Struk dikirim ke printer", "success");
      mikoBus.emit({ type: "print_ok" });
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencetak", "error");
      mikoBus.emit({ type: "print_fail" });
    }
  }, [printer, tx, settings, toast]);

  const closeAll = () => {
    cart.clear();
    router.dismissAll?.();
    router.replace("/");
  };

  // ---------- Render helpers ----------
  const Header = ({ title, onClose }: { title: string; onClose: () => void }) => (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable onPress={onClose} style={styles.headerBtn} testID="checkout-close">
        <Ionicons name="close" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerBtn} />
    </View>
  );

  if (step === "cart") {
    return (
      <View style={styles.container}>
        <Header title="Daftar Belanja" onClose={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          {cart.lines.length === 0 ? (
            <Text style={styles.dim}>Keranjang kosong</Text>
          ) : (
            cart.lines.map((l) => (
              <View key={l.key} style={styles.cartRow} testID={`cart-line-${l.key}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartName} numberOfLines={2}>
                    {l.name}
                  </Text>
                  <Text style={styles.cartPrice}>
                    {rupiah(l.price)} / {l.unit}
                    {l.price < l.base_price ? "  • grosir" : ""}
                  </Text>
                </View>
                <View style={styles.qtyBox}>
                  <Pressable onPress={() => cart.dec(l.key)} style={styles.qtyBtn} testID={`cart-dec-${l.key}`}>
                    <Ionicons name="remove" size={18} color={colors.onSurface} />
                  </Pressable>
                  <Text style={styles.qtyTxt}>{l.quantity}</Text>
                  <Pressable onPress={() => cart.inc(l.key)} style={styles.qtyBtn} testID={`cart-inc-${l.key}`}>
                    <Ionicons name="add" size={18} color={colors.onSurface} />
                  </Pressable>
                </View>
                <Text style={styles.cartSub}>{rupiah(l.price * l.quantity)}</Text>
              </View>
            ))
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{rupiah(subtotal)}</Text>
          </View>
          <Pressable
            testID="checkout-bayar-button"
            disabled={cart.lines.length === 0}
            onPress={() => setStep("pay")}
            style={[styles.primaryBtn, cart.lines.length === 0 && styles.btnDisabled]}
          >
            <Text style={styles.primaryBtnTxt}>Bayar</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "pay") {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"];
    return (
      <View style={styles.container}>
        <Header title="Pembayaran" onClose={() => (params.step === "pay" ? router.back() : setStep("cart"))} />
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.payLabel}>Total Belanja</Text>
          <Text style={styles.payTotal}>{rupiah(total)}</Text>
          <View style={styles.discountRow}>
            <View style={styles.discountLabelWrap}>
              <Ionicons name="pricetag-outline" size={16} color={colors.brand} />
              <Text style={styles.discountLabel}>Diskon</Text>
            </View>
            <View style={styles.discountInputBox}>
              <Text style={styles.rpPrefix}>Rp</Text>
              <TextInput
                value={discountStr}
                onChangeText={(t) => setDiscountStr(t.replace(/[^\d]/g, ""))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.muted}
                style={styles.discountInput}
                testID="checkout-discount-input"
              />
              {discountStr !== "" && (
                <Pressable onPress={() => setDiscountStr("")} testID="checkout-discount-clear">
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              )}
            </View>
          </View>
          {discount > 0 && (
            <Text style={styles.discountCaption}>Subtotal {rupiah(subtotal)} · Diskon -{rupiah(discount)}</Text>
          )}
          <View style={styles.cashDisplay}>
            <Text style={styles.cashLabel}>Uang Diterima</Text>
            <Text style={styles.cashValue} testID="checkout-cash-display">
              {cashStr ? `Rp ${numberID(cash)}` : "Rp 0"}
            </Text>
          </View>
          <View style={styles.changeRow}>
            <Text style={styles.changeLabel}>Kembalian</Text>
            <Text style={[styles.changeValue, { color: colors.brand }]} testID="checkout-change-display">
              {rupiah(Math.max(0, change))}
            </Text>
          </View>
        </View>

        <View style={styles.suggWrap}>
          <View style={styles.suggRow}>
            {suggestions.nearest.map((s) => (
              <SuggBtn key={s} value={s} onPress={() => setCash(s)} />
            ))}
          </View>
          <View style={styles.suggRow}>
            {suggestions.big.map((s) => (
              <SuggBtn key={s} value={s} onPress={() => setCash(s)} />
            ))}
          </View>
        </View>

        <View style={styles.numpad}>
          {keys.map((k) => (
            <Pressable key={k} testID={`numpad-${k}`} style={styles.numKey} onPress={() => pressDigit(k)}>
              {k === "back" ? (
                <Ionicons name="backspace-outline" size={24} color={colors.onSurface} />
              ) : (
                <Text style={styles.numKeyTxt}>{k}</Text>
              )}
            </Pressable>
          ))}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            testID="checkout-confirm-button"
            onPress={confirmPay}
            disabled={saving || cart.lines.length === 0}
            style={[styles.primaryBtn, (saving || cart.lines.length === 0) && styles.btnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Text style={styles.primaryBtnTxt}>{change < 0 ? "Simpan (Bayar Sebagian)" : "Selesaikan Transaksi"}</Text>
                <Ionicons name="checkmark-circle" size={20} color={colors.onBrandPrimary} />
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // step === "done"
  return (
    <View style={styles.container}>
      <Header title="Transaksi Berhasil" onClose={closeAll} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, alignItems: "center" }}>
        <View style={styles.successBadge}>
          <Ionicons name="checkmark" size={40} color={colors.onBrandPrimary} />
        </View>
        <Text style={styles.successChange}>Kembalian {rupiah(tx?.change || 0)}</Text>

        <View collapsable={false} ref={receiptRef} style={styles.receiptWrap}>
          {tx && settings && <ReceiptPreview tx={tx} settings={settings} />}
        </View>

        <View style={styles.actionRow}>
          <ActionBtn icon="share-social" label="Bagikan" onPress={shareReceipt} testID="receipt-share" />
          <ActionBtn icon="print" label="Cetak Struk" onPress={printReceipt} testID="receipt-print" />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable testID="checkout-new-tx" onPress={closeAll} style={styles.primaryBtn}>
          <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.primaryBtnTxt}>Transaksi Baru</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SuggBtn({ value, onPress }: { value: number; onPress: () => void }) {
  return (
    <Pressable style={styles.suggBtn} onPress={onPress} testID={`quick-${value}`}>
      <Text style={styles.suggTxt}>{rupiah(value)}</Text>
    </Pressable>
  );
}

function ActionBtn({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable style={styles.actionBtn} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={colors.brand} />
      <Text style={styles.actionTxt}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg, textAlign: "center", marginTop: 40 },
  cartRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  cartName: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  cartPrice: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  qtyBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  qtyTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, minWidth: 28, textAlign: "center" },
  cartSub: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, minWidth: 74, textAlign: "right" },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary },
  discountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  discountLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  discountLabel: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  discountInputBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 42, minWidth: 130 },
  rpPrefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  discountInput: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, textAlign: "right", paddingVertical: 0 },
  subRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  subLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base },
  subValue: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.base },
  discountCaption: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  totalLabel: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.lg },
  totalValue: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  primaryBtn: { height: 54, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  primaryBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  btnDisabled: { opacity: 0.4 },
  payLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base },
  payTotal: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["4xl"], marginBottom: spacing.md },
  cashDisplay: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cashLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  cashValue: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize["2xl"], marginTop: 2 },
  changeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  changeLabel: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.lg },
  changeValue: { fontFamily: font.bold, fontSize: fontSize.xl },
  quickRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  suggWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  suggRow: { flexDirection: "row", gap: spacing.sm },
  suggBtn: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  suggTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.sm },
  numpad: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: spacing.sm },
  numKey: { width: "31.5%", height: 56, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  numKeyTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize["2xl"] },
  successBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  successChange: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl, marginTop: spacing.md, marginBottom: spacing.lg },
  receiptWrap: { width: "100%", maxWidth: 320 },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, width: "100%", maxWidth: 320 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandTertiary },
  actionTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
});
