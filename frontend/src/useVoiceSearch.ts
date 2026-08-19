// Hook pencarian suara OFFLINE memakai mesin STT bawaan HP (Android/iOS) via
// expo-speech-recognition. Hanya berfungsi di build native (bukan web/Expo Go).
// Prioritas offline: requiresOnDeviceRecognition=true, lang id-ID.
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// Muat modul secara aman. Di web/Expo Go modul native tak ada → available=false.
let Speech: any = null;
try {
  if (Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Speech = require("expo-speech-recognition");
  }
} catch {
  Speech = null;
}
const Mod: any = Speech?.ExpoSpeechRecognitionModule ?? null;

export type VoiceError =
  | "VOICE_UNAVAILABLE" // modul tak tersedia (web/Expo Go)
  | "PERM_DENIED" // izin mikrofon ditolak (masih bisa diminta lagi)
  | "PERM_BLOCKED" // izin diblok permanen → buka Pengaturan
  | "NO_ID_PACK" // paket bahasa Indonesia offline belum terpasang di HP
  | "NO_SPEECH" // tidak ada suara terdeteksi
  | "START_FAIL"; // gagal mulai

function mapErr(e: any): VoiceError {
  const code = String(e?.error || e?.code || "").toLowerCase();
  if (code.includes("language") || code.includes("locale")) return "NO_ID_PACK";
  if (code.includes("no-speech") || code.includes("no_match") || code.includes("speech-timeout")) return "NO_SPEECH";
  if (code.includes("not-allowed") || code.includes("service-not-allowed") || code.includes("permission")) return "PERM_BLOCKED";
  return "START_FAIL";
}

export function useVoiceSearch(opts: {
  onResult: (text: string) => void;
  onError?: (err: VoiceError) => void;
}) {
  const [listening, setListening] = useState(false);
  const onResultRef = useRef(opts.onResult);
  const onErrorRef = useRef(opts.onError);
  onResultRef.current = opts.onResult;
  onErrorRef.current = opts.onError;

  useEffect(() => {
    if (!Mod) return;
    const subs = [
      Mod.addListener?.("result", (e: any) => {
        const t = e?.results?.[0]?.transcript ?? "";
        if (e?.isFinal && t) onResultRef.current?.(t);
      }),
      Mod.addListener?.("end", () => setListening(false)),
      Mod.addListener?.("error", (e: any) => {
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
      setListening(true);
      Mod.start({
        lang: "id-ID",
        interimResults: false,
        continuous: false, // berhenti otomatis saat pengguna selesai bicara
        requiresOnDeviceRecognition: true, // utamakan OFFLINE
        addsPunctuation: false,
      });
    } catch (e) {
      setListening(false);
      onErrorRef.current?.(mapErr(e));
    }
  }, []);

  const stop = useCallback(() => {
    try {
      Mod?.stop?.();
    } catch {}
    setListening(false);
  }, []);

  // Memicu dialog unduh paket bahasa Indonesia offline (Android).
  const downloadIdPack = useCallback(async () => {
    try {
      await Mod?.androidTriggerOfflineModelDownload?.({ locale: "id-ID" });
    } catch {}
  }, []);

  return { available: !!Mod, listening, start, stop, downloadIdPack };
}
