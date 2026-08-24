import React, { useCallback, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { useCart } from "@/src/cart";
import { useToast } from "@/src/toast";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import { useLocalSearchParams } from "expo-router";

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isPrice = mode === "price";
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [priceResult, setPriceResult] = useState<{ name: string; price: number } | null>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      const now = Date.now();
      if (busy) return;
      if (data === lastScan.current.code && now - lastScan.current.at < 2500) return;
      lastScan.current = { code: data, at: now };
      setBusy(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      try {
        const product = await api.getByBarcode(data);
        const variation = product.variations?.find((v) => v.barcode === data) || null;
        if (isPrice) {
          const price = variation
            ? variation.inherit_tiers
              ? product.sell_price
              : variation.sell_price
            : product.sell_price;
          setPriceResult({ name: `${product.name}${variation ? " — " + variation.name : ""}`, price });
        } else {
          cart.addProduct(product, variation);
          toast.show(`${product.name}${variation ? " — " + variation.name : ""} ditambahkan`, "success");
        }
      } catch (e: any) {
        toast.show(`Barcode ${data} belum terdaftar`, "error");
      } finally {
        setTimeout(() => setBusy(false), 900);
      }
    },
    [busy, cart, toast, isPrice],
  );

  // Permission states
  if (!permission) {
    return <View style={styles.black} />;
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={[styles.permWrap, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.closeTop} testID="scan-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={styles.permCenter}>
          <Ionicons name="camera-outline" size={56} color={colors.brand} />
          <Text style={styles.permTitle}>Izinkan Kamera</Text>
          <Text style={styles.permDesc}>
            Kamera dipakai untuk memindai barcode produk agar cepat masuk ke keranjang.
          </Text>
          {blocked ? (
            <Pressable style={styles.permBtn} onPress={() => Linking.openSettings()} testID="scan-open-settings">
              <Text style={styles.permBtnTxt}>Buka Pengaturan</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.permBtn} onPress={requestPermission} testID="scan-grant">
              <Text style={styles.permBtnTxt}>Izinkan Kamera</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "itf14"],
        }}
        onBarcodeScanned={onScanned}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="scan-close">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>Scan Barcode</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>{isPrice ? "Arahkan barcode untuk cek harga" : "Arahkan barcode ke dalam kotak"}</Text>
        </View>

        {isPrice ? (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg, flexDirection: "column", alignItems: "stretch", gap: spacing.md }]}>
            {priceResult && (
              <View style={styles.priceBanner} testID="scan-price-result">
                <Text style={styles.priceName} numberOfLines={1}>{priceResult.name}</Text>
                <Text style={styles.priceValue}>{rupiah(priceResult.price)}</Text>
              </View>
            )}
            <Pressable style={styles.doneBtnFull} onPress={() => router.back()} testID="scan-done">
              <Text style={styles.doneTxt}>Selesai</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.cartInfo}>
              <Ionicons name="cart" size={20} color={colors.brand} />
              <Text style={styles.cartInfoTxt}>{cart.count} item di keranjang</Text>
            </View>
            <Pressable style={styles.doneBtn} onPress={() => router.back()} testID="scan-done">
              <Text style={styles.doneTxt}>Selesai</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)" },
  topTitle: { color: "#fff", fontFamily: font.bold, fontSize: fontSize.xl },
  frameWrap: { alignItems: "center", justifyContent: "center", gap: spacing.lg },
  frame: { width: 260, height: 170, borderWidth: 3, borderColor: colors.brand, borderRadius: radius.lg, backgroundColor: "rgba(16,185,129,0.06)" },
  hint: { color: "#fff", fontFamily: font.medium, fontSize: fontSize.lg, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, gap: spacing.md },
  cartInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md },
  cartInfoTxt: { color: "#fff", fontFamily: font.medium, fontSize: fontSize.base },
  doneBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  doneBtnFull: { backgroundColor: colors.brand, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md },
  doneTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  priceBanner: { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg },
  priceName: { color: "#111", fontFamily: font.medium, fontSize: fontSize.lg },
  priceValue: { color: colors.brand, fontFamily: font.display, fontSize: fontSize["3xl"], marginTop: 2 },
  permWrap: { flex: 1, backgroundColor: colors.surface },
  closeTop: { padding: spacing.lg },
  permCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md, marginTop: -60 },
  permTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize["2xl"] },
  permDesc: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg, textAlign: "center", lineHeight: 22 },
  permBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  permBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
