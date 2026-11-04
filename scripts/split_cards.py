# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf>=1.24", "pillow>=10"]
# ///
"""Split a game's print-and-play card sheets into individual card images.

How the sheets are laid out comes from the game's configuration file
(pipeline.toml, section [cards]):
  * pdf, out: the card sheets, and where the images and cards.json go.
  * Each page one embedded image. Pages come in pairs: a page of fronts, then
    the page of their backs.
  * rows x cols cards of card_mm (width, height in mm) per page, centered, no
    gutter; page_width_mm gives the scale of the page's image.
  * mirror_backs: the backs are mirrored horizontally (long-edge duplex), so the
    back of the card at (row, col) sits at (row, cols - 1 - col) on the
    following page.
  * sizes: the images written per side, by name (e.g. lg, sm).

Output (in `out`):
  <size>/<id>-front.webp, <size>/<id>-back.webp   one image per size and side
  cards.json                                      manifest used by the React app

Card ids (001, 002, ...) follow sheet order. Each card in cards.json has its
`faces` (the images of its front and back, per size, relative to cards.json)
and where it was printed (`sheet`, `row`, `col`, for the pipeline only). The
labels a later script added to an existing cards.json (index_cards.py: type,
code, name) are kept.

Usage:
  uv run scripts/split_cards.py
  uv run scripts/split_cards.py --config pipeline.toml --sheets 1-3
  uv run scripts/split_cards.py --pdf path/to/cards.pdf --out public/cards
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import tomllib
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "pipeline.toml"
RENDER_DPI = 300
# What split_cards.py writes of each card; everything else in an existing cards.json is kept.
OWN_KEYS = ("id", "sheet", "row", "col", "faces")


@dataclass(frozen=True)
class Layout:
    """How the cards lie on the sheets (pipeline.toml, [cards])."""

    page_width_mm: float
    card_w_mm: float
    card_h_mm: float
    rows: int
    cols: int
    mirror_backs: bool
    sizes: dict[str, tuple[int, int]]


def read_config(path: Path) -> tuple[Path, Path, Layout]:
    """The card sheets, the output directory and the layout, from the [cards] section of a configuration file."""
    try:
        with path.open("rb") as f:
            cards = tomllib.load(f)["cards"]
    except FileNotFoundError:
        sys.exit(f"No configuration file {path} (--config names another).")
    except tomllib.TOMLDecodeError as e:
        sys.exit(f"{path} is no valid TOML: {e}")
    except KeyError:
        sys.exit(f"{path} has no [cards] section.")
    base = path.resolve().parent
    try:
        return base / cards["pdf"], base / cards["out"], layout_of(cards)
    except KeyError as e:
        sys.exit(f"{path}: [cards] has no {e.args[0]}.")


def layout_of(cards: dict) -> Layout:
    card_w, card_h = cards["card_mm"]
    return Layout(
        page_width_mm=float(cards["page_width_mm"]),
        card_w_mm=float(card_w),
        card_h_mm=float(card_h),
        rows=int(cards["rows"]),
        cols=int(cards["cols"]),
        mirror_backs=bool(cards.get("mirror_backs", False)),
        sizes={name: (int(w), int(h)) for name, (w, h) in cards["sizes"].items()},
    )


def layout_record(layout: Layout) -> dict:
    """How the cards were cut, as cards.json records it: labels of cards cut otherwise belong to other cards."""
    return {
        "rows": layout.rows,
        "cols": layout.cols,
        "card_mm": [layout.card_w_mm, layout.card_h_mm],
        "mirror_backs": layout.mirror_backs,
    }


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


def card_boxes(img: Image.Image, layout: Layout) -> list[list[tuple[int, int, int, int]]]:
    """Crop boxes [row][col] for a centered grid of cards."""
    px_per_mm = img.width / layout.page_width_mm
    cw, ch = layout.card_w_mm * px_per_mm, layout.card_h_mm * px_per_mm
    x0 = (img.width - layout.cols * cw) / 2
    y0 = (img.height - layout.rows * ch) / 2
    return [
        [
            (round(x0 + c * cw), round(y0 + r * ch), round(x0 + (c + 1) * cw), round(y0 + (r + 1) * ch))
            for c in range(layout.cols)
        ]
        for r in range(layout.rows)
    ]


def save_card(img: Image.Image, out: Path, name: str, quality: int, layout: Layout) -> None:
    for size_name, size in layout.sizes.items():
        img.resize(size, Image.LANCZOS).save(out / size_name / f"{name}.webp", "WEBP", quality=quality, method=6)


def faces(card_id: str, layout: Layout) -> dict[str, dict[str, str]]:
    """The images of a card's front and back, per size, relative to cards.json."""
    return {
        side: {size_name: f"{size_name}/{card_id}-{side}.webp" for size_name in layout.sizes}
        for side in ("front", "back")
    }


