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
  { t: "Halo, Kak! Miko siap kerja. 👋", p: "wave" }, { t: "Selamat datang! Yuk mulai.", p: "happy" },
  { t: "Siap bantu, Kak! 😊", p: "wave" }, { t: "Miko siap menemani hari ini!", p: "thumbsup" },
  { t: "Yuk, mulai transaksi!", p: "wave" }, { t: "Semangat jualannya hari ini!", p: "star" },
  { t: "Semoga jualannya lancar hari ini! 🍀", p: "pray" }, { t: "Jangan lupa senyum, Kak. 😊", p: "wink" },
];
const ITEM: Line[] = [
  { t: "Masuk keranjang! 🛒", p: "wave" }, { t: "Sip, barangnya masuk!", p: "thumbsup" },
  { t: "Satu lagi, Kak!", p: "happy" }, { t: "Barang sudah ditambahkan.", p: "ok" },
  { t: "Keranjang bertambah nih!", p: "happy" }, { t: "Dapat! Barcode terbaca.", p: "wink" },
  { t: "Scan berhasil! 😺", p: "thumbsup" }, { t: "Tambah satu lagi!", p: "wave" },
];
const BIG: Line[] = [
  { t: "Wah, belanjaannya banyak! 🤑", p: "money" }, { t: "Wih, totalnya lumayan nih!", p: "money" },
  { t: "Hari ini ramai rezeki! 😄", p: "star" }, { t: "Keranjang penuh, Kak!", p: "happy" },
  { t: "Mantap, banyak belanja!", p: "thumbsup" },
];
const EMPTY: Line[] = [
  { t: "Keranjangnya masih kosong. ✨", p: "wave" }, { t: "Yuk mulai belanja!", p: "happy" },
  { t: "Miko siap menerima barang pertama.", p: "wave" }, { t: "Belum ada barang nih, Kak.", p: "thinking" },
  { t: "Ayo isi keranjang!", p: "wave" },
];
const NF: Line[] = [
  { t: "Hmm, barangnya belum ketemu. 🤔", p: "surprised" }, { t: "Barcode ini belum terdaftar.", p: "thinking" },
  { t: "Coba cek barcode-nya lagi.", p: "thinking" }, { t: "Miko belum menemukan barangnya.", p: "surprised" },
  { t: "Mungkin produknya belum ditambahkan.", p: "thinking" }, { t: "Coba scan lagi ya, Kak.", p: "surprised" },
];
const PAY: Line[] = [
  { t: "Yeay! Pembayaran berhasil! 🎉", p: "love" }, { t: "Transaksi selesai, Kak!", p: "hearts" },
  { t: "Mantap! Berhasil dibayar!", p: "thumbsup" }, { t: "Selesai! Pelanggan siap pergi.", p: "happy" },
  { t: "Transaksi sukses! 👍", p: "thumbsup" }, { t: "Uangnya sudah masuk, Kak.", p: "money" },
];
const POK: Line[] = [
  { t: "Struk sudah tercetak! 🧾", p: "receipt" }, { t: "Struknya siap, Kak.", p: "receipt" },
  { t: "Printer bekerja dengan baik.", p: "thumbsup" },
];
const PF: Line[] = [
  { t: "Hmm, printer belum siap.", p: "surprised" }, { t: "Coba cek koneksi printer ya, Kak.", p: "thinking" },
  { t: "Printer sepertinya terputus.", p: "surprised" }, { t: "Coba sambungkan printer lagi ya.", p: "thinking" },
];
const PRICE: Line[] = [
  { t: "Harga berhasil diperbarui! 💰", p: "calc" }, { t: "Sip, harga sudah disimpan.", p: "thumbsup" },
  { t: "Harga barunya sudah aktif.", p: "ok" }, { t: "Data harga sudah diperbarui.", p: "calc" },
  { t: "Berhasil, Kak!", p: "thumbsup" },
];
const BACKUP: Line[] = [
  { t: "Data berhasil dicadangkan. 💾", p: "thumbsup" }, { t: "Backup aman, Kak.", p: "ok" },
  { t: "Backup selesai! Data aman. 💾", p: "star" }, { t: "Berhasil dicadangkan!", p: "thumbsup" },
];
const RESTORE: Line[] = [
  { t: "Data berhasil dipulihkan! 🎉", p: "love" }, { t: "Tenang, data sudah aman.", p: "happy" },
  { t: "Aman, datanya sudah tersimpan.", p: "ok" },
];
const LOW: Line[] = [
  { t: "Stoknya mulai menipis. 📦", p: "surprised" }, { t: "Kak, barang ini hampir habis.", p: "surprised" },
  { t: "Sepertinya waktunya restock.", p: "idea" }, { t: "Stok tinggal sedikit nih.", p: "thinking" },
  { t: "Jangan lupa pesan stok lagi.", p: "idea" },
];
const ERR: Line[] = [
  { t: "Koneksi sedang bermasalah.", p: "surprised" }, { t: "Coba lagi sebentar ya, Kak.", p: "thinking" },
  { t: "Ada kendala sedikit, coba lagi ya Kak.", p: "surprised" },
];
const SAVED: Line[] = [
  { t: "Produk berhasil disimpan!", p: "thumbsup" }, { t: "Sip, produk sudah masuk katalog.", p: "star" },
  { t: "Perubahannya sudah disimpan.", p: "ok" }, { t: "Produk sudah diperbarui.", p: "happy" },
];
const DELETED: Line[] = [
  { t: "Produk sudah dihapus.", p: "ok" }, { t: "Oke, datanya sudah dibersihkan.", p: "thumbsup" },
];
// Cek Harga berhasil menemukan produk — 20 variasi, dipilih bergantian.
const PRICE_FOUND: Line[] = [
  { t: "Ketemu, Kak! 😊", p: "happy" }, { t: "Harga sudah Miko temukan!", p: "star" },
  { t: "Ini dia harganya, Kak.", p: "calc" }, { t: "Sip, barangnya berhasil ditemukan!", p: "thumbsup" },
  { t: "Harga sudah siap dilihat.", p: "ok" }, { t: "Dapat! Produk ini ada datanya.", p: "wink" },
  { t: "Miko sudah menemukan produknya.", p: "happy" }, { t: "Nah, ini harga barangnya.", p: "idea" },
  { t: "Berhasil, Kak! Harga tampil.", p: "thumbsup" }, { t: "Harganya sudah ketemu. 👍", p: "thumbsup" },
  { t: "Scan berhasil! Ini informasinya.", p: "wink" }, { t: "Produk ditemukan dengan sukses!", p: "star" },
  { t: "Miko cek dulu... nah, ketemu!", p: "idea" }, { t: "Ini dia barang yang dicari.", p: "love" },
  { t: "Harga aman, Kak. 😄", p: "ok" }, { t: "Berhasil dicek! Silakan dilihat.", p: "happy" },
  { t: "Miko sudah siapkan informasinya.", p: "calc" }, { t: "Ketemu! Tinggal lihat harganya.", p: "wink" },
  { t: "Scan selesai, Kak! 😊", p: "happy" }, { t: "Sip! Harga produknya sudah muncul.", p: "thumbsup" },
];
const CHEER: Line[] = [
  { t: "Eh, Miko dipencet! 💕", p: "hearts" }, { t: "Iya, Kak? Miko di sini. 😄", p: "happy" },
  { t: "Ada yang mau dibicarakan?", p: "thinking" }, { t: "Miko siap menemani!", p: "wave" },
  { t: "Nyaa~ 💕", p: "hearts" }, { t: "Semangaaat! 🐾", p: "wave" },
  { t: "Kamu hebat, Kak! 🎉", p: "thumbsup" }, { t: "Aku sayang kamu~ 😽", p: "love" },
];
// Bila di-tap berkali-kali dalam waktu dekat — respons jenaka.
const CHEER_MULTI: Line[] = [
  { t: "Hehe, jangan pencet terus, Kak. 😆", p: "wink" }, { t: "Hehe, Miko dipanggil lagi. 😆", p: "shy" },
  { t: "Iya iya, Miko dengar kok!", p: "happy" }, { t: "Cie kangen Miko ya? 😸", p: "wink" },
];
const SEPI: Line[] = [
  { t: "Santai dulu, Kak. Miko tetap siap 😊", p: "tea" }, { t: "Sepi ya... tapi semangat jangan ikut sepi 😊", p: "happy" },
  { t: "Miko nemenin dulu ya, Kak.", p: "love" }, { t: "Pelanggan bisa datang kapan saja, tenang 🍀", p: "pray" },
  { t: "Toko sepi bukan berarti rezeki berhenti.", p: "star" }, { t: "Istirahat boleh, menyerah jangan 💪", p: "thumbsup" },
  { t: "Jangan lupa minum ya, Kak 💧", p: "tea" }, { t: "Miko di sini kok, Kakak nggak sendirian 🐾", p: "happy" },
  { t: "Semoga sebentar lagi ramai lagi ✨", p: "idea" }, { t: "Senyum dulu, biar rezeki lancar 😊", p: "wink" },
];

