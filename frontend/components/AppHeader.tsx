import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, fontSize, radius, spacing } from "../src/theme";
import { headerDate } from "../src/format";

// Global app header used on Produk / Cek Harga / Riwayat:
// "KASIR WARUNG" + tanggal (kiri), pill "● Siap" (kanan).
export default function AppHeader({ right }: { right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.brand}>KASIR WARUNG</Text>
        <Text style={styles.date}>{headerDate()}</Text>
      </View>
      {right ?? (
        <View style={styles.pill} testID="app-ready-pill">
          <View style={styles.dot} />
          <Text style={styles.pillTxt}>Siap</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { fontFamily: font.display, fontSize: fontSize.xl, color: colors.onSurface, letterSpacing: 0.5 },
  date: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  pillTxt: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
});
