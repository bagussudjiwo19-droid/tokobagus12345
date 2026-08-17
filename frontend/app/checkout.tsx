import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { sfx } from "@/src/sfx";

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
  const [calcOpen, setCalcOpen] = useState(false);
  const receiptRef = useRef<View>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    api.getPrinter().then(setPrinter).catch(() => {});
  }, []);

  const subtotal = cart.total;
  const [discountStr, setDiscountStr] = useState("");
  const [discMode, setDiscMode] = useState<"rp" | "pct">("rp");
  const discInput = Number(discountStr || "0");
  const pctVal = Math.min(100, Math.max(0, discInput));
  const discount = discMode === "pct"
    ? Math.round((pctVal / 100) * subtotal)
    : Math.min(subtotal, Math.max(0, discInput));
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
      sfx.playPaid();
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
            <View style={styles.discountRight}>
              <View style={styles.discModeWrap}>
                <Pressable
                  onPress={() => setDiscMode("rp")}
                  style={[styles.discModeBtn, discMode === "rp" && styles.discModeBtnActive]}
                  testID="checkout-disc-mode-rp"
                >
                  <Text style={[styles.discModeTxt, discMode === "rp" && styles.discModeTxtActive]}>Rp</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDiscMode("pct")}
                  style={[styles.discModeBtn, discMode === "pct" && styles.discModeBtnActive]}
                  testID="checkout-disc-mode-pct"
                >
                  <Text style={[styles.discModeTxt, discMode === "pct" && styles.discModeTxtActive]}>%</Text>
                </Pressable>
              </View>
              <View style={styles.discountInputBox}>
                {discMode === "rp" && <Text style={styles.rpPrefix}>Rp</Text>}
                <TextInput
                  value={discountStr}
                  onChangeText={(t) => setDiscountStr(t.replace(/[^\d]/g, ""))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  style={styles.discountInput}
                  testID="checkout-discount-input"
                />
                {discMode === "pct" && <Text style={styles.rpPrefix}>%</Text>}
                {discountStr !== "" && (
                  <Pressable onPress={() => setDiscountStr("")} testID="checkout-discount-clear">
                    <Ionicons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
          {discount > 0 && (
            <Text style={styles.discountCaption}>
              {discMode === "pct" ? `Diskon ${pctVal}% · ` : ""}Subtotal {rupiah(subtotal)} · Potongan -{rupiah(discount)}
            </Text>
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
        <View style={styles.calcRow}>
          <Pressable
            style={styles.calcBtn}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setCalcOpen(true); }}
            testID="receipt-calc"
          >
            <Ionicons name="calculator" size={22} color={colors.brand} />
            <Text style={styles.actionTxt}>Kalkulator</Text>
          </Pressable>
        </View>
      </ScrollView>
      <CalculatorModal visible={calcOpen} onClose={() => setCalcOpen(false)} />
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

// Kalkulator sederhana (immediate-execution) yang tampil sebagai overlay
// di atas halaman Transaksi Berhasil — tidak meninggalkan halaman.
function CalculatorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  const tap = () => Haptics.selectionAsync().catch(() => {});

  const fmt = (n: number) => {
    if (!isFinite(n)) return "Error";
    const r = Math.round((n + Number.EPSILON) * 1e8) / 1e8;
    return String(r);
  };
  const compute = (a: number, b: number, o: string) => {
    if (o === "+") return a + b;
    if (o === "-") return a - b;
    if (o === "×") return a * b;
    if (o === "÷") return b === 0 ? NaN : a / b;
    return b;
  };

  const clearAll = () => { tap(); setDisplay("0"); setPrev(null); setOp(null); setWaiting(false); };
  const backspace = () => { tap(); setDisplay((d) => (d === "Error" ? "0" : d.length > 1 ? d.slice(0, -1) : "0")); };
  const inputDigit = (d: string) => {
    tap();
    if (display === "Error") { setDisplay(d); setWaiting(false); return; }
    if (waiting) { setDisplay(d); setWaiting(false); }
    else setDisplay((cur) => (cur === "0" ? d : cur + d));
  };
  const inputDot = () => {
    tap();
    if (waiting || display === "Error") { setDisplay("0."); setWaiting(false); return; }
    if (!display.includes(".")) setDisplay((cur) => cur + ".");
  };
  const input00 = () => {
    tap();
    if (display === "Error") { setDisplay("0"); setWaiting(false); return; }
    if (waiting) { setDisplay("0"); setWaiting(false); return; }
    setDisplay((cur) => (cur === "0" ? "0" : cur + "00"));
  };
  const percent = () => { tap(); const cur = parseFloat(display) || 0; setDisplay(fmt(cur / 100)); setWaiting(false); };
  const setOperator = (next: string) => {
    tap();
    const cur = parseFloat(display) || 0;
    if (prev === null) setPrev(cur);
    else if (op && !waiting) { const r = compute(prev, cur, op); setPrev(r); setDisplay(fmt(r)); }
    setOp(next);
    setWaiting(true);
  };
  const equals = () => {
    tap();
    if (op !== null && prev !== null) {
      const cur = parseFloat(display) || 0;
      const r = compute(prev, cur, op);
      setDisplay(fmt(r));
      setPrev(null);
      setOp(null);
      setWaiting(true);
    }
  };

  const exprLine = prev !== null && op ? `${fmt(prev)} ${op}` : "";

  const Key = ({ label, onPress, kind = "num", testID }: { label: string; onPress: () => void; kind?: "num" | "op" | "fn" | "eq"; testID?: string }) => (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={[
        styles.calcKey,
        kind === "op" && styles.calcKeyOp,
        kind === "fn" && styles.calcKeyFn,
        kind === "eq" && styles.calcKeyEq,
      ]}
    >
      <Text style={[
        styles.calcKeyTxt,
        kind === "op" && styles.calcKeyTxtLight,
        kind === "eq" && styles.calcKeyTxtEq,
        kind === "fn" && styles.calcKeyTxtFn,
      ]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.calcBackdrop} onPress={onClose} testID="calc-backdrop">
        <Pressable style={[styles.calcSheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.calcHandle} />
          <View style={styles.calcHeader}>
            <Text style={styles.calcTitle}>Kalkulator</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="calc-close">
              <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>
          <View style={styles.calcDisplayBox}>
            <Text style={styles.calcExpr} numberOfLines={1} testID="calc-expr">{exprLine}</Text>
            <Text style={styles.calcDisplay} numberOfLines={1} adjustsFontSizeToFit testID="calc-display">{display}</Text>
          </View>
          <View style={styles.calcGrid}>
            <View style={styles.calcRowKeys}>
              <Key label="C" onPress={clearAll} kind="fn" testID="calc-clear" />
              <Key label="⌫" onPress={backspace} kind="fn" testID="calc-back" />
              <Key label="%" onPress={percent} kind="fn" testID="calc-percent" />
              <Key label="÷" onPress={() => setOperator("÷")} kind="op" />
            </View>
            <View style={styles.calcRowKeys}>
              <Key label="7" onPress={() => inputDigit("7")} />
              <Key label="8" onPress={() => inputDigit("8")} />
              <Key label="9" onPress={() => inputDigit("9")} />
              <Key label="×" onPress={() => setOperator("×")} kind="op" />
            </View>
            <View style={styles.calcRowKeys}>
              <Key label="4" onPress={() => inputDigit("4")} />
              <Key label="5" onPress={() => inputDigit("5")} />
              <Key label="6" onPress={() => inputDigit("6")} />
              <Key label="-" onPress={() => setOperator("-")} kind="op" />
            </View>
            <View style={styles.calcRowKeys}>
              <Key label="1" onPress={() => inputDigit("1")} />
              <Key label="2" onPress={() => inputDigit("2")} />
              <Key label="3" onPress={() => inputDigit("3")} />
              <Key label="+" onPress={() => setOperator("+")} kind="op" />
            </View>
            <View style={styles.calcRowKeys}>
              <Key label="0" onPress={() => inputDigit("0")} testID="calc-0" />
              <Key label="00" onPress={input00} testID="calc-00" />
              <Key label="." onPress={inputDot} />
              <Key label="=" onPress={equals} kind="eq" testID="calc-equals" />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  discountRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  discModeWrap: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  discModeBtn: { width: 38, height: 42, alignItems: "center", justifyContent: "center" },
  discModeBtnActive: { backgroundColor: colors.brand },
  discModeTxt: { color: colors.onSurfaceSecondary, fontFamily: font.bold, fontSize: fontSize.base },
  discModeTxtActive: { color: colors.onBrandPrimary },
  discountInputBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 42, flexShrink: 0 },
  rpPrefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  discountInput: { width: 66, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, textAlign: "right", paddingVertical: 0 },
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
  calcRow: { width: "100%", maxWidth: 320, marginTop: spacing.md },
  calcBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandTertiary },
  calcBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  calcSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  calcHandle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.sm },
  calcHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  calcTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  calcDisplayBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.md, minHeight: 84, justifyContent: "center" },
  calcExpr: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xl, textAlign: "right", minHeight: 24 },
  calcDisplay: { color: colors.onSurface, fontFamily: font.bold, fontSize: 40, textAlign: "right" },
  calcGrid: { gap: spacing.sm },
  calcRowKeys: { flexDirection: "row", gap: spacing.sm },
  calcKey: { flex: 1, height: 60, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  calcKeyOp: { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary },
  calcKeyFn: { backgroundColor: colors.surfaceTertiary, borderColor: colors.surfaceTertiary },
  calcKeyEq: { backgroundColor: colors.brand, borderColor: colors.brand },
  calcKeyTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: 24 },
  calcKeyTxtLight: { color: colors.brand },
  calcKeyTxtEq: { color: colors.onBrandPrimary },
  calcKeyTxtFn: { color: colors.onSurfaceSecondary },
});
