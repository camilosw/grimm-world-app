# /// script
# requires-python = ">=3.10"
# dependencies = ["pymupdf>=1.24", "pillow>=10"]
# ///
"""Turn the Grimm World rulebook PDF into page images plus a searchable index.

The rulebook relies on inline game symbols and figures that plain text loses,
so the app shows the real pages and uses the extracted text only for search.

Output (default: public/rules):
  page-NN.webp   one image per page; NN is the printed page number (00 = cover)
  rules.json     version, page texts and the table of contents with the page
                 and vertical position of every section heading

Usage:
  uv run scripts/split_rules.py
  uv run scripts/split_rules.py --pdf "path/to/rulebook.pdf" --dpi 150
"""

from __future__ import annotations

import argparse
import io
import json
import re
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF = ROOT / "game-files" / "Grimm World - The Rulebook.pdf"
DEFAULT_OUT = ROOT / "public" / "rules"

# Header repeated on every page: "Grimm World - The Rulebook  Version 1.3  12/61".
HEADER_RE = re.compile(r"Grimm World - The Rulebook\s+Version\s+([\d.]+)\s+(\d+)/(\d+)")
# Contents entries: "4.7.4" + "Storage Card ······ 11" (number and title may share a line).
TOC_RE = re.compile(r"^(\d+(?:\.\d+)*)\s*\n?\s*([^\n·]*?[^\s·])\s*·*\s*\n?\s*(\d+)\s*$", re.M)


def clean(text: str) -> str:
    text = HEADER_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text.replace("·", " ")).strip()


def title_case(title: str) -> str:
    """The first two heading levels are printed in capitals in the contents."""
    if title.upper() != title:
        return title
    small = {"a", "an", "and", "the", "of", "in", "to", "for"}
    words = title.lower().split()
    cap = lambda w: re.sub(r"(^|[(\-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w)
    return " ".join(w if i and w in small else cap(w) for i, w in enumerate(words))


def parse_toc(doc: pymupdf.Document, contents_pages: list[int]) -> list[dict]:
    text = "\n".join(doc[i].get_text() for i in contents_pages)
    text = HEADER_RE.sub("", text)
    # The page title "2 Contents" is not an entry.
    text = re.sub(r"^\s*2\s+Contents\s*$", "", text, count=1, flags=re.M)
    # Normalise dot leaders and blank lines so every entry is "number\ntitle ··· page".
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    entries = []
    for m in TOC_RE.finditer(text):
        number, title, page = m.group(1), m.group(2).strip(), int(m.group(3))
        entries.append({"id": number, "title": title_case(title), "page": page, "depth": number.count(".")})
    # Keep document order and drop accidental duplicates.
    seen, toc = set(), []
    for e in entries:
        if e["id"] not in seen:
            seen.add(e["id"])
            toc.append(e)
    return toc


def heading_position(page: pymupdf.Page, number: str, title: str) -> float:
    """Vertical position (0–1) of a section heading on its page, 0 if not found.

    Headings are printed as the section number followed by the title, either on
    the same line or on the next one.
    """
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if text:
                lines.append((text, line["bbox"][1], line["bbox"][0]))
    lines.sort(key=lambda line: (line[1], line[2]))
    start = re.sub(r"\W", "", title.lower())[:8]
    squash = lambda t: re.sub(r"\W", "", t.lower())
    for i, (text, y, _) in enumerate(lines):
        rest = text[len(number):] if text.startswith(number) else None
        if rest is None or (rest and not rest[0].isspace()):
            continue
        if squash(rest):
            candidates = [rest]
        else:
            # The title is on its own line(s): next to the number (same height, possibly split
            # into several pieces) or just below it.
            beside = "".join(t for t, ty, _ in sorted(lines, key=lambda line: line[2]) if abs(ty - y) < 6 and t != text)
            candidates = [beside, lines[i + 1][0] if i + 1 < len(lines) else ""]
        if any(squash(c).startswith(start) for c in candidates):
            return round(max(0.0, y - 12) / page.rect.height, 4)
    # Fall back to the title text itself.
    for rect in page.search_for(title[:30]):
        return round(max(0.0, rect.y0 - 12) / page.rect.height, 4)
    return 0.0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="rulebook PDF")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    parser.add_argument("--dpi", type=int, default=150, help="render resolution (default 150)")
    parser.add_argument("--quality", type=int, default=80, help="WebP quality (default 80)")
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    args.out.mkdir(parents=True, exist_ok=True)

    version, pages = None, []
    for i, page in enumerate(doc):
        raw = page.get_text()
        header = HEADER_RE.search(raw)
        printed = int(header.group(2)) if header else 0
        version = version or (header.group(1) if header else None)
        pix = page.get_pixmap(dpi=args.dpi)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        name = f"page-{printed:02d}.webp"
        img.save(args.out / name, "WEBP", quality=args.quality, method=6)
        pages.append({"page": printed, "file": name, "text": clean(raw), "index": i})
        print(f"\rpage {i + 1}/{doc.page_count}", end="", flush=True)
    print()

    by_printed = {p["page"]: p for p in pages}
    # The contents pages are the ones full of dot leaders.
    contents = [p["index"] for p in pages if doc[p["index"]].get_text().count("·") > 200]
    toc = parse_toc(doc, contents)
    for entry in toc:
        page = by_printed.get(entry["page"])
        entry["y"] = heading_position(doc[page["index"]], entry["id"], entry["title"]) if page else 0.0

    for p in pages:
        del p["index"]
    width, height = Image.open(args.out / pages[0]["file"]).size
    manifest = {"source": args.pdf.name, "version": version, "aspect": round(height / width, 4), "pages": pages, "toc": toc}
    (args.out / "rules.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(f"Wrote {len(pages)} pages and {len(toc)} contents entries to {args.out} (rulebook version {version})")


if __name__ == "__main__":
    main()
