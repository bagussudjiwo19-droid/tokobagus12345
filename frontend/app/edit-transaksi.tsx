import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { rupiah, formatDateID } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { TxItem } from "@/src/types";

const digits = (s: string) => Number((s || "").replace(/[^\d]/g, "")) || 0;

export default function EditTransaksiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { reload } = useData();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdAt, setCreatedAt] = useState<string>("");
  const [items, setItems] = useState<TxItem[]>([]);
  const [cashPaid, setCashPaid] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);

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
});
