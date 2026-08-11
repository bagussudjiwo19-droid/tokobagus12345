import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Settings, Transaction } from "../src/types";
import { rupiah, formatDateID, shortTxNo } from "../src/format";

const MONO = "DMSans-Regular";

// On-screen thermal-style receipt (also captured to image for sharing).
export default function ReceiptPreview({
  tx,
  settings,
}: {
  tx: Transaction;
  settings: Settings;
}) {
  const s = settings;
  return (
    <View style={styles.paper} testID="receipt-preview">
      {s.showShopName && !!s.shopName && (
        <Text style={styles.shop}>{s.shopName.toUpperCase()}</Text>
      )}
      {s.showAddress && !!s.address && <Text style={styles.center}>{s.address}</Text>}
      {s.showPhone && !!s.phone && <Text style={styles.center}>{s.phone}</Text>}

      <View style={styles.dash} />
      {s.showTxNumber && <Row left="No" right={shortTxNo(tx.id)} />}
      {s.showDateTime && <Text style={styles.small}>{formatDateID(tx.created_at)}</Text>}
      {s.showCashier && !!s.cashier && <Row left="Kasir" right={s.cashier} />}
      <View style={styles.dash} />

      {tx.items.map((it, idx) => (
        <View key={idx} style={{ marginBottom: 4 }}>
          {s.showItemName && <Text style={styles.item}>{it.name}</Text>}
          <View style={styles.rowLine}>
            <Text style={styles.small}>
              {s.showQty ? `${it.quantity} ${it.unit || "pcs"}` : ""}
              {s.showUnitPrice ? `  x ${rupiah(it.price)}` : ""}
            </Text>
            {s.showSubtotal && <Text style={styles.small}>{rupiah(it.subtotal)}</Text>}
          </View>
        </View>
      ))}

      <View style={styles.dash} />
      {s.showTotal && <Row left="TOTAL" right={rupiah(tx.total)} bold />}
      {s.showCashPaid && <Row left="Tunai" right={rupiah(tx.cash_paid)} />}
      {s.showChange && <Row left="Kembali" right={rupiah(tx.change)} />}
      <View style={styles.dash} />
      {s.showNote && !!s.note && <Text style={styles.center}>{s.note}</Text>}
      {s.showThanks && !!s.thanks && <Text style={[styles.center, { marginTop: 6 }]}>{s.thanks}</Text>}
    </View>
  );
}

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <View style={styles.rowLine}>
      <Text style={[styles.small, bold && styles.boldTxt]}>{left}</Text>
      <Text style={[styles.small, bold && styles.boldTxt]}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 8 },
  shop: { fontFamily: MONO, fontSize: 16, fontWeight: "700", color: "#000", textAlign: "center", marginBottom: 2 },
  center: { fontFamily: MONO, fontSize: 11, color: "#111", textAlign: "center" },
  small: { fontFamily: MONO, fontSize: 11, color: "#111" },
  item: { fontFamily: MONO, fontSize: 12, color: "#000", fontWeight: "600" },
  boldTxt: { fontWeight: "700", fontSize: 13 },
  rowLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dash: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 },
});
