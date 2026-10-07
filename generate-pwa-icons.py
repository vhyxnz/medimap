from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
SOURCE = ROOT / "pwa-icon-clean-512.png"
BACKGROUND = (18, 59, 102, 255)

source = Image.open(SOURCE).convert("RGBA")

def export_icon(size: int, name: str) -> None:
    artwork = source.resize((size, size), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", (size, size), BACKGROUND)
    icon.alpha_composite(artwork)
    icon.save(ROOT / name, optimize=True)

export_icon(16, "favicon-16.png")
export_icon(32, "favicon-32.png")
export_icon(180, "apple-touch-icon-v2.png")
export_icon(192, "app-icon-v2-192.png")
export_icon(512, "app-icon-v2-512.png")
export_icon(192, "app-icon-v2-maskable-192.png")
export_icon(512, "app-icon-v2-maskable-512.png")
export_icon(180, "apple-touch-icon.png")
export_icon(192, "icon-192.png")
export_icon(512, "icon-512.png")
export_icon(192, "icon-maskable-192.png")
export_icon(512, "icon-maskable-512.png")

favicon = source.resize((64, 64), Image.Resampling.LANCZOS)
favicon.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
