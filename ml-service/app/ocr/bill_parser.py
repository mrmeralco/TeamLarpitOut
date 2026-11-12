"""Turns OCR boxes from a Meralco Bill's front page into the fields the app needs.

Deterministic: no model, no network. It looks only for Meralco's printed labels
("Billing Period", "Customer Account Number (CAN)", "Current Reading", "Actual Consumption",
"Charges for this billing period" ... "Total Amount Due") and never extracts the name or
address. Two strategies, merged field by field:

1. Geometry (first): a value is the box right of, or just below, its label; each charge
   label is paired with the amount on the same (straightened) line. Survives tilted photos
   and OCR that splits a line into several boxes.
2. Text lines (fallback): the same rules on the reconstructed lines, for when OCR merged
   a label and its value into one box.

Anything not found stays None; the customer confirms every value in the app.
"""

from __future__ import annotations

import re
from datetime import date

from .layout import Box, columns, lines, straighten, text_of

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
DATE = r"(\d{1,2})\s*([A-Za-z]{3})[a-z]*\.?\s*(\d{4})"
RANGE = re.compile(DATE + r"\s*(?:to|-|–|—)\s*" + DATE, re.I)
AMOUNT = r"\(?-?[₱P®?]?\s?\d[\d,]*[.,]\d{2}\)?"
READING = re.compile(r"\d{1,3}(?:,\d{3})+|\d{3,7}")
CAN = re.compile(r"(?<!\d)(\d{4}[\s-]?\d{3}[\s-]?\d{3})(?!\d)")


# ---------- small value parsers ----------

def to_date(d: str, mon: str, y: str) -> date | None:
    try:
        return date(int(y), MONTHS.index(mon.lower()[:3]) + 1, int(d))
    except (ValueError, IndexError):
        return None


def dates_in(text: str) -> list[date]:
    return [x for m in re.finditer(DATE, text) if (x := to_date(*m.groups()))]


def parse_amount(raw: str) -> float | None:
    """'2,866.90', '64,32' (OCR comma for a point), '(12.34)' or '-12.34' → float."""
    s = re.sub(r"[₱®?\s]|PHP|\bP\b", "", raw, flags=re.I)
    negative = s.startswith("(") and s.endswith(")") or s.startswith("-")
    s = re.sub(r"[()-]", "", s)
    if re.fullmatch(r"\d{1,3},\d{2}", s):
        s = s.replace(",", ".")
    s = s.replace(",", "")
    if not re.fullmatch(r"\d+\.\d{2}", s):
        return None
    return -float(s) if negative else float(s)


def whole(raw: str) -> int | None:
    s = re.sub(r"[\s,]", "", raw)
    return int(s) if re.fullmatch(r"\d{1,7}", s) else None


def looks_like_year(n: int | None, raw: str = "") -> bool:
    return n is not None and 2000 <= n <= 2100 and "," not in raw


# ---------- geometry ----------

def find(boxes: list[Box], pattern: str) -> list[Box]:
    return [b for b in boxes if re.search(pattern, b.text, re.I)]


def value_near(boxes: list[Box], label: Box, value: re.Pattern | str, below: float = 3.5) -> Box | None:
    """The closest box matching `value` on the label's line to its right, or just below it."""
    rx = re.compile(value, re.I) if isinstance(value, str) else value
    h = label.h
    best, best_d = None, float("inf")
    for b in boxes:
        if b is label or not rx.fullmatch(b.text.strip()):
            continue
        dy = b.cy - label.cy
        if abs(dy) <= 0.6 * h and b.x0 >= label.x1 - h:
            d = 0.5 * (b.x0 - label.x1) / h
        elif 0.3 * h < dy <= below * h and b.x0 < label.x1 + h and b.x1 > label.x0 - h:
            d = dy / h
        else:
            continue
        if d < best_d:
            best, best_d = b, d
    return best


def geo_value(boxes: list[Box], label: str, value: re.Pattern | str) -> str | None:
    for lab in find(boxes, label):
        # The value may be in the label's own box ("Due Date 20 May 2026").
        rest = re.split(label, lab.text, maxsplit=1, flags=re.I)[-1].strip(" :")
        rx = re.compile(value, re.I) if isinstance(value, str) else value
        if rest and rx.fullmatch(rest):
            return rest
        if (b := value_near(boxes, lab, value)) is not None:
            return b.text.strip()
    return None


