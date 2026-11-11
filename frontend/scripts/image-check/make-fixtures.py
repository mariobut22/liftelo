#!/usr/bin/env python3
"""Generates the JPEG test fixtures for photos-check.cjs (needs Pillow). Usage: make-fixtures.py <outDir>

Every picture has four coloured corner blocks when DISPLAYED upright: top-left red, top-right green,
bottom-left blue, bottom-right yellow. Files with EXIF orientation 6/8 store the pixels rotated, so a
pipeline that ignores EXIF produces the wrong corners.
"""
import os
import sys

from PIL import Image, ImageDraw

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
RED, GREEN, BLUE, YELLOW = (230, 30, 30), (30, 200, 30), (30, 30, 230), (240, 220, 20)


def displayed(width, height):
    """The picture as it must look to the user."""
    img = Image.new('RGB', (width, height), (200, 200, 200))
    d = ImageDraw.Draw(img)
    for x in range(0, width, 40):  # stripes keep the JPEG from being tiny
        d.line([(x, 0), (width - x, height)], fill=(180, 180, (x * 3) % 255), width=3)
    b = max(20, min(width, height) // 6)
    d.rectangle([0, 0, b, b], fill=RED)
    d.rectangle([width - b, 0, width, b], fill=GREEN)
    d.rectangle([0, height - b, b, height], fill=BLUE)
    d.rectangle([width - b, height - b, width, height], fill=YELLOW)
    return img


def exif_with(orientation, gps=False):
    exif = Image.Exif()
    exif[0x0112] = orientation
    exif[0x010F] = 'TestCamera'
    exif[0x9003] = '2026:11:08 10:00:00'
    if gps:
        gps_ifd = exif.get_ifd(0x8825)
        gps_ifd[1] = 'N'
        gps_ifd[2] = (45.0, 19.0, 30.0)
        gps_ifd[3] = 'E'
        gps_ifd[4] = (14.0, 26.0, 10.0)
    return exif


def save(img, name, orientation=None, gps=False, quality=92):
    kwargs = {'quality': quality}
    if orientation:
        kwargs['exif'] = exif_with(orientation, gps)
    img.save(os.path.join(out, name), 'JPEG', **kwargs)


# upright, small, no EXIF -> kept as is
save(displayed(800, 600), 'small-upright.jpg', quality=60)
# orientation 6: displayed 900x1200 (portrait), stored 1200x900 rotated 90 degrees counter-clockwise
save(displayed(900, 1200).rotate(90, expand=True), 'o6-portrait-1200x900.jpg', orientation=6)
# orientation 8: stored rotated 90 degrees clockwise
save(displayed(900, 1200).rotate(-90, expand=True), 'o8-portrait-1200x900.jpg', orientation=8)
# orientation 3: stored upside down
save(displayed(1000, 700).rotate(180), 'o3-1000x700.jpg', orientation=3)
# large 4000x3000 with GPS, orientation 1
save(displayed(4000, 3000), 'big-4000x3000-gps.jpg', orientation=1, gps=True)
# large portrait phone photo: stored 4000x3000 + orientation 6 -> displayed 3000x4000
save(displayed(3000, 4000).rotate(90, expand=True), 'big-o6-4000x3000.jpg', orientation=6, gps=True)
# not images
open(os.path.join(out, 'fake.jpg'), 'wb').write(b'<html><script>alert(1)</script></html>' * 20)
open(os.path.join(out, 'iphone.heic'), 'wb').write(b'\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic' + bytes(2000))
open(os.path.join(out, 'notes.pdf'), 'wb').write(b'%PDF-1.4\n' + bytes(500))
print('fixtures written to', out)
