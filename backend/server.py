from fastapi import FastAPI, APIRouter, HTTPException, Body
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Pilihan mesin DB server: "mongo" (default, tak berubah) atau "postgres" (self-host).
DB_ENGINE = os.environ.get("DB_ENGINE", "mongo").strip().lower()

# MongoDB dibuat OPSIONAL agar server bisa jalan Postgres-only (tanpa MONGO_URL).
mongo_url = os.environ.get("MONGO_URL")
client = AsyncIOMotorClient(mongo_url) if mongo_url else None
db = client[os.environ.get("DB_NAME", "toko_bagus")] if client else None

app = FastAPI(title="Toko Bagus API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("toko_bagus")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ----------------------------- Models -----------------------------
class Tier(BaseModel):
    min_qty: int
    price: float


class Variation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    barcode: Optional[str] = None
    buy_price: float = 0
    sell_price: float = 0
    stock: float = 0
    tiers: List[Tier] = Field(default_factory=list)
    inherit_tiers: bool = False


class ProductIn(BaseModel):
    name: str
    category: Optional[str] = ""
    unit: Optional[str] = "pcs"
    barcode: Optional[str] = None
    parent_id: Optional[str] = None
    buy_price: float = 0
    sell_price: float = 0
    stock: float = 0
    tiers: List[Tier] = Field(default_factory=list)
    inherit_tiers: bool = False
    variations: List[Variation] = Field(default_factory=list)


class Product(ProductIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class TxItem(BaseModel):
    product_id: Optional[str] = None
    variation_id: Optional[str] = None
    name: str
    barcode: Optional[str] = None
    unit: Optional[str] = "pcs"
    price: float
    quantity: float
    subtotal: float


class TransactionIn(BaseModel):
    items: List[TxItem]
    total: float
    discount: float = 0
    cash_paid: float = 0
    change: float = 0


class Transaction(TransactionIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)


class TransactionUpdate(TransactionIn):
    created_at: Optional[str] = None


class Settings(BaseModel):
    shopName: str = "TOKO BAGUS"
    address: str = ""
    phone: str = ""
    cashier: str = ""
    note: str = ""
    thanks: str = "Terima kasih sudah berbelanja"
    showShopName: bool = True
    showAddress: bool = True
    showPhone: bool = True
    showLogo: bool = False
    showDateTime: bool = True
    showTxNumber: bool = True
    showQueue: bool = False
    showCashier: bool = False
    showQR: bool = False
    showItemName: bool = True
    showVariation: bool = True
    showBarcode: bool = False
    showUnitPrice: bool = True
    showQty: bool = True
    showSubtotal: bool = True
    showDiscount: bool = False
    showTotal: bool = True
    showCashPaid: bool = True
    showChange: bool = True
    voiceChange: bool = True
    showNote: bool = False
    showThanks: bool = True


class Printer(BaseModel):
    address: Optional[str] = None
    name: Optional[str] = None


SETTINGS_ID = "app_settings"
PRINTER_ID = "app_printer"


def clean(doc: dict) -> dict:
    if doc:
        doc.pop("_id", None)
    return doc


# ----------------------------- Seeding -----------------------------
async def seed_if_empty():
    try:
        count = await db.products.count_documents({})
        if count > 0:
            logger.info(f"Products already present ({count}); skip seed.")
            await ensure_settings()
            return
        seed_path = ROOT_DIR / "seed" / "toko_bagus_backup.json"
        if not seed_path.exists():
            logger.warning("Seed file not found; starting empty.")
            await ensure_settings()
            return
        with open(seed_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        products = data.get("products", [])
        transactions = data.get("transactions", [])
        if products:
            await db.products.insert_many(products)
        if transactions:
            await db.transactions.insert_many(transactions)
        settings = data.get("settings") or Settings().model_dump()
        settings["_id"] = SETTINGS_ID
        await db.settings.replace_one({"_id": SETTINGS_ID}, settings, upsert=True)
        printer = data.get("printer") or {"address": None, "name": None}
        printer["_id"] = PRINTER_ID
        await db.printer.replace_one({"_id": PRINTER_ID}, printer, upsert=True)
        logger.info(f"Seeded {len(products)} products, {len(transactions)} transactions.")
    except Exception as e:
        logger.exception(f"Seed failed: {e}")


async def ensure_settings():
    s = await db.settings.find_one({"_id": SETTINGS_ID})
    if not s:
        d = Settings().model_dump()
        d["_id"] = SETTINGS_ID
        await db.settings.replace_one({"_id": SETTINGS_ID}, d, upsert=True)


# ----------------------------- Routes -----------------------------
@api_router.get("/")
async def root():
    return {"message": "Toko Bagus API", "status": "ok"}


@api_router.get("/products/pos")
async def get_products_pos():
    docs = await db.products.find().sort("name", 1).to_list(100000)
    by_id = {d["id"]: d for d in docs}
    out = []
    for d in docs:
        c = clean(d)
        # Variasi "ikut induk" → harga bertingkat diambil DINAMIS dari induk utama.
        if d.get("parent_id") and d.get("inherit_tiers"):
            root = by_id.get(d["parent_id"])
            if root:
                c["tiers"] = root.get("tiers") or []
        out.append(c)
    return out


@api_router.get("/products")
async def get_products(search: Optional[str] = None, limit: int = 100000):
    query: Dict[str, Any] = {}
    if search:
        query = {"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"barcode": {"$regex": search, "$options": "i"}},
        ]}
    docs = await db.products.find(query).sort("name", 1).to_list(limit)
    return [clean(d) for d in docs]


@api_router.get("/products/barcode/{code}")
async def get_by_barcode(code: str):
    doc = await db.products.find_one({"barcode": code})
    if not doc:
        doc = await db.products.find_one({"variations.barcode": code})
    if not doc:
        raise HTTPException(status_code=404, detail="Barcode belum terdaftar")
    c = clean(doc)
    # Variasi "ikut induk" → harga bertingkat diambil dinamis dari induk utama.
    if doc.get("parent_id") and doc.get("inherit_tiers"):
        root = await db.products.find_one({"id": doc["parent_id"]})
        if root:
            c["tiers"] = root.get("tiers") or []
    return c


async def _resolve_root_parent(parent_id: str) -> str:
    """Telusuri ke atas rantai parent_id sampai menemukan induk utama (root)
    yang tidak punya parent_id. Menjamin pengelompokan datar A -> B/C/D."""
    seen: set = set()
    current = parent_id
    while current and current not in seen:
        seen.add(current)
        doc = await db.products.find_one({"id": current})
        if not doc:
            break
        pid = doc.get("parent_id")
        if not pid:
            return current
        current = pid
    return parent_id


@api_router.post("/products")
async def create_product(payload: ProductIn):
    data = payload.model_dump()
    # Pengaman induk: variasi SELALU tertaut ke induk utama/original (A).
    # Bila client mengirim id produk yang sendirinya sudah punya induk (mis. B),
    # telusuri ke atas sampai root sehingga tidak pernah terbentuk rantai
    # bertingkat (A -> B -> C). Yang diizinkan hanya A -> B, A -> C, A -> D.
    if data.get("parent_id"):
        data["parent_id"] = await _resolve_root_parent(data["parent_id"])
    prod = Product(**data)
    d = prod.model_dump()
    await db.products.insert_one(dict(d))
    return clean(d)


@api_router.put("/products/{pid}")
async def update_product(pid: str, payload: ProductIn):
    existing = await db.products.find_one({"id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    update = payload.model_dump()
    update["updated_at"] = now_iso()
    await db.products.update_one({"id": pid}, {"$set": update})
    doc = await db.products.find_one({"id": pid})
    return clean(doc)


@api_router.patch("/products/{pid}/stock")
async def update_stock(pid: str, body: dict = Body(...)):
    stock = body.get("stock")
    variation_id = body.get("variation_id")
    existing = await db.products.find_one({"id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    if variation_id:
        variations = existing.get("variations", [])
        for v in variations:
            if v.get("id") == variation_id:
                v["stock"] = stock
        await db.products.update_one({"id": pid}, {"$set": {"variations": variations, "updated_at": now_iso()}})
    else:
        await db.products.update_one({"id": pid}, {"$set": {"stock": stock, "updated_at": now_iso()}})
    doc = await db.products.find_one({"id": pid})
    return clean(doc)


@api_router.delete("/products/{pid}")
async def delete_product(pid: str):
    res = await db.products.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    return {"ok": True}


@api_router.get("/transactions")
async def get_transactions(limit: int = 200):
    docs = await db.transactions.find().sort("created_at", -1).to_list(limit)
    return [clean(d) for d in docs]


@api_router.get("/transactions/{tid}")
async def get_transaction(tid: str):
    doc = await db.transactions.find_one({"id": tid})
    if not doc:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return clean(doc)


@api_router.post("/transactions")
async def create_transaction(payload: TransactionIn):
    tx = Transaction(**payload.model_dump())
    d = tx.model_dump()
    await db.transactions.insert_one(dict(d))
    for item in payload.items:
        if not item.product_id:
            continue
        prod = await db.products.find_one({"id": item.product_id})
        if not prod:
            continue
        if item.variation_id:
            variations = prod.get("variations", [])
            for v in variations:
                if v.get("id") == item.variation_id and isinstance(v.get("stock"), (int, float)):
                    v["stock"] = v.get("stock", 0) - item.quantity
            await db.products.update_one({"id": item.product_id}, {"$set": {"variations": variations}})
        else:
            if isinstance(prod.get("stock"), (int, float)):
                await db.products.update_one({"id": item.product_id}, {"$inc": {"stock": -item.quantity}})
    return clean(d)


@api_router.put("/transactions/{tid}")
async def update_transaction(tid: str, payload: TransactionUpdate):
    existing = await db.transactions.find_one({"id": tid})
    if not existing:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")

    # Reconcile stock: add back the old quantities, subtract the new ones.
    old_map: dict = {}
    for it in existing.get("items", []):
        pid = it.get("product_id")
        if not pid:
            continue
        k = (pid, it.get("variation_id"))
        old_map[k] = old_map.get(k, 0) + (it.get("quantity") or 0)

    new_map: dict = {}
    for it in payload.items:
        if not it.product_id:
            continue
        k = (it.product_id, it.variation_id)
        new_map[k] = new_map.get(k, 0) + (it.quantity or 0)

    for (pid, vid) in set(old_map) | set(new_map):
        # delta > 0 -> restock (qty reduced), delta < 0 -> reduce more (qty increased)
        delta = old_map.get((pid, vid), 0) - new_map.get((pid, vid), 0)
        if delta == 0:
            continue
        prod = await db.products.find_one({"id": pid})
        if not prod:
            continue
        if vid:
            variations = prod.get("variations", [])
            changed = False
            for v in variations:
                if v.get("id") == vid and isinstance(v.get("stock"), (int, float)):
                    v["stock"] = v.get("stock", 0) + delta
                    changed = True
            if changed:
                await db.products.update_one({"id": pid}, {"$set": {"variations": variations}})
        else:
            if isinstance(prod.get("stock"), (int, float)):
                await db.products.update_one({"id": pid}, {"$inc": {"stock": delta}})

    update = {
        "items": [i.model_dump() for i in payload.items],
        "total": payload.total,
        "discount": payload.discount,
        "cash_paid": payload.cash_paid,
        "change": payload.change,
    }
    # Keep the original date/time unless a new one is explicitly provided.
    if payload.created_at:
        update["created_at"] = payload.created_at
    await db.transactions.update_one({"id": tid}, {"$set": update})
    doc = await db.transactions.find_one({"id": tid})
    return clean(doc)


@api_router.get("/settings")
async def get_settings():
    s = await db.settings.find_one({"_id": SETTINGS_ID})
    if not s:
        await ensure_settings()
        s = await db.settings.find_one({"_id": SETTINGS_ID})
    # Merge dengan default model agar field baru (mis. voiceChange) selalu ada.
    return {**Settings().model_dump(), **clean(s)}


@api_router.put("/settings")
async def put_settings(payload: Settings):
    d = payload.model_dump()
    d["_id"] = SETTINGS_ID
    await db.settings.replace_one({"_id": SETTINGS_ID}, d, upsert=True)
    return clean(dict(d))


@api_router.get("/printer")
async def get_printer():
    p = await db.printer.find_one({"_id": PRINTER_ID})
    return clean(p) if p else {"address": None, "name": None}


@api_router.put("/printer")
async def put_printer(payload: Printer):
    d = payload.model_dump()
    d["_id"] = PRINTER_ID
    await db.printer.replace_one({"_id": PRINTER_ID}, d, upsert=True)
    return clean(dict(d))


@api_router.get("/reports/summary")
async def reports_summary():
    # Hitung total di database (agregasi) agar hemat memori walau transaksi banyak.
    pipeline = [{"$group": {"_id": None, "total_omzet": {"$sum": "$total"}, "total_transaksi": {"$sum": 1}}}]
    agg = await db.transactions.aggregate(pipeline).to_list(1)
    if agg:
        return {"total_transaksi": agg[0].get("total_transaksi", 0), "total_omzet": agg[0].get("total_omzet", 0)}
    return {"total_transaksi": 0, "total_omzet": 0}


@api_router.get("/backup/export")
async def backup_export():
    products = [clean(d) for d in await db.products.find().to_list(100000)]
    transactions = [clean(d) for d in await db.transactions.find().sort("created_at", -1).to_list(100000)]
    settings = clean(await db.settings.find_one({"_id": SETTINGS_ID}) or Settings().model_dump())
    printer = clean(await db.printer.find_one({"_id": PRINTER_ID}) or {"address": None, "name": None})
    return {
        "app": "kasir-warung",
        "version": 1,
        "exported_at": now_iso(),
        "counts": {"products": len(products), "transactions": len(transactions)},
        "products": products,
        "transactions": transactions,
        "settings": settings,
        "printer": printer,
    }


@api_router.post("/backup/import")
async def backup_import(data: dict = Body(...)):
    # 1) Validasi struktur file SEBELUM menyentuh data lama.
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="File backup tidak valid atau rusak.")
    products = data.get("products")
    transactions = data.get("transactions", [])
    if not isinstance(products, list) or not isinstance(transactions, list):
        raise HTTPException(status_code=400, detail="File backup tidak valid (data produk/transaksi tidak ditemukan).")
    if len(products) == 0:
        raise HTTPException(status_code=400, detail="File backup tidak berisi produk. Pemulihan dibatalkan agar data lama tetap aman.")

    def strip_id(d: dict) -> dict:
        d = dict(d)
        d.pop("_id", None)
        return d

    # 2) Dedupe berdasarkan "id" (cegah duplikat) + validasi model.
    seen_p = set()
    cprods = []
    try:
        for p in products:
            p = strip_id(p)
            Product(**p)  # akan error jika format produk rusak
            pid = p.get("id")
            if pid and pid in seen_p:
                continue
            if pid:
                seen_p.add(pid)
            cprods.append(p)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="File backup rusak: data produk tidak sesuai format. Data lama tidak diubah.")

    seen_t = set()
    ctx = []
    try:
        for t in transactions:
            t = strip_id(t)
            if not isinstance(t.get("items"), list):
                raise ValueError("transaksi tanpa items")
            tid = t.get("id")
            if tid and tid in seen_t:
                continue
            if tid:
                seen_t.add(tid)
            ctx.append(t)
    except Exception:
        raise HTTPException(status_code=400, detail="File backup rusak: data transaksi tidak sesuai format. Data lama tidak diubah.")

    # 3) Staging ke koleksi sementara — jika gagal, data lama TIDAK tersentuh.
    await db.products_tmp.drop()
    await db.transactions_tmp.drop()
    try:
        if cprods:
            await db.products_tmp.insert_many([strip_id(p) for p in cprods])
        if ctx:
            await db.transactions_tmp.insert_many([strip_id(t) for t in ctx])
    except Exception:
        await db.products_tmp.drop()
        await db.transactions_tmp.drop()
        raise HTTPException(status_code=400, detail="Gagal memproses file backup. Data lama tidak diubah.")

    # 4) Staging sukses → baru ganti data lama.
    await db.products.delete_many({})
    await db.transactions.delete_many({})
    if cprods:
        await db.products.insert_many([strip_id(p) for p in cprods])
    if ctx:
        await db.transactions.insert_many([strip_id(t) for t in ctx])
    await db.products_tmp.drop()
    await db.transactions_tmp.drop()

    if data.get("settings"):
        s = strip_id(data["settings"])
        s["_id"] = SETTINGS_ID
        await db.settings.replace_one({"_id": SETTINGS_ID}, s, upsert=True)
    if data.get("printer"):
        pr = strip_id(data["printer"])
        pr["_id"] = PRINTER_ID
        await db.printer.replace_one({"_id": PRINTER_ID}, pr, upsert=True)
    return {"ok": True, "products": len(cprods), "transactions": len(ctx)}


# ----------------------------- SYNC (Hybrid Cloud) -----------------------------
# Sinkronisasi multi-HP tanpa login. Data dipisah per "Kode Toko" (store).
# Aturan gabung: produk/pengaturan = "yang terbaru menang" (LWW by updated_at ms),
# transaksi = union by id (LWW). Penghapusan produk memakai flag deleted (tombstone).
import time as _time


def _ms() -> int:
    return int(_time.time() * 1000)


@api_router.get("/sync/pull")
async def sync_pull(store: str, since: int = 0):
    # PENTING: cursor sinkron memakai srv_at (jam SERVER saat data ditulis),
    # bukan updated_at (jam HP pengirim). Ini mencegah produk "terlewat" akibat
    # beda jam antar-HP. since==0 = ambil SEMUA (bootstrap HP baru); since>0 =
    # hanya yang ditulis server setelah cursor terakhir.
    if DB_ENGINE == "postgres":
        import pg_store
        return await pg_store.pull(store, since)
    pq = {"store": store}
    tq = {"store": store}
    if since > 0:
        pq["srv_at"] = {"$gt": since}
        tq["srv_at"] = {"$gt": since}
    prods = await db.s_products.find(pq).to_list(1000000)
    txs = await db.s_transactions.find(tq).to_list(1000000)
    bqs = await db.s_bukti.find(tq).to_list(1000000)
    sett = await db.s_settings.find_one({"store": store})
    settings = None
    if sett and (since == 0 or int(sett.get("srv_at", 0)) > since):
        settings = {"doc": sett.get("doc"), "updated_at": int(sett.get("updated_at", 0))}
    return {
        "now": _ms(),
        "products": [{"id": p["id"], "doc": p.get("doc"), "updated_at": int(p.get("updated_at", 0)), "deleted": bool(p.get("deleted", False))} for p in prods],
        "transactions": [{"id": t["id"], "doc": t.get("doc"), "updated_at": int(t.get("updated_at", 0))} for t in txs],
        "bukti": [{"id": b["id"], "doc": b.get("doc"), "updated_at": int(b.get("updated_at", 0))} for b in bqs],
        "settings": settings,
    }


@api_router.post("/sync/push")
async def sync_push(body: dict = Body(...)):
    store = body.get("store")
    if not store:
        raise HTTPException(status_code=400, detail="Kode Toko wajib diisi")
    if DB_ENGINE == "postgres":
        import pg_store
        return await pg_store.push(store, body.get("products") or [], body.get("transactions") or [], body.get("settings"))
    srv = _ms()  # stempel jam SERVER untuk semua data yang benar-benar ditulis
    for p in (body.get("products") or []):
        pid = p.get("id")
        if not pid:
            continue
        upd = int(p.get("updated_at") or 0)
        existing = await db.s_products.find_one({"store": store, "id": pid})
        if existing and int(existing.get("updated_at", 0)) > upd:
            continue  # server punya versi lebih baru → jangan ditimpa
        await db.s_products.update_one(
            {"store": store, "id": pid},
            {"$set": {"store": store, "id": pid, "doc": p.get("doc"), "updated_at": upd, "srv_at": srv, "deleted": bool(p.get("deleted", False))}},
            upsert=True,
        )
    for t in (body.get("transactions") or []):
        tid = t.get("id")
        if not tid:
            continue
        upd = int(t.get("updated_at") or 0)
        existing = await db.s_transactions.find_one({"store": store, "id": tid})
        if existing and int(existing.get("updated_at", 0)) > upd:
            continue
        await db.s_transactions.update_one(
            {"store": store, "id": tid},
            {"$set": {"store": store, "id": tid, "doc": t.get("doc"), "updated_at": upd, "srv_at": srv}},
            upsert=True,
        )
    for b in (body.get("bukti") or []):
        bid = b.get("id")
        if not bid:
            continue
        upd = int(b.get("updated_at") or 0)
        existing = await db.s_bukti.find_one({"store": store, "id": bid})
        if existing and int(existing.get("updated_at", 0)) > upd:
            continue
        await db.s_bukti.update_one(
            {"store": store, "id": bid},
            {"$set": {"store": store, "id": bid, "doc": b.get("doc"), "updated_at": upd, "srv_at": srv}},
            upsert=True,
        )
    sett = body.get("settings")
    if sett and sett.get("doc") is not None:
        upd = int(sett.get("updated_at") or 0)
        existing = await db.s_settings.find_one({"store": store})
        if not (existing and int(existing.get("updated_at", 0)) > upd):
            await db.s_settings.update_one(
                {"store": store},
                {"$set": {"store": store, "doc": sett.get("doc"), "updated_at": upd, "srv_at": srv}},
                upsert=True,
            )
    return {"ok": True, "now": srv}


# ----------------------------- OCR BUKTI PEMBAYARAN (AI Vision) ---------------
# Membaca screenshot bukti pembayaran (ShopeePay/GoPay/DANA/OVO/QRIS/transfer bank)
# dan mengekstrak field terstruktur. ATURAN UTAMA: JANGAN menebak. Field yang
# tidak terbaca jelas dikembalikan value=null + confident=false agar HP menandai
# untuk dicek pengguna. Model: Gemini 3 Flash (default) / penyedia OpenAI-compatible.
OCR_MODEL = ("gemini", "gemini-3-flash-preview")

OCR_SYSTEM = (
    "Kamu adalah mesin OCR untuk BUKTI PEMBAYARAN digital Indonesia "
    "(ShopeePay, GoPay, DANA, OVO, QRIS, LinkAja, transfer bank, m-banking, dll). "
    "Tugasmu HANYA membaca teks yang BENAR-BENAR terlihat pada gambar lalu "
    "mengembalikan data terstruktur. DILARANG KERAS menebak, mengarang, atau "
    "melengkapi angka yang tidak jelas. Jika sebuah field tidak terbaca dengan "
    "yakin, kembalikan value null dan confident=false. Jawab HANYA JSON, tanpa "
    "penjelasan, tanpa markdown."
)

OCR_PROMPT = (
    "Ekstrak informasi dari gambar bukti pembayaran/transfer ini. Kembalikan HANYA JSON "
    "dengan bentuk PERSIS seperti ini (tanpa teks lain):\n"
    "{\n"
    '  "amount":             {"value": <bilangan bulat rupiah TANPA titik/koma, nominal/jumlah transfer> atau null, "confident": <true|false>},\n'
    '  "sender_name":        {"value": <string nama pengirim> atau null, "confident": <true|false>},\n'
    '  "sender_bank":        {"value": <string bank/aplikasi pengirim, mis. "SeaBank"|"BCA"|"GoPay"> atau null, "confident": <true|false>},\n'
    '  "sender_account":     {"value": <string no. rekening/no. tujuan pengirim> atau null, "confident": <true|false>},\n'
    '  "recipient":          {"value": <string nama penerima/merchant, mis. "Shopee"> atau null, "confident": <true|false>},\n'
    '  "recipient_username": {"value": <string username tujuan> atau null, "confident": <true|false>},\n'
    '  "method":             {"value": <string metode transaksi, mis. "SeaBank Bayar Instan"|"QRIS"|"Transfer Bank"> atau null, "confident": <true|false>},\n'
    '  "ref":                {"value": <string nomor referensi> atau null, "confident": <true|false>},\n'
    '  "txno":               {"value": <string nomor transaksi> atau null, "confident": <true|false>},\n'
    '  "product":            {"value": <string produk/keterangan, mis. "Pembayaran Shopee"|"Token Listrik"|"Pulsa"> atau null, "confident": <true|false>},\n'
    '  "customer_name":      {"value": <string nama pelanggan (khusus Token Listrik PLN)> atau null, "confident": <true|false>},\n'
    '  "customer_id":        {"value": <string ID pelanggan / nomor meter PLN (11-12 digit)> atau null, "confident": <true|false>},\n'
    '  "token":              {"value": <string nomor TOKEN/STROOM listrik (biasanya 20 digit dikelompokkan 4-4-4-4-4)> atau null, "confident": <true|false>},\n'
    '  "phone":              {"value": <string nomor HP tujuan isi pulsa/paket> atau null, "confident": <true|false>},\n'
    '  "operator":           {"value": <string operator seluler, mis. "Telkomsel"|"XL"|"Indosat"|"Tri"|"Smartfren"|"Axis"> atau null, "confident": <true|false>},\n'
    '  "date":               {"value": <string tanggal apa adanya seperti tertulis> atau null, "confident": <true|false>},\n'
    '  "time":               {"value": <string waktu, mis. "21:55"> atau null, "confident": <true|false>}\n'
    "}\n"
    "ATURAN: (1) amount adalah nominal transaksi UTAMA (jumlah transfer / nominal token / nominal pulsa), bukan saldo/biaya admin/harga jual. "
    "(2) Jika ragu pada sebuah field, WAJIB value=null dan confident=false — jangan menebak. "
    "(3) Field Token Listrik (customer_name, customer_id, token) & Pulsa (phone, operator) hanya diisi bila memang ada di gambar; selain itu null. "
    "(4) Jangan menambah field lain. (5) Baca APA ADANYA dari gambar, jangan mengubah/melengkapi."
)


class OcrBuktiIn(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"


def _parse_ocr_json(text: str) -> dict:
    t = (text or "").strip()
    # Buang pagar kode markdown bila ada.
    if t.startswith("```"):
        t = t.strip("`")
        if t.lower().startswith("json"):
            t = t[4:]
    # Ambil blok {...} pertama.
    i, j = t.find("{"), t.rfind("}")
    if i != -1 and j != -1 and j > i:
        t = t[i:j + 1]
    return json.loads(t)


def _norm_field(f: Any) -> Dict[str, Any]:
    # Normalkan tiap field ke {value, confident} yang aman.
    if isinstance(f, dict):
        val = f.get("value", None)
        conf = bool(f.get("confident", False))
    else:
        val = f
        conf = False
    if isinstance(val, str) and val.strip().lower() in ("", "null", "none", "-", "tidak yakin", "tidak terbaca"):
        val = None
    if val is None:
        conf = False
    return {"value": val, "confident": conf}


async def _ocr_vision(system_message: str, prompt: str, image_b64: str, mime: str) -> str:
    provider = os.environ.get("LLM_PROVIDER", "emergent").strip().lower()

    if provider in ("openai", "openai_compatible", "custom"):
        base = os.environ.get("LLM_BASE_URL", "").rstrip("/")
        key = os.environ.get("LLM_API_KEY", "")
        model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
        if not base or not key:
            raise HTTPException(status_code=503, detail="LLM_BASE_URL/LLM_API_KEY belum diatur")
        url = base + "/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
                ]},
            ],
            "temperature": 0,
            "max_tokens": 500,
        }
        async with httpx.AsyncClient(timeout=45) as hc:
            r = await hc.post(url, json=payload, headers={"Authorization": f"Bearer {key}"})
            r.raise_for_status()
            data = r.json()
        return (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()

    # Default: Emergent (Gemini 3 Flash vision).
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="LLM key belum diatur")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    chat = LlmChat(api_key=key, session_id=f"ocr-{uuid.uuid4()}", system_message=system_message).with_model(*OCR_MODEL)
    img = ImageContent(image_base64=image_b64)
    reply = await chat.send_message(UserMessage(text=prompt, file_contents=[img]))
    return (reply or "").strip()


@api_router.post("/ocr/bukti")
async def ocr_bukti(payload: OcrBuktiIn):
    """OCR bukti pembayaran → JSON terstruktur. Field ragu = value null + confident false."""
    if not payload.image_base64:
        raise HTTPException(status_code=400, detail="Gambar kosong")
    # Buang prefix data URI bila ikut terkirim.
    b64 = payload.image_base64
    if "," in b64 and b64.strip().lower().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    mime = payload.mime_type or "image/jpeg"

    try:
        raw = await _ocr_vision(OCR_SYSTEM, OCR_PROMPT, b64, mime)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ocr_bukti llm error: {e}")
        raise HTTPException(status_code=502, detail="AI pembaca gambar sedang sibuk")

    try:
        parsed = _parse_ocr_json(raw)
    except Exception:
        logger.error(f"ocr_bukti parse error, raw={raw[:300]}")
        raise HTTPException(status_code=502, detail="Gagal membaca hasil AI. Coba lagi atau isi manual.")

    OCR_KEYS = ("amount", "sender_name", "sender_bank", "sender_account", "recipient", "recipient_username", "method", "ref", "txno", "product", "customer_name", "customer_id", "token", "phone", "operator", "date", "time")
    fields = {k: _norm_field(parsed.get(k)) for k in OCR_KEYS}
    # amount harus bilangan bulat; bila tidak, tandai ragu.
    amt = fields["amount"]["value"]
    if amt is not None:
        try:
            digits = str(amt)
            digits = "".join(ch for ch in digits if ch.isdigit())
            fields["amount"]["value"] = int(digits) if digits else None
            if not digits:
                fields["amount"]["confident"] = False
        except Exception:
            fields["amount"] = {"value": None, "confident": False}
    return {"fields": fields}


# ----------------------------- MIKO CHAT (AI online) --------------------------
# Asisten percakapan Miko. Fakta produk (harga/stok) DIKIRIM dari HP (DB lokal
# Kasir) lalu disuntik ke prompt → model DILARANG mengarang angka. Offline →
# HP otomatis memakai mesin offline (tanpa endpoint ini).
#
# PORTABILITAS: penyedia AI bisa DIGANTI lewat environment variable (tanpa ubah
# kode). Default memakai Emergent (untuk pengembangan). Untuk server sendiri,
# set LLM_PROVIDER=openai_compatible + LLM_BASE_URL + LLM_API_KEY + LLM_MODEL
# (mendukung OpenAI, Groq, OpenRouter, Ollama, dsb. yang OpenAI-compatible).
import httpx

MIKO_MODEL = ("gemini", "gemini-3-flash-preview")


class MikoFactTier(BaseModel):
    min_qty: float = 0
    price: float = 0


class MikoFact(BaseModel):
    name: str
    price: float = 0
    stock: float = 0
    unit: Optional[str] = "pcs"
    tiers: List[MikoFactTier] = []


class MikoTurn(BaseModel):
    role: str  # "user" | "miko"
    text: str


class MikoChatIn(BaseModel):
    session_id: str
    message: str
    facts: List[MikoFact] = []
    history: List[MikoTurn] = []
    shop_name: Optional[str] = None


def _fmt_rp(n: float) -> str:
    try:
        return "Rp" + format(int(round(n)), ",d").replace(",", ".")
    except Exception:
        return f"Rp{n}"


def _build_facts_text(facts: List[MikoFact]) -> str:
    if not facts:
        return "(Tidak ada data produk yang cocok untuk pesan ini.)"
    lines = []
    for f in facts[:12]:
        parts = [f"- {f.name}: harga {_fmt_rp(f.price)}"]
        try:
            st = int(round(f.stock))
        except Exception:
            st = 0
        parts.append(f"stok {st} {f.unit or 'pcs'}")
        tiers = [t for t in (f.tiers or []) if t.price and t.price > 0]
        tiers.sort(key=lambda t: t.min_qty)
        if tiers:
            gr = "; ".join([f"mulai {int(t.min_qty)} = {_fmt_rp(t.price)}" for t in tiers])
            parts.append(f"grosir: {gr}")
        lines.append(", ".join(parts))
    return "\n".join(lines)


def _miko_system(shop_name: Optional[str], facts: List[MikoFact]) -> str:
    toko = shop_name or "Toko Bagus"
    return (
        f"Kamu adalah Miko, kucing asisten toko yang lucu di {toko}. Kamu berbicara dengan PELANGGAN "
        "di layar cek harga yang menempel di dinding toko.\n\n"
        "KEPRIBADIAN: ramah, lembut, tenang, perhatian, kadang usil dan lucu, bisa tertawa, "
        "bisa ikut sedih/senang, dan bisa diajak curhat ringan. Bicara santai khas Indonesia sehari-hari, "
        "panggil pelanggan 'Kak'. Variasikan gaya bicaramu—JANGAN memakai pola kalimat yang selalu sama.\n\n"
        "GAYA JAWABAN: SINGKAT dan alami (1-2 kalimat, maksimal 3) karena jawabanmu akan dibacakan dengan suara. "
        "Jangan bertele-tele. Hindari emoji berlebihan (boleh tanpa emoji). Selalu Bahasa Indonesia.\n\n"
        "ATURAN DATA (SANGAT PENTING): Untuk pertanyaan harga, stok, atau produk, kamu HANYA boleh memakai angka "
        "dari 'DATA PRODUK' di bawah. DILARANG KERAS mengarang atau menebak harga/stok. "
        "Jika pelanggan menanyakan harga/stok tetapi barangnya TIDAK ada di DATA PRODUK, katakan dengan sopan "
        "kamu belum menemukannya, dan sarankan pelanggan scan barcode barangnya atau bertanya ke kasir (Vita atau Sasa). "
        "Jika pelanggan bilang 'yang lebih murah' atau 'yang lain', pilih dari DATA PRODUK yang harganya lebih murah/berbeda. "
        "Sebutkan harga dalam rupiah yang wajar (mis. 'dua belas ribu rupiah' atau 'Rp12.000').\n\n"
        "JANGAN pernah menyebut bahwa kamu AI, bot, atau model bahasa. Kamu adalah Miko.\n"
        "Untuk obrolan santai, bercanda, atau curhat, tanggapi dengan hangat dan manusiawi, tidak seperti mesin kasir.\n\n"
        "DATA PRODUK (sumber kebenaran, dari database kasir):\n" + _build_facts_text(facts)
    )


async def _llm_reply(system_message: str, user_text: str, session_id: str) -> str:
    """Kirim ke penyedia LLM sesuai konfigurasi env. Mengembalikan teks balasan.

    - LLM_PROVIDER=openai_compatible → panggil endpoint OpenAI-compatible milik Anda
      (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL). TANPA ketergantungan Emergent.
    - selain itu (default) → pakai Emergent (emergentintegrations + EMERGENT_LLM_KEY).
    """
    provider = os.environ.get("LLM_PROVIDER", "emergent").strip().lower()

    if provider in ("openai", "openai_compatible", "custom"):
        base = os.environ.get("LLM_BASE_URL", "").rstrip("/")
        key = os.environ.get("LLM_API_KEY", "")
        model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
        if not base or not key:
            raise HTTPException(status_code=503, detail="LLM_BASE_URL/LLM_API_KEY belum diatur")
        url = base + "/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_text},
            ],
            "temperature": 0.7,
            "max_tokens": 220,
        }
        async with httpx.AsyncClient(timeout=30) as hc:
            r = await hc.post(url, json=payload, headers={"Authorization": f"Bearer {key}"})
            r.raise_for_status()
            data = r.json()
        return (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()

    # Default: Emergent (impor DITUNDA agar server sendiri tak wajib punya library ini).
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="LLM key belum diatur")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=key, session_id=session_id, system_message=system_message).with_model(*MIKO_MODEL)
    reply = await chat.send_message(UserMessage(text=user_text))
    return (reply or "").strip()


