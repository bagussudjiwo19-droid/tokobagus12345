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
// Miko 🐱 + Momo 🐶 — dua maskot kasir yang bisa DISERET, saling ngobrol /
// debat lucu / curhat, dan menyapa Kakak sesuai kondisi aplikasi. Kalem (jarang
// bicara), animasi ringan. Posisi seret diingat (AsyncStorage).
// ============================================================================

const MIKO: Record<string, any> = {
  happy: require("../assets/mascot/miko_happy.png"), wave: require("../assets/mascot/miko_wave.png"),
  surprised: require("../assets/mascot/miko_surprised.png"), love: require("../assets/mascot/miko_love.png"),
  wink: require("../assets/mascot/miko_wink.png"), money: require("../assets/mascot/miko_money.png"),
  sleepy: require("../assets/mascot/miko_sleepy.png"), thumbsup: require("../assets/mascot/miko_thumbsup.png"),
  thinking: require("../assets/mascot/miko_thinking.png"), calc: require("../assets/mascot/miko_calc.png"),
  receipt: require("../assets/mascot/miko_receipt.png"), tea: require("../assets/mascot/miko_tea.png"),
  deepsleep: require("../assets/mascot/miko_deepsleep.png"), shy: require("../assets/mascot/miko_shy.png"),
  hearts: require("../assets/mascot/miko_hearts.png"), dance: require("../assets/mascot/miko_dance.png"),
  snack: require("../assets/mascot/miko_snack.png"), bag: require("../assets/mascot/miko_bag.png"),
  bye: require("../assets/mascot/miko_bye.png"), idea: require("../assets/mascot/miko_idea.png"),
  pray: require("../assets/mascot/miko_pray.png"), promo: require("../assets/mascot/miko_promo.png"),
  ok: require("../assets/mascot/miko_ok.png"), cry: require("../assets/mascot/miko_cry.png"),
  pout: require("../assets/mascot/miko_pout.png"), phone: require("../assets/mascot/miko_phone.png"),
  star: require("../assets/mascot/miko_star.png"), hug: require("../assets/mascot/miko_hug.png"),
};
const MOMO: Record<string, any> = {
  happy: require("../assets/mascot/momo_happy.png"), wave: require("../assets/mascot/momo_wave.png"),
  laugh: require("../assets/mascot/momo_laugh.png"), tease: require("../assets/mascot/momo_tease.png"),
  think: require("../assets/mascot/momo_think.png"), love: require("../assets/mascot/momo_love.png"),
  surprised: require("../assets/mascot/momo_surprised.png"), money: require("../assets/mascot/momo_money.png"),
};

