import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Tier } from "../src/types";
import { colors, font, fontSize, radius, spacing } from "../src/theme";

/** Editor harga bertingkat (grosir) mandiri — dipakai di form variasi. */
export default function TierEditor({
  title,
  tiers,
  onChange,
  testPrefix,
}: {
  title: string;
  tiers: Tier[];
  onChange: (t: Tier[]) => void;
  testPrefix: string;
}) {
  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Pressable testID={`${testPrefix}-add`} onPress={() => onChange([...tiers, { min_qty: 0, price: 0 }])} style={styles.addBtn}>
          <Ionicons name="add" size={18} color={colors.brand} />
          <Text style={styles.addTxt}>Tambah</Text>
        </Pressable>
      </View>
      {tiers.length === 0 && <Text style={styles.empty}>Belum ada tingkat harga. Ketuk Tambah untuk membuat.</Text>}
      {tiers.map((t, i) => (
        <View key={i} style={styles.card} testID={`${testPrefix}-${i}`}>
          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.lbl}>Min Qty</Text>
              <TextInput
                testID={`${testPrefix}-qty-${i}`}
                value={t.min_qty ? String(t.min_qty) : ""}
                onChangeText={(v) => onChange(tiers.map((x, xi) => (xi === i ? { ...x, min_qty: Number(v.replace(/[^\d]/g, "")) || 0 } : x)))}
                keyboardType="numeric"
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.lbl}>Harga</Text>
              <TextInput
                testID={`${testPrefix}-price-${i}`}
                value={t.price ? String(t.price) : ""}
                onChangeText={(v) => onChange(tiers.map((x, xi) => (xi === i ? { ...x, price: Number(v.replace(/[^\d]/g, "")) || 0 } : x)))}
                keyboardType="numeric"
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.muted}
              />
            </View>
            <Pressable onPress={() => onChange(tiers.filter((_, xi) => xi !== i))} style={styles.del} testID={`${testPrefix}-remove-${i}`}>
              <Ionicons name="close" size={18} color={colors.error} />
            </Pressable>
          </View>
          <View style={styles.noteField}>
            <Text style={styles.lbl}>Keterangan (tampil di Cek Harga)</Text>
            <TextInput
              testID={`${testPrefix}-note-${i}`}
              value={t.note ?? ""}
              onChangeText={(v) => onChange(tiers.map((x, xi) => (xi === i ? { ...x, note: v } : x)))}
              style={styles.input}
              placeholder="mis. 1 renceng 4500"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4, paddingHorizontal: 8 },
  addTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  empty: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  noteField: { marginTop: spacing.sm },
  field: { flex: 1 },
  lbl: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 44, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  del: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
});
