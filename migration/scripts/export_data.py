#!/usr/bin/env python3
"""
Export SELURUH data MongoDB "Toko Bagus" ke file JSON yang bisa di-import
kembali di akun/environment Emergent baru — TANPA kehilangan data.

Yang diekspor:
  - products, transactions, settings, printer           (data REST utama)
  - s_products, s_transactions, s_settings              (data sinkronisasi cloud per-Kode Toko)
  - (semua koleksi lain yang ada, jika sewaktu-waktu bertambah)

Output (folder migration/data/):
  - <collection>.json   -> Extended JSON (bson json_util) — LOSSLESS, dipakai import_data.py
  - app_backup.json     -> format backup aplikasi (products/transactions/settings/printer)
                            bisa dipakai lewat menu "Restore" di aplikasi ATAU
                            endpoint POST /api/backup/import
  - manifest.json       -> ringkasan jumlah dokumen & waktu ekspor

Sumber koneksi (urutan prioritas):
  1) ENV  SOURCE_MONGO_URL / SOURCE_DB_NAME
  2) ENV  MONGO_URL / DB_NAME
  3) backend/.env  (MONGO_URL / DB_NAME)

Cara pakai:
  cd /app/migration/scripts
  python3 export_data.py
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymongo import MongoClient
from bson import json_util

HERE = Path(__file__).resolve().parent
MIGRATION_DIR = HERE.parent
DATA_DIR = MIGRATION_DIR / "data"
BACKEND_ENV = MIGRATION_DIR.parent / "backend" / ".env"

# Koleksi "app backup" (format yang dipahami aplikasi & /api/backup/import).
APP_BACKUP_COLLECTIONS = ("products", "transactions", "settings", "printer")


def resolve_source():
    # Muat backend/.env sebagai fallback (tidak menimpa ENV yang sudah ada).
    if BACKEND_ENV.exists():
        load_dotenv(BACKEND_ENV, override=False)
    url = os.environ.get("SOURCE_MONGO_URL") or os.environ.get("MONGO_URL")
    dbname = os.environ.get("SOURCE_DB_NAME") or os.environ.get("DB_NAME", "toko_bagus")
    if not url:
        print("ERROR: MONGO_URL tidak ditemukan (ENV atau backend/.env).", file=sys.stderr)
        sys.exit(1)
    return url, dbname


def strip_id(doc: dict) -> dict:
    d = dict(doc)
    d.pop("_id", None)
    return d


def main():
    url, dbname = resolve_source()
    client = MongoClient(url, serverSelectionTimeoutMS=8000)
    db = client[dbname]
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    collections = db.list_collection_names()
    # Abaikan koleksi staging sementara jika ada.
    collections = [c for c in collections if not c.endswith("_tmp")]

    manifest = {
        "app": "toko-bagus-kasir",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_db": dbname,
        "collections": {},
    }

    print(f"Sumber: {dbname}  ({len(collections)} koleksi)")
    for col in sorted(collections):
        docs = list(db[col].find())
        out = DATA_DIR / f"{col}.json"
        # Extended JSON (lossless) — pertahankan tipe & bisa di-import ulang.
        out.write_text(json_util.dumps(docs, ensure_ascii=False, indent=1), encoding="utf-8")
        manifest["collections"][col] = len(docs)
        print(f"  - {col:16s} {len(docs):>7d} dok  -> data/{col}.json ({out.stat().st_size} bytes)")

    # app_backup.json (format aplikasi) — untuk Restore lewat UI / /api/backup/import.
    products = [strip_id(d) for d in db["products"].find()] if "products" in collections else []
    transactions = [strip_id(d) for d in db["transactions"].find().sort("created_at", -1)] if "transactions" in collections else []
    settings_doc = db["settings"].find_one() if "settings" in collections else None
    printer_doc = db["printer"].find_one() if "printer" in collections else None
    app_backup = {
        "app": "kasir-warung",
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "counts": {"products": len(products), "transactions": len(transactions)},
        "products": products,
        "transactions": transactions,
        "settings": strip_id(settings_doc) if settings_doc else None,
        "printer": strip_id(printer_doc) if printer_doc else None,
    }
    (DATA_DIR / "app_backup.json").write_text(
        json.dumps(app_backup, ensure_ascii=False, indent=1, default=str), encoding="utf-8"
    )
    print(f"  - app_backup.json  produk={len(products)} transaksi={len(transactions)} (format aplikasi)")

    (MIGRATION_DIR / "data" / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\nSelesai. Semua data tersimpan di migration/data/. Aman untuk dipindahkan.")


if __name__ == "__main__":
    main()