// Teman kerja hangat & menyenangkan — muncul sesekali saat kasir menganggur lama.
const WARM: Line[] = [
  { t: "Hai, Kak! Miko di sini. 😊", p: "wave" },
  { t: "Halo, Kak! Hari ini kita jualan bareng lagi.", p: "happy" },
  { t: "Pagi, Kak! Semangat cari rezeki hari ini!", p: "wave" },
  { t: "Siang, Kak! Jangan lupa minum ya.", p: "tea" },
  { t: "Sore, Kak! Masih semangat?", p: "happy" },
  { t: "Miko lihat Kakak rajin banget hari ini.", p: "star" },
  { t: "Kak, senyum dulu dong. 😄", p: "wink" },
  { t: "Miko senang kalau Kakak semangat.", p: "love" },
  { t: "Tenang Kak, Miko siap bantu.", p: "thumbsup" },
  { t: "Hari ini kelihatannya bakal ramai nih.", p: "idea" },
  { t: "Miko sudah siap, Kak. Pelanggan berikutnya mana nih? 😆", p: "wink" },
  { t: "Kak, jangan serius terus. Nanti Miko ikut tegang. 😄", p: "shy" },
  { t: "Kalau capek, tarik napas sebentar ya, Kak.", p: "tea" },
  { t: "Miko temani sampai toko tutup.", p: "love" },
  { t: "Kita kerja santai, tapi tetap cepat.", p: "thumbsup" },
  { t: "Wah, Kakak makin jago jadi kasir.", p: "star" },
  { t: "Miko kasih jempol dulu buat Kakak! 👍", p: "thumbsup" },
  { t: "Semangat, Kak! Sedikit lagi, sedikit lagi.", p: "wave" },
  { t: "Pelanggan datang, Miko ikut senang!", p: "happy" },
  { t: "Kak, Miko punya firasat transaksi berikutnya bakal lancar.", p: "idea" },
  { t: "Jangan lupa senyum ke pelanggan ya, Kak. 😊", p: "wink" },
  { t: "Kalau pelanggan senang, Miko juga ikut senang.", p: "hearts" },
  { t: "Miko nggak bisa bantu angkat barang, tapi bisa nemenin. 😆", p: "shy" },
  { t: "Kak, hari ini sudah banyak transaksi. Hebat!", p: "money" },
  { t: "Miko bangga lihat Kakak tetap semangat.", p: "love" },
  { t: "Eh Kak, jangan ngantuk dulu. 😴", p: "sleepy" },
  { t: "Kalau toko mulai sepi, Miko siap jadi teman ngobrol.", p: "tea" },
  { t: "Miko penasaran, hari ini siapa yang belanja paling banyak ya?", p: "thinking" },
  { t: "Kak, jangan lupa istirahat kalau ada kesempatan.", p: "tea" },
  { t: "Semoga hari ini rezekinya deras, Kak! ❤️", p: "pray" },
];

