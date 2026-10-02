# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["pymupdf>=1.24", "pillow>=10", "rapidocr-onnxruntime", "numpy", "scipy", "wordninja"]
# ///
"""Turn the Grimm World rule booklets PDF into page images plus searchable text.

Each A4 page of the PDF is one 300 dpi JPEG holding a fold-up mini booklet: a
centred 4 × 2 grid of card-sized panels. The top row is printed upside down and
holds, left to right, page 2, page 1, the front cover and the back cover; the
bottom row holds pages 3 to 6. Facing pages (1|2, 3|4, 5|6) are drawn as one
open book, so the app shows them side by side. The printed paper around the
book is made transparent and the book's shadow on it a see-through shadow, so
the pages lie on whatever background the app gives them.

The booklets have no text layer, so the page text used for search is read with
OCR. OCR often drops the spaces between words ("TheEncounterCards"), so long
runs of letters are split back into words.

Output (default: public/booklets):
  B-P.webp        page P of booklet B (B = 1–6; P = 0 front cover, 1–6, 7 back cover)
  booklets.json   page size and, per booklet, its title and page files and texts, and
                  where on each page the book lies (to line pages up one below the other)

Usage:
  uv run scripts/split_booklets.py
  uv run scripts/split_booklets.py --no-ocr     # images only, no search text
"""

from __future__ import annotations

import argparse
import io
import json
import re
from pathlib import Path

import numpy as np
import pymupdf
import wordninja
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF = ROOT / "game-files" / "GrimmWorld_ENG_RuleBooklets_A4.pdf"
DEFAULT_OUT = ROOT / "public" / "booklets"

# The printed grid on every sheet of this PDF (pixels of the embedded 3508 × 2480 JPEG).
GRID_X, GRID_Y, GRID_W, GRID_H = 242, 190, 3014, 2118
# Page number of each grid cell, row by row; the top row is upside down.
CELLS = [[2, 1, 0, 7], [3, 4, 5, 6]]
# Cover titles, in PDF page order (blackletter, which OCR can't read).
TITLES = [
    "Character, Bags and Encounters",
    "Money, Regions, Alignment and the Game Setup",
    "Terms, Saving and Skill Trees",
    "Exploration",
    "Enemies, Terrain and Conflicts",
    "The Combat",
]


def sheet_image(doc: pymupdf.Document, index: int) -> Image.Image:
    xref = doc[index].get_images()[0][0]
    return Image.open(io.BytesIO(doc.extract_image(xref)["image"])).convert("RGB")


def panels(sheet: Image.Image) -> dict[int, Image.Image]:
    """The eight pages of one sheet, upright, by page number."""
    w, h = GRID_W / 4, GRID_H / 2
    pages = {}
    for row, numbers in enumerate(CELLS):
        for col, number in enumerate(numbers):
            box = (round(GRID_X + col * w), round(GRID_Y + row * h), round(GRID_X + (col + 1) * w), round(GRID_Y + (row + 1) * h))
            img = sheet.crop(box)
            pages[number] = img.rotate(180) if row == 0 else img
    return pages


def cut_out(img: Image.Image) -> Image.Image:
    """The page with the paper around the book transparent and the book's shadow on it a black see-through shadow.

    The paper is the part reaching the panel's edge in the paper's colour, or a darker shade of it (the shadow). The
    colour must match closely: the silver corner pieces are as grey as the shadow, only cooler.
    """
    a = np.asarray(img, dtype=np.float32)
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3)])
    paper = np.median(border[border.mean(1) > np.median(border.mean(1))], axis=0)
    # Brightness relative to the paper, and how far the colour is from the paper's at that brightness.
    k = a.mean(2) / paper.mean()
    off = np.abs(a / np.maximum(a.mean(2, keepdims=True), 1) - paper / paper.mean()).max(2)
    labels, _ = ndimage.label((off < 0.03) & (k > 0.3))
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    paper_mask = np.isin(labels, edge[edge > 0])
    # Specks of paper texture that missed the colour.
    paper_mask |= ndimage.binary_closing(paper_mask, iterations=2)
    alpha = np.ones(k.shape, np.float32)
    alpha[paper_mask] = np.clip((1 - k[paper_mask] - 0.04) / 0.96, 0, 1)
    # No shadow reaches the panel's edge, but the sheet's fold lines run along it.
    rim = np.ones(k.shape, bool)
    rim[3:-3, 3:-3] = False
    alpha[paper_mask & rim] = 0
    # The book's outline blends its colour with the paper's: the pixels along it take the colour just inside, the
    # outermost ones half see-through.
    outline = ndimage.binary_dilation(paper_mask, iterations=3) & ~paper_mask
    inside = ~paper_mask & ~outline
    _, (iy, ix) = ndimage.distance_transform_edt(~inside, return_indices=True)
    a[outline] = a[iy[outline], ix[outline]]
    alpha[ndimage.binary_dilation(paper_mask) & ~paper_mask] = 0.5
    a[paper_mask] = 0
    return Image.fromarray(np.dstack([a, alpha * 255]).round().clip(0, 255).astype(np.uint8), "RGBA")


