import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import { mikoBus } from "@/src/mikoBus";

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { reload } = useData();

  const exportBackup = async () => {
    try {
      const data = await api.exportBackup();
      const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const uri = `${FileSystem.cacheDirectory}toko-bagus-backup-${now}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(data), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Simpan Backup" });
      }
      toast.show(`File backup dibuat: ${data.counts.products} produk`, "success");
      mikoBus.emit({ type: "backup_ok" });
    } catch (e: any) { toast.show(e?.message || "Gagal membuat backup", "error"); }
  };

  const importBackup = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      const data = JSON.parse(content);
      if (!data.products) { toast.show("File backup tidak valid.", "error"); return; }
      const result = await api.importBackup(data);
      await reload();
      toast.show(`Data dipulihkan: ${result.products} produk, ${result.transactions} transaksi`, "success");
      mikoBus.emit({ type: "restore_ok" });
    } catch (e: any) { toast.show(e?.message || "Gagal memulihkan data", "error"); }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="backup-close">
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Backup & Pulihkan</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTxt}>
            Backup menyimpan seluruh Produk, variasi, harga beli/jual, harga bertingkat, stok, transaksi/riwayat, dan pengaturan struk ke satu file. Simpan di tempat aman (mis. Google Drive atau chat WhatsApp ke diri sendiri).
          </Text>
        </View>

        <Text style={styles.sectionLabel}>EXPORT / BUAT BACKUP</Text>
        <Text style={styles.sectionDesc}>Buat satu file backup (.json) berisi semua data penting aplikasi.</Text>
        <Pressable style={styles.redBtn} onPress={exportBackup} testID="backup-export">
          <Ionicons name="download-outline" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.redBtnTxt}>Buat File Backup</Text>
        </Pressable>

        <View style={{ height: spacing.xl }} />

        <Text style={styles.sectionLabel}>IMPORT / PULIHKAN</Text>
        <Text style={styles.sectionDesc}>
          Pilih file backup untuk memulihkan data. PERHATIAN: memulihkan akan MENGGANTI semua data saat ini.
        </Text>
        <Pressable style={styles.darkBtn} onPress={importBackup} testID="backup-import">
          <Ionicons name="folder-open-outline" size={22} color={colors.onSurfaceInverse} />
          <Text style={styles.darkBtnTxt}>Pilih File Backup</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  closeBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  infoBox: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.xl },
  infoTxt: { color: colors.onBrandTertiary, fontFamily: font.regular, fontSize: fontSize.base, lineHeight: 20 },
  sectionLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base, letterSpacing: 0.5, marginBottom: spacing.sm },
  sectionDesc: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.base, marginBottom: spacing.md, lineHeight: 20 },
  redBtn: { height: 56, borderRadius: radius.lg, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  redBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  darkBtn: { height: 56, borderRadius: radius.lg, backgroundColor: colors.surfaceInverse, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  darkBtnTxt: { color: colors.onSurfaceInverse, fontFamily: font.bold, fontSize: fontSize.lg },
});
