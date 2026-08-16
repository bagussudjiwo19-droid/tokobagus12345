import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import { mikoBus, type MikoEvent, type MikoState } from "@/src/mikoBus";
import { KIOSK_SAY, KIOSK_TAP } from "@/components/Miko";

// ============================================================================
// MIKO RIG 2.5D — karakter Miko yang "hidup" untuk kios Cek Harga.
// Teknik: sprite frame-swap (ringan & stabil di Android) + transform Animated
// (bernapas, angguk, condong, lompat kecil). Mulut bergerak selaras TTS
// (mikoBus speak_start/speak_end), mata berkedip natural, dan ekspresi/gerak
// mengikuti konteks percakapan via event `miko_state`.
// Aset frame konsisten (satu karakter) di assets/miko_rig/.
// ============================================================================

const F: Record<string, any> = {
  base: require("../assets/miko_rig/base.png"),
  blink: require("../assets/miko_rig/blink.png"),
  talk_mid: require("../assets/miko_rig/talk_mid.png"),
  talk_open: require("../assets/miko_rig/talk_open.png"),
  happy: require("../assets/miko_rig/happy.png"),
  laugh: require("../assets/miko_rig/laugh.png"),
  thinking: require("../assets/miko_rig/thinking.png"),
  confused: require("../assets/miko_rig/confused.png"),
  sad: require("../assets/miko_rig/sad.png"),
  surprised: require("../assets/miko_rig/surprised.png"),
  point: require("../assets/miko_rig/point.png"),
  sales: require("../assets/miko_rig/sales.png"),
  mischief: require("../assets/miko_rig/mischief.png"),
  sleepy: require("../assets/miko_rig/sleepy.png"),
  warm: require("../assets/miko_rig/warm.png"),
};

// Frame istirahat (diam) untuk tiap state.
const REST: Record<MikoState, string> = {
  IDLE: "base", TALK: "base", THINKING: "thinking", HAPPY: "happy",
  CONFUSED: "confused", SAD: "sad", SURPRISED: "surprised", LAUGH: "laugh",
  POINT: "point", SALES_EXPLAIN: "sales",
  MISCHIEF: "mischief", SLEEPY: "sleepy", WARM: "warm",
};

// Urutan buka-tutup mulut saat bicara (mulut netral, ramah, tetap on-model).
const FLAP = ["base", "talk_mid", "talk_open", "talk_mid"];

const RIG_RATIO = 168 / 216;

