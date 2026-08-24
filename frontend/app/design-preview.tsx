import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// ============================================================================
// PRATINJAU DESAIN (feminin/lembut) — hanya contoh untuk dipilih user.
// Tidak mengubah aplikasi asli. Buka /design-preview?v=1|2|3
// ============================================================================

type Palette = {
  name: string;
  surface: string;
  card: string;
  brand: string;
  brand2: string;
  tertiary: string;
  text: string;
  muted: string;
  border: string;
  borderStrong: string;
  success: string;
  error: string;
  onBrand: string;
  onTertiary: string;
};

const PALETTES: Record<string, Palette> = {
  "1": {
    name: "Soft Rose & Lilac",
    surface: "#FFF5F7", card: "#FFFFFF", brand: "#FF758F", brand2: "#CDB4DB",
    tertiary: "#FFD6DF", text: "#2B2D42", muted: "#9A94A8", border: "#FDE2E8",
    borderStrong: "#FFB3C1", success: "#38B000", error: "#D90429",
    onBrand: "#FFFFFF", onTertiary: "#C81D4A",
  },
  "2": {
    name: "Peach & Mint",
    surface: "#FFFAED", card: "#FFFFFF", brand: "#FF9F1C", brand2: "#2EC4B6",
    tertiary: "#FFE8C7", text: "#2B2D42", muted: "#9A9488", border: "#FCEBD2",
    borderStrong: "#FFD79A", success: "#2EC4B6", error: "#E63946",
    onBrand: "#FFFFFF", onTertiary: "#B5651B",
  },
  "3": {
    name: "Dusty Mauve & Oat",
    surface: "#F8F7FA", card: "#FFFFFF", brand: "#B5838D", brand2: "#E5989B",
    tertiary: "#EFE7EC", text: "#3A3340", muted: "#9B93A3", border: "#EAE3EC",
    borderStrong: "#D9C4CD", success: "#7A9E7E", error: "#C1666B",
    onBrand: "#FFFFFF", onTertiary: "#8A5A66",
  },
};

const rupiah = (n: number) => "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const LINES = [
  { name: "Mie Sedaap Goreng", price: 3000, qty: 2, low: 3, grosir: false },
  { name: "Beras Ramos 5kg", price: 62000, qty: 1, low: 0, grosir: false },
  { name: "Dove Sabun Cair", price: 916, qty: 6, low: 0, grosir: true },
];

