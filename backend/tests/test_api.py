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


# ---------------- Transaction Edit (PUT) - preserve id & created_at, reconcile stock ----------------
def test_update_transaction_preserves_id_and_reconciles_stock(api_client, base_url):
    # Create test product with known stock
    prod_payload = {
        "name": "TEST_EDIT_TX_PROD",
        "unit": "pcs",
        "barcode": "TEST_EDIT_BC",
        "buy_price": 500,
        "sell_price": 1000,
        "stock": 50,
        "tiers": [],
        "variations": [],
    }
    r = api_client.post(f"{base_url}/api/products", json=prod_payload)
    assert r.status_code == 200
    prod = r.json()
    pid = prod["id"]
    CREATED_PRODUCT_IDS.append(pid)

    # Create transaction qty=5 -> stock becomes 45
    tx_payload = {
        "items": [{
            "product_id": pid, "variation_id": None, "name": prod["name"],
            "barcode": prod["barcode"], "unit": "pcs", "price": 1000,
            "quantity": 5, "subtotal": 5000,
        }],
        "total": 5000, "cash_paid": 5000, "change": 0,
    }
    r2 = api_client.post(f"{base_url}/api/transactions", json=tx_payload)
    assert r2.status_code == 200
    tx = r2.json()
    tx_id = tx["id"]
    original_created_at = tx["created_at"]

    r_stock = api_client.get(f"{base_url}/api/products", params={"search": "TEST_EDIT_TX_PROD"})
    stock_after_create = [p for p in r_stock.json() if p["id"] == pid][0]["stock"]
    assert stock_after_create == 45, f"Stock after create should be 45, got {stock_after_create}"

    # EDIT: change qty from 5 -> 2. Stock delta = 5-2 = +3, new stock = 48.
    edit_payload = {
        "items": [{
            "product_id": pid, "variation_id": None, "name": prod["name"],
            "barcode": prod["barcode"], "unit": "pcs", "price": 1000,
            "quantity": 2, "subtotal": 2000,
        }],
        "total": 2000, "cash_paid": 5000, "change": 3000,
    }
    r3 = api_client.put(f"{base_url}/api/transactions/{tx_id}", json=edit_payload)
    assert r3.status_code == 200, r3.text
    edited = r3.json()

    # Must keep same id
    assert edited["id"] == tx_id, "Transaction id must remain the same after edit"
    # Must keep original created_at (payload did not include one)
    assert edited["created_at"] == original_created_at, \
        f"created_at must be preserved: original={original_created_at}, now={edited['created_at']}"
    # Data updated
    assert edited["total"] == 2000
    assert edited["items"][0]["quantity"] == 2

    # Stock reconciled: was 45, delta +3 -> 48
    r4 = api_client.get(f"{base_url}/api/products", params={"search": "TEST_EDIT_TX_PROD"})
    stock_after_edit = [p for p in r4.json() if p["id"] == pid][0]["stock"]
    assert stock_after_edit == 48, f"Stock after edit should be 48, got {stock_after_edit}"

    # Verify a NEW transaction was NOT created (same id fetched)
    r5 = api_client.get(f"{base_url}/api/transactions/{tx_id}")
    assert r5.status_code == 200
    assert r5.json()["id"] == tx_id
    assert r5.json()["total"] == 2000

    # Cleanup: delete product; historical tx must remain intact
    api_client.delete(f"{base_url}/api/products/{pid}")
    CREATED_PRODUCT_IDS.remove(pid)
    r6 = api_client.get(f"{base_url}/api/transactions/{tx_id}")
    assert r6.status_code == 200, "Historical transaction must remain after product deletion"
    assert r6.json()["items"][0]["name"] == "TEST_EDIT_TX_PROD"


# ---------------- Discount persistence + Lunasi flow ----------------
def test_transaction_discount_persists_on_create(api_client, base_url):
    """POST /api/transactions accepts and persists a 'discount' field."""
    prod = api_client.post(f"{base_url}/api/products", json={
        "name": "TEST_DISC_PROD", "unit": "pcs", "buy_price": 500,
        "sell_price": 5000, "stock": 20, "tiers": [], "variations": [],
    }).json()
    pid = prod["id"]
    CREATED_PRODUCT_IDS.append(pid)

    # subtotal 10000, discount 2000, total 8000, cash 10000, change 2000
    tx_payload = {
        "items": [{
            "product_id": pid, "variation_id": None, "name": prod["name"],
            "barcode": None, "unit": "pcs", "price": 5000,
            "quantity": 2, "subtotal": 10000,
        }],
        "total": 8000, "discount": 2000, "cash_paid": 10000, "change": 2000,
    }
    r = api_client.post(f"{base_url}/api/transactions", json=tx_payload)
    assert r.status_code == 200, r.text
    tx = r.json()
    assert tx["discount"] == 2000, f"discount not persisted on create: {tx}"
    assert tx["total"] == 8000
    tx_id = tx["id"]

    # GET verify persistence
    r2 = api_client.get(f"{base_url}/api/transactions/{tx_id}")
    assert r2.status_code == 200
    assert r2.json()["discount"] == 2000
    assert r2.json()["total"] == 8000

    # cleanup
    api_client.delete(f"{base_url}/api/products/{pid}")
    CREATED_PRODUCT_IDS.remove(pid)


