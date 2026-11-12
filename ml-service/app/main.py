"""Eelio ML service: local bill OCR and Meralco knowledge retrieval (RAG).

Runs on our own machine. Bill photos are read in memory and never stored or sent anywhere;
retrieval searches only Meralco's public bill guide. The NestJS backend calls this service;
open /docs to try the endpoints directly.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Query, UploadFile

from .ocr.bill_parser import parse_bill
from .ocr.engine import NotAnImage, OcrEngine
from .ocr.layout import columns, text_of
from .rag.search import KnowledgeIndex
from .schemas import BillReading, Health, OcrText, Passage, RagQuery, RagResult

MAX_PHOTO_BYTES = 10 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load once at startup: the OCR models (about 2-3 s) and the knowledge index.
    state["knowledge"] = KnowledgeIndex.load()
    state["ocr"] = OcrEngine()
    yield
    state.clear()


app = FastAPI(
    title="Eelio ML service",
    version="0.1.0",
    summary="Local Meralco bill OCR and bill-guide retrieval (RAG). Nothing leaves this machine.",
    lifespan=lifespan,
)


@app.get("/health", response_model=Health, tags=["service"])
def health() -> Health:
    knowledge = state.get("knowledge")
    return Health(status="ok", ocrModelLoaded="ocr" in state, knowledgePassages=len(knowledge.passages) if knowledge else 0)


@app.post("/ocr/bill", response_model=BillReading, response_model_exclude_none=False, tags=["ocr"])
def read_bill(
    photo: UploadFile = File(description="Photo of the front page of a Meralco Bill (JPEG, PNG, WebP, HEIC)."),
    debug: bool = Query(False, description="Also return the raw OCR lines (includes name and address; local debugging only)."),
) -> BillReading:
    """Reads a Bill photo on this machine: RapidOCR finds the text, a deterministic parser picks out
    the printed values. The photo is decoded in memory and discarded when the request ends."""
    if photo.content_type not in IMAGE_TYPES:
        raise HTTPException(400, f"The file is not an image ({photo.content_type}).")
    data = photo.file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "The photo is larger than 10 MB.")
    started = time.perf_counter()
    try:
        boxes = state["ocr"].read(data)
    except NotAnImage as err:
        raise HTTPException(400, str(err)) from err
    finally:
        del data
    reading = BillReading(**parse_bill(boxes), seconds=round(time.perf_counter() - started, 2))
    if debug:
        left, right = columns(boxes)
        reading.ocrText = OcrText(left=text_of(left), right=text_of(right))
    return reading


@app.post("/rag/search", response_model=RagResult, tags=["rag"])
def rag_search(query: RagQuery) -> RagResult:
    """Finds the official Meralco explanation for a charge line and a question (any language).
    Returns public text only, safe to give to a hosted AI as context."""
    hits = state["knowledge"].search(query.lineLabel, query.question, query.k)
    return RagResult(passages=[Passage(**{k: h.passage[k] for k in ("id", "title", "text", "source")}, score=h.score) for h in hits])
