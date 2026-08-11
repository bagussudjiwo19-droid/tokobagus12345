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
    products = data.get("products", [])
    transactions = data.get("transactions", [])
    await db.products.delete_many({})
    await db.transactions.delete_many({})
    if products:
        for p in products:
            p.pop("_id", None)
        await db.products.insert_many(products)
    if transactions:
        for t in transactions:
            t.pop("_id", None)
        await db.transactions.insert_many(transactions)
    if data.get("settings"):
        s = dict(data["settings"])
        s["_id"] = SETTINGS_ID
        await db.settings.replace_one({"_id": SETTINGS_ID}, s, upsert=True)
    if data.get("printer"):
        pr = dict(data["printer"])
        pr["_id"] = PRINTER_ID
        await db.printer.replace_one({"_id": PRINTER_ID}, pr, upsert=True)
    return {"ok": True, "products": len(products), "transactions": len(transactions)}


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
