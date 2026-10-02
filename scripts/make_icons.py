# /// script
# dependencies = ["pillow"]
# ///
"""Make the PWA icons (public/icons/*.png) from the title card. Needs public/cards (split_cards.py)."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = (27, 21, 18)  # --theme colour #1b1512
card = Image.open(ROOT / "public/cards/lg/001-front.webp").convert("RGB")
out = ROOT / "public/icons"
out.mkdir(exist_ok=True)


def icon(size: int, fill: float, name: str) -> None:
    """Card centred on the background, its height `fill` of the icon (maskable icons keep a safe zone)."""
    h = round(size * fill)
    w = round(h * card.width / card.height)
    img = Image.new("RGB", (size, size), BG)
    img.paste(card.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    img.save(out / name, optimize=True)


icon(192, 0.86, "icon-192.png")
icon(512, 0.86, "icon-512.png")
icon(512, 0.62, "maskable-512.png")
icon(180, 0.86, "apple-touch-icon.png")
