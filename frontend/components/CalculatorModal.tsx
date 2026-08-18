import React, { useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const OPS = "+-×÷";
const isOp = (c: string) => OPS.includes(c);
const prettyOp = (o: string) => (o === "-" ? "−" : o);

/**
 * Ukuran font responsif berdasar panjang teks: penuh sampai `startLen` karakter,
 * lalu MENGECIL BERTAHAP hingga `min` saat mencapai `endLen`. Memberi batas
 * minimum agar tetap terbaca; dipadukan dgn adjustsFontSizeToFit sbg pengaman.
 */
function fitFont(len: number, max: number, min: number, startLen: number, endLen: number) {
  if (len <= startLen) return max;
  if (len >= endLen) return min;
  const t = (len - startLen) / (endLen - startLen);
  return Math.round(max - t * (max - min));
}

/** Satu tombol kalkulator dengan animasi tekan (scale) + getaran pendek. */
function CalcKey({
  label,
  onPress,
  kind = "num",
  tall = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: "num" | "op" | "fn" | "eq";
  tall?: boolean;
  testID?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => {
    // Getaran ringan & singkat, seperti tombol keyboard HP (saat ditekan turun).
    Haptics.selectionAsync().catch(() => {});
    Animated.timing(scale, { toValue: 0.9, duration: 60, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  };
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      testID={testID}
      style={[
        styles.key,
        kind === "op" && styles.keyOp,
        kind === "fn" && styles.keyFn,
        kind === "eq" && styles.keyEq,
        tall && styles.keyTall,
        { transform: [{ scale }] },
      ]}
    >
      <Text
        style={[
          styles.keyTxt,
          kind === "op" && styles.keyTxtOp,
          kind === "eq" && styles.keyTxtEq,
          kind === "fn" && styles.keyTxtFn,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * Kalkulator (model ekspresi penuh) sebagai bottom-sheet overlay. Dipakai di
 * layar Transaksi (ikon di samping tombol Bayar). TIDAK menyentuh keranjang.
 * - Indikator operator kecil di bawah judul (operator terakhir yang ditekan).
 * - Baris atas = rangkaian angka+operator; hasil BESAR di bawahnya.
 * - Angka panjang otomatis mengecil (adjustsFontSizeToFit).
 */
export default function CalculatorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [expr, setExpr] = useState("");
  const [lastOp, setLastOp] = useState("");
  const exprScrollRef = useRef<ScrollView>(null);

  // Ambil token angka terakhir (setelah operator terakhir).
  const lastNum = (s: string) => {
    let i = s.length - 1;
    while (i >= 0 && !isOp(s[i])) i--;
    return s.slice(i + 1);
  };

  // Format satu angka gaya Indonesia: ribuan "." dan desimal ",".
  const fmtNum = (numStr: string) => {
    const neg = numStr.startsWith("-");
    const body = neg ? numStr.slice(1) : numStr;
    const [ip, dp] = body.split(".");
    const intFmt = (ip === "" ? "0" : ip).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const out = dp !== undefined ? `${intFmt},${dp}` : intFmt;
    return (neg ? "-" : "") + out;
  };

  // Ekspresi lengkap: angka terformat + operator (rapi).
  const fmtExpr = (s: string) => {
    if (s === "") return "0";
    if (s === "Error") return "Error";
    const tokens = s.match(/(\d+\.?\d*|\.\d+|[+\-×÷])/g) || [];
    return tokens.map((t) => (isOp(t) ? ` ${prettyOp(t)} ` : fmtNum(t))).join("").trim();
  };

  // Hitung ekspresi (× ÷ dulu, lalu + -). null jika tak valid.
  const evalExpr = (s: string): number | null => {
    if (!s || s === "Error") return null;
    const tokens = (s.match(/(\d+\.?\d*|\.\d+|[+\-×÷])/g) || []).slice();
    while (tokens.length && isOp(tokens[tokens.length - 1])) tokens.pop();
    if (!tokens.length) return null;
    const p1: (string | number)[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "×" || t === "÷") {
        const a = Number(p1.pop());
        const b = Number(tokens[++i]);
        if (isNaN(b)) return null;
        p1.push(t === "×" ? a * b : b === 0 ? NaN : a / b);
      } else if (t === "+" || t === "-") {
        p1.push(t);
      } else {
        p1.push(Number(t));
      }
    }
    let result = Number(p1[0]);
    for (let i = 1; i < p1.length; i += 2) {
      const o = p1[i];
      const v = Number(p1[i + 1]);
      if (o === "+") result += v;
      else if (o === "-") result -= v;
    }
    if (!isFinite(result)) return null;
    return Math.round((result + Number.EPSILON) * 1e8) / 1e8;
  };

  // Hasil yang ditampilkan BESAR (selalu ada; angka tunggal → angka itu sendiri).
  const displayResult = () => {
    if (expr === "") return "0";
    if (expr === "Error") return "Error";
    const r = evalExpr(expr);
    return r === null ? "0" : fmtNum(String(r));
  };

  const clearAll = () => { setExpr(""); setLastOp(""); };
  const inputDigit = (d: string) => {
    setExpr((s) => {
      if (s === "Error") return d;
      return lastNum(s) === "0" ? s.slice(0, -1) + d : s + d;
    });
  };
  const input00 = () => {
    setExpr((s) => {
      if (s === "Error" || s === "") return "0";
      const ln = lastNum(s);
      if (ln === "") return s + "0";
      if (ln === "0") return s;
      return s + "00";
    });
  };
  const inputDot = () => {
    setExpr((s) => {
      if (s === "Error") return "0.";
      const ln = lastNum(s);
      if (ln === "") return s + "0.";
      if (ln.includes(".")) return s;
      return s + ".";
    });
  };
  const setOperator = (op: string) => {
    setLastOp(op);
    setExpr((s) => {
      if (s === "Error") return "";
      if (s === "") return op === "-" ? "-" : s; // izinkan mulai negatif
      let base = s;
      if (base.endsWith(".")) base = base.slice(0, -1);
      if (isOp(base[base.length - 1])) return base.slice(0, -1) + op; // ganti operator
      return base + op;
    });
  };
  const percent = () => {
    setExpr((s) => {
      if (s === "Error" || s === "") return s;
      const ln = lastNum(s);
      if (ln === "" || isOp(ln)) return s;
      const num = Number(ln) / 100;
      return s.slice(0, s.length - ln.length) + String(num);
    });
  };
  const equals = () => {
    setLastOp("");
    setExpr((s) => {
      const hasOp = (s.match(/[+\-×÷]/g) || []).length > 0;
      if (!hasOp) return s;
      const r = evalExpr(s);
      return r === null ? "Error" : String(r);
    });
  };

  const exprText = fmtExpr(expr);
  const resultText = displayResult();
  // Ekspresi (atas): font tetap nyaman, MEMBUNGKUS ke bawah (maks 3 baris) lalu
  // kotak tumbuh ke atas & scroll ke isi terbaru. Hasil (bawah): boleh mengecil.
  const resultSize = fitFont(resultText.length, 42, 20, 8, 18);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="calc-backdrop">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Kalkulator</Text>
              <Text style={styles.opIndicator} testID="calc-op-indicator">{lastOp ? prettyOp(lastOp) : ""}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} testID="calc-close">
              <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          <View style={styles.displayBox}>
            <ScrollView
              ref={exprScrollRef}
              style={styles.exprScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.exprScrollContent}
              onContentSizeChange={() => exprScrollRef.current?.scrollToEnd({ animated: false })}
            >
              <Text style={styles.exprLine} testID="calc-display">{exprText}</Text>
            </ScrollView>
            <Text
              style={[styles.resultLine, { fontSize: resultSize }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.45}
              testID="calc-result"
            >
              {resultText}
            </Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.row}>
              <CalcKey label="C/AC" kind="fn" onPress={clearAll} testID="calc-clear" />
              <CalcKey label="÷" kind="op" onPress={() => setOperator("÷")} testID="calc-div" />
              <CalcKey label="×" kind="op" onPress={() => setOperator("×")} testID="calc-mul" />
              <CalcKey label="%" kind="fn" onPress={percent} testID="calc-percent" />
            </View>
            <View style={styles.row}>
              <CalcKey label="7" onPress={() => inputDigit("7")} />
              <CalcKey label="8" onPress={() => inputDigit("8")} />
              <CalcKey label="9" onPress={() => inputDigit("9")} />
              <CalcKey label="−" kind="op" onPress={() => setOperator("-")} testID="calc-sub" />
            </View>
            <View style={styles.row}>
              <CalcKey label="4" onPress={() => inputDigit("4")} />
              <CalcKey label="5" onPress={() => inputDigit("5")} />
              <CalcKey label="6" onPress={() => inputDigit("6")} />
              <CalcKey label="+" kind="op" onPress={() => setOperator("+")} testID="calc-add" />
            </View>
            <View style={styles.bottomRow}>
              <View style={styles.bottomLeft}>
                <View style={styles.row}>
                  <CalcKey label="1" onPress={() => inputDigit("1")} />
                  <CalcKey label="2" onPress={() => inputDigit("2")} />
                  <CalcKey label="3" onPress={() => inputDigit("3")} />
                </View>
                <View style={styles.row}>
                  <CalcKey label="0" onPress={() => inputDigit("0")} testID="calc-0" />
                  <CalcKey label="00" onPress={input00} testID="calc-00" />
                  <CalcKey label="." onPress={inputDot} testID="calc-dot" />
                </View>
              </View>
              <CalcKey label="=" kind="eq" tall onPress={equals} testID="calc-equals" />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const KEY_H = 60;
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.md },
  headerLeft: { flex: 1 },
  title: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  opIndicator: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.xl, marginTop: 2, minHeight: 26 },
  displayBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md, minHeight: 100, justifyContent: "flex-end" },
  exprScroll: { maxHeight: 92, width: "100%" },
  exprScrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  exprLine: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: 22, lineHeight: 30, textAlign: "right" },
  resultLine: { color: colors.onSurface, fontFamily: font.bold, textAlign: "right", marginTop: 4, height: 54 },
  grid: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  bottomRow: { flexDirection: "row", gap: spacing.sm },
  bottomLeft: { flex: 3, gap: spacing.sm },
  key: { flex: 1, height: KEY_H, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  keyTall: { height: KEY_H * 2 + spacing.sm },
  keyOp: { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary },
  keyFn: { backgroundColor: colors.surfaceTertiary, borderColor: colors.surfaceTertiary },
  keyEq: { backgroundColor: colors.brand, borderColor: colors.brand },
  keyTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: 24 },
  keyTxtOp: { color: colors.brand },
  keyTxtEq: { color: colors.onBrandPrimary },
  keyTxtFn: { color: colors.onSurfaceSecondary },
});
