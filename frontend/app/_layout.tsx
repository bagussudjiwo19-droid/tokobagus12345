import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { CartProvider } from "@/src/cart";
import { DataProvider } from "@/src/data";
import { ToastProvider } from "@/src/toast";
import { colors } from "@/src/theme";
import { maybeDailyAutoBackup, shouldRemindBackup } from "@/src/autobackup";
import { mikoBus } from "@/src/mikoBus";
import { startAutoSync } from "@/src/sync";
import Miko from "@/components/Miko";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pathname = usePathname();
  const [loaded, error] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "DMSans-Regular": require("../assets/fonts/DMSans-Regular.ttf"),
    "DMSans-Medium": require("../assets/fonts/DMSans-Medium.ttf"),
    "DMSans-Bold": require("../assets/fonts/DMSans-Bold.ttf"),
    "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
    "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
    "Nunito-Regular": require("../assets/fonts/Nunito_400Regular.ttf"),
    "Nunito-Bold": require("../assets/fonts/Nunito_700Bold.ttf"),
    "Nunito-ExtraBold": require("../assets/fonts/Nunito_800ExtraBold.ttf"),
    "PlusJakartaSans-Regular": require("../assets/fonts/PlusJakartaSans_400Regular.ttf"),
    "PlusJakartaSans-Medium": require("../assets/fonts/PlusJakartaSans_500Medium.ttf"),
    "PlusJakartaSans-Bold": require("../assets/fonts/PlusJakartaSans_700Bold.ttf"),
  });

  const ready = (loaded || error) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
      // Auto backup harian (senyap, offline, hanya di HP).
      const t = setTimeout(() => { maybeDailyAutoBackup(); }, 2500);
      // Pengingat Miko: ajak bagikan cadangan ke Drive/WhatsApp bila sudah lama.
      const r = setTimeout(async () => {
        try { if (await shouldRemindBackup()) mikoBus.emit({ type: "backup_reminder" }); } catch { /* abaikan */ }
      }, 6000);
      // Sinkronisasi cloud otomatis (aktif hanya jika Kode Toko sudah diisi).
      const stopSync = startAutoSync();
      return () => { clearTimeout(t); clearTimeout(r); stopSync(); };
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <BottomSheetModalProvider>
          <ToastProvider>
            <CartProvider>
              <DataProvider>
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.surface },
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="scan" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="produk-form" options={{ presentation: "modal" }} />
                  <Stack.Screen name="checkout" options={{ presentation: "modal" }} />
                  <Stack.Screen name="cari" options={{ presentation: "modal" }} />
                  <Stack.Screen name="edit-transaksi" options={{ presentation: "modal" }} />
                  <Stack.Screen name="variasi-cepat" options={{ presentation: "modal" }} />
                  <Stack.Screen name="item-manual" options={{ presentation: "modal" }} />
                  <Stack.Screen name="backup" options={{ presentation: "modal" }} />
                  <Stack.Screen name="pengaturan-struk" options={{ presentation: "modal" }} />
                  <Stack.Screen name="pengaturan-printer" options={{ presentation: "modal" }} />
                  <Stack.Screen name="kelola-stok" options={{ presentation: "modal" }} />
                  <Stack.Screen name="admin-pin" options={{ presentation: "modal" }} />
                </Stack>
                {!(pathname || "").includes("cek-harga") && <Miko />}
              </DataProvider>
            </CartProvider>
          </ToastProvider>
        </BottomSheetModalProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
