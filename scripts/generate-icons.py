#!/usr/bin/env python3
"""Generate AskThis app and tray icons (Pillow required).

Outputs:
  build/icon.png                     1024px app icon (electron-builder source)
  resources/icon.png                 1024px copy
  resources/tray/trayTemplate.png    16px  macOS template (black + alpha)
  resources/tray/trayTemplate@2x.png 32px  macOS template @2x
  resources/tray/tray.png            32px  Windows/Linux tray icon
"""
from PIL import Image, ImageDraw
import math
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

BLUE_TOP = (82, 138, 247)     # #528AF7
BLUE_BOTTOM = (44, 88, 214)   # #2C58D6
WHITE = (255, 255, 255, 255)


def vertical_gradient(size):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        r = int(BLUE_TOP[0] + (BLUE_BOTTOM[0] - BLUE_TOP[0]) * t)
        g = int(BLUE_TOP[1] + (BLUE_BOTTOM[1] - BLUE_TOP[1]) * t)
        b = int(BLUE_TOP[2] + (BLUE_BOTTOM[2] - BLUE_TOP[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b))
    return img


def rounded_mask(size, radius_ratio=0.225):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    return mask


def sparkle_points(cx, cy, R, r):
    pts = []
    for i in range(8):
        ang = (math.pi / 4) * i - math.pi / 2
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return pts


def draw_symbol(draw, size, margin_ratio, arm_ratio, star_ratio, inner_ratio, width_ratio, color,
                star_offset_y=0.0):
    """Corners + sparkle, drawn with rounded line caps."""
    w = max(1, int(size * width_ratio))
    m = int(size * margin_ratio)
    L = int(size * arm_ratio)
    cx = size // 2
    cy = int(size // 2 + size * star_offset_y)

    def seg(x1, y1, x2, y2):
        draw.line([(x1, y1), (x2, y2)], fill=color, width=w)
        r = w / 2
        draw.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=color)
        draw.ellipse([x2 - r, y2 - r, x2 + r, y2 + r], fill=color)

    s1 = size - m  # right/bottom edge of the corner frame

    # top-left
    seg(m, m + L, m, m)
    seg(m, m, m + L, m)
    # top-right
    seg(s1 - L, m, s1, m)
    seg(s1, m, s1, m + L)
    # bottom-right
    seg(s1, s1 - L, s1, s1)
    seg(s1, s1, s1 - L, s1)
    # bottom-left
    seg(m + L, s1, m, s1)
    seg(m, s1, m, s1 - L)

    R = size * star_ratio
    r = size * inner_ratio
    draw.polygon(sparkle_points(cx, cy, R, r), fill=color)


def make_app_icon(size=1024):
    base = vertical_gradient(size).convert('RGBA')
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    img.paste(base, (0, 0), rounded_mask(size))
    d = ImageDraw.Draw(img)
    draw_symbol(
        d,
        size,
        margin_ratio=0.285,
        arm_ratio=0.130,
        star_ratio=0.145,
        inner_ratio=0.046,
        width_ratio=0.050,
        color=WHITE,
        star_offset_y=0.022,
    )
    return img


def make_tray_template(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if size >= 24:
        # full corners + sparkle
        draw_symbol(
            d,
            size,
            margin_ratio=0.14,
            arm_ratio=0.20,
            star_ratio=0.22,
            inner_ratio=0.07,
            width_ratio=0.085,
            color=(0, 0, 0, 255),
        )
    else:
        # tiny: just the sparkle (corners become mush at 16px)
        cx = cy = size / 2
        d.polygon(sparkle_points(cx, cy, size * 0.42, size * 0.13), fill=(0, 0, 0, 255))
    return img


def make_tray_color(size=32):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    base = vertical_gradient(size).convert('RGBA')
    img.paste(base, (0, 0), rounded_mask(size, 0.24))
    d = ImageDraw.Draw(img)
    draw_symbol(
        d,
        size,
        margin_ratio=0.20,
        arm_ratio=0.17,
        star_ratio=0.185,
        inner_ratio=0.058,
        width_ratio=0.075,
        color=WHITE,
    )
    return img


def save(img, path):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full)
    print('wrote', path, img.size)


if __name__ == '__main__':
    icon = make_app_icon(1024)
    save(icon, 'build/icon.png')
    save(icon, 'resources/icon.png')
    save(make_tray_template(16), 'resources/tray/trayTemplate.png')
    save(make_tray_template(32), 'resources/tray/trayTemplate@2x.png')
    save(make_tray_color(32), 'resources/tray/tray.png')
