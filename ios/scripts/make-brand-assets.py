#!/usr/bin/env python3
"""Draws the Larea glyph (rounded speech bubble with a pin-dot) and writes the app icon,
launch logo and brand color sets into Larea/Resources/Assets.xcassets."""
import json
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "Larea", "Resources", "Assets.xcassets")
BRAND = (0x5E, 0x3B, 0xEE, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
S = 4096  # supersampled canvas


def draw_glyph(canvas, fill, dot_fill, inset=0.0):
    """Bubble + tail in `fill`, pin-dot in `dot_fill`. inset shrinks the glyph (0..0.2)."""
    d = ImageDraw.Draw(canvas)
    k = 1 - inset
    def p(x, y):
        return (S / 2 + (x - 0.5) * S * k, S / 2 + (y - 0.5) * S * k)
    x0, y0 = p(0.20, 0.24)
    x1, y1 = p(0.80, 0.68)
    radius = 0.14 * S * k
    d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)
    d.polygon([p(0.30, 0.64), p(0.30, 0.80), p(0.46, 0.675)], fill=fill)
    cx, cy = p(0.5, 0.46)
    r = 0.075 * S * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dot_fill)


def write_icon():
    canvas = Image.new("RGBA", (S, S), BRAND)
    draw_glyph(canvas, WHITE, BRAND, inset=0.04)
    out = os.path.join(ROOT, "AppIcon.appiconset")
    os.makedirs(out, exist_ok=True)
    canvas.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, "AppIcon.png"))
    json.dump({"images": [{"filename": "AppIcon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
               "info": {"author": "xcode", "version": 1}}, open(os.path.join(out, "Contents.json"), "w"), indent=2)


def write_logo():
    canvas = Image.new("RGBA", (S, S), CLEAR)
    draw_glyph(canvas, WHITE, CLEAR)
    out = os.path.join(ROOT, "LaunchLogo.imageset")
    os.makedirs(out, exist_ok=True)
    images = []
    for scale, px in ((1, 160), (2, 320), (3, 480)):
        name = f"LaunchLogo@{scale}x.png"
        canvas.resize((px, px), Image.LANCZOS).save(os.path.join(out, name))
        images.append({"filename": name, "idiom": "universal", "scale": f"{scale}x"})
    json.dump({"images": images, "info": {"author": "xcode", "version": 1}}, open(os.path.join(out, "Contents.json"), "w"), indent=2)


def color(hex_rgb, alpha=1.0):
    r, g, b = hex_rgb[1:3], hex_rgb[3:5], hex_rgb[5:7]
    return {"color-space": "srgb", "components": {"red": f"0x{r.upper()}", "green": f"0x{g.upper()}", "blue": f"0x{b.upper()}", "alpha": f"{alpha:.3f}"}}


def write_colorset(name, light, dark):
    out = os.path.join(ROOT, f"{name}.colorset")
    os.makedirs(out, exist_ok=True)
    json.dump({"colors": [
        {"idiom": "universal", "color": light},
        {"idiom": "universal", "appearances": [{"appearance": "luminosity", "value": "dark"}], "color": dark},
    ], "info": {"author": "xcode", "version": 1}}, open(os.path.join(out, "Contents.json"), "w"), indent=2)


if __name__ == "__main__":
    write_icon()
    write_logo()
    write_colorset("BrandPrimary", color("#5E3BEE"), color("#8B74FF"))
    write_colorset("BrandDeep", color("#3A22B5"), color("#C9BEFF"))
    write_colorset("BrandTint", color("#5E3BEE", 0.12), color("#8B74FF", 0.20))
    write_colorset("Sunny", color("#FFC84A"), color("#FFD36A"))
    write_colorset("Success", color("#1DB954"), color("#43D17A"))
    write_colorset("Danger", color("#E5484D"), color("#FF6B6B"))
    write_colorset("LaunchBackground", color("#5E3BEE"), color("#2B1C7A"))
    print("brand assets written to", os.path.abspath(ROOT))