// Humor ringan & situasional — porsi kecil, TIDAK muncul saat error serius,
// tidak mengganggu transaksi, dan tidak menyinggung.
const HUMOR: Line[] = [
  { t: "Kak, santai... barcode-nya nggak akan kabur kok. 😆", p: "wink" },
  { t: "Wah, pelanggan datang! Miko langsung melek. 👀", p: "surprised" },
  { t: "Kak, jangan lupa senyum, nanti Miko ikut senyum sendiri. 😄", p: "happy" },
  { t: "Barangnya sudah masuk. Dompet pelanggan mulai waspada. 😂", p: "money" },
  { t: "Wih, keranjangnya makin berat... tapi hati tetap ringan. 😆", p: "star" },
  { t: "Miko lihat totalnya... pura-pura nggak lihat deh. 😂", p: "shy" },
  { t: "Kak, kalau toko makin ramai, Miko minta bonus ya. 😜", p: "wink" },
  { t: "Scan lagi, Kak! Miko belum sempat kedip. 😆", p: "wink" },
  { t: "Barcode-nya malu-malu nih, scan sekali lagi. 😂", p: "shy" },
  { t: "Waduh, belanjaannya banyak. Troli aja mungkin perlu istirahat. 😄", p: "tea" },
  { t: "Kak, Miko siap kerja. Ngantuknya nanti dulu. 😴😂", p: "sleepy" },
  { t: "Kalau pelanggan terus datang begini, Miko bisa jadi karyawan teladan. 😎", p: "thumbsup" },
  { t: "Harga sudah ketemu. Miko nggak ikut nawar ya, Kak. 😂", p: "calc" },
  { t: "Transaksi sukses! Miko kasih jempol dulu. 👍😆", p: "thumbsup" },
  { t: "Sudah selesai, Kak. Sekarang tinggal tunggu pelanggan berikutnya... atau traktir Miko. 😜", p: "money" },
];

