#!/usr/bin/env python3
"""Builds the final Liftelo logo SVGs (text converted to outlines) from Inter Bold.
Requires: fonttools, uharfbuzz, and Inter-Bold.otf (SIL OFL). PDFs are made separately with Chromium (see README)."""
import sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
OUT = sys.argv[2] if len(sys.argv) > 2 else "."
DARK = "#18181b"

ICON = '<path d="M14 6h15v38h21v14H14z"/><rect x="36" y="10" width="16" height="20" rx="2.5"/>'

blob = hb.Blob.from_file_path(FONT)
face = hb.Face(blob)
font = hb.Font(face)
upem = face.upem
tt = TTFont(FONT)
gs = tt.getGlyphSet()
order = tt.getGlyphOrder()

SIZE = 38.0          # px in the 64-unit icon box (text/icon ratio as on the website)
TRACK = -0.01 * SIZE # letter-spacing -0.01em
X0, BASE = 68.0, 45.5

buf = hb.Buffer()
buf.add_str("Liftelo")
buf.guess_segment_properties()
hb.shape(font, buf, {"kern": True, "liga": True})
scale = SIZE / upem
x = X0
paths = []
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = order[info.codepoint]
    pen = SVGPathPen(gs, ntos=lambda v: ("%.3f" % v).rstrip("0").rstrip("."))
    tp = TransformPen(pen, (scale, 0, 0, -scale, x + pos.x_offset * scale, BASE - pos.y_offset * scale))
    gs[name].draw(tp)
    d = pen.getCommands()
    if d:
        paths.append(d)
    x += pos.x_advance * scale + TRACK
text_end = x - TRACK
W = round(text_end + 14, 2)  # right margin similar to icon's left margin

def svg(body, w, h, color):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*4:g}" height="{h*4:g}" '
            f'fill="{color}"><title>Liftelo</title>{body}</svg>\n')

wordmark = "".join(f'<path d="{d}"/>' for d in paths)
for tag, color in (("", DARK), ("-white", "#ffffff")):
    open(f"{OUT}/liftelo-icon{tag}.svg", "w").write(svg(ICON, 64, 64, color))
    open(f"{OUT}/liftelo-lockup{tag}.svg", "w").write(svg(ICON + wordmark, W, 64, color))
print("lockup width", W)
