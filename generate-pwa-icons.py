from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
SOURCE = ROOT / "MediMapLogoPremium.png"
BACKGROUND = (18, 59, 102, 255)

source = Image.open(SOURCE).convert("RGBA")
# Crop away the artwork's inset outline. Launchers apply their own icon mask,
# so the exported app icons should use a clean, full-bleed edge.
crop_inset = max(20, round(min(source.size) * 0.04))
source = source.crop((crop_inset, crop_inset, source.width - crop_inset, source.height - crop_inset))

# Remove only the corner-connected white backdrop while preserving the white logo.
mask_source = source.copy()
pixels = mask_source.load()
seen = set()
stack = [(0, 0), (source.width - 1, 0), (0, source.height - 1), (source.width - 1, source.height - 1)]
while stack:
    x, y = stack.pop()
    if (x, y) in seen or not (0 <= x < source.width and 0 <= y < source.height):
        continue
    seen.add((x, y))
    r, g, b, a = pixels[x, y]
    if min(r, g, b) < 236 or max(r, g, b) - min(r, g, b) > 12:
        continue
    pixels[x, y] = (r, g, b, 0)
    stack.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

def standard(size: int, name: str) -> None:
    artwork = mask_source.resize((size, size), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", (size, size), BACKGROUND)
    icon.alpha_composite(artwork)
    icon.save(ROOT / name, optimize=True)

def maskable(size: int, name: str) -> None:
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    artwork_size = round(size * 0.82)
    artwork = mask_source.resize((artwork_size, artwork_size), Image.Resampling.LANCZOS)
    offset = (size - artwork_size) // 2
    canvas.alpha_composite(artwork, (offset, offset))
    canvas.save(ROOT / name, optimize=True)

standard(16, "favicon-16.png")
standard(32, "favicon-32.png")
standard(180, "apple-touch-icon.png")
standard(192, "icon-192.png")
standard(512, "icon-512.png")
maskable(192, "icon-maskable-192.png")
maskable(512, "icon-maskable-512.png")

favicon_artwork = mask_source.resize((64, 64), Image.Resampling.LANCZOS)
favicon = Image.new("RGBA", (64, 64), BACKGROUND)
favicon.alpha_composite(favicon_artwork)
favicon.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
