// Hook pencarian suara HYBRID untuk Cek Harga.
//
// Alur: 🎤 Bicara → COBA ONLINE (lebih akurat) → bila gagal/tak ada internet →
// OTOMATIS beralih ke OFFLINE (mesin STT di HP) → hasil teks → pencarian produk.
//
// - Saat internet tersedia → pakai pengenalan suara ONLINE (network-based).
// - Saat internet TIDAK tersedia → otomatis OFFLINE (requiresOnDeviceRecognition).
// - Bila server/layanan online gagal saat proses → fallback OFFLINE otomatis
//   (tanpa pengguna menekan apa pun). Jadi fitur tak pernah bergantung penuh online.
// - Offline hanya jalan bila HP punya paket bahasa Indonesia offline → dicek dulu.
// - Bahasa utama: id-ID.
//
// Hanya berfungsi di build native (bukan web/Expo Go).
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// Muat modul secara aman. Di web/Expo Go modul native tak ada → available=false.
let Speech: any = null;
try {
  if (Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Speech = require("expo-speech-recognition");
  }
} catch {
  Speech = null;
}
const Mod: any = Speech?.ExpoSpeechRecognitionModule ?? null;

export type VoiceMode = "online" | "offline";

export type VoiceError =
  | "VOICE_UNAVAILABLE" // modul tak tersedia (web/Expo Go)
  | "PERM_DENIED" // izin mikrofon ditolak (masih bisa diminta lagi)
  | "PERM_BLOCKED" // izin diblok permanen → buka Pengaturan
  | "NO_ID_PACK" // paket bahasa Indonesia offline belum terpasang & online tak tersedia
  | "NO_SPEECH" // tidak ada suara terdeteksi
  | "START_FAIL"; // gagal mulai

function mapErr(e: any): VoiceError {
  const code = String(e?.error || e?.code || "").toLowerCase();
  if (code.includes("no-speech") || code.includes("no_match") || code.includes("speech-timeout")) return "NO_SPEECH";
  if (code.includes("language") || code.includes("locale")) return "NO_ID_PACK";
  if (code.includes("not-allowed") || code.includes("service-not-allowed") || code.includes("permission")) return "PERM_BLOCKED";
  return "START_FAIL";
}

// Error yang berkaitan dengan jaringan/layanan online → layak fallback ke offline.
// TIDAK termasuk "no-speech"/"speech-timeout" (itu murni pengguna diam).
function isNetworkErr(e: any): boolean {
  const c = String(e?.error || e?.code || "").toLowerCase();
  if (c.includes("no-speech") || c.includes("no_match")) return false;
  return c.includes("network") || c.includes("server") || c.includes("unavailable") || c.includes("busy") || c.includes("connection");
}

// Probe konektivitas cepat (tanpa bergantung pada 1 server tertentu). Dipakai untuk
// memilih mesin AWAL (online vs offline) sebelum bicara. Bila gagal → anggap offline.
async function probeOnline(timeoutMs = 1500): Promise<boolean> {
  const urls = ["https://www.gstatic.com/generate_204", "https://clients3.google.com/generate_204"];
  const tryOne = (u: string) =>
    new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(false), timeoutMs);
      try {
        const ctrl: AbortController | undefined = typeof AbortController !== "undefined" ? new AbortController() : undefined;
        if (ctrl) setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } }, timeoutMs);
        fetch(u, { method: "HEAD", signal: ctrl?.signal })
          .then(() => { clearTimeout(timer); finish(true); })
          .catch(() => { clearTimeout(timer); finish(false); });
      } catch {
        clearTimeout(timer);
        finish(false);
      }
    });
  try {
    const results = await Promise.all(urls.map(tryOne));
    return results.some(Boolean);
  } catch {
    return false;
  }
}

// Cek apakah paket bahasa Indonesia OFFLINE tersedia di HP (Android on-device).
async function hasIdOfflinePack(): Promise<boolean> {
  try {
    if (!Mod?.supportsOnDeviceRecognition?.()) return false;
    const res = await Mod.getSupportedLocales?.({ androidRecognitionServicePackage: "com.google.android.as" });
    const installed: string[] = res?.installedLocales || [];
    if (installed.length > 0) return installed.some((l) => String(l).toLowerCase().startsWith("id"));
    // Tak bisa memastikan daftar terpasang → andalkan kemampuan on-device (start akan menentukan).
    return true;
  } catch {
    return !!Mod?.supportsOnDeviceRecognition?.();
  }
}

