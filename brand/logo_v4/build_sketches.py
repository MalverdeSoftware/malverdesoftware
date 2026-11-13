"""Build MalverdeSoftware logo sketches from the AI-generated reference portrait.
Run: python3 build_sketches.py   Writes svg/*.svg and sheet.svg beside this file."""
import os, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from skimage import measure, morphology
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
REF = ROOT.parent / 'reference' / 'Malverde_ai_generated.png'
INK, GREEN, CREAM = '#14260c', '#3f8f1f', '#f4f3ee'
PAD = 70  # the portrait crops the top of the hair, so the mask extends above it

gray = Image.open(REF).convert('L').filter(ImageFilter.GaussianBlur(5))
w, h = gray.size
canvas = Image.new('L', (w, h + PAD), 255); canvas.paste(gray, (0, PAD))
d = ImageDraw.Draw(canvas)
d.polygon([(x, y + PAD) for x, y in [(205,110),(300,25),(400,-14),(630,-14),(730,25),(830,110),(830,200),(205,200)]], fill=0)  # complete the flat-top
a = np.array(canvas) < 50
# Remove the studio shadow, the jaw shadow and everything the drawn knot replaces.
m = Image.new('1', canvas.size, 1); d = ImageDraw.Draw(m)
off = lambda pts: [(x, y + PAD) for x, y in pts]
d.polygon(off([(0,-70),(150,-70),(150,250),(262,490),(250,620),(300,900),(420,1000),(1024,1000),(1024,1536),(0,1536)]), fill=0)
d.polygon(off([(690,720),(1024,720),(1024,1000),(600,1000)]), fill=0)
d.polygon(off([(250,620),(345,620),(370,700),(420,1000),(250,1000)]), fill=0)
d.rectangle((150, 490 + PAD, 300, 506 + PAD), fill=0)
a &= np.array(m)
a[PAD + 690:PAD + 1000, :] = False  # nose shadow, mustache and chin are redrawn
a[PAD + 490:, :506] = False  # the left eye is mirrored from the right
a[PAD + 465:PAD + 490, 266:506] = False  # stray edge of the old left brow
a = morphology.remove_small_objects(a, max_size=250)
a = morphology.remove_small_holes(a, max_size=600)
labels = measure.label(a)
props = sorted(measure.regionprops(labels), key=lambda r: -r.area)
print('components', [(int(r.area), int(r.centroid[0]) - PAD, int(r.centroid[1])) for r in props[:8]])

