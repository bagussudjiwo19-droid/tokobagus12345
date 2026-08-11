import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import AppHeader from "@/components/AppHeader";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

export default function CekHargaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <AppHeader
        right={
          <View style={styles.tagIcon}>
            <Ionicons name="pricetag" size={22} color={colors.brand} />
          </View>
        }
      />
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Cek Harga</Text>
        <Text style={styles.subtitle}>Scan atau cari untuk lihat harga</Text>
      </View>

      <View style={styles.body}>
        <Ionicons name="barcode-outline" size={64} color={colors.onSurfaceSecondary} />
        <Text style={styles.ready}>Siap Cek Harga</Text>
        <Text style={styles.readyDesc}>Scan dengan alat Bluetooth, kamera, atau cari manual</Text>

        <Pressable style={styles.scanCard} testID="cekharga-scan" onPress={() => router.push("/scan?mode=price")}>
          <Ionicons name="scan-outline" size={26} color={colors.onBrandPrimary} />
          <Text style={styles.scanTxt}>Scan Kamera</Text>
        </Pressable>

        <Pressable style={styles.searchCard} testID="cekharga-search" onPress={() => router.push("/cari?mode=price")}>
          <Ionicons name="search" size={24} color={colors.onSurface} />
          <Text style={styles.searchTxt}>Cari Produk</Text>
        </Pressable>
      </View>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  tagIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  titleBlock: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, gap: spacing.md },
  ready: { fontFamily: font.bold, fontSize: fontSize["2xl"], color: colors.onSurface, marginTop: spacing.sm },
  readyDesc: { fontFamily: font.regular, fontSize: fontSize.lg, color: colors.muted, textAlign: "center", marginBottom: spacing.lg },
  scanCard: { width: "100%", height: 150, backgroundColor: colors.brand, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  scanTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.xl },
  searchCard: { width: "100%", height: 120, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  searchTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
});
