import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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

type Step = "cart" | "pay" | "done";

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const { reload } = useData();
  const toast = useToast();

  const [step, setStep] = useState<Step>("cart");
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

  const total = cart.total;
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

  const quick = (amount: number | "pas") => {
    Haptics.selectionAsync();
    if (amount === "pas") setCashStr(String(Math.round(total)));
    else setCashStr((s) => String(Number(s || "0") + amount));
  };

  const confirmPay = useCallback(async () => {
    if (cash < total) {
      toast.show("Uang bayar kurang dari total", "error");
      return;
    }
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
        cash_paid: cash,
        change: Math.max(0, change),
      });
      setTx(created);
      setStep("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      cart.clear();
      reload();
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan transaksi", "error");
    } finally {
      setSaving(false);
    }
  }, [cash, total, change, cart, reload, toast]);

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
      return;
    }
    if (!printer.address) {
      toast.show("Belum ada printer terpasang. Buka Pengaturan → Printer.", "info");
      return;
    }
    if (!tx || !settings) return;
    try {
      await printText(printer.address, buildReceiptText(tx, settings));
      toast.show("Struk dikirim ke printer", "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencetak", "error");
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
            <Text style={styles.totalValue}>{rupiah(total)}</Text>
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
        <Header title="Pembayaran" onClose={() => setStep("cart")} />
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.payLabel}>Total Tagihan</Text>
          <Text style={styles.payTotal}>{rupiah(total)}</Text>
          <View style={styles.cashDisplay}>
            <Text style={styles.cashLabel}>Uang Bayar Tunai</Text>
            <Text style={styles.cashValue} testID="checkout-cash-display">
              {cashStr ? `Rp ${numberID(cash)}` : "Rp 0"}
            </Text>
          </View>
          <View style={styles.changeRow}>
            <Text style={styles.changeLabel}>Kembalian</Text>
            <Text style={[styles.changeValue, { color: change < 0 ? colors.error : colors.brand }]}>
              {rupiah(Math.max(0, change))}
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          <QuickChip label="Uang Pas" onPress={() => quick("pas")} />
          <QuickChip label="+10rb" onPress={() => quick(10000)} />
          <QuickChip label="+20rb" onPress={() => quick(20000)} />
          <QuickChip label="+50rb" onPress={() => quick(50000)} />
          <QuickChip label="+100rb" onPress={() => quick(100000)} />
        </ScrollView>

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
            disabled={saving || cash < total}
            style={[styles.primaryBtn, (saving || cash < total) && styles.btnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Text style={styles.primaryBtnTxt}>Selesaikan Transaksi</Text>
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

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickChip} onPress={onPress} testID={`quick-${label}`}>
      <Text style={styles.quickChipTxt}>{label}</Text>
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
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#0A0A0A" },
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
  quickChip: { flexShrink: 0, height: 40, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  quickChipTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
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
