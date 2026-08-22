import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { mikoBus } from "@/src/mikoBus";
import WhatsAppReceiptButton from "@/components/WhatsAppReceiptButton";

type FilterKey = "today" | "yesterday" | "month" | "date" | "all";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: "Hari Ini" },
  { key: "yesterday", label: "Kemarin" },
  { key: "month", label: "Bulan Ini" },
  { key: "date", label: "Pilih Tanggal" },
  { key: "all", label: "Semua" },
];

const sameDay = (iso: string, d: Date) => {
  const x = new Date(iso);
  return (
    x.getFullYear() === d.getFullYear() &&
    x.getMonth() === d.getMonth() &&
    x.getDate() === d.getDate()
  );
};

const fmtDateLabel = (d: Date) =>
  d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

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
  const [filter, setFilter] = useState<FilterKey>("today");
  const [pickDate, setPickDate] = useState<Date>(new Date());
  const sheetRef = useRef<BottomSheetModal>(null);
  const receiptRef = useRef<View>(null);

  const load = useCallback(async () => {
    try {
      const [t, s, p] = await Promise.all([api.getTransactions(5000), api.getSettings(), api.getPrinter()]);
      setTxs(t); setSettings(s); setPrinter(p);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Filter transaksi berdasarkan periode terpilih. Data lama TIDAK dihapus,
  // hanya disaring untuk tampilan; omzet & jumlah ikut periode terpilih.
  const filtered = useMemo(() => {
    const now = new Date();
    if (filter === "all") return txs;
    if (filter === "today") return txs.filter((t) => sameDay(t.created_at, now));
    if (filter === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return txs.filter((t) => sameDay(t.created_at, y));
    }
    if (filter === "month") {
      return txs.filter((t) => {
        const x = new Date(t.created_at);
        return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth();
      });
    }
    return txs.filter((t) => sameDay(t.created_at, pickDate)); // "date"
  }, [txs, filter, pickDate]);

  const omzet = useMemo(() => filtered.reduce((s, t) => s + (t.total || 0), 0), [filtered]);

  // Barang terlaris (berdasarkan JUMLAH UNIT terjual) pada periode terpilih.
  const topItems = useMemo(() => {
    const m = new Map<string, { name: string; qty: number }>();
    for (const t of filtered) {
      for (const it of t.items || []) {
        const key = it.name || "(tanpa nama)";
        const cur = m.get(key) || { name: key, qty: 0 };
        cur.qty += it.quantity || 0;
        m.set(key, cur);
      }
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty).slice(0, 3);
  }, [filtered]);

  const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : String(q).replace(".", ","));
  const periodLabel =
    filter === "today" ? "Hari Ini"
    : filter === "yesterday" ? "Kemarin"
    : filter === "month" ? "Bulan Ini"
    : filter === "all" ? "Semua Transaksi"
    : fmtDateLabel(pickDate);

  const openDetail = (tx: Transaction) => { setSelected(tx); sheetRef.current?.present(); };

  const shareReceipt = async () => {
    try {
      const uri = await captureRef(receiptRef, { format: "png", quality: 1 });
      if (!(await Sharing.isAvailableAsync())) return;
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Bagikan Struk" });
    } catch { toast.show("Gagal membuat gambar struk", "error"); }
  };

  const printReceipt = async () => {
    if (!isBluetoothAvailable()) { mikoBus.emit({ type: "print_fail" }); return toast.show(NATIVE_ONLY_MSG, "info"); }
    if (!printer.address) { mikoBus.emit({ type: "print_fail" }); return toast.show("Belum ada printer terpasang.", "info"); }
    if (!selected || !settings) return;
    try { await printText(printer.address, buildReceiptText(selected, settings)); toast.show("Struk dikirim ke printer", "success"); mikoBus.emit({ type: "print_ok" }); }
    catch (e: any) { toast.show(e?.message || "Gagal mencetak", "error"); mikoBus.emit({ type: "print_fail" }); }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Lunasi sisa: tandai transaksi bayar sebagian menjadi lunas (tanpa ubah item/stok/tanggal).
  const payOff = async () => {
    if (!selected) return;
    try {
      await api.updateTransaction(selected.id, {
        items: selected.items,
        total: selected.total,
        discount: selected.discount || 0,
        cash_paid: selected.total,
        change: 0,
      });
      toast.show("Transaksi ditandai lunas", "success");
      sheetRef.current?.dismiss();
      await load();
    } catch (e: any) {
      toast.show(e?.message || "Gagal melunasi transaksi", "error");
    }
  };

  const renderRow = ({ item }: { item: Transaction }) => {
    const shortfall = Math.max(0, (item.total || 0) - (item.cash_paid || 0));
    return (
      <Pressable style={[styles.row, shortfall > 0 && styles.rowUnpaid]} onPress={() => openDetail(item)} testID={`riwayat-row-${item.id}`}>
        <View style={styles.rowThumb}><Ionicons name="receipt-outline" size={20} color={colors.brand} /></View>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTopLine}>
            <Text style={styles.rowDate}>{formatDateID(item.created_at)}</Text>
            {shortfall > 0 && (
              <View style={styles.unpaidBadge} testID={`riwayat-unpaid-${item.id}`}>
                <Text style={styles.unpaidBadgeTxt}>BELUM LUNAS</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowSub}>{item.items.length} baris · Ketuk untuk struk</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.rowTotal}>{rupiah(item.total)}</Text>
          {shortfall > 0 ? (
            <Text style={styles.rowKurang}>Kurang {rupiah(shortfall)}</Text>
          ) : (
            <Text style={styles.rowChange}>Kembali {rupiah(item.change)}</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.titleBlock}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Riwayat</Text>
          <Text style={styles.subtitle}>Transaksi yang sudah tersimpan</Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.actionIcon} testID="riwayat-sync" onPress={() => router.push("/sync-toko")}>
            <Ionicons name="cloud-outline" size={20} color={colors.brand} />
          </Pressable>
          <Pressable style={styles.actionIcon} testID="riwayat-backup" onPress={() => router.push("/backup")}>
            <Ionicons name="save-outline" size={20} color={colors.brand} />
          </Pressable>
          <Pressable style={styles.actionIcon} testID="riwayat-struk-settings" onPress={() => router.push("/pengaturan-struk")}>
            <Ionicons name="reader-outline" size={20} color={colors.brand} />
          </Pressable>
          <Pressable style={styles.actionIcon} testID="riwayat-printer-settings" onPress={() => router.push("/pengaturan-printer")}>
            <Ionicons name="print-outline" size={20} color={colors.brand} />
          </Pressable>
          <Pressable style={styles.actionIcon} testID="riwayat-admin-pin" onPress={() => router.push("/admin-pin")}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.brand} />
          </Pressable>
          <Pressable style={styles.actionIcon} testID="riwayat-suara" onPress={() => router.push("/pengaturan-suara")}>
            <Ionicons name="volume-high-outline" size={20} color={colors.brand} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            testID={`riwayat-filter-${f.key}`}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipTxt, filter === f.key && styles.chipTxtActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {filter === "date" && (
        <View style={styles.stepper} testID="riwayat-date-stepper">
          <Pressable
            style={styles.stepBtn}
            testID="riwayat-date-prev"
            onPress={() => setPickDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })}
          >
            <Ionicons name="chevron-back" size={20} color={colors.brand} />
          </Pressable>
          <View style={styles.stepDateBox}>
            <Ionicons name="calendar-outline" size={16} color={colors.brand} />
            <Text style={styles.stepDateTxt}>{fmtDateLabel(pickDate)}</Text>
          </View>
          <Pressable
            style={styles.stepBtn}
            testID="riwayat-date-next"
            onPress={() => setPickDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.brand} />
          </Pressable>
        </View>
      )}

      <View style={styles.summary} testID="riwayat-summary">
        <Text style={styles.sumLabel}>{periodLabel} · {filtered.length} transaksi</Text>
        <Text style={styles.sumValue}>{rupiah(omzet)}</Text>
      </View>

      {topItems.length > 0 && (
        <View style={styles.topCard} testID="riwayat-top-items">
          <View style={styles.topHead}>
            <Ionicons name="trophy-outline" size={16} color={colors.brand} />
            <Text style={styles.topTitle}>Terlaris {periodLabel}</Text>
          </View>
          {topItems.map((it, i) => (
            <View key={it.name} style={styles.topRow} testID={`riwayat-top-${i}`}>
              <View style={styles.topRank}><Text style={styles.topRankTxt}>{i + 1}</Text></View>
              <Text style={styles.topName} numberOfLines={1}>{it.name}</Text>
              <Text style={styles.topQty}>{fmtQty(it.qty)} terjual</Text>
            </View>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.centerFill}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={renderRow}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 24 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="receipt-outline" size={40} color={colors.muted} />
              <Text style={styles.dim}>Belum ada transaksi pada periode ini</Text>
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
          <WhatsAppReceiptButton tx={selected} settings={settings} testID="riwayat-whatsapp" />
          {selected && Math.max(0, (selected.total || 0) - (selected.cash_paid || 0)) > 0 && (
            <Pressable style={styles.lunasiBtn} testID="riwayat-lunasi" onPress={payOff}>
              <Ionicons name="checkmark-done" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.lunasiTxt}>
                Lunasi Sisa {rupiah(Math.max(0, (selected.total || 0) - (selected.cash_paid || 0)))}
              </Text>
            </Pressable>
          )}
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
  actionIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  summary: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.brand, borderRadius: radius.xl, padding: spacing.lg, shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  chipTxtActive: { color: colors.onBrandPrimary, fontFamily: font.bold },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  stepBtn: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  stepDateBox: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  stepDateTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  sumLabel: { color: colors.onBrandPrimary, fontFamily: font.medium, fontSize: fontSize.base, opacity: 0.95 },
  sumValue: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: 34, marginTop: 2 },
  topCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.md, gap: spacing.sm },
  topHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  topTitle: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  topRank: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  topRankTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  topName: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  topQty: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, shadowColor: "#B0757F", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  rowThumb: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowUnpaid: { borderColor: colors.error, borderWidth: 1.5 },
  rowTopLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  unpaidBadge: { backgroundColor: colors.error, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  unpaidBadgeTxt: { color: "#FFFFFF", fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 0.5 },
  rowDate: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  rowSub: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  rowTotal: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  rowChange: { color: colors.success, fontFamily: font.medium, fontSize: fontSize.sm, marginTop: 2 },
  rowKurang: { color: colors.error, fontFamily: font.bold, fontSize: fontSize.sm, marginTop: 2 },
  lunasiBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.success, width: "100%", maxWidth: 320, marginTop: spacing.md },
  lunasiTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  centerFill: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg },
  detailTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl, marginBottom: spacing.lg },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, width: "100%", maxWidth: 320 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandTertiary },
  actionTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  editBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, width: "100%", maxWidth: 320, marginTop: spacing.md },
  editTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
