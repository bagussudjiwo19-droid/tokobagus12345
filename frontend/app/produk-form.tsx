import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { useData } from "@/src/data";
import { useToast } from "@/src/toast";
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { products, reload } = useData();
  const toast = useToast();

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
  const [tiers, setTiers] = useState<Tier[]>(editing?.tiers ?? []);
  const [variations, setVariations] = useState<Variation[]>(editing?.variations ?? []);
  const [saving, setSaving] = useState(false);

  const num = (s: string) => Number((s || "0").replace(/[^\d.]/g, "")) || 0;

  const save = async () => {
    if (!name.trim()) {
      toast.show("Nama produk wajib diisi", "error");
      return;
    }
    if (variations.some((v) => !v.name.trim())) {
      toast.show("Nama variasi tidak boleh kosong", "error");
      return;
    }
    setSaving(true);
    const payload: Partial<Product> = {
      name: name.trim(),
      category: category.trim(),
      unit,
      barcode: barcode.trim() || null,
      buy_price: num(buyPrice),
      sell_price: num(sellPrice),
      stock: num(stock),
      tiers: tiers.filter((t) => t.min_qty > 0),
      variations: variations.map((v) => ({
        ...v,
        buy_price: Number(v.buy_price) || 0,
        sell_price: Number(v.sell_price) || 0,
        stock: Number(v.stock) || 0,
        tiers: (v.tiers || []).filter((t) => t.min_qty > 0),
      })),
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

  // Hapus cepat satu variasi (produk anak) langsung dari form induk.
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
        <Field label="Nama Produk" value={name} onChange={setName} placeholder="mis. Gula Pasir 1kg" testID="form-name" />

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

        <Field label="Barcode" value={barcode ?? ""} onChange={setBarcode} placeholder="Scan / ketik barcode" keyboardType="default" testID="form-barcode" />

        {hasVar && (
          <Text style={styles.hint}>
            {`Produk punya variasi — harga jual & bertingkat induk dipakai oleh variasi yang memilih "Ikuti Induk". Cukup isi Harga Induk.`}
          </Text>
        )}

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Harga Beli" value={buyPrice} onChange={setBuyPrice} keyboardType="numeric" prefix="Rp" testID="form-buy" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={hasVar ? "Harga Induk" : "Harga Jual"} value={sellPrice} onChange={setSellPrice} keyboardType="numeric" prefix="Rp" testID="form-sell" />
          </View>
        </View>

        {!hasVar && (
          <Field label="Stok" value={stock} onChange={setStock} keyboardType="numeric" testID="form-stock" />
        )}

        {/* Tiered / wholesale pricing */}
        <TierEditor title="Harga Bertingkat (grosir)" tiers={tiers} onChange={setTiers} testPrefix="form-tier" />

        {/* Variasi: gabungan variasi lama (nested, diedit inline) + variasi baru (produk anak tertaut).
            Semua tampil di dalam induk. Tombol Tambah Variasi membuat produk anak (datar) ke induk ini. */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Variasi ({childVariations.length + variations.length})</Text>
          {editing ? (
            <Pressable
              testID="form-add-variation"
              onPress={() => router.push({ pathname: "/variasi-cepat", params: { id: editing.id } })}
              style={styles.addSmall}
            >
              <Ionicons name="add" size={18} color={colors.brand} />
              <Text style={styles.addSmallTxt}>Tambah Variasi</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="form-add-variation"
              onPress={() =>
                setVariations((v) => [
                  ...v,
                  { id: newId(), name: "", barcode: null, buy_price: 0, sell_price: 0, stock: 999, tiers: [], inherit_tiers: true },
                ])
              }
              style={styles.addSmall}
            >
              <Ionicons name="add" size={18} color={colors.brand} />
              <Text style={styles.addSmallTxt}>Tambah Variasi</Text>
            </Pressable>
          )}
        </View>

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
                  <Text style={styles.childMeta} numberOfLines={1}>{c.barcode || "Tanpa barcode"} · Stok {c.stock} {c.unit}</Text>
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

        {/* Variasi lama (bawaan/nested) — tetap bisa diedit di sini, data tidak diubah */}
        {variations.length > 0 && (
          <Text style={styles.childHint}>Variasi bawaan (dalam produk) — ubah langsung di kolom di bawah.</Text>
        )}
        {variations.map((v, idx) => (
          <View key={v.id} style={styles.varCard} testID={`form-variation-${idx}`}>
            <View style={styles.varHead}>
              <Text style={styles.varTitle}>Variasi {idx + 1}</Text>
              <Pressable onPress={() => setVariations((arr) => arr.filter((x) => x.id !== v.id))} testID={`form-variation-remove-${idx}`}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
            <Field label="Nama Variasi" value={v.name} onChange={(t) => updateVar(setVariations, v.id, { name: t })} placeholder="mis. Ayam Bawang" testID={`form-var-name-${idx}`} />
            <Field label="Barcode Variasi" value={v.barcode ?? ""} onChange={(t) => updateVar(setVariations, v.id, { barcode: t })} placeholder="opsional" testID={`form-var-barcode-${idx}`} />
            <View style={styles.inheritRow}>
              <Text style={styles.label}>Ikuti Harga Induk</Text>
              <Switch
                testID={`form-var-inherit-${idx}`}
                value={v.inherit_tiers}
                onValueChange={(val) => updateVar(setVariations, v.id, { inherit_tiers: val })}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.row2}>
              {!v.inherit_tiers && (
                <View style={{ flex: 1 }}>
                  <Field label="Harga Jual" value={String(v.sell_price || "")} onChange={(t) => updateVar(setVariations, v.id, { sell_price: Number(t.replace(/[^\d]/g, "")) || 0 })} keyboardType="numeric" prefix="Rp" testID={`form-var-sell-${idx}`} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Field label="Stok" value={String(v.stock || "")} onChange={(t) => updateVar(setVariations, v.id, { stock: Number(t.replace(/[^\d]/g, "")) || 0 })} keyboardType="numeric" testID={`form-var-stock-${idx}`} />
              </View>
            </View>
            {!v.inherit_tiers && (
              <TierEditor
                title="Harga Bertingkat Variasi"
                tiers={v.tiers || []}
                onChange={(t) => updateVar(setVariations, v.id, { tiers: t })}
                testPrefix={`form-var-tier-${idx}`}
              />
            )}
          </View>
        ))}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable testID="form-save" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.5 }]}>
            <Ionicons name="save" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.saveTxt}>{editing ? "Simpan Perubahan" : "Simpan Produk"}</Text>
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
      <Text style={styles.label}>{label}</Text>
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
        <View key={i} style={styles.tierRow} testID={`${testPrefix}-${i}`}>
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
  childDel: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  childName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  childMeta: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  addSmall: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  addSmallTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  tierRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginBottom: spacing.sm },
  tierField: { flex: 1 },
  tierLbl: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginBottom: 4 },
  tierInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 44, color: colors.onSurface, fontFamily: font.regular, fontSize: fontSize.lg },
  tierDel: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  varCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  varHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  varTitle: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  inheritRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary },
  saveBtn: { height: 54, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
});
