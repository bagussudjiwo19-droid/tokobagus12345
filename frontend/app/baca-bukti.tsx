import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { isBluetoothAvailable, printText, NATIVE_ONLY_MSG } from "@/src/printer";
import { buildBuktiReceiptText, buildBuktiReceiptHTML } from "@/src/receipt";
import { numberID } from "@/src/format";
import type { Bukti, Settings } from "@/src/types";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

type FieldKey = "method" | "recipient" | "amount" | "date" | "time" | "ref";

export default function BacaBuktiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ image?: string; mime?: string; id?: string; method?: string; recipient?: string; amount?: string; date?: string; time?: string; ref?: string; customer?: string }>();

  const [imageUri, setImageUri] = useState<string | null>(params.image || null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [printer, setPrinter] = useState<{ address?: string | null } | null>(null);

  const [method, setMethod] = useState(params.method || "");
  const [recipient, setRecipient] = useState(params.recipient || "");
  const [amount, setAmount] = useState(params.amount ? String(params.amount).replace(/[^\d]/g, "") : "");
  const [date, setDate] = useState(params.date || "");
  const [time, setTime] = useState(params.time || "");
  const [ref, setRef] = useState(params.ref || "");
  const [customer, setCustomer] = useState(params.customer || "");
  // Field yang OCR TIDAK yakin → ditandai agar pengguna memeriksa.
  const [warn, setWarn] = useState<Record<FieldKey, boolean>>({ method: false, recipient: false, amount: false, date: false, time: false, ref: false });

  const savedId = useRef<string | null>(params.id || null);
  const shotRef = useRef<View>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    api.getPrinter().then(setPrinter).catch(() => {});
  }, []);

  const runOcr = useCallback(async (b64: string, mime: string) => {
    setReading(true);
    try {
      const res = await api.ocrBukti(b64, mime);
      const f = res.fields;
      setMethod(String(f.method?.value ?? ""));
      setRecipient(String(f.recipient?.value ?? ""));
      setAmount(f.amount?.value != null ? String(f.amount.value).replace(/[^\d]/g, "") : "");
      setDate(String(f.date?.value ?? ""));
      setTime(String(f.time?.value ?? ""));
      setRef(String(f.ref?.value ?? ""));
      setWarn({
        method: !f.method?.confident,
        recipient: !f.recipient?.confident,
        amount: !f.amount?.confident,
        date: !f.date?.confident,
        time: !f.time?.confident,
        ref: !f.ref?.confident,
      });
      const uncertain = Object.values(f).filter((x) => !x?.confident).length;
      if (uncertain > 0) toast.show(`${uncertain} data belum yakin — mohon periksa`, "info");
      else toast.show("Bukti terbaca, silakan periksa", "success");
    } catch {
      // Offline / server tidak tersedia → biarkan kosong untuk diisi manual.
      setWarn({ method: true, recipient: true, amount: true, date: true, time: true, ref: true });
      toast.show("Tidak ada internet — isi data manual lalu cetak", "info");
    } finally {
      setReading(false);
    }
  }, [toast]);

  // Jika dibuka via Share (ada image uri tapi tanpa base64) → baca file jadi base64.
  useEffect(() => {
    (async () => {
      if (params.image && !method && !reading) {
        try {
          const b64 = await FileSystem.readAsStringAsync(params.image, { encoding: FileSystem.EncodingType.Base64 });
          await runOcr(b64, params.mime || "image/jpeg");
        } catch {
          toast.show("Gagal membaca gambar bersama", "error");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.image]);

  const pickFromGallery = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.show("Izin galeri ditolak. Aktifkan di Pengaturan HP.", "error");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setImageUri(a.uri);
      savedId.current = null;
      if (a.base64) await runOcr(a.base64, a.mimeType || "image/jpeg");
      else toast.show("Gagal membaca gambar", "error");
    } catch (e: any) {
      toast.show(e?.message || "Gagal memilih gambar", "error");
    }
  }, [runOcr, toast]);

  const buildBukti = useCallback((): Bukti => ({
    id: savedId.current || "",
    method: method.trim(),
    recipient: recipient.trim(),
    amount: Number((amount || "0").replace(/[^\d]/g, "")) || 0,
    date: date.trim(),
    time: time.trim(),
    ref: ref.trim(),
    customer: customer.trim(),
    image_uri: imageUri,
    created_at: "",
    updated_at: "",
  }), [method, recipient, amount, date, time, ref, customer, imageUri]);

  // Simpan ke Riwayat (idempoten: sekali buat, selanjutnya perbarui id yang sama).
  const persist = useCallback(async (): Promise<Bukti> => {
    const b = buildBukti();
    const saved = await api.saveBukti({
      id: savedId.current || undefined,
      method: b.method, recipient: b.recipient, amount: b.amount,
      date: b.date, time: b.time, ref: b.ref, customer: b.customer, image_uri: b.image_uri,
    });
    savedId.current = saved.id;
    return saved;
  }, [buildBukti]);

  const validate = (): boolean => {
    if (!(Number((amount || "0").replace(/[^\d]/g, "")) > 0)) {
      toast.show("Nominal belum diisi — periksa dulu", "error");
      return false;
    }
    return true;
  };

  const doPrint = useCallback(async () => {
    if (!validate()) return;
    if (!isBluetoothAvailable()) { toast.show(NATIVE_ONLY_MSG, "info"); return; }
    if (!printer?.address) { toast.show("Printer belum dipilih. Buka Pengaturan Printer.", "error"); return; }
    setBusy("print");
    try {
      const saved = await persist();
      await printText(printer.address, buildBuktiReceiptText(saved, settings as Settings));
      toast.show("Struk dikirim ke printer", "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencetak", "error");
    } finally { setBusy(null); }
  }, [persist, printer, settings, toast]);

  const makePdf = useCallback(async (): Promise<string> => {
    const saved = await persist();
    const { uri } = await Print.printToFileAsync({ html: buildBuktiReceiptHTML(saved, settings as Settings) });
    return uri;
  }, [persist, settings]);

  const doShare = useCallback(async () => {
    if (!validate()) return;
    setBusy("share");
    try {
      const uri = await makePdf();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Bagikan Bukti" });
      else toast.show("Berbagi tidak tersedia di perangkat ini", "info");
    } catch (e: any) {
      toast.show(e?.message || "Gagal membagikan", "error");
    } finally { setBusy(null); }
  }, [makePdf, toast]);

  const doSavePdf = useCallback(async () => {
    if (!validate()) return;
    setBusy("pdf");
    try {
      const uri = await makePdf();
      // Simpan PDF = buka lembar bagikan agar pengguna pilih "Simpan ke Files/Drive".
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Simpan PDF" });
      else toast.show("Simpan PDF butuh aplikasi hasil build", "info");
    } catch (e: any) {
      toast.show(e?.message || "Gagal membuat PDF", "error");
    } finally { setBusy(null); }
  }, [makePdf, toast]);

  const doSaveImage = useCallback(async () => {
    if (!validate()) return;
    setBusy("png");
    try {
      await persist();
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { toast.show("Izin simpan galeri ditolak", "error"); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      toast.show("Gambar struk tersimpan di galeri", "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan gambar (butuh build)", "error");
    } finally { setBusy(null); }
  }, [persist, toast]);

  const doFinish = useCallback(async () => {
    if (!validate()) return;
    setBusy("finish");
    try {
      await persist();
      toast.show("Bukti tersimpan di Riwayat", "success");
      router.replace("/");
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan", "error");
    } finally { setBusy(null); }
  }, [persist, router, toast]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Baca Bukti Pembayaran</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="bukti-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* Sumber gambar */}
        <View style={styles.imgCard}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.emptyImg}>
              <Ionicons name="image-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTxt}>Belum ada gambar bukti</Text>
            </View>
          )}
          <Pressable style={styles.pickBtn} onPress={pickFromGallery} testID="bukti-pick" disabled={reading}>
            <Ionicons name="images-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.pickTxt}>{imageUri ? "Ganti Gambar" : "Pilih dari Galeri"}</Text>
          </Pressable>
        </View>

        {reading ? (
          <View style={styles.readingBox}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.readingTxt}>Membaca bukti pembayaran…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Periksa Data</Text>
            <Text style={styles.hint}>Kolom bertanda oranye belum yakin terbaca — mohon periksa/perbaiki sebelum cetak.</Text>

            <Field label="Metode" value={method} onChange={setMethod} warn={warn.method} testID="bukti-method" placeholder="mis. ShopeePay" />
            <Field label="Nominal" value={amount} onChange={(t) => setAmount(t.replace(/[^\d]/g, ""))} warn={warn.amount} keyboardType="numeric" prefix="Rp" testID="bukti-amount" help={amount ? `Rp${numberID(Number(amount))}` : undefined} />
            <Field label="Penerima" value={recipient} onChange={setRecipient} warn={warn.recipient} testID="bukti-recipient" placeholder="nama merchant/toko" />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}><Field label="Tanggal" value={date} onChange={setDate} warn={warn.date} testID="bukti-date" /></View>
              <View style={{ flex: 1 }}><Field label="Waktu" value={time} onChange={setTime} warn={warn.time} testID="bukti-time" /></View>
            </View>
            <Field label="No. Referensi" value={ref} onChange={setRef} warn={warn.ref} testID="bukti-ref" />
            <Field label="Nama Pelanggan (opsional)" value={customer} onChange={setCustomer} testID="bukti-customer" placeholder="mis. Bu Sari" />

            {/* Tombol aksi */}
            <View style={styles.actionsGrid}>
              <ActionBtn icon="print" label="Cetak Struk" onPress={doPrint} loading={busy === "print"} testID="bukti-print" />
              <ActionBtn icon="share-social" label="Bagikan" onPress={doShare} loading={busy === "share"} testID="bukti-share" />
              <ActionBtn icon="image" label="Simpan Gambar" onPress={doSaveImage} loading={busy === "png"} testID="bukti-save-img" />
              <ActionBtn icon="document" label="Simpan PDF" onPress={doSavePdf} loading={busy === "pdf"} testID="bukti-save-pdf" />
            </View>

            <Pressable style={[styles.finishBtn, busy === "finish" && { opacity: 0.6 }]} onPress={doFinish} disabled={!!busy} testID="bukti-finish">
              <Ionicons name="checkmark-circle" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.finishTxt}>Simpan & Kembali ke Transaksi</Text>
            </Pressable>
            <Text style={styles.note}>Dicatat terpisah sebagai Bukti Pembayaran (tidak dihitung di omzet/laporan).</Text>
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Pratinjau struk untuk simpan sebagai GAMBAR (di luar layar) */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={shotRef} collapsable={false} style={styles.receiptShot}>
          <Text style={styles.rTitle}>BUKTI TRANSAKSI TOKO BAGUS</Text>
          {settings?.shopName ? <Text style={styles.rCenter}>{settings.shopName}</Text> : null}
          {settings?.address ? <Text style={styles.rSmall}>{settings.address}</Text> : null}
          {settings?.phone ? <Text style={styles.rSmall}>{settings.phone}</Text> : null}
          <View style={styles.rHr} />
          <RRow k="Metode" v={method || "-"} />
          <RRow k="Penerima" v={recipient || "-"} />
          <View style={styles.rHr} />
          <View style={styles.rAmt}><Text style={styles.rAmtK}>NOMINAL</Text><Text style={styles.rAmtV}>Rp{numberID(Number((amount || "0").replace(/[^\d]/g, "")) || 0)}</Text></View>
          <View style={styles.rHr} />
          <RRow k="Tanggal" v={date || "-"} />
          <RRow k="Waktu" v={time || "-"} />
          <RRow k="No. Ref" v={ref || "-"} />
          {customer ? <RRow k="Pelanggan" v={customer} /> : null}
          <View style={styles.rHr} />
          <Text style={styles.rSmall}>Salinan bukti pembayaran</Text>
          {settings?.thanks ? <Text style={styles.rSmall}>{settings.thanks}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, prefix, warn, help, testID }: { label: string; value: string; onChange: (t: string) => void; placeholder?: string; keyboardType?: any; prefix?: string; warn?: boolean; help?: string; testID?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {warn && (
          <View style={styles.warnChip}><Ionicons name="alert-circle" size={12} color={colors.onBrandPrimary} /><Text style={styles.warnChipTxt}>Periksa</Text></View>
        )}
      </View>
      <View style={[styles.inputBox, warn && styles.inputWarn]}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType || "default"} style={styles.input} />
      </View>
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

