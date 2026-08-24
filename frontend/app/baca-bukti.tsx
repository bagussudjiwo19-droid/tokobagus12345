import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";

import { api, type OcrKey } from "@/src/api";
import { useToast } from "@/src/toast";
import { numberID } from "@/src/format";
import BuktiReceipt58 from "@/components/BuktiReceipt58";
import type { Bukti, BuktiKind, Settings } from "@/src/types";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

const STATUS_OPTIONS = ["BERHASIL", "TERVERIFIKASI", "PENDING", "GAGAL"];
const METODE_PRESETS = ["Transfer Bank", "QRIS", "ShopeePay", "GoPay", "DANA", "OVO", "SeaBank Bayar Instan", "LinkAja", "Tunai"];
const OPERATOR_PRESETS = ["Telkomsel", "XL", "Indosat", "Tri", "Smartfren", "Axis", "by.U"];

const KIND_TABS: { key: BuktiKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "transfer", label: "Transfer", icon: "swap-horizontal" },
  { key: "token", label: "Token Listrik", icon: "flash" },
  { key: "pulsa", label: "Pulsa HP", icon: "phone-portrait" },
];

export default function BacaBuktiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<Record<string, string>>();

  const [imageUri, setImageUri] = useState<string | null>(params.image || null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [kind, setKind] = useState<BuktiKind>((params.kind as BuktiKind) || "transfer");

  const [status, setStatus] = useState(params.status || "BERHASIL");
  const [amount, setAmount] = useState(params.amount ? String(params.amount).replace(/[^\d]/g, "") : "");
  const [sellPrice, setSellPrice] = useState(params.sell_price ? String(params.sell_price).replace(/[^\d]/g, "") : "");
  // Transfer
  const [senderName, setSenderName] = useState(params.sender_name || "");
  const [senderBank, setSenderBank] = useState(params.sender_bank || "");
  const [senderAccount, setSenderAccount] = useState(params.sender_account || "");
  const [recipient, setRecipient] = useState(params.recipient || "");
  const [recipientUser, setRecipientUser] = useState(params.recipient_username || "");
  const [method, setMethod] = useState(params.method || "");
  const [ref, setRef] = useState(params.ref || "");
  const [txno, setTxno] = useState(params.txno || "");
  const [product, setProduct] = useState(params.product || "");
  // Token Listrik
  const [customerName, setCustomerName] = useState(params.customer_name || "");
  const [customerId, setCustomerId] = useState(params.customer_id || "");
  const [token, setToken] = useState(params.token || "");
  // Pulsa
  const [phone, setPhone] = useState(params.phone || "");
  const [operator, setOperator] = useState(params.operator || "");
  // Umum
  const [date, setDate] = useState(params.date || "");
  const [time, setTime] = useState(params.time || "");
  const [note, setNote] = useState(params.note || "");

  const emptyWarn: Record<OcrKey, boolean> = {
    amount: false, sender_name: false, sender_bank: false, sender_account: false, recipient: false,
    recipient_username: false, method: false, ref: false, txno: false, product: false,
    customer_name: false, customer_id: false, token: false, phone: false, operator: false,
    date: false, time: false,
  };
  const [warn, setWarn] = useState<Record<OcrKey, boolean>>(emptyWarn);

  const savedId = useRef<string | null>(params.id || null);
  const shotRef = useRef<View>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [metodeOpen, setMetodeOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);

  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);

  // Kenali jenis transaksi dari hasil OCR (bila ada sinyal jelas).
  const detectKind = (f: any): BuktiKind | null => {
    const has = (k: string) => f[k]?.value != null && String(f[k].value).trim() !== "";
    const prod = String(f.product?.value || "").toLowerCase();
    if (has("token") || has("customer_id") || /token|listrik|pln|stroom/.test(prod)) return "token";
    if (has("phone") || has("operator") || /pulsa|paket data|telkomsel|indosat|\bxl\b|smartfren|tri\b|axis/.test(prod)) return "pulsa";
    return null;
  };

  const runOcr = useCallback(async (b64: string, mime: string) => {
    setReading(true);
    try {
      const res = await api.ocrBukti(b64, mime);
      const f = res.fields as any;
      const g = (k: string) => (f[k]?.value != null ? String(f[k].value) : "");
      setAmount(f.amount?.value != null ? String(f.amount.value).replace(/[^\d]/g, "") : "");
      setSenderName(g("sender_name"));
      setSenderBank(g("sender_bank"));
      setSenderAccount(g("sender_account"));
      setRecipient(g("recipient"));
      setRecipientUser(g("recipient_username"));
      setMethod(g("method"));
      setRef(g("ref"));
      setTxno(g("txno"));
      setProduct(g("product"));
      setCustomerName(g("customer_name"));
      setCustomerId(g("customer_id"));
      setToken(g("token"));
      setPhone(g("phone"));
      setOperator(g("operator"));
      setDate(g("date"));
      setTime(g("time"));
      const w: Record<OcrKey, boolean> = { ...emptyWarn };
      (Object.keys(w) as OcrKey[]).forEach((k) => { w[k] = f[k] ? !f[k].confident : false; });
      setWarn(w);
      const detected = detectKind(f);
      if (detected) setKind(detected);
      const shown = detected || kind;
      const relevant: OcrKey[] = shown === "token"
        ? ["amount", "customer_name", "customer_id", "token", "date", "time"]
        : shown === "pulsa"
          ? ["amount", "phone", "operator", "date", "time"]
          : ["amount", "sender_name", "sender_bank", "recipient", "method", "date", "time"];
      const uncertain = relevant.filter((k) => w[k]).length;
      toast.show(uncertain > 0 ? `${uncertain} data belum yakin — mohon periksa` : "Bukti terbaca, silakan periksa", uncertain > 0 ? "info" : "success");
    } catch {
      setWarn({ ...emptyWarn, amount: true });
      toast.show("Tidak ada internet — isi data manual lalu cetak", "info");
    } finally { setReading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, kind]);

  // Dibuka via Share (file uri) → baca jadi base64 lalu OCR.
  useEffect(() => {
    (async () => {
      if (params.image && !senderName && !amount && !reading) {
        try {
          const b64 = await FileSystem.readAsStringAsync(params.image, { encoding: FileSystem.EncodingType.Base64 });
          await runOcr(b64, params.mime || "image/jpeg");
        } catch { toast.show("Gagal membaca gambar bersama", "error"); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.image]);

  const pickFromGallery = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.show("Izin galeri ditolak. Aktifkan di Pengaturan HP.", "error"); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setImageUri(a.uri);
      savedId.current = null;
      if (a.base64) await runOcr(a.base64, a.mimeType || "image/jpeg");
    } catch (e: any) { toast.show(e?.message || "Gagal memilih gambar", "error"); }
  }, [runOcr, toast]);

  const startManual = useCallback(() => {
    setImageUri(null);
    setWarn(emptyWarn);
    toast.show("Mode input manual — isi data transaksi", "info");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const buildBukti = useCallback((): Bukti => ({
    id: savedId.current || "",
    kind,
    status, amount: Number((amount || "0").replace(/[^\d]/g, "")) || 0,
    sell_price: Number((sellPrice || "0").replace(/[^\d]/g, "")) || 0,
    customer_name: customerName.trim(), customer_id: customerId.trim(), token: token.trim(),
    phone: phone.trim(), operator: operator.trim(),
    sender_name: senderName.trim(), sender_bank: senderBank.trim(), sender_account: senderAccount.trim(),
    recipient: recipient.trim(), recipient_username: recipientUser.trim(),
    method: method.trim(), ref: ref.trim(), txno: txno.trim(), product: product.trim(),
    date: date.trim(), time: time.trim(), note: note.trim(), image_uri: imageUri,
    created_at: "", updated_at: "",
  }), [kind, status, amount, sellPrice, customerName, customerId, token, phone, operator, senderName, senderBank, senderAccount, recipient, recipientUser, method, ref, txno, product, date, time, note, imageUri]);

  const persist = useCallback(async (): Promise<Bukti> => {
    const b = buildBukti();
    const saved = await api.saveBukti({ ...b, id: savedId.current || undefined });
    savedId.current = saved.id;
    return saved;
  }, [buildBukti]);

  const validate = (): boolean => {
    if (!(Number((amount || "0").replace(/[^\d]/g, "")) > 0)) { toast.show("Nominal belum diisi — periksa dulu", "error"); return false; }
    return true;
  };

  const doSave = useCallback(async (silent = false) => {
    if (!validate()) return null;
    setBusy("save");
    try { const s = await persist(); if (!silent) { toast.show("Transaksi tersimpan di Riwayat", "success"); router.replace("/"); } return s; }
    catch (e: any) { toast.show(e?.message || "Gagal menyimpan", "error"); return null; }
    finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, router, toast, amount]);

  const doPrintPreview = useCallback(async () => {
    if (!validate()) return;
    setBusy("print");
    try { const s = await persist(); router.push({ pathname: "/preview-struk", params: { id: s.id } }); }
    catch (e: any) { toast.show(e?.message || "Gagal", "error"); }
    finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, router, toast, amount]);

  const doShare = useCallback(async () => {
    if (!validate()) return;
    setBusy("share");
    try {
      const s = await persist();
      const Print = await import("expo-print");
      const { buildBuktiReceiptHTML } = await import("@/src/receipt");
      const { uri } = await Print.printToFileAsync({ html: buildBuktiReceiptHTML(s, settings as Settings) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Bagikan Struk" });
      else toast.show("Berbagi butuh aplikasi hasil build", "info");
    } catch (e: any) { toast.show(e?.message || "Gagal membagikan", "error"); }
    finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, settings, toast, amount]);

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
    } catch (e: any) { toast.show(e?.message || "Gagal menyimpan gambar (butuh build)", "error"); }
    finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, toast, amount]);

  const copy = async (v: string, label: string) => { if (!v) return; try { await Clipboard.setStringAsync(v); toast.show(`${label} disalin`, "success"); } catch {} };

  const fmtRp = amount ? `Rp ${numberID(Number(amount))}` : "Rp 0";
  const fmtSell = sellPrice ? `Rp ${numberID(Number(sellPrice))}` : "Rp 0";
  const amountLabel = kind === "token" ? "Nominal Token" : kind === "pulsa" ? "Nominal Pulsa" : "Jumlah Transfer";
  const waktu = [date, time].filter(Boolean).join(", ") || "-";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.hIcon} testID="bukti-close"><Ionicons name="arrow-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Rincian Transaksi</Text>
        <View style={styles.hIcon} />
      </View>

      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* Pemilih JENIS transaksi */}
        <View style={styles.segWrap}>
          {KIND_TABS.map((t) => {
            const active = kind === t.key;
            return (
              <Pressable key={t.key} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => setKind(t.key)} testID={`bukti-kind-${t.key}`}>
                <Ionicons name={t.icon} size={16} color={active ? colors.onBrandPrimary : colors.brand} />
                <Text style={[styles.segTxt, active && styles.segTxtActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Pilih mode input */}
        <View style={styles.modeRow}>
          <Pressable style={styles.modeBtn} onPress={pickFromGallery} disabled={reading} testID="bukti-mode-upload">
            <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
            <Text style={styles.modeTxt}>Upload Bukti</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={startManual} disabled={reading} testID="bukti-mode-manual">
            <Ionicons name="create-outline" size={18} color={colors.brand} />
            <Text style={styles.modeTxt}>Input Manual</Text>
          </Pressable>
        </View>

        {imageUri ? (
          <View style={styles.thumbWrap}><Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="contain" /></View>
        ) : null}

        {reading ? (
          <View style={styles.readingBox}><ActivityIndicator color={colors.brand} /><Text style={styles.readingTxt}>Membaca bukti…</Text></View>
        ) : null}

        {/* ------- RINCIAN TRANSAKSI (pratinjau bersih) ------- */}
        <Text style={styles.jtLabel}>{amountLabel}</Text>
        <Text style={styles.jtBig} testID="bukti-amount-big">{fmtRp}</Text>

        {kind === "transfer" && (
          <View style={styles.card}>
            <View style={styles.partyRow}>
              <Text style={styles.partyLabel}>Dari</Text>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={styles.partyName}>{senderName || "-"}</Text>
                <Text style={styles.partySub}>{(senderBank || "-") + (senderAccount ? `: ${senderAccount}` : "")}</Text>
              </View>
            </View>
            <View style={styles.cardHr} />
            <View style={styles.partyRow}>
              <Text style={styles.partyLabel}>Ke</Text>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={styles.partyName}>{recipient || "-"}</Text>
                {recipientUser ? <Text style={styles.partySub}>Username: {recipientUser}</Text> : null}
              </View>
            </View>
            <View style={styles.cardHr} />
            <DetailRow label="Jumlah Transfer" value={fmtRp} />
            <DetailRow label="No. Transaksi" value={txno || "-"} onCopy={txno ? () => copy(txno, "No. Transaksi") : undefined} />
            <DetailRow label="No. Referensi" value={ref || "-"} onCopy={ref ? () => copy(ref, "No. Referensi") : undefined} />
            <DetailRow label="Metode Transaksi" value={method || "-"} />
            <DetailRow label="Produk" value={product || "-"} />
            <DetailRow label="Waktu Transaksi" value={waktu} last />
          </View>
        )}

        {kind === "token" && (
          <View style={styles.card}>
            <DetailRow label="Nama Pelanggan" value={customerName || "-"} />
            <DetailRow label="ID Pelanggan / No. Meter" value={customerId || "-"} onCopy={customerId ? () => copy(customerId, "ID Pelanggan") : undefined} />
            <View style={styles.tokenBox}>
              <Text style={styles.tokenLbl}>NOMOR TOKEN LISTRIK</Text>
              <Text style={styles.tokenVal} selectable testID="bukti-token-preview">{token || "-"}</Text>
              {token ? <Pressable onPress={() => copy(token, "Nomor Token")} style={styles.tokenCopy}><Ionicons name="copy-outline" size={14} color={colors.brand} /><Text style={styles.tokenCopyTxt}>Salin</Text></Pressable> : null}
            </View>
            <DetailRow label="Nominal" value={fmtRp} />
            <DetailRow label="Harga Jual" value={fmtSell} />
            <DetailRow label="Waktu Transaksi" value={waktu} />
            <DetailRow label="Status" value={status} last />
          </View>
        )}

        {kind === "pulsa" && (
          <View style={styles.card}>
            <DetailRow label="Nomor HP" value={phone || "-"} onCopy={phone ? () => copy(phone, "Nomor HP") : undefined} />
            <DetailRow label="Operator" value={operator || "-"} />
            <DetailRow label="Nominal Pulsa" value={fmtRp} />
            <DetailRow label="Harga Jual" value={fmtSell} />
            <DetailRow label="Waktu Transaksi" value={waktu} />
            <DetailRow label="Status" value={status} last />
          </View>
        )}

        {/* ------- FORM EDIT ------- */}
        <View style={styles.formHeadWrap}><Text style={styles.formHead}>DATA TRANSAKSI (BISA DIEDIT)</Text></View>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <SelectField label="Status" value={status} warn={false} onPress={() => setStatusOpen(true)} testID="bukti-status" />

          {kind === "transfer" && (
            <>
              <Field label="Nominal" value={amount} onChange={(t: string) => setAmount(t.replace(/[^\d]/g, ""))} keyboardType="numeric" prefix="Rp" warn={warn.amount} help={amount ? fmtRp : undefined} testID="bukti-amount" />
              <Field label="Dari (Nama Pengirim)" value={senderName} onChange={setSenderName} warn={warn.sender_name} testID="bukti-sender-name" />
              <Field label="Bank Pengirim" value={senderBank} onChange={setSenderBank} warn={warn.sender_bank} testID="bukti-sender-bank" />
              <Field label="No. Tujuan (No. Rekening)" value={senderAccount} onChange={setSenderAccount} keyboardType="numeric" warn={warn.sender_account} testID="bukti-sender-account" />
              <Field label="Ke (Penerima)" value={recipient} onChange={setRecipient} warn={warn.recipient} testID="bukti-recipient" />
              <Field label="Username Tujuan" value={recipientUser} onChange={setRecipientUser} warn={warn.recipient_username} testID="bukti-recipient-user" />
              <SelectField label="Metode Transaksi" value={method || "Pilih / ketik metode"} muted={!method} warn={warn.method} onPress={() => setMetodeOpen(true)} editable value2={method} onChange2={setMethod} testID="bukti-method" />
              <Field label="No. Referensi" value={ref} onChange={setRef} warn={warn.ref} testID="bukti-ref" />
              <Field label="No. Transaksi" value={txno} onChange={setTxno} warn={warn.txno} testID="bukti-txno" />
              <Field label="Produk" value={product} onChange={setProduct} warn={warn.product} testID="bukti-product" />
            </>
          )}

          {kind === "token" && (
            <>
              <Field label="Nama Pelanggan" value={customerName} onChange={setCustomerName} warn={warn.customer_name} testID="bukti-customer-name" />
              <Field label="ID Pelanggan / No. Meter" value={customerId} onChange={setCustomerId} keyboardType="numeric" warn={warn.customer_id} testID="bukti-customer-id" />
              <Field label="Nomor Token Listrik" value={token} onChange={setToken} keyboardType="numeric" warn={warn.token} help="20 digit stroom/token PLN" testID="bukti-token" />
              <Field label="Nominal" value={amount} onChange={(t: string) => setAmount(t.replace(/[^\d]/g, ""))} keyboardType="numeric" prefix="Rp" warn={warn.amount} help={amount ? fmtRp : undefined} testID="bukti-amount" />
              <Field label="Harga Jual" value={sellPrice} onChange={(t: string) => setSellPrice(t.replace(/[^\d]/g, ""))} keyboardType="numeric" prefix="Rp" help={sellPrice ? fmtSell : undefined} testID="bukti-sell-price" />
            </>
          )}

          {kind === "pulsa" && (
            <>
              <Field label="Nomor HP" value={phone} onChange={setPhone} keyboardType="phone-pad" warn={warn.phone} testID="bukti-phone" />
              <SelectField label="Operator" value={operator || "Pilih / ketik operator"} muted={!operator} warn={warn.operator} onPress={() => setOperatorOpen(true)} editable value2={operator} onChange2={setOperator} testID="bukti-operator" />
              <Field label="Nominal Pulsa" value={amount} onChange={(t: string) => setAmount(t.replace(/[^\d]/g, ""))} keyboardType="numeric" prefix="Rp" warn={warn.amount} help={amount ? fmtRp : undefined} testID="bukti-amount" />
              <Field label="Harga Jual" value={sellPrice} onChange={(t: string) => setSellPrice(t.replace(/[^\d]/g, ""))} keyboardType="numeric" prefix="Rp" help={sellPrice ? fmtSell : undefined} testID="bukti-sell-price" />
            </>
          )}

          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field label="Tanggal" value={date} onChange={setDate} warn={warn.date} testID="bukti-date" /></View>
            <View style={{ flex: 1 }}><Field label="Waktu" value={time} onChange={setTime} warn={warn.time} testID="bukti-time" /></View>
          </View>
          <Field label="Catatan (opsional)" value={note} onChange={setNote} multiline placeholder="Tulis catatan…" testID="bukti-note" />

          <View style={styles.btnRow}>
            <Pressable style={styles.btnGhost} onPress={() => router.back()} testID="bukti-cancel"><Text style={styles.btnGhostTxt}>BATAL</Text></Pressable>
            <Pressable style={styles.btnBlue} onPress={() => doSave(false)} disabled={!!busy} testID="bukti-save"><Text style={styles.btnBlueTxt}>{busy === "save" ? "…" : "SIMPAN"}</Text></Pressable>
            <Pressable style={styles.btnGreen} onPress={doPrintPreview} disabled={!!busy} testID="bukti-print"><Text style={styles.btnGreenTxt}>CETAK STRUK</Text></Pressable>
          </View>

          <Text style={styles.aksiHead}>AKSI LAIN</Text>
          <View style={styles.row2}>
            <Pressable style={styles.actionBtn} onPress={doShare} disabled={!!busy} testID="bukti-share">
              {busy === "share" ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="share-social" size={18} color={colors.brand} />}
              <Text style={styles.actionTxt}>BAGIKAN (PDF)</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={doSaveImage} disabled={!!busy} testID="bukti-save-img">
              {busy === "png" ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="image-outline" size={18} color={colors.brand} />}
              <Text style={styles.actionTxt}>SIMPAN GAMBAR</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>Status adalah status internal toko (dari verifikasi kasir). Transaksi ini dicatat terpisah — tidak dihitung di omzet/laporan penjualan.</Text>
        </View>
      </KeyboardAwareScrollView>

      {/* Pratinjau struk untuk simpan GAMBAR (di luar layar) */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={shotRef} collapsable={false}><BuktiReceipt58 b={buildBukti()} /></View>
      </View>

      {/* Dropdown Status */}
      <OptionSheet visible={statusOpen} title="Status" options={STATUS_OPTIONS} onPick={(v) => { setStatus(v); setStatusOpen(false); }} onClose={() => setStatusOpen(false)} />
      {/* Dropdown Metode (preset) */}
      <OptionSheet visible={metodeOpen} title="Metode Transaksi" options={METODE_PRESETS} onPick={(v) => { setMethod(v); setMetodeOpen(false); }} onClose={() => setMetodeOpen(false)} />
      {/* Dropdown Operator (preset) */}
      <OptionSheet visible={operatorOpen} title="Operator" options={OPERATOR_PRESETS} onPick={(v) => { setOperator(v); setOperatorOpen(false); }} onClose={() => setOperatorOpen(false)} />
    </View>
  );
}

function DetailRow({ label, value, onCopy, last }: { label: string; value: string; onCopy?: () => void; last?: boolean }) {
  return (
    <View style={[styles.dRow, !last && styles.dRowBorder]}>
      <Text style={styles.dLabel}>{label}</Text>
      <View style={styles.dValWrap}>
        <Text style={styles.dVal} numberOfLines={1}>{value}</Text>
        {onCopy && <Pressable onPress={onCopy} hitSlop={8} style={{ marginLeft: 6 }}><Ionicons name="copy-outline" size={16} color={colors.muted} /></Pressable>}
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, prefix, warn, help, multiline, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {warn && <View style={styles.warnChip}><Ionicons name="alert-circle" size={11} color={colors.onBrandPrimary} /><Text style={styles.warnChipTxt}>Periksa</Text></View>}
      </View>
      <View style={[styles.inputBox, warn && styles.inputWarn, multiline && { height: 74, alignItems: "flex-start", paddingVertical: 8 }]}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType || "default"} multiline={multiline} style={[styles.input, multiline && { textAlignVertical: "top" }]} />
      </View>
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

// Field dropdown; bila editable=true, juga bisa diketik bebas + tombol pilih preset.
function SelectField({ label, value, value2, onChange2, muted, warn, onPress, editable, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {warn && <View style={styles.warnChip}><Ionicons name="alert-circle" size={11} color={colors.onBrandPrimary} /><Text style={styles.warnChipTxt}>Periksa</Text></View>}
      </View>
      <View style={[styles.inputBox, warn && styles.inputWarn]}>
        {editable ? (
          <TextInput testID={testID} value={value2} onChangeText={onChange2} placeholder="Ketik di sini…" placeholderTextColor={colors.muted} style={styles.input} />
        ) : (
          <Pressable style={styles.selectInner} onPress={onPress} testID={testID}><Text style={[styles.input, muted && { color: colors.muted }]}>{value}</Text></Pressable>
        )}
        <Pressable onPress={onPress} hitSlop={8}><Ionicons name="chevron-down" size={18} color={colors.muted} /></Pressable>
      </View>
    </View>
  );
}

function OptionSheet({ visible, title, options, onPick, onClose }: { visible: boolean; title: string; options: string[]; onPick: (v: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {options.map((o) => (
            <Pressable key={o} style={styles.sheetOpt} onPress={() => onPick(o)} testID={`opt-${o}`}>
              <Text style={styles.sheetOptTxt}>{o}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  hIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  segWrap: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 42, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surfaceSecondary },
  segBtnActive: { backgroundColor: colors.brand },
  segTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xs },
  segTxtActive: { color: colors.onBrandPrimary },
  modeRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surfaceSecondary },
  modeTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  thumbWrap: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  thumb: { width: "100%", height: 160, borderRadius: radius.sm },
  readingBox: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  readingTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  jtLabel: { textAlign: "center", color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base, marginTop: spacing.lg },
  jtBig: { textAlign: "center", color: colors.onSurface, fontFamily: font.display, fontSize: 34, marginTop: 2 },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  partyRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  partyLabel: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base },
  partyName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  partySub: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 1 },
  cardHr: { borderTopWidth: 1, borderTopColor: colors.border },
  tokenBox: { marginVertical: 8, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.brandTertiary, alignItems: "center" },
  tokenLbl: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xs, letterSpacing: 0.5 },
  tokenVal: { color: colors.onSurface, fontFamily: font.bold, fontSize: 20, letterSpacing: 1, marginTop: 3, textAlign: "center" },
  tokenCopy: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  tokenCopyTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xs },
  dRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, gap: spacing.md },
  dRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm },
  dValWrap: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  dVal: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.sm, textAlign: "right", flexShrink: 1 },
  formHeadWrap: { alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  formHead: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 0.5, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, overflow: "hidden" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 5 },
  label: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.sm },
  warnChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#E8A33D", borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  warnChipTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: 9 },
  inputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, minHeight: 46 },
  inputWarn: { borderColor: "#E8A33D", borderWidth: 1.5, backgroundColor: "#FBF3E6" },
  selectInner: { flex: 1, justifyContent: "center" },
  prefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.base, marginRight: 6 },
  input: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.base, paddingVertical: 8 },
  help: { color: colors.brand, fontFamily: font.medium, fontSize: fontSize.sm, marginTop: 3 },
  row2: { flexDirection: "row", gap: spacing.md },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  btnGhost: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  btnGhostTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.sm },
  btnBlue: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  btnBlueTxt: { color: "#FFFFFF", fontFamily: font.bold, fontSize: fontSize.sm },
  btnGreen: { flex: 1.3, height: 48, borderRadius: radius.md, backgroundColor: "#159A5B", alignItems: "center", justifyContent: "center" },
  btnGreenTxt: { color: "#FFFFFF", fontFamily: font.bold, fontSize: fontSize.sm },
  aksiHead: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.xs, letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surfaceSecondary },
  actionTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xs },
  note: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.xs, marginTop: spacing.md, textAlign: "center", lineHeight: 16 },
  offscreen: { position: "absolute", left: -9999, top: 0 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xl, gap: 4 },
  sheetTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, marginBottom: spacing.sm },
  sheetOpt: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetOptTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
});
