import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import { useCart } from "@/src/cart";
import { mikoBus, type MikoEvent } from "@/src/mikoBus";
import { terbilang } from "@/src/voice";

// ============================================================================
// Miko 🐱 — maskot kasir tunggal, mungil, di sudut & BISA DISERET (posisi
// diingat). Paham konteks, kalem (jarang bicara), animasi ringan.
// ============================================================================

const POSES: Record<string, any> = {
  happy: require("../assets/mascot/miko_happy.png"), wave: require("../assets/mascot/miko_wave.png"),
  surprised: require("../assets/mascot/miko_surprised.png"), love: require("../assets/mascot/miko_love.png"),
  wink: require("../assets/mascot/miko_wink.png"), money: require("../assets/mascot/miko_money.png"),
  sleepy: require("../assets/mascot/miko_sleepy.png"), thumbsup: require("../assets/mascot/miko_thumbsup.png"),
  thinking: require("../assets/mascot/miko_thinking.png"), calc: require("../assets/mascot/miko_calc.png"),
  receipt: require("../assets/mascot/miko_receipt.png"), tea: require("../assets/mascot/miko_tea.png"),
  shy: require("../assets/mascot/miko_shy.png"), hearts: require("../assets/mascot/miko_hearts.png"),
  idea: require("../assets/mascot/miko_idea.png"), pray: require("../assets/mascot/miko_pray.png"),
  promo: require("../assets/mascot/miko_promo.png"), ok: require("../assets/mascot/miko_ok.png"),
  cry: require("../assets/mascot/miko_cry.png"), star: require("../assets/mascot/miko_star.png"),
};

const SIZE = 60;
const POS_KEY = "mascot_pos_v2";
type Line = { t: string; p: string };
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const OPEN: Line[] = [
  { t: "Siap bantu, Kak! 😊", p: "wave" }, { t: "Selamat datang kembali, Kak!", p: "happy" },
  { t: "Miko siap menemani hari ini!", p: "thumbsup" }, { t: "Yuk, mulai transaksi!", p: "wave" },
  { t: "Semoga jualannya lancar hari ini! 🍀", p: "pray" },
];
const ITEM: Line[] = [
  { t: "Sip, barang masuk! 🎉", p: "wave" }, { t: "Barcode terbaca 😺", p: "thumbsup" },
  { t: "Satu lagi masuk keranjang! 🛍️", p: "happy" }, { t: "Barang berhasil ditambahkan.", p: "ok" },
];
const BIG: Line[] = [{ t: "Wah, belanjaannya banyak! 🤑", p: "money" }, { t: "Cuan besar hari ini! 💰", p: "money" }];
const EMPTY: Line[] = [{ t: "Keranjang kosong, siap lagi! ✨", p: "wave" }];
const NF: Line[] = [
  { t: "Hmm, barangnya belum ketemu 🤔", p: "surprised" }, { t: "Coba cek lagi barcode-nya, Kak.", p: "thinking" },
  { t: "Barangnya belum terdaftar.", p: "surprised" },
];
const PAY: Line[] = [{ t: "Transaksi berhasil! 🎉", p: "love" }, { t: "Selesai! Terima kasih 😊", p: "hearts" }, { t: "Pembayaran beres, Kak!", p: "thumbsup" }];
const POK: Line[] = [{ t: "Struk sudah dicetak ✅", p: "receipt" }];
const PF: Line[] = [{ t: "Printer belum siap, cek koneksinya ya Kak.", p: "surprised" }];
const CHEER: Line[] = [
  { t: "Nyaa~ 💕", p: "hearts" }, { t: "Kamu hebat, Kak! 🎉", p: "thumbsup" }, { t: "Semangaaat! 🐾", p: "wave" },
  { t: "Aku sayang kamu~ 😽", p: "love" }, { t: "Cie rajin banget 😸", p: "wink" }, { t: "Peluk dulu 🤗", p: "hearts" },
];
const SEPI: Line[] = [
  { t: "Santai dulu, Kak. Miko tetap siap 😊", p: "tea" }, { t: "Sepi ya... tapi semangat jangan ikut sepi 😊", p: "happy" },
  { t: "Miko nemenin dulu ya, Kak.", p: "love" }, { t: "Pelanggan bisa datang kapan saja, tenang 🍀", p: "pray" },
  { t: "Toko sepi bukan berarti rezeki berhenti.", p: "star" }, { t: "Istirahat boleh, menyerah jangan 💪", p: "thumbsup" },
  { t: "Jangan lupa minum ya, Kak 💧", p: "tea" }, { t: "Miko di sini kok, Kakak nggak sendirian 🐾", p: "happy" },
  { t: "Semoga sebentar lagi ramai lagi ✨", p: "idea" }, { t: "Senyum dulu, biar rezeki lancar 😊", p: "wink" },
];

function timeGreet(): Line {
  const h = new Date().getHours();
  const t =
    h < 11 ? "Selamat pagi, Kak! ☀️"
    : h < 15 ? "Selamat siang, Kak! 🌞"
    : h < 18 ? "Selamat sore, Kak! 🌤️"
    : "Selamat malam, Kak! 🌙";
  return { t, p: "wave" };
}

