"""End-to-end API tests: real RapidOCR on Meralco's public sample Bill (about 10 s per photo on a laptop CPU)."""

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "kyb" / "images" / "bill-explainer-front-june-2026.jpg"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # runs startup: loads the OCR models and the knowledge index
        yield c


def upload(client, data: bytes, mime="image/jpeg", debug=False):
    return client.post("/ocr/bill", params={"debug": debug}, files={"photo": ("bill.jpg", data, mime)})


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "ocrModelLoaded": True, "knowledgePassages": 16}


def test_reads_the_sample_bill(client):
    r = upload(client, SAMPLE.read_bytes())
    assert r.status_code == 200
    body = r.json()
    assert body["readable"] is True
    assert (body["period"], body["kwh"], body["billingDays"], body["dueDate"]) == ("2026-05", 200, 30, "2026-05-20")
    assert (body["previousReading"], body["presentReading"], body["customerAccountNumber"]) == (47643, 47843, "1234567890")
    assert len(body["chargeLines"]) == 10 and body["chargesAddUp"] is True
    assert body["ocrText"] is None  # raw text only on ?debug=true


def test_reads_a_photo_taken_at_an_angle(client):
    img = Image.open(SAMPLE).rotate(5, expand=True, fillcolor="white")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    body = upload(client, buf.getvalue()).json()
    assert (body["period"], body["kwh"], body["presentReading"], body["customerAccountNumber"]) == ("2026-05", 200, 47843, "1234567890")
    assert len(body["chargeLines"]) == 10 and body["chargesAddUp"] is True


def test_debug_returns_the_raw_lines(client):
    body = upload(client, SAMPLE.read_bytes(), debug=True).json()
    assert "Charges for this billing period" in body["ocrText"]["right"]


def test_rejects_files_that_are_not_images(client):
    assert upload(client, b"%PDF-1.7", mime="application/pdf").status_code == 400
    assert upload(client, b"not really a jpeg").status_code == 400


def test_rejects_photos_over_10_mb(client):
    assert upload(client, b"0" * (10 * 1024 * 1024 + 1)).status_code == 413


def test_rag_search(client):
    r = client.post("/rag/search", json={"lineLabel": "Generation", "question": "Bakit tumaas?", "k": 2})
    assert r.status_code == 200
    passages = r.json()["passages"]
    assert passages[0]["id"] == "generation"
    assert passages[0]["source"].startswith("https://www.meralco.com.ph/")


def test_rag_search_validates_input(client):
    assert client.post("/rag/search", json={"question": "x" * 301}).status_code == 422
    assert client.post("/rag/search", json={"question": "hi", "k": 9}).status_code == 422


def test_docs_page(client):
    assert client.get("/docs").status_code == 200
    assert {"/ocr/bill", "/rag/search", "/health"} <= set(client.get("/openapi.json").json()["paths"])
