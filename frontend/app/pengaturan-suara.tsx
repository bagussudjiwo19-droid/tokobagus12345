import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Settings } from "@/src/types";
import { sfx, SFX_LIBRARY, type SfxId } from "@/src/sfx";

const VOL_OPTS: { id: "normal" | "keras" | "maks"; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "keras", label: "Keras" },
  { id: "maks", label: "Maksimal" },
];

const EVENTS: { key: "sfxOk" | "sfxFail" | "sfxPaid"; title: string; desc: string; icon: any }[] = [
  { key: "sfxOk", title: "Barang Masuk / Berhasil", desc: "Bunyi saat barang masuk atau aksi berhasil", icon: "checkmark-circle" },
  { key: "sfxFail", title: "Gagal / Tidak Masuk", desc: "Bunyi saat barang tidak ditemukan atau aksi gagal", icon: "close-circle" },
  { key: "sfxPaid", title: "Transaksi Lunas", desc: "Bunyi saat pembayaran selesai", icon: "cash" },
];

export default function PengaturanSuaraScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);

  useEffect(() => { api.getSettings().then(setS).catch(() => {}); }, []);

  const update = async (patch: Partial<Settings>) => {
    if (!s) return;
    const next = { ...s, ...patch } as Settings;
    setS(next);
    await api.saveSettings(next);
    sfx.reload();
  };

  const vol = s?.sfxVolume || "keras";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.hTitle}>Suara Efek</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="suara-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.infoBox}>
          <Ionicons name="volume-high-outline" size={22} color={colors.brand} />
          <Text style={styles.infoTxt}>Pilih bunyi & volume sesuai selera. Untuk toko ramai, pakai volume Maksimal. Suara hanya berbunyi di HP (bukan preview).</Text>
        </View>

        {/* Volume */}
        <Text style={styles.section}>Tingkat Volume</Text>
        <View style={styles.volRow}>
          {VOL_OPTS.map((v) => (
            <Pressable
              key={v.id}
              style={[styles.volChip, vol === v.id && styles.volChipActive]}
              onPress={() => update({ sfxVolume: v.id })}
              testID={`vol-${v.id}`}
            >
              <Text style={[styles.volTxt, vol === v.id && styles.volTxtActive]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Pilihan bunyi tiap kejadian */}
        {EVENTS.map((ev) => {
          const cur = (s?.[ev.key] as SfxId) || "beep";
          return (
            <View key={ev.key} style={styles.block}>
              <View style={styles.blockHead}>
                <Ionicons name={ev.icon} size={20} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockTitle}>{ev.title}</Text>
                  <Text style={styles.blockDesc}>{ev.desc}</Text>
                </View>
              </View>
              {SFX_LIBRARY.map((snd) => {
                const active = cur === snd.id;
                return (
                  <Pressable key={snd.id} style={[styles.sndRow, active && styles.sndRowActive]} onPress={() => update({ [ev.key]: snd.id } as any)} testID={`${ev.key}-${snd.id}`}>
                    <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? colors.brand : colors.muted} />
                    <Text style={[styles.sndLabel, active && { color: colors.brand, fontFamily: font.bold }]}>{snd.label}</Text>
                    <Pressable
                      style={styles.playBtn}
                      onPress={() => { sfx.preview(snd.id, vol); toast.show("Bunyi hanya terdengar di HP", "info"); }}
                      testID={`play-${ev.key}-${snd.id}`}
                      hitSlop={8}
                    >
                      <Ionicons name="play" size={16} color={colors.onBrandPrimary} />
                      <Text style={styles.playTxt}>Coba</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingBottom: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary },
  hTitle: { fontFamily: font.bold, fontSize: fontSize.xl, color: colors.onSurface },
  closeBtn: { position: "absolute", right: spacing.md, bottom: spacing.md, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  infoBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoTxt: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 19 },
  section: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface, marginBottom: spacing.sm },
  volRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  volChip: { flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  volChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  volTxt: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  volTxtActive: { color: colors.onBrandPrimary },
  block: { marginBottom: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  blockHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  blockTitle: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface },
  blockDesc: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 1 },
  sndRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  sndRowActive: { backgroundColor: colors.surfaceTertiary },
  sndLabel: { flex: 1, fontFamily: font.medium, fontSize: fontSize.base, color: colors.onSurface },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill },
  playTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.sm },
});
