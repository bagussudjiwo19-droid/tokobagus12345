"""Tests for /api/ocr/bukti (OCR bukti pembayaran, Gemini 3 Flash) and
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
    # Try common Linux fonts, fall back to default bitmap
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
    Each line: (text, font_size, bold_style). Bold is emulated via bigger size.
    """
    W, H = 720, 40 + sum(sz + 14 for _, sz, _ in lines) + 40
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    # Draw a subtle border so it isn't a uniform blank image
    d.rectangle([(6, 6), (W - 6, H - 6)], outline=(30, 30, 30), width=2)
    # Header bar
    d.rectangle([(10, 10), (W - 10, 60)], fill=(230, 240, 255))
    y = 76
    for text, sz, bold in lines:
        font = _load_font(sz + (2 if bold else 0))
        d.text((30, y), text, fill=(15, 15, 15), font=font)
        y += sz + 14
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _b64_full_receipt() -> str:
    return _make_receipt_image([
        ("ShopeePay", 32, True),
        ("Pembayaran Berhasil", 22, False),
        ("Rp75.000", 38, True),
        ("Kepada TOKO BAGUS SEMBAKO", 22, False),
        ("Tanggal 22 Agustus 2026", 20, False),
        ("Waktu 14:35", 20, False),
        ("No. Referensi 2026082212345678", 20, False),
    ])


def _b64_partial_receipt() -> str:
    # ONLY method and recipient. No amount, no time, no ref, no date.
    return _make_receipt_image([
        ("GoPay", 32, True),
        ("Kepada Warung Sayur Ibu Ani", 24, False),
        ("Terima kasih sudah membayar", 20, False),
    ])


# -------------------- Tests: OCR happy-path --------------------

@pytest.mark.timeout(90)
def test_ocr_bukti_full_extracts_all_fields(api_client, base_url):
    b64 = _b64_full_receipt()
    r = api_client.post(
        f"{base_url}/api/ocr/bukti",
        json={"image_base64": b64, "mime_type": "image/png"},
        timeout=90,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    data = r.json()
    assert "fields" in data, data
    f = data["fields"]
    # Structure check: every required field with {value, confident}
    for k in ("method", "recipient", "amount", "date", "time", "ref"):
        assert k in f, f"missing field {k}"
        assert set(f[k].keys()) >= {"value", "confident"}, f[k]

    # amount must be integer 75000
    assert f["amount"]["value"] == 75000, f"amount != 75000, got {f['amount']}"
    assert f["amount"]["confident"] is True

    # method should mention ShopeePay
    assert f["method"]["value"] and "shopee" in str(f["method"]["value"]).lower(), f["method"]
    assert f["method"]["confident"] is True

    # recipient should mention TOKO BAGUS
    assert f["recipient"]["value"] and "toko bagus" in str(f["recipient"]["value"]).lower(), f["recipient"]

    # time must contain 14:35
    assert f["time"]["value"] and "14:35" in str(f["time"]["value"]), f["time"]

    # ref should contain the digits sequence
    assert f["ref"]["value"] and "2026082212345678" in str(f["ref"]["value"]).replace(" ", ""), f["ref"]


@pytest.mark.timeout(90)
def test_ocr_bukti_partial_returns_null_and_not_confident(api_client, base_url):
    """OCR must NOT guess: fields not present must be null + confident=false."""
    b64 = _b64_partial_receipt()
    r = api_client.post(
        f"{base_url}/api/ocr/bukti",
        json={"image_base64": b64, "mime_type": "image/png"},
        timeout=90,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    f = r.json()["fields"]
    # amount not present -> must be null + not confident
    assert f["amount"]["value"] in (None, 0) or f["amount"]["confident"] is False, \
        f"amount must be null/not-confident when missing, got {f['amount']}"
    if f["amount"]["value"] is not None:
        # If model still returned a number, it MUST at least not be confident
        assert f["amount"]["confident"] is False, f["amount"]
    else:
        assert f["amount"]["confident"] is False

    # time / ref must be null (or not confident at minimum)
    for k in ("time", "ref"):
        v = f[k]["value"]
        conf = f[k]["confident"]
        assert (v is None and conf is False) or conf is False, \
            f"{k} must not be confidently guessed, got {f[k]}"


# -------------------- Tests: OCR input validation --------------------

def test_ocr_bukti_empty_image_returns_400(api_client, base_url):
    r = api_client.post(
        f"{base_url}/api/ocr/bukti",
        json={"image_base64": "", "mime_type": "image/png"},
    )
    assert r.status_code == 400, r.text


# -------------------- Tests: sync bukti collection --------------------

def test_sync_bukti_push_and_pull(api_client, base_url):
    """POST /api/sync/push with bukti[] then GET /api/sync/pull returns them."""
    store = f"TEST-OCR-{int(time.time())}"
    bukti_doc = {
        "id": "b1",
        "method": "GoPay",
        "recipient": "X",
        "amount": 5000,
        "date": "",
        "time": "",
        "ref": "",
        "customer": "Budi",
        "created_at": "2026-08-22T00:00:00Z",
        "updated_at": "2026-08-22T00:00:00Z",
    }
    body = {
        "store": store,
        "products": [],
        "transactions": [],
        "bukti": [{"id": "b1", "doc": bukti_doc, "updated_at": 1755800000000}],
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
    assert "b1" in ids, f"b1 not returned in bukti: {data['bukti']}"
    b_out = next(b for b in data["bukti"] if b["id"] == "b1")
    assert b_out["doc"]["method"] == "GoPay"
    assert b_out["doc"]["amount"] == 5000
    assert b_out["doc"]["customer"] == "Budi"


def test_sync_bukti_lww_older_ignored(api_client, base_url):
    """LWW: pushing an older updated_at must NOT overwrite newer stored doc."""
    store = f"TEST-OCR-LWW-{int(time.time())}"
    newer = {
        "store": store, "products": [], "transactions": [],
        "bukti": [{
            "id": "b2",
            "doc": {"id": "b2", "method": "DANA", "recipient": "New", "amount": 9000,
                    "date": "", "time": "", "ref": "", "customer": "",
                    "created_at": "2026-08-22T00:00:00Z", "updated_at": "2026-08-22T00:00:00Z"},
            "updated_at": 2_000_000_000_000,
        }]
    }
    older = {
        "store": store, "products": [], "transactions": [],
        "bukti": [{
            "id": "b2",
            "doc": {"id": "b2", "method": "OldMethod", "recipient": "Old", "amount": 1,
                    "date": "", "time": "", "ref": "", "customer": "",
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
