"""Regenerate the PWA icons from the brand tokens (needs Pillow): python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
import os
BG, INK, ACCENT = "#F7F7F5", "#1A1917", "#F5A524"   # keep in sync with --bg / --ink / --accent
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

def draw(size, scale):
    S = 4  # supersample for smooth edges
    W = size * S
    im = Image.new("RGB", (W, W), BG); d = ImageDraw.Draw(im)
    u = W * scale / 28  # the logo is drawn on a 28-unit grid
    ox = oy = (W - 28 * u) / 2
    box = lambda x, y, w, h: [ox + x * u, oy + y * u, ox + (x + w) * u, oy + (y + h) * u]
    d.rounded_rectangle(box(3, 6, 14, 19), radius=3 * u, outline=INK, width=round(2 * u))
    d.rounded_rectangle(box(11, 3, 14, 19), radius=3 * u, fill=ACCENT)
    return im.resize((size, size), Image.LANCZOS)

draw(192, .62).save(f"{OUT}/icon-192.png")
draw(512, .62).save(f"{OUT}/icon-512.png")
draw(512, .48).save(f"{OUT}/maskable-512.png")   # stays inside the 80% safe zone
draw(180, .62).save(f"{OUT}/apple-touch-icon.png")
print("icons written")