export default function MikoRig({ size = 216, ambient = true, initial = "IDLE" }: { size?: number; ambient?: boolean; initial?: MikoState }) {
  const imgH = size;
  const imgW = Math.round(size * RIG_RATIO);
  const [frame, setFrame] = useState<string>(REST[initial]);
  const [msg, setMsg] = useState("");
  const [showBubble, setShowBubble] = useState(false);

  // State & flag terkini disimpan di ref agar timer/callback tak "basi".
  const stateRef = useRef<MikoState>(initial);
  const talkingRef = useRef(false);
  const frameRef = useRef(REST[initial]);
  const setF = (f: string) => { frameRef.current = f; setFrame(f); };
  // Ganti frame ISTIRAHAT (ekspresi) dengan transisi lembut: redup → tukar → terang.
  const transitionTo = (f: string) => {
    if (frameRef.current === f) return;
    Animated.timing(fade, { toValue: 0.2, duration: 110, useNativeDriver: true }).start(() => {
      setF(f);
      Animated.timing(fade, { toValue: 1, duration: 190, useNativeDriver: true }).start();
    });
  };

  // Transform (semua native driver → mulus & ringan).
  const bob = useRef(new Animated.Value(0)).current;   // napas naik-turun
  const tilt = useRef(new Animated.Value(0)).current;  // angguk/miring kepala
  const sway = useRef(new Animated.Value(0)).current;   // geser kiri-kanan (sales)
  const pop = useRef(new Animated.Value(1)).current;    // pop kaget / masuk
  const fade = useRef(new Animated.Value(1)).current;   // transisi halus antar-ekspresi
  const lift = useRef(new Animated.Value(0)).current;   // mundur/naik (kaget)
  const bubbleA = useRef(new Animated.Value(0)).current;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flapTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const accentTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const talkSafety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiltAnim = useRef<Animated.CompositeAnimation | null>(null);
  const swayAnim = useRef<Animated.CompositeAnimation | null>(null);

  const pushT = (t: ReturnType<typeof setTimeout>) => timers.current.push(t);

  // -------- Napas: loop halus selamanya --------
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bob]);

  // -------- Kedip mata natural (hanya saat tidak bicara) --------
  const scheduleBlink = () => {
    if (blinkTimer.current) clearTimeout(blinkTimer.current);
    const wait = 2200 + Math.random() * 3200;
    blinkTimer.current = setTimeout(() => {
      const restFrame = REST[stateRef.current];
      // Jangan kedip saat bicara, atau saat frame sudah mata-tertutup (laugh).
      if (!talkingRef.current && frameRef.current === restFrame && restFrame !== "laugh") {
        setF("blink");
        pushT(setTimeout(() => { if (!talkingRef.current) setF(REST[stateRef.current]); }, 130));
      }
      scheduleBlink();
    }, wait);
  };

  // -------- Gerak tubuh sesuai state --------
  const stopTilt = () => { tiltAnim.current?.stop(); Animated.spring(tilt, { toValue: 0, useNativeDriver: true, friction: 6 }).start(); };
  const stopSway = () => { swayAnim.current?.stop(); Animated.spring(sway, { toValue: 0, useNativeDriver: true, friction: 6 }).start(); };

  const applyMotion = (s: MikoState) => {
    stopTilt(); stopSway();
    if (s === "THINKING" || s === "CONFUSED") {
      tiltAnim.current = Animated.loop(Animated.sequence([
        Animated.timing(tilt, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(tilt, { toValue: -0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      tiltAnim.current.start();
    } else if (s === "SALES_EXPLAIN") {
      swayAnim.current = Animated.loop(Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      swayAnim.current.start();
    } else if (s === "POINT") {
      Animated.spring(sway, { toValue: 0.7, useNativeDriver: true, friction: 5 }).start();
    } else if (s === "SURPRISED") {
      lift.setValue(0); pop.setValue(1);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(lift, { toValue: 1, duration: 140, useNativeDriver: true }),
          Animated.spring(pop, { toValue: 1.08, useNativeDriver: true, friction: 4 }),
        ]),
        Animated.parallel([
          Animated.timing(lift, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }),
        ]),
      ]).start();
    } else if (s === "HAPPY" || s === "LAUGH") {
      // lompatan kecil ceria
      lift.setValue(0);
      Animated.sequence([
        Animated.spring(lift, { toValue: 1.2, useNativeDriver: true, friction: 4 }),
        Animated.spring(lift, { toValue: 0, useNativeDriver: true, friction: 5 }),
      ]).start();
    }
  };

  // -------- Ganti state --------
  const goState = (s: MikoState) => {
    stateRef.current = s;
    // pop kecil saat berganti ekspresi (kecuali kaget yang punya animasi sendiri)
    if (s !== "SURPRISED") {
      pop.setValue(0.92);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    }
    applyMotion(s);
    if (!talkingRef.current) transitionTo(REST[s]);
  };

  // -------- Bicara: mulut bergerak + aksen ekspresi --------
  const startTalk = (ms?: number) => {
    talkingRef.current = true;
    if (flapTimer.current) clearInterval(flapTimer.current);
    if (accentTimer.current) clearInterval(accentTimer.current);
    let i = 0;
    let accentUntil = 0;
    flapTimer.current = setInterval(() => {
      if (Date.now() < accentUntil) return; // sedang menahan aksen ekspresi
      i = (i + 1) % FLAP.length;
      setF(FLAP[i]);
    }, 150);
    // Sisipkan pose ekspresi (aksen) sesekali agar terasa "bercerita".
    const s = stateRef.current;
    const accent = REST[s] === "base" ? "happy" : REST[s];
    const accentEvery = s === "LAUGH" ? 900 : 1500;
    accentTimer.current = setInterval(() => {
      const hold = s === "LAUGH" ? 500 : 380;
      accentUntil = Date.now() + hold;
      setF(accent);
    }, accentEvery);
    // Pengaman: hentikan otomatis bila onDone tak terpanggil (mis. web).
    if (talkSafety.current) clearTimeout(talkSafety.current);
    talkSafety.current = setTimeout(() => stopTalk(), (ms || 4000) + 600);
  };

  const stopTalk = () => {
    talkingRef.current = false;
    if (flapTimer.current) { clearInterval(flapTimer.current); flapTimer.current = null; }
    if (accentTimer.current) { clearInterval(accentTimer.current); accentTimer.current = null; }
    if (talkSafety.current) { clearTimeout(talkSafety.current); talkSafety.current = null; }
    setF(REST[stateRef.current]);
    scheduleBlink();
  };

  // -------- Balon teks --------
  const bubble = (text: string, holdMs = 6500) => {
    setMsg(text); setShowBubble(true);
    Animated.spring(bubbleA, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    pushT(setTimeout(() => {
      Animated.timing(bubbleA, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => setShowBubble(false));
    }, holdMs));
  };

  // -------- Dengarkan event global --------
  useEffect(() => {
    scheduleBlink();
    applyMotion(stateRef.current); // mulai gerak sesuai state awal
    const off = mikoBus.on((e: MikoEvent) => {
      if (e.type === "miko_state") { goState(e.state); return; }
      if (e.type === "speak_start") { startTalk(e.ms); return; }
      if (e.type === "speak_end") { stopTalk(); return; }
      if (e.type === "say") { bubble(e.text); if (e.pose === "surprised") goState("SURPRISED"); return; }
      if (e.type === "price_found") { goState("POINT"); return; }
      if (e.type === "not_found") {
        goState("SAD");
        pushT(setTimeout(() => { if (!talkingRef.current) goState("WARM"); }, 1600));
        return;
      }
    });
    return () => {
      off();
      timers.current.forEach(clearTimeout); timers.current = [];
      if (flapTimer.current) clearInterval(flapTimer.current);
      if (accentTimer.current) clearInterval(accentTimer.current);
      if (blinkTimer.current) clearTimeout(blinkTimer.current);
      if (talkSafety.current) clearTimeout(talkSafety.current);
      tiltAnim.current?.stop(); swayAnim.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Obrolan ambient kios (teks saja) + ganti ekspresi lembut --------
  const kioskI = useRef(-1);
  useEffect(() => {
    if (!ambient) return;
    const sayId = setInterval(() => {
      if (talkingRef.current || showBubble) return;
      let i = Math.floor(Math.random() * KIOSK_SAY.length);
      if (i === kioskI.current) i = (i + 1) % KIOSK_SAY.length;
      kioskI.current = i;
      bubble(KIOSK_SAY[i], 6000);
    }, 12000);
    const exprId = setInterval(() => {
      if (talkingRef.current) return;
      // Hanya berganti "bahasa wajah" saat sedang santai/idle (bukan state percakapan).
      const idleish: MikoState[] = ["IDLE", "WARM", "HAPPY", "THINKING", "MISCHIEF", "SLEEPY"];
      if (!idleish.includes(stateRef.current)) return;
      // Pilih ekspresi idle berikutnya (acak, tidak sama dgn sekarang). Mengantuk & usil jarang.
      const pool: MikoState[] = ["IDLE", "WARM", "HAPPY", "WARM", "THINKING", "IDLE", "MISCHIEF", "WARM", "SLEEPY", "HAPPY"];
      let next = pool[Math.floor(Math.random() * pool.length)];
      if (next === stateRef.current) next = "IDLE";
      goState(next);
    }, 4500);
    return () => { clearInterval(sayId); clearInterval(exprId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBubble, ambient]);

  // -------- Tap oleh pelanggan --------
  const tapI = useRef(-1);
  const onTap = () => {
    goState("HAPPY");
    pushT(setTimeout(() => { if (!talkingRef.current) goState("IDLE"); }, 1800));
    if (!ambient) return;
    let i = Math.floor(Math.random() * KIOSK_TAP.length);
    if (i === tapI.current) i = (i + 1) % KIOSK_TAP.length;
    tapI.current = i;
    bubble(KIOSK_TAP[i].t, 4500);
  };

  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [3, -4] });
  const liftY = lift.interpolate({ inputRange: [0, 1.2], outputRange: [0, -22] });
  const tiltDeg = tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-7deg", "9deg"] });
  const swayX = sway.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {showBubble && !!msg && (
        <Animated.View style={[styles.bubble, { bottom: imgH - 14, opacity: bubbleA, transform: [{ scale: bubbleA }] }]}>
          <Text style={styles.bubbleTxt}>{msg}</Text>
          <View style={styles.tail} />
        </Animated.View>
      )}
      <Pressable onPress={onTap} hitSlop={14} testID="miko-rig">
        <Animated.View
          style={{
            opacity: fade,
            transform: [
              { translateX: swayX },
              { translateY: Animated.add(bobY, liftY) },
              { rotate: tiltDeg },
              { scale: pop },
            ],
          }}
        >
          <Image source={F[frame] || F.base} style={{ width: imgW, height: imgH }} resizeMode="contain" />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "flex-end" },
  bubble: {
    position: "absolute", alignSelf: "center", minWidth: 160, maxWidth: 290,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1.5,
    borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    shadowColor: colors.brand, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 8, zIndex: 5,
  },
  bubbleTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.sm, textAlign: "center", lineHeight: 19 },
  tail: {
    position: "absolute", bottom: -7, left: "50%", marginLeft: -6, width: 12, height: 12,
    backgroundColor: colors.surfaceSecondary, borderRightWidth: 1.5, borderBottomWidth: 1.5,
    borderColor: colors.borderStrong, transform: [{ rotate: "45deg" }],
  },
});
