"""Original, deterministic Third Place concept film. No network calls or app imports."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import wave
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT.parent / ".hackathon" / "video"
OUT = ROOT / "output"
W, H = 1920, 1080
SR = 48000
REVIEW_TIMES = [4.0, 12.8, 21.8, 30.0, 36.0, 40.2, 45.8, 51.3, 57.0]
FONTS = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
FONT_FILES = {
    "sans": "segoeui.ttf",
    "medium": "seguisb.ttf",
    "bold": "segoeuib.ttf",
    "light": "segoeuil.ttf",
    "serif": "georgia.ttf",
    "italic": "georgiai.ttf",
}
P = {
    "paper": "#F5F0E7",
    "ink": "#332C26",
    "muted": "#73685C",
    "sage": "#82927D",
    "sage_dark": "#50634E",
    "sage_soft": "#E7ECDF",
    "line": "#D9D0C3",
    "white": "#FFFDFA",
    "cream": "#EBDECB",
    "terracotta": "#BF8065",
    "clay": "#D8AF91",
    "wood": "#AD7955",
    "wood_light": "#CAA17B",
    "skin": "#C68F6C",
    "skin_light": "#E1B393",
    "hair": "#45372C",
    "trousers": "#626C60",
    "wall": "#EDE5D8",
}


def rgb(color):
    if isinstance(color, tuple):
        return color
    return tuple(int(color[i : i + 2], 16) for i in (1, 3, 5))


def ease(value):
    x = min(1.0, max(0.0, value))
    return x * x * (3 - 2 * x)


def mix(a, b, value):
    return a + (b - a) * value


@lru_cache(maxsize=180)
def font(size, face="sans"):
    path = FONTS / FONT_FILES[face]
    if not path.exists():
        raise FileNotFoundError(f"Required local typeface not found: {path}")
    return ImageFont.truetype(str(path), round(size))


def measure(text, size, face="sans", tracking=0):
    f = font(size, face)
    if tracking:
        return sum(f.getlength(c) for c in text) + tracking * max(0, len(text) - 1)
    return f.getlength(text)


@lru_cache(maxsize=1500)
def text_layer(text, size, face="sans", color=P["ink"], tracking=0):
    f = font(size, face)
    bounds = f.getbbox(text or " ")
    width = math.ceil(measure(text, size, face, tracking)) + 12
    height = bounds[3] - bounds[1] + 12
    layer = Image.new("RGBA", (max(1, width), max(1, height)))
    d = ImageDraw.Draw(layer)
    if tracking:
        x = 5
        for character in text:
            d.text((x, 5 - bounds[1]), character, font=f, fill=color)
            x += f.getlength(character) + tracking
    else:
        d.text((5 - bounds[0], 5 - bounds[1]), text, font=f, fill=color)
    return layer


def put(canvas, layer, x, y, opacity=1):
    if opacity <= 0:
        return
    if opacity < 0.999:
        layer = layer.copy()
        layer.putalpha(layer.getchannel("A").point(lambda a: round(a * opacity)))
    canvas.paste(layer, (round(x), round(y)), layer)


def text(canvas, x, y, value, size, face="sans", color=P["ink"], alpha=1, tracking=0):
    layer = text_layer(value, size, face, color, tracking)
    put(canvas, layer, x - 5, y - 5, alpha)


def centered(canvas, y, value, size, face="sans", color=P["ink"], alpha=1, tracking=0):
    x = (W - measure(value, size, face, tracking)) / 2
    text(canvas, x, y, value, size, face, color, alpha, tracking)


def wrap(value, width, size, face="sans"):
    lines = []
    for paragraph in value.split("\n"):
        line = ""
        for word in paragraph.split():
            candidate = f"{line} {word}".strip()
            if line and measure(candidate, size, face) > width:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return lines


def paragraph(canvas, x, y, value, width, size, face="sans", color=P["ink"], leading=None, alpha=1):
    leading = leading or size * 1.4
    lines = wrap(value, width, size, face)
    for i, line in enumerate(lines):
        text(canvas, x, y + i * leading, line, size, face, color, alpha)
    return len(lines) * leading


def headline(canvas, lines, local, x=114, y=254, size=78, leading=100, color=P["ink"]):
    for i, line in enumerate(lines):
        reveal = ease((local - 0.1 - i * 0.09) / 0.65)
        text(canvas, x, y + i * leading + 18 * (1 - reveal), line, size, "serif", color, reveal)


def label(canvas, x, y, value, alpha=1):
    text(canvas, x, y, value, 19, "medium", P["sage_dark"], alpha, 2.5)


@lru_cache(maxsize=80)
def panel_layer(width, height, fill=P["white"], radius=24, shadow=True, border=P["line"]):
    pad = 36
    size = (width + pad * 2, height + pad * 2)
    image = Image.new("RGBA", size)
    if shadow:
        mask = Image.new("L", size)
        ImageDraw.Draw(mask).rounded_rectangle(
            (pad, pad + 10, width + pad, height + pad + 10), radius, fill=22
        )
        mask = mask.filter(ImageFilter.GaussianBlur(18))
        shadow_image = Image.new("RGBA", size, rgb(P["hair"]) + (0,))
        shadow_image.putalpha(mask)
        image.alpha_composite(shadow_image)
    shape = Image.new("RGBA", (width * 2 + 2, height * 2 + 2))
    d = ImageDraw.Draw(shape)
    d.rounded_rectangle((1, 1, width * 2, height * 2), radius * 2, fill=fill, outline=border, width=2)
    shape = shape.resize((width + 1, height + 1), Image.Resampling.LANCZOS)
    image.alpha_composite(shape, (pad, pad))
    return image


def panel(canvas, x, y, width, height, fill=P["white"], radius=24, shadow=True, alpha=1, border=P["line"]):
    put(canvas, panel_layer(width, height, fill, radius, shadow, border), x - 36, y - 36, alpha)


def line(canvas, coordinates, fill=P["line"], width=2):
    ImageDraw.Draw(canvas).line(coordinates, fill=fill, width=width)


def circle(canvas, x, y, radius, fill, outline=None, width=1):
    ImageDraw.Draw(canvas).ellipse((x - radius, y - radius, x + radius, y + radius), fill, outline, width)


def logo(canvas, x, y, scale=1, alpha=1):
    art = Image.new("RGBA", (round(72 * scale), round(60 * scale)))
    d = ImageDraw.Draw(art)
    r = 17 * scale
    for cx, cy, color in [(22, 23, P["sage"]), (45, 23, P["ink"]), (33.5, 41, P["terracotta"])]:
        cx, cy = cx * scale, cy * scale
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgb(color) + (230,))
    d.ellipse((28 * scale, 27 * scale, 39 * scale, 38 * scale), fill=P["paper"])
    put(canvas, art, x, y, alpha)


def check(canvas, x, y, scale=1, color=P["sage_dark"]):
    line(canvas, [(x - 9 * scale, y), (x - 2 * scale, y + 7 * scale), (x + 12 * scale, y - 9 * scale)], color, max(2, round(3 * scale)))


def arrow(canvas, x, y, color=P["sage_dark"], scale=1):
    line(canvas, [(x - 10 * scale, y), (x + 10 * scale, y)], color, round(2 * scale))
    line(canvas, [(x + 3 * scale, y - 7 * scale), (x + 10 * scale, y), (x + 3 * scale, y + 7 * scale)], color, round(2 * scale))


def chat_icon(canvas, x, y, r=28):
    circle(canvas, x, y, r, P["sage_soft"])
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((x - 13, y - 11, x + 13, y + 9), 6, outline=P["sage_dark"], width=2)
    d.line([(x - 7, y + 8), (x - 9, y + 15), (x - 1, y + 9)], fill=P["sage_dark"], width=2)
    for dx in (-6, 0, 6):
        circle(canvas, x + dx, y - 1, 1.6, P["sage_dark"])


def pill(canvas, x, y, title, size=23, fill=P["sage_soft"], color=P["sage_dark"], height=44, padding=21):
    width = math.ceil(measure(title, size, "medium")) + 2 * padding
    panel(canvas, x, y, width, height, fill, height // 2, False, border=fill)
    text(canvas, x + padding, y + (height - size) / 2 - 2, title, size, "medium", color)
    return width


class Art:
    """Supersampled original vector illustration, expressed in a 900 × 720 grid."""

    def __init__(self, width=900, height=720, scale=2):
        self.scale = scale
        self.image = Image.new("RGBA", (width * scale, height * scale))
        self.d = ImageDraw.Draw(self.image)

    def box(self, values):
        return tuple(round(x * self.scale) for x in values)

    def ellipse(self, bounds, fill, outline=None, width=1):
        self.d.ellipse(self.box(bounds), fill=fill, outline=outline, width=round(width * self.scale))

    def rect(self, bounds, fill, radius=0, outline=None, width=1):
        if radius:
            self.d.rounded_rectangle(self.box(bounds), round(radius * self.scale), fill, outline, round(width * self.scale))
        else:
            self.d.rectangle(self.box(bounds), fill, outline, round(width * self.scale))

    def poly(self, points, fill):
        self.d.polygon([self.box(p) for p in points], fill)

    def stroke(self, points, fill, width=2):
        self.d.line([self.box(p) for p in points], fill, round(width * self.scale), joint="curve")

    def curve(self, points, fill, width=2):
        p = np.asarray(points, dtype=float)
        t = np.linspace(0, 1, 46)[:, None]
        curve = (1 - t) ** 3 * p[0] + 3 * (1 - t) ** 2 * t * p[1] + 3 * (1 - t) * t**2 * p[2] + t**3 * p[3]
        self.stroke(curve, fill, width)

    def path(self, start, segments, fill):
        points = [start]
        origin = np.asarray(start, dtype=float)
        for segment in segments:
            if len(segment) == 2:
                points.append(segment)
                origin = np.asarray(segment, dtype=float)
                continue
            control1, control2, end = [np.asarray(point, dtype=float) for point in segment]
            t = np.linspace(0, 1, 25)[:, None]
            bezier = (1 - t) ** 3 * origin + 3 * (1 - t) ** 2 * t * control1 + 3 * (1 - t) * t**2 * control2 + t**3 * end
            points.extend(bezier.tolist())
            origin = end
        self.poly(points, fill)

    def finish(self):
        return self.image.resize((self.image.width // self.scale, self.image.height // self.scale), Image.Resampling.LANCZOS)


def cup(a, x, y, scale=1, color=P["white"]):
    a.ellipse((x + 20 * scale, y + 4 * scale, x + 38 * scale, y + 23 * scale), None, color, 4 * scale)
    a.path(
        (x, y),
        [
            (x + 27 * scale, y),
            ((x + 27 * scale, y + 32 * scale), (x + 1 * scale, y + 32 * scale), (x, y)),
        ],
        color,
    )
    a.ellipse((x + 2 * scale, y - 2 * scale, x + 25 * scale, y + 6 * scale), P["wood"])
    a.ellipse((x - 8 * scale, y + 25 * scale, x + 37 * scale, y + 32 * scale), color)


def plant(a, x, y, scale=1):
    a.path(
        (x - 34 * scale, y),
        [(x + 35 * scale, y), (x + 26 * scale, y + 65 * scale), (x - 23 * scale, y + 65 * scale)],
        P["clay"],
    )
    a.ellipse((x - 36 * scale, y - 8 * scale, x + 36 * scale, y + 10 * scale), P["wood_light"])
    a.curve(
        [(x, y), (x + 7 * scale, y - 85 * scale), (x - 12 * scale, y - 138 * scale), (x + 3 * scale, y - 190 * scale)],
        P["sage_dark"],
        3 * scale,
    )
    for dx, dy, direction in [(1, -145, -1), (0, -116, 1), (-1, -87, -1), (1, -61, 1), (2, -170, 1)]:
        start = (x + dx * scale, y + dy * scale)
        tip = (start[0] + 56 * direction * scale, start[1] - 53 * scale)
        a.path(
            start,
            [
                ((start[0] + 7 * direction * scale, start[1] - 49 * scale), (tip[0] - 8 * direction * scale, tip[1] - 9 * scale), tip),
                ((tip[0] + 5 * direction * scale, tip[1] + 30 * scale), (start[0] + 25 * direction * scale, start[1] + 3 * scale), start),
            ],
            P["sage"] if direction == -1 else P["sage_dark"],
        )


def person(kind="alex", pose="working", mirror=False):
    a = Art(340, 420)
    skin = P["skin"] if kind == "maya" else P["skin_light"]
    shirt = P["sage"] if kind == "maya" else P["terracotta"]
    pants = P["trousers"] if kind == "alex" else P["ink"]
    a.rect((77, 229, 162, 269), P["wood_light"], 12)
    a.stroke([(96, 256), (74, 399)], P["wood"], 8)
    a.stroke([(151, 257), (179, 399)], P["wood"], 8)
    a.path((127, 235), [((195, 222), (203, 249), (204, 282)), (209, 366), (178, 366), (162, 290), (123, 286)], pants)
    a.path((100, 225), [((151, 232), (165, 256), (164, 282)), (148, 380), (119, 378), (119, 291), (83, 267)], pants)
    a.ellipse((108, 369, 165, 389), P["hair"])
    a.ellipse((174, 359, 235, 380), P["hair"])
    a.rect((109, 103, 146, 146), skin, 12)
    a.path(
        (92, 124),
        [((116, 114), (153, 117), (170, 149)), ((184, 187), (157, 208), (165, 247)), ((137, 264), (98, 259), (76, 245)), ((77, 213), (67, 155), (92, 124))],
        shirt,
    )
    if kind == "maya":
        a.path((82, 68), [((61, 101), (73, 135), (105, 142)), (155, 131), (150, 61)], P["hair"])
    a.ellipse((87, 28, 168, 125), skin)
    a.poly([(160, 69), (181, 85), (163, 90)], skin)
    a.ellipse((77, 28, 168, 87), P["hair"])
    a.path((86, 36), [((93, 9), (139, 11), (163, 42)), (153, 57), ((130, 54), (104, 55), (98, 91)), (86, 84)], P["hair"])
    a.ellipse((93, 75, 111, 98), skin)
    a.stroke([(153, 72), (158, 73)], P["hair"], 2)
    a.curve([(160, 100), (165, 102), (169, 100), (173, 96)], P["hair"], 1.7)
    if pose == "meeting":
        a.curve([(157, 150), (173, 183), (201, 175), (226, 164)], shirt, 33)
        a.curve([(223, 164), (242, 153), (244, 134), (260, 135)], skin, 17)
        a.ellipse((252, 125, 269, 148), skin)
        a.curve([(104, 159), (106, 192), (164, 195), (204, 201)], shirt, 32)
        a.stroke([(202, 201), (236, 201)], skin, 17)
        a.ellipse((223, 194, 246, 210), skin)
    else:
        a.curve([(157, 150), (167, 194), (191, 197), (225, 193)], shirt, 34)
        a.stroke([(222, 193), (262, 193)], skin, 16)
        a.ellipse((250, 186, 271, 202), skin)
        a.curve([(111, 151), (110, 180), (130, 217), (169, 216)], shirt, 31)
        a.stroke([(168, 216), (214, 209)], skin, 16)
    a.stroke([(101, 164), (96, 227)], P["clay"] if kind == "alex" else P["sage_dark"], 1.5)
    result = a.finish()
    return ImageOps.mirror(result) if mirror else result


@lru_cache(maxsize=2)
def cafe_art(meeting=False):
    a = Art()
    a.ellipse((26, 651, 883, 693), "#E4DACB")
    a.rect((283, 14, 814, 509), P["wall"], 260)
    a.rect((307, 35, 789, 496), "#DDE3D4", 237, "#B8BDAA", 2)
    a.ellipse((575, 89, 728, 242), "#F3E9CD")
    a.path((309, 351), [((461, 269), (457, 327), (592, 277)), ((685, 239), (744, 309), (787, 277)), (787, 493), (309, 493)], "#CBD3C1")
    a.path((309, 427), [((461, 349), (598, 451), (787, 367)), (787, 493), (309, 493)], "#B7C4AA")
    a.stroke([(547, 36), (547, 491)], P["paper"], 12)
    a.stroke([(310, 304), (785, 304)], P["paper"], 12)
    a.rect((284, 494, 813, 511), P["wood_light"], 6)
    a.stroke([(18, 657), (873, 657)], "#D1C4B2", 2)
    a.stroke([(113, 12), (113, 94)], P["hair"], 2)
    a.ellipse((78, 85, 148, 111), P["wood_light"])
    a.path((80, 91), [((85, 51), (140, 51), (146, 91))], P["sage"])
    a.rect((40, 216, 221, 225), P["wood_light"], 3)
    a.rect((58, 174, 83, 216), P["cream"], 6)
    a.rect((56, 169, 86, 176), P["wood"], 2)
    a.rect((101, 188, 127, 216), P["terracotta"], 4)
    cup(a, 149, 193, 0.64)
    a.rect((146, 279, 232, 379), P["wood_light"], 2)
    a.rect((153, 286, 225, 372), P["white"])
    a.ellipse((168, 296, 207, 335), P["clay"])
    a.path((159, 357), [((178, 330), (203, 340), (217, 315)), (217, 365), (159, 365)], P["sage"])
    a.stroke([(48, 582), (230, 582)], P["wood"], 3)
    a.rect((30, 582, 236, 605), P["wood_light"], 4)
    a.stroke([(50, 604), (50, 655)], P["wood"], 7)
    a.stroke([(218, 604), (218, 655)], P["wood"], 7)
    plant(a, 810, 578, 0.78)
    plant(a, 69, 520, 0.56)
    image = a.finish()
    if meeting:
        put(image, person("alex", "meeting"), 162, 254)
        put(image, person("maya", "meeting", True), 410, 254)
        table = Art()
        table.ellipse((346, 657, 610, 677), "#CFC1AF")
        table.poly([(458, 487), (481, 487), (502, 660), (483, 660)], P["wood"])
        table.poly([(515, 487), (536, 487), (550, 660), (531, 660)], P["wood"])
        table.ellipse((310, 444, 670, 494), P["wood"])
        table.ellipse((307, 436, 672, 485), P["wood_light"])
        cup(table, 392, 419, 0.92)
        cup(table, 554, 420, 0.92)
        table.rect((475, 402, 494, 447), P["cream"], 3)
        table.curve([(485, 408), (482, 390), (501, 391), (498, 376)], P["sage_dark"], 2)
        table.ellipse((489, 370, 508, 386), P["sage"])
        put(image, table.finish(), 0, 0)
    else:
        put(image, person("alex", "working"), 130, 260)
        put(image, person("maya", "working", True), 482, 259)
        table = Art()
        for cx in (381, 651):
            table.stroke([(cx, 492), (cx, 650)], P["wood"], 12)
            table.stroke([(cx, 648), (cx - 59, 663)], P["wood"], 9)
            table.stroke([(cx, 648), (cx + 59, 663)], P["wood"], 9)
            table.ellipse((cx - 108, 466, cx + 108, 501), P["wood"])
            table.ellipse((cx - 110, 460, cx + 110, 491), P["wood_light"])
        table.poly([(325, 397), (423, 397), (443, 466), (345, 466)], "#B9C2B3")
        table.stroke([(326, 397), (422, 397), (442, 466)], P["sage_dark"], 2)
        table.ellipse((371, 422, 387, 438), "#DFE5D9")
        table.rect((337, 467, 460, 474), P["sage_dark"], 3)
        cup(table, 458, 443, 0.77)
        table.poly([(586, 413), (630, 425), (630, 474), (586, 461)], P["white"])
        table.poly([(630, 425), (673, 411), (673, 460), (630, 474)], "#E6D5BC")
        table.stroke([(630, 426), (630, 472)], P["wood"], 2)
        cup(table, 705, 445, 0.73)
        put(image, table.finish(), 0, 0)
    return image


@lru_cache(maxsize=8)
def avatar(name, size):
    a = Art(160, 160)
    a.ellipse((0, 0, 160, 160), P["sage_soft"] if name == "maya" else "#F1DFCD")
    skin = P["skin"] if name == "maya" else P["skin_light"]
    shirt = P["sage"] if name == "maya" else P["terracotta"]
    if name == "maya":
        a.ellipse((43, 30, 118, 118), P["hair"])
    a.path((26, 161), [((26, 101), (126, 102), (135, 161))], shirt)
    a.rect((67, 91, 94, 124), skin, 9)
    a.ellipse((49, 37, 110, 106), skin)
    a.path((47, 73), [((37, 25), (99, 9), (116, 54)), ((94, 68), (79, 55), (66, 51)), ((63, 69), (61, 84), (47, 83))], P["hair"])
    a.ellipse((43, 69, 59, 88), skin)
    a.ellipse((73, 74, 77, 78), P["hair"])
    a.ellipse((96, 74, 100, 78), P["hair"])
    a.curve([(80, 92), (85, 97), (93, 96), (97, 91)], P["hair"], 1.5)
    result = a.finish()
    mask = Image.new("L", (160, 160))
    ImageDraw.Draw(mask).ellipse((0, 0, 159, 159), fill=255)
    result.putalpha(mask)
    return result.resize((size, size), Image.Resampling.LANCZOS)


@lru_cache(maxsize=1)
def background():
    yy, xx = np.mgrid[0:H, 0:W]
    glow = np.exp(-((xx - 1470) ** 2 / 920**2 + (yy - 340) ** 2 / 700**2))
    noise = np.random.default_rng(41).normal(0, 0.32, (H, W))
    base = np.array(rgb(P["paper"]), dtype=float)
    pixels = np.empty((H, W, 3), dtype=np.uint8)
    for c in range(3):
        pixels[:, :, c] = np.clip(base[c] + glow * (2 if c < 2 else 0.5) + noise, 0, 255)
    return Image.fromarray(pixels)


class Film:
    starts = [0, 8, 15, 25, 38, 48, 54.3]
    sections = ["THE EVERYDAY", "THE QUESTION", "THE POSSIBILITY", "THE CONTEXT", "THE CHOICE", "THE CONNECTION", "THIRD PLACE"]

    def __init__(self, config):
        self.config = config
        self.title = config["title"]
        self.captions = []
        for segment in config["narration"]:
            captions = segment["captions"]
            weights = [max(1, len(c.split())) for c in captions]
            t = segment["start"]
            for caption, weight in zip(captions, weights):
                end = t + (segment["end"] - segment["start"]) * weight / sum(weights)
                self.captions.append((t, end, caption.format(title=self.title)))
                t = end
        self.cafe = cafe_art(False)
        self.meeting = cafe_art(True)

    def frame(self, t):
        section = max(i for i, start in enumerate(self.starts) if t >= start)
        current = self.scene(section, t - self.starts[section], t)
        transition = 0.48 if section != 6 else 0.8
        if section and t - self.starts[section] < transition:
            previous = self.scene(section - 1, self.starts[section] - self.starts[section - 1], t)
            current = Image.blend(previous, current, ease((t - self.starts[section]) / transition))
        self.furniture(current, t, section)
        return current

    def furniture(self, canvas, t, section):
        if section != 6:
            logo(canvas, 111, 52, 0.6)
            text(canvas, 166, 66, self.title.upper(), 22, "medium", P["ink"], tracking=3.2)
            section_label = self.sections[section]
            text(canvas, 1805 - measure(section_label, 17, "medium", 3), 70, section_label, 17, "medium", P["muted"], tracking=3)
        line(canvas, [(114, 981), (1806, 981)], P["line"], 1)
        line(canvas, [(114, 981), (114 + 1692 * min(t / self.config["duration"], 1), 981)], P["sage"], 3)
        circle(canvas, 120, 1020, 4, P["sage_dark"])
        text(canvas, 138, 1006, self.config["disclaimer"], 23, "sans", P["muted"])
        right = "ORIGINAL CONCEPT FILM"
        text(canvas, 1805 - measure(right, 18, "medium", 2), 1010, right, 18, "medium", P["muted"], tracking=2)
        if t < 54.3:
            for start, end, caption in self.captions:
                if start <= t < end:
                    alpha = min(ease((t - start) / 0.16), ease((end - t) / 0.16))
                    centered(canvas, 927, caption, 27, "sans", P["muted"], alpha)
                    break

    def steam(self, canvas, x, y, t, opacity=0.6):
        layer = Art(130, 100)
        drift = 3 * math.sin(t * 1.6)
        for dx in (0, 13):
            layer.curve([(40 + dx, 88), (21 + dx + drift, 65), (54 + dx - drift, 46), (40 + dx, 20)], "#B8AB99", 1.6)
        put(canvas, layer.finish(), x - 40, y - 88, opacity)

    def scene(self, section, local, absolute):
        canvas = background().copy()
        if section == 0:
            label(canvas, 116, 188, "YOUR NEXT CONNECTION IS ALREADY CLOSE")
            headline(canvas, ["Surrounded", "by people."], local + 0.2, y=254, size=96, leading=114)
            headline(canvas, ["Still hard", "to connect."], local - 0.2, y=510, size=75, leading=94)
            text(canvas, 118, 769, "Same café. Different worlds.", 29, "sans", P["muted"], ease((local - 1.1) / 0.8))
            art = self.cafe
            scale = 1 + 0.012 * ease(local / 8)
            art = art.resize((round(900 * scale), round(720 * scale)), Image.Resampling.BICUBIC)
            put(canvas, art, 907 - (art.width - 900) / 2, 145 - (art.height - 720) / 2, 0.75 + 0.25 * ease(local))
            self.steam(canvas, 1370, 588, absolute)
            self.steam(canvas, 1622, 590, absolute + 0.8)
        elif section == 1:
            label(canvas, 116, 192, "START WITH A SIMPLE QUESTION")
            headline(canvas, ["What if your", "personal assistant", "could help?"], local, y=276, size=73, leading=101)
            text(canvas, 118, 659, "Start where you already talk.", 31, "sans", P["muted"], ease((local - 0.7) / 0.7))
            self.assistant(canvas, local)
        elif section == 2:
            label(canvas, 116, 188, "INTENT BECOMES POSSIBILITY")
            headline(canvas, ["One request.", "Shared interests.", "Real-world", "possibilities."], local, y=263, size=75, leading=97)
            pill(canvas, 117, 725, "ASSISTANT-AGNOSTIC API", 18, P["sage_soft"], height=43)
            self.capability(canvas, local)
        elif section == 3:
            label(canvas, 116, 190, "CONTEXT BEFORE CONTACT")
            headline(canvas, ["A shared interest.", "A natural hello."], local, y=290, size=76, leading=109)
            paragraph(canvas, 119, 574, "A conversation starter,\nnot a cold approach.", 715, 33, color=P["muted"], leading=48, alpha=ease((local - 0.7) / 0.7))
            self.match(canvas, local)
        elif section == 4:
            label(canvas, 116, 187, "TWO PEOPLE. TWO CHOICES.")
            headline(canvas, ["Real connections.", "Always by", "consent."], local, y=265, size=80, leading=108)
            paragraph(canvas, 118, 670, "An introduction is a choice.\nFor both people.", 760, 32, color=P["muted"], leading=48, alpha=ease((local - 0.7) / 0.7))
            self.consent(canvas, local)
        elif section == 5:
            label(canvas, 116, 188, "NOT ANOTHER SOCIAL NETWORK")
            headline(canvas, ["The assistant", "is the interface."], local, y=269, size=77, leading=104)
            paragraph(canvas, 118, 561, f"{self.title} is the\nconnection infrastructure.", 820, 44, "serif", leading=61, alpha=ease((local - 0.35) / 0.7))
            text(canvas, 120, 755, "More life, beyond the screen.", 29, color=P["muted"], alpha=ease((local - 0.8) / 0.7))
            put(canvas, self.meeting, 910, 146, 0.7 + 0.3 * ease(local / 0.7))
            self.steam(canvas, 1310, 565, absolute)
            self.steam(canvas, 1470, 564, absolute + 0.6)
        else:
            alpha = ease((local + 0.1) / 0.7)
            centered(canvas, 176, "NOT ANOTHER SOCIAL NETWORK", 19, "medium", P["sage_dark"], alpha, 3.6)
            logo(canvas, 904, 269, 1.55, alpha)
            title_size = 104
            while measure(self.title.upper(), title_size, "serif", 9) > 1660:
                title_size -= 2
            centered(canvas, 424, self.title.upper(), title_size, "serif", P["ink"], alpha, 9)
            centered(canvas, 587, self.config["tagline"], 42, "sans", P["ink"], alpha)
            centered(canvas, 685, "Making everyday spaces more human.", 29, "sans", P["muted"], alpha)
            line(canvas, [(705, 768), (1215, 768)], P["line"], 1)
            centered(canvas, 805, "ASSISTANT-AGNOSTIC CONNECTION INFRASTRUCTURE", 18, "medium", P["sage_dark"], alpha, 2.4)
        return canvas

    def assistant(self, canvas, local):
        y = 151 + round(16 * (1 - ease(local / 0.8)))
        panel(canvas, 1041, y, 746, 711, radius=26)
        chat_icon(canvas, 1102, y + 66)
        text(canvas, 1146, y + 36, "Your assistant", 35, "medium")
        text(canvas, 1147, y + 85, "An everyday conversation", 22, color=P["muted"])
        line(canvas, [(1074, y + 126), (1754, y + 126)], P["line"], 1)
        question = self.config["question"]
        visible = round(len(question) * ease((local - 0.85) / 3.4))
        lines = wrap(question, 570, 36)
        panel(canvas, 1139, y + 164, 606, 181, P["sage_soft"], 19, False, border=P["sage_soft"])
        remaining = visible
        for i, full_line in enumerate(lines):
            partial = full_line[: max(0, remaining)]
            text(canvas, 1167, y + 192 + i * 53, partial, 36, alpha=ease(local / 0.5))
            remaining -= len(full_line) + 1
        if 0.85 < local < 4.35:
            consumed = 0
            for i, full_line in enumerate(lines):
                if visible <= consumed + len(full_line):
                    tx = 1167 + measure(full_line[: max(0, visible - consumed)], 36)
                    line(canvas, [(tx + 3, y + 192 + i * 53), (tx + 3, y + 229 + i * 53)], P["sage_dark"], 2)
                    break
                consumed += len(full_line) + 1
        reveal = ease((local - 4.4) / 0.6)
        if reveal:
            reply = Image.new("RGBA", (670, 175))
            panel(reply, 0, 0, 605, 147, P["paper"], 18, False, border=P["paper"])
            paragraph(reply, 26, 24, "Let me look for people\nwho've opted in nearby.", 566, 32, leading=47)
            put(canvas, reply, 1080, y + 387 + 8 * (1 - reveal), reveal)
        elif local > 3.2:
            for i in range(3):
                circle(canvas, 1100 + i * 17, y + 421, 4, P["sage"] if math.sin(local * 4 - i) > 0 else P["line"])
        panel(canvas, 1078, y + 584, 667, 61, P["white"], 19, False)
        text(canvas, 1104, y + 601, "Ask a question…", 25, color=P["muted"])
        circle(canvas, 1713, y + 615, 18, P["sage_soft"])
        arrow(canvas, 1713, y + 615, scale=0.8)
        text(canvas, 1101, y + 668, "Generic assistant · conceptual UI", 20, color=P["muted"])

    def capability(self, canvas, local):
        panel(canvas, 1020, 151, 766, 112, radius=21)
        chat_icon(canvas, 1076, 207, 27)
        text(canvas, 1121, 174, "Your assistant", 31, "medium")
        text(canvas, 1122, 218, "Understands your intent.", 23, color=P["muted"])
        line(canvas, [(1403, 263), (1403, 302)], P["sage"], 2)
        circle(canvas, 1403, 268 + 28 * ((local * 0.55) % 1), 4, P["sage_dark"])
        panel(canvas, 1020, 303, 766, 379, radius=24)
        logo(canvas, 1050, 323, 0.75)
        text(canvas, 1121, 329, self.title, 37, "medium")
        text(canvas, 1123, 382, "CONNECTION CAPABILITY · CONCEPT", 16, "medium", P["muted"], tracking=1.8)
        line(canvas, [(1059, 423), (1744, 423)], P["line"], 1)
        rows = [
            (455, "INTERESTS", "AI + startups", 0.65),
            (532, "PLACE", "Same participating café", 1.8),
            (609, "VISIBILITY", "Explicitly opted in", 3.0),
        ]
        for y, key, value, delay in rows:
            alpha = ease((local - delay) / 0.7)
            text(canvas, 1062, y + 5, key, 17, "medium", P["muted"], alpha, 1.5)
            text(canvas, 1238, y - 1, value, 29, "medium", P["ink"], alpha)
            if y != 609:
                line(canvas, [(1060, y + 53), (1743, y + 53)], "#EAE4DA", 1)
        reveal = ease((local - 5.3) / 0.7)
        if reveal:
            panel(canvas, 1020, 721, 766, 125, P["sage_soft"], 21, False, reveal, border=P["sage_soft"])
            circle(canvas, 1072, 782, 21, P["sage_dark"])
            check(canvas, 1072, 782, 0.8, P["white"])
            text(canvas, 1114, 746, "A possible introduction", 30, "medium", alpha=reveal)
            text(canvas, 1116, 795, "No precise location. No automatic contact.", 22, color=P["muted"], alpha=reveal)

    def match(self, canvas, local):
        offset = round(14 * (1 - ease(local / 0.8)))
        card = Image.new("RGBA", (860, 830))
        panel(card, 40, 36, 770, 720)
        pill(card, 79, 73, "Potential connection", 23, height=42)
        put(card, avatar("maya", 123), 83, 153)
        text(card, 240, 157, "Maya", 55, "serif")
        paragraph(card, 242, 232, "Product builder & AI enthusiast", 492, 27, color=P["muted"])
        text(card, 87, 315, "Same participating café · opted in", 24, color=P["muted"])
        line(card, [(85, 364), (762, 364)], P["line"], 1)
        interests = Image.new("RGBA", card.size)
        x = 87
        for i, interest in enumerate(("AI", "Startups", "Good coffee")):
            chip = Image.new("RGBA", (235, 60))
            width = pill(chip, 0, 0, interest, 24, height=46)
            reveal = ease((local - 1.2 - i * 0.24) / 0.5)
            put(interests, chip, x, 389 + 6 * (1 - reveal), reveal)
            x += width + 12
        put(card, interests, 0, 0)
        opener = Image.new("RGBA", card.size)
        panel(opener, 78, 465, 694, 181, P["paper"], 18, False, border=P["paper"])
        text(opener, 103, 485, "A LITTLE HELP SAYING HELLO", 16, "medium", P["muted"], tracking=1.9)
        paragraph(opener, 103, 526, self.config.get("opener_display", self.config["opener"]), 641, 38, "serif", leading=49)
        reveal = ease((local - 3.4) / 0.75)
        put(card, opener, 0, 8 * (1 - reveal), reveal)
        action = Image.new("RGBA", card.size)
        panel(action, 80, 669, 690, 59, P["sage_dark"], 15, False, border=P["sage_dark"])
        text(action, 204, 685, "Request an introduction", 27, "medium", P["white"])
        arrow(action, 722, 699, P["white"])
        put(card, action, 0, 0, ease((local - 7.5) / 0.7))
        put(canvas, card, 958, 111 + offset, ease((local + 0.05) / 0.5))

    def consent(self, canvas, local):
        requested = local >= 1.6
        accepted = local >= 5.05
        for y, name, who, description in [
            (167, "alex", "YOU · ALEX", "Ready for a coffee conversation."),
            (484, "maya", "MAYA", "Your invitation. Their decision."),
        ]:
            panel(canvas, 1032, y, 748, 254, radius=24)
            put(canvas, avatar(name, 79), 1072, y + 30)
            text(canvas, 1174, y + 34, who, 22, "medium", P["muted"], tracking=1.8)
            text(canvas, 1174, y + 76, description, 25)
            is_done = requested if name == "alex" else accepted
            if name == "alex":
                action = "Introduction requested" if is_done else "Request introduction"
            else:
                action = "Introduction accepted" if is_done else "Accept introduction"
            color = P["sage_soft"] if is_done else P["sage_dark"]
            foreground = P["sage_dark"] if is_done else P["white"]
            panel(canvas, 1072, y + 151, 668, 63, color, 16, False, border=color)
            if is_done:
                check(canvas, 1111, y + 182, 0.9, foreground)
                text(canvas, 1148, y + 168, action, 29, "medium", foreground)
            else:
                text(canvas, 1110, y + 168, action, 29, "medium", foreground)
                arrow(canvas, 1702, y + 182, foreground)
        line(canvas, [(1406, 422), (1406, 482)], P["sage"] if requested else P["line"], 2)
        circle(canvas, 1406, 452, 11, P["sage_soft"] if accepted else P["paper"], P["sage"])
        if accepted:
            check(canvas, 1406, 452, 0.58)
        status = "Both said yes. Now you can meet." if accepted else "No connection until both agree."
        fill = P["sage_soft"] if accepted else P["paper"]
        panel(canvas, 1056, 780, 700, 74, fill, 18, False, border=fill)
        text(canvas, 1100, 804, status, 27, "medium", P["sage_dark"] if accepted else P["muted"])


def wav_read(path):
    with wave.open(str(path), "rb") as f:
        channels, width, rate, frames = f.getnchannels(), f.getsampwidth(), f.getframerate(), f.getnframes()
        if width != 2:
            raise ValueError(f"Expected 16-bit local speech audio, got {width * 8}")
        signal = np.frombuffer(f.readframes(frames), dtype="<i2").astype(np.float32) / 32768
    if channels > 1:
        signal = signal.reshape(-1, channels).mean(axis=1)
    if rate != SR:
        signal = np.interp(np.arange(round(len(signal) * SR / rate)) * rate / SR, np.arange(len(signal)), signal).astype(np.float32)
    return signal


def wav_write(path, samples):
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as f:
        f.setnchannels(samples.shape[1] if samples.ndim == 2 else 1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())


def add_audio(target, signal, start, gain=1, pan=0):
    first = round(start * SR)
    if first >= len(target):
        return
    signal = signal[: len(target) - first] * gain
    if signal.ndim == 1:
        signal = np.column_stack((signal * math.sqrt((1 - pan) / 2), signal * math.sqrt((1 + pan) / 2)))
    target[first : first + len(signal)] += signal


def tone(midi, duration, pad=False):
    t = np.arange(round(duration * SR), dtype=np.float32) / SR
    hz = 440 * 2 ** ((midi - 69) / 12)
    if pad:
        env = np.minimum(t / 1.9, 1) * np.minimum((duration - t) / 3.3, 1)
        wave_data = 0.72 * np.sin(2 * np.pi * hz * t) + 0.2 * np.sin(2 * np.pi * hz * 1.002 * t) + 0.08 * np.sin(2 * np.pi * hz * 2 * t)
        return wave_data * env
    env = (1 - np.exp(-t / 0.009)) * np.exp(-t / 0.94) * np.minimum((duration - t) / 0.2, 1)
    wave_data = (
        np.sin(2 * np.pi * hz * t)
        + 0.24 * np.sin(2 * np.pi * hz * 2.002 * t) * np.exp(-t * 2)
        + 0.085 * np.sin(2 * np.pi * hz * 3.005 * t) * np.exp(-t * 4)
    )
    return wave_data * env


def make_audio(config, ffmpeg, skip_speech=False):
    audio_dir = SCRATCH / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    segments = [{**s, "text": s["text"].format(title=config["title"])} for s in config["narration"]]
    script_path = audio_dir / "narration.json"
    script_path.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")
    key = hashlib.sha256((json.dumps(segments) + config["voice"] + str(config["voice_rate"])).encode()).hexdigest()
    cache_path = audio_dir / "speech-cache.json"
    cached = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    if not skip_speech and (cached.get("key") != key or not all((audio_dir / f"voice-{i:02d}.wav").exists() for i in range(len(segments)))):
        shell = shutil.which("powershell.exe") or shutil.which("pwsh")
        if not shell:
            raise RuntimeError("Windows PowerShell is needed for local SAPI narration. Use --skip-speech for the instrumental version.")
        subprocess.run(
            [
                shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "src" / "synthesize.ps1"),
                "-ScriptPath", str(script_path), "-OutputDirectory", str(audio_dir),
                "-Voice", config["voice"], "-Rate", str(config["voice_rate"]),
            ],
            check=True,
        )
        cache_path.write_text(json.dumps({"key": key, "voice": config["voice"]}), encoding="utf-8")
    count = round(config["duration"] * SR)
    music = np.zeros((count, 2), np.float32)
    voice = np.zeros_like(music)
    duck = np.ones(count, np.float32)
    chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 60]]
    for bar in range(8):
        start = bar * 7.5
        chord = chords[bar % len(chords)]
        for j, midi in enumerate(chord):
            add_audio(music, tone(midi, 10.5, True), start + j * 0.035, 0.024, (j - 1.5) / 5)
        melody = [chord[2] + 12, chord[1] + 12, chord[3] + 12, chord[2] + 12]
        for j, midi in enumerate(melody):
            add_audio(music, tone(midi, 3.4), start + 0.8 + j * 1.67, 0.071 if j == 0 else 0.053, (-0.22, 0.18, -0.1, 0.24)[j])
    for start, pitches in [(15.4, [76]), (30.0, [72]), (43.25, [72, 79]), (54.6, [64, 71, 76])]:
        for i, midi in enumerate(pitches):
            add_audio(music, tone(midi, 2.6), start + i * 0.17, 0.042, (i - 1) * 0.15)
    timings = []
    if not skip_speech:
        for i, segment in enumerate(segments):
            source = audio_dir / f"voice-{i:02d}.wav"
            speech = wav_read(source)
            available = segment["end"] - segment["start"] - 0.13
            original_seconds = len(speech) / SR
            speed = max(1, original_seconds / available)
            if speed > 1.34:
                raise RuntimeError(f"Narration {i} needs excessive compression ({speed:.2f}×); shorten its script or raise voice_rate.")
            if speed > 1.01:
                fitted = audio_dir / f"voice-{i:02d}-fitted.wav"
                subprocess.run(
                    [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-af", f"atempo={speed:.6f}", "-ar", str(SR), str(fitted)],
                    check=True,
                )
                speech = wav_read(fitted)
            peak = max(0.01, float(np.max(np.abs(speech))))
            speech *= 0.76 / peak
            speech[: min(480, len(speech))] *= np.linspace(0, 1, min(480, len(speech)))
            speech[-min(960, len(speech)) :] *= np.linspace(1, 0, min(960, len(speech)))
            add_audio(voice, speech, segment["start"], 1)
            first = max(0, round((segment["start"] - 0.2) * SR))
            end = min(count, round((segment["start"] + len(speech) / SR + 0.35) * SR))
            duck[first:end] = 0.47
            fade = min(round(0.18 * SR), end - first)
            duck[first : first + fade] = np.linspace(1, 0.47, fade)
            duck[end - fade : end] = np.linspace(0.47, 1, fade)
            timings.append({"segment": i, "start": segment["start"], "original_seconds": round(original_seconds, 3), "rendered_seconds": round(len(speech) / SR, 3), "tempo": round(speed, 4)})
    fade_in = round(SR * 1.5)
    fade_out = round(SR * 2.1)
    music[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    music[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    soundtrack = music * duck[:, None] + voice
    soundtrack = np.tanh(soundtrack * 1.06) / 1.06
    path = audio_dir / "soundtrack.wav"
    wav_write(path, soundtrack)
    (audio_dir / "timings.json").write_text(json.dumps(timings, indent=2), encoding="utf-8")
    return path, timings


def timestamp(seconds):
    ms = round(seconds * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def write_captions(film):
    lines = []
    for i, (start, end, caption) in enumerate(film.captions, 1):
        lines.extend([str(i), f"{timestamp(start)} --> {timestamp(end)}", caption, ""])
    (OUT / "third-place-teaser.srt").write_text("\n".join(lines), encoding="utf-8")


def save_review_frames(frames, times, target=OUT):
    destination = target / "stills"
    destination.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (1920, 1206), rgb(P["paper"]))
    for i, (t, frame) in enumerate(zip(times, frames)):
        frame.save(destination / f"{i + 1:02d}-{t:04.1f}s.png", optimize=True)
        thumb = frame.resize((640, 360), Image.Resampling.LANCZOS)
        x, y = (i % 3) * 640, (i // 3) * 402
        contact.paste(thumb, (x, y))
        text(contact, x + 23, y + 369, f"{t:04.1f}s  /  {Film.sections[max(j for j, s in enumerate(Film.starts) if t >= s)]}", 20, "medium", P["muted"])
    contact.save(target / "contact-sheet.jpg", quality=94)
    frames[-1].save(target / "third-place-poster.png", optimize=True)


def stills(film, target=OUT):
    times = REVIEW_TIMES
    save_review_frames([film.frame(t) for t in times], times, target)
    return times


def validate_layout(config):
    checks = [
        ("scene 2 headline", "personal assistant", 73, "serif", 855),
        ("scene 4 headline", "A shared interest.", 76, "serif", 845),
        ("scene 5 headline", "Real connections.", 80, "serif", 865),
        ("café location", "Same participating café", 29, "medium", 518),
        ("mutual consent status", "Both said yes. Now you can meet.", 27, "medium", 650),
        ("tagline", config["tagline"], 42, "sans", 1640),
    ]
    results = []
    for name, value, size, face, maximum in checks:
        actual = measure(value, size, face)
        if actual > maximum:
            raise ValueError(f"Text overflow in {name}: {actual:.1f}px > {maximum}px")
        results.append({"element": name, "width_px": round(actual, 1), "limit_px": maximum})
    return results


def render_video(film, config, ffmpeg):
    silent = SCRATCH / "silent-render.mp4"
    log = SCRATCH / "ffmpeg-render.log"
    total = round(config["duration"] * config["fps"])
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "warning", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-video_size", f"{W}x{H}", "-framerate", str(config["fps"]), "-i", "pipe:0",
        "-an", "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-profile:v", "high", "-level", "4.1", "-threads", "4",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", str(silent),
    ]
    started = time.monotonic()
    with log.open("w", encoding="utf-8") as errors:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=errors)
        try:
            for index in range(total):
                frame = film.frame(index / config["fps"])
                process.stdin.write(frame.tobytes())
                if index % 150 == 0:
                    print(f"Rendering {index}/{total} frames ({index / config['fps']:.1f}s), elapsed {time.monotonic() - started:.1f}s", flush=True)
            process.stdin.close()
            code = process.wait()
        except BaseException:
            process.stdin.close()
            process.terminate()
            process.wait()
            raise
    if code:
        raise RuntimeError(log.read_text(encoding="utf-8"))
    print(f"Picture render complete in {time.monotonic() - started:.1f}s", flush=True)
    return silent


def verify(path, ffprobe, ffmpeg, config, timings, layout):
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        check=True, text=True, capture_output=True,
    )
    probe = json.loads(result.stdout)
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    audio = next(s for s in probe["streams"] if s["codec_type"] == "audio")
    duration = float(probe["format"]["duration"])
    assert 45 <= duration <= 60, duration
    assert (video["width"], video["height"]) == (W, H)
    assert video["codec_name"] == "h264" and video["pix_fmt"] == "yuv420p"
    assert audio["codec_name"] == "aac" and audio["channels"] == 2
    decoded = subprocess.run([ffmpeg, "-hide_banner", "-v", "error", "-i", str(path), "-f", "null", "-"], text=True, capture_output=True)
    if decoded.returncode or decoded.stderr.strip():
        raise RuntimeError(f"Decode validation failed: {decoded.stderr}")
    signal_check = subprocess.run(
        [
            ffmpeg, "-hide_banner", "-nostats", "-i", str(path),
            "-vf", "blackdetect=d=0.2:pix_th=0.02:pic_th=0.98",
            "-af", "silencedetect=n=-48dB:d=2,volumedetect", "-f", "null", "-",
        ],
        check=True, text=True, capture_output=True,
    )
    signal_log = signal_check.stderr
    (SCRATCH / "signal-check.log").write_text(signal_log, encoding="utf-8")
    black_intervals = signal_log.count("black_start:")
    extended_silences = signal_log.count("silence_start:")
    mean_volume = float(re.search(r"mean_volume: ([\-\d.]+) dB", signal_log).group(1))
    peak_volume = float(re.search(r"max_volume: ([\-\d.]+) dB", signal_log).group(1))
    assert black_intervals == 0, "Unexpected black interval in encoded film"
    assert extended_silences == 0, "Unexpected extended gap in the soundtrack"
    assert peak_volume < -1.0, "Insufficient audio headroom"
    selections = "+".join(f"eq(n,{round(t * config['fps'])})" for t in REVIEW_TIMES)
    sample_pattern = SCRATCH / "frames" / "decoded-%02d.png"
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
            "-vf", f"select='{selections}'", "-fps_mode", "vfr", "-frames:v", str(len(REVIEW_TIMES)), str(sample_pattern),
        ],
        check=True,
    )
    reference = Film(config)
    frames, frame_checks = [], []
    for i, seconds in enumerate(REVIEW_TIMES, 1):
        sample_path = SCRATCH / "frames" / f"decoded-{i:02d}.png"
        with Image.open(sample_path) as encoded:
            frame = encoded.convert("RGB")
        actual = np.asarray(frame, dtype=np.float32)
        expected = np.asarray(reference.frame(seconds), dtype=np.float32)
        mae = float(np.abs(actual - expected).mean())
        contrast = float(actual[140:880, 114:1806].mean(axis=2).std())
        assert mae < 3.0, f"Encoded frame at {seconds}s diverges from source: {mae}"
        assert contrast > 10.0, f"Possible blank scene at {seconds}s"
        frames.append(frame)
        frame_checks.append({"time_seconds": seconds, "mean_absolute_pixel_error": round(mae, 4), "scene_contrast": round(contrast, 3)})
        sample_path.unlink()
    save_review_frames(frames, REVIEW_TIMES)
    report = {
        "path": str(path.resolve()),
        "duration_seconds": duration,
        "resolution": [video["width"], video["height"]],
        "frame_rate": video["avg_frame_rate"],
        "video_codec": video["codec_name"],
        "pixel_format": video["pix_fmt"],
        "audio_codec": audio["codec_name"],
        "audio_channels": audio["channels"],
        "audio_sample_rate": audio["sample_rate"],
        "bytes": path.stat().st_size,
        "full_decode": "passed",
        "black_intervals": black_intervals,
        "extended_audio_silences": extended_silences,
        "audio_mean_dbfs": mean_volume,
        "audio_peak_dbfs": peak_volume,
        "encoded_frame_checks": frame_checks,
        "disclosure": config["disclaimer"],
        "visuals": "Original programmatically drawn editorial café illustrations and scripted UI. No real app footage, real profiles, or official provider integration.",
        "speech": {"type": "Local Windows SAPI synthesis" if timings else "None", "voice": config["voice"] if timings else None, "timings": timings},
        "music": "Original locally synthesized felt-keyboard and ambient chord composition; no samples or licensed stock media.",
        "layout_checks": layout,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    (OUT / "verification.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["path", "duration_seconds", "resolution", "frame_rate", "video_codec", "audio_codec", "bytes", "full_decode"]}, indent=2), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title", help="Override the product name in graphics and narration.")
    parser.add_argument("--stills-only", action="store_true", help="Render nine review frames and a contact sheet, without audio or MP4.")
    parser.add_argument("--skip-speech", action="store_true", help="Produce the original instrumental mix without SAPI narration.")
    args = parser.parse_args()
    for directory in (OUT, SCRATCH / "tmp", SCRATCH / "cache", SCRATCH / "audio", SCRATCH / "frames"):
        directory.mkdir(parents=True, exist_ok=True)
    os.environ["TEMP"] = os.environ["TMP"] = str(SCRATCH / "tmp")
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    if args.title:
        config["title"] = args.title
    if (config["width"], config["height"]) != (W, H):
        raise ValueError("This editorial composition is authored for 1920 × 1080.")
    layout = validate_layout(config)
    film = Film(config)
    write_captions(film)
    stills(film)
    print(f"Review frames ready: {OUT / 'contact-sheet.jpg'}", flush=True)
    if args.stills_only:
        return
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("Local ffmpeg and ffprobe are required. No software is downloaded automatically.")
    soundtrack, timings = make_audio(config, ffmpeg, args.skip_speech)
    silent = render_video(film, config, ffmpeg)
    final = OUT / "third-place-teaser.mp4"
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "warning", "-y", "-i", str(silent), "-i", str(soundtrack),
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR),
            "-af", "loudnorm=I=-18:TP=-1.5:LRA=8", "-t", str(config["duration"]), "-movflags", "+faststart",
            "-metadata", f"title={config['title']} — A more human everyday",
            "-metadata", "comment=Scripted concept demo. Fictional profiles. Original illustrations and locally synthesized music and narration.",
            str(final),
        ],
        check=True,
    )
    verify(final, ffprobe, ffmpeg, config, timings, layout)
    silent.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
