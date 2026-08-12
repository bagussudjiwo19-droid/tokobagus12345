import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Printer } from "@/src/types";
import { isBluetoothAvailable, discoverPrinters, connectPrinter, printText, NATIVE_ONLY_MSG, type BTDevice } from "@/src/printer";

export default function PengaturanPrinterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [printer, setPrinter] = useState<Printer>({});
  const [devices, setDevices] = useState<BTDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [scannedOnce, setScannedOnce] = useState(false);

  useEffect(() => { api.getPrinter().then(setPrinter).catch(() => {}); }, []);

  const scan = async () => {
    if (!isBluetoothAvailable()) return toast.show(NATIVE_ONLY_MSG, "info");
    setScanning(true);
    try {
      const list = await discoverPrinters();
      setDevices(list);
      setScannedOnce(true);
      if (list.length === 0) toast.show("Tidak ada perangkat Bluetooth ditemukan. Dekatkan & nyalakan printer, lalu Scan Ulang.", "info");
      else toast.show(`${list.length} perangkat ditemukan`, "success");
    } catch (e: any) { toast.show(e?.message || "Gagal mencari printer", "error"); }
    finally { setScanning(false); }
  };

  const choose = async (d: BTDevice) => {
    if (!isBluetoothAvailable()) return toast.show(NATIVE_ONLY_MSG, "info");
    setConnecting(d.address);
    try {
      await connectPrinter(d.address);
      await api.savePrinter({ address: d.address, name: d.name });
      setPrinter({ address: d.address, name: d.name });
      toast.show(`Berhasil terhubung ke ${d.name}`, "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal terhubung ke printer", "error");
    } finally {
      setConnecting(null);
    }
  };

  const testPrint = async () => {
    if (!isBluetoothAvailable()) return toast.show(NATIVE_ONLY_MSG, "info");
    if (!printer.address) return toast.show("Pilih printer terlebih dahulu", "info");
    try { await printText(printer.address, "TOKO BAGUS\nTes Cetak Bluetooth\n--------------------------------\nPrinter siap digunakan.\n\n\n"); toast.show("Berhasil mencetak struk", "success"); }
    catch (e: any) { toast.show(e?.message || "Gagal mencetak struk", "error"); }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.hTitle}>Pengaturan Printer</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="printer-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={22} color={colors.brand} />
          <Text style={styles.infoTxt}>Nama toko & isi struk diatur di menu Pengaturan Struk. Struk mencetak sebagai TOKO BAGUS.</Text>
        </View>

        <Pressable style={styles.outlineBtn} onPress={scan} disabled={scanning} testID="printer-scan">
          <Ionicons name="bluetooth" size={20} color={colors.onSurface} />
          <Text style={styles.outlineTxt}>{scanning ? "Mencari perangkat…" : "Cari Perangkat Bluetooth"}</Text>
        </Pressable>
        {scannedOnce && !scanning && (
          <Pressable style={styles.rescanBtn} onPress={scan} testID="printer-rescan">
            <Ionicons name="refresh" size={18} color={colors.brand} />
            <Text style={styles.rescanTxt}>Scan Ulang</Text>
          </Pressable>
        )}
        <Text style={styles.subtext}>Aplikasi akan meminta izin Bluetooth & Lokasi lalu mencari perangkat di sekitar.</Text>

        {devices.map((d) => (
          <Pressable key={d.address} style={styles.deviceRow} onPress={() => choose(d)} disabled={!!connecting} testID={`printer-device-${d.address}`}>
            <Ionicons name="bluetooth" size={20} color={colors.brand} />
            <Text style={styles.deviceName} numberOfLines={1}>{d.name}</Text>
            {connecting === d.address ? (
              <Text style={styles.connectingTxt}>Menghubungkan…</Text>
            ) : printer.address === d.address ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            ) : null}
          </Pressable>
        ))}

        {!!printer.name && (
          <View style={styles.connected} testID="printer-connected">
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.connectedTxt}>Terhubung: {printer.name}</Text>
          </View>
        )}

        <Pressable style={styles.darkBtn} onPress={testPrint} testID="printer-test">
          <Ionicons name="print-outline" size={20} color={colors.onSurfaceInverse} />
          <Text style={styles.darkBtnTxt}>Tes Cetak</Text>
        </Pressable>

        <Pressable style={styles.redBtn} onPress={() => router.back()} testID="printer-done">
          <Text style={styles.redBtnTxt}>Selesai</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  hTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  infoBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg },
  infoTxt: { flex: 1, color: colors.onBrandTertiary, fontFamily: font.bold, fontSize: fontSize.base, lineHeight: 20 },
  outlineBtn: { height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  outlineTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  subtext: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base, marginTop: spacing.sm },
  rescanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, backgroundColor: colors.surfaceSecondary },
  rescanTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  connectingTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  deviceName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  connected: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  connectedTxt: { color: colors.success, fontFamily: font.bold, fontSize: fontSize.lg },
  darkBtn: { height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceInverse, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg },
  darkBtnTxt: { color: colors.onSurfaceInverse, fontFamily: font.bold, fontSize: fontSize.lg },
  redBtn: { height: 56, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  redBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
