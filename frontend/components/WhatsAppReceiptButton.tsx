import React, { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useToast } from "@/src/toast";
import { buildReceiptWhatsApp } from "@/src/receipt";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Settings, Transaction } from "@/src/types";

// Normalisasi nomor HP Indonesia → format internasional untuk wa.me (mis. 0812… → 62812…).
function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("62")) { /* sudah benar */ }
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

export default function WhatsAppReceiptButton({
  tx,
  settings,
  testID = "wa-receipt-button",
}: {
  tx: Transaction | null;
  settings: Settings | null;
  testID?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");

  const send = async () => {
    if (!tx || !settings) return;
    const text = buildReceiptWhatsApp(tx, settings);
    const num = normalizePhone(phone);
    const encoded = encodeURIComponent(text);
    const url = num ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) { toast.show("WhatsApp tidak tersedia di perangkat ini", "error"); return; }
      await Linking.openURL(url);
      setOpen(false);
      setPhone("");
    } catch {
      toast.show("Gagal membuka WhatsApp", "error");
    }
  };

  return (
    <>
      <Pressable style={styles.waBtn} testID={testID} onPress={() => setOpen(true)}>
        <Ionicons name="logo-whatsapp" size={22} color={colors.onBrandPrimary} />
        <Text style={styles.waBtnTxt}>Kirim Struk WhatsApp</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.head}>
              <View style={styles.headIcon}><Ionicons name="logo-whatsapp" size={22} color="#25D366" /></View>
              <Text style={styles.title}>Kirim Struk via WhatsApp</Text>
            </View>
            <Text style={styles.hint}>Masukkan nomor WhatsApp pelanggan (opsional). Kosongkan untuk memilih kontak sendiri di WhatsApp.</Text>
            <View style={styles.inputBox}>
              <Ionicons name="call-outline" size={18} color={colors.muted} />
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^\d]/g, ""))}
                keyboardType="phone-pad"
                placeholder="08xxxxxxxxxx"
                placeholderTextColor={colors.muted}
                style={styles.input}
                testID="wa-phone-input"
              />
              {phone !== "" && (
                <Pressable onPress={() => setPhone("")} testID="wa-phone-clear">
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              )}
            </View>
            <View style={styles.row}>
              <Pressable style={styles.cancel} onPress={() => setOpen(false)} testID="wa-cancel">
                <Text style={styles.cancelTxt}>Batal</Text>
              </Pressable>
              <Pressable style={styles.send} onPress={send} testID="wa-send">
                <Ionicons name="send" size={16} color={colors.onBrandPrimary} />
                <Text style={styles.sendTxt}>Kirim</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  waBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: "#25D366", width: "100%", maxWidth: 320, marginTop: spacing.md },
  waBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface, flexShrink: 1 },
  hint: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, lineHeight: 18 },
  inputBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 50 },
  input: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  cancel: { flex: 1, height: 50, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  send: { flex: 1, flexDirection: "row", gap: 6, height: 50, borderRadius: radius.pill, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center" },
  sendTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
