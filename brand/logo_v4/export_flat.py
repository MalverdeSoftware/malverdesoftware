"""Write the flat logo files to ../exports from medal_geometry.json.
Run after build_sketches.py:  python3 export_flat.py
The small version drops the eyes and band, per rule 5 in ../DESIGN-ETHOS.md."""
import json, re
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'exports'
(OUT / 'png').mkdir(parents=True, exist_ok=True)
G = json.loads((ROOT / 'medal_geometry.json').read_text())
M, C = G['medal'], G['colors']
CX, CY, RI, RO = M['cx'], M['cy'], M['inner'], M['outer']
SMALL_RI = 690


def flatten(d, steps=14):
    """Absolute M/L/C/Z path data to a list of closed polygons."""
    polys, pts = [], []
    for cmd, args in re.findall(r'([MLCZ])([^MLCZ]*)', d):
        n = [float(v) for v in re.findall(r'-?[\d.]+', args)]
        if cmd in 'ML':
            if cmd == 'M':
                pts = []
            pts += [(n[i], n[i + 1]) for i in range(0, len(n), 2)]
        elif cmd == 'C':
            for i in range(0, len(n), 6):
                p0, p1, p2, p3 = pts[-1], n[i:i + 2], n[i + 2:i + 4], n[i + 4:i + 6]
                for k in range(1, steps + 1):
                    t = k / steps
                    a, b, c, e = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
                    pts.append((a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
        elif cmd == 'Z':
            polys.append(pts)
            pts = []
    return polys


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def layer(px, polys, xform):
    """Even-odd fill, so eye highlights and the knot's fold stay open."""
    mask = np.zeros((px, px), bool)
    for poly in polys:
        im = Image.new('1', (px, px))
        ImageDraw.Draw(im).polygon([xform(x, y) for x, y in poly], fill=1)
        mask ^= np.array(im)
    return mask


def scaled(cx, cy, s):
    return lambda d: [[(cx + s * (x - cx), cy + s * (y - cy)) for x, y in poly] for poly in flatten(d)]


def render(size, small=False):
    px = min(size * 8, 4096)
    k = px / (2 * RO)
    xform = lambda x, y: ((x - (CX - RO)) * k, (y - (CY - RO)) * k)
    yy, xx = np.mgrid[0:px, 0:px]
    r = np.hypot(xx + .5 - px / 2, yy + .5 - px / 2) / k
    ri = SMALL_RI if small else RI
    img = np.zeros((px, px, 4), np.uint8)
    img[r <= ri] = (*rgb(C['cream']), 255)
    ink, green = (*rgb(C['ink']), 255), (*rgb(C['green']), 255)
    if small:
        f = scaled(CX, CY, .95)
        img[layer(px, f(G['hair']), xform)] = ink
        img[layer(px, [[(505 + 1.4 * (x - 505), 815 + 1.4 * (y - 815)) for x, y in p] for p in flatten(G['mustache'])], xform)] = ink
        for d in G['knot']:
            img[layer(px, f(d), xform)] = green
    else:
        img[layer(px, flatten(G['hair']), xform)] = ink
        img[layer(px, flatten(G['eyes']), xform)] = ink
        img[layer(px, flatten(G['mustache']), xform)] = ink
        for d in G['band'] + G['knot']:
            img[layer(px, flatten(d), xform)] = green
    img[(r > ri) & (r <= RO)] = green
    img[r > RO] = 0
    # Premultiplied downscale keeps the edge free of dark fringes.
    im = Image.fromarray(img, 'RGBA')
    return im.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')


if __name__ == '__main__':
    sizes = {1024: False, 512: False, 256: False, 180: False, 128: False, 64: True, 48: True, 32: True, 16: True}
    files = {}
    for size, small in sizes.items():
        files[size] = render(size, small)
        files[size].save(OUT / 'png' / f'medal_{size}.png')
    files[48].save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[files[16], files[32]])
    (OUT / 'medal.svg').write_text((ROOT / 'svg' / 'b_medal.svg').read_text())

    paths = ''.join(f'<path fill="{C["green"]}" fill-rule="evenodd" d="{d}" transform="translate({CX*.05} {CY*.05}) scale(.95)"/>' for d in G['knot'])
    (OUT / 'medal_small.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{CX-RO} {CY-RO} {2*RO} {2*RO}">'
        f'<circle cx="{CX}" cy="{CY}" r="{SMALL_RI}" fill="{C["cream"]}"/>'
        f'<path fill="{C["ink"]}" fill-rule="evenodd" d="{G["hair"]}" transform="translate({CX*.05} {CY*.05}) scale(.95)"/>'
        f'<path fill="{C["ink"]}" d="{G["mustache"]}" transform="translate({505*-.4} {815*-.4}) scale(1.4)"/>{paths}'
        f'<circle cx="{CX}" cy="{CY}" r="{(RO+SMALL_RI)/2}" fill="none" stroke="{C["green"]}" stroke-width="{RO-SMALL_RI}"/></svg>')

    sheet = Image.new('RGB', (1300, 300), rgb(C['cream']))
    for bg, x0 in (((255, 255, 255), 0), ((24, 26, 27), 650)):
        sheet.paste(bg, (x0, 0, x0 + 650, 300))
        x = x0 + 20
        for size in (256, 128, 64, 48, 32, 16):
            sheet.paste(files[size], (x, 24), files[size])
            x += size + 16
    sheet.save(ROOT / 'exports_check.png')
