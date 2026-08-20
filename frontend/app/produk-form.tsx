import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { useData } from "@/src/data";
import { useCart } from "@/src/cart";
import { useUnlimitedStock } from "@/src/useUnlimitedStock";
import { useToast } from "@/src/toast";
import { scanNotifBus } from "@/src/scanNotifBus";
import { api } from "@/src/api";
import { mikoBus } from "@/src/mikoBus";
import { rupiah } from "@/src/format";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Tier, Variation } from "@/src/types";

const UNITS = ["pcs", "kg", "sak"];
let vid = 0;
const newId = () => `v-${Date.now()}-${vid++}`;

export default function ProdukFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, fromCart } = useLocalSearchParams<{ id?: string; fromCart?: string }>();
  const { products, reload } = useData();
  const cart = useCart();
  const unlimited = useUnlimitedStock();
  const toast = useToast();

  // Dibuka dari tombol "Tambah Item" di Transaksi → tampilkan pilihan simpan:
  // "Transaksi Saat Ini" (item sementara → keranjang, tidak masuk DB) atau
  // "Simpan Permanen" (form produk lengkap seperti biasa → masuk DB Produk).
  const cameFromCart = fromCart === "1" && !id;
  const [saveMode, setSaveMode] = useState<"temp" | "permanent">("temp");
  const isTemp = cameFromCart && saveMode === "temp";

  const editing = useMemo(() => products.find((p) => p.id === id), [products, id]);
  // Variasi = produk anak yang tertaut ke induk ini (parent_id === induk).
  // Tiap variasi punya data sendiri (nama/barcode/harga/stok) & diedit terpisah.
  const childVariations = useMemo(
    () => (editing ? products.filter((p) => p.parent_id === editing.id) : []),
    [products, editing],
  );

  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "pcs");
  const [barcode, setBarcode] = useState(editing?.barcode ?? "");
  const [buyPrice, setBuyPrice] = useState(String(editing?.buy_price ?? ""));
  const [sellPrice, setSellPrice] = useState(String(editing?.sell_price ?? ""));
  const [stock, setStock] = useState(editing ? String(editing.stock ?? 0) : "999");
  const [quickQty, setQuickQty] = useState(editing?.quick_qty ? String(editing.quick_qty) : "");
  const [quickQty2, setQuickQty2] = useState(editing?.quick_qty2 ? String(editing.quick_qty2) : "");
  const [quickQty3, setQuickQty3] = useState(editing?.quick_qty3 ? String(editing.quick_qty3) : "");
  const [tiers, setTiers] = useState<Tier[]>(editing?.tiers ?? []);
  const [variations, setVariations] = useState<Variation[]>(editing?.variations ?? []);
  const [extraBarcodes, setExtraBarcodes] = useState<string[]>(
    Array.isArray(editing?.barcodes) && editing!.barcodes!.length > 0 ? editing!.barcodes! : [""],
  );
  // Ref tiap kolom barcode → agar bisa auto-focus & pindah otomatis saat scan.
  const barcodeRefs = useRef<(TextInput | null)[]>([]);
  const [saving, setSaving] = useState(false);
  const hasChildNow = editing ? products.some((p) => p.parent_id === editing.id) : false;
  const [priceType, setPriceType] = useState<"biasa" | "grosir" | "variasi" | "ikut" | "varbarcode">(
    editing
      ? (editing.price_type
          ?? ((editing.variations?.length || hasChildNow) ? "variasi" : (editing.tiers?.length ? "grosir" : "biasa")))
      : "biasa",
  );

  const num = (s: string) => Number((s || "0").replace(/[^\d.]/g, "")) || 0;

  // Auto-focus kolom barcode PERTAMA saat masuk mode yang punya bagian barcode
  // (Grosir/Variasi/Ikut Induk) → langsung siap scan berurutan tanpa klik.
  useEffect(() => {
    const showsBarcodes = priceType === "grosir" || priceType === "variasi" || priceType === "ikut";
    if (showsBarcodes && !isTemp) {
      const t = setTimeout(() => barcodeRefs.current[0]?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [priceType, isTemp]);

  // Simpan item HANYA untuk transaksi berjalan (tidak masuk DB Produk).
  const saveTemp = () => {
    if (!name.trim()) { toast.show("Nama barang wajib diisi", "error"); return; }
    const price = num(sellPrice);
    if (price <= 0) { toast.show("Harga jual harus lebih dari 0", "error"); return; }
    cart.addManual(name.trim(), price, 1);
    scanNotifBus.emit({ text: `${name.trim()} ditambahkan (transaksi ini)`, type: "success" });
    router.back();
  };

  const save = async () => {
    if (!name.trim()) {
      toast.show("Nama produk wajib diisi", "error");
      return;
    }
    if ((priceType === "variasi" || priceType === "biasa") && variations.some((v) => !v.name.trim())) {
      toast.show("Nama variasi tidak boleh kosong", "error");
      return;
    }
    if (priceType === "varbarcode") {
      if (variations.length === 0) {
        toast.show("Tambahkan minimal 1 variasi barcode", "error");
        return;
      }
      if (variations.some((v) => !v.name.trim())) {
        toast.show("Nama variasi tidak boleh kosong", "error");
        return;
      }
      if (variations.some((v) => !(v.barcode || "").trim())) {
        toast.show("Barcode setiap variasi wajib diisi", "error");
        return;
      }
      const codes = variations.map((v) => (v.barcode || "").trim());
      if (new Set(codes).size !== codes.length) {
        toast.show("Barcode sudah digunakan", "error");
        return;
      }
    }
    setSaving(true);
    const payload: Partial<Product> = {
      name: name.trim(),
      category: category.trim(),
      unit,
      barcode: barcode.trim() || null,
      barcodes: (priceType === "variasi" || priceType === "grosir" || priceType === "ikut")
        ? Array.from(new Set(extraBarcodes.map((b) => b.trim()).filter(Boolean)))
        : [],
      buy_price: num(buyPrice),
      sell_price: num(sellPrice),
      stock: num(stock),
      tiers: priceType === "grosir" ? tiers.filter((t) => t.min_qty > 0 || (!!t.disp_name && !!t.disp_name.trim())) : [],
      variations: (priceType === "variasi" || priceType === "biasa" || priceType === "varbarcode")
        ? variations.map((v) => ({
            ...v,
            barcode: priceType === "varbarcode" ? ((v.barcode || "").trim() || null) : null,
            buy_price: Number(v.buy_price) || 0,
            sell_price: Number(v.sell_price) || 0,
            stock: Number(v.stock) || 999,
            inherit_tiers: false,
            tiers: [],
          }))
        : [],
      price_type: priceType,
      quick_qty: num(quickQty) > 0 ? num(quickQty) : undefined,
      quick_qty2: num(quickQty2) > 0 ? num(quickQty2) : undefined,
      quick_qty3: num(quickQty3) > 0 ? num(quickQty3) : undefined,
    };
    try {
      if (editing) {
        await api.updateProduct(editing.id, payload);
        toast.show("Produk diperbarui", "success");
      } else {
        await api.createProduct(payload);
        toast.show("Produk ditambahkan", "success");
      }
      await reload();
      mikoBus.emit({ type: "product_saved" });
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.deleteProduct(editing.id);
      toast.show("Produk dihapus", "success");
      await reload();
      mikoBus.emit({ type: "product_deleted" });
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Gagal menghapus", "error");
    } finally {
      setSaving(false);
    }
  };

  const hasVar = variations.length > 0;

  // Pindahkan tiap variasi lama → satu baris Harga Bertingkat (grosir) SECARA BERPASANGAN:
  //   Nama Variasi  → Nama Tampilan (disp_name)
  //   Harga Jual    → Harga Tampilan (disp_price)
  // Min Qty & Harga (grosir) dibiarkan KOSONG. Pasangan nama–harga TIDAK boleh tertukar
  // antar-baris. Grosir dikosongkan lalu diisi ulang; Daftar Variasi dikosongkan.
  const moveVariationNamesToGrosir = () => {
    const rows = variations
      .map((v) => ({ name: (v.name || "").trim(), price: Number(v.sell_price) || 0 }))
      .filter((r) => r.name.length > 0);
    if (rows.length === 0) { toast.show("Tidak ada variasi untuk dipindahkan", "error"); return; }
    const newTiers: Tier[] = rows.map((r) => ({
      min_qty: 0,
      price: 0,
      disp_name: r.name,
      disp_price: r.price || undefined,
    }));
    setTiers(newTiers);
    setVariations([]);
    setPriceType("grosir");
    toast.show(`${rows.length} variasi dipindahkan ke grosir`, "success");
  };

  // Tambah 1 baris variasi (nama + harga jual). Dipakai di mode Biasa & Variasi.
  const addVarRow = () =>
    setVariations((v) => [
      ...v,
      { id: newId(), name: "", barcode: null, buy_price: 0, sell_price: 0, stock: 999, tiers: [], inherit_tiers: false },
    ]);

  // Baris editor variasi (Nama Variasi + Harga Jual + hapus). Sama untuk Biasa & Variasi.
  const renderVarRows = () =>
    variations.map((v, idx) => (
      <View key={v.id} style={styles.varPriceRow} testID={`form-variation-${idx}`}>
        <View style={{ flex: 1.4 }}>
          <Field label={idx === 0 ? "Nama Variasi" : ""} value={v.name} onChange={(t) => updateVar(setVariations, v.id, { name: t })} placeholder="mis. 1 pcs" testID={`form-var-name-${idx}`} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={idx === 0 ? "Harga Jual" : ""} value={String(v.sell_price || "")} onChange={(t) => updateVar(setVariations, v.id, { sell_price: Number(t.replace(/[^\d]/g, "")) || 0 })} keyboardType="numeric" prefix="Rp" testID={`form-var-sell-${idx}`} />
        </View>
        <Pressable onPress={() => setVariations((arr) => arr.filter((x) => x.id !== v.id))} testID={`form-variation-remove-${idx}`} style={[styles.varDelBtn, idx === 0 && { marginTop: 20 }]} hitSlop={6}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </View>
    ));

  // Kartu VARIASI BARCODE: Nama Variasi + Barcode + Harga Jual (tiap variasi punya
  // barcode & harga sendiri). Scan barcode → langsung "Induk — Variasi" ke keranjang.
  const renderVarBarcodeCards = () =>
    variations.map((v, idx) => (
      <View key={v.id} style={styles.vbCard} testID={`form-vb-card-${idx}`}>
        <View style={styles.vbCardHead}>
          <Text style={styles.vbCardTitle}>Variasi {idx + 1}</Text>
          <Pressable onPress={() => setVariations((arr) => arr.filter((x) => x.id !== v.id))} testID={`form-vb-remove-${idx}`} hitSlop={6}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </Pressable>
        </View>
        <Field label="Nama Variasi" value={v.name} onChange={(t) => updateVar(setVariations, v.id, { name: t })} placeholder="mis. 600ml" testID={`form-vb-name-${idx}`} />
        <Field label="Barcode" value={v.barcode ?? ""} onChange={(t) => updateVar(setVariations, v.id, { barcode: t })} placeholder="Scan / masukkan barcode" keyboardType="default" testID={`form-vb-barcode-${idx}`} />
        <Field label="Harga Jual" value={String(v.sell_price || "")} onChange={(t) => updateVar(setVariations, v.id, { sell_price: Number(t.replace(/[^\d]/g, "")) || 0 })} keyboardType="numeric" prefix="Rp" testID={`form-vb-sell-${idx}`} />
      </View>
    ));

  // Tambah 1 variasi barcode (nama + barcode + harga).
  const addVarBarcode = () =>
    setVariations((v) => [
      ...v,
      { id: newId(), name: "", barcode: "", buy_price: 0, sell_price: 0, stock: 999, tiers: [], inherit_tiers: false },
    ]);


  // Scan barcode berurutan: Enter dari scanner = selesai 1 barcode → validasi
  // duplikat → auto-focus kolom berikutnya. Bila duplikat: peringatan & tetap di
  // kolom itu (dikosongkan) sampai barcode valid.
  const onBarcodeSubmit = (idx: number) => {
    const val = (extraBarcodes[idx] || "").trim();
    if (!val) { barcodeRefs.current[idx]?.focus(); return; }
    const dup = extraBarcodes.some((b, i) => i !== idx && b.trim() && b.trim() === val);
    if (dup) {
      toast.show("Barcode sudah digunakan", "error");
      setExtraBarcodes((arr) => arr.map((x, i) => (i === idx ? "" : x)));
      setTimeout(() => barcodeRefs.current[idx]?.focus(), 40);
      return;
    }
    const next = idx + 1;
    if (next < extraBarcodes.length) {
      setTimeout(() => barcodeRefs.current[next]?.focus(), 40);
    }
    // Kolom terakhir → tetap di form (tidak pindah halaman).
  };

  // Bagian "Variasi" berisi HANYA barcode (tanpa nama/harga). Dipakai di mode
  // Grosir (scan → langsung masuk, harga ikut tier) & Variasi (scan → popup pilih).
  const renderBarcodeSection = (title: string, hint: string) => (
    <>
      <View style={[styles.sectionHead, { marginTop: spacing.lg }]}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable testID="form-add-barcode" onPress={() => setExtraBarcodes((arr) => [...arr, ""])} style={styles.addSmall}>
          <Ionicons name="add" size={18} color={colors.brand} />
          <Text style={styles.addSmallTxt}>Tambah Barcode</Text>
        </Pressable>
      </View>
      {extraBarcodes.map((b, idx) => (
        <View key={idx} style={styles.varPriceRow} testID={`form-barcode-row-${idx}`}>
          <View style={{ flex: 1 }}>
            <View style={[styles.inputBox, { marginBottom: spacing.md }]}>
              <TextInput
                ref={(r) => { barcodeRefs.current[idx] = r; }}
                testID={`form-barcode-input-${idx}`}
                value={b}
                onChangeText={(t) => setExtraBarcodes((arr) => arr.map((x, i) => (i === idx ? t : x)))}
                onSubmitEditing={() => onBarcodeSubmit(idx)}
                blurOnSubmit={false}
                returnKeyType="next"
                placeholder="Masukkan Barcode"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>
          </View>
          <Pressable
            onPress={() => setExtraBarcodes((arr) => (arr.length > 1 ? arr.filter((_, i) => i !== idx) : [""]))}
            testID={`form-barcode-remove-${idx}`}
            style={styles.varDelBtn}
            hitSlop={6}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </Pressable>
        </View>
      ))}
      <Text style={styles.childHint}>{hint}</Text>
    </>
  );

  const delChild = (c: Product) => {
    Alert.alert(
      "Hapus Variasi?",
      `Variasi "${c.name}" akan dihapus permanen.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteProduct(c.id);
              toast.show("Variasi dihapus", "success");
              await reload();
              mikoBus.emit({ type: "product_deleted" });
            } catch (e: any) {
              toast.show(e?.message || "Gagal menghapus", "error");
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.hBtn} testID="form-close">
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.hTitle}>{editing ? "Ubah Produk" : "Tambah Produk"}</Text>
        <Pressable onPress={del} disabled={!editing} style={styles.hBtn} testID="form-delete">
          {editing && <Ionicons name="trash" size={22} color={colors.error} />}
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={90}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Dari "Tambah Item" (Transaksi): pilih cara simpan. */}
        {cameFromCart && (
          <>
            <Text style={styles.label}>Cara Simpan</Text>
            <View style={[styles.unitRow, { flexWrap: "wrap", rowGap: spacing.sm }]}>
              <Pressable onPress={() => setSaveMode("temp")} style={[styles.unitChip, saveMode === "temp" && styles.unitChipActive]} testID="form-savemode-temp">
                <Text style={[styles.unitTxt, saveMode === "temp" && styles.unitTxtActive]}>Transaksi Saat Ini</Text>
              </Pressable>
              <Pressable onPress={() => setSaveMode("permanent")} style={[styles.unitChip, saveMode === "permanent" && styles.unitChipActive]} testID="form-savemode-permanent">
                <Text style={[styles.unitTxt, saveMode === "permanent" && styles.unitTxtActive]}>Simpan Permanen</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              {isTemp
                ? "Hanya untuk transaksi ini. Tidak disimpan ke data Produk."
                : "Disimpan permanen ke data Produk & bisa dipakai transaksi berikutnya."}
            </Text>
          </>
        )}

        <Field label={isTemp ? "Nama Barang" : "Nama Produk"} value={name} onChange={setName} placeholder="mis. Kantong Plastik" testID="form-name" />

        {isTemp && (
          <Field label="Harga Jual" value={sellPrice} onChange={setSellPrice} keyboardType="numeric" prefix="Rp" testID="form-sell" />
        )}

        {!isTemp && (<>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Kategori" value={category} onChange={setCategory} placeholder="mis. Sembako" testID="form-category" />
          </View>
        </View>

        <Text style={styles.label}>Satuan</Text>
        <View style={styles.unitRow}>
          {UNITS.map((u) => (
            <Pressable key={u} onPress={() => setUnit(u)} style={[styles.unitChip, unit === u && styles.unitChipActive]} testID={`form-unit-${u}`}>
              <Text style={[styles.unitTxt, unit === u && styles.unitTxtActive]}>{u}</Text>
            </Pressable>
          ))}
        </View>

        {priceType !== "varbarcode" && (
          <Field label="Barcode" value={barcode ?? ""} onChange={setBarcode} placeholder="Scan / ketik barcode" keyboardType="default" testID="form-barcode" />
        )}

        <Text style={styles.label}>Jenis Harga</Text>
        <View style={[styles.unitRow, { flexWrap: "wrap", rowGap: spacing.sm }]}>
          {(["biasa", "grosir", "variasi", "ikut", "varbarcode"] as const).map((v) => (
            <Pressable key={v} onPress={() => setPriceType(v)} style={[styles.unitChip, priceType === v && styles.unitChipActive]} testID={`form-pricetype-${v}`}>
              <Text style={[styles.unitTxt, priceType === v && styles.unitTxtActive]}>
                {v === "biasa" ? "Biasa" : v === "grosir" ? "Grosir" : v === "variasi" ? "Variasi" : v === "ikut" ? "Ikut Induk" : "Variasi Barcode"}
              </Text>
            </Pressable>
          ))}
        </View>
        {priceType === "grosir" && (
          <Text style={styles.hint}>Harga turun otomatis saat jumlah beli mencapai batas grosir.</Text>
        )}
        {priceType === "variasi" && (
          <Text style={styles.hint}>Tiap variasi punya harga sendiri; muncul popup pilih saat transaksi & tampil semua di Cek Harga.</Text>
        )}
        {priceType === "ikut" && (
          <Text style={styles.hint}>Banyak barcode → 1 produk induk. Scan barcode mana pun → langsung masuk keranjang pakai Harga Jual Induk (tanpa popup). Ubah harga induk → semua barcode ikut.</Text>
        )}
        {priceType === "varbarcode" && (
          <Text style={styles.hint}>Tiap variasi punya barcode & harga sendiri. Scan barcode → langsung masuk keranjang sebagai &quot;Induk — Variasi&quot; (tanpa popup).</Text>
        )}

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label={priceType === "ikut" ? "Harga Beli Induk" : "Harga Beli"} value={buyPrice} onChange={setBuyPrice} keyboardType="numeric" prefix="Rp" testID="form-buy" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={priceType === "ikut" ? "Harga Jual Induk" : (priceType === "variasi" && hasVar ? "Harga Induk" : "Harga Jual")} value={sellPrice} onChange={setSellPrice} keyboardType="numeric" prefix="Rp" testID="form-sell" />
          </View>
        </View>

        {!hasVar && !unlimited && (
          <Field label="Stok" value={stock} onChange={setStock} keyboardType="numeric" testID="form-stock" />
        )}

        {!isTemp && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.label}>Jumlah Cepat (tombol tambah cepat)</Text>
            <View style={styles.quickRow}>
              <View style={[styles.inputBox, styles.quickCell]}>
                <TextInput
                  testID="form-quickqty"
                  value={quickQty}
                  onChangeText={(t) => setQuickQty(t.replace(/[^\d]/g, ""))}
                  placeholder="mis. 3"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
              <View style={[styles.inputBox, styles.quickCell]}>
                <TextInput
                  testID="form-quickqty2"
                  value={quickQty2}
                  onChangeText={(t) => setQuickQty2(t.replace(/[^\d]/g, ""))}
                  placeholder="mis. 6"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
              <View style={[styles.inputBox, styles.quickCell]}>
                <TextInput
                  testID="form-quickqty3"
                  value={quickQty3}
                  onChangeText={(t) => setQuickQty3(t.replace(/[^\d]/g, ""))}
                  placeholder="mis. 12"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
            </View>
            <Text style={styles.helperTxt}>Muncul sebagai tombol di keranjang. Tiap tap MENAMBAH jumlah sebesar angka itu. Kosongkan yang tak dipakai.</Text>
          </View>
        )}

        {/* Mode BIASA: variasi opsional (nama + harga jual sendiri). Tanpa variasi →
            produk pakai Harga Jual utama seperti biasa. Barcode & grosir tidak diubah. */}
        {priceType === "biasa" && (<>
        <View style={[styles.sectionHead, { marginTop: spacing.md }]}>
          <Text style={styles.sectionTitle}>Variasi</Text>
          <Pressable testID="form-add-variation-biasa" onPress={addVarRow} style={styles.addSmall}>
            <Ionicons name="add" size={18} color={colors.brand} />
            <Text style={styles.addSmallTxt}>Tambah Variasi</Text>
          </Pressable>
        </View>
        {variations.length === 0 && (
          <Text style={styles.childHint}>Opsional. Tanpa variasi → pakai Harga Jual utama. Ketuk &quot;Tambah Variasi&quot; untuk harga pilihan.</Text>
        )}
        {renderVarRows()}
        {variations.length > 0 && (
          <Text style={styles.childHint}>Ada variasi → saat produk discan muncul pilihan harga. Harga Jual utama tetap tersimpan.</Text>
        )}
        </>)}

        {/* Tiered / wholesale pricing */}
        {priceType === "grosir" && (<>
          <TierEditor title="Harga Bertingkat (grosir)" tiers={tiers} onChange={setTiers} testPrefix="form-tier" />
          {renderBarcodeSection("Variasi", "Hanya daftar barcode untuk menemukan produk yang sama (tanpa nama/harga). Saat discan → produk LANGSUNG masuk keranjang, harga otomatis ikut Daftar Harga Grosir sesuai jumlah (tanpa popup).")}
        </>)}

        {priceType === "variasi" && (<>
        {/* Variasi: gabungan variasi lama (nested, diedit inline) + variasi baru (produk anak tertaut).
            Semua tampil di dalam induk. Tombol Tambah Variasi membuat produk anak (datar) ke induk ini. */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Daftar Harga Variasi ({variations.length})</Text>
          <Pressable
            testID="form-add-variation"
            onPress={() =>
              setVariations((v) => [
                ...v,
                { id: newId(), name: "", barcode: null, buy_price: 0, sell_price: 0, stock: 999, tiers: [], inherit_tiers: false },
              ])
            }
            style={styles.addSmall}
          >
            <Ionicons name="add" size={18} color={colors.brand} />
            <Text style={styles.addSmallTxt}>Tambah Variasi Harga</Text>
          </Pressable>
        </View>
        {variations.length > 0 && (
          <>
            <Pressable style={styles.moveBtn} onPress={moveVariationNamesToGrosir} testID="form-move-var-to-grosir">
              <Ionicons name="swap-horizontal" size={18} color={colors.brand} />
              <Text style={styles.moveBtnTxt}>Pindahkan variasi ke grosir</Text>
            </Pressable>
            <Text style={styles.childHint}>Memindahkan tiap variasi ke Harga Bertingkat (grosir): Nama Variasi → Nama Tampilan, Harga Jual → Harga Tampilan (berpasangan). Min Qty & Harga grosir dikosongkan; Daftar Variasi akan dikosongkan.</Text>
          </>
        )}
        {variations.length === 0 && childVariations.length === 0 && (
          <Text style={styles.childHint}>Belum ada variasi. Ketuk &quot;Tambah Variasi Harga&quot; untuk mulai.</Text>
        )}

        {/* Variasi baru (produk anak) — ketuk untuk mengubah data masing-masing */}
        {editing && childVariations.length > 0 && (
          <View testID="form-child-variations">
            {childVariations.map((c) => (
              <Pressable
                key={c.id}
                style={styles.childCard}
                testID={`child-variation-${c.id}`}
                onPress={() => router.push({ pathname: "/produk-form", params: { id: c.id } })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.childName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.childMeta} numberOfLines={1}>{c.barcode || "Tanpa barcode"}{unlimited ? "" : ` · Stok ${c.stock} ${c.unit}`}</Text>
                  <Text style={styles.childMeta} numberOfLines={1}>Jual {rupiah(c.sell_price)} · Beli {rupiah(c.buy_price)}</Text>
                </View>
                <Pressable
                  onPress={() => delChild(c)}
                  style={styles.childDel}
                  testID={`child-variation-delete-${c.id}`}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color={colors.brand} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Bagian A: rows Nama + Harga Jual (satu-satunya sumber harga). Barcode cukup 1 di atas (kolom Barcode produk). */}
        {renderVarRows()}
        {renderBarcodeSection("Variasi / Barcode", "Semua barcode di atas membuka daftar harga variasi yang sama. Saat discan → muncul pilihan variasi.")}
        </>)}

        {/* Mode IKUT INDUK: banyak barcode → 1 produk induk. Scan → langsung masuk
            keranjang pakai Harga Jual Induk (tanpa popup, tanpa harga per-barcode). */}
        {priceType === "ikut" && (
          renderBarcodeSection("Variasi / Barcode", "Hanya daftar barcode produk induk (tanpa nama/harga). Scan barcode mana pun → LANGSUNG masuk keranjang pakai Harga Jual Induk. Ubah harga induk → semua barcode otomatis ikut.")
        )}

        {/* Mode VARIASI BARCODE: tiap variasi = Nama + Barcode + Harga sendiri. Scan
            barcode → langsung "Induk — Variasi" ke keranjang (tanpa popup). */}
        {priceType === "varbarcode" && (<>
          <View style={[styles.sectionHead, { marginTop: spacing.lg }]}>
            <Text style={styles.sectionTitle}>Variasi Barcode</Text>
            <Pressable testID="form-add-vb" onPress={addVarBarcode} style={styles.addSmall}>
              <Ionicons name="add" size={18} color={colors.brand} />
              <Text style={styles.addSmallTxt}>Tambah Variasi Barcode</Text>
            </Pressable>
          </View>
          {variations.length > 0 && (
            <>
              <Pressable style={styles.moveBtn} onPress={moveVariationNamesToGrosir} testID="form-move-vb-to-grosir">
                <Ionicons name="swap-horizontal" size={18} color={colors.brand} />
                <Text style={styles.moveBtnTxt}>Pindahkan variasi ke grosir</Text>
              </Pressable>
              <Text style={styles.childHint}>Memindahkan tiap variasi ke Harga Bertingkat (grosir): Nama Variasi → Nama Tampilan, Harga Jual → Harga Tampilan (berpasangan). Barcode variasi tidak ikut; Daftar Variasi akan dikosongkan.</Text>
            </>
          )}
          {variations.length === 0 && (
            <Text style={styles.childHint}>Ketuk &quot;Tambah Variasi Barcode&quot; untuk membuat variasi (mis. 600ml → barcode → Rp3.000).</Text>
          )}
          {renderVarBarcodeCards()}
        </>)}
        </>)}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable testID="form-save" onPress={isTemp ? saveTemp : save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.5 }]}>
            <Ionicons name={isTemp ? "cart" : "save"} size={20} color={colors.onBrandPrimary} />
            <Text style={styles.saveTxt}>{isTemp ? "Simpan untuk Transaksi Saat Ini" : (editing ? "Simpan Perubahan" : "Simpan Produk")}</Text>
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function updateVar(setter: React.Dispatch<React.SetStateAction<Variation[]>>, id: string, patch: Partial<Variation>) {
  setter((arr) => arr.map((v) => (v.id === id ? { ...v, ...patch } : v)));
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  prefix,
  testID,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  prefix?: string;
  testID?: string;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputBox}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType || "default"}
          style={styles.input}
        />
      </View>
    </View>
  );
}

function TierEditor({
  title,
  tiers,
  onChange,
  testPrefix,
}: {
  title: string;
  tiers: Tier[];
  onChange: (t: Tier[]) => void;
  testPrefix: string;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable
          testID={`${testPrefix}-add`}
          onPress={() => onChange([...tiers, { min_qty: 0, price: 0 }])}
          style={styles.addSmall}
        >
          <Ionicons name="add" size={18} color={colors.brand} />
          <Text style={styles.addSmallTxt}>Tambah</Text>
        </Pressable>
      </View>
      {tiers.map((t, i) => (
        <View key={i} style={styles.tierCard} testID={`${testPrefix}-${i}`}>
          <View style={styles.tierRow}>
            <View style={styles.tierField}>
              <Text style={styles.tierLbl}>Min Qty</Text>
              <TextInput
                testID={`${testPrefix}-qty-${i}`}
                value={t.min_qty ? String(t.min_qty) : ""}
                onChangeText={(v) => onChange(tiers.map((x, xi) => (xi === i ? { ...x, min_qty: Number(v.replace(/[^\d]/g, "")) || 0 } : x)))}
                keyboardType="numeric"
                style={styles.tierInput}
                placeholder="0"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.tierField}>
              <Text style={styles.tierLbl}>Harga</Text>
              <TextInput
                testID={`${testPrefix}-price-${i}`}
                value={t.price ? String(t.price) : ""}
                onChangeText={(v) => onChange(tiers.map((x, xi) => (xi === i ? { ...x, price: Number(v.replace(/[^\d]/g, "")) || 0 } : x)))}
                keyboardType="numeric"
                style={styles.tierInput}
                placeholder="0"
                placeholderTextColor={colors.muted}
              />
            </View>
            <Pressable onPress={() => onChange(tiers.filter((_, xi) => xi !== i))} style={styles.tierDel} testID={`${testPrefix}-remove-${i}`}>
              <Ionicons name="close" size={18} color={colors.error} />
            </Pressable>
          </View>
          <View style={styles.tierRow}>
            <View style={styles.tierField}>
              <Text style={styles.tierLbl}>Nama Tampilan</Text>
              <TextInput
                testID={`${testPrefix}-dispname-${i}`}
                value={t.disp_name ?? ""}
                onChangeText={(v) => onChange(tiers.map((x, xi) => (xi === i ? { ...x, disp_name: v } : x)))}
                style={styles.tierInput}
                placeholder="mis. 3 pcs"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.tierField}>
              <Text style={styles.tierLbl}>Harga Tampilan</Text>
              <TextInput
                testID={`${testPrefix}-dispprice-${i}`}
                value={t.disp_price ? String(t.disp_price) : ""}
                onChangeText={(v) => onChange(tiers.map((x, xi) => (xi === i ? { ...x, disp_price: Number(v.replace(/[^\d]/g, "")) || undefined } : x)))}
                keyboardType="numeric"
                style={styles.tierInput}
                placeholder="mis. 3500"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>
          <Text style={styles.tierHint}>Yang tampil ke pelanggan di Cek Harga. Min Qty & Harga di atas tetap dipakai untuk perhitungan.</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  hBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  hTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.xl },
  label: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.base, marginBottom: 6 },
  helperTxt: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 6 },
  quickRow: { flexDirection: "row", gap: spacing.sm },
  quickCell: { flex: 1, paddingHorizontal: spacing.sm },
  inputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 48 },
  prefix: { color: colors.muted, fontFamily: font.medium, fontSize: fontSize.lg, marginRight: 6 },
  input: { flex: 1, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  row2: { flexDirection: "row", gap: spacing.md },
  unitRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  unitChip: { paddingHorizontal: spacing.lg, height: 40, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  unitChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  unitTxt: { color: colors.onSurfaceSecondary, fontFamily: font.medium, fontSize: fontSize.base },
  unitTxtActive: { color: colors.onBrandPrimary, fontFamily: font.bold },
  hint: { color: colors.warning, fontFamily: font.regular, fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 18 },
  childSection: { marginBottom: spacing.md },
  childHint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2, marginBottom: spacing.sm },
  childCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  vbCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  vbCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  vbCardTitle: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  childDel: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  childName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  childMeta: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  addSmall: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  addSmallTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  moveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surface },
  moveBtnTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  tierCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm },
  tierRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  tierNoteField: { marginTop: spacing.sm },
  tierHint: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 6 },
  tierField: { flex: 1 },
  tierLbl: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginBottom: 4 },
  tierInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 44, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  tierDel: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  varCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  varPriceRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  varDelBtn: { width: 40, height: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  varBcRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  varBcLabel: { width: 120 },
  varBcName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base },
  varBcPrice: { color: colors.brand, fontFamily: font.medium, fontSize: fontSize.sm },
  varHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  varTitle: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  inheritRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary },
  saveBtn: { height: 54, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
