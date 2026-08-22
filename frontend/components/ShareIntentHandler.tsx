import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useShareIntent } from "expo-share-intent";

// Menangkap gambar yang DIBAGIKAN dari aplikasi lain (Share Target Android) →
// buka layar "Baca Bukti Pembayaran" dengan gambar tsb. HANYA berfungsi di
// aplikasi hasil build (bukan Expo Go/web). Aman di preview: hook no-op.
export default function ShareIntentHandler() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    debug: false,
    resetOnBackground: true,
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!hasShareIntent) return;
    const file = shareIntent?.files?.[0];
    if (file?.path) {
      router.push({
        pathname: "/baca-bukti",
        params: { image: file.path, mime: file.mimeType || "image/jpeg" },
      });
    }
    resetShareIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  return null;
}