// Sapaan khusus layar Cek Harga (kios dinding — ditujukan ke PELANGGAN).
const CEK_HARGA_GREET: Line[] = [
  { t: "Halo, Kak! Scan barcode-nya di sini ya 🔍", p: "wave" },
  { t: "Mau cek harga? Tempelkan barcode-nya 😊", p: "happy" },
  { t: "Selamat datang! Yuk cek harga barang 🛍️", p: "wave" },
  { t: "Arahkan barcode ke kotak scan ya, Kak ✨", p: "wink" },
  { t: "Hai! Aku Miko, siap bantu cek harga 😺", p: "love" },
  { t: "Penasaran harganya? Scan aja, Kak! 🔍", p: "wink" },
  { t: "Yuk, dekatkan barcode-nya ke sini 📷", p: "happy" },
  { t: "Cek harga sendiri di sini, gratis kok! 😊", p: "thumbsup" },
  { t: "Ada yang mau ditanya harganya? Scan ya 💕", p: "hearts" },
  { t: "Halo Kakak cantik/ganteng! Scan dulu yuk 😸", p: "wink" },
];
// Ajakan saat kios menganggur — memanggil pelanggan yang lewat.
const CEK_HARGA_IDLE: Line[] = [
  { t: "Ada yang mau cek harga? Scan di sini ya 🔍", p: "wave" },
  { t: "Tempelkan barcode barang untuk lihat harga 😊", p: "happy" },
  { t: "Hai, Kak! Yuk cek harga sendiri di sini ✨", p: "wave" },
  { t: "Scan barcode-nya, harganya langsung muncul! 🐾", p: "wink" },
  { t: "Miko siap bantu cek harga, mendekat aja 💕", p: "love" },
  { t: "Mau tahu harganya? Scan aja ya, Kak! 😺", p: "happy" },
  { t: "Jangan malu, cek harganya di sini gratis 😊", p: "thumbsup" },
  { t: "Barcode-nya didekatkan ke kotak scan ya ✨", p: "idea" },
  { t: "Psst… harga barang bisa dicek sendiri lho 🔍", p: "wink" },
  { t: "Yuk mampir, cek harga dulu sama Miko 🐾", p: "wave" },
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
  if (path.includes("cek-harga")) return rnd(CEK_HARGA_GREET);
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
  const idleGap = useRef(60000);
  const tapTimes = useRef<number[]>([]);
  const pathRef = useRef(pathname);
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
    pathRef.current = pathname;
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
      else if (e.type === "price_changed") say(pickRot("price", PRICE), 2400);
      else if (e.type === "backup_ok") say(pickRot("backup", BACKUP), 2600);
      else if (e.type === "restore_ok") say(pickRot("restore", RESTORE), 2600);
      else if (e.type === "low_stock") say(pickRot("low", LOW), 3000);
      else if (e.type === "price_found") say(pickRot("pricef", PRICE_FOUND), 3000);
      else if (e.type === "product_saved") say(pickRot("saved", SAVED), 2400);
      else if (e.type === "product_deleted") say(pickRot("deleted", DELETED), 2400);
      else if (e.type === "say") say({ t: e.text, p: e.pose || "surprised" }, 3400);
      else if (e.type === "error") say(pickRot("err", ERR), 2800);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sapaan menganggur. Miko boleh menemani tanpa menunggu transaksi, TAPI:
  // - Kios (Cek Harga): sering & mengajak pelanggan.
  // - Layar kerja lain: hanya setelah kasir benar-benar diam lama (jeda panjang
  //   & acak, 60–105 dtk) supaya tidak spam. Humor porsinya kecil.
  // - JANGAN menyapa saat di layar pembayaran (checkout) — prioritas kerja kasir.
  useEffect(() => {
    const id = setInterval(() => {
      const p = pathRef.current || "";
      const onKiosk = p.includes("cek-harga");
      if (onKiosk) {
        if (Date.now() - lastActive.current > 22000) say(pickRot("ckidle", CEK_HARGA_IDLE), 3400);
        return;
      }
      // Jangan mengganggu saat pembayaran / memilih produk / tambah item.
      if (p.includes("checkout") || p.includes("cari") || p.includes("produk-form") || p.includes("variasi") || p.includes("edit-transaksi")) return;
      if (Date.now() - lastActive.current > idleGap.current) {
        const line = Math.random() < 0.18 ? pickRot("humor", HUMOR) : pickRot("warm", [...WARM, ...SEPI]);
        say(line, 3600);
        // jeda berikutnya acak & panjang (±60–105 dtk) agar terasa natural, tidak spam.
        idleGap.current = 60000 + Math.floor(Math.random() * 45000);
      }
    }, 12000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  // Tap Miko: bila dipencet berkali-kali dalam 3 dtk → respons jenaka.
  const onTap = () => {
    const now = Date.now();
    tapTimes.current = tapTimes.current.filter((t) => now - t < 3000);
    tapTimes.current.push(now);
    say(tapTimes.current.length >= 3 ? pickRot("cheerm", CHEER_MULTI) : pickRot("cheer", CHEER), 2200);
  };

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
        <Pressable onPress={onTap} hitSlop={8}>
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