export default function DesignPreview() {
  const insets = useSafeAreaInsets();
  const { v } = useLocalSearchParams<{ v?: string }>();
  const p = PALETTES[v || "1"] || PALETTES["1"];
  const total = LINES.reduce((s, l) => s + l.price * l.qty, 0);
  const count = LINES.reduce((s, l) => s + l.qty, 0);
  const s = makeStyles(p);

  return (
    <View style={[s.container, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.hi}>Halo, Kasir 👋</Text>
          <Text style={s.title}>Transaksi</Text>
        </View>
        <View style={s.themePill}>
          <Text style={s.themePillTxt}>{p.name}</Text>
        </View>
      </View>

      {/* Scan input pill */}
      <View style={s.scan}>
        <View style={s.scanIcon}>
          <Ionicons name="barcode-outline" size={22} color={p.brand} />
        </View>
        <Text style={s.scanTxt}>Scan barcode di sini…</Text>
        <View style={s.readyDot} />
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <View style={[s.actBtn, { backgroundColor: p.brand2 }]}>
          <Ionicons name="add-circle-outline" size={20} color={p.text} />
          <Text style={[s.actTxt, { color: p.text }]}>Tambah Item</Text>
        </View>
        <View style={[s.actBtn, s.actBtnOutline]}>
          <Ionicons name="search" size={20} color={p.brand} />
          <Text style={[s.actTxt, { color: p.brand }]}>Cari Barang</Text>
        </View>
      </View>

      <Text style={s.listHead}>DAFTAR BELANJA</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {LINES.map((l, i) => (
          <View key={i} style={s.cardWrap}>
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={s.thumb}>
                  <Ionicons name="cube-outline" size={22} color={p.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={[s.name, l.grosir && { color: p.success }]} numberOfLines={1}>{l.name}</Text>
                    {l.low > 0 && (
                      <View style={s.lowBadge}>
                        <Ionicons name="alert-circle" size={12} color={p.onTertiary} />
                        <Text style={s.lowTxt}>Stok {l.low}</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.priceRow}>
                    <Text style={s.price}>{rupiah(l.price)}</Text>
                    <Ionicons name="create-outline" size={14} color={p.brand} />
                    <Text style={s.varLink}>· Tambah Variasi</Text>
                  </View>
                </View>
                <Ionicons name="trash-outline" size={20} color={p.error} />
              </View>

              <View style={s.cardBottom}>
                <View style={s.stepper}>
                  <View style={s.stepBtn}><Ionicons name="remove" size={20} color={p.brand} /></View>
                  <Text style={s.qty}>{l.qty}</Text>
                  <View style={s.stepBtn}><Ionicons name="add" size={20} color={p.brand} /></View>
                </View>
                <Text style={s.sub}>{rupiah(l.price * l.qty)}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Sticky pay bar */}
      <View style={[s.payBar, { paddingBottom: insets.bottom + 14 }]}>
        <View>
          <Text style={s.payItems}>{count} item</Text>
          <Text style={s.payTotal}>{rupiah(total)}</Text>
        </View>
        <View style={s.payBtn}>
          <Ionicons name="wallet-outline" size={22} color={p.onBrand} />
          <Text style={s.payBtnTxt}>Bayar</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.surface, paddingHorizontal: 16 },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    hi: { color: p.muted, fontSize: 13, fontWeight: "600" },
    title: { color: p.text, fontSize: 30, fontWeight: "800", marginTop: 2 },
    themePill: { backgroundColor: p.tertiary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    themePillTxt: { color: p.onTertiary, fontSize: 11, fontWeight: "800" },
    scan: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: p.card, borderRadius: 999, height: 56, paddingHorizontal: 8, paddingRight: 16, borderWidth: 2, borderColor: p.borderStrong, shadowColor: p.brand, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    scanIcon: { width: 40, height: 40, borderRadius: 999, backgroundColor: p.tertiary, alignItems: "center", justifyContent: "center" },
    scanTxt: { flex: 1, color: p.muted, fontSize: 15, fontWeight: "600" },
    readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: p.success },
    actions: { flexDirection: "row", gap: 12, marginTop: 14 },
    actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 16 },
    actBtnOutline: { backgroundColor: p.card, borderWidth: 1.5, borderColor: p.borderStrong },
    actTxt: { fontSize: 15, fontWeight: "800" },
    listHead: { color: p.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: 22, marginBottom: 4 },
    cardWrap: { marginTop: 12 },
    card: { backgroundColor: p.card, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: p.border, shadowColor: "#B0757F", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    thumb: { width: 48, height: 48, borderRadius: 14, backgroundColor: p.tertiary, alignItems: "center", justifyContent: "center" },
    name: { color: p.text, fontSize: 16, fontWeight: "800", maxWidth: 180 },
    lowBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: p.tertiary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    lowTxt: { color: p.onTertiary, fontSize: 11, fontWeight: "800" },
    priceRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
    price: { color: p.muted, fontSize: 14, fontWeight: "700" },
    varLink: { color: p.brand, fontSize: 13, fontWeight: "700" },
    cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
    stepper: { flexDirection: "row", alignItems: "center", backgroundColor: p.tertiary, borderRadius: 999, padding: 4, gap: 4 },
    stepBtn: { width: 40, height: 40, borderRadius: 999, backgroundColor: p.card, alignItems: "center", justifyContent: "center" },
    qty: { minWidth: 34, textAlign: "center", color: p.text, fontSize: 18, fontWeight: "800" },
    sub: { color: p.text, fontSize: 20, fontWeight: "800" },
    payBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 14, backgroundColor: p.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
    payItems: { color: p.muted, fontSize: 13, fontWeight: "700" },
    payTotal: { color: p.text, fontSize: 26, fontWeight: "800" },
    payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: p.brand, height: 58, borderRadius: 18, paddingHorizontal: 40 },
    payBtnTxt: { color: p.onBrand, fontSize: 19, fontWeight: "800" },
  });
