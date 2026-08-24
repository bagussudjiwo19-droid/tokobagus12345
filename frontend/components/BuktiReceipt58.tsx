import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { numberID } from "@/src/format";
import { font } from "@/src/theme";
import type { Bukti } from "@/src/types";

// Pratinjau struk 58mm untuk layar & capture GAMBAR (PNG). Tampilan mengikuti
// hasil cetak thermal: hitam-putih, monospace, garis putus-putus.
export default function BuktiReceipt58({ b }: { b: Bukti }) {
  const Row = ({ k, v }: { k: string; v?: string }) =>
    v && v.trim() ? (
      <View style={s.row}>
        <Text style={s.k}>{k}</Text>
        <Text style={s.v} numberOfLines={2}>{v}</Text>
      </View>
    ) : null;
  const Hr = () => <View style={s.hr} />;
  return (
    <View style={s.paper}>
      <Text style={s.title}>BUKTI PEMBAYARAN</Text>
      <Text style={s.title}>TOKO BAGUS</Text>
      <Hr />
      <View style={s.row}><Text style={s.k}>STATUS</Text><Text style={s.kb}>{b.status || "BERHASIL"}</Text></View>
      <Hr />
      <Text style={s.k}>NOMINAL</Text>
      <Text style={s.amount}>Rp{numberID(b.amount || 0)}</Text>
      <Hr />
      <Row k="DARI" v={b.sender_name || "-"} />
      <Row k="BANK" v={b.sender_bank || "-"} />
      <Row k="NO. TUJUAN" v={b.sender_account} />
      <Hr />
      <Row k="KE" v={b.recipient || "-"} />
      <Row k="USERNAME" v={b.recipient_username} />
      <Hr />
      <Row k="METODE" v={b.method || "-"} />
      <Row k="NO. REFERENSI" v={b.ref} />
      <Row k="NO. TRANSAKSI" v={b.txno} />
      <Row k="PRODUK" v={b.product} />
      <Hr />
      <Row k="TANGGAL" v={b.date || "-"} />
      <Row k="WAKTU" v={b.time || "-"} />
      <Hr />
      <Text style={s.thanks}>TERIMA KASIH</Text>
      <Text style={s.thanks}>TOKO BAGUS</Text>
    </View>
  );
}

const s = StyleSheet.create({
  paper: { width: 300, backgroundColor: "#FFFFFF", paddingVertical: 18, paddingHorizontal: 18 },
  title: { fontFamily: font.bold, fontSize: 18, color: "#000", textAlign: "center", letterSpacing: 1 },
  hr: { borderTopWidth: 1.5, borderColor: "#000", borderStyle: "dashed", marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", marginVertical: 2 },
  k: { fontFamily: font.bold, fontSize: 13, color: "#000" },
  kb: { fontFamily: font.bold, fontSize: 13, color: "#000" },
  v: { fontFamily: font.regular, fontSize: 13, color: "#000", maxWidth: 180, textAlign: "right" },
  amount: { fontFamily: font.bold, fontSize: 22, color: "#000", textAlign: "center", marginTop: 2 },
  thanks: { fontFamily: font.bold, fontSize: 14, color: "#000", textAlign: "center", letterSpacing: 0.5 },
});
