import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Settings, Transaction } from "../src/types";
import { numberID, receiptDateTime, shortTxNo } from "../src/format";

const MONO = "DMSans-Regular";

const qtyStr = (q: number) => (Number.isInteger(q) ? String(q) : String(q));

// Struk gaya thermal di layar (juga ditangkap jadi gambar untuk dibagikan).
// Mengikuti tata letak struk thermal: nama toko besar & tengah, info transaksi
// dua sisi, daftar barang (nama+total lalu qty x harga), ringkasan pembayaran.
export default function ReceiptPreview({
  tx,
  settings,
}: {
  tx: Transaction;
  settings: Settings;
}) {
  const s = settings;
  const shortfall = Math.max(0, (tx.total || 0) - (tx.cash_paid || 0));
  return (
    <View style={styles.paper} testID="receipt-preview">
      {/* Kepala toko */}
      {s.showShopName && !!s.shopName && <Text style={styles.shop}>{s.shopName}</Text>}
      {s.showAddress && !!s.address && <Text style={styles.center}>{s.address}</Text>}
      {s.showPhone && !!s.phone && <Text style={styles.center}>{s.phone}</Text>}

      <View style={styles.dash} />
      {/* Info transaksi: label kiri, nilai kanan */}
      {s.showTxNumber && <Row left="Id Transaksi" right={shortTxNo(tx.id)} />}
      {s.showDateTime && <Row left="Tanggal" right={receiptDateTime(tx.created_at)} />}
      {s.showCashier && !!s.cashier && <Row left="Kasir" right={s.cashier} />}
      <View style={styles.dash} />

      {/* Daftar barang */}
      {tx.items.map((it, idx) => {
        const unit = (it.unit || "").trim();
        const suffix = unit && unit.toLowerCase() !== "pcs" ? `, ${unit}` : "";
        return (
          <View key={idx} style={{ marginBottom: 4 }}>
            <View style={styles.rowLine}>
              {s.showItemName && (
                <Text style={styles.item} numberOfLines={2}>{it.name}{suffix}</Text>
              )}
              {s.showSubtotal && <Text style={styles.itemAmount}>{numberID(it.subtotal)}</Text>}
            </View>
            {(s.showQty || s.showUnitPrice) && (
              <Text style={styles.qty}>  {qtyStr(it.quantity)} x {numberID(it.price)}</Text>
            )}
          </View>
        );
      })}

      <View style={styles.dash} />
      {/* Ringkasan pembayaran */}
      {(tx.discount || 0) > 0 && (
        <>
          {s.showSubtotal && <Row left="Subtotal" right={numberID(tx.total + (tx.discount || 0))} />}
          {s.showDiscount && <Row left="Diskon" right={"-" + numberID(tx.discount || 0)} />}
        </>
      )}
      {s.showTotal && <Row left="Total" right={numberID(tx.total)} bold />}
      {s.showCashPaid && <Row left="Dibayar" right={numberID(tx.cash_paid)} />}
      {shortfall > 0 ? (
        <Row left="Pembayaran Kurang" right={numberID(shortfall)} bold />
      ) : (
        s.showChange && <Row left="Kembalian" right={numberID(tx.change)} />
      )}
      <View style={styles.dash} />
      {s.showNote && !!s.note && <Text style={styles.center}>{s.note}</Text>}
      {s.showThanks && !!s.thanks && <Text style={[styles.center, { marginTop: 6 }]}>{s.thanks}</Text>}
    </View>
  );
}

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <View style={styles.rowLine}>
      <Text style={[styles.small, bold && styles.boldTxt]} numberOfLines={1}>{left}</Text>
      <Text style={[styles.small, bold && styles.boldTxt]}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // padding kiri sedikit lebih besar → tulisan bergeser ke kanan (meniru margin kertas)
  paper: { backgroundColor: "#FFFFFF", paddingVertical: 16, paddingLeft: 22, paddingRight: 16, borderRadius: 8 },
  shop: { fontFamily: MONO, fontSize: 19, fontWeight: "700", color: "#000", textAlign: "center", marginBottom: 2 },
  center: { fontFamily: MONO, fontSize: 12, color: "#111", textAlign: "center" },
  small: { fontFamily: MONO, fontSize: 12, color: "#111" },
  item: { flex: 1, fontFamily: MONO, fontSize: 13, color: "#000", fontWeight: "600", marginRight: 8 },
  itemAmount: { fontFamily: MONO, fontSize: 13, color: "#000", fontWeight: "600" },
  qty: { fontFamily: MONO, fontSize: 12, color: "#333" },
  boldTxt: { fontWeight: "700", fontSize: 14 },
  rowLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  dash: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 },
});
