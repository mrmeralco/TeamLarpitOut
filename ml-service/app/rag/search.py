"""Retrieval (the R in RAG) over Meralco's public "Understand Your Bill" text.

BM25 keyword scoring, plus a boost for passages tagged with the tapped charge line's type.
No embedding model and no network: about 16 short official passages, so exact keyword
matching is accurate, explainable and instant. The passages hold only public Meralco text,
so the caller may pass them to a hosted AI as context.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

KNOWLEDGE = Path(__file__).with_name("meralco-knowledge.json")

# Charge line label → type, first match wins (same rules as server/src/domain/charge-catalog.ts).
CHARGE_TYPES: list[tuple[str, str]] = [
    ("lifeline", r"lifeline"),
    ("senior_citizen", r"senior"),
    ("subsidies", r"subsid"),
    ("universal", r"universal|missionary|environmental|stranded|\bnpc\b|psalm"),
    ("fit_all", r"fit[\s-]?all|feed[\s-]?in"),
    ("gea_all", r"gea[\s-]?a[il1|]{2}|green\s*energy\s*auction"),
    ("generation", r"generation"),
    ("transmission", r"transmission"),
    ("system_loss", r"system\s*loss"),
    ("distribution", r"distribution"),
    ("supply", r"supply"),
    ("metering", r"meter"),
    ("vat", r"\bvat\b|value[\s-]?added"),
    ("local_tax", r"franchise|local\s*tax|real\s*property|\btax(es)?\b"),
]

STOP = set(
    "a an and are as at be by for from has have how i in is it its my of on or the this to was what when where "
    "which who why will with you your ko ang ng sa na ba ito mga si ni po".split()
)

# Tagalog/Taglish question words → the English the official text uses.
SYNONYMS = {
    "bakit": ["why", "reasons"], "tumaas": ["higher", "increase", "changes"], "taas": ["higher", "increase"],
    "mataas": ["higher"], "bumaba": ["lower", "decrease"], "baba": ["lower"], "sino": ["who", "remitted"],
    "saan": ["where", "remitted"], "napupunta": ["remitted", "keeps"], "singil": ["charge", "charges"],
    "bayad": ["payment", "pay"], "buwis": ["tax", "taxes"], "kuryente": ["electricity"], "metro": ["meter"],
    "basa": ["reading", "readings"], "tama": ["correct"], "mali": ["wrong", "adjustment"],
    "reklamo": ["ask", "contact"], "tipid": ["fewer", "lower"], "keep": ["keeps", "keep"],
}


def charge_type(label: str) -> str | None:
    low = label.lower()
    return next((code for code, rx in CHARGE_TYPES if re.search(rx, low)), None)


def tokenize(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    words = re.split(r"[\s-]+", re.sub(r"[^a-z0-9\s-]", " ", text))
    return [t for w in words if len(w) > 1 and w not in STOP for t in [w, *SYNONYMS.get(w, [])]]


@dataclass
class Hit:
    passage: dict
    score: float


class KnowledgeIndex:
    def __init__(self, passages: list[dict]) -> None:
        self.passages = passages
        self._docs = []
        df: Counter[str] = Counter()
        for p in passages:
            tokens = tokenize(f"{p['title']} {p['title']} {p['text']}")
            tf = Counter(tokens)
            df.update(tf.keys())
            self._docs.append((p, tf, len(tokens)))
        self._df = df
        self._avg = sum(n for _, _, n in self._docs) / max(len(self._docs), 1)

    @classmethod
    def load(cls, path: Path = KNOWLEDGE) -> "KnowledgeIndex":
        return cls(json.loads(path.read_text(encoding="utf-8"))["passages"])

    def _bm25(self, query: list[str], tf: Counter, length: int, k1: float = 1.2, b: float = 0.75) -> float:
        n = len(self._docs)
        score = 0.0
        for t in set(query):
            f = tf.get(t, 0)
            if not f:
                continue
            idf = math.log(1 + (n - self._df[t] + 0.5) / (self._df[t] + 0.5))
            score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * length / self._avg))
        return score

    def search(self, line_label: str, question: str, k: int = 2) -> list[Hit]:
        """Passages that best explain one charge line and the question about it.
        The passage written for the line's own charge type always ranks first."""
        code = charge_type(line_label)
        query = tokenize(f"{line_label} {question}")
        hits = []
        for p, tf, length in self._docs:
            boost = (100 if p["id"] == code else 10) if code and code in p["charges"] else 0
            score = self._bm25(query, tf, length) + boost
            if score > 0:
                hits.append(Hit(p, round(score, 3)))
        return sorted(hits, key=lambda h: h.score, reverse=True)[:k]
