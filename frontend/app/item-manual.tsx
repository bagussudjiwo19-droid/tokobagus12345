import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useCart } from "@/src/cart";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

export default function ItemManualScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const { reload } = useData();
  const toast = useToast();
  const [name, setName] = useState("");
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [barcode, setBarcode] = useState("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);

  const parse = (s: string) => Number((s || "0").replace(/[^\d]/g, "")) || 0;

  const validate = () => {
    if (!name.trim()) { toast.show("Nama item wajib diisi", "error"); return false; }
    if (parse(sell) <= 0) { toast.show("Harga jual harus lebih dari 0", "error"); return false; }
    return true;
  };

  const addTemporary = () => {
    if (!validate()) return;
    cart.addManual(name.trim(), parse(sell), parse(qty) || 1);
    toast.show(`${name.trim()} ditambahkan (transaksi ini)`, "success");
    router.back();
  };

  const addPermanent = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const q = parse(qty) || 1;
      const created = await api.createProduct({
        name: name.trim(),
        buy_price: parse(buy),
        sell_price: parse(sell),
        barcode: barcode.trim() || null,
        stock: q,
        unit: "pcs",
      });
      cart.addProduct(created);
      if (q > 1) cart.setQty(created.id, q);
      await reload();
      toast.show(`${name.trim()} disimpan ke produk & ditambahkan`, "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan produk", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Tambah Item</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="manual-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Field label="Nama" value={name} onChange={setName} placeholder="mis. Kantong Plastik" testID="manual-name" />
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Harga Beli" value={buy} onChange={setBuy} keyboardType="numeric" prefix="Rp" testID="manual-buy" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Harga Jual" value={sell} onChange={setSell} keyboardType="numeric" prefix="Rp" testID="manual-price" />
          </View>
        </View>
        <Field label="Barcode" value={barcode} onChange={setBarcode} placeholder="opsional" testID="manual-barcode" />
        <Field label="Jumlah" value={qty} onChange={setQty} keyboardType="numeric" testID="manual-qty" />

        <Pressable style={[styles.optRed, saving && { opacity: 0.5 }]} onPress={addTemporary} disabled={saving} testID="manual-temporary">
          <Ionicons name="cart-outline" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.optRedTxt}>Simpan untuk transaksi ini saja</Text>
        </Pressable>
        <Pressable style={[styles.optDark, saving && { opacity: 0.5 }]} onPress={addPermanent} disabled={saving} testID="manual-permanent">
          <Ionicons name="save-outline" size={18} color={colors.onSurfaceInverse} />
          <Text style={styles.optDarkTxt}>Simpan ke data permanen</Text>
        </Pressable>
        <Text style={styles.note}>
          {`"Transaksi ini saja" tidak masuk data produk. "Data permanen" menambah produk baru yang bisa dipakai transaksi berikutnya.`}
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, prefix, testID }: { label: string; value: string; onChange: (t: string) => void; placeholder?: string; keyboardType?: any; prefix?: string; testID?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputBox}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType || "default"} style={styles.input} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  label: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, marginBottom: 6 },
  inputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 50 },
  prefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.lg, marginRight: 6 },
  input: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  row2: { flexDirection: "row", gap: spacing.md },
  optRed: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.md, backgroundColor: colors.brand, marginTop: spacing.lg },
  optRedTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  optDark: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.md, backgroundColor: colors.surfaceInverse, marginTop: spacing.md },
  optDarkTxt: { color: colors.onSurfaceInverse, fontFamily: font.bold, fontSize: fontSize.lg },
  note: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.md, lineHeight: 18 },
});
