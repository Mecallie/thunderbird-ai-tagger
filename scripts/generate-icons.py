#!/usr/bin/env python3
"""Generate simple extension icons (indigo square with white 'AI' text)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "icons"
SIZES = (16, 32, 48, 128)
COLOR = (99, 102, 241)  # #6366f1


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), COLOR + (255,))
    draw = ImageDraw.Draw(img)

    font_size = max(6, size // 3)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except OSError:
        font = ImageFont.load_default()

    text = "AI"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2
    y = (size - text_h) // 2 - 1
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    return img


def main() -> None:
    ICON_DIR.mkdir(exist_ok=True)
    for size in SIZES:
        path = ICON_DIR / f"icon-{size}.png"
        draw_icon(size).save(path, format="PNG")
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()