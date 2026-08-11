"""Toko Bagus API regression tests.

Covers products, transactions, settings, printer, reports, backup.
Backup import is destructive; we snapshot data first and restore after tests.
"""
import pytest
import requests
import time
import copy

pytestmark = pytest.mark.filterwarnings("ignore")

CREATED_PRODUCT_IDS = []


# ---------------- Health ----------------
def test_root(api_client, base_url):
    r = api_client.get(f"{base_url}/api/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------------- Products ----------------
def test_products_pos_returns_seeded(api_client, base_url):
    r = api_client.get(f"{base_url}/api/products/pos")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # seeded 2267 - allow slight drift due to prior tests
    assert len(data) >= 2000, f"Expected ~2267 products, got {len(data)}"
    # confirm no _id field leaked
    if data:
        assert "_id" not in data[0]
        assert "id" in data[0]


def test_products_search_filter(api_client, base_url):
    # get any product name to search
    r = api_client.get(f"{base_url}/api/products/pos")
    prods = r.json()
    assert prods
    name_frag = prods[0]["name"][:3]
    r2 = api_client.get(f"{base_url}/api/products", params={"search": name_frag})
    assert r2.status_code == 200
    filt = r2.json()
    assert all(name_frag.lower() in p["name"].lower() or name_frag.lower() in (p.get("barcode") or "").lower() for p in filt[:20])


def test_products_barcode_lookup_and_404(api_client, base_url):
    r = api_client.get(f"{base_url}/api/products/pos")
    prods = r.json()
    with_barcode = next((p for p in prods if p.get("barcode")), None)
    if with_barcode:
        r2 = api_client.get(f"{base_url}/api/products/barcode/{with_barcode['barcode']}")
        assert r2.status_code == 200
        assert r2.json().get("id") == with_barcode["id"]
    # unknown barcode
    r3 = api_client.get(f"{base_url}/api/products/barcode/NONEXISTENT_ZZZ_999")
    assert r3.status_code == 404


def test_products_variation_barcode_lookup(api_client, base_url):
    r = api_client.get(f"{base_url}/api/products/pos")
    prods = r.json()
    variant_prod = next(
        (p for p in prods if any(v.get("barcode") for v in p.get("variations", []))), None
    )
    if not variant_prod:
        pytest.skip("No product with variation barcode in seed")
    vbar = next(v["barcode"] for v in variant_prod["variations"] if v.get("barcode"))
    r2 = api_client.get(f"{base_url}/api/products/barcode/{vbar}")
    assert r2.status_code == 200
    assert r2.json().get("id") == variant_prod["id"]


def test_create_update_stock_delete_product(api_client, base_url):
    payload = {
        "name": "TEST_PROD_ZZZ",
        "category": "TEST",
        "unit": "pcs",
        "barcode": "TEST_BC_9999",
        "buy_price": 1000,
        "sell_price": 1500,
        "stock": 10,
        "tiers": [{"min_qty": 10, "price": 1200}],
        "variations": [
            {
                "id": "v1",
                "name": "Small",
                "barcode": "TEST_BC_9999_S",
                "buy_price": 800,
                "sell_price": 1200,
                "stock": 5,
                "tiers": [],
                "inherit_tiers": False,
            }
        ],
    }
    r = api_client.post(f"{base_url}/api/products", json=payload)
    assert r.status_code == 200, r.text
    prod = r.json()
    assert prod["name"] == "TEST_PROD_ZZZ"
    assert prod["sell_price"] == 1500
    assert len(prod["variations"]) == 1
    assert prod["tiers"][0]["min_qty"] == 10
    pid = prod["id"]
    CREATED_PRODUCT_IDS.append(pid)

    # GET verify persistence
    r2 = api_client.get(f"{base_url}/api/products", params={"search": "TEST_PROD_ZZZ"})
    assert r2.status_code == 200
    assert any(p["id"] == pid for p in r2.json())

    # Update
    upd = dict(payload)
    upd["name"] = "TEST_PROD_ZZZ_UPDATED"
    upd["sell_price"] = 2000
    r3 = api_client.put(f"{base_url}/api/products/{pid}", json=upd)
    assert r3.status_code == 200
    assert r3.json()["name"] == "TEST_PROD_ZZZ_UPDATED"
    assert r3.json()["sell_price"] == 2000

    # Patch stock
    r4 = api_client.patch(f"{base_url}/api/products/{pid}/stock", json={"stock": 42})
    assert r4.status_code == 200
    assert r4.json()["stock"] == 42

    # Patch variation stock
    r5 = api_client.patch(
        f"{base_url}/api/products/{pid}/stock",
        json={"stock": 7, "variation_id": "v1"},
    )
    assert r5.status_code == 200
    vs = [v for v in r5.json()["variations"] if v["id"] == "v1"][0]
    assert vs["stock"] == 7

    # Delete
    r6 = api_client.delete(f"{base_url}/api/products/{pid}")
    assert r6.status_code == 200
    CREATED_PRODUCT_IDS.remove(pid)

    # verify deleted (barcode returns 404 or search doesn't contain it)
    r7 = api_client.get(f"{base_url}/api/products/barcode/TEST_BC_9999")
    assert r7.status_code == 404

    # delete non-existing -> 404
    r8 = api_client.delete(f"{base_url}/api/products/{pid}")
    assert r8.status_code == 404


# ---------------- Transactions ----------------
def test_create_transaction_decrements_stock(api_client, base_url):
    # Create a fresh product for transaction test
    payload = {
        "name": "TEST_TX_PROD",
        "category": "TEST",
        "unit": "pcs",
        "barcode": "TEST_TX_BC",
        "buy_price": 500,
        "sell_price": 1000,
        "stock": 20,
        "tiers": [],
        "variations": [],
    }
    r = api_client.post(f"{base_url}/api/products", json=payload)
    assert r.status_code == 200
    prod = r.json()
    pid = prod["id"]
    CREATED_PRODUCT_IDS.append(pid)

    tx_payload = {
        "items": [
            {
                "product_id": pid,
                "variation_id": None,
                "name": prod["name"],
                "barcode": prod["barcode"],
                "unit": "pcs",
                "price": 1000,
                "quantity": 3,
                "subtotal": 3000,
            }
        ],
        "total": 3000,
        "cash_paid": 5000,
        "change": 2000,
    }
    r2 = api_client.post(f"{base_url}/api/transactions", json=tx_payload)
    assert r2.status_code == 200
    tx = r2.json()
    assert tx["total"] == 3000
    assert "id" in tx
    tx_id = tx["id"]

    # GET tx
    r3 = api_client.get(f"{base_url}/api/transactions/{tx_id}")
    assert r3.status_code == 200
    assert r3.json()["id"] == tx_id

    # verify stock decremented
    r4 = api_client.get(f"{base_url}/api/products", params={"search": "TEST_TX_PROD"})
    updated = [p for p in r4.json() if p["id"] == pid][0]
    assert updated["stock"] == 17, f"Expected 17, got {updated['stock']}"

    # cleanup
    api_client.delete(f"{base_url}/api/products/{pid}")
    CREATED_PRODUCT_IDS.remove(pid)


def test_transactions_list_sorted_desc(api_client, base_url):
    r = api_client.get(f"{base_url}/api/transactions", params={"limit": 200})
    assert r.status_code == 200
    txs = r.json()
    assert isinstance(txs, list)
    # sorted desc by created_at
    if len(txs) >= 2:
        assert txs[0]["created_at"] >= txs[-1]["created_at"]


def test_transaction_404(api_client, base_url):
    r = api_client.get(f"{base_url}/api/transactions/does-not-exist-xyz")
    assert r.status_code == 404


# ---------------- Settings & Printer ----------------
def test_get_and_put_settings(api_client, base_url):
    r = api_client.get(f"{base_url}/api/settings")
    assert r.status_code == 200
    s = r.json()
    assert "shopName" in s
    original_name = s["shopName"]
    # update
    s["shopName"] = "TEST_TOKO_TEMP"
    r2 = api_client.put(f"{base_url}/api/settings", json=s)
    assert r2.status_code == 200
    assert r2.json()["shopName"] == "TEST_TOKO_TEMP"
    # restore
    s["shopName"] = original_name
    r3 = api_client.put(f"{base_url}/api/settings", json=s)
    assert r3.status_code == 200
    assert r3.json()["shopName"] == original_name


def test_get_and_put_printer(api_client, base_url):
    r = api_client.get(f"{base_url}/api/printer")
    assert r.status_code == 200
    orig = r.json()
    r2 = api_client.put(f"{base_url}/api/printer", json={"address": "00:11:22", "name": "TEST_PRT"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "TEST_PRT"
    # restore
    r3 = api_client.put(f"{base_url}/api/printer", json={"address": orig.get("address"), "name": orig.get("name")})
    assert r3.status_code == 200


# ---------------- Reports ----------------
def test_reports_summary(api_client, base_url):
    r = api_client.get(f"{base_url}/api/reports/summary")
    assert r.status_code == 200
    d = r.json()
    assert "total_omzet" in d and "total_transaksi" in d
    assert isinstance(d["total_transaksi"], int)
    assert d["total_transaksi"] >= 0


# ---------------- Backup (destructive, run last) ----------------
def test_zzz_backup_export_and_reimport_preserves_data(api_client, base_url):
    """Export → import same payload → data preserved."""
    r = api_client.get(f"{base_url}/api/backup/export")
    assert r.status_code == 200
    data = r.json()
    assert data["app"] == "kasir-warung"
    assert "counts" in data
    assert data["counts"]["products"] >= 2000
    original_product_count = data["counts"]["products"]
    original_tx_count = data["counts"]["transactions"]

    # Reimport same payload - should preserve counts
    r2 = api_client.post(f"{base_url}/api/backup/import", json=data)
    assert r2.status_code == 200
    result = r2.json()
    assert result["ok"] is True
    assert result["products"] == original_product_count
    assert result["transactions"] == original_tx_count

    # Verify counts after
    r3 = api_client.get(f"{base_url}/api/products/pos")
    assert len(r3.json()) == original_product_count
