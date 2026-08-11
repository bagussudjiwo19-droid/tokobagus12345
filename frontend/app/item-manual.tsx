import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { useCart } from "@/src/cart";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

export default function ItemManualScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  const save = () => {
    const p = Number((price || "0").replace(/[^\d]/g, ""));
    const q = Number((qty || "1").replace(/[^\d]/g, "")) || 1;
    if (!name.trim()) return toast.show("Nama item wajib diisi", "error");
    if (p <= 0) return toast.show("Harga harus lebih dari 0", "error");
    cart.addManual(name.trim(), p, q);
    toast.show(`${name.trim()} ditambahkan`, "success");
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="manual-close">
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Item Manual</Text>
        <View style={styles.closeBtn} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.desc}>Tambah item manual atau biaya tambahan (mis. plastik, ongkos).</Text>

        <Text style={styles.label}>Nama Item</Text>
        <TextInput testID="manual-name" value={name} onChangeText={setName} placeholder="mis. Kantong Plastik" placeholderTextColor={colors.muted} style={styles.input} />

        <Text style={styles.label}>Harga (Rp)</Text>
        <TextInput testID="manual-price" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} style={styles.input} />

        <Text style={styles.label}>Jumlah (Qty)</Text>
        <TextInput testID="manual-qty" value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="1" placeholderTextColor={colors.muted} style={styles.input} />

        <Pressable style={styles.saveBtn} onPress={save} testID="manual-save">
          <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.saveTxt}>Tambah ke Daftar</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  desc: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base, marginBottom: spacing.lg },
  label: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.base, marginBottom: 6, marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 48, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  saveBtn: { height: 54, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
