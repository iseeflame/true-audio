"""Draw simple True Audio icons (green dot + waveform) into icons/."""
import os
from PIL import Image, ImageDraw

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
os.makedirs(out, exist_ok=True)
for size in (16, 48, 128):
    s = size * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, s - 1, s - 1), fill=(33, 33, 33, 255))
    bars = [0.35, 0.65, 0.95, 0.65, 0.35]
    bw = s * 0.09
    gap = s * 0.05
    x = (s - (len(bars) * bw + (len(bars) - 1) * gap)) / 2
    for h in bars:
        bh = s * 0.5 * h
        d.rounded_rectangle((x, (s - bh) / 2, x + bw, (s + bh) / 2), radius=bw / 2, fill=(61, 220, 132, 255))
        x += bw + gap
    im.resize((size, size), Image.LANCZOS).save(os.path.join(out, f"{size}.png"))
print("icons ok")
