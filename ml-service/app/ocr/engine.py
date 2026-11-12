"""RapidOCR: PaddleOCR's text detection and recognition models on ONNX Runtime (CPU, offline).

The photo is decoded in memory and never written to disk. The models ship inside the
rapidocr package, so reading a Bill needs no network at all.
"""

from __future__ import annotations

import io
import threading

from PIL import Image, ImageOps, UnidentifiedImageError

from .layout import Box

# Phone photos above this are scaled down first: same accuracy on a Bill, much less work.
MAX_SIDE = 2400


class NotAnImage(ValueError):
    pass


class OcrEngine:
    def __init__(self) -> None:
        from rapidocr import RapidOCR  # imported here so tests of the parser don't load the models

        # Bills are photographed upright; the per-box rotation classifier only costs time.
        self._ocr = RapidOCR(params={"Global.use_cls": False})
        self._lock = threading.Lock()  # one photo at a time: the CPU is the bottleneck anyway

    def read(self, data: bytes) -> list[Box]:
        try:
            image = Image.open(io.BytesIO(data))
            image = ImageOps.exif_transpose(image).convert("RGB")  # apply the phone's rotation flag
        except (UnidentifiedImageError, OSError) as err:
            raise NotAnImage("The file is not a readable image.") from err
        if max(image.size) > MAX_SIDE:
            image.thumbnail((MAX_SIDE, MAX_SIDE))
        with self._lock:
            result = self._ocr(image)
        if result.boxes is None or result.txts is None:
            return []
        return [
            Box(text=str(t).strip(), points=[(float(x), float(y)) for x, y in pts], score=float(s))
            for pts, t, s in zip(result.boxes, result.txts, result.scores)
            if str(t).strip() and float(s) >= 0.5
        ]