export function useVoiceSearch(opts: {
  onResult: (text: string) => void;
  onError?: (err: VoiceError) => void;
}) {
  const [listening, setListening] = useState(false);
  const [mode, setMode] = useState<VoiceMode | null>(null);
  const onResultRef = useRef(opts.onResult);
  const onErrorRef = useRef(opts.onError);
  onResultRef.current = opts.onResult;
  onErrorRef.current = opts.onError;

  // Kendali fallback online→offline.
  const currentModeRef = useRef<VoiceMode | null>(null);
  const triedOfflineRef = useRef(false);
  const canOfflineRef = useRef(false);
  const beginRef = useRef<(m: VoiceMode) => void>(() => {});

  // Mulai satu sesi pengenalan pada mesin tertentu (online/offline).
  const beginRecognition = useCallback((m: VoiceMode) => {
    if (!Mod) return;
    currentModeRef.current = m;
    setMode(m);
    setListening(true);
    try {
      Mod.start({
        lang: "id-ID",
        interimResults: false,
        continuous: false, // berhenti otomatis saat pengguna selesai bicara
        requiresOnDeviceRecognition: m === "offline",
        addsPunctuation: false,
        ...(m === "offline" ? { androidRecognitionServicePackage: "com.google.android.as" } : {}),
      });
    } catch (e) {
      // Gagal memulai online → coba offline sekali (bila tersedia).
      if (m === "online" && !triedOfflineRef.current && canOfflineRef.current) {
        triedOfflineRef.current = true;
        beginRecognition("offline");
        return;
      }
      setListening(false);
      onErrorRef.current?.(mapErr(e));
    }
  }, []);
  beginRef.current = beginRecognition;

  useEffect(() => {
    if (!Mod) return;
    const subs = [
      Mod.addListener?.("result", (e: any) => {
        const t = e?.results?.[0]?.transcript ?? "";
        if (e?.isFinal && t) onResultRef.current?.(t);
      }),
      Mod.addListener?.("end", () => setListening(false)),
      Mod.addListener?.("error", (e: any) => {
        // FALLBACK OTOMATIS: online gagal karena jaringan/layanan → coba offline.
        if (
          currentModeRef.current === "online" &&
          !triedOfflineRef.current &&
          canOfflineRef.current &&
          isNetworkErr(e)
        ) {
          triedOfflineRef.current = true;
          beginRef.current?.("offline");
          return; // jangan tampilkan error; sedang beralih ke offline
        }
        setListening(false);
        onErrorRef.current?.(mapErr(e));
      }),
    ];
    return () => subs.forEach((s: any) => s?.remove?.());
  }, []);

  const start = useCallback(async () => {
    if (!Mod) {
      onErrorRef.current?.("VOICE_UNAVAILABLE");
      return;
    }
    try {
      const perm = await Mod.requestPermissionsAsync();
      if (!perm?.granted) {
        onErrorRef.current?.(perm?.canAskAgain === false ? "PERM_BLOCKED" : "PERM_DENIED");
        return;
      }
      const canOffline = await hasIdOfflinePack();
      canOfflineRef.current = canOffline;
      triedOfflineRef.current = false;
      const online = await probeOnline();
      // Internet ada → ONLINE (akurasi lebih baik). Tak ada internet → OFFLINE bila
      // tersedia; jika offline tak tersedia, tetap coba online (biar error jelas).
      const startMode: VoiceMode = online ? "online" : canOffline ? "offline" : "online";
      beginRef.current?.(startMode);
    } catch (e) {
      setListening(false);
      onErrorRef.current?.(mapErr(e));
    }
  }, []);

  const stop = useCallback(() => {
    try {
      Mod?.stop?.();
    } catch { /* noop */ }
    setListening(false);
  }, []);

  // Memicu dialog unduh paket bahasa Indonesia offline (Android).
  const downloadIdPack = useCallback(async () => {
    try {
      await Mod?.androidTriggerOfflineModelDownload?.({ locale: "id-ID" });
    } catch { /* noop */ }
  }, []);

  return { available: !!Mod, listening, mode, start, stop, downloadIdPack };
}