function ActionBtn({ icon, label, onPress, loading, testID }: { icon: any; label: string; onPress: () => void; loading?: boolean; testID?: string }) {
  return (
    <Pressable style={styles.actionBtn} onPress={onPress} disabled={loading} testID={testID}>
      {loading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name={icon} size={22} color={colors.brand} />}
      <Text style={styles.actionTxt}>{label}</Text>
    </Pressable>
  );
}

function RRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.rRow}><Text style={styles.rRowK}>{k}</Text><Text style={styles.rRowV} numberOfLines={2}>{v}</Text></View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.xl },
  imgCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: "center", gap: spacing.md },
  preview: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  emptyImg: { width: "100%", height: 160, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  emptyTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 46, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.brand },
  pickTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.base },
  readingBox: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  readingTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  sectionTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, marginTop: spacing.lg },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginBottom: spacing.md, marginTop: 2, lineHeight: 18 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 6 },
  label: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  warnChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#E8A33D", borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  warnChipTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: 10 },
  inputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 50 },
  inputWarn: { borderColor: "#E8A33D", borderWidth: 1.5, backgroundColor: "#FBF3E6" },
  prefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.lg, marginRight: 6 },
  input: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  help: { color: colors.brand, fontFamily: font.medium, fontSize: fontSize.sm, marginTop: 4 },
  row2: { flexDirection: "row", gap: spacing.md },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  actionBtn: { flexGrow: 1, flexBasis: "47%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surfaceSecondary },
  actionTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  finishBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.md, backgroundColor: colors.brand, marginTop: spacing.md },
  finishTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  note: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.md, textAlign: "center", lineHeight: 18 },
  // Pratinjau struk (untuk capture PNG) — diletakkan di luar layar.
  offscreen: { position: "absolute", left: -9999, top: 0 },
  receiptShot: { width: 260, backgroundColor: "#FFFFFF", padding: 14 },
  rTitle: { fontFamily: font.bold, fontSize: 15, textAlign: "center", color: "#000" },
  rCenter: { fontFamily: font.bold, fontSize: 12, textAlign: "center", color: "#000", marginTop: 2 },
  rSmall: { fontFamily: font.regular, fontSize: 11, textAlign: "center", color: "#000" },
  rHr: { borderTopWidth: 1, borderTopColor: "#000", borderStyle: "dashed", marginVertical: 6 },
  rRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 2 },
  rRowK: { fontFamily: font.regular, fontSize: 12, color: "#000" },
  rRowV: { fontFamily: font.regular, fontSize: 12, color: "#000", maxWidth: 150, textAlign: "right" },
  rAmt: { flexDirection: "row", justifyContent: "space-between" },
  rAmtK: { fontFamily: font.bold, fontSize: 14, color: "#000" },
  rAmtV: { fontFamily: font.bold, fontSize: 14, color: "#000" },
});
