import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Settings } from "@/src/types";

export default function PengaturanStrukScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getSettings().then(setS).catch(() => {}); }, []);
  const set = (k: keyof Settings, v: any) => setS((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try { await api.saveSettings(s); toast.show("Pengaturan struk disimpan", "success"); router.back(); }
    catch (e: any) { toast.show(e?.message || "Gagal menyimpan", "error"); }
    finally { setSaving(false); }
  };

  if (!s) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.hTitle}>Pengaturan Struk</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="struk-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        <SectionLabel text="INFO TOKO" />
        <Field label="Nama Toko" value={s.shopName} onChange={(t) => set("shopName", t)} testID="set-shopname" />
        <Field label="Alamat Toko" value={s.address} onChange={(t) => set("address", t)} testID="set-address" />
        <Field label="Nomor Telepon" value={s.phone} onChange={(t) => set("phone", t)} placeholder="cth: 0812-3456-7890" keyboardType="phone-pad" testID="set-phone" />
        <Toggle label="Tampilkan Nama Toko" value={s.showShopName} onValueChange={(v) => set("showShopName", v)} tkey="showShopName" />
        <Toggle label="Tampilkan Alamat" value={s.showAddress} onValueChange={(v) => set("showAddress", v)} tkey="showAddress" />
        <Toggle label="Tampilkan No. Telepon" value={s.showPhone} onValueChange={(v) => set("showPhone", v)} tkey="showPhone" />
        <Toggle label="Tampilkan Logo Toko" subtitle="Belum aktif (menyusul)" value={false} disabled tkey="showLogo" />

        <SectionLabel text="INFO TRANSAKSI" />
        <Toggle label="Tanggal & Jam" value={s.showDateTime} onValueChange={(v) => set("showDateTime", v)} tkey="showDateTime" />
        <Toggle label="Nomor Transaksi" value={s.showTxNumber} onValueChange={(v) => set("showTxNumber", v)} tkey="showTxNumber" />
        <Toggle label="Nomor Antrian" subtitle="Nomor urut harian otomatis" value={s.showQueue} onValueChange={(v) => set("showQueue", v)} tkey="showQueue" />
        <Field label="Nama Kasir" value={s.cashier} onChange={(t) => set("cashier", t)} placeholder="cth: Budi" testID="set-cashier" />
        <Toggle label="Nama Kasir" value={s.showCashier} onValueChange={(v) => set("showCashier", v)} tkey="showCashier" />
        <Toggle label="QR Code" subtitle="Belum aktif (menyusul)" value={false} disabled tkey="showQR" />

        <SectionLabel text="RINCIAN ITEM" />
        <Toggle label="Nama Barang" value={s.showItemName} onValueChange={(v) => set("showItemName", v)} tkey="showItemName" />
        <Toggle label="Variasi" value={s.showVariation} onValueChange={(v) => set("showVariation", v)} tkey="showVariation" />
        <Toggle label="Barcode" value={s.showBarcode} onValueChange={(v) => set("showBarcode", v)} tkey="showBarcode" />
        <Toggle label="Harga Satuan" value={s.showUnitPrice} onValueChange={(v) => set("showUnitPrice", v)} tkey="showUnitPrice" />
        <Toggle label="Qty (jumlah)" value={s.showQty} onValueChange={(v) => set("showQty", v)} tkey="showQty" />
        <Toggle label="Subtotal per item" value={s.showSubtotal} onValueChange={(v) => set("showSubtotal", v)} tkey="showSubtotal" />

        <SectionLabel text="RINGKASAN" />
        <Toggle label="Diskon" subtitle="Tampil jika ada nilai diskon" value={s.showDiscount} onValueChange={(v) => set("showDiscount", v)} tkey="showDiscount" />
        <Toggle label="Total" value={s.showTotal} onValueChange={(v) => set("showTotal", v)} tkey="showTotal" />
        <Toggle label="Uang Bayar" value={s.showCashPaid} onValueChange={(v) => set("showCashPaid", v)} tkey="showCashPaid" />
        <Toggle label="Kembalian" value={s.showChange} onValueChange={(v) => set("showChange", v)} tkey="showChange" />

        <SectionLabel text="SUARA" />
        <Toggle label="Suara Pembayaran" subtitle="Bacakan diterima, total, dan kembalian saat pembayaran berhasil" value={s.voiceChange} onValueChange={(v) => set("voiceChange", v)} tkey="voiceChange" />

        <SectionLabel text="SUARA CEK HARGA" />
        <Toggle label="Suara Baca Harga" subtitle="Miko membacakan nama & harga setelah barcode ditemukan (tetap tampil di layar bila OFF)" value={s.readPrice !== false} onValueChange={(v) => set("readPrice", v)} tkey="readPrice" />
        <Toggle label="Suara Setelah Baca Harga" subtitle="Miko membacakan kalimat penutup setelah nama & harga" value={s.priceClosing !== false} onValueChange={(v) => set("priceClosing", v)} tkey="priceClosing" />

        <SectionLabel text="PENUTUP" />
        <Field label="Catatan" value={s.note} onChange={(t) => set("note", t)} placeholder="cth: Barang yang dibeli tidak dapat ditukar" testID="set-note" />
        <Toggle label="Tampilkan Catatan" value={s.showNote} onValueChange={(v) => set("showNote", v)} tkey="showNote" />
        <Field label="Ucapan Terima Kasih" value={s.thanks} onChange={(t) => set("thanks", t)} testID="set-thanks" />
        <Toggle label="Tampilkan Ucapan" value={s.showThanks} onValueChange={(v) => set("showThanks", v)} tkey="showThanks" />
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving} testID="struk-save">
          <Text style={styles.saveTxt}>Simpan Pengaturan</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function Field({ label, value, onChange, placeholder, keyboardType, testID }: { label: string; value: string; onChange: (t: string) => void; placeholder?: string; keyboardType?: any; testID?: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType || "default"} style={styles.input} />
    </View>
  );
}

function Toggle({ label, subtitle, value, onValueChange, disabled, tkey }: { label: string; subtitle?: string; value: boolean; onValueChange?: (v: boolean) => void; disabled?: boolean; tkey: string }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, disabled && { color: colors.muted }]}>{label}</Text>
        {subtitle && <Text style={styles.toggleSub}>{subtitle}</Text>}
      </View>
      <Switch
        testID={`toggle-${tkey}`}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.brand, false: colors.borderStrong }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  hTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  closeBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  sectionLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base, letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.md },
  fieldLabel: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 52, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  toggleLabel: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  toggleSub: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface },
  saveBtn: { height: 56, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: fontSize.xl },
});
