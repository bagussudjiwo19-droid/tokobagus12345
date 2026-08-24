import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { isBluetoothAvailable, printText, NATIVE_ONLY_MSG } from "@/src/printer";
import { buildBuktiReceiptText, buildBuktiReceiptHTML } from "@/src/receipt";
import BuktiReceipt58 from "@/components/BuktiReceipt58";
import type { Bukti, Settings } from "@/src/types";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

// Halaman Preview Struk 58mm — otomatis mengambil data dari Bukti (by id).
export default function PreviewStrukScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [bukti, setBukti] = useState<Bukti | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [printer, setPrinter] = useState<{ address?: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const shotRef = useRef<View>(null);

  useEffect(() => {
    (async () => {
      const [list, s, p] = await Promise.all([api.getBukti(2000), api.getSettings(), api.getPrinter()]);
      setSettings(s); setPrinter(p);
      setBukti(list.find((b) => b.id === id) || null);
    })().catch(() => {});
  }, [id]);

  const doPrint = useCallback(async () => {
    if (!bukti) return;
    if (!isBluetoothAvailable()) { toast.show(NATIVE_ONLY_MSG, "info"); return; }
    if (!printer?.address) { toast.show("Printer belum dipilih. Buka Pengaturan Printer.", "error"); return; }
    setBusy("print");
    try { await printText(printer.address, buildBuktiReceiptText(bukti, settings as Settings)); toast.show("Struk dikirim ke printer", "success"); }
    catch (e: any) { toast.show(e?.message || "Gagal mencetak", "error"); }
    finally { setBusy(null); }
  }, [bukti, printer, settings, toast]);

  const doShare = useCallback(async () => {
    if (!bukti) return;
    setBusy("share");
    try {
      const Print = await import("expo-print");
      const { uri } = await Print.printToFileAsync({ html: buildBuktiReceiptHTML(bukti, settings as Settings) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Bagikan Struk" });
      else toast.show("Berbagi butuh aplikasi hasil build", "info");
    } catch (e: any) { toast.show(e?.message || "Gagal membagikan", "error"); }
    finally { setBusy(null); }
  }, [bukti, settings, toast]);

  const doSaveImage = useCallback(async () => {
    setBusy("png");
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { toast.show("Izin simpan galeri ditolak", "error"); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      toast.show("Gambar struk tersimpan di galeri", "success");
    } catch (e: any) { toast.show(e?.message || "Gagal menyimpan gambar (butuh build)", "error"); }
    finally { setBusy(null); }
  }, [toast]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.hIcon}><Ionicons name="arrow-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Preview Struk 58mm</Text>
        <View style={styles.hIcon} />
      </View>

      {!bukti ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.paperShadow}>
              <View ref={shotRef} collapsable={false}><BuktiReceipt58 b={bukti} /></View>
            </View>
            <Text style={styles.caption}>Contoh hasil cetak · Printer Thermal 58mm</Text>
          </ScrollView>

          <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable style={styles.secBtn} onPress={doShare} disabled={!!busy} testID="preview-share">
              {busy === "share" ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="share-social" size={20} color={colors.brand} />}
              <Text style={styles.secTxt}>Bagikan</Text>
            </Pressable>
            <Pressable style={styles.secBtn} onPress={doSaveImage} disabled={!!busy} testID="preview-save-img">
              {busy === "png" ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="image-outline" size={20} color={colors.brand} />}
              <Text style={styles.secTxt}>Simpan</Text>
            </Pressable>
            <Pressable style={styles.printBtn} onPress={doPrint} disabled={!!busy} testID="preview-print">
              {busy === "print" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="print" size={20} color={colors.onBrandPrimary} />}
              <Text style={styles.printTxt}>Cetak</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceTertiary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  hIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { alignItems: "center", padding: spacing.lg },
  paperShadow: { backgroundColor: "#FFFFFF", borderRadius: 6, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  caption: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.md },
  bar: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  secBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surfaceSecondary },
  secTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  printBtn: { flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 52, borderRadius: radius.md, backgroundColor: colors.brand },
  printTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
