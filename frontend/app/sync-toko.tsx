import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import {
  getStoreCode, setStoreCode, clearStoreCode, makeStoreCode,
  syncOnce, onSyncStatus, type SyncStatus,
} from "@/src/sync";

export default function SyncTokoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [code, setCode] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [status, setStatus] = React.useState<SyncStatus>({ state: "nostore" });
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => { setCode(await getStoreCode()); }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  React.useEffect(() => onSyncStatus(setStatus), []);

  const createNew = async () => {
    const c = makeStoreCode();
    await setStoreCode(c);
    setCode(c);
    toast.show("Kode Toko dibuat", "success");
    doSync();
  };

  const join = async () => {
    const c = input.trim().toUpperCase();
    if (c.length < 4) { toast.show("Masukkan Kode Toko yang benar", "error"); return; }
    await setStoreCode(c);
    setCode(c);
    setInput("");
    toast.show("Tersambung ke Kode Toko", "success");
    doSync();
  };

  const doSync = async () => {
    setBusy(true);
    const s = await syncOnce();
    setBusy(false);
    if (s.state === "ok") toast.show("Sinkronisasi berhasil", "success");
    else if (s.state === "offline") toast.show("Tidak ada internet — nanti otomatis dicoba lagi", "error");
    else if (s.state === "nostore") toast.show("Belum ada Kode Toko", "error");
  };

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    toast.show("Kode disalin", "success");
  };

  const disconnect = () => {
    Alert.alert(
      "Putuskan Sambungan?",
      "HP ini akan berhenti sinkron dengan Kode Toko. Data yang sudah ada di HP tetap aman.",
      [
        { text: "Batal", style: "cancel" },
        { text: "Putuskan", style: "destructive", onPress: async () => { await clearStoreCode(); setCode(null); toast.show("Sambungan diputus", "success"); } },
      ],
    );
  };

  const statusInfo = () => {
    switch (status.state) {
      case "syncing": return { icon: "sync" as const, txt: "Menyinkronkan…", color: colors.brand };
      case "ok": return { icon: "cloud-done" as const, txt: "Tersinkron", color: "#2E7D32" };
      case "offline": return { icon: "cloud-offline" as const, txt: "Offline — menunggu internet", color: colors.muted };
      default: return { icon: "cloud-outline" as const, txt: "Belum tersambung", color: colors.muted };
    }
  };
  const si = statusInfo();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="sync-close">
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Sinkron Cloud (Kode Toko)</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTxt}>
            Sambungkan beberapa HP ke satu Kode Toko agar produk, harga, dan transaksi otomatis tersinkron saat ada internet. Aplikasi tetap jalan penuh walau offline.
          </Text>
        </View>

        {/* Status */}
        <View style={styles.statusRow}>
          <Ionicons name={si.icon} size={20} color={si.color} />
          <Text style={[styles.statusTxt, { color: si.color }]}>{si.txt}</Text>
        </View>

        {code ? (
          <>
            <Text style={styles.sectionLabel}>KODE TOKO HP INI</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeTxt} selectable testID="sync-code">{code}</Text>
              <Pressable onPress={copy} style={styles.copyBtn} testID="sync-copy">
                <Ionicons name="copy-outline" size={20} color={colors.brand} />
              </Pressable>
            </View>
            <Text style={styles.sectionDesc}>Ketik kode yang sama di HP lain (di layar ini) untuk menyambungkannya.</Text>

            <Pressable style={[styles.redBtn, busy && { opacity: 0.6 }]} onPress={doSync} disabled={busy} testID="sync-now">
              <Ionicons name="sync" size={22} color={colors.onBrandPrimary} />
              <Text style={styles.redBtnTxt}>{busy ? "Menyinkronkan…" : "Sinkronkan Sekarang"}</Text>
            </Pressable>

            <Pressable style={styles.outlineBtn} onPress={disconnect} testID="sync-disconnect">
              <Ionicons name="unlink-outline" size={20} color={colors.error} />
              <Text style={styles.outlineTxt}>Putuskan Sambungan</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>HP PERTAMA</Text>
            <Text style={styles.sectionDesc}>Buat Kode Toko baru di sini, lalu pakai kode tersebut di HP lain.</Text>
            <Pressable style={styles.redBtn} onPress={createNew} testID="sync-create">
              <Ionicons name="add-circle-outline" size={22} color={colors.onBrandPrimary} />
              <Text style={styles.redBtnTxt}>Buat Kode Toko Baru</Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>HP LAIN (SUDAH PUNYA KODE)</Text>
            <Text style={styles.sectionDesc}>Masukkan Kode Toko dari HP pertama.</Text>
            <TextInput
              value={input}
              onChangeText={setInput}
              autoCapitalize="characters"
              placeholder="cth: TOKO-1234-ABCD"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="sync-input"
            />
            <Pressable style={styles.outlineBtn} onPress={join} testID="sync-join">
              <Ionicons name="link-outline" size={20} color={colors.brand} />
              <Text style={[styles.outlineTxt, { color: colors.brand }]}>Sambungkan</Text>
            </Pressable>
          </>
        )}

        <View style={[styles.infoBox, { marginTop: spacing.xl, backgroundColor: colors.surfaceSecondary }]}>
          <Text style={styles.noteTxt}>
            Catatan: fitur ini butuh internet & server aktif. Jika server dimatikan, sinkron berhenti tetapi Backup/Pulihkan manual tetap bisa dipakai untuk memindahkan data antar-HP.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: font.bold, fontSize: fontSize.xl, color: colors.onSurface },
  infoBox: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoTxt: { color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base, lineHeight: 20 },
  noteTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 18 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  statusTxt: { fontFamily: font.bold, fontSize: fontSize.base },
  sectionLabel: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.muted, letterSpacing: 1, marginBottom: 4 },
  sectionDesc: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.md },
  codeBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.sm },
  codeTxt: { fontFamily: font.display, fontSize: fontSize.xl, color: colors.brand, letterSpacing: 1 },
  copyBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 52, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, marginBottom: spacing.md },
  redBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.md, backgroundColor: colors.brand, marginBottom: spacing.md },
  redBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 50, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  outlineTxt: { color: colors.error, fontFamily: font.bold, fontSize: fontSize.base },
});
