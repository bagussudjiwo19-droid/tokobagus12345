import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import { hasAdminPin, setAdminPin, verifyAdminPin } from "@/src/adminPin";

// Ubah/atur PIN Admin (untuk keluar dari kios Cek Harga). Disimpan aman (hash).
export default function AdminPinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [exists, setExists] = useState(false);
  const [cur, setCur] = useState("");
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { hasAdminPin().then(setExists).catch(() => {}); }, []);

  const save = async () => {
    if (saving) return;
    if (exists) {
      const ok = await verifyAdminPin(cur.trim());
      if (!ok) { toast.show("PIN lama salah.", "error"); return; }
    }
    if (!/^\d{4,6}$/.test(np.trim())) { toast.show("PIN baru harus 4–6 angka.", "error"); return; }
    if (np.trim() !== np2.trim()) { toast.show("Konfirmasi PIN tidak sama.", "error"); return; }
    setSaving(true);
    try {
      await setAdminPin(np.trim());
      toast.show(exists ? "PIN Admin berhasil diubah" : "PIN Admin berhasil dibuat", "success");
      router.back();
    } catch {
      toast.show("Gagal menyimpan PIN", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.hTitle}>PIN Admin</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="pin-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBox}>
            <Ionicons name="lock-closed-outline" size={22} color={colors.brand} />
            <Text style={styles.infoTxt}>PIN Admin dipakai untuk keluar dari mode kios Cek Harga. Simpan dengan aman, jangan diberitahukan ke pelanggan.</Text>
          </View>

          {exists && (
            <>
              <Text style={styles.label}>PIN Lama</Text>
              <TextInput style={styles.input} value={cur} onChangeText={(t) => setCur(t.replace(/\D/g, ""))} placeholder="PIN lama" placeholderTextColor={colors.muted} keyboardType="number-pad" secureTextEntry maxLength={6} testID="pin-cur" />
            </>
          )}

          <Text style={styles.label}>PIN Baru (4–6 angka)</Text>
          <TextInput style={styles.input} value={np} onChangeText={(t) => setNp(t.replace(/\D/g, ""))} placeholder="PIN baru" placeholderTextColor={colors.muted} keyboardType="number-pad" secureTextEntry maxLength={6} testID="pin-new" />

          <Text style={styles.label}>Konfirmasi PIN Baru</Text>
          <TextInput style={styles.input} value={np2} onChangeText={(t) => setNp2(t.replace(/\D/g, ""))} placeholder="Ulangi PIN baru" placeholderTextColor={colors.muted} keyboardType="number-pad" secureTextEntry maxLength={6} onSubmitEditing={save} testID="pin-new2" />

          <Pressable style={styles.saveBtn} onPress={save} disabled={saving} testID="pin-save">
            <Text style={styles.saveTxt}>{exists ? "Ubah PIN" : "Buat PIN"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingBottom: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary },
  hTitle: { fontFamily: font.bold, fontSize: fontSize.xl, color: colors.onSurface },
  closeBtn: { position: "absolute", right: spacing.md, bottom: spacing.md, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  infoBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoTxt: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 19 },
  label: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginBottom: 6, marginTop: spacing.md },
  input: { height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.lg, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl, letterSpacing: 4 },
  saveBtn: { height: 54, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