const SIZE = 74;
const POS_KEY = "mascot_pos_v1";
type Turn = { who: "miko" | "momo"; text: string; pose: string };
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---- Dialog santai (giliran) ----
const DIALOGUES: Turn[][] = [
  [{ who: "miko", text: "Momo, hari ini semangat ya! 😺", pose: "wave" }, { who: "momo", text: "Siap, Kak Miko! Momo jaga toko 🐶", pose: "happy" }],
  [{ who: "momo", text: "Miko, kamu ngantuk ya? 😝", pose: "tease" }, { who: "miko", text: "Dikit... tapi demi Kakak, melek terus! 😸", pose: "sleepy" }],
  [{ who: "miko", text: "Momo jangan usil dong 😅", pose: "pout" }, { who: "momo", text: "Hehe, biar Kakak senyum 😜", pose: "laugh" }],
  [{ who: "momo", text: "Kalau sepi enaknya ngapain, Kak?", pose: "think" }, { who: "miko", text: "Berdoa semoga pelanggan datang 🙏", pose: "pray" }],
  [{ who: "miko", text: "Kak, jangan lupa senyum ke pelanggan 😊", pose: "happy" }, { who: "momo", text: "Betul! Senyum itu gratis 🐾", pose: "wave" }],
  [{ who: "momo", text: "Aku laper... 🥺", pose: "surprised" }, { who: "miko", text: "Sabar Momo, jaga toko dulu 😅", pose: "snack" }],
  [{ who: "miko", text: "Momo, tadi salah hitung ya? 🤨", pose: "thinking" }, { who: "momo", text: "Eh iya... maaf, Kak. Momo ulang! 😅", pose: "surprised" }],
  [{ who: "miko", text: "Rezeki hari ini semoga lancar, Kak 🍀", pose: "pray" }, { who: "momo", text: "Aamiin! Momo ikut berdoa 🐶", pose: "love" }],
  [{ who: "momo", text: "Kak Miko cantik deh hari ini ✨", pose: "love" }, { who: "miko", text: "Ih Momo, gombal 😳", pose: "shy" }],
  [{ who: "miko", text: "Capek boleh, nyerah jangan ya Kak 💪", pose: "thumbsup" }, { who: "momo", text: "Yee semangat! Kita temani terus 🐾", pose: "happy" }],
  [{ who: "momo", text: "Miko, ada ide biar laris?", pose: "think" }, { who: "miko", text: "Layani ramah + senyum. Dijamin balik lagi! 💡", pose: "idea" }],
  [{ who: "miko", text: "Kak, minum dulu ya, jaga kesehatan 💗", pose: "tea" }, { who: "momo", text: "Iya Kak, jangan lupa istirahat 🐶", pose: "happy" }],
];
const G = { // sapaan per layar (giliran)
  home: [{ who: "miko", text: "Halo Kak! Miko & Momo siap bantu 😺", pose: "wave" }, { who: "momo", text: "Yuk mulai transaksi! 🐶", pose: "happy" }] as Turn[],
};
const ITEM: Turn[][] = [
  [{ who: "miko", text: "Sip, barang masuk! 🎉", pose: "wave" }, { who: "momo", text: "Tambah lagi Kak? 🐾", pose: "happy" }],
  [{ who: "miko", text: "Barcode terbaca 😺", pose: "thumbsup" }],
  [{ who: "momo", text: "Satu lagi masuk keranjang! 🛍️", pose: "happy" }],
];
const BIG: Turn[][] = [[{ who: "miko", text: "Wah belanjaannya banyak! 🤑", pose: "money" }, { who: "momo", text: "Rezeki nih, Kak! 💰", pose: "money" }]];
const EMPTY: Turn[][] = [[{ who: "momo", text: "Keranjang kosong, siap lagi! ✨", pose: "wave" }]];
const NF: Turn[][] = [[{ who: "miko", text: "Hmm, barangnya belum ketemu 🤔", pose: "surprised" }, { who: "momo", text: "Cek lagi barcode-nya ya, Kak 🐶", pose: "think" }]];
const PAY: Turn[][] = [[{ who: "miko", text: "Transaksi berhasil! 🎉", pose: "love" }, { who: "momo", text: "Terima kasih, Kak! 🐾", pose: "happy" }]];
const POK: Turn[][] = [[{ who: "miko", text: "Struk sudah dicetak ✅", pose: "receipt" }]];
const PF: Turn[][] = [[{ who: "momo", text: "Printer belum siap, cek koneksinya ya Kak 🐶", pose: "surprised" }]];
const CHEER: Turn[][] = [
  [{ who: "miko", text: "Nyaa~ 💕", pose: "hearts" }], [{ who: "momo", text: "Guk! Semangat Kak! 🐾", pose: "laugh" }],
  [{ who: "miko", text: "Kamu hebat, Kak! 🎉", pose: "thumbsup" }], [{ who: "momo", text: "Peluk dulu 🤗", pose: "love" }],
];

function greet(path: string): Turn[] {
  if (path.includes("checkout")) return [{ who: "miko", text: "Yuk lanjut pembayaran, Kak 💗", pose: "money" }];
  if (path.includes("produk")) return [{ who: "momo", text: "Rapikan produk yuk, Kak 🐾", pose: "happy" }];
  if (path.includes("cek-harga")) return [{ who: "miko", text: "Mau cek harga? Scan aja 🔍", pose: "wink" }];
  if (path.includes("riwayat")) return [{ who: "momo", text: "Lihat cuan hari ini yuk! 💰", pose: "money" }];
  return G.home;
}