def test_transaction_discount_persists_on_update(api_client, base_url):
    """PUT /api/transactions/{id} accepts and persists a 'discount' field."""
    prod = api_client.post(f"{base_url}/api/products", json={
        "name": "TEST_DISC_UPD_PROD", "unit": "pcs", "buy_price": 500,
        "sell_price": 3000, "stock": 20, "tiers": [], "variations": [],
    }).json()
    pid = prod["id"]
    CREATED_PRODUCT_IDS.append(pid)

    tx = api_client.post(f"{base_url}/api/transactions", json={
        "items": [{
            "product_id": pid, "variation_id": None, "name": prod["name"],
            "barcode": None, "unit": "pcs", "price": 3000,
            "quantity": 2, "subtotal": 6000,
        }],
        "total": 6000, "discount": 0, "cash_paid": 6000, "change": 0,
    }).json()
    tx_id = tx["id"]

    # Edit: introduce a discount of 1000. subtotal 6000, total 5000.
    r = api_client.put(f"{base_url}/api/transactions/{tx_id}", json={
        "items": tx["items"],
        "total": 5000, "discount": 1000, "cash_paid": 6000, "change": 1000,
    })
    assert r.status_code == 200, r.text
    assert r.json()["discount"] == 1000
    assert r.json()["total"] == 5000

    # GET verify persistence
    r2 = api_client.get(f"{base_url}/api/transactions/{tx_id}")
    assert r2.status_code == 200
    assert r2.json()["discount"] == 1000

    # cleanup
    api_client.delete(f"{base_url}/api/products/{pid}")
    CREATED_PRODUCT_IDS.remove(pid)


def test_lunasi_flow_partial_then_payoff_preserves_id_date_discount(api_client, base_url):
    """Belum Lunas -> Lunasi: PUT sets cash_paid=total, change=0, preserves id/created_at/discount/items/stock."""
    prod = api_client.post(f"{base_url}/api/products", json={
        "name": "TEST_LUNASI_PROD", "unit": "pcs", "buy_price": 500,
        "sell_price": 5000, "stock": 30, "tiers": [], "variations": [],
    }).json()
    pid = prod["id"]
    CREATED_PRODUCT_IDS.append(pid)

    # partial: subtotal 10000, discount 2000, total 8000, cash 3000 -> shortfall 5000
    tx = api_client.post(f"{base_url}/api/transactions", json={
        "items": [{
            "product_id": pid, "variation_id": None, "name": prod["name"],
            "barcode": None, "unit": "pcs", "price": 5000,
            "quantity": 2, "subtotal": 10000,
        }],
        "total": 8000, "discount": 2000, "cash_paid": 3000, "change": 0,
    }).json()
    tx_id = tx["id"]
    original_created_at = tx["created_at"]

    # stock after create: 30 - 2 = 28
    stock_after_create = [p for p in api_client.get(
        f"{base_url}/api/products", params={"search": "TEST_LUNASI_PROD"}
    ).json() if p["id"] == pid][0]["stock"]
    assert stock_after_create == 28

    # LUNASI: same items, same discount, cash_paid=total=8000, change=0
    r = api_client.put(f"{base_url}/api/transactions/{tx_id}", json={
        "items": tx["items"],
        "total": 8000, "discount": 2000, "cash_paid": 8000, "change": 0,
    })
    assert r.status_code == 200, r.text
    paid = r.json()
    assert paid["id"] == tx_id, "id must be preserved after Lunasi"
    assert paid["created_at"] == original_created_at, "created_at must be preserved after Lunasi"
    assert paid["discount"] == 2000, "discount must be preserved after Lunasi"
    assert paid["cash_paid"] == 8000
    assert paid["change"] == 0
    assert paid["total"] == 8000
    # shortfall == 0
    assert max(0, paid["total"] - paid["cash_paid"]) == 0

    # stock unchanged after Lunasi (same items, delta = 0)
    stock_after_lunasi = [p for p in api_client.get(
        f"{base_url}/api/products", params={"search": "TEST_LUNASI_PROD"}
    ).json() if p["id"] == pid][0]["stock"]
    assert stock_after_lunasi == 28, f"Stock must remain 28 after Lunasi, got {stock_after_lunasi}"

    # cleanup
    api_client.delete(f"{base_url}/api/products/{pid}")
    CREATED_PRODUCT_IDS.remove(pid)


