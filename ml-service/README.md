# Eelio ML service

FastAPI service for the machine-learning parts of Eelio, separate from the NestJS backend (`server/`):

- **`POST /rag/search`**: retrieval (RAG) over Meralco's public "Understand Your Bill" text. The NestJS charge chat calls it, gives the passages to Gemini as context, and shows the top one under the answer ("From Meralco's bill guide").
- **`POST /ocr/bill`**: local bill OCR (RapidOCR, PaddleOCR models on ONNX Runtime, CPU, offline) plus a deterministic parser. The photo is read in memory and never stored or sent anywhere. The NestJS bill scan uses it as the **fallback when Gemini fails** (`VISION_PROVIDER=gemini-ml`, the default), or as the only reader with `VISION_PROVIDER=ml`.

**Full guide (how it works, setup, troubleshooting): [`docs/ml/ocr-and-rag.md`](../docs/ml/ocr-and-rag.md).**
- **`GET /health`**, **`GET /docs`** (try every endpoint in the browser).

## Run

```sh
cd ml-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000       # Windows: .venv\Scripts\uvicorn app.main:app --port 8000
```

Open http://127.0.0.1:8000/docs. Startup takes a few seconds (it loads the OCR models).

The NestJS server finds it at `ML_SERVICE_URL` (default `http://127.0.0.1:8000`, see `server/.env.example`). If the service is not running, the charge chat still answers; it just has no Meralco passage.

## Try it in /docs

- **`/rag/search`**: `{"lineLabel": "Generation", "question": "Bakit tumaas?", "k": 2}` returns the Generation Charge passage first, with its meralco.com.ph source.
- **`/ocr/bill`**: upload a photo of a bill's front page. Takes about 8 to 10 s on a laptop CPU. Lay the bill flat in good light. `debug=true` also returns the raw OCR lines (they include the name and address: local debugging only).

## Test

```sh
.venv/bin/python -m pytest -q        # about 30 s; the API tests run real OCR on Meralco's public sample bill
```

## Layout

```
app/main.py              FastAPI app; loads the OCR models and the knowledge index at startup
app/schemas.py           request/response models (BillReading mirrors server's RawBillReading)
app/rag/search.py        BM25 + boost for the tapped charge's type, Tagalog query words
app/rag/meralco-knowledge.json   16 passages from docs/kyb/know-your-bill-official.md, each with its official source
app/ocr/engine.py        RapidOCR, photo decoded in memory
app/ocr/layout.py        straightens tilted photos, groups boxes into lines and columns
app/ocr/bill_parser.py   Meralco's printed labels → period, kWh, readings, CAN, charge lines, history
tests/                   pytest; fixtures are OCR output of Meralco's public sample bill
```
