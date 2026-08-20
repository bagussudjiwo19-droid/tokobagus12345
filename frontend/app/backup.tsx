import React from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { listAutoBackups, getLastAutoBackup, runAutoBackup, markBackupShared, type AutoBackupFile } from "@/src/autobackup";

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { reload } = useData();
  const [autoList, setAutoList] = React.useState<AutoBackupFile[]>([]);
  const [lastAuto, setLastAuto] = React.useState<string | null>(null);
  const [safeResult, setSafeResult] = React.useState<
    { total: number; added: number; skipped: number; skippedList: { name: string; reason: string }[] } | null
  >(null);

  const refreshAuto = React.useCallback(async () => {
    setAutoList(await listAutoBackups());
    setLastAuto(await getLastAutoBackup());
  }, []);

  React.useEffect(() => { refreshAuto(); }, [refreshAuto]);

  const fmtTime = (iso: string | null) => {
    if (!iso) return "Belum ada";
    try { return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  // Pemulihan dengan konfirmasi (dipakai oleh import file & pulihkan auto-backup).
  const restoreWithConfirm = (data: any) => {
    if (!data || !Array.isArray(data.products)) { toast.show("File backup tidak valid.", "error"); return; }
    const jumlah = data.products.length;
    Alert.alert(
      "Pulihkan Data?",
      `File ini berisi ${jumlah} produk. Semua data di aplikasi saat ini akan DIGANTI dengan isi file. Lanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Pulihkan",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await api.importBackup(data);
              await reload();
              toast.show(`Data dipulihkan: ${result.products} produk, ${result.transactions} transaksi`, "success");
              mikoBus.emit({ type: "restore_ok" });
            } catch (e: any) { toast.show(e?.message || "Gagal memulihkan data", "error"); }
          },
        },
      ],
    );
  };

  const exportBackup = async () => {
    try {
      const data = await api.exportBackup();
      const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const uri = `${FileSystem.cacheDirectory}toko-bagus-backup-${now}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(data), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Simpan Backup" });
        await markBackupShared();
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
      restoreWithConfirm(JSON.parse(content));
    } catch (e: any) { toast.show(e?.message || "Gagal membaca file backup", "error"); }
  };

  // RESTORE AMAN: hanya menambah produk baru, tidak pernah menimpa data lama.
  const runSafeRestore = (data: any) => {
    if (!data || !Array.isArray(data.products)) { toast.show("File tidak valid.", "error"); return; }
    Alert.alert(
      "Restore data produk?",
      "Produk yang sudah memiliki nama atau barcode yang sama akan dilewati dan tidak akan ditimpa.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Restore",
          onPress: async () => {
            try {
              const r = await api.safeImportProducts(data);
              await reload();
              setSafeResult({ total: r.total, added: r.added, skipped: r.skipped, skippedList: r.skippedList });
              toast.show(`Restore selesai: ${r.added} ditambahkan, ${r.skipped} dilewati`, "success");
              if (r.added > 0) mikoBus.emit({ type: "restore_ok" });
            } catch (e: any) { toast.show(e?.message || "Gagal melakukan restore", "error"); }
          },
        },
      ],
    );
  };

  const safeRestoreFromFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      runSafeRestore(JSON.parse(content));
    } catch (e: any) { toast.show(e?.message || "Gagal membaca file", "error"); }
  };

  const backupNow = async () => {
    try {
      const uri = await runAutoBackup();
      if (!uri) { toast.show("Backup otomatis hanya berjalan di HP.", "error"); return; }
      await refreshAuto();
      toast.show("Cadangan otomatis dibuat", "success");
      mikoBus.emit({ type: "backup_ok" });
    } catch (e: any) { toast.show(e?.message || "Gagal membuat cadangan", "error"); }
  };

  const shareAuto = async (uri: string) => {
    try { if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Bagikan Backup" }); await markBackupShared(); } }
    catch (e: any) { toast.show(e?.message || "Gagal membagikan", "error"); }
  };

  const restoreAuto = async (uri: string) => {
    try {
      const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      restoreWithConfirm(JSON.parse(content));
    } catch (e: any) { toast.show(e?.message || "Gagal membaca cadangan", "error"); }
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

        <View style={{ height: spacing.xl }} />

        <Text style={styles.sectionLabel}>RESTORE AMAN (TAMBAH DATA SAJA)</Text>
        <Text style={styles.sectionDesc}>
          Menambahkan produk BARU dari file tanpa menimpa data lama. Produk yang namanya ATAU barcode-nya sudah ada akan dilewati. Aman untuk menggabungkan data dari HP lain.
        </Text>
        <Pressable style={styles.safeBtn} onPress={safeRestoreFromFile} testID="backup-safe-restore">
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.brand} />
          <Text style={styles.safeBtnTxt}>Restore Aman dari File</Text>
        </Pressable>

        <View style={{ height: spacing.xl }} />

        {/* AUTO BACKUP — otomatis sekali sehari, simpan 5 terakhir, selalu nyala */}
        <View style={styles.autoHeaderRow}>
          <Text style={styles.sectionLabel}>BACKUP OTOMATIS</Text>
          <View style={styles.onBadge}><Text style={styles.onBadgeTxt}>AKTIF</Text></View>
        </View>
        <Text style={styles.sectionDesc}>
          Aplikasi otomatis menyimpan cadangan ke penyimpanan HP sekali sehari, dan menyimpan 5 cadangan terakhir.
        </Text>
        <View style={styles.autoInfoRow}>
          <Ionicons name="time-outline" size={18} color={colors.brand} />
          <Text style={styles.autoInfoTxt}>Cadangan otomatis terakhir: {fmtTime(lastAuto)}</Text>
        </View>
        <Pressable style={styles.outlineBtn} onPress={backupNow} testID="backup-now">
          <Ionicons name="save-outline" size={20} color={colors.brand} />
          <Text style={styles.outlineBtnTxt}>Cadangkan Sekarang</Text>
        </Pressable>

        {autoList.length > 0 && (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {autoList.map((f) => (
              <View key={f.uri} style={styles.autoItem}>
                <Ionicons name="document-text-outline" size={20} color={colors.onSurfaceSecondary} />
                <Text style={styles.autoItemName} numberOfLines={1}>{f.name}</Text>
                <Pressable style={styles.iconBtn} onPress={() => shareAuto(f.uri)} testID={`auto-share-${f.name}`}>
                  <Ionicons name="share-outline" size={20} color={colors.brand} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => restoreAuto(f.uri)} testID={`auto-restore-${f.name}`}>
                  <Ionicons name="refresh-outline" size={20} color={colors.onSurfaceInverse} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {autoList.length === 0 && (
          <Text style={styles.emptyAuto}>Belum ada cadangan otomatis. Cadangan pertama dibuat otomatis saat aplikasi dibuka di HP.</Text>
        )}
      </ScrollView>

      {/* Ringkasan hasil Restore Aman */}
      <Modal visible={!!safeResult} transparent animationType="fade" onRequestClose={() => setSafeResult(null)}>
        <View style={styles.mBackdrop}>
          <View style={styles.mCard}>
            <View style={styles.mHead}>
              <Ionicons name="shield-checkmark" size={24} color={colors.brand} />
              <Text style={styles.mTitle}>Ringkasan Restore</Text>
            </View>
            {safeResult && (
              <>
                <View style={styles.mStatRow}>
                  <Text style={styles.mStatLbl}>Berhasil ditambahkan</Text>
                  <Text style={[styles.mStatVal, { color: colors.success }]} testID="safe-added">{safeResult.added}</Text>
                </View>
                <View style={styles.mStatRow}>
                  <Text style={styles.mStatLbl}>Dilewati (sudah ada)</Text>
                  <Text style={[styles.mStatVal, { color: colors.brand }]} testID="safe-skipped">{safeResult.skipped}</Text>
                </View>
                <View style={styles.mStatRow}>
                  <Text style={styles.mStatLbl}>Total data restore</Text>
                  <Text style={styles.mStatVal} testID="safe-total">{safeResult.total}</Text>
                </View>
                {safeResult.skippedList.length > 0 && (
                  <>
                    <Text style={styles.mListLabel}>Produk yang dilewati</Text>
                    <ScrollView style={styles.mList}>
                      {safeResult.skippedList.map((s, i) => (
                        <View key={`${s.name}-${i}`} style={styles.mListItem}>
                          <Text style={styles.mListName} numberOfLines={1}>{s.name}</Text>
                          <View style={styles.mReasonPill}><Text style={styles.mReasonTxt}>{s.reason}</Text></View>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                )}
              </>
            )}
            <Pressable style={styles.mCloseBtn} onPress={() => setSafeResult(null)} testID="safe-summary-close">
              <Text style={styles.mCloseTxt}>Tutup</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  safeBtn: { height: 56, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.brandTertiary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  safeBtnTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  mBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  mCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: "80%" },
  mHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  mTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  mStatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  mStatLbl: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.base },
  mStatVal: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  mListLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base, marginTop: spacing.md, marginBottom: spacing.sm },
  mList: { maxHeight: 240 },
  mListItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  mListName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.sm },
  mReasonPill: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  mReasonTxt: { color: colors.brand, fontFamily: font.medium, fontSize: 11 },
  mCloseBtn: { marginTop: spacing.lg, height: 48, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  mCloseTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.base },
  autoHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  onBadge: { backgroundColor: "#E7F6EC", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  onBadgeTxt: { color: colors.success, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.5 },
  autoInfoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  autoInfoTxt: { color: colors.onBrandTertiary, fontFamily: font.medium, fontSize: fontSize.base, flex: 1 },
  outlineBtn: { height: 52, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  outlineBtnTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  autoItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  autoItemName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.sm },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  emptyAuto: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.md, lineHeight: 18 },
});