def geo_charges(boxes: list[Box]) -> tuple[list[dict], float | None]:
    """Charge lines between 'Charges for this billing period' and 'Total Amount Due', paired by position."""
    starts = find(boxes, r"charges\s+for\s+this\s+billing\s+period")
    if not starts:
        return [], None
    start = starts[0]
    ends = [b for b in find(boxes, r"total\s+amount\s+due") if b.cy > start.cy]
    end_y = min((b.cy for b in ends), default=start.cy + 16 * start.h)
    total_box = value_near(boxes, start, AMOUNT, below=0)
    total = parse_amount(total_box.text) if total_box else None
    region = [
        b for b in boxes
        if start.cy + 0.5 * start.h < b.cy < end_y - 0.3 * start.h and b.cx > start.x0 - 2 * start.h and b is not total_box
    ]
    amount_rx = re.compile(AMOUNT)
    amounts = [b for b in region if amount_rx.fullmatch(b.text.strip())]
    labels = [b for b in region if b not in amounts and re.search(r"[A-Za-z]{3}", b.text)]
    used: set[int] = set()
    out: list[dict] = []
    for lab in sorted(labels, key=lambda b: b.cy):
        merged = re.fullmatch(r"(.*?[A-Za-z].*?)\s+(" + AMOUNT + r")", lab.text.strip())
        if merged and (amt := parse_amount(merged.group(2))) is not None:
            out.append({"label": clean_label(merged.group(1)), "amount": amt})
            continue
        candidates = [a for a in amounts if id(a) not in used and abs(a.cy - lab.cy) <= 0.8 * lab.h and a.x0 > lab.x0]
        if not candidates:
            continue
        a = min(candidates, key=lambda a: abs(a.cy - lab.cy))
        amt = parse_amount(a.text)
        if amt is not None:
            used.add(id(a))
            out.append({"label": clean_label(lab.text), "amount": amt})
    return out, total