def smooth(p):
    n = len(p); out = f'M{p[0][0]:.0f} {p[0][1]:.0f}'
    for i in range(n):
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % n], p[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        out += f'C{c1[0]:.0f} {c1[1]:.0f} {c2[0]:.0f} {c2[1]:.0f} {p2[0]:.0f} {p2[1]:.0f}'
    return out + 'Z'

def path(mask, sigma=3.5, tol=2.2):
    s = gaussian_filter(np.pad(mask, 4).astype(float), sigma)
    out = []
    for c in measure.find_contours(s, .5):
        p = measure.approximate_polygon(c, tol)[:-1] - 4
        if len(p) > 3:
            out.append(smooth([(x, y - PAD) for y, x in p]))
    return ''.join(out)

# The portrait lights one eye more clearly, so mirror it for a symmetric face.
AXIS = 506
hair = labels == props[0].label
right = np.isin(labels, [r.label for r in props[1:] if r.centroid[1] > AXIS])
right[:, 716:] = False  # keep the brow clear of the sideburn once mirrored
ys, xs = np.nonzero(right)
mirror = np.zeros_like(right); keep = (2 * AXIS - xs >= 0) & (2 * AXIS - xs < w)
mirror[ys[keep], 2 * AXIS - xs[keep]] = True
FEATURES = path(hair | right | mirror)
HAIR = path(hair)
MUST = 'M505 812C470 785 425 795 400 815C385 830 372 845 362 858C420 866 470 860 505 840C540 860 595 866 650 860C632 838 600 805 570 795C545 790 520 800 505 812Z'

BAND = ('<path d="M232 905C262 1040 340 1130 450 1165L462 1095C380 1060 320 985 292 860Z"/>'
        '<path d="M790 905C760 1040 680 1130 545 1165L535 1095C620 1060 690 985 735 860Z"/>')
KNOT_ONLY = ('<path fill-rule="evenodd" d="M448 1110C480 1095 515 1095 548 1110C565 1150 558 1205 535 1235C510 1245 485 1245 460 1235C438 1205 432 1150 448 1110ZM470 1130C495 1160 505 1190 500 1225L490 1225C494 1192 485 1162 462 1136Z"/>'
             '<path d="M458 1250L372 1400C385 1445 400 1490 425 1512C455 1460 490 1370 490 1258Z"/>'
             '<path d="M532 1250L640 1385C640 1430 630 1480 612 1512C565 1470 505 1375 502 1258Z"/>')
KNOT = BAND + KNOT_ONLY

M_HAIR = 'M50 72C45 56 44 42 50 31C56 19 72 14 100 14C128 14 144 19 150 31C156 42 155 56 150 72C145 65 141 56 140 45C127 42 112 45 100 61C88 45 73 42 60 45C59 56 55 65 50 72Z'
M_MUST = 'M100 88C94 82 84 82 76 89C72 93 68 97 64 101C75 102 90 101 100 95C110 101 125 102 136 101C132 97 128 93 124 89C116 82 106 82 100 88Z'

def rays(cx=512, cy=440, n=31, r0=590, r1=760):
    out = []
    for i in range(n):
        t = math.radians(200 + 140 * i / (n - 1))
        long = r1 if i % 2 == 0 else r0 + (r1 - r0) * .55
        e = math.radians(1.7)
        pts = [(cx + r0 * math.cos(t - e), cy + r0 * math.sin(t - e)), (cx + long * math.cos(t), cy + long * math.sin(t)), (cx + r0 * math.cos(t + e), cy + r0 * math.sin(t + e))]
        out.append('M' + 'L'.join(f'{x:.0f} {y:.0f}' for x, y in pts) + 'Z')
    return ''.join(out)

PX = ["........................", ".....##############.....", "....################....", "...##################...", "...##################...", "...####..######..####...", "...###....####....###...", "...###............###...", "...##.###......###.##...", "...##..............##...", "...#................#...", "........................", "......####....####......", ".....##############.....", "....#####......#####....", "........................", "....GGG..........GGG....", ".....GGGG......GGGG.....", "........GGGGGGGG........", ".........GGGGGG.........", "..........GGGG..........", ".........GGGGGG.........", "........GGG..GGG........", "........GG....GG........"]
assert all(len(r) == 24 for r in PX)
PIX = ''.join(f'<rect x="{x}" y="{y}" width="1.02" height="1.02" shape-rendering="crispEdges" fill="{INK if c == "#" else GREEN}"/>' for y, r in enumerate(PX) for x, c in enumerate(r) if c != '.')

MX, MY, MI, MO = 510, 700, 775, 850  # medal centre, inner and outer radius
face = f'<path fill="{INK}" fill-rule="evenodd" d="{FEATURES}"/><path fill="{INK}" d="{MUST}"/>'
knot = f'<g fill="{GREEN}">{KNOT}</g>'
R = {
 'a_portrait_knot': ('130 -60 770 1600', face + knot),
 'b_medal': (f'{MX-MO} {MY-MO} {2*MO} {2*MO}', f'<defs><clipPath id="c"><circle cx="{MX}" cy="{MY}" r="{MI}"/></clipPath></defs><circle cx="{MX}" cy="{MY}" r="{MO}" fill="{GREEN}"/><circle cx="{MX}" cy="{MY}" r="{MI}" fill="{CREAM}"/><g clip-path="url(#c)">{face}{knot}</g>'),
 'c_rays': ('-280 -360 1600 1900', f'<path fill="{GREEN}" d="{rays()}"/>' + face + knot),
 'd_hair_mustache_knot': ('130 -60 770 1600', f'<path fill="{INK}" fill-rule="evenodd" d="{HAIR}"/><path fill="{INK}" d="{MUST}"/>' + knot),
 'e_mustache_knot': ('220 770 590 770', f'<path fill="{INK}" d="{MUST}"/>' + knot),
 'f_knot_alone': ('340 1070 340 460', f'<g fill="{GREEN}">{KNOT_ONLY}</g>'),
 'g_tile': ('-170 -150 1370 1760', f'<rect x="-170" y="-150" width="1370" height="1760" rx="220" fill="{GREEN}"/><path fill="{CREAM}" fill-rule="evenodd" d="{HAIR}"/><path fill="{CREAM}" d="{MUST}"/><g fill="{CREAM}">{KNOT}</g>'),
 'h_m_knot': ('35 5 130 200', f'<path fill="{INK}" d="{M_HAIR}"/><path fill="{INK}" d="{M_MUST}"/><g fill="{GREEN}" transform="translate(30.7,-12) scale(.14)">{KNOT}</g>'),
 'i_pixel': ('0 0 24 24', PIX),
}
for name, (vb, body) in R.items():
    (ROOT / 'svg' / f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{body}</svg>')

import json, re
pieces = lambda x: re.findall(r'd="([^"]+)"', x)
(ROOT / 'medal_geometry.json').write_text(json.dumps({
    'medal': {'cx': MX, 'cy': MY, 'inner': MI, 'outer': MO},
    'colors': {'green': GREEN, 'ink': INK, 'cream': CREAM},
    'hair': HAIR, 'eyes': path(right | mirror, sigma=2.5, tol=1.5), 'mustache': MUST,
    'band': pieces(BAND), 'knot': pieces(KNOT_ONLY),
}, indent=1))

CELL, cols = 400, 3
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CELL*cols} {CELL*cols}" width="800" height="800"><rect width="100%" height="100%" fill="{CREAM}"/>']
for i, (name, (vb, body)) in enumerate(R.items()):
    x, y = (i % cols) * CELL, (i // cols) * CELL
    s.append(f'<text x="{x+16}" y="{y+28}" font-family="Helvetica" font-size="20" fill="{INK}">{name[0].upper()}</text>')
    def tag(bx, by, bw, bh, n):
        return f'<svg x="{bx}" y="{by}" width="{bw}" height="{bh}" viewBox="{vb}">' + body.replace('id="c"', f'id="{n}"').replace('#c)', f'#{n})') + '</svg>'
    s.append(tag(x + 50, y + 35, 300, 270, f'c{i}L'))
    s.append(tag(x + 90, y + 318, 64, 64, f'c{i}a'))
    s.append(tag(x + 190, y + 334, 32, 32, f'c{i}b'))
    s.append(tag(x + 260, y + 342, 16, 16, f'c{i}c'))
s.append('</svg>')
(ROOT / 'sheet.svg').write_text(''.join(s))
