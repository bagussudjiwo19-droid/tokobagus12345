import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Settings, Product } from "@/src/types";

const SLOT_COUNT = 10;

// Normalkan array slot agar selalu panjang 10 (null = kosong).
function normalize(arr?: (string | null)[]): (string | null)[] {
  const out = Array.isArray(arr) ? arr.slice(0, SLOT_COUNT) : [];
  while (out.length < SLOT_COUNT) out.push(null);
  return out;
}

export default function AturPintasanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { products } = useData();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [slots, setSlots] = useState<(string | null)[]>(normalize());
  const [pickFor, setPickFor] = useState<number | null>(null); // index slot yang sedang diisi
  const [q, setQ] = useState("");

  useEffect(() => {
    api.getSettings().then((s) => { setSettings(s); setSlots(normalize(s.quickSlots)); }).catch(() => {});
  }, []);

  const persist = async (next: (string | null)[]) => {
    setSlots(next);
    if (!settings) return;
    const merged = { ...settings, quickSlots: next } as Settings;
    setSettings(merged);
    try { await api.saveSettings(merged); } catch { toast.show("Gagal menyimpan", "error"); }
  };

  const assign = (idx: number, productId: string) => {
    const next = slots.slice();
    next[idx] = productId;
    persist(next);
    setPickFor(null);
    setQ("");
  };

  const clearSlot = (idx: number) => {
    const next = slots.slice();
    next[idx] = null;
    persist(next);
  };

  const nameOf = (id: string | null): Product | null => (id ? products.find((p) => p.id === id) || null : null);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    const base = products.filter((p) => !p.parent_id);
    if (!key) return base.slice(0, 60);
    return base.filter((p) => p.name.toLowerCase().includes(key)).slice(0, 60);
  }, [products, q]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10} testID="pintasan-back">
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Atur Pintasan Produk</Text>
          <Text style={styles.sub}>10 slot • ketuk untuk isi / ganti / kosongkan</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        {slots.map((id, idx) => {
          const p = nameOf(id);
          const missing = !!id && !p; // produk terhapus dari database
          return (
            <View key={idx} style={styles.slotRow} testID={`slot-row-${idx}`}>
              <View style={styles.slotNo}><Text style={styles.slotNoTxt}>{idx + 1}</Text></View>
              <Pressable style={styles.slotMain} onPress={() => setPickFor(idx)} testID={`slot-pick-${idx}`}>
                {p ? (
                  <>
                    <Text style={styles.slotName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.slotPrice}>
                      {p.variations?.length ? `${p.variations.length} variasi` : rupiah(p.sell_price)}
                    </Text>
                  </>
                ) : missing ? (
                  <Text style={styles.slotEmptyWarn}>Produk tidak ada lagi — ketuk untuk ganti</Text>
                ) : (
                  <Text style={styles.slotEmpty}>Kosong — ketuk untuk pilih produk</Text>
                )}
              </Pressable>
              {!!id && (
                <Pressable style={styles.clearBtn} onPress={() => clearSlot(idx)} hitSlop={8} testID={`slot-clear-${idx}`}>
                  <Ionicons name="close-circle" size={22} color={colors.muted} />
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Pemilih produk */}
      <Modal visible={pickFor !== null} transparent animationType="slide" onRequestClose={() => setPickFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => { setPickFor(null); setQ(""); }} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Pilih Produk untuk Slot {(pickFor ?? 0) + 1}</Text>
            <Pressable onPress={() => { setPickFor(null); setQ(""); }} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama produk…"
              placeholderTextColor={colors.muted}
              value={q}
              onChangeText={setQ}
              autoFocus
              testID="pintasan-search"
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
            {filtered.length === 0 && <Text style={styles.noResult}>Tidak ada produk.</Text>}
            {filtered.map((p) => (
              <Pressable key={p.id} style={styles.pickRow} onPress={() => pickFor !== null && assign(pickFor, p.id)} testID={`pick-${p.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.pickMeta}>{p.variations?.length ? `${p.variations.length} variasi` : rupiah(p.sell_price)}</Text>
                </View>
                <Ionicons name="add-circle" size={22} color={colors.brand} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  title: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface },
  sub: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 1 },

  slotRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  slotNo: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  slotNoTxt: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.brand },
  slotMain: { flex: 1 },
  slotName: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  slotPrice: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 1 },
  slotEmpty: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.muted },
  slotEmptyWarn: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.error },
  clearBtn: { padding: 2 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sheetTitle: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: fontSize.base, color: colors.onSurface, paddingVertical: 2 },
  noResult: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, textAlign: "center", padding: spacing.md },
  pickRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickName: { fontFamily: font.medium, fontSize: fontSize.base, color: colors.onSurface },
  pickMeta: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 1 },
});
