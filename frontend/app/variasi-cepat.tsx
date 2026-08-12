import React, { useEffect, useMemo, useRef, useState } from "react";
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
import type { Tier } from "@/src/types";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import TierEditor from "@/components/TierEditor";

const digits = (s: string) => Number((s || "").replace(/[^\d]/g, "")) || 0;

export default function VariasiCepatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { products, reload } = useData();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const source = useMemo(() => products.find((p) => p.id === id), [products, id]);
  // Selalu pakai induk ASLI/original (root) — hindari rantai A->B->C.
  const parentId = source?.parent_id || source?.id || null;
  const root = useMemo(() => products.find((p) => p.id === parentId) || source, [products, parentId, source]);
  const rootName = root?.name || "-";

  const [suffix, setSuffix] = useState("");
  const [barcode, setBarcode] = useState("");
  const [sell, setSell] = useState(String(Math.round(root?.sell_price ?? 0)));
  const [buy, setBuy] = useState(String(Math.round(root?.buy_price ?? 0)));
  const [inheritTiers, setInheritTiers] = useState(true);
  const [ownTiers, setOwnTiers] = useState<Tier[]>(() => (root?.tiers || []).map((t) => ({ ...t })));
  const [saving, setSaving] = useState(false);

  // Prefill harga & grosir dari induk begitu data induk tersedia (mis. saat deep-link
  // atau data belum sempat termuat saat mount). Hanya sekali, tidak menimpa editan user.
  const didInit = useRef(false);
  useEffect(() => {
    if (root && !didInit.current) {
      didInit.current = true;
      setSell(String(Math.round(root.sell_price ?? 0)));
      setBuy(String(Math.round(root.buy_price ?? 0)));
      setOwnTiers((root.tiers || []).map((t) => ({ ...t })));
    }
  }, [root]);

  // Nama akhir = [Nama Induk] + [Nama Varian]
  const finalName = `${rootName} ${suffix.trim()}`.replace(/\s+/g, " ").trim();

  const onSave = async () => {
    const suf = suffix.trim();
    if (!suf) { toast.show("✕ Nama varian wajib diisi", "error"); return; }
    if (!parentId) { toast.show("✕ Produk induk tidak ditemukan", "error"); return; }

    // Cegah duplikat: nama produk akhir sudah dipakai produk lain
    const nameTaken = products.some((p) => p.name.trim().toLowerCase() === finalName.toLowerCase());
    if (nameTaken) { toast.show("✕ Nama produk sudah digunakan", "error"); return; }

    // Cegah duplikat barcode (produk lain / variasi nested lain)
    const bc = barcode.trim();
    if (bc) {
      const bcTaken = products.some(
        (p) => (p.barcode || "").trim() === bc || (p.variations || []).some((v) => (v.barcode || "").trim() === bc),
      );
      if (bcTaken) { toast.show("✕ Barcode sudah digunakan", "error"); return; }
    }

    const tiers = inheritTiers ? [] : ownTiers.filter((t) => t.min_qty > 0 && t.price > 0);

    setSaving(true);
    try {
      await api.createProduct({
        name: finalName,
        barcode: bc || null,
        parent_id: parentId,
        buy_price: digits(buy),
        sell_price: digits(sell),
        stock: 999,
        category: root?.category || "",
        unit: root?.unit || "pcs",
        tiers,
        inherit_tiers: inheritTiers,
        variations: [],
      });
      await reload();
      toast.show(`${finalName} ditambahkan`, "success");
      router.back();
    } catch (e: any) {
      const msg = e?.message || "Gagal menambah variasi";
      toast.show(`✕ ${msg}`, "error");
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
            <Text style={styles.parentTxt}>Induk: {rootName}</Text>
          </View>

          <Text style={styles.label}>Nama Varian</Text>
          <TextInput
            value={suffix}
            onChangeText={setSuffix}
            placeholder="mis. Goreng / Soto / Merah"
            placeholderTextColor={colors.muted}
            style={styles.input}
            testID="variasi-name"
            autoFocus
          />
          <View style={styles.previewBox}>
            <Text style={styles.previewLbl}>Nama produk tersimpan</Text>
            <Text style={styles.previewName} numberOfLines={2}>
              {suffix.trim() ? finalName : `${rootName} …`}
            </Text>
          </View>

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

          {/* Harga Bertingkat Ikut Induk — ON/OFF */}
          <Pressable style={styles.toggleRow} onPress={() => setInheritTiers((v) => !v)} testID="variasi-inherit-toggle">
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Harga Bertingkat Ikut Induk</Text>
              <Text style={styles.toggleSub}>{inheritTiers ? "ON — grosir mengikuti induk (otomatis)" : "OFF — atur grosir sendiri"}</Text>
            </View>
            <View style={[styles.switch, inheritTiers && styles.switchOn]}>
              <View style={[styles.knob, inheritTiers && styles.knobOn]} />
            </View>
          </Pressable>

          {!inheritTiers && (
            <TierEditor title="Harga Grosir Variasi" tiers={ownTiers} onChange={setOwnTiers} testPrefix="variasi-tier" />
          )}

          <Text style={styles.hint}>Harga jual & beli mengikuti induk sebagai nilai awal dan bisa diedit. Stok baru = 999.</Text>
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
  parentBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  parentTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  label: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm, marginBottom: 6, marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 48, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  previewBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  previewLbl: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm },
  previewName: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg, marginTop: 2 },
  moneyBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 48 },
  rp: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  moneyInput: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.lg },
  toggleTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  toggleSub: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  switch: { width: 52, height: 30, borderRadius: 15, backgroundColor: colors.border, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: colors.success },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.md },
  footer: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  cancelTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.md, backgroundColor: colors.brand },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