export default function Mascots() {
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const [mk, setMk] = useState({ pose: "happy", msg: "", show: false });
  const [mo, setMo] = useState({ pose: "happy", msg: "", show: false });

  const bob = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const posRef = useRef({ x: 0, y: 0 });
  const prevCount = useRef(cart.count);
  const lastActive = useRef(Date.now());
  const playing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Jalankan percakapan bergiliran.
  const run = (turns: Turn[]) => {
    if (playing.current) return;
    playing.current = true;
    lastActive.current = Date.now();
    clearTimers();
    let t = 0;
    turns.forEach((turn, i) => {
      timers.current.push(setTimeout(() => {
        if (turn.who === "miko") { setMk({ pose: turn.pose, msg: turn.text, show: true }); setMo((s) => ({ ...s, show: false })); }
        else { setMo({ pose: turn.pose, msg: turn.text, show: true }); setMk((s) => ({ ...s, show: false })); }
      }, t));
      t += 2600;
    });
    timers.current.push(setTimeout(() => {
      setMk((s) => ({ ...s, show: false })); setMo((s) => ({ ...s, show: false }));
      setMk((s) => ({ ...s, pose: "happy" })); setMo((s) => ({ ...s, pose: "happy" }));
      playing.current = false;
    }, t + 200));
  };

  // Muat posisi seret tersimpan.
  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((v) => {
      if (v) { try { const p = JSON.parse(v); posRef.current = p; pan.setValue(p); } catch { /* */ } }
    });
    Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seret (tahan lalu geser). Tap tetap diteruskan ke tombol cheer.
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

  // Sapaan pindah layar.
  useEffect(() => {
    run(greet(pathname || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Reaksi keranjang.
  useEffect(() => {
    const c = cart.count;
    if (c > prevCount.current) run(cart.total >= 100000 ? rnd(BIG) : rnd(ITEM));
    else if (c === 0 && prevCount.current > 0) run(rnd(EMPTY));
    prevCount.current = c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.count, cart.total]);

  // Kejadian dari layar lain.
  useEffect(() => {
    const off = mikoBus.on((e: MikoEvent) => {
      lastActive.current = Date.now();
      if (e.type === "not_found") run(rnd(NF));
      else if (e.type === "pay_ok") run(rnd(PAY));
      else if (e.type === "change") run([{ who: "miko", text: `Kembaliannya ${terbilang(e.amount).trim()} rupiah ya, Kak 💰`, pose: "money" }, { who: "momo", text: "Jangan lupa diberikan ke pelanggan ya 🐾", pose: "happy" }]);
      else if (e.type === "print_ok") run(rnd(POK));
      else if (e.type === "print_fail") run(rnd(PF));
      else if (e.type === "price_changed") run([{ who: "miko", text: "Harga berhasil diperbarui ✅", pose: "calc" }, { who: "momo", text: "Sip, dicatat! 🐾", pose: "happy" }]);
      else if (e.type === "backup_ok") run([{ who: "miko", text: "Data berhasil dicadangkan 💾", pose: "thumbsup" }, { who: "momo", text: "Aman, datanya tersimpan! 🐶", pose: "happy" }]);
      else if (e.type === "restore_ok") run([{ who: "momo", text: "Data berhasil dipulihkan! 🎉", pose: "wave" }, { who: "miko", text: "Semua kembali seperti semula 😺", pose: "love" }]);
      else if (e.type === "low_stock") run([{ who: "momo", text: "Eh, stok barang ini menipis, Kak! 🐶", pose: "surprised" }, { who: "miko", text: "Jangan lupa restok ya 📦", pose: "thinking" }]);
      else if (e.type === "error") run([{ who: "momo", text: "Ada kendala sedikit, coba lagi ya Kak 🐶", pose: "surprised" }]);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Obrolan santai — KALEM: hanya bila idle > 40 detik, jeda panjang.
  useEffect(() => {
    const id = setInterval(() => {
      if (!playing.current && Date.now() - lastActive.current > 40000) run(rnd(DIALOGUES));
    }, 20000);
    return () => { clearInterval(id); clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        {...responder.panHandlers}
        style={[styles.dock, { bottom: insets.bottom + 150, transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
        pointerEvents="box-none"
      >
        <Character data={mk} img={MIKO} bobY={bobY} onTap={() => run(rnd(CHEER))} />
        <Character data={mo} img={MOMO} bobY={bobY} onTap={() => run(rnd(CHEER))} />
      </Animated.View>
    </View>
  );
}

function Character({ data, img, bobY, onTap }: { data: { pose: string; msg: string; show: boolean }; img: Record<string, any>; bobY: any; onTap: () => void }) {
  const src = img[data.pose] || img.happy;
  return (
    <View style={styles.charWrap}>
      {data.show && !!data.msg && (
        <View style={styles.bubble}>
          <Text style={styles.bubbleTxt}>{data.msg}</Text>
          <View style={styles.tail} />
        </View>
      )}
      <Pressable onPress={onTap} hitSlop={6}>
        <Animated.View style={{ transform: [{ translateY: bobY }] }}>
          <Image source={src} style={styles.img} resizeMode="contain" />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", right: 6, flexDirection: "row", alignItems: "flex-end", gap: 2, zIndex: 60 },
  charWrap: { width: SIZE, alignItems: "center" },
  img: { width: SIZE, height: SIZE },
  bubble: { position: "absolute", bottom: SIZE - 12, minWidth: 110, maxWidth: 170, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, shadowColor: colors.brand, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  bubbleTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.sm, textAlign: "center", lineHeight: 18 },
  tail: { position: "absolute", bottom: -7, alignSelf: "center", width: 12, height: 12, backgroundColor: colors.surfaceSecondary, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.borderStrong, transform: [{ rotate: "45deg" }] },
});
