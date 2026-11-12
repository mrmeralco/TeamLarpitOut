"""Parser tests on Meralco's public sample Bill (docs/kyb/images/bill-explainer-front-june-2026.jpg).
No OCR model needed: the fixtures are saved RapidOCR boxes and Tesseract text."""

import json
import math
from pathlib import Path

import pytest

from app.ocr.bill_parser import boxes_from_text, parse_amount, parse_bill
from app.ocr.layout import Box

FIXTURES = Path(__file__).parent / "fixtures" / "ocr"

EXPECTED = {
    "readable": True, "period": "2026-05", "billingDays": 30, "kwh": 200, "dueDate": "2026-05-20",
    "previousReading": 47643, "presentReading": 47843, "customerAccountNumber": "1234567890",
}
CHARGES = [
    ("Generation", 1758.84), ("Transmission", 281.48), ("System Loss", 159.88), ("Distribution (Meralco)", 298.0),
    ("Senior Citizen", 0.02), ("Government Taxes", 262.14), ("Universal Charges", 64.32),
    ("FiT-All (Renewable)", 40.22), ("GEA-All (Renewable)", 0.0), ("Lifeline", 2.0),
]


def sample_boxes() -> list[Box]:
    raw = json.loads((FIXTURES / "sample-bill-rapid-boxes.json").read_text())
    return [Box(b["text"], [tuple(p) for p in b["points"]], b["score"]) for b in raw]


def rotated(boxes: list[Box], degrees: float) -> list[Box]:
    """The same page photographed at an angle: every corner rotated around the page centre."""
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    cx, cy = 1200, 1600
    return [
        Box(b.text, [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in b.points], b.score)
        for b in boxes
    ]


def text(name: str) -> str:
    return (FIXTURES / f"sample-bill-{name}.txt").read_text()


def assert_sample(r: dict) -> None:
    assert {k: r[k] for k in EXPECTED} == EXPECTED
    assert [(c["label"], c["amount"]) for c in r["chargeLines"]] == CHARGES
    assert r["chargesTotal"] == 2866.9 and r["chargesAddUp"] is True


def test_reads_every_field_from_rapidocr_boxes():
    r = parse_bill(sample_boxes())
    assert_sample(r)
    assert {"period": "2026-04", "kwh": 180} in r["history"]
    assert {"period": "2025-12", "kwh": 180} in r["history"]  # last year's row: January bills still find December
    assert len(r["history"]) == 12


@pytest.mark.parametrize("degrees", [-8, -4, -2, 2, 4, 8])
def test_tilted_photo_still_pairs_every_charge_with_its_amount(degrees):
    assert_sample(parse_bill(rotated(sample_boxes(), degrees)))


def test_box_order_does_not_matter():
    assert_sample(parse_bill(list(reversed(sample_boxes()))))


def test_never_returns_the_name_or_address():
    out = json.dumps(parse_bill(sample_boxes()))
    for personal in ["OLIVIA", "DELA CRUZ", "MALIWANAG", "KAUNLARAN", "123AB456789"]:
        assert personal not in out


def test_present_reading_never_takes_a_year_from_a_date():
    # The failure seen on a real photo: a date's year read as the present reading.
    boxes = sample_boxes()
    for b in boxes:
        if b.text == "47,843":
            b.text = "2026"
    r = parse_bill(boxes)
    assert r["presentReading"] is None  # unread, so the customer types it; never a wrong number
    assert r["previousReading"] == 47643


def test_prefers_the_printed_reading_that_fits_previous_plus_kwh():
    boxes = sample_boxes()
    # OCR put a stray number right under "Current Reading"; the real reading is elsewhere on the page.
    label = next(b for b in boxes if b.text == "Current Reading")
    (x0, y0), (x1, _), _, _ = label.points
    boxes.append(Box("31,337", [(x0, y0 + 25), (x0 + 80, y0 + 25), (x0 + 80, y0 + 45), (x0, y0 + 45)]))
    assert parse_bill(boxes)["presentReading"] == 47843


@pytest.mark.parametrize("passes", [["rapid-left", "rapid-right"], ["tesseract-left", "tesseract-right"]])
def test_text_only_ocr_output_still_works(passes):
    r = parse_bill(boxes_from_text([text(p) for p in passes]))
    assert {k: r[k] for k in EXPECTED} == EXPECTED
    assert len(r["chargeLines"]) == 10 and r["chargesAddUp"] is True


def test_merged_columns_fall_back_to_text_rules():
    r = parse_bill(boxes_from_text([text("tesseract-full")]))
    assert (r["period"], r["billingDays"], r["customerAccountNumber"], r["dueDate"]) == ("2026-05", 30, "1234567890", "2026-05-20")


def test_not_a_meralco_bill():
    assert parse_bill(boxes_from_text(["Grocery receipt\nRice 50.00\nTotal 50.00"]))["readable"] is False
    assert parse_bill([])["readable"] is False


def test_amounts():
    assert parse_amount("2,866.90") == 2866.9
    assert parse_amount("64,32") == 64.32
    assert parse_amount("(12.34)") == -12.34
    assert parse_amount("-0.50") == -0.5
    assert parse_amount("₱2,866.90") == 2866.9
    assert parse_amount("abc") is None
