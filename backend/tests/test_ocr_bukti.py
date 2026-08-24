"""Tests for /api/ocr/bukti (12-field OCR, Gemini 3 Flash) and
/api/sync/pull|push 'bukti' collection.

Rules from playbook: image must be PNG/JPEG base64 with real visual text.
OCR must NOT guess — missing fields → value=null + confident=false.
"""
import base64
import io
import time
import pytest
from PIL import Image, ImageDraw, ImageFont


# -------------------- Helpers: build synthetic receipt images --------------------

def _load_font(size: int):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _make_receipt_image(lines: list[tuple[str, int, bool]]) -> str:
    """Build a bukti-pembayaran style PNG (base64) with the given lines.
    Each line: (text, font_size, bold_style).
    """
    W = 760
    H = 60 + sum(sz + 14 for _, sz, _ in lines) + 60
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([(6, 6), (W - 6, H - 6)], outline=(30, 30, 30), width=2)
    d.rectangle([(10, 10), (W - 10, 66)], fill=(224, 236, 255))
    y = 78
    for text, sz, bold in lines:
        font = _load_font(sz + (2 if bold else 0))
        d.text((30, y), text, fill=(15, 15, 15), font=font)
        y += sz + 14
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _b64_seabank_full_receipt() -> str:
    """Realistic SeaBank → Shopee transfer receipt per review request."""
    return _make_receipt_image([
        ("SeaBank", 34, True),
        ("Berhasil", 28, True),
        ("Rp51.000", 40, True),
        ("Dari  Bagos Sudjiwo", 22, False),
        ("SeaBank  901461530896", 22, False),
        ("Ke  Shopee", 22, False),
        ("Username: sudjiwo14", 22, False),
        ("No. Transaksi", 20, False),
        ("2026082243508309274936490", 20, False),
        ("No. Referensi", 20, False),
        ("15665380490586757524", 20, False),
        ("Metode  SeaBank Bayar Instan", 22, False),
        ("Produk  Pembayaran Shopee", 22, False),
        ("22 Agu 2026  21:55", 22, False),
    ])


def _b64_partial_receipt() -> str:
    # ONLY app name + a partial "Dari" line. No amount, ref, txno, method, time…
    return _make_receipt_image([
        ("GoPay", 32, True),
        ("Dari Budi", 24, False),
    ])


# -------------------- Tests: OCR happy-path (12 fields) --------------------

