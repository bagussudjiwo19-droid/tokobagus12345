import { Stack } from "expo-router";
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

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "DMSans-Regular": require("../assets/fonts/DMSans-Regular.ttf"),
    "DMSans-Medium": require("../assets/fonts/DMSans-Medium.ttf"),
    "DMSans-Bold": require("../assets/fonts/DMSans-Bold.ttf"),
    "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
    "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
  });

  const ready = (loaded || error) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
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
                <StatusBar style="light" />
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
                </Stack>
              </DataProvider>
            </CartProvider>
          </ToastProvider>
        </BottomSheetModalProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
