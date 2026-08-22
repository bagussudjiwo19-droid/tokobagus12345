#!/usr/bin/env python3
"""
Import SELURUH data (hasil export_data.py) ke MongoDB TARGET (akun/environment
Emergent baru atau self-host). Membuat index yang sama seperti server produksi.

Sumber file: migration/data/<collection>.json  (Extended JSON / bson json_util)

Target koneksi (urutan prioritas):
  1) ENV  TARGET_MONGO_URL / TARGET_DB_NAME
  2) ENV  MONGO_URL / DB_NAME
  3) backend/.env  (MONGO_URL / DB_NAME)   <- default saat dijalankan di project baru

Perilaku:
  - Secara default MENGGANTI isi koleksi (drop-lalu-insert) agar hasilnya identik
    dengan sumber. Gunakan --keep untuk MENAMBAH tanpa menghapus data lama.
  - Selalu (re)buat index sesuai server (products.id, products.barcode,
    transactions.id, s_products/s_transactions store+id & store+updated_at, s_settings.store).

Cara pakai (di project baru):
  cd migration/scripts
  python3 import_data.py            # ganti total (mirror sumber)
  python3 import_data.py --keep     # tambah tanpa menghapus
"""
import os
import sys
import argparse
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING
from bson import json_util

HERE = Path(__file__).resolve().parent
MIGRATION_DIR = HERE.parent
DATA_DIR = MIGRATION_DIR / "data"
BACKEND_ENV = MIGRATION_DIR.parent / "backend" / ".env"


def resolve_target():
    if BACKEND_ENV.exists():
        load_dotenv(BACKEND_ENV, override=False)
    url = os.environ.get("TARGET_MONGO_URL") or os.environ.get("MONGO_URL")
    dbname = os.environ.get("TARGET_DB_NAME") or os.environ.get("DB_NAME", "toko_bagus")
    if not url:
        print("ERROR: MONGO_URL tidak ditemukan (ENV atau backend/.env).", file=sys.stderr)
        sys.exit(1)
    return url, dbname


def ensure_indexes(db):
    db.products.create_index("id")
    db.products.create_index("barcode")
    db.transactions.create_index("id")
    db.s_products.create_index([("store", ASCENDING), ("id", ASCENDING)])
    db.s_products.create_index([("store", ASCENDING), ("updated_at", ASCENDING)])
    db.s_transactions.create_index([("store", ASCENDING), ("id", ASCENDING)])
    db.s_transactions.create_index([("store", ASCENDING), ("updated_at", ASCENDING)])
    db.s_settings.create_index("store")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="Tambah tanpa menghapus data lama (default: ganti total).")
    args = ap.parse_args()

    if not DATA_DIR.exists():
        print(f"ERROR: folder data tidak ditemukan: {DATA_DIR}", file=sys.stderr)
        sys.exit(1)

    url, dbname = resolve_target()
    client = MongoClient(url, serverSelectionTimeoutMS=8000)
    db = client[dbname]

    files = sorted([p for p in DATA_DIR.glob("*.json") if p.name not in ("app_backup.json", "manifest.json")])
    if not files:
        print("ERROR: tidak ada file koleksi (*.json) di migration/data/.", file=sys.stderr)
        sys.exit(1)

    print(f"Target: {dbname}  (mode: {'TAMBAH' if args.keep else 'GANTI TOTAL'})")
    for f in files:
        col = f.stem
        docs = json_util.loads(f.read_text(encoding="utf-8"))
        if not isinstance(docs, list):
            docs = [docs]
        if not args.keep:
            db[col].drop()
        if docs:
            db[col].insert_many(docs)
        print(f"  - {col:16s} {len(docs):>7d} dok  <- data/{col}.json")

    ensure_indexes(db)
    print("\nIndex dibuat. Import selesai. Jalankan backend & aplikasi seperti biasa.")


if __name__ == "__main__":
    main()