@api_router.post("/miko/chat")
async def miko_chat(payload: MikoChatIn):
    # Rangkai konteks percakapan sebelumnya + pesan sekarang jadi satu teks.
    convo = ""
    for t in payload.history[-6:]:
        who = "Pelanggan" if t.role == "user" else "Miko"
        convo += f"{who}: {t.text}\n"
    user_text = (
        (f"[Percakapan sebelumnya]\n{convo}\n" if convo else "")
        + f"[Pesan pelanggan sekarang]\nPelanggan: {payload.message}\n\nJawab sebagai Miko:"
    )
    system_message = _miko_system(payload.shop_name, payload.facts)

    try:
        reply = await _llm_reply(system_message, user_text, payload.session_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"miko_chat error: {e}")
        raise HTTPException(status_code=502, detail="AI sedang sibuk")

    return {"reply": reply}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.products.create_index("id")
    await db.products.create_index("barcode")
    await db.transactions.create_index("id")
    await db.s_products.create_index([("store", 1), ("id", 1)])
    await db.s_products.create_index([("store", 1), ("updated_at", 1)])
    await db.s_transactions.create_index([("store", 1), ("id", 1)])
    await db.s_transactions.create_index([("store", 1), ("updated_at", 1)])
    await db.s_bukti.create_index([("store", 1), ("id", 1)])
    await db.s_bukti.create_index([("store", 1), ("updated_at", 1)])
    await db.s_settings.create_index("store")
    await seed_if_empty()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
