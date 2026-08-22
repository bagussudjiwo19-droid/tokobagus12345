"""Penyimpanan SINKRONISASI berbasis PostgreSQL (opsional, self-host).

Dipakai HANYA bila env DB_ENGINE=postgres. Default aplikasi tetap MongoDB
(tidak diubah). Modul ini meniru semantik /api/sync/push & /api/sync/pull:
- data dipisah per "store" (Kode Toko)
- kursor pull memakai srv_at (jam server saat ditulis)
- Last-Write-Wins berdasarkan updated_at (jam HP pengirim)
- produk mendukung tombstone (deleted)

Skema dibuat otomatis (CREATE TABLE IF NOT EXISTS) saat init — tanpa alat migrasi
terpisah. Aman dijalankan berulang.
"""
import json
import time
from typing import Any, Dict, List, Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None


def _ms() -> int:
    return int(time.time() * 1000)


async def init_pool(dsn: str) -> None:
    global _pool
    _pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=10)
    async with _pool.acquire() as con:
        await con.execute(
            """
            CREATE TABLE IF NOT EXISTS sync_docs (
                store      TEXT   NOT NULL,
                kind       TEXT   NOT NULL,           -- 'product' | 'transaction' | 'settings'
                doc_id     TEXT   NOT NULL,           -- id dokumen; 'settings' untuk kind=settings
                doc        JSONB,
                updated_at BIGINT NOT NULL DEFAULT 0, -- jam HP pengirim (ms)
                srv_at     BIGINT NOT NULL DEFAULT 0, -- jam server saat ditulis (ms)
                deleted    BOOLEAN NOT NULL DEFAULT FALSE,
                PRIMARY KEY (store, kind, doc_id)
            );
            """
        )
        await con.execute(
            "CREATE INDEX IF NOT EXISTS idx_sync_docs_pull ON sync_docs (store, kind, srv_at);"
        )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _row_to_item(row: asyncpg.Record) -> Dict[str, Any]:
    doc = row["doc"]
    if isinstance(doc, str):
        doc = json.loads(doc)
    return {
        "id": row["doc_id"],
        "doc": doc,
        "updated_at": int(row["updated_at"] or 0),
        "deleted": bool(row["deleted"]),
    }


async def pull(store: str, since: int = 0) -> Dict[str, Any]:
    assert _pool is not None
    async with _pool.acquire() as con:
        if since > 0:
            prod_rows = await con.fetch(
                "SELECT doc_id, doc, updated_at, deleted FROM sync_docs WHERE store=$1 AND kind='product' AND srv_at>$2",
                store, since,
            )
            tx_rows = await con.fetch(
                "SELECT doc_id, doc, updated_at, deleted FROM sync_docs WHERE store=$1 AND kind='transaction' AND srv_at>$2",
                store, since,
            )
        else:
            prod_rows = await con.fetch(
                "SELECT doc_id, doc, updated_at, deleted FROM sync_docs WHERE store=$1 AND kind='product'",
                store,
            )
            tx_rows = await con.fetch(
                "SELECT doc_id, doc, updated_at, deleted FROM sync_docs WHERE store=$1 AND kind='transaction'",
                store,
            )
        sett_row = await con.fetchrow(
            "SELECT doc, updated_at, srv_at FROM sync_docs WHERE store=$1 AND kind='settings' AND doc_id='settings'",
            store,
        )

    settings = None
    if sett_row and (since == 0 or int(sett_row["srv_at"] or 0) > since):
        sdoc = sett_row["doc"]
        if isinstance(sdoc, str):
            sdoc = json.loads(sdoc)
        settings = {"doc": sdoc, "updated_at": int(sett_row["updated_at"] or 0)}

    return {
        "now": _ms(),
        "products": [_row_to_item(r) for r in prod_rows],
        "transactions": [{"id": r["doc_id"], "doc": (json.loads(r["doc"]) if isinstance(r["doc"], str) else r["doc"]), "updated_at": int(r["updated_at"] or 0)} for r in tx_rows],
        "settings": settings,
    }


async def _upsert(con: asyncpg.Connection, store: str, kind: str, doc_id: str, doc: Any, upd: int, srv: int, deleted: bool) -> None:
    # LWW: hanya tulis bila versi masuk >= versi tersimpan (updated_at).
    existing = await con.fetchrow(
        "SELECT updated_at FROM sync_docs WHERE store=$1 AND kind=$2 AND doc_id=$3",
        store, kind, doc_id,
    )
    if existing and int(existing["updated_at"] or 0) > upd:
        return
    await con.execute(
        """
        INSERT INTO sync_docs (store, kind, doc_id, doc, updated_at, srv_at, deleted)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
        ON CONFLICT (store, kind, doc_id)
        DO UPDATE SET doc=EXCLUDED.doc, updated_at=EXCLUDED.updated_at, srv_at=EXCLUDED.srv_at, deleted=EXCLUDED.deleted
        """,
        store, kind, doc_id, json.dumps(doc), upd, srv, deleted,
    )


async def push(store: str, products: List[dict], transactions: List[dict], settings: Optional[dict]) -> Dict[str, Any]:
    assert _pool is not None
    srv = _ms()
    async with _pool.acquire() as con:
        async with con.transaction():
            for p in (products or []):
                pid = p.get("id")
                if not pid:
                    continue
                await _upsert(con, store, "product", pid, p.get("doc"), int(p.get("updated_at") or 0), srv, bool(p.get("deleted", False)))
            for t in (transactions or []):
                tid = t.get("id")
                if not tid:
                    continue
                await _upsert(con, store, "transaction", tid, t.get("doc"), int(t.get("updated_at") or 0), srv, False)
            if settings and settings.get("doc") is not None:
                await _upsert(con, store, "settings", "settings", settings.get("doc"), int(settings.get("updated_at") or 0), srv, False)
    return {"ok": True, "now": srv}
