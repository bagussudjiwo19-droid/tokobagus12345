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
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { rupiah, formatDateID, shortTxNo } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Settings, Transaction } from "@/src/types";
import ReceiptPreview from "@/components/ReceiptPreview";
import { isBluetoothAvailable, printText, NATIVE_ONLY_MSG } from "@/src/printer";
import { buildReceiptText } from "@/src/receipt";

export default function RiwayatScreen() {
  const insets = useSafeAreaInsets();
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
      setTxs(t);
      setSettings(s);
      setPrinter(p);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const omzet = useMemo(() => txs.reduce((s, t) => s + (t.total || 0), 0), [txs]);

  const openDetail = (tx: Transaction) => {
    setSelected(tx);
    sheetRef.current?.present();
  };

  const shareReceipt = async () => {
    try {
      const uri = await captureRef(receiptRef, { format: "png", quality: 1 });
      if (!(await Sharing.isAvailableAsync())) return;
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Bagikan Struk" });
    } catch {
      toast.show("Gagal membuat gambar struk", "error");
    }
  };

  const printReceipt = async () => {
    if (!isBluetoothAvailable()) return toast.show(NATIVE_ONLY_MSG, "info");
    if (!printer.address) return toast.show("Belum ada printer terpasang.", "info");
    if (!selected || !settings) return;
    try {
      await printText(printer.address, buildReceiptText(selected, settings));
      toast.show("Struk dikirim ke printer", "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencetak", "error");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderRow = ({ item }: { item: Transaction }) => (
    <Pressable style={styles.row} onPress={() => openDetail(item)} testID={`riwayat-row-${item.id}`}>
      <View style={styles.rowIcon}>
        <Ionicons name="receipt-outline" size={20} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowNo}>{shortTxNo(item.id)}</Text>
        <Text style={styles.rowDate}>{formatDateID(item.created_at)}</Text>
        <Text style={styles.rowItems}>{item.items.length} item</Text>
      </View>
      <Text style={styles.rowTotal}>{rupiah(item.total)}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Riwayat</Text>
        <View style={styles.summary} testID="riwayat-summary">
          <View style={{ flex: 1 }}>
            <Text style={styles.sumLabel}>Total Pendapatan</Text>
            <Text style={styles.sumValue}>{rupiah(omzet)}</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.sumLabel}>Transaksi</Text>
            <Text style={styles.sumCount}>{txs.length}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={(t) => t.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
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
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface, paddingVertical: spacing.sm },
  summary: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.lg },
  sumLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  sumValue: { color: colors.brand, fontFamily: font.display, fontSize: fontSize["2xl"], marginTop: 2 },
  sumCount: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"], marginTop: 2 },
  sumDivider: { width: 1, height: 36, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  rowNo: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  rowDate: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowItems: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  rowTotal: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 72 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg },
  detailTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl, marginBottom: spacing.lg },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, width: "100%", maxWidth: 320 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandTertiary },
  actionTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
});
