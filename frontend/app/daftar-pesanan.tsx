import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCart } from "@/src/cart";
import { numberID } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

/**
 * Daftar Pesanan — tahap CEK ULANG (read-only) sebelum pembayaran.
 * Hanya menampilkan barang, jumlah, harga satuan, hasil, dan total. TIDAK ada
 * tombol ubah/hapus/tambah/cari/edit — semua perubahan dilakukan di Transaksi.
 * Mengambil data dari keranjang global (useCart) tanpa mengubahnya.
 */
export default function DaftarPesananScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();

  const lines = cart.lines;
  const empty = lines.length === 0;

  const lanjutBayar = () => {
    if (empty) return;
    Haptics.selectionAsync().catch(() => {});
    router.push("/checkout?step=pay");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn} testID="pesanan-back">
          <Ionicons name="arrow-back" size={24} color={colors.brand} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Daftar Pesanan</Text>
          <Text style={styles.subtitle}>Periksa kembali pesanan sebelum pembayaran</Text>
        </View>
      </View>

      {/* Info banner */}
      <View style={styles.infoBox}>
        <View style={styles.infoIcon}>
          <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />
        </View>
        <Text style={styles.infoText}>Pastikan semua barang, jumlah, dan total sudah benar.</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {empty ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="bag-handle-outline" size={44} color={colors.muted} />
            <Text style={styles.emptyText}>Belum ada barang di pesanan.</Text>
          </View>
        ) : (
          <View>
            {lines.map((l, idx) => (
              <View key={l.key} style={styles.itemCard} testID={`pesanan-row-${l.key}`}>
                <View style={styles.numBadge}>
                  <Text style={styles.numTxt}>{idx + 1}</Text>
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.itemName} numberOfLines={2}>{l.name}</Text>
                  <Text style={styles.itemCalc}>{numberID(l.quantity)} x {numberID(l.price)}</Text>
                </View>
                <Text style={styles.itemResult} numberOfLines={1}>{numberID(l.price * l.quantity)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Total pesanan */}
        {!empty && (
          <View style={styles.totalCard}>
            <View style={styles.bagCircle}>
              <Ionicons name="bag-handle" size={22} color={colors.brand} />
            </View>
            <View style={styles.totalLeft}>
              <Text style={styles.totalCount}>Total {lines.length} item</Text>
              <Text style={styles.totalHint}>Pastikan pesanan sudah benar</Text>
            </View>
            <View style={styles.totalDivider} />
            <View style={styles.totalRight}>
              <Text style={styles.totalLabel}>TOTAL PESANAN</Text>
              <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {numberID(cart.total)}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          onPress={lanjutBayar}
          disabled={empty}
          style={[styles.payBtn, empty && styles.payBtnDisabled]}
          testID="pesanan-lanjut-bayar"
        >
          <Ionicons name="bag-check-outline" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.payBtnTxt}>Lanjut Bayar</Text>
        </Pressable>
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed" size={13} color={colors.muted} />
          <Text style={styles.lockTxt}>Anda akan diarahkan ke halaman pembayaran setelah menekan Lanjut Bayar.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  headerText: { flex: 1 },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize["2xl"] },
  subtitle: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  infoBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandTertiary, paddingVertical: 10, paddingHorizontal: spacing.md },
  infoIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, color: colors.brand, fontFamily: font.medium, fontSize: fontSize.sm },
  listCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, shadowColor: colors.brand, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  itemCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandTertiary, paddingVertical: spacing.md, paddingHorizontal: spacing.md, marginBottom: spacing.md, shadowColor: colors.brand, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  numBadge: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  numTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  rowMid: { flex: 1 },
  itemName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  itemCalc: { color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 3 },
  itemResult: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg, textAlign: "right", flexShrink: 0, maxWidth: 130 },
  totalCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.md },
  bagCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  totalLeft: { flex: 1 },
  totalCount: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  totalHint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  totalDivider: { width: 1, alignSelf: "stretch", backgroundColor: colors.brandTertiary, marginVertical: 4 },
  totalRight: { alignItems: "flex-end", maxWidth: "44%" },
  totalLabel: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm, letterSpacing: 0.5 },
  totalValue: { color: colors.brand, fontFamily: font.display, fontSize: 30, marginTop: 2 },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: spacing.md },
  emptyText: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, height: 54, borderRadius: radius.lg, shadowColor: colors.brand, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  payBtnDisabled: { backgroundColor: "#F2B8C2", shadowOpacity: 0 },
  payBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: fontSize.xl },
  lockRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm },
  lockTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, textAlign: "center", flexShrink: 1 },
});
