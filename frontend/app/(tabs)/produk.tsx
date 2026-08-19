import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";

import { useData } from "@/src/data";
import { useUnlimitedStock } from "@/src/useUnlimitedStock";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { mikoBus } from "@/src/mikoBus";
import { useHideScanKeyboard } from "@/src/scanKeyboard";
import { useBarcodeScan } from "@/src/useBarcodeScan";
import { rupiah } from "@/src/format";
import { isBluetoothAvailable, printText, NATIVE_ONLY_MSG } from "@/src/printer";
import { buildBarcodeLabels } from "@/src/receipt";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";
import type { Product, Printer } from "@/src/types";



const ProdukRow = React.memo(function ProdukRow({
  item, childCount, onEdit, onMenu, onPrint, selectMode, checked, onToggle, unlimited,
}: { item: Product; childCount: number; onEdit: (id: string) => void; onMenu: (p: Product) => void; onPrint: (p: Product) => void; selectMode?: boolean; checked?: boolean; onToggle?: (id: string) => void; unlimited?: boolean }) {
  const nestedCount = item.variations.length;
  const totalVar = nestedCount + childCount;
  const hasVar = totalVar > 0;
  const stock = nestedCount > 0 ? item.variations.reduce((s, v) => s + (v.stock || 0), 0) : item.stock;
  const low = !unlimited && !hasVar && stock <= 5;
  const metaStock = unlimited ? "" : ` · Stok ${stock} ${item.unit}`;
  return (
    <Pressable
      style={[styles.card, selectMode && checked && styles.cardChecked]}
      testID={`produk-row-${item.id}`}
      onPress={() => (selectMode ? onToggle?.(item.id) : onEdit(item.id))}
    >
      {selectMode ? (
        <View style={styles.thumb}>
          <Ionicons name={checked ? "checkbox" : "square-outline"} size={26} color={checked ? colors.brand : colors.muted} />
        </View>
      ) : (
        <View style={styles.thumb}>
          <Ionicons name="cube-outline" size={22} color={colors.brand} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.rowName}>{item.name}</Text>
          {low && (
            <View style={styles.lowBadge}>
              <Ionicons name="alert-circle" size={11} color={colors.onBrandTertiary} />
              <Text style={styles.lowTxt}>Stok {stock}</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.barcode || "-"}{metaStock}{hasVar ? ` · ${totalVar} variasi` : ""}
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.pricePill}>
          <Text style={styles.pricePillTxt}>{hasVar ? "Bervariasi" : rupiah(item.sell_price)}</Text>
        </View>
        {!selectMode && (
          <>
            <Pressable onPress={() => onPrint(item)} style={styles.printBtn} testID={`produk-print-${item.id}`} hitSlop={6}>
              <Ionicons name="print-outline" size={20} color={colors.brand} />
            </Pressable>
            <Pressable onPress={() => onMenu(item)} style={styles.menuBtn} testID={`produk-menu-${item.id}`}>
              <Ionicons name="ellipsis-vertical" size={20} color={colors.muted} />
            </Pressable>
          </>
        )}
      </View>
    </Pressable>
  );
});

export default function ProdukScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { products, loading, reload } = useData();
  const unlimited = useUnlimitedStock();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [menuProduct, setMenuProduct] = useState<Product | null>(null);
  // Cetak Barcode
  const [printProduct, setPrintProduct] = useState<Product | null>(null);
  const [printQty, setPrintQty] = useState(1);
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [printing, setPrinting] = useState(false);
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [manualMode, setManualMode] = useState(false);
  // --- Mode Rapikan (multi-select hapus) ---
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const inputRef = useRef<TextInput>(null);
  const skipBlur = useRef(false);
  const kbdRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Muat sekali; hindari refetch ~700KB tiap pindah tab. Mutasi (simpan/hapus/
      // stok/transaksi) sudah memanggil reload() sendiri sehingga data tetap segar.
      if (products.length === 0) reload();
      setManualMode(false);
      // Keep the search field focused so the Bluetooth scanner works
      // immediately without tapping the field.
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, [reload, products.length]),
  );

  // Handle a barcode scan submitted from the Bluetooth scanner.
  const handleScan = useCallback(
    async (code: string) => {
      const c = code.trim();
      setQuery("");
      inputRef.current?.clear();
      if (!c) { inputRef.current?.focus(); return; }
      try {
        const product = await api.getByBarcode(c);
        setScanResult(product);
        Haptics.selectionAsync();
      } catch {
        setScanResult(null);
        toast.show(`Barcode ${c} tidak ditemukan`, "error");
      }
      // Ready for the next scan without touching the field again.
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [toast],
  );
  // Penerimaan input scanner Bluetooth yang andal; onChar menjaga pencarian manual tetap jalan.
  const scan = useBarcodeScan(handleScan, { onChar: setQuery, isScanMode: () => !kbdRef.current });

  const toggleKeyboard = () => {
    const next = !manualMode;
    setManualMode(next);
    skipBlur.current = true;
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  useEffect(() => { kbdRef.current = manualMode; }, [manualMode]);
  useHideScanKeyboard(inputRef, kbdRef);

  const deferredQuery = useDeferredValue(query);
  // Kelompokkan produk anak (punya parent_id) di bawah induk utama.
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      if (p.parent_id) {
        const arr = m.get(p.parent_id) || [];
        arr.push(p);
        m.set(p.parent_id, arr);
      }
    }
    return m;
  }, [products]);

  // Daftar HANYA menampilkan induk (produk tanpa parent_id). Variasi (anak)
  // disembunyikan dari daftar & hanya muncul saat induknya dibuka.
  const roots = useMemo(() => products.filter((p) => !p.parent_id), [products]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return roots;
    return roots.filter((p) => {
      const kids = childrenByParent.get(p.id) || [];
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        p.variations.some((v) => v.barcode?.toLowerCase().includes(q)) ||
        // Cari juga lewat data anak → tetap menemukan induk A saat mengetik nama/barcode B/C.
        kids.some((k) => k.name.toLowerCase().includes(q) || (k.barcode || "").toLowerCase().includes(q))
      );
    });
  }, [roots, childrenByParent, deferredQuery]);

  const onRefresh = async () => { setRefreshing(true); await reload(); setRefreshing(false); };

  const doDelete = async () => {
    if (!menuProduct) return;
    sheetRef.current?.dismiss();
    try { await api.deleteProduct(menuProduct.id); await reload(); toast.show("Produk dihapus", "success"); mikoBus.emit({ type: "product_deleted" }); }
    catch (e: any) { toast.show(e?.message || "Gagal menghapus", "error"); }
  };

  const doDuplicate = async () => {
    if (!menuProduct) return;
    sheetRef.current?.dismiss();
    try {
      const { id, created_at, updated_at, ...rest } = menuProduct as any;
      await api.createProduct({ ...rest, name: `${menuProduct.name} (copy)`, barcode: null });
      await reload();
      toast.show("Produk diduplikat", "success");
    } catch (e: any) { toast.show(e?.message || "Gagal menduplikat", "error"); }
  };

  const openMenu = useCallback((p: Product) => { setMenuProduct(p); sheetRef.current?.present(); }, []);
  const openEdit = useCallback((id: string) => router.push({ pathname: "/produk-form", params: { id } }), [router]);

  // --- Rapikan: seleksi & hapus massal (hanya DB aplikasi, bukan file backup) ---
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const enterSelect = () => { setSelectMode(true); setSelected(new Set()); setScanResult(null); };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const selectAll = () => setSelected(new Set(filtered.map((p) => p.id)));
  const clearAll = () => setSelected(new Set());

  const selectedCount = selected.size;
  // Ada produk terpilih yang punya variasi / produk turunan?
  const selectedHasVar = useMemo(() => {
    for (const id of selected) {
      const p = products.find((x) => x.id === id);
      if (!p) continue;
      if ((p.variations?.length || 0) > 0 || (childrenByParent.get(id)?.length || 0) > 0) return true;
    }
    return false;
  }, [selected, products, childrenByParent]);

  const doBulkDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    // Kumpulkan id induk terpilih + anak turunannya (parent_id) agar tak jadi yatim.
    const allIds = new Set<string>();
    for (const id of selected) {
      allIds.add(id);
      for (const k of (childrenByParent.get(id) || [])) allIds.add(k.id);
    }
    const remaining = Math.max(0, products.length - allIds.size);
    try {
      for (const id of allIds) { try { await api.deleteProduct(id); } catch {} }
      await reload();
      mikoBus.emit({ type: "product_deleted" });
      toast.show(`${selected.size} produk dihapus. Sisa ${remaining} produk.`, "success");
    } catch {
      toast.show("Sebagian produk gagal dihapus", "error");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setSelected(new Set());
      setSelectMode(false);
    }
  };

  const openPrint = useCallback((p: Product) => {
    setPrintProduct(p);
    setPrintQty(1);
    api.getPrinter().then(setPrinter).catch(() => setPrinter(null));
  }, []);

  const doPrint = async () => {
    if (!printProduct) return;
    if (!isBluetoothAvailable()) { toast.show(NATIVE_ONLY_MSG, "info"); return; }
    if (!printer?.address) { toast.show("Pilih printer Bluetooth dulu", "error"); return; }
    setPrinting(true);
    try {
      await printText(printer.address, buildBarcodeLabels(printProduct.name, printProduct.barcode, printQty));
      toast.show(`Barcode dicetak (${printQty})`, "success");
      setPrintProduct(null);
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencetak barcode", "error");
    } finally { setPrinting(false); }
  };

  // Muat printer tersimpan setiap layar difokus (mis. setelah kembali dari Pilih Printer).
  useFocusEffect(useCallback(() => { api.getPrinter().then(setPrinter).catch(() => {}); }, []));

  const renderRow = useCallback(
    ({ item }: { item: Product }) => (
      <ProdukRow
        item={item}
        childCount={(childrenByParent.get(item.id) || []).length}
        onEdit={openEdit}
        onMenu={openMenu}
        onPrint={openPrint}
        selectMode={selectMode}
        checked={selected.has(item.id)}
        onToggle={toggleSelect}
        unlimited={unlimited}
      />
    ),
    [openEdit, openMenu, openPrint, childrenByParent, selectMode, selected, toggleSelect, unlimited],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.titleBlock}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Produk</Text>
          <Text style={styles.subtitle}>{selectMode ? `${selectedCount} dipilih` : "Kelola katalog, harga & stok"}</Text>
        </View>
        {selectMode ? (
          <Pressable style={styles.tidyDone} testID="produk-tidy-done" onPress={exitSelect}>
            <Text style={styles.tidyDoneTxt}>Selesai</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.tidyBtn} testID="produk-tidy-button" onPress={enterSelect}>
              <Ionicons name="checkmark-done-outline" size={20} color={colors.brand} />
            </Pressable>
            <Pressable style={styles.addBtn} testID="produk-add-button" onPress={() => router.push("/produk-form")}>
              <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
              <Text style={styles.addTxt}>Tambah</Text>
            </Pressable>
          </>
        )}
      </View>

      {selectMode && (
        <View style={styles.tidyBar}>
          <Pressable style={styles.tidyChip} testID="produk-select-all" onPress={selectAll}>
            <Ionicons name="checkmark-done" size={16} color={colors.brand} />
            <Text style={styles.tidyChipTxt}>Pilih Semua</Text>
          </Pressable>
          <Pressable style={styles.tidyChip} testID="produk-clear-all" onPress={clearAll}>
            <Ionicons name="close" size={16} color={colors.muted} />
            <Text style={styles.tidyChipTxt}>Batalkan Semua</Text>
          </Pressable>
          <Text style={styles.tidyCount}>{selectedCount} dipilih</Text>
        </View>
      )}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, !manualMode && styles.searchBoxScan]}>
          <Ionicons name={manualMode ? "search" : "barcode-outline"} size={18} color={manualMode ? colors.muted : colors.brand} />
          <TextInput
            ref={inputRef}
            testID="produk-search-input"
            defaultValue=""
            onChangeText={scan.onChangeText}
            onSubmitEditing={() => { setManualMode(false); scan.onSubmitEditing(); }}
            onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } setManualMode(false); }}
            blurOnSubmit={false}
            showSoftInputOnFocus={manualMode}
            caretHidden={!manualMode}
            placeholder={manualMode ? "Ketik nama / kategori / barcode" : "Mode scan aktif — arahkan scanner ke barcode"}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); inputRef.current?.clear(); }} testID="produk-search-clear"><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>
          )}
          <Pressable onPress={toggleKeyboard} style={styles.kbdBtn} testID="produk-keyboard-toggle">
            <Ionicons name={manualMode ? "barcode-outline" : "keypad-outline"} size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>
      </View>

      {scanResult && (
        <Pressable
          style={styles.scanCard}
          testID="produk-scan-result"
          onPress={() => { const id = scanResult.id; setScanResult(null); router.push({ pathname: "/produk-form", params: { id } }); }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.scanCardLabel}>HASIL SCAN</Text>
            <Text style={styles.scanCardName} numberOfLines={1}>{scanResult.name}</Text>
            <Text style={styles.scanCardMeta} numberOfLines={1}>
              {scanResult.barcode || "-"}{unlimited ? "" : ` · Stok ${scanResult.variations.length ? scanResult.variations.reduce((s, v) => s + (v.stock || 0), 0) : scanResult.stock} ${scanResult.unit}`}
            </Text>
          </View>
          <Text style={styles.scanCardPrice}>{scanResult.variations.length ? "Bervariasi" : rupiah(scanResult.sell_price)}</Text>
          <Pressable onPress={() => { setScanResult(null); inputRef.current?.focus(); }} style={styles.scanCardClose} testID="produk-scan-close">
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </Pressable>
      )}

      {loading && products.length === 0 ? (
        <View style={styles.centerFill}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderRow}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={40}
          windowSize={9}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: (selectMode ? 96 : 24) + insets.bottom }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="cube-outline" size={40} color={colors.muted} />
              <Text style={styles.dim}>Belum ada produk</Text>
            </View>
          }
        />
      )}

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom + spacing.lg }}>
          <Text style={styles.menuTitle} numberOfLines={1}>{menuProduct?.name}</Text>
          <MenuItem icon="create-outline" label="Edit Produk" onPress={() => { sheetRef.current?.dismiss(); router.push({ pathname: "/produk-form", params: { id: menuProduct?.id } }); }} testID="menu-edit" />
          <MenuItem icon="layers-outline" label="Kelola Stok" onPress={() => { sheetRef.current?.dismiss(); router.push({ pathname: "/kelola-stok", params: { id: menuProduct?.id } }); }} testID="menu-stock" />
          <MenuItem icon="copy-outline" label="Duplikat" onPress={doDuplicate} testID="menu-duplicate" />
          <MenuItem icon="trash-outline" label="Hapus" danger onPress={doDelete} testID="menu-delete" />
        </BottomSheetView>
      </BottomSheetModal>

      {/* Bar bawah: Hapus produk terpilih */}
      {selectMode && selectedCount > 0 && (
        <View style={[styles.deleteBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable style={styles.deleteBtn} testID="produk-delete-selected" onPress={() => setConfirmOpen(true)}>
            <Ionicons name="trash-outline" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.deleteBtnTxt}>Hapus {selectedCount} Produk</Text>
          </Pressable>
        </View>
      )}

      {/* Modal konfirmasi hapus massal */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => !deleting && setConfirmOpen(false)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}><Ionicons name="trash" size={24} color={colors.error} /></View>
            <Text style={styles.confirmTitle}>Hapus {selectedCount} produk yang dipilih?</Text>
            {selectedHasVar && (
              <Text style={styles.confirmWarn}>Sebagian produk memiliki variasi. Menghapus produk induk dapat menghapus variasinya juga. Lanjutkan?</Text>
            )}
            <Text style={styles.confirmSub}>Hanya menghapus dari data aplikasi. File backup Kasir asli tidak terpengaruh.</Text>
            <View style={styles.confirmRow}>
              <Pressable style={styles.confirmCancel} testID="produk-delete-cancel" disabled={deleting} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.confirmCancelTxt}>Batal</Text>
              </Pressable>
              <Pressable style={styles.confirmDelete} testID="produk-delete-confirm" disabled={deleting} onPress={doBulkDelete}>
                {deleting ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.confirmDeleteTxt}>Hapus</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Cetak Barcode */}
      <Modal visible={!!printProduct} transparent animationType="fade" onRequestClose={() => setPrintProduct(null)}>
        <Pressable style={styles.confirmBackdrop} onPress={() => setPrintProduct(null)}>
          <Pressable style={styles.printCard} onPress={() => {}}>
            <View style={styles.printHead}>
              <View style={styles.printIcon}><Ionicons name="print" size={20} color={colors.brand} /></View>
              <Text style={styles.printTitle}>Cetak Barcode</Text>
            </View>
            <View style={styles.printInfo}>
              <Text style={styles.printInfoRow} numberOfLines={1}>Produk : <Text style={styles.printInfoVal}>{printProduct?.name}</Text></Text>
              <Text style={styles.printInfoRow} numberOfLines={1}>Barcode : <Text style={styles.printInfoVal}>{printProduct?.barcode || "(tanpa barcode)"}</Text></Text>
            </View>

            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>Jumlah</Text>
              <View style={styles.qtyBox}>
                <Pressable style={styles.qtyBtn} onPress={() => setPrintQty((q) => Math.max(1, q - 1))} testID="print-qty-dec"><Ionicons name="remove" size={18} color={colors.brand} /></Pressable>
                <Text style={styles.qtyVal} testID="print-qty-val">{printQty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => setPrintQty((q) => Math.min(50, q + 1))} testID="print-qty-inc"><Ionicons name="add" size={18} color={colors.brand} /></Pressable>
              </View>
            </View>

            <Pressable style={styles.printerPick} onPress={() => router.push("/pengaturan-printer")} testID="print-pick-printer">
              <Ionicons name="bluetooth" size={16} color={colors.brand} />
              <Text style={styles.printerPickTxt} numberOfLines={1}>{printer?.name ? printer.name : "Pilih Printer"}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>

            <View style={styles.printActions}>
              <Pressable style={styles.printCancel} onPress={() => setPrintProduct(null)} testID="print-cancel"><Text style={styles.printCancelTxt}>Batal</Text></Pressable>
              <Pressable style={styles.printGo} onPress={doPrint} disabled={printing} testID="print-go">
                {printing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="print" size={16} color={colors.onBrandPrimary} /><Text style={styles.printGoTxt}>Cetak</Text></>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, testID }: { icon: any; label: string; onPress: () => void; danger?: boolean; testID: string }) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={danger ? colors.error : colors.onSurface} />
      <Text style={[styles.menuItemTxt, danger && { color: colors.error }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleBlock: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontFamily: font.display, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: font.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, height: 48, borderRadius: radius.lg, shadowColor: colors.brand, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  addTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: fontSize.lg },
  tidyBtn: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  tidyDone: { paddingHorizontal: spacing.lg, height: 48, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  tidyDoneTxt: { color: colors.onBrandPrimary, fontFamily: font.display, fontSize: fontSize.lg },
  tidyBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tidyChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  tidyChipTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.sm },
  tidyCount: { marginLeft: "auto", color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm },
  cardChecked: { borderColor: colors.brand, borderWidth: 2, backgroundColor: colors.surfaceTertiary },
  deleteBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 54, borderRadius: radius.pill, backgroundColor: colors.error },
  deleteBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  confirmBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  confirmCard: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  confirmIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  confirmTitle: { fontFamily: font.bold, fontSize: fontSize.xl, color: colors.onSurface, textAlign: "center" },
  confirmWarn: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.error, textAlign: "center", lineHeight: 19 },
  confirmSub: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, textAlign: "center", lineHeight: 18 },
  confirmRow: { flexDirection: "row", gap: spacing.sm, width: "100%", marginTop: spacing.sm },
  confirmCancel: { flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  confirmCancelTxt: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg },
  confirmDelete: { flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: colors.error, alignItems: "center", justifyContent: "center" },
  confirmDeleteTxt: { color: colors.onBrandPrimary, fontFamily: font.bold, fontSize: fontSize.lg },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingLeft: 6, paddingRight: spacing.md, height: 52, borderWidth: 1, borderColor: colors.border },
  searchBoxScan: { borderWidth: 2, borderColor: colors.borderStrong },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
  kbdBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  scanCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceTertiary },
  scanCardLabel: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.sm, letterSpacing: 1 },
  scanCardName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, marginTop: 2 },
  scanCardMeta: { color: colors.onSurfaceSecondary, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  scanCardPrice: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.lg },
  scanCardClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, minHeight: 84, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, shadowColor: "#B0757F", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  thumb: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  rowName: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.base, lineHeight: 19, flexShrink: 1 },
  lowBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  lowTxt: { color: colors.onBrandTertiary, fontFamily: font.bold, fontSize: 10 },
  rowMeta: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 3 },
  pricePill: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pricePillTxt: { color: colors.brand, fontFamily: font.bold, fontSize: fontSize.base },
  actions: { flexDirection: "row", alignItems: "center", gap: 2 },
  menuBtn: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
  printBtn: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
  printCard: { width: "100%", maxWidth: 360, backgroundColor: colors.surfaceSecondary, borderRadius: 20, borderWidth: 1.5, borderColor: colors.borderStrong, padding: spacing.lg },
  printHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  printIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  printTitle: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface },
  printInfo: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, gap: 4, marginBottom: spacing.md },
  printInfoRow: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted },
  printInfoVal: { fontFamily: font.bold, color: colors.onSurface },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  qtyLabel: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 4, paddingVertical: 2 },
  qtyBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  qtyVal: { minWidth: 30, textAlign: "center", fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  printerPick: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.md },
  printerPickTxt: { flex: 1, fontFamily: font.bold, fontSize: fontSize.base, color: colors.brand },
  printActions: { flexDirection: "row", gap: spacing.sm },
  printCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  printCancelTxt: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  printGo: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand },
  printGoTxt: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onBrandPrimary },
  sep: { height: spacing.md },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  dim: { color: colors.muted, fontFamily: font.regular, fontSize: fontSize.lg },
  menuTitle: { color: colors.onSurface, fontFamily: font.bold, fontSize: fontSize.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  menuItemTxt: { color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.lg },
});