@pytest.mark.timeout(120)
def test_ocr_bukti_seabank_extracts_12_fields(api_client, base_url):
    b64 = _b64_seabank_full_receipt()
    r = api_client.post(
        f"{base_url}/api/ocr/bukti",
        json={"image_base64": b64, "mime_type": "image/png"},
        timeout=120,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    data = r.json()
    assert "fields" in data, data
    f = data["fields"]

    # Structure: all 12 required fields with {value, confident}
    required = ("amount", "sender_name", "sender_bank", "sender_account",
                "recipient", "recipient_username", "method", "ref", "txno",
                "product", "date", "time")
    for k in required:
        assert k in f, f"missing field {k}"
        assert set(f[k].keys()) >= {"value", "confident"}, f[k]

    # amount == integer 51000 & confident
    assert f["amount"]["value"] == 51000, f"amount != 51000, got {f['amount']}"
    assert isinstance(f["amount"]["value"], int)
    assert f["amount"]["confident"] is True

    # sender_bank contains SeaBank
    assert f["sender_bank"]["value"] and "seabank" in str(f["sender_bank"]["value"]).lower(), f["sender_bank"]

    # sender_account contains the number
    assert f["sender_account"]["value"] and "901461530896" in str(f["sender_account"]["value"]).replace(" ", ""), f["sender_account"]

    # recipient contains Shopee
    assert f["recipient"]["value"] and "shopee" in str(f["recipient"]["value"]).lower(), f["recipient"]

    # recipient_username contains sudjiwo14
    assert f["recipient_username"]["value"] and "sudjiwo14" in str(f["recipient_username"]["value"]).lower(), f["recipient_username"]

    # method contains SeaBank Bayar Instan-ish
    assert f["method"]["value"] and "seabank" in str(f["method"]["value"]).lower(), f["method"]

    # ref & txno contain their numeric strings
    assert f["ref"]["value"] and "15665380490586757524" in str(f["ref"]["value"]).replace(" ", ""), f["ref"]
    assert f["txno"]["value"] and "2026082243508309274936490" in str(f["txno"]["value"]).replace(" ", ""), f["txno"]

    # product contains "Shopee"
    assert f["product"]["value"] and "shopee" in str(f["product"]["value"]).lower(), f["product"]

    # time contains 21:55
    assert f["time"]["value"] and "21:55" in str(f["time"]["value"]), f["time"]

    # date should contain 22 Agu 2026 (year at least)
    assert f["date"]["value"] and "2026" in str(f["date"]["value"]), f["date"]


@pytest.mark.timeout(120)
def test_ocr_bukti_partial_returns_null_and_not_confident(api_client, base_url):
    """OCR must NOT guess: fields not present must be null + confident=false."""
    b64 = _b64_partial_receipt()
    r = api_client.post(
        f"{base_url}/api/ocr/bukti",
        json={"image_base64": b64, "mime_type": "image/png"},
        timeout=120,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    f = r.json()["fields"]

    # amount / ref / txno / time / method / product / recipient / recipient_username
    # not present → must be value=null and confident=false
    for k in ("amount", "ref", "txno", "time", "product", "recipient_username"):
        v = f[k]["value"]
        conf = f[k]["confident"]
        assert v is None and conf is False, \
            f"{k} must be null+not-confident when missing, got {f[k]}"


# -------------------- Tests: OCR input validation --------------------

def test_ocr_bukti_empty_image_returns_400(api_client, base_url):
    r = api_client.post(
        f"{base_url}/api/ocr/bukti",
        json={"image_base64": "", "mime_type": "image/png"},
    )
    assert r.status_code == 400, r.text


# -------------------- Tests: sync bukti collection (extended doc) --------------------

def test_sync_bukti_push_and_pull_with_12_fields(api_client, base_url):
    """POST /api/sync/push with extended-model bukti[] then GET /api/sync/pull returns them."""
    store = f"TEST-OCR-{int(time.time())}"
    bukti_doc = {
        "id": "bx",
        "status": "BERHASIL",
        "amount": 51000,
        "sender_name": "A",
        "sender_bank": "SeaBank",
        "sender_account": "1",
        "recipient": "Shopee",
        "recipient_username": "u",
        "method": "m",
        "ref": "r",
        "txno": "t",
        "product": "p",
        "date": "",
        "time": "",
        "note": "",
        "created_at": "2026-08-22T00:00:00Z",
        "updated_at": "2026-08-22T00:00:00Z",
    }
    body = {
        "store": store,
        "products": [],
        "transactions": [],
        "bukti": [{"id": "bx", "doc": bukti_doc, "updated_at": 1755800000000}],
    }
    r = api_client.post(f"{base_url}/api/sync/push", json=body)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    r2 = api_client.get(
        f"{base_url}/api/sync/pull",
        params={"store": store, "since": 0},
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert "bukti" in data, "sync/pull response must contain 'bukti' key"
    ids = [b["id"] for b in data["bukti"]]
    assert "bx" in ids, f"bx not returned in bukti: {data['bukti']}"
    b_out = next(b for b in data["bukti"] if b["id"] == "bx")
    assert b_out["doc"]["status"] == "BERHASIL"
    assert b_out["doc"]["amount"] == 51000
    assert b_out["doc"]["sender_bank"] == "SeaBank"
    assert b_out["doc"]["recipient"] == "Shopee"


def test_sync_bukti_lww_older_ignored(api_client, base_url):
    """LWW: pushing an older updated_at must NOT overwrite newer stored doc."""
    store = f"TEST-OCR-LWW-{int(time.time())}"
    newer = {
        "store": store, "products": [], "transactions": [],
        "bukti": [{
            "id": "b2",
            "doc": {"id": "b2", "status": "BERHASIL", "method": "DANA", "recipient": "New",
                    "amount": 9000, "sender_name": "", "sender_bank": "", "sender_account": "",
                    "recipient_username": "", "ref": "", "txno": "", "product": "",
                    "date": "", "time": "", "note": "",
                    "created_at": "2026-08-22T00:00:00Z", "updated_at": "2026-08-22T00:00:00Z"},
            "updated_at": 2_000_000_000_000,
        }]
    }
    older = {
        "store": store, "products": [], "transactions": [],
        "bukti": [{
            "id": "b2",
            "doc": {"id": "b2", "status": "PENDING", "method": "OldMethod", "recipient": "Old",
                    "amount": 1, "sender_name": "", "sender_bank": "", "sender_account": "",
                    "recipient_username": "", "ref": "", "txno": "", "product": "",
                    "date": "", "time": "", "note": "",
                    "created_at": "2020-01-01T00:00:00Z", "updated_at": "2020-01-01T00:00:00Z"},
            "updated_at": 1_000_000_000_000,
        }]
    }
    assert api_client.post(f"{base_url}/api/sync/push", json=newer).status_code == 200
    assert api_client.post(f"{base_url}/api/sync/push", json=older).status_code == 200
    r = api_client.get(f"{base_url}/api/sync/pull", params={"store": store, "since": 0})
    assert r.status_code == 200
    b_out = next(b for b in r.json()["bukti"] if b["id"] == "b2")
    assert b_out["doc"]["method"] == "DANA", f"LWW violated, got {b_out['doc']}"
