import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

const digits = (s: string) => Number((s || "").replace(/[^\d]/g, "")) || 0;

export default function VariasiCepatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { products, reload } = useData();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const source = useMemo(() => products.find((p) => p.id === id), [products, id]);
  // Selalu pakai induk ASLI/original (hindari rantai A->B->C).
  const parentId = source?.parent_id || source?.id || null;
  const parentName = useMemo(() => {
    const parent = products.find((p) => p.id === parentId);
    return parent?.name || source?.name || "-";
  }, [products, parentId, source]);

  const [name, setName] = useState(source ? source.name : "");
  const [barcode, setBarcode] = useState("");
  const [sell, setSell] = useState(String(Math.round(source?.sell_price ?? 0)));
  const [buy, setBuy] = useState(String(Math.round(source?.buy_price ?? 0)));
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!name.trim()) { toast.show("Nama variasi wajib diisi", "error"); return; }
    if (!parentId) { toast.show("Produk induk tidak ditemukan", "error"); return; }
    setSaving(true);
    try {
      await api.createProduct({
        name: name.trim(),
        barcode: barcode.trim() || null,
        parent_id: parentId,
        buy_price: digits(buy),
        sell_price: digits(sell),
        stock: 999,
        category: source?.category || "",
        unit: source?.unit || "pcs",
        tiers: [],
        variations: [],
      });
      await reload();
      toast.show("Variasi berhasil ditambahkan", "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Gagal menambah variasi", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="variasi-close">
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Tambah Variasi</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.parentBox}>
            <Ionicons name="git-branch-outline" size={16} color={colors.brand} />
            <Text style={styles.parentTxt}>Induk: {parentName}</Text>
          </View>

          <Text style={styles.label}>Nama Barang</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Nama variasi" placeholderTextColor={colors.muted} style={styles.input} testID="variasi-name" />

          <Text style={styles.label}>Barcode</Text>
          <TextInput value={barcode} onChangeText={setBarcode} placeholder="Boleh dikosongkan / berbeda dari induk" placeholderTextColor={colors.muted} style={styles.input} testID="variasi-barcode" />

          <Text style={styles.label}>Harga Jual</Text>
          <View style={styles.moneyBox}>
            <Text style={styles.rp}>Rp</Text>
            <TextInput value={sell} onChangeText={(t) => setSell(t.replace(/[^\d]/g, ""))} keyboardType="numeric" style={styles.moneyInput} testID="variasi-sell" />
          </View>

          <Text style={styles.label}>Harga Beli</Text>
          <View style={styles.moneyBox}>
            <Text style={styles.rp}>Rp</Text>
            <TextInput value={buy} onChangeText={(t) => setBuy(t.replace(/[^\d]/g, ""))} keyboardType="numeric" style={styles.moneyInput} testID="variasi-buy" />
          </View>

          <Text style={styles.hint}>Harga otomatis mengikuti induk & tetap bisa diedit. Stok baru = 999.</Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable style={styles.cancelBtn} onPress={() => router.back()} testID="variasi-cancel">
            <Text style={styles.cancelTxt}>Batal</Text>
          </Pressable>
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving} testID="variasi-save">
            <Ionicons name="checkmark" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.saveTxt}>{saving ? "Menyimpan…" : "Simpan Variasi"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  parentBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  parentTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  label: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm, marginBottom: 6, marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 48, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  moneyBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 48 },
  rp: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  moneyInput: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.md },
  footer: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  cancelTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.md, backgroundColor: colors.brand },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
