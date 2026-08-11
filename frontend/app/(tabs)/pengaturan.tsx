import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Printer, Settings } from "@/src/types";
import { isBluetoothAvailable, listPairedPrinters, printText, NATIVE_ONLY_MSG, type BTDevice } from "@/src/printer";

const RECEIPT_TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: "showShopName", label: "Nama Toko" },
  { key: "showAddress", label: "Alamat Toko" },
  { key: "showPhone", label: "Nomor Telepon" },
  { key: "showDateTime", label: "Tanggal & Waktu" },
  { key: "showTxNumber", label: "Nomor Transaksi" },
  { key: "showCashier", label: "Nama Kasir" },
  { key: "showItemName", label: "Nama Barang" },
  { key: "showVariation", label: "Variasi" },
  { key: "showUnitPrice", label: "Harga Satuan" },
  { key: "showQty", label: "Jumlah (Qty)" },
  { key: "showSubtotal", label: "Subtotal" },
  { key: "showTotal", label: "Total" },
  { key: "showCashPaid", label: "Uang Bayar" },
  { key: "showChange", label: "Kembalian" },
  { key: "showThanks", label: "Ucapan Terima Kasih" },
];

export default function PengaturanScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { reload } = useData();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [printer, setPrinter] = useState<Printer>({});
  const [devices, setDevices] = useState<BTDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    api.getPrinter().then(setPrinter).catch(() => {});
  }, []);

  const setField = (k: keyof Settings, v: any) => setSettings((s) => (s ? { ...s, [k]: v } : s));

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.saveSettings(settings);
      toast.show("Pengaturan disimpan", "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  const scanPrinters = async () => {
    if (!isBluetoothAvailable()) return toast.show(NATIVE_ONLY_MSG, "info");
    setScanning(true);
    try {
      const list = await listPairedPrinters();
      setDevices(list);
      if (list.length === 0) toast.show("Tidak ada printer terpasang. Pasangkan (pair) dulu di Bluetooth HP.", "info");
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencari printer", "error");
    } finally {
      setScanning(false);
    }
  };

  const choosePrinter = async (d: BTDevice) => {
    try {
      await api.savePrinter({ address: d.address, name: d.name });
      setPrinter({ address: d.address, name: d.name });
      toast.show(`Printer ${d.name} dipilih`, "success");
    } catch {
      toast.show("Gagal menyimpan printer", "error");
    }
  };

  const testPrint = async () => {
    if (!isBluetoothAvailable()) return toast.show(NATIVE_ONLY_MSG, "info");
    if (!printer.address) return toast.show("Pilih printer terlebih dahulu", "info");
    try {
      await printText(printer.address, "TOKO BAGUS\nTes Cetak Bluetooth\n--------------------------------\nPrinter siap digunakan.\n\n\n");
      toast.show("Tes cetak terkirim", "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencetak", "error");
    }
  };

  const exportBackup = async () => {
    try {
      const data = await api.exportBackup();
      const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const uri = `${FileSystem.cacheDirectory}toko-bagus-backup-${now}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(data), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Simpan Backup" });
      }
      toast.show(`Backup dibuat: ${data.counts.products} produk`, "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal membuat backup", "error");
    }
  };

  const importBackup = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      const data = JSON.parse(content);
      if (!data.products) {
        toast.show("File backup tidak valid.", "error");
        return;
      }
      const result = await api.importBackup(data);
      await reload();
      const s = await api.getSettings();
      setSettings(s);
      toast.show(`Data dipulihkan: ${result.products} produk, ${result.transactions} transaksi`, "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal memulihkan data", "error");
    }
  };

  if (!settings) {
    return <View style={styles.container} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Pengaturan</Text>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {/* Informasi Toko */}
        <Section title="Informasi Toko" icon="storefront-outline">
          <LabeledInput label="Nama Toko" value={settings.shopName} onChange={(t) => setField("shopName", t)} testID="set-shopname" />
          <LabeledInput label="Alamat" value={settings.address} onChange={(t) => setField("address", t)} testID="set-address" />
          <LabeledInput label="Telepon" value={settings.phone} onChange={(t) => setField("phone", t)} keyboardType="phone-pad" testID="set-phone" />
          <LabeledInput label="Nama Kasir" value={settings.cashier} onChange={(t) => setField("cashier", t)} testID="set-cashier" />
          <LabeledInput label="Ucapan Terima Kasih" value={settings.thanks} onChange={(t) => setField("thanks", t)} testID="set-thanks" />
        </Section>

        {/* Pengaturan Struk */}
        <Section title="Pengaturan Struk" icon="reader-outline">
          {RECEIPT_TOGGLES.map((t) => (
            <View key={t.key as string} style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t.label}</Text>
              <Switch
                testID={`toggle-${t.key as string}`}
                value={!!settings[t.key]}
                onValueChange={(v) => setField(t.key, v)}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </Section>

        <Pressable style={styles.saveBtn} onPress={saveSettings} disabled={saving} testID="set-save">
          <Ionicons name="save" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.saveTxt}>Simpan Pengaturan</Text>
        </Pressable>

        {/* Printer Bluetooth */}
        <Section title="Printer Bluetooth" icon="print-outline">
          <View style={styles.printerStatus}>
            <Ionicons name={printer.address ? "checkmark-circle" : "alert-circle"} size={18} color={printer.address ? colors.brand : colors.muted} />
            <Text style={styles.printerStatusTxt}>{printer.name ? `${printer.name}` : "Belum ada printer dipilih"}</Text>
          </View>
          <Text style={styles.note}>Tes Cetak Bluetooth hanya di aplikasi hasil build (bukan Expo Go/preview).</Text>
          <View style={styles.printerBtnRow}>
            <Pressable style={styles.outlineBtn} onPress={scanPrinters} testID="printer-scan">
              <Ionicons name="search" size={18} color={colors.brand} />
              <Text style={styles.outlineTxt}>{scanning ? "Mencari…" : "Cari Printer Terpasang"}</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={testPrint} testID="printer-test">
              <Ionicons name="print" size={18} color={colors.brand} />
              <Text style={styles.outlineTxt}>Tes Cetak</Text>
            </Pressable>
          </View>
          {devices.map((d) => (
            <Pressable key={d.address} style={styles.deviceRow} onPress={() => choosePrinter(d)} testID={`printer-device-${d.address}`}>
              <Ionicons name="bluetooth" size={18} color={colors.brand} />
              <Text style={styles.deviceName}>{d.name}</Text>
              {printer.address === d.address && <Ionicons name="checkmark" size={18} color={colors.brand} />}
            </Pressable>
          ))}
        </Section>

        {/* Data & Backup */}
        <Section title="Data & Backup" icon="save-outline">
          <Text style={styles.note}>Buat satu file backup (.json) berisi semua data penting aplikasi.</Text>
          <View style={styles.printerBtnRow}>
            <Pressable style={styles.outlineBtn} onPress={exportBackup} testID="backup-export">
              <Ionicons name="download-outline" size={18} color={colors.brand} />
              <Text style={styles.outlineTxt}>Buat Backup</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={importBackup} testID="backup-import">
              <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
              <Text style={styles.outlineTxt}>Pulihkan</Text>
            </Pressable>
          </View>
          <Text style={styles.warn}>PERHATIAN: Memulihkan akan MENGGANTI semua data saat ini.</Text>
        </Section>

        <Text style={styles.footerNote}>Toko Bagus • Kasir Warung</Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={18} color={colors.brand} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function LabeledInput({ label, value, onChange, keyboardType, testID }: { label: string; value: string; onChange: (t: string) => void; keyboardType?: any; testID?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType || "default"}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface, paddingVertical: spacing.sm },
  section: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  inputLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 46, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  toggleLabel: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.base },
  saveBtn: { height: 52, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.lg },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  printerStatus: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  printerStatusTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  note: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 18 },
  warn: { color: colors.warning, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.sm },
  printerBtnRow: { flexDirection: "row", gap: spacing.md },
  outlineBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, backgroundColor: colors.surface },
  outlineTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  deviceName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  footerNote: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, textAlign: "center", marginTop: spacing.sm },
});
