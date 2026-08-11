import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

export default function KelolaStokScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { products, reload } = useData();
  const toast = useToast();

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);
  const [main, setMain] = useState(String(product?.stock ?? "0"));
  const [vars, setVars] = useState<Record<string, string>>(
    () => Object.fromEntries((product?.variations || []).map((v) => [v.id, String(v.stock ?? 0)])),
  );
  const [saving, setSaving] = useState(false);

  if (!product) return <View style={styles.container} />;
  const hasVar = product.variations.length > 0;

  const save = async () => {
    setSaving(true);
    try {
      if (hasVar) {
        for (const v of product.variations) {
          await api.updateStock(product.id, Number((vars[v.id] || "0").replace(/[^\d.-]/g, "")) || 0, v.id);
        }
      } else {
        await api.updateStock(product.id, Number((main || "0").replace(/[^\d.-]/g, "")) || 0);
      }
      await reload();
      toast.show("Stok diperbarui", "success");
      router.back();
    } catch (e: any) { toast.show(e?.message || "Gagal memperbarui stok", "error"); }
    finally { setSaving(false); }
  };

  const StepInput = ({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) => {
    const n = Number((value || "0").replace(/[^\d.-]/g, "")) || 0;
    return (
      <View style={styles.stepBox}>
        <Pressable style={styles.stepBtn} onPress={() => onChange(String(Math.max(0, n - 1)))} testID={`${testID}-dec`}>
          <Ionicons name="remove" size={20} color={colors.onSurface} />
        </Pressable>
        <TextInput value={value} onChangeText={onChange} keyboardType="numeric" style={styles.stepInput} testID={testID} />
        <Pressable style={styles.stepBtn} onPress={() => onChange(String(n + 1))} testID={`${testID}-inc`}>
          <Ionicons name="add" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.hTitle}>Kelola Stok</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="stok-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.prodName}>{product.name}</Text>
        <Text style={styles.prodMeta}>{product.barcode || "Tanpa barcode"} · {product.unit}</Text>

        {hasVar ? (
          product.variations.map((v) => (
            <View key={v.id} style={styles.stockRow}>
              <Text style={styles.stockLabel}>{v.name}</Text>
              <StepInput value={vars[v.id] ?? "0"} onChange={(val) => setVars((p) => ({ ...p, [v.id]: val }))} testID={`stok-var-${v.id}`} />
            </View>
          ))
        ) : (
          <View style={styles.stockRow}>
            <Text style={styles.stockLabel}>Stok Saat Ini</Text>
            <StepInput value={main} onChange={setMain} testID="stok-main" />
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving} testID="stok-save">
          <Ionicons name="save" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.saveTxt}>Simpan Stok</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  hTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  prodName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  prodMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base, marginTop: 2, marginBottom: spacing.lg },
  stockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  stockLabel: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  stepBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stepBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  stepInput: { width: 64, height: 44, textAlign: "center", color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  saveBtn: { height: 54, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
