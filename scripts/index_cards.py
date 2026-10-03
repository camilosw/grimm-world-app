# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["rapidocr-onnxruntime", "pillow", "numpy"]
# ///
"""Label the split Grimm World cards with their type and card number.

Run after split_cards.py. Reads public/cards/cards.json + lg images and adds:
  type   one of the card types from the rulebook (chapter 3.1)
  code   printed card number, e.g. "B23", "X05", "Y291c", "T07", "R1-111"
  name   short human readable label (for fixed cards)

Card numbers of Encounter and Lost Pages cards are read with OCR from the top
edge of the card. Cards whose number could not be read are listed at the end;
fix them by hand in cards.json or with --override 123=Y456.

Usage:
  uv run scripts/index_cards.py
  uv run scripts/index_cards.py --override 300=Y291c --override 301=Y292
  uv run scripts/index_cards.py --cards 120,130     # re-read only these cards
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT / "public" / "cards"

# Region (number, event number) and Terrain numbers as printed on the card
# backs, in sheet order.
REGIONS = [(1, 111), (1, 211), (1, 311), (1, 411), (2, 111), (2, 211), (3, 111), (3, 211)]
TERRAINS = [*range(1, 25), *range(27, 32), *range(51, 58), *range(71, 80), 90]

# Card ranges of GrimmWorld_ENG_BaseGame_9_Cards_A4.pdf (1-based card index).
# Values are (type, name[, code]).
FIXED: dict[int, tuple[str, ...]] = {
    1: ("title", "Title"),
    2: ("character", "Martha"),
    3: ("alignment", "Alignment +1/+2 | +3/+4"),
    4: ("alignment", "Alignment -1/-2 | -3/-4"),
    **{i: ("money", "Money") for i in range(5, 9)},
    **{i: ("region", f"Region {r} ({e})", f"R{r}-{e}") for i, (r, e) in enumerate(REGIONS, 9)},
    **{i: ("terrain", f"Terrain {n:02d}", f"T{n:02d}") for i, n in enumerate(TERRAINS, 17)},
    **{i: ("hitpoints", hp) for i, hp in zip(range(63, 67), ("Yellow", "Turquoise", "Pink", "Black"))},
    67: ("storybook", "Book Cover / Prologue"),
    **{67 + n: ("storybook", f"Chapter {n}") for n in range(1, 15)},
    82: ("storybook", "Epilogue"),
    83: ("storybook", "Book Back Side"),
    84: ("time", "Time Passes"),
    85: ("time", "Next Chapter"),
}
ENCOUNTERS = range(86, 138)

# Numbers OCR gets wrong or cannot read, checked by eye. Enemy cards only show
# their number in tiny print; X-cards 120/130 print the landscape letter "B".
KNOWN = {
    "120": "X05", "130": "X17", "312": "Y507", "379": "Y676a", "393": "Y800e", "394": "Y800f",
    "395": "Y800g", "396": "Y800h", "397": "Y800i", "398": "Y800j", "399": "Y800k", "400": "Y800l",
    "409": "Y811", "410": "Y812", "413": "Y815b", "417": "Y816b", "419": "Y817a", "420": "Y817b",
    "421": "Y817c", "426": "Y821b", "472": "Y951", "494": "Y011", "496": "Y013", "497": "Y014a",
    "498": "Y014b", "499": "Y014c", "263": "Y511a", "331": "Y711", "437": "Y701a", "144": "Y036a",
    "145": "Y036b", "146": "Y036c", "353": "Y105e", "448": "Y731e", "449": "Y731f",
    # Read right, but on one side only.
    "142": "Y034", "143": "Y035", "147": "Y037", "342": "Y736a", "343": "Y736b", "344": "Y736c",
    "345": "Y736d", "484": "Y705", "485": "Y705", "486": "Y706", "487": "Y706", "488": "Y706",
    "489": "Y707", "490": "Y707", "491": "Y707", "492": "Y707", "493": "Y010", "495": "Y012",
}
LOST_PAGES = range(138, 541)

# OCR quirks: lowercase letters, "O" for zero, numbers split into several
# boxes or glued to the following title ("Y410The ..."). Suffixes run up to
# "l" (Y800a-l).
CODE_RE = re.compile(r"([BXYQ])[-. ]?([0-9O]{2,3})((?-i:[a-l])?)", re.IGNORECASE)


class Reader:
    def __init__(self, card_dir: Path) -> None:
        self.ocr = RapidOCR()
        self.dir = card_dir

    def text(self, card_id: str, side: str, box: tuple[int, int, int, int], zoom: int = 1) -> list[str]:
        img = Image.open(self.dir / "lg" / f"{card_id}-{side}.webp").convert("RGB").crop(box)
        if zoom > 1:
            img = img.resize((img.width * zoom, img.height * zoom), Image.LANCZOS)
        result, _ = self.ocr(np.asarray(img))
        return [r[1] for r in result or []]

    def code(self, card_id: str, side: str, box: tuple[int, int, int, int], letters: str) -> str | None:
        """Card number from a strip of the card; retries upscaled if needed."""
        for zoom in (1, 2):
            texts = self.text(card_id, side, box, zoom)
            # Each box alone first (keeps suffixes), then glued together for
            # numbers that were split into several boxes.
            for t in [*texts, "".join(texts)]:
                code = find_code(t, letters)
                if code:
                    return code
        return None


def find_code(text: str, letters: str) -> str | None:
    for m in CODE_RE.finditer(text):
        letter = m.group(1).upper()
        digits = m.group(2).upper().replace("O", "0")
        if letter in letters and (letter != "Y" or len(digits) == 3):
            return letter + digits + m.group(3)
    return None


def encounter_type(code: str | None) -> str:
    return {"B": "encounter-b", "X": "encounter-x"}.get(code[:1] if code else "", "encounter")


def label(reader: Reader, index: int, card_id: str) -> dict:
    if index in FIXED:
        type_, name, *code = FIXED[index]
        return {"type": type_, "name": name, **({"code": code[0]} if code else {})}

    if card_id in KNOWN:
        code = KNOWN[card_id]
        return {"type": encounter_type(code) if index in ENCOUNTERS else "lost-pages", "code": code}

    if index in ENCOUNTERS:
        code = reader.code(card_id, "front", (0, 0, 750, 110), "BX")
        return {"type": encounter_type(code), **({"code": code} if code else {})}

    # Lost Pages: the front has the full number (incl. its a, b, c… suffix), the
    # back repeats it without the suffix. Combine both for robustness.
    front = reader.code(card_id, "front", (0, 0, 750, 110), "Y")
    back = reader.code(card_id, "back", (450, 0, 750, 150), "Y")
    back = back[:4] if back else None
    info = {"type": "lost-pages"}
    if front and back and front[:4] != back:
        info["ocrConflict"] = f"front={front} back={back}"
    elif not (front and back):
        info["ocrUnverified"] = True
    if front or back:
        info["code"] = front or back
    return info


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR, help="directory with cards.json and lg/")
    parser.add_argument("--override", action="append", default=[], metavar="ID=CODE", help="set a code by hand")
    parser.add_argument("--cards", help="only re-read these card ids, e.g. '120,130,263'")
    args = parser.parse_args()

    manifest_path = args.dir / "cards.json"
    manifest = json.loads(manifest_path.read_text())
    reader = Reader(args.dir)
    overrides = dict(o.split("=", 1) for o in args.override)

    only = set(args.cards.split(",")) if args.cards else None
    todo = [c for c in manifest["cards"] if only is None or c["id"] in only]
    for n, card in enumerate(todo, 1):
        for key in ("type", "code", "name", "ocrConflict", "ocrUnverified"):
            card.pop(key, None)
        card.update(label(reader, int(card["id"]), card["id"]))
        print(f"\rcard {n}/{len(todo)}", end="", flush=True)
    print()

    for card in manifest["cards"]:
        if card["id"] in overrides:
            card["code"] = overrides[card["id"]]
            card.pop("ocrConflict", None)
            card.pop("ocrUnverified", None)
            if card.get("type", "").startswith("encounter"):
                card["type"] = encounter_type(card["code"])

    manifest_path.write_text(json.dumps(manifest, indent=1))

    counts = Counter(c["type"] for c in manifest["cards"])
    print("Types:", ", ".join(f"{t}={n}" for t, n in counts.items()))
    needs_code = {"encounter", "encounter-b", "encounter-x", "lost-pages"}
    missing = [c["id"] for c in manifest["cards"] if c["type"] in needs_code and not c.get("code")]
    if missing:
        print(f"No card number found for {len(missing)} cards: {', '.join(missing)}")
    for c in manifest["cards"]:
        if "ocrConflict" in c:
            print(f"Check card {c['id']}: {c['ocrConflict']} (using {c['code']})")
    unverified = [f"{c['id']}={c['code']}" for c in manifest["cards"] if c.get("ocrUnverified") and c.get("code")]
    if unverified:
        print(f"Read from one side only, worth a glance: {', '.join(unverified)}")


if __name__ == "__main__":
    main()
