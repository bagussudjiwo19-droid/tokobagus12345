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
  bag: require("../assets/mascot/miko_bag.png"), bye: require("../assets/mascot/miko_bye.png"),
  dance: require("../assets/mascot/miko_dance.png"), deepsleep: require("../assets/mascot/miko_deepsleep.png"),
  hug: require("../assets/mascot/miko_hug.png"), phone: require("../assets/mascot/miko_phone.png"),
  pout: require("../assets/mascot/miko_pout.png"), snack: require("../assets/mascot/miko_snack.png"),
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
// Pengingat lembut agar rutin membagikan cadangan ke Google Drive / WhatsApp.
const BACKUP_REMIND: Line[] = [
  { t: "Kak, sudah lama belum simpan cadangan. Yuk backup ke Google Drive atau WhatsApp ya 💾", p: "phone" },
  { t: "Jangan lupa cadangkan data ke Drive/WhatsApp, Kak. Biar aman kalau HP bermasalah 😊", p: "phone" },
  { t: "Miko ingatkan ya, Kak: bagikan cadangan ke Google Drive supaya data tetap aman 💚", p: "phone" },
  { t: "Sudah beberapa hari nih. Yuk simpan backup ke WhatsApp atau Drive, Kak 🗂️", p: "phone" },
  { t: "Data toko itu berharga, Kak. Sempatkan backup ke Google Drive hari ini ya 💾", p: "thinking" },
  { t: "Kak, buka Pengaturan → Backup, lalu Bagikan ke Drive/WhatsApp. Cuma sebentar kok 😊", p: "phone" },
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

// Pose "lucu/menghibur" untuk kios Cek Harga (dipilih acak agar ekspresif).
const CUTE_POSES = [
  "happy", "wave", "wink", "love", "hearts", "idea", "thumbsup", "star", "shy",
  "dance", "hug", "snack", "pout", "bye", "phone", "thinking", "tea", "ok", "surprised", "promo",
];

// Sapaan PELANGGAN untuk kios Cek Harga (layar penuh di dinding). Ditampilkan
// acak & bergantian di balon teks Miko selama menganggur. Dari daftar user.
const KIOSK_SAY: string[] = [
  "Halo, Kak! Selamat datang di Toko Bagus 😊",
  "Hai, Kak! Miko siap menemani belanja hari ini.",
  "Selamat datang, Kak! Mau cari harga barang?",
  "Halo, Kak! Ada yang sedang dicari?",
  "Hai, Kak! Yuk, lihat harga barang dengan mudah.",
  "Selamat datang di Toko Bagus! Semoga belanjanya menyenangkan 🛒",
  "Halo, Kak! Jangan malu-malu, Miko nggak galak kok 😄",
  "Hai, Kak! Mau cek harga? Miko siap bantu.",
  "Selamat datang, Kak! Cek harga sendiri sekarang lebih gampang.",
  "Halo, Kak! Miko sudah standby nih 👋",
  "Kak, Miko lagi santai nih. Mau ajak cek harga?",
  "Miko belum ngantuk, Kak. Yuk, cek harga 😄",
  "Kak, jangan cuma lihat Miko. Coba cek harga juga 😆",
  "Miko siap kerja, Kak. Tinggal kasih barcode.",
  "Belanja boleh santai, cek harga jangan lupa ya, Kak.",
  "Miko standby nih. Barang apa yang mau dicek?",
  "Kak, kalau bingung harga, serahkan pada Miko 😉",
  "Miko penasaran, Kak mau beli apa hari ini?",
  "Yuk, cek harga dulu. Biar belanjanya makin mantap.",
  "Tenang, Kak. Miko nggak akan nagih belanja 😄",
  "Kalau mau tahu harganya, scan barcode di sini ya, Kak.",
  "Tempelkan barcode ke kamera, Kak. Harganya langsung muncul.",
  "Mau cek harga? Tekan tombol scan di sini ya.",
  "Coba scan barangnya, Kak. Miko bantu lihat harganya.",
  "Barcode-nya sini, Kak. Biar Miko yang cari harganya.",
  "Yuk, scan barangnya. Harganya langsung kelihatan.",
  "Mau tahu harga ecer atau grosir? Coba scan dulu, Kak.",
  "Scan barcode-nya, Kak. Jangan sampai salah harga 😊",
  "Satu scan, langsung tahu harganya.",
  "Silakan scan barangnya, Kak. Miko siap!",
  "Semoga belanjanya hari ini lancar dan menyenangkan, Kak.",
  "Terima kasih sudah mampir ke Toko Bagus, Kak.",
  "Semoga ada yang cocok untuk kebutuhan di rumah ya, Kak.",
  "Belanja santai saja, Kak. Miko menemani.",
  "Semoga hari Kakak menyenangkan dan belanjanya sesuai kebutuhan.",
  "Kak, semoga hari ini rezekinya lancar ya 😊",
  "Jangan buru-buru, Kak. Pilih yang paling sesuai kebutuhan.",
  "Miko siap menemani sampai selesai belanja.",
  "Semoga belanjanya dapat harga terbaik, Kak.",
  "Terima kasih sudah berbelanja di Toko Bagus 💚",
  "Tadi Miko lihat banyak barang datang. Kayaknya toko lagi ramai nih 😄",
  "Miko penasaran, hari ini barang apa yang paling banyak dicari?",
  "Kalau Miko bisa belanja, mungkin Miko bakal pilih camilan dulu 😋",
  "Miko lagi duduk manis sambil menunggu pelanggan.",
  "Hari ini Miko bertugas menjaga layar. Aman, Kak 😎",
  "Miko sudah siap dari tadi. Tinggal menunggu barcode datang.",
  "Kadang toko ramai, kadang sepi. Miko tetap standby.",
  "Kalau toko sedang sepi begini, Miko jadi punya waktu untuk ngobrol.",
  "Miko paling senang kalau pelanggan datang dengan wajah ceria.",
  "Miko sedang menghitung... kira-kira hari ini ada berapa barang yang discan ya?",
  "Miko tadi mau tidur sebentar... eh, ingat masih jam kerja 😴",
  "Kalau Miko punya dompet, kira-kira Miko belanja apa ya?",
  "Miko sudah siap kerja. Tapi jangan suruh angkat kardus ya, Kak 😹",
  "Miko bisa cek harga, tapi belum bisa bayarin belanjaan 😆",
  "Miko tidak pernah salah lihat harga. Kalau salah, jangan lihat Miko ya 😜",
  "Miko penasaran, kenapa camilan selalu cepat habis?",
  "Ada yang bilang belanja sedikit... tahu-tahu keranjangnya penuh 😆",
  "Miko cuma bertugas di layar. Yang memilih barang tetap Kakak.",
  "Miko sedang pura-pura sibuk supaya kelihatan rajin 😎",
  "Kalau Miko punya kaki, mungkin dari tadi sudah keliling toko.",
  "Miko senang melihat orang-orang datang memenuhi kebutuhan rumah.",
  "Kadang belanja kecil ternyata sangat berarti di rumah.",
  "Semoga setiap pelanggan pulang membawa barang yang memang dibutuhkan.",
  "Miko berharap hari ini semua urusan Kakak berjalan lancar.",
  "Sedikit belanja, sedikit senyum, semoga harinya jadi lebih baik.",
  "Miko di sini bukan cuma untuk cek harga, tapi juga menemani Kakak.",
  "Kalau hari ini terasa melelahkan, semoga belanja sebentar bisa bikin lebih santai.",
  "Miko percaya, hal kecil seperti belanja kebutuhan rumah juga bagian dari menjaga keluarga.",
  "Semoga rezeki Kakak selalu lancar dan kebutuhan rumah selalu tercukupi.",
  "Miko tetap di sini, menemani siapa pun yang datang.",
  "Miko sering melihat pelanggan membandingkan harga sebelum membeli. Itu bagus, Kak.",
  "Kalau mau beli banyak, jangan lupa cek harga bertingkatnya ya.",
  "Kadang harga satuan dan harga grosir memang berbeda. Makanya Miko siap membantu.",
  "Miko suka kalau pelanggan belanja sesuai kebutuhan.",
  "Kalau sudah tahu harganya, belanja jadi lebih tenang.",
  "Miko paling senang kalau pelanggan menemukan harga yang cocok.",
  "Mau beli satu boleh, mau stok di rumah juga boleh.",
  "Kalau sedang belanja untuk keluarga, semoga semua yang dicari ketemu.",
  "Miko siap membantu mencari informasi harga kapan saja.",
  "Satu barcode bisa membuat pencarian harga jadi lebih mudah.",
  "Sepertinya sedang sepi ya, Kak. Miko jadi punya teman ngobrol.",
  "Toko sedang tenang. Miko tetap semangat menemani.",
  "Sepi bukan berarti berhenti. Miko tetap siap kalau ada pelanggan.",
  "Miko sedang menikmati suasana tenang sambil menunggu scan berikutnya.",
  "Kalau belum ada yang scan, Miko ngobrol sebentar boleh ya 😄",
  "Miko tetap semangat meskipun toko sedang sepi.",
  "Kadang toko ramai, kadang tenang. Yang penting Miko selalu siap.",
  "Miko tidak ke mana-mana, Kak. Masih standby di sini.",
  "Kalau ada yang mau cek harga, panggil Miko saja.",
  "Sambil menunggu pelanggan berikutnya, Miko duduk manis dulu 🐱",
  // Cerita Miko tentang Kak Vita
  "Tadi Miko lihat Kak Vita lagi sibuk melayani pelanggan. Semangat terus ya, Kak Vita! 😊",
  "Kak Vita hari ini kelihatannya rajin sekali. Miko sampai ikut semangat.",
  "Kalau ada yang bingung, mungkin Kak Vita bisa membantu.",
  "Miko tadi lihat Kak Vita tersenyum. Semoga pelanggan hari ini juga ikut tersenyum.",
  "Kak Vita sedang bekerja keras. Miko bantu jaga layar dulu ya.",
  "Miko dan Kak Vita hari ini satu tim. Jangan sampai kalah semangat!",
  "Kalau Miko bisa bantu Kak Vita, pasti Miko langsung lari.",
  "Kak Vita sedang sibuk. Miko jangan mengganggu dulu deh 😄",
  "Semoga pekerjaan Kak Vita hari ini lancar sampai selesai.",
  "Miko titip semangat untuk Kak Vita hari ini 💚",
  // Cerita Miko tentang Kak Sasa
  "Tadi Miko lihat Kak Sasa sedang sibuk. Semangat ya, Kak Sasa!",
  "Kak Sasa hari ini kelihatannya penuh energi. Miko jadi ikut semangat.",
  "Kalau ada yang bingung, Kak Sasa mungkin bisa membantu.",
  "Miko tadi lihat Kak Sasa tersenyum. Suasananya jadi ikut enak.",
  "Kak Sasa sedang bekerja, Miko juga harus rajin dong.",
  "Hari ini Miko dan Kak Sasa satu tim. Siap melayani pelanggan!",
  "Kalau Miko punya tangan, mungkin sudah membantu Kak Sasa dari tadi 😆",
  "Kak Sasa sedang sibuk. Miko bantu jaga toko dari layar saja.",
  "Semoga pekerjaan Kak Sasa hari ini berjalan lancar.",
  "Miko titip semangat untuk Kak Sasa hari ini 💕",
  // Cerita Miko tentang mereka berdua
  "Hari ini ada Kak Vita dan Kak Sasa. Wah, Miko punya banyak teman!",
  "Kalau Kak Vita dan Kak Sasa bekerja bersama, Miko jadi ikut semangat.",
  "Miko penasaran, siapa yang hari ini paling cepat melayani pelanggan? 😄",
  "Kak Vita dan Kak Sasa jangan lupa istirahat kalau sudah capek ya.",
  "Miko senang kalau Kak Vita dan Kak Sasa sedang ceria.",
  "Kalau toko mulai ramai, Miko siap membantu dari layar.",
  "Miko punya dua teman kasir: Kak Vita dan Kak Sasa. Lengkap sudah!",
  "Kak Vita sibuk, Kak Sasa sibuk, Miko kebagian tugas menjaga layar 😆",
  "Kalau pelanggan datang, Miko siap menyapa. Kak Vita dan Kak Sasa tinggal melayani.",
  "Miko dan teman-teman kasir siap membuat hari ini lebih menyenangkan.",
  // Lebih jahil tapi tetap sopan
  "Miko mau cerita, tapi takut Kak Vita dengar duluan 😹",
  "Miko sebenarnya mau bantu Kak Sasa, tapi Miko cuma punya kaki di gambar.",
  "Kak Vita jangan kerja terus ya. Miko bisa ikut capek melihatnya 😆",
  "Kak Sasa, Miko lihat lho... jangan lupa senyum hari ini.",
  "Miko sedang mengawasi. Bukan mengawasi Kak Vita, kok... 😜",
  "Kak Sasa, Miko siap jadi teman kerja paling kecil di sini.",
  "Kalau Miko bisa bicara dengan Kak Vita langsung, pasti banyak ceritanya.",
  "Miko penasaran, Kak Vita sudah minum belum hari ini?",
  "Kak Sasa jangan terlalu serius. Miko di sini siap bikin suasana sedikit ceria 😄",
  "Miko rasa Kak Vita dan Kak Sasa adalah tim yang kompak.",
  // Miko bercerita tentang Toko Bagus
  "Selamat datang di Toko Bagus! Miko senang bisa menemani Kakak hari ini 😊",
  "Toko Bagus selalu siap membantu Kakak menemukan harga yang cocok.",
  "Miko betah di Toko Bagus. Di sini banyak barang dan banyak cerita.",
  "Kalau sedang mencari kebutuhan rumah, coba lihat-lihat dulu di Toko Bagus.",
  "Toko Bagus bukan cuma tempat belanja, tapi tempat Miko bertemu banyak pelanggan.",
  "Miko senang melihat Toko Bagus ramai oleh pelanggan.",
  "Hari ini Toko Bagus siap melayani Kakak dengan senyum 😊",
  "Semoga belanja di Toko Bagus hari ini menyenangkan.",
  "Miko selalu siap membantu Kakak mengecek harga di Toko Bagus.",
  "Kalau bingung dengan harga, jangan khawatir. Miko ada di sini.",
  "Di Toko Bagus, Kakak bisa cek harga dengan mudah.",
  "Miko bangga menjadi bagian kecil dari Toko Bagus.",
  "Toko Bagus buka, Miko juga siap bertugas!",
  "Miko sudah standby di Toko Bagus. Tinggal tunggu barcode nih.",
  "Semoga hari ini Toko Bagus penuh dengan pelanggan yang bahagia.",
  "Belanja kebutuhan rumah? Toko Bagus siap menemani.",
  "Miko punya satu tugas: membantu Kakak mendapatkan informasi harga.",
  "Toko Bagus dan Miko siap menemani perjalanan belanja Kakak.",
  "Kalau sudah menemukan barang yang cocok, jangan lupa cek harganya ya, Kak.",
  "Miko suka suasana Toko Bagus. Apalagi kalau banyak pelanggan datang 😄",
  // Cerita ringan tentang Toko Bagus
  "Toko Bagus sedang sepi? Tidak apa-apa, Miko tetap rajin menjaga layar.",
  "Kalau Toko Bagus mulai ramai, Miko ikut deg-degan nih 😆",
  "Miko belum pernah bosan melihat pelanggan datang ke Toko Bagus.",
  "Toko Bagus hari ini tenang. Miko jadi punya waktu untuk ngobrol.",
  "Miko sedang menunggu pelanggan berikutnya. Siapa ya kira-kira?",
  "Kalau Toko Bagus ramai, Miko harus lebih semangat!",
  "Miko tidak bisa angkat barang, tapi kalau soal cek harga, serahkan saja 😎",
  "Miko punya tempat favorit. Ya di sini, di Toko Bagus.",
  "Kalau Miko punya kaki, mungkin sudah keliling Toko Bagus dari tadi.",
  "Toko Bagus punya banyak barang, Miko punya banyak cerita.",
  // Sapaan yang membangun suasana toko
  "Terima kasih sudah mampir ke Toko Bagus, Kak.",
  "Semoga kebutuhan Kakak hari ini bisa ditemukan di Toko Bagus.",
  "Selamat berbelanja di Toko Bagus. Jangan lupa tetap tersenyum 😊",
  "Miko berharap Kakak mendapatkan barang dan harga yang sesuai kebutuhan.",
  "Semoga belanja di Toko Bagus membuat hari Kakak sedikit lebih menyenangkan.",
  "Miko dan seluruh tim Toko Bagus siap melayani Kakak.",
  "Toko Bagus selalu senang menyambut pelanggan baru.",
  "Untuk pelanggan lama, Miko juga senang bertemu lagi!",
  "Miko titip salam dari Toko Bagus. Semoga hari Kakak lancar.",
  "Sampai jumpa lagi di Toko Bagus, Kak. Jangan lupa mampir lagi 😊",
];
const rndCute = () => CUTE_POSES[Math.floor(Math.random() * CUTE_POSES.length)];

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
  if (path.includes("cek-harga")) return { t: KIOSK_SAY[Math.floor(Math.random() * KIOSK_SAY.length)], p: rndCute() };
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
  const jump = useRef(new Animated.Value(0)).current; // lompatan (kios)
  const rot = useRef(new Animated.Value(0)).current;  // geleng/goyang (kios)
  const walkX = useRef(new Animated.Value(0)).current; // jalan-jalan (kios)
  const kioskI = useRef(-1);
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
    say(greet(pathname || ""), (pathname || "").includes("cek-harga") ? 7000 : 3000);
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
      else if (e.type === "price_found") say(pickRot("pricef", PRICE_FOUND), 7000);
      else if (e.type === "product_saved") say(pickRot("saved", SAVED), 2400);
      else if (e.type === "product_deleted") say(pickRot("deleted", DELETED), 2400);
      else if (e.type === "say") say({ t: e.text, p: e.pose || "surprised" }, 7000);
      else if (e.type === "backup_reminder") say(pickRot("bkrem", BACKUP_REMIND), 6000);
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
      if (onKiosk) return; // kios ditangani interval khusus (animasi + sapaan)
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
  const jumpY = jump.interpolate({ inputRange: [0, 1], outputRange: [0, -26] });
  const rotDeg = rot.interpolate({ inputRange: [-1, 1], outputRange: ["-14deg", "14deg"] });

  // Animasi jenaka untuk kios (lompat / geleng / joget / jalan-jalan).
  const playAnim = () => {
    const kind = Math.floor(Math.random() * 4);
    if (kind === 0) {
      Animated.sequence([
        Animated.spring(jump, { toValue: 1, useNativeDriver: true, friction: 4 }),
        Animated.spring(jump, { toValue: 0, useNativeDriver: true, friction: 5 }),
      ]).start();
    } else if (kind === 1) {
      Animated.sequence([
        Animated.timing(rot, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(rot, { toValue: -1, duration: 220, useNativeDriver: true }),
        Animated.timing(rot, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(rot, { toValue: 0, duration: 130, useNativeDriver: true }),
      ]).start();
    } else if (kind === 2) {
      // joget: goyang + lompat kecil bergantian
      Animated.sequence([
        Animated.parallel([
          Animated.timing(rot, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.spring(jump, { toValue: 1, useNativeDriver: true, friction: 5 }),
        ]),
        Animated.parallel([
          Animated.timing(rot, { toValue: -1, duration: 160, useNativeDriver: true }),
          Animated.spring(jump, { toValue: 0, useNativeDriver: true, friction: 5 }),
        ]),
        Animated.timing(rot, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    } else {
      // jalan-jalan: bergeser kiri lalu kanan lalu kembali
      Animated.sequence([
        Animated.timing(walkX, { toValue: -46, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(walkX, { toValue: 30, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(walkX, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  };

  const sayKiosk = () => {
    let i = Math.floor(Math.random() * KIOSK_SAY.length);
    if (i === kioskI.current) i = (i + 1) % KIOSK_SAY.length;
    kioskI.current = i;
    say({ t: KIOSK_SAY[i], p: rndCute() }, 7000);
  };

  // Kios Cek Harga: Miko hidup & menghibur.
  // - Animasi lucu + ganti pose tiap ~3.5 dtk.
  // - Balon teks tampil 7 dtk, lalu JEDA 5 dtk (kosong) sebelum balon berikutnya
  //   muncul (siklus 12 dtk).
  useEffect(() => {
    const animId = setInterval(() => {
      if (!(pathRef.current || "").includes("cek-harga")) return;
      playAnim();
      if (!show) setPose(rndCute()); // ganti ekspresi saat tidak sedang menampilkan balon
    }, 3500);
    const sayId = setInterval(() => {
      if (!(pathRef.current || "").includes("cek-harga")) return;
      sayKiosk();
    }, 12000);
    return () => { clearInterval(animId); clearInterval(sayId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

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
          <Animated.View style={{ transform: [{ translateX: walkX }, { translateY: Animated.add(bobY, jumpY) }, { rotate: rotDeg }, { scale: pop }] }}>
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
