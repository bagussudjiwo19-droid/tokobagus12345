import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop, BottomSheetTextInput } from "@gorhom/bottom-sheet";

import { api } from "@/src/api";
import { useCart } from "@/src/cart";
import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useUnlimitedStock } from "@/src/useUnlimitedStock";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import HardwareScanner from "@/components/HardwareScanner";
import { familyOptions, childEffective } from "@/src/pricing";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { CartLine } from "@/src/types";
import { mikoBus } from "@/src/mikoBus";
import { onLocalChange } from "@/src/localdb";
import type { Product, Variation } from "@/src/types";

// Di HP pakai BottomSheetTextInput (agar sheet naik di atas keyboard). Di WEB
// pakai TextInput biasa — BottomSheetTextInput memanggil API yang tidak ada di
// react-native-web (TextInput.State.currentlyFocusedInput) sehingga crash.
const EditPriceInput: any = Platform.OS === "web" ? TextInput : BottomSheetTextInput;

export default function TransaksiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const { products, reload } = useData();
  const unlimited = useUnlimitedStock();
  const toast = useToast();
  const inputRef = useRef<TextInput>(null);
  const kbdRef = useRef(false);
  // Anti proses-ganda: barcode SAMA dari dobel ENTER/newline scanner HID dalam
  // <350ms diabaikan. Barcode BERBEDA tidak pernah diblokir.
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  // Sinyal minta-fokus-ulang utk penangkap HARDWARE (native). Dinaikkan tiap
  // popup/tombol menutup agar view expo-key-event merebut fokus lagi.
  const [refocusSignal, setRefocusSignal] = useState(0);
  const refocusScanner = useCallback(() => {
    if (Platform.OS === "web") {
      // Web: kolom TextInput tersembunyi yang menerima scan → fokuskan lagi.
      setTimeout(() => inputRef.current?.focus(), 60);
      setTimeout(() => inputRef.current?.focus(), 320);
    } else {
      // Native: minta view penangkap hardware merebut fokus lagi.
      setRefocusSignal((n) => n + 1);
    }
  }, []);
  const scrollRef = useRef<ScrollView>(null);
  const prevLen = useRef(0);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Edit harga sheet
  const priceSheet = useRef<BottomSheetModal>(null);
  const [editLine, setEditLine] = useState<CartLine | null>(null);
  const [priceInput, setPriceInput] = useState("");

  // Konfirmasi hapus
  const deleteSheet = useRef<BottomSheetModal>(null);
  const [deleteLine, setDeleteLine] = useState<CartLine | null>(null);

  // Pintasan Produk: 10 slot (menyimpan ID produk) — ikut sinkron via Settings.
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  // Jaga fokus kolom scan: bila fokus lepas (mis. setelah popup/aksi) sementara
  // masih di halaman Transaksi & tanpa popup → fokuskan lagi otomatis.
  const screenFocusedRef = useRef(false);
  const [screenActive, setScreenActive] = useState(false);
  const variantForRef = useRef<Product | null>(null);
  variantForRef.current = variantFor;
  const keepScanFocused = useCallback(() => {
    setTimeout(() => {
      if (screenFocusedRef.current && !variantForRef.current) inputRef.current?.focus();
    }, 60);
  }, []);
  const loadSlots = useCallback(async () => {
    try { const s = await api.getSettings(); setSlots(Array.isArray(s.quickSlots) ? s.quickSlots : []); } catch { /* abaikan */ }
  }, []);
  useEffect(() => { loadSlots(); const off = onLocalChange(() => loadSlots()); return off; }, [loadSlots]);

  // Produk yang terpasang di slot (abaikan slot kosong / produk terhapus). Selalu
  // ambil data TERBARU dari daftar produk (nama & harga ikut database).
  const quickProducts = slots
    .map((id) => (id ? products.find((p) => p.id === id) : null))
    .filter((p): p is Product => !!p);

  const onQuickTap = (p: Product) => {
    const { root, children } = familyOptions(p, products);
    if (children.length > 0 || (root.variations && root.variations.length > 0)) {
      setVariantFor(root);
      return;
    }
    cart.addProduct(p, null);
    Haptics.selectionAsync();
    toast.show(`${p.name} ditambahkan`, "success");
    refocusScanner();
  };

  // Tambah satu produk anak ke keranjang dengan harga efektif (ikut induk bila di-set).
  const addChild = (child: Product, root: Product) => {
    const eff = childEffective(child, root);
    cart.addProduct({ ...child, sell_price: eff.sell_price, tiers: eff.tiers }, null);
    setVariantFor(null);
    Haptics.selectionAsync();
    toast.show(`${child.name} ditambahkan`, "success");
    refocusScanner();
  };

  const onPickVariation = (p: Product, v: Variation) => {
    cart.addProduct(p, v);
    setVariantFor(null);
    Haptics.selectionAsync();
    toast.show(`${p.name} — ${v.name} ditambahkan`, "success");
    refocusScanner();
  };

  // Kembalikan fokus ke kolom scanner setelah interaksi Pintasan/popup, agar
  // scanner Bluetooth tetap aktif tanpa perlu diaktifkan ulang. Dua percobaan
  // (segera + setelah animasi modal) supaya andal walau ada re-render.
  const closeVariant = () => { setVariantFor(null); refocusScanner(); };

  // 1. Auto scan mode: keep the hardware-scanner input focused whenever the
  // Transaksi tab is focused, so scanning works immediately without tapping.
  // Kolom ini KHUSUS scanner: keyboard HP tidak pernah muncul (pakai tombol
  // "Cari Barang"/"Item Manual" untuk input manual).
  useFocusEffect(
    useCallback(() => {
      loadSlots();
      screenFocusedRef.current = true;
      setScreenActive(true);
      const t = setTimeout(() => { if (Platform.OS === "web") inputRef.current?.focus(); }, 350);
      return () => { screenFocusedRef.current = false; setScreenActive(false); clearTimeout(t); };
    }, [loadSlots]),
  );

  useHideScanKeyboard(inputRef, kbdRef);

  // 2. Auto-scroll to the newest scanned item.
  useEffect(() => {
    if (cart.lines.length > prevLen.current) {
      const newest = cart.lines[cart.lines.length - 1];
      setLastKey(newest.key);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
      const h = setTimeout(() => setLastKey(null), 1600);
      prevLen.current = cart.lines.length;
      return () => clearTimeout(h);
    }
    prevLen.current = cart.lines.length;
  }, [cart.lines]);

  const submitBarcode = useCallback(
    async (code: string) => {
      const c = code.trim();
      // Selesaikan & reset scan sebelumnya: bersihkan input native agar barcode
      // berikutnya TIDAK tergabung dengan yang lama.
      inputRef.current?.clear();
      if (!c) { inputRef.current?.focus(); return; }
      // Anti proses-ganda utk barcode SAMA (dobel ENTER/newline dari scanner HID
      // dalam <350ms). Barcode BERBEDA selalu diproses — tidak pernah di-blokir,
      // supaya scan A→B→C berturut-turut cepat tetap terbaca semua.
      const now = Date.now();
      if (c === lastScanRef.current.code && now - lastScanRef.current.at < 350) {
        inputRef.current?.focus();
        return;
      }
      lastScanRef.current = { code: c, at: now };
      try {
        const product = await api.getByBarcode(c);
        // VARIASI BARCODE: bila barcode cocok dgn barcode SATU variasi tertentu,
        // langsung masuk keranjang "Induk — Variasi" (tanpa popup pilih).
        const { root, children } = familyOptions(product, products);
        const matchedVar = (root.variations || []).find((v) => v.barcode && v.barcode === c);
        if (matchedVar) {
          cart.addProduct(root, matchedVar);
          Haptics.selectionAsync();
          toast.show(`${root.name} — ${matchedVar.name} ditambahkan`, "success");
          return;
        }
        // Bila produk punya keluarga (anak) atau variasi → SELALU munculkan popup pilih.
        if (children.length > 0 || (root.variations && root.variations.length > 0)) {
          setVariantFor(root);
          Haptics.selectionAsync();
          return;
        }
        // Standalone: tambah langsung (harga efektif bila anak yang ikut induk).
        const eff = childEffective(product, root);
        cart.addProduct({ ...product, sell_price: eff.sell_price, tiers: eff.tiers }, null);
        Haptics.selectionAsync();
        toast.show(`${product.name} ditambahkan`, "success");
      } catch {
        // Barcode tidak ditemukan → JANGAN pakai produk Pintasan / buka popup lain.
        toast.show("Barcode tidak ditemukan.", "error");
        mikoBus.emit({ type: "not_found" });
      } finally {
        // Kosongkan kolom scan dgn andal → barcode berikutnya TIDAK tergabung.
        // setNativeProps (Android) lebih konsisten daripada clear() pada input
        // uncontrolled; keduanya optional agar aman di web (RNW tanpa setNativeProps).
        const el = inputRef.current as (TextInput & { setNativeProps?: (p: { text: string }) => void }) | null;
        el?.clear?.();
        el?.setNativeProps?.({ text: "" });
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [cart, toast, products],
  );
  // Penerimaan input scanner Bluetooth yang andal (buffer + ENTER/jeda, tanpa terpotong).
  const scan = useBarcodeScan(submitBarcode, { isScanMode: () => true });

  const openEditPrice = (l: CartLine) => {
    setEditLine(l);
    setPriceInput(String(Math.round(l.price)));
    priceSheet.current?.present();
  };

  const applyTemporary = () => {
    if (!editLine) return;
    const p = Number((priceInput || "0").replace(/[^\d]/g, "")) || 0;
    cart.setPrice(editLine.key, p);
    priceSheet.current?.dismiss();
    toast.show("Harga diubah untuk transaksi ini", "success");
  };

  const applyPermanent = async () => {
    if (!editLine || !editLine.product_id) return;
    const p = Number((priceInput || "0").replace(/[^\d]/g, "")) || 0;
    const product = products.find((x) => x.id === editLine.product_id);
    if (!product) return;
    try {
      const { id, created_at, updated_at, ...rest } = product as any;
      if (editLine.variation_id) {
        rest.variations = (rest.variations || []).map((v: any) =>
          v.id === editLine.variation_id ? { ...v, sell_price: p, inherit_tiers: false } : v,
        );
      } else {
        rest.sell_price = p;
      }
      await api.updateProduct(product.id, rest);
      cart.setPrice(editLine.key, p);
      await reload();
      priceSheet.current?.dismiss();
      toast.show("Harga permanen disimpan", "success");
      mikoBus.emit({ type: "price_changed" });
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan harga", "error");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.top}>
        {/* Header sapaan + Pintasan Produk (2 baris chip di samping teks) */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.hi}>Halo, Kasir 👋</Text>
            <Text style={styles.pageTitle}>Transaksi</Text>
          </View>
          <View style={styles.quickArea}>
            <View style={styles.quickGrid}>
              {quickProducts.slice(0, 10).map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.chip}
                  onPress={() => onQuickTap(p)}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                  testID={`quick-chip-${p.id}`}
                  focusable={false}
                >
                  <Text style={styles.chipTxt} numberOfLines={1}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Pressable style={styles.gearBtn} onPress={() => router.push("/atur-pintasan")} hitSlop={8} testID="atur-pintasan-btn" focusable={false}>
            <Ionicons name="settings-outline" size={20} color={colors.brand} />
          </Pressable>
        </View>

        {/* 1) Mode Scan Barcode aktif (scanner Bluetooth) — keyboard HP TIDAK pernah tampil */}
        <View style={styles.scanModeBox}>
          <View style={styles.scanIcon}>
            <Ionicons name="barcode-outline" size={18} color={colors.brand} />
          </View>
          <TextInput
            ref={inputRef}
            testID="scan-mode-input"
            defaultValue=""
            autoFocus={Platform.OS === "web"}
            editable={Platform.OS === "web"}
            focusable={Platform.OS === "web"}
            onChangeText={Platform.OS === "web" ? scan.onChangeText : undefined}
            onSubmitEditing={Platform.OS === "web" ? scan.onSubmitEditing : undefined}
            onBlur={Platform.OS === "web" ? keepScanFocused : undefined}
            blurOnSubmit={false}
            showSoftInputOnFocus={false}
            caretHidden
            placeholder="Scan barcode di sini…"
            placeholderTextColor={colors.muted}
            style={styles.scanModeInput}
          />
          <HardwareScanner enabled={screenActive} refocusSignal={refocusSignal} onScan={submitBarcode} />
          <View style={styles.readyDot} />
        </View>

        {/* Header daftar belanja */}
        <View style={styles.listHead}>
          <Text style={styles.listHeadTxt}>DAFTAR BELANJA</Text>
          <Text style={styles.listHeadCount}>{cart.lines.length} baris</Text>
        </View>
      </View>

      {cart.lines.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="barcode-outline" size={56} color={colors.brand} />
          <Text style={styles.emptyTitle}>Belum ada barang</Text>
          <Text style={styles.emptyDesc}>Scan barcode dengan scanner Bluetooth, atau gunakan tombol di bawah untuk mulai transaksi.</Text>
          <View style={[styles.addBar, { marginHorizontal: 0, marginTop: spacing.xl }]}>
            <Pressable style={[styles.addBtnBig, styles.addBtnPrimary]} testID="item-manual-button" onPress={() => router.push("/produk-form?fromCart=1")}>
              <View style={styles.addIconCircle}><Ionicons name="add" size={18} color={colors.brand} /></View>
              <Text style={styles.addBtnPrimaryTxt}>Tambah Item</Text>
            </Pressable>
            <Pressable style={[styles.addBtnBig, styles.addBtnGhost]} testID="cari-barang-button" onPress={() => router.push("/cari?mode=cart")}>
              <Ionicons name="search" size={18} color={colors.brand} />
              <Text style={styles.addBtnGhostTxt}>Cari Barang</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
        >
          {cart.lines.map((l) => (
            <View key={l.key} style={[styles.card, lastKey === l.key && styles.cardNew]} testID={`cart-line-${l.key}`}>
              {/* Baris 1: Nama + variasi + hapus */}
              <View style={styles.line1}>
                <Text style={[styles.lineName, (l.tiers?.length ?? 0) > 0 && styles.lineNameGrosir]} numberOfLines={1}>{l.name}</Text>
                {l.product_id ? (
                  <Pressable
                    style={styles.iconMini}
                    testID={`cart-variasi-${l.key}`}
                    hitSlop={6}
                    onPress={() => router.push({ pathname: "/produk-form", params: { id: l.product_id! } })}
                  >
                    <Ionicons name="git-branch-outline" size={16} color={colors.brand} />
                  </Pressable>
                ) : null}
                <Pressable onPress={() => { setDeleteLine(l); deleteSheet.current?.present(); }} style={styles.iconMini} testID={`cart-remove-${l.key}`} hitSlop={6}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>

              {/* Peringatan stok menipis / kurang untuk barang katalog */}
              {(() => {
                if (unlimited) return null;
                if (!l.product_id) return null;
                const p = products.find((x) => x.id === l.product_id);
                if (!p) return null;
                const st = l.variation_id
                  ? ((p.variations || []).find((v) => v.id === l.variation_id)?.stock ?? p.stock)
                  : p.stock;
                if (st > 5) return null;
                const over = l.quantity > st;
                return (
                  <View style={styles.lowWarn} testID={`cart-low-${l.key}`}>
                    <Ionicons name="alert-circle" size={13} color={colors.error} />
                    <Text style={styles.lowWarnTxt}>
                      {over ? `Stok kurang! Sisa ${st}` : `Stok menipis · sisa ${st}`}
                    </Text>
                  </View>
                );
              })()}

              {/* Baris 2: harga×qty · stepper · subtotal */}
              <View style={styles.line2}>
                <Pressable style={styles.unitWrap} onPress={() => openEditPrice(l)} testID={`edit-price-${l.key}`}>
                  <Text style={styles.unitTxt} numberOfLines={1}>{rupiah(l.price)} x {l.quantity}</Text>
                  <Ionicons name="create-outline" size={12} color={colors.brand} />
                </Pressable>
                <View style={styles.qtyBox}>
                  <Pressable onPress={() => cart.dec(l.key)} style={styles.qtyBtn} testID={`cart-dec-${l.key}`}>
                    <Ionicons name="remove" size={18} color={colors.brand} />
                  </Pressable>
                  <QtyInput value={l.quantity} onCommit={(n) => cart.setQty(l.key, n)} testID={`cart-qty-${l.key}`} />
                  <Pressable onPress={() => cart.inc(l.key)} style={styles.qtyBtn} testID={`cart-inc-${l.key}`}>
                    <Ionicons name="add" size={18} color={colors.brand} />
                  </Pressable>
                </View>
                <Text style={styles.lineSub} numberOfLines={1}>{rupiah(l.price * l.quantity)}</Text>
              </View>
            </View>
          ))}

          {/* Tombol aksi di BAWAH barang terbaru */}
          <View style={styles.addBar}>
            <Pressable style={[styles.addBtnBig, styles.addBtnPrimary]} testID="item-manual-button" onPress={() => router.push("/produk-form?fromCart=1")}>
              <View style={styles.addIconCircle}><Ionicons name="add" size={18} color={colors.brand} /></View>
              <Text style={styles.addBtnPrimaryTxt}>Tambah Item</Text>
            </Pressable>
            <Pressable style={[styles.addBtnBig, styles.addBtnGhost]} testID="cari-barang-button" onPress={() => router.push("/cari?mode=cart")}>
              <Ionicons name="search" size={18} color={colors.brand} />
              <Text style={styles.addBtnGhostTxt}>Cari Barang</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <View style={[styles.payBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View>
          <Text style={styles.payItems}>{cart.count} item</Text>
          <Text style={styles.payTotal}>{rupiah(cart.total)}</Text>
        </View>
        <Pressable
          testID="bayar-button"
          disabled={cart.count === 0}
          onPress={() => router.push("/checkout?step=pay")}
          style={[styles.payBtn, cart.count === 0 && styles.payBtnDisabled]}
        >
          <Ionicons name="wallet-outline" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.payBtnTxt}>Bayar</Text>
        </Pressable>
      </View>

      {/* Popup Pilih Variasi (anak + variasi nested induk) — tetap di halaman Transaksi */}
      <Modal visible={!!variantFor} transparent animationType="fade" onRequestClose={closeVariant}>
        <Pressable style={styles.vBackdrop} onPress={closeVariant} testID="variasi-backdrop" />
        <View style={styles.vCenter} pointerEvents="box-none">
          <View style={styles.vCard}>
            <Text style={styles.vTitle} numberOfLines={1}>Pilih Variasi {variantFor?.name}</Text>
            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={styles.vWrap}>
              {/* Anak (produk terpisah dengan barcode sendiri) */}
              {variantFor && products.filter((p) => p.parent_id === variantFor.id).map((child) => {
                const eff = childEffective(child, variantFor);
                return (
                  <Pressable
                    key={child.id}
                    style={styles.vPill}
                    onPress={() => addChild(child, variantFor)}
                    testID={`variasi-child-${child.id}`}
                  >
                    <Text style={styles.vPillName} numberOfLines={1}>{child.name}</Text>
                    <Text style={styles.vPillPrice}>{rupiah(eff.sell_price)}</Text>
                  </Pressable>
                );
              })}
              {/* Variasi nested (di dalam induk) */}
              {variantFor?.variations?.map((v) => (
                <Pressable
                  key={v.id}
                  style={styles.vPill}
                  onPress={() => variantFor && onPickVariation(variantFor, v)}
                  testID={`variasi-${v.id}`}
                >
                  <Text style={styles.vPillName} numberOfLines={1}>{v.name}</Text>
                  <Text style={styles.vPillPrice}>{rupiah(v.inherit_tiers ? variantFor.sell_price : v.sell_price)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BottomSheetModal
        ref={priceSheet}
        enableDynamicSizing
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{editLine?.name}</Text>
          <Text style={styles.sheetLabel}>Harga Satuan (Rp)</Text>
          <View style={styles.priceInputBox}>
            <Text style={styles.rpPrefix}>Rp</Text>
            <EditPriceInput
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="numeric"
              autoFocus
              style={styles.priceInput}
              testID="edit-price-input"
            />
          </View>
          <Pressable style={styles.optRed} onPress={applyTemporary} testID="price-temporary">
            <Ionicons name="pricetag-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.optRedTxt}>Simpan untuk transaksi ini saja</Text>
          </Pressable>
          {editLine?.product_id ? (
            <Pressable style={styles.optDark} onPress={applyPermanent} testID="price-permanent">
              <Ionicons name="save-outline" size={18} color={colors.onSurfaceInverse} />
              <Text style={styles.optDarkTxt}>Simpan sebagai harga permanen</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.optCancel} onPress={() => priceSheet.current?.dismiss()} testID="price-cancel">
            <Text style={styles.optCancelTxt}>Batal</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Konfirmasi hapus barang */}
      <BottomSheetModal
        ref={deleteSheet}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <Text style={styles.sheetTitle}>Hapus barang ini?</Text>
          <Text style={styles.sheetLabel} numberOfLines={2}>{deleteLine?.name}</Text>
          <Pressable
            style={styles.optRed}
            testID="delete-confirm"
            onPress={() => {
              if (deleteLine) cart.remove(deleteLine.key);
              deleteSheet.current?.dismiss();
              toast.show("Barang dihapus", "success");
            }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.optRedTxt}>Hapus</Text>
          </Pressable>
          <Pressable style={styles.optCancel} testID="delete-cancel" onPress={() => deleteSheet.current?.dismiss()}>
            <Text style={styles.optCancelTxt}>Batal</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

function QtyInput({ value, onCommit, testID }: { value: number; onCommit: (n: number) => void; testID?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => { setTxt(String(value)); }, [value]);
  // Bersihkan input: hanya angka + satu pemisah desimal (titik/koma → titik).
  const sanitize = (t: string) => {
    let s = t.replace(",", ".").replace(/[^\d.]/g, "");
    const i = s.indexOf(".");
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
    return s;
  };
  const commit = () => {
    const n = Number(txt.replace(",", "."));
    // Jumlah harus > 0 (boleh desimal spt 0.5). Bila kosong/0 → kembalikan nilai lama.
    if (!Number.isFinite(n) || n <= 0) { setTxt(String(value)); return; }
    const rounded = Math.round(n * 1000) / 1000; // maksimal 3 desimal
    setTxt(String(rounded));
    if (rounded !== value) onCommit(rounded);
  };
  return (
    <TextInput
      value={txt}
      onChangeText={(t) => setTxt(sanitize(t))}
      onEndEditing={commit}
      onBlur={commit}
      keyboardType="decimal-pad"
      returnKeyType="done"
      selectTextOnFocus
      style={styles.qtyInput}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  top: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xs },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 0 },
  headerLeft: { marginRight: spacing.sm },
  quickArea: { flex: 1 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", rowGap: 4, columnGap: 4 },
  chip: {
    width: "18%", height: 28, borderRadius: 8, borderWidth: 1, borderColor: colors.brand,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  chipTxt: { color: colors.onSurfaceTertiary, fontFamily: font.bold, fontSize: 10 },
  gearBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center", marginLeft: 2 },
  vBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  vCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  vCard: { width: "100%", maxWidth: 360, backgroundColor: colors.surfaceSecondary, borderRadius: 20, borderWidth: 1.5, borderColor: colors.borderStrong, padding: spacing.lg },
  vTitle: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface, textAlign: "center", marginBottom: spacing.md },
  vWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" },
  vPill: { minWidth: "30%", flexGrow: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: "center" },
  vPillName: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  vPillPrice: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  hi: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.xs },
  pageTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.xl, marginTop: 0 },
  scanModeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, paddingLeft: 5, paddingRight: spacing.md, shadowColor: colors.brand, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  scanIcon: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  scanModeInput: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: radius.md },
  actBtnFilled: { backgroundColor: colors.brandSecondary },
  actBtnOutline: { backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.borderStrong },
  actTxt: { fontFamily: font.bold, fontSize: fontSize.base },
  // Tombol aksi (bawah daftar) — desain lebih cantik & senada tema.
  addBar: { flexDirection: "row", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  addBtnBig: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: 18 },
  addBtnPrimary: { backgroundColor: colors.brand, shadowColor: colors.brand, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  addBtnGhost: { backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.brand },
  addIconCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.onBrandPrimary, alignItems: "center", justifyContent: "center" },
  addBtnPrimaryTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  addBtnGhostTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  listHeadTxt: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.xs, letterSpacing: 1.2 },
  listHeadCount: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"] },
  emptyDesc: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg, textAlign: "center" },
  // kartu belanja compact (2 baris)
  card: { marginHorizontal: spacing.lg, marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  cardNew: { borderColor: colors.brand, backgroundColor: colors.surfaceTertiary },
  line1: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  line2: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  lowWarn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  lowWarnTxt: { color: colors.error, fontFamily: font.bold, fontSize: fontSize.xs },
  iconMini: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  unitWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 3 },
  unitTxt: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm },
  qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3, gap: 3 },
  qtyBtn: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  qtyInput: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, minWidth: 36, width: 44, height: 30, paddingVertical: 0, textAlign: "center" },
  lineName: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  lineNameGrosir: { color: colors.success },
  lineSub: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.base, minWidth: 64, textAlign: "right" },
  payBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
  payItems: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.sm },
  payTotal: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.xl },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, height: 46, borderRadius: radius.md, paddingHorizontal: 26 },
  payBtnDisabled: { backgroundColor: "#F2B8C2" },
  payBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: fontSize.lg },
  sheetTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  sheetLabel: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.base },
  priceInputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 54 },
  rpPrefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.lg, marginRight: 6 },
  priceInput: { flex: 1, color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  optRed: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.brand },
  optRedTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  optDark: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceInverse },
  optDarkTxt: { color: colors.onSurfaceInverse, fontFamily: font.bold, fontSize: fontSize.lg },
  optCancel: { alignItems: "center", justifyContent: "center", height: 48 },
  optCancelTxt: { color: colors.muted, fontFamily: font.bold, fontSize: fontSize.lg },
});