def clean_label(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^[^A-Za-z]+", "", s)).strip(" :-–—")


# ---------- text lines (fallback) ----------

def after(text: str, label: str, span: int = 160) -> str | None:
    m = re.search(label, text, re.I)
    return text[m.end(): m.end() + span] if m else None


def text_due_date(text: str) -> date | None:
    rows = text.split("\n")
    for i, row in enumerate(rows):
        m = re.search(r"\bdue\s*date\b(?!\s*\.)[ \t:]*(.*)$", row, re.I)
        if not m:
            continue
        for line in [m.group(1), *rows[i + 1: i + 4]]:
            if found := dates_in(line):
                return found[-1]
    return None


def text_reading(text: str, label: str) -> tuple[int | None, str]:
    span = after(text, label, 80)
    if not span:
        return None, ""
    span = re.sub(DATE, " ", span)
    m = re.search(r"(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d{3,7})(?![\w.,]*\d)", span)
    return (whole(m.group(1)), m.group(1)) if m else (None, "")


def text_kwh(text: str) -> int | None:
    span = after(text, r"actual\s+consumption", 120)
    if not span:
        return None
    for m in re.finditer(r"((?:\d[\s,]?){1,7})\s*kwh", span, re.I):
        if re.search(r"\.\d*$", span[: m.start()]):
            continue  # tail of a ₱ rate like 14.33 per kWh
        if (n := whole(m.group(1))) and n > 0:
            return n
    return None


def text_charges(text: str) -> tuple[list[dict], float | None]:
    start = re.search(r"charges\s+for\s+this\s+billing\s+period(.*)$", text, re.I | re.M)
    if not start:
        return [], None
    parts = start.group(1).split()
    total = parse_amount(parts[-1]) if parts else None
    rest = text[start.end():]
    end = re.search(r"total\s+amount\s+due", rest, re.I)
    section = rest[: end.start()] if end else rest[:1200]
    out = []
    for row in section.split("\n"):
        m = re.fullmatch(r"[^A-Za-z]*([A-Za-z][A-Za-z0-9 ()/&.'’-]*?)\s*[:–—]?\s+(" + AMOUNT + r")\s*", row.strip())
        if m and (amt := parse_amount(m.group(2))) is not None and len(m.group(1).strip()) >= 3:
            out.append({"label": clean_label(m.group(1)), "amount": amt})
    return out, total


def text_history(text: str, period: str | None) -> list[dict]:
    """'kWh' row = this Bill's year up to its month; the next row, if it has 12 numbers, is last year's."""
    if not period:
        return []
    m = re.search(r"^\s*kwh\b(.*)$\n?(.*)$", text, re.I | re.M)
    if not m:
        return []
    y, mo = map(int, period.split("-"))
    out = []
    last_year = m.group(2).split()
    if len(last_year) == 12 and all(re.fullmatch(r"\d{1,4}", t) for t in last_year):
        out += [{"period": f"{y - 1}-{i + 1:02d}", "kwh": int(t)} for i, t in enumerate(last_year) if i + 1 > mo]
    for i, t in enumerate(m.group(1).split()[:12]):
        if i + 1 <= mo and re.fullmatch(r"\d{1,4}", t):
            out.append({"period": f"{y}-{i + 1:02d}", "kwh": int(t)})
    return out


def sum_lines(xs: list[dict]) -> float:
    return round(sum(x["amount"] for x in xs), 2)


# ---------- the whole Bill ----------

def parse_bill(boxes: list[Box]) -> dict:
    """All fields from one photo's OCR boxes (any order, any tilt)."""
    straighten(boxes)
    left, right = columns(boxes)
    passes = [text_of(left), text_of(right), text_of(boxes)]
    everything = "\n".join(passes)

    def first(*values):
        return next((v for v in values if v is not None), None)

    # Billing period: "07 Apr 2026 to 06 May 2026"; Meralco counts both ends (30 days here).
    period = billing_days = None
    if m := RANGE.search(" \n".join(b.text for b in boxes) + "\n" + everything):
        start, end = to_date(*m.groups()[:3]), to_date(*m.groups()[3:])
        if start and end and 1 <= (end - start).days + 1 <= 62:
            period, billing_days = f"{end.year}-{end.month:02d}", (end - start).days + 1

    due_raw = geo_value(boxes, r"due\s*date", DATE)
    due = (dates_in(due_raw) or [None])[-1] if due_raw else None
    due = due or next((d for p in passes if (d := text_due_date(p))), None)

    can_raw = geo_value(boxes, r"customer\s+account\s+n(?:o|umber)\.?(?:\s*\(can\))?", CAN)
    can = re.sub(r"\D", "", can_raw) if can_raw else None
    if not can:
        for p in passes:
            if (span := after(p, r"customer\s+account\s+n(?:o|umber)\.?(?:\s*\(can\))?", 200)) and (m := CAN.search(span)):
                can = re.sub(r"\D", "", m.group(1))
                break

    kwh_raw = geo_value(boxes, r"actual\s+consumption", r"\d[\d,\s]*\s*kwh")
    kwh = whole(re.sub(r"(?i)kwh", "", kwh_raw)) if kwh_raw else None
    kwh = kwh or next((k for p in passes if (k := text_kwh(p))), None)

    def reading(label: str) -> int | None:
        raw = geo_value(boxes, label, READING)
        n = whole(raw) if raw else None
        if n is None or looks_like_year(n, raw or ""):
            for p in passes:
                n2, raw2 = text_reading(p, label)
                if n2 is not None and not looks_like_year(n2, raw2):
                    return n2
            return None
        return n

    previous = reading(r"previous\s+reading")
    present = reading(r"(?:current|present)\s+reading")
    # Sanity: present − previous is the consumption. If not, look for the printed number that fits.
    if previous is not None and kwh is not None and present != previous + kwh:
        fits = [b for b in boxes if READING.fullmatch(b.text.strip()) and whole(b.text) == previous + kwh]
        present = whole(fits[0].text) if fits else (None if present is None or looks_like_year(present) else present)

    geo_lines, geo_total = geo_charges(boxes)
    candidates = [(geo_lines, geo_total)] + [text_charges(p) for p in passes]
    with_lines = [c for c in candidates if c[0]]
    balanced = next((c for c in with_lines if c[1] is not None and abs(sum_lines(c[0]) - c[1]) < 0.05), None)
    charge_lines, charges_total = balanced or max(with_lines, key=lambda c: len(c[0]), default=([], None))
    charges_total = charges_total if charges_total is not None else next((c[1] for c in candidates if c[1] is not None), None)

    history = next((h for p in passes if (h := text_history(p, period))), None)
    sin = re.search(r"service\s+id(?:\s+number|\s+no\.?)?\s*:?\s*(\d[\d\s-]{8,14}\d)", everything, re.I)
    sin_digits = re.sub(r"\D", "", sin.group(1)) if sin else None

    looks_like_meralco = re.search(r"meralco|billing\s+period|customer\s+account", everything, re.I)
    if not looks_like_meralco or not (period or kwh or charge_lines):
        return {
            "readable": False,
            "problem": "This doesn't look like the front page of a Meralco bill, or the text is too blurry to read. "
            "Lay the bill flat in good light and take the photo from directly above.",
        }

    return {
        "readable": True,
        "period": period,
        "billingDays": billing_days,
        "kwh": kwh,
        "dueDate": due.isoformat() if due else None,
        "previousReading": previous,
        "presentReading": present,
        "estimated": bool(re.search(r"\bestimated\b", everything, re.I)),
        "serviceIdNumber": sin_digits if sin_digits and 10 <= len(sin_digits) <= 12 else None,
        "customerAccountNumber": can,
        "chargeLines": charge_lines or None,
        "history": history,
        "chargesTotal": charges_total,
        "chargesAddUp": None if charges_total is None or not charge_lines else abs(sum_lines(charge_lines) - charges_total) < 0.05,
    }


def boxes_from_text(passes: list[str]) -> list[Box]:
    """Fake boxes from plain OCR text (one box per line, stacked), for text-only fixtures and tests."""
    out, y = [], 0.0
    for p in passes:
        for row in p.split("\n"):
            if row.strip():
                out.append(Box(row.strip(), [(0, y), (1000, y), (1000, y + 20), (0, y + 20)]))
                y += 30
        y += 600  # keep passes apart
    return out