def process_sheet(pdf: str, sheet: int, out: str, quality: int, layout: Layout) -> list[dict]:
    """Split one sheet (a front page + its back page). `sheet` is 1-based."""
    out_dir = Path(out)
    doc = pymupdf.open(pdf)
    front = page_image(doc, (sheet - 1) * 2)
    back = page_image(doc, (sheet - 1) * 2 + 1)
    front_boxes, back_boxes = card_boxes(front, layout), card_boxes(back, layout)
    rows, cols = layout.rows, layout.cols

    cards = []
    for r in range(rows):
        for c in range(cols):
            index = (sheet - 1) * rows * cols + r * cols + c + 1
            card_id = f"{index:03d}"
            back_col = cols - 1 - c if layout.mirror_backs else c
            save_card(front.crop(front_boxes[r][c]), out_dir, f"{card_id}-front", quality, layout)
            save_card(back.crop(back_boxes[r][back_col]), out_dir, f"{card_id}-back", quality, layout)
            cards.append({"id": card_id, "sheet": sheet, "row": r, "col": c, "faces": faces(card_id, layout)})
    return cards


def parse_range(spec: str, maximum: int) -> list[int]:
    result: set[int] = set()
    for part in spec.split(","):
        lo, _, hi = part.partition("-")
        result.update(range(int(lo), int(hi or lo) + 1))
    return sorted(s for s in result if 1 <= s <= maximum)


def same_cards(old: dict, pdf: Path, layout: Layout) -> bool:
    """Whether an existing cards.json was cut from the same sheets the same way, so its card ids name the same cards."""
    if old.get("source") != pdf.name:
        return False
    # A cards.json written before the layout was recorded names only its sheets.
    return "layout" not in old or old["layout"] == layout_record(layout)


def kept_labels(old: dict) -> dict[str, dict]:
    """What later scripts added to each card of an existing cards.json (its type, code, name…), by id."""
    return {c["id"]: {k: v for k, v in c.items() if k not in OWN_KEYS} for c in old.get("cards", [])}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="the game's configuration file")
    parser.add_argument("--pdf", type=Path, help="card sheet PDF (default: the configuration's)")
    parser.add_argument("--out", type=Path, help="output directory (default: the configuration's)")
    parser.add_argument("--sheets", help="only these sheets, e.g. '1-3,7' (1 sheet = front + back page)")
    parser.add_argument("--quality", type=int, default=85, help="WebP quality (default 85)")
    parser.add_argument("--workers", type=int, default=None, help="parallel processes")
    args = parser.parse_args()

    pdf, out, layout = read_config(args.config)
    pdf, out = args.pdf or pdf, args.out or out

    with pymupdf.open(pdf) as doc:
        if doc.page_count % 2:
            sys.exit(f"Expected an even number of pages (front/back pairs), got {doc.page_count}")
        sheet_count = doc.page_count // 2

    sheets = parse_range(args.sheets, sheet_count) if args.sheets else list(range(1, sheet_count + 1))
    for size_name in layout.sizes:
        (out / size_name).mkdir(parents=True, exist_ok=True)

    manifest_path = out / "cards.json"
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    sizes = {name: {"width": w, "height": h} for name, (w, h) in layout.sizes.items()}
    same = bool(old) and same_cards(old, pdf, layout)
    labels = kept_labels(old) if same else {}
    if old and not same:
        print(f"{manifest_path} was cut from other sheets or otherwise: its labels are dropped (run index_cards.py).")
    cards: dict[str, dict] = {}
    # Cards of sheets not split this time stay as they were, their images where this run puts them.
    if args.sheets and old:
        if not same or old.get("sizes") != sizes:
            sys.exit(f"{manifest_path} was cut otherwise: split all sheets once first (without --sheets).")
        cards = {c["id"]: {**c, "faces": faces(c["id"], layout)} for c in old.get("cards", [])}
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(process_sheet, str(pdf), s, str(out), args.quality, layout) for s in sheets]
        for done, future in enumerate(futures, 1):
            for card in future.result():
                cards[card["id"]] = {**card, **labels.get(card["id"], {})}
            print(f"\rsheet {done}/{len(sheets)}", end="", flush=True)
    print()

    first = next(iter(layout.sizes.values()))
    manifest = {
        "source": pdf.name,
        "cardSize": {"width": first[0], "height": first[1]},
        "sizes": sizes,
        "layout": layout_record(layout),
        "cards": sorted(cards.values(), key=lambda card: card["id"]),
    }
    manifest_path.write_text(json.dumps(manifest, indent=1))
    split = len(sheets) * layout.rows * layout.cols
    print(f"Wrote {split} cards ({split * 2 * len(layout.sizes)} images) to {out}")


if __name__ == "__main__":
    main()
