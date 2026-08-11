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

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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
    buy_price: float = 0
    sell_price: float = 0
    stock: float = 0
    tiers: List[Tier] = Field(default_factory=list)
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
    return [clean(d) for d in docs]


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
    if doc:
        return clean(doc)
    doc = await db.products.find_one({"variations.barcode": code})
    if doc:
        return clean(doc)
    raise HTTPException(status_code=404, detail="Barcode belum terdaftar")


@api_router.post("/products")
async def create_product(payload: ProductIn):
    prod = Product(**payload.model_dump())
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
    return clean(s)


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
    txs = await db.transactions.find().to_list(100000)
    total_omzet = sum(t.get("total", 0) for t in txs)
    return {"total_transaksi": len(txs), "total_omzet": total_omzet}


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
    await seed_if_empty()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