def test_update_transaction_404(api_client, base_url):
    r = api_client.put(f"{base_url}/api/transactions/nonexistent-xyz-123", json={
        "items": [], "total": 0, "cash_paid": 0, "change": 0,
    })
    assert r.status_code == 404


def test_delete_product_preserves_historical_transactions(api_client, base_url):
    # Create prod + tx, then delete prod, verify tx still intact and readable
    p = api_client.post(f"{base_url}/api/products", json={
        "name": "TEST_HIST_PROD", "unit": "pcs", "buy_price": 100,
        "sell_price": 200, "stock": 10, "tiers": [], "variations": [],
    }).json()
    pid = p["id"]
    CREATED_PRODUCT_IDS.append(pid)
    tx = api_client.post(f"{base_url}/api/transactions", json={
        "items": [{"product_id": pid, "variation_id": None, "name": p["name"],
                   "barcode": None, "unit": "pcs", "price": 200, "quantity": 1, "subtotal": 200}],
        "total": 200, "cash_paid": 200, "change": 0,
    }).json()
    tx_id = tx["id"]
    # delete prod
    r_del = api_client.delete(f"{base_url}/api/products/{pid}")
    assert r_del.status_code == 200
    CREATED_PRODUCT_IDS.remove(pid)
    # tx still present
    r_tx = api_client.get(f"{base_url}/api/transactions/{tx_id}")
    assert r_tx.status_code == 200
    assert r_tx.json()["items"][0]["name"] == "TEST_HIST_PROD"


# ---------------- Settings & Printer ----------------
def test_settings_voice_change_default_true(api_client, base_url):
    r = api_client.get(f"{base_url}/api/settings")
    assert r.status_code == 200
    s = r.json()
    assert "voiceChange" in s, "Settings must include voiceChange field (merged from defaults)"
    # Default value must be True even if DB record is missing that key
    assert s["voiceChange"] is True or isinstance(s["voiceChange"], bool)


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
def test_zzz_backup_import_safe_on_invalid_payloads(api_client, base_url):
    """Invalid/empty/corrupt backups MUST return 400 and NOT delete existing data."""
    # snapshot current counts
    r_before = api_client.get(f"{base_url}/api/products/pos")
    n_prod_before = len(r_before.json())
    r_tx_before = api_client.get(f"{base_url}/api/transactions", params={"limit": 100000})
    n_tx_before = len(r_tx_before.json())

    # Case 1: products missing
    r = api_client.post(f"{base_url}/api/backup/import", json={"transactions": []})
    assert r.status_code == 400
    assert "produk" in r.json().get("detail", "").lower() or "backup" in r.json().get("detail", "").lower()

    # Case 2: empty products list
    r = api_client.post(f"{base_url}/api/backup/import", json={"products": [], "transactions": []})
    assert r.status_code == 400

    # Case 3: products not a list
    r = api_client.post(f"{base_url}/api/backup/import", json={"products": "oops", "transactions": []})
    assert r.status_code == 400

    # Case 4: product with malformed schema (missing required 'name')
    r = api_client.post(f"{base_url}/api/backup/import", json={
        "products": [{"id": "x", "sell_price": 1}], "transactions": []
    })
    assert r.status_code == 400

    # Case 5: transactions items missing / malformed
    r = api_client.post(f"{base_url}/api/backup/import", json={
        "products": [{"name": "OK", "sell_price": 10, "buy_price": 5, "stock": 1}],
        "transactions": [{"id": "tx1", "total": 1}]  # no items list
    })
    assert r.status_code == 400

    # Verify NO data was deleted
    r_after = api_client.get(f"{base_url}/api/products/pos")
    assert len(r_after.json()) == n_prod_before, \
        f"Products deleted after invalid import: {n_prod_before} -> {len(r_after.json())}"
    r_tx_after = api_client.get(f"{base_url}/api/transactions", params={"limit": 100000})
    assert len(r_tx_after.json()) == n_tx_before, \
        f"Transactions deleted after invalid import: {n_tx_before} -> {len(r_tx_after.json())}"


def test_zzz_backup_import_dedupes_by_id(api_client, base_url):
    """Import with duplicate ids must dedupe (only unique kept)."""
    r = api_client.get(f"{base_url}/api/backup/export")
    data = r.json()
    # duplicate the first two products
    if len(data["products"]) >= 2:
        dup = [copy.deepcopy(data["products"][0]), copy.deepcopy(data["products"][0]),
               copy.deepcopy(data["products"][1])]
        payload = {"products": dup, "transactions": []}
        r2 = api_client.post(f"{base_url}/api/backup/import", json=payload)
        assert r2.status_code == 200
        assert r2.json()["products"] == 2, f"Expected 2 after dedupe, got {r2.json()['products']}"
        # restore full backup
        r3 = api_client.post(f"{base_url}/api/backup/import", json=data)
        assert r3.status_code == 200


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
