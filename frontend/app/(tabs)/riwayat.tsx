import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";

import AppHeader from "@/components/AppHeader";
import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { rupiah, formatDateID } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Settings, Transaction } from "@/src/types";
import ReceiptPreview from "@/components/ReceiptPreview";
import { isBluetoothAvailable, printText, NATIVE_ONLY_MSG } from "@/src/printer";
import { buildReceiptText } from "@/src/receipt";

export default function RiwayatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [printer, setPrinter] = useState<{ address?: string | null }>({});
  const [selected, setSelected] = useState<Transaction | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const receiptRef = useRef<View>(null);

  const load = useCallback(async () => {
    try {
      const [t, s, p] = await Promise.all([api.getTransactions(200), api.getSettings(), api.getPrinter()]);
      setTxs(t); setSettings(s); setPrinter(p);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const omzet = useMemo(() => txs.reduce((s, t) => s + (t.total || 0), 0), [txs]);

  const openDetail = (tx: Transaction) => { setSelected(tx); sheetRef.current?.present(); };

  const shareReceipt = async () => {
    try {
      const uri = await captureRef(receiptRef, { format: "png", quality: 1 });
      if (!(await Sharing.isAvailableAsync())) return;
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Bagikan Struk" });
    } catch { toast.show("Gagal membuat gambar struk", "error"); }
  };

  const printReceipt = async () => {
    if (!isBluetoothAvailable()) return toast.show(NATIVE_ONLY_MSG, "info");
    if (!printer.address) return toast.show("Belum ada printer terpasang.", "info");
    if (!selected || !settings) return;
    try { await printText(printer.address, buildReceiptText(selected, settings)); toast.show("Struk dikirim ke printer", "success"); }
    catch (e: any) { toast.show(e?.message || "Gagal mencetak", "error"); }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const renderRow = ({ item }: { item: Transaction }) => (
    <Pressable style={styles.row} onPress={() => openDetail(item)} testID={`riwayat-row-${item.id}`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDate}>{formatDateID(item.created_at)}</Text>
        <Text style={styles.rowSub}>{item.items.length} baris · Tunai · Ketuk untuk struk</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.rowTotal}>{rupiah(item.total)}</Text>
        <Text style={styles.rowChange}>Kembali {rupiah(item.change)}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.titleBlock}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Riwayat</Text>
          <Text style={styles.subtitle}>Transaksi yang sudah tersimpan</Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.actionIcon} testID="riwayat-backup" onPress={() => router.push("/backup")}>
            <Ionicons name="save-outline" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable style={styles.actionIcon} testID="riwayat-struk-settings" onPress={() => router.push("/pengaturan-struk")}>
            <Ionicons name="reader-outline" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable style={styles.actionIcon} testID="riwayat-printer-settings" onPress={() => router.push("/pengaturan-printer")}>
            <Ionicons name="print-outline" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <View style={styles.summary} testID="riwayat-summary">
        <Text style={styles.sumLabel}>Total Pendapatan · {txs.length} transaksi</Text>
        <Text style={styles.sumValue}>{rupiah(omzet)}</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={(t) => t.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 24 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="receipt-outline" size={40} color={colors.muted} />
              <Text style={styles.dim}>Belum ada transaksi</Text>
            </View>
          }
        />
      )}

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["85%"]}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: "center", paddingBottom: insets.bottom + 40 }}>
          <Text style={styles.detailTitle}>Detail Transaksi</Text>
          <View collapsable={false} ref={receiptRef} style={{ width: "100%", maxWidth: 320 }}>
            {selected && settings && <ReceiptPreview tx={selected} settings={settings} />}
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={shareReceipt} testID="riwayat-share">
              <Ionicons name="share-social" size={22} color={colors.brand} />
              <Text style={styles.actionTxt}>Bagikan</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={printReceipt} testID="riwayat-print">
              <Ionicons name="print" size={22} color={colors.brand} />
              <Text style={styles.actionTxt}>Cetak Struk</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.editBtn}
            testID="riwayat-edit"
            onPress={() => {
              const id = selected?.id;
              sheetRef.current?.dismiss();
              if (id) router.push({ pathname: "/edit-transaksi", params: { id } });
            }}
          >
            <Ionicons name="create-outline" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.editTxt}>Edit Transaksi</Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleBlock: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  summary: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.lg },
  sumLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  sumValue: { color: colors.brand, fontFamily: font.display, fontSize: fontSize["2xl"], marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  rowDate: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  rowSub: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowTotal: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  rowChange: { color: colors.success, fontFamily: font.medium, fontSize: fontSize.sm, marginTop: 2 },
  centerFill: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg },
  detailTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl, marginBottom: spacing.lg },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, width: "100%", maxWidth: 320 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandTertiary },
  actionTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  editBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, width: "100%", maxWidth: 320, marginTop: spacing.md },
  editTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
