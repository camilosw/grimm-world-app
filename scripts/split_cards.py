# /// script
# requires-python = ">=3.10"
# dependencies = ["pymupdf>=1.24", "pillow>=10"]
# ///
"""Split the Grimm World print-and-play card sheets into individual card images.

Sheet layout (GrimmWorld_ENG_BaseGame_9_Cards_A4.pdf):
  * A4 pages, each one embedded 300 dpi JPEG.
  * 3 x 3 poker-size cards (63.5 x 88.9 mm) per page, centered, no gutter.
  * Odd pages are fronts, even pages are the matching backs. The backs are
    mirrored horizontally (long-edge duplex), so the back of the card at
    (row, col) sits at (row, 2 - col) on the following page.

Output (default: public/cards):
  lg/<id>-front.webp, lg/<id>-back.webp   full resolution (750 x 1050)
  sm/<id>-front.webp, sm/<id>-back.webp   table preview (300 x 420)
  cards.json                              manifest used by the React app

Usage:
  uv run scripts/split_cards.py
  uv run scripts/split_cards.py --pdf path/to/cards.pdf --out public/cards --sheets 1-3
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF = ROOT / "game-files" / "GrimmWorld_ENG_BaseGame_9_Cards_A4.pdf"
DEFAULT_OUT = ROOT / "public" / "cards"

A4_WIDTH_MM = 210.0
CARD_W_MM, CARD_H_MM = 63.5, 88.9
ROWS, COLS = 3, 3
RENDER_DPI = 300
SIZES = {"lg": (750, 1050), "sm": (300, 420)}


def page_image(doc: pymupdf.Document, pno: int) -> Image.Image:
    """Return the page as a PIL image, using the embedded JPEG when possible."""
    page = doc[pno]
    images = page.get_images(full=True)
    if len(images) == 1 and page.get_image_bbox(images[0]).contains(page.rect):
        raw = doc.extract_image(images[0][0])["image"]
        return Image.open(io.BytesIO(raw)).convert("RGB")
    # Fallback for pages that are not a single full-page image.
    pix = page.get_pixmap(dpi=RENDER_DPI)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def card_boxes(img: Image.Image) -> list[list[tuple[int, int, int, int]]]:
    """Crop boxes [row][col] for a centered 3x3 grid of poker cards."""
    px_per_mm = img.width / A4_WIDTH_MM
    cw, ch = CARD_W_MM * px_per_mm, CARD_H_MM * px_per_mm
    x0 = (img.width - COLS * cw) / 2
    y0 = (img.height - ROWS * ch) / 2
    return [
        [
            (round(x0 + c * cw), round(y0 + r * ch), round(x0 + (c + 1) * cw), round(y0 + (r + 1) * ch))
            for c in range(COLS)
        ]
        for r in range(ROWS)
    ]


def save_card(img: Image.Image, out: Path, name: str, quality: int) -> None:
    for size_name, size in SIZES.items():
        img.resize(size, Image.LANCZOS).save(out / size_name / f"{name}.webp", "WEBP", quality=quality, method=6)


def process_sheet(pdf: str, sheet: int, out: str, quality: int) -> list[dict]:
    """Split one sheet (a front page + its back page). `sheet` is 1-based."""
    out_dir = Path(out)
    doc = pymupdf.open(pdf)
    front = page_image(doc, (sheet - 1) * 2)
    back = page_image(doc, (sheet - 1) * 2 + 1)
    front_boxes, back_boxes = card_boxes(front), card_boxes(back)

    cards = []
    for r in range(ROWS):
        for c in range(COLS):
            index = (sheet - 1) * ROWS * COLS + r * COLS + c + 1
            card_id = f"{index:03d}"
            save_card(front.crop(front_boxes[r][c]), out_dir, f"{card_id}-front", quality)
            save_card(back.crop(back_boxes[r][COLS - 1 - c]), out_dir, f"{card_id}-back", quality)
            cards.append({"id": card_id, "sheet": sheet, "row": r, "col": c})
    return cards


def parse_range(spec: str, maximum: int) -> list[int]:
    result: set[int] = set()
    for part in spec.split(","):
        lo, _, hi = part.partition("-")
        result.update(range(int(lo), int(hi or lo) + 1))
    return sorted(s for s in result if 1 <= s <= maximum)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="card sheet PDF")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    parser.add_argument("--sheets", help="only these sheets, e.g. '1-3,7' (1 sheet = front + back page)")
    parser.add_argument("--quality", type=int, default=85, help="WebP quality (default 85)")
    parser.add_argument("--workers", type=int, default=None, help="parallel processes")
    args = parser.parse_args()

    with pymupdf.open(args.pdf) as doc:
        if doc.page_count % 2:
            sys.exit(f"Expected an even number of pages (front/back pairs), got {doc.page_count}")
        sheet_count = doc.page_count // 2

    sheets = parse_range(args.sheets, sheet_count) if args.sheets else list(range(1, sheet_count + 1))
    for size_name in SIZES:
        (args.out / size_name).mkdir(parents=True, exist_ok=True)

    cards: list[dict] = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(process_sheet, str(args.pdf), s, str(args.out), args.quality) for s in sheets]
        for done, future in enumerate(futures, 1):
            cards.extend(future.result())
            print(f"\rsheet {done}/{len(sheets)}", end="", flush=True)
    print()

    manifest = {
        "source": args.pdf.name,
        "cardSize": {"width": SIZES["lg"][0], "height": SIZES["lg"][1]},
        "sizes": {name: {"width": w, "height": h} for name, (w, h) in SIZES.items()},
        "cards": sorted(cards, key=lambda card: card["id"]),
    }
    (args.out / "cards.json").write_text(json.dumps(manifest, indent=1))
    print(f"Wrote {len(cards)} cards ({len(cards) * 2 * len(SIZES)} images) to {args.out}")


if __name__ == "__main__":
    main()
