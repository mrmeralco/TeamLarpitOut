"""Page geometry for OCR boxes: straighten a tilted photo, then group boxes into lines and columns.

A phone photo is rarely level. If a charge label and its amount sit a few pixels apart
vertically, plain "same y" grouping splits them. We estimate the page's tilt from the long
text boxes (their top edges should be horizontal), rotate every box back by that angle,
and only then compare positions.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field


@dataclass
class Box:
    text: str
    # Four corners as RapidOCR returns them: top-left, top-right, bottom-right, bottom-left.
    points: list[tuple[float, float]]
    score: float = 1.0
    # Bounds after straightening (filled by `straighten`).
    x0: float = field(default=0.0)
    x1: float = field(default=0.0)
    y0: float = field(default=0.0)
    y1: float = field(default=0.0)

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def h(self) -> float:
        return max(self.y1 - self.y0, 1.0)


def tilt(boxes: list[Box]) -> float:
    """The page's rotation in radians, from the top edges of boxes clearly wider than tall."""
    slopes = []
    for b in boxes:
        (ax, ay), (bx, by) = b.points[0], b.points[1]
        width = bx - ax
        height = math.dist(b.points[0], b.points[3])
        if width > 2 * height and width > 0:
            slopes.append((by - ay) / width)
    return math.atan(statistics.median(slopes)) if slopes else 0.0


def straighten(boxes: list[Box]) -> list[Box]:
    """Rotates every box by the page's tilt so printed lines become horizontal. Returns the boxes."""
    angle = tilt(boxes)
    c, s = math.cos(angle), math.sin(angle)
    for b in boxes:
        xs = [x * c + y * s for x, y in b.points]
        ys = [-x * s + y * c for x, y in b.points]
        b.x0, b.x1, b.y0, b.y1 = min(xs), max(xs), min(ys), max(ys)
    return boxes


def lines(boxes: list[Box]) -> list[list[Box]]:
    """Boxes whose vertical centres are within half a text height form one printed line, left to right."""
    if not boxes:
        return []
    tolerance = max(statistics.median(b.h for b in boxes) * 0.5, 4.0)
    rows: list[list[Box]] = []
    for b in sorted(boxes, key=lambda b: b.cy):
        if rows and abs(statistics.fmean(x.cy for x in rows[-1]) - b.cy) <= tolerance:
            rows[-1].append(b)
        else:
            rows.append([b])
    return [sorted(r, key=lambda b: b.x0) for r in rows]


def text_of(boxes: list[Box]) -> str:
    return "\n".join(" ".join(b.text for b in row) for row in lines(boxes))


def columns(boxes: list[Box]) -> tuple[list[Box], list[Box]]:
    """Splits the page into its left and right halves by box centre."""
    if not boxes:
        return [], []
    middle = (min(b.x0 for b in boxes) + max(b.x1 for b in boxes)) / 2
    return [b for b in boxes if b.cx < middle], [b for b in boxes if b.cx >= middle]