function greet(path: string): Line {
  if (path.includes("checkout")) return { t: "Yuk lanjut pembayaran, Kak 💗", p: "money" };
  if (path.includes("produk")) return { t: "Yuk rapikan produkmu~ 🐾", p: "happy" };
  if (path.includes("cek-harga")) return { t: "Mau cek harga? Scan aja 🔍", p: "wink" };
  if (path.includes("riwayat")) return { t: "Lihat cuan hari ini yuk! 💰", p: "money" };
  // Layar utama (Transaksi/lainnya): sapaan sesuai waktu, sesekali sapaan lain.
  return Math.random() < 0.7 ? timeGreet() : rnd(OPEN);
}

export default function Miko() {
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const [pose, setPose] = useState("happy");
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);

  const bob = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const bubbleA = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const posRef = useRef({ x: 0, y: 0 });
  const prevCount = useRef(cart.count);
  const lastActive = useRef(Date.now());
  const lastIdx = useRef<Record<string, number>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pickRot = (key: string, arr: Line[]) => {
    if (arr.length === 1) return arr[0];
    let i = Math.floor(Math.random() * arr.length);
    if (i === lastIdx.current[key]) i = (i + 1) % arr.length;
    lastIdx.current[key] = i;
    return arr[i];
  };

  const say = (line: Line, holdMs = 2800) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    lastActive.current = Date.now();
    setMsg(line.t); setPose(line.p); setShow(true);
    Animated.spring(bubbleA, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.14, duration: 150, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    timers.current.push(setTimeout(() => {
      Animated.timing(bubbleA, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => setShow(false));
    }, holdMs));
    timers.current.push(setTimeout(() => setPose("happy"), holdMs));
  };

  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((v) => {
      if (v) { try { const p = JSON.parse(v); posRef.current = p; pan.setValue(p); } catch { /* */ } }
    });
    Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    return () => { timers.current.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => { pan.setOffset(posRef.current); pan.setValue({ x: 0, y: 0 }); },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        posRef.current = { x: posRef.current.x + g.dx, y: posRef.current.y + g.dy };
        AsyncStorage.setItem(POS_KEY, JSON.stringify(posRef.current)).catch(() => {});
      },
    }),
  ).current;

  useEffect(() => {
    say(greet(pathname || ""), 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const c = cart.count;
    if (c > prevCount.current) say(cart.total >= 100000 ? pickRot("big", BIG) : pickRot("item", ITEM), 2400);
    else if (c === 0 && prevCount.current > 0) say(pickRot("empty", EMPTY), 2200);
    prevCount.current = c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.count, cart.total]);

  useEffect(() => {
    const off = mikoBus.on((e: MikoEvent) => {
      lastActive.current = Date.now();
      if (e.type === "not_found") say(pickRot("nf", NF), 2800);
      else if (e.type === "pay_ok") say(pickRot("pay", PAY), 2600);
      else if (e.type === "change") say({ t: `Kembaliannya ${terbilang(e.amount).trim()} rupiah ya, Kak 💰`, p: "money" }, 3400);
      else if (e.type === "print_ok") say(pickRot("pok", POK), 2400);
      else if (e.type === "print_fail") say(pickRot("pf", PF), 3000);
      else if (e.type === "price_changed") say({ t: "Harga berhasil diperbarui ✅", p: "calc" }, 2400);
      else if (e.type === "backup_ok") say({ t: "Data berhasil dicadangkan 💾", p: "thumbsup" }, 2600);
      else if (e.type === "restore_ok") say({ t: "Data berhasil dipulihkan! 🎉", p: "love" }, 2600);
      else if (e.type === "low_stock") say({ t: "Stok barang ini menipis, jangan lupa restok ya 📦", p: "surprised" }, 3000);
      else if (e.type === "error") say({ t: "Ada kendala sedikit, coba lagi ya Kak.", p: "surprised" }, 2800);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // kalem: hanya bila idle > 45 detik
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastActive.current > 45000) say(pickRot("sepi", SEPI), 3400);
    }, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        {...responder.panHandlers}
        style={[styles.wrap, { bottom: insets.bottom + 138, transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
        pointerEvents="box-none"
      >
        {show && !!msg && (
          <Animated.View style={[styles.bubble, { opacity: bubbleA, transform: [{ scale: bubbleA }] }]}>
            <Text style={styles.bubbleTxt}>{msg}</Text>
            <View style={styles.tail} />
          </Animated.View>
        )}
        <Pressable onPress={() => say(pickRot("cheer", CHEER), 2200)} hitSlop={8}>
          <Animated.View style={{ transform: [{ translateY: bobY }, { scale: pop }] }}>
            <Image source={POSES[pose] || POSES.happy} style={styles.img} resizeMode="contain" />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 8, width: SIZE, alignItems: "flex-end", zIndex: 60 },
  img: { width: SIZE, height: SIZE },
  bubble: { position: "absolute", bottom: SIZE - 8, right: 0, minWidth: 120, maxWidth: 200, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, shadowColor: colors.brand, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  bubbleTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.sm, textAlign: "center", lineHeight: 18 },
  tail: { position: "absolute", bottom: -7, right: 22, width: 12, height: 12, backgroundColor: colors.surfaceSecondary, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.borderStrong, transform: [{ rotate: "45deg" }] },
});