def book_bounds(page: Image.Image) -> dict[str, list[float]]:
    """Where the book lies across a cut-out page, as fractions of its width.

    `body` is the book itself (its frame, at mid height), `extent` also takes in the corner pieces sticking out of it.
    Left and right pages have the paper on opposite sides, and the covers are a little wider than the pages.
    """
    alpha = np.asarray(page)[..., 3]
    h, w = alpha.shape
    body = np.flatnonzero((alpha[h // 3 : 2 * h // 3] > 230).mean(0) > 0.5)
    extent = np.flatnonzero((alpha > 128).any(0))
    frac = lambda x0, x1: [round(x0 / w, 4), round((x1 + 1) / w, 4)]
    return {"body": frac(body[0], body[-1]), "extent": frac(extent[0], extent[-1])}


def page_text(ocr, img: Image.Image) -> str:
    result, _ = ocr(np.asarray(img))
    lines = sorted(result or [], key=lambda r: (r[0][0][1], r[0][0][0]))
    text = " ".join(r[1] for r in lines)
    # The printed page number ("-3-") is not part of the text.
    text = re.sub(r"\s*-\d-\s*", " ", text)
    return re.sub(r"\s+", " ", tidy(text)).strip()


def tidy(text: str) -> str:
    """Put back the spaces OCR lost: after punctuation, before "(", between "cardY", and inside long letter runs."""
    text = re.sub(r"([,.:;!?)])(?=[A-Za-z(])", r"\1 ", text)
    text = re.sub(r"(?<=[A-Za-z])\(", " (", text)
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    return re.sub(r"[A-Za-z]{6,}", lambda m: " ".join(wordninja.split(m.group())), text)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="rule booklets PDF")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    parser.add_argument("--quality", type=int, default=82, help="WebP quality (default 82)")
    parser.add_argument("--no-ocr", action="store_true", help="skip reading the page texts")
    args = parser.parse_args()

    ocr = None
    if not args.no_ocr:
        from rapidocr_onnxruntime import RapidOCR

        ocr = RapidOCR()

    doc = pymupdf.open(args.pdf)
    if doc.page_count != len(TITLES):
        raise SystemExit(f"Expected {len(TITLES)} booklets, found {doc.page_count} pages")
    args.out.mkdir(parents=True, exist_ok=True)

    booklets, size = [], None
    for index, title in enumerate(TITLES):
        number = index + 1
        pages = []
        for page, img in sorted(panels(sheet_image(doc, index)).items()):
            size = size or img.size
            name = f"{number}-{page}.webp"
            cut = cut_out(img)
            cut.save(args.out / name, "WEBP", quality=args.quality, method=6)
            # Covers carry only the title.
            text = page_text(ocr, img) if ocr and 1 <= page <= 6 else ""
            pages.append({"page": page, "file": name, "text": text, **book_bounds(cut)})
            print(f"\rbooklet {number}/{len(TITLES)}, page {page}", end="", flush=True)
        booklets.append({"id": number, "title": title, "pages": pages})
    print()

    width, height = size
    manifest = {"source": args.pdf.name, "aspect": round(height / width, 4), "booklets": booklets}
    (args.out / "booklets.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(f"Wrote {len(booklets)} booklets ({sum(len(b['pages']) for b in booklets)} pages) to {args.out}")


if __name__ == "__main__":
    main()
