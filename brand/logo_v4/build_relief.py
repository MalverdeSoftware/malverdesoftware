"""Sculpt the medal as one continuous relief, like a struck and enameled medal.

Run after build_sketches.py:  python3 build_relief.py
Writes relief_maps/: height.npy (true depth for the mesh), and detail.png,
material.png and rough.png (textures). build_medal.py reads them.
Rule 1 of ../DESIGN-ETHOS.md holds: green only on the ring and knot.
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from export_flat import flatten, layer, G, CX, CY, RI, RO

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'relief_maps'
OUT.mkdir(exist_ok=True)
N = 4096
MARGIN = 10
SPAN = 2 * (RO + MARGIN)
K = N / SPAN  # pixels per SVG unit
X0, Y0 = CX - RO - MARGIN, CY - RO - MARGIN
FACE_RELIEF = 1.0  # 0 leaves the face flat; the cream field then only has its dish
rng = np.random.default_rng(1909)

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
sx, sy = xx / K + X0, yy / K + Y0  # SVG coordinates of every pixel
rad = np.hypot(sx - CX, sy - CY)
xf = lambda x, y: ((x - X0) * K, (y - Y0) * K)


def mask(paths):
    m = np.zeros((N, N), bool)
    for d in paths:
        m |= layer(N, flatten(d), xf)
    return m


def noise(sigma_units, seed_scale=8):
    """Smooth noise with mean 0, sd 1, made at low resolution for speed."""
    size = max(int(N / max(sigma_units * K / 3, 1)), 8)
    z = ndi.gaussian_filter(rng.standard_normal((size, size)), 3, mode='wrap')
    z = ndi.zoom(z, N / size, order=3)[:N, :N].astype(np.float32)
    return (z - z.mean()) / z.std()


def pillow(m, radius, height, soft=0):
    """Rounded body: rises steeply at the edge and levels off, like a filled form.
    soft (SVG units) melts the hard ridges a distance field leaves at sharp corners."""
    d = ndi.distance_transform_edt(m).astype(np.float32) / K
    if soft:
        d = ndi.gaussian_filter(d, soft * K) * m
    t = np.clip(d / radius, 0, 1)
    return height * np.sqrt(1 - (1 - t) ** 2), t


def lift(m, pillowed, base):
    """Forms sit on whatever surface is beneath them."""
    return np.where(m, base + pillowed, -1e6)


hair_m = mask([G['hair']])
eyes_m = mask([G['eyes']])
must_m = mask([G['mustache']])
band_raw = mask(G['band'])
knot_body = layer(N, flatten(G['knot'][0]), xf)
tails_raw = mask(G['knot'][1:])
# Fabric pieces touch in 3D; the flat logo keeps its small gaps.
grow = ndi.generate_binary_structure(2, 1)
band_m = ndi.binary_dilation(band_raw, grow, iterations=int(5 * K))
tails_m = ndi.binary_dilation(tails_raw, grow, iterations=int(6 * K))
knot_fill = ndi.binary_fill_holes(knot_body)

# --- Field: a shallow dish, with the face modeled softly out of the cream.
field = -24 * (1 - np.clip(rad / RI, 0, 1) ** 2)
if FACE_RELIEF:
    # A low bas-relief sculpted from simple forms, symmetric about the center line,
    # so the reflections stay clean. Positions follow the reference portrait.
    AX = 506

    def form(cx, cy, wx, wy, amount, pair=False):
        """One soft form; pair=True adds its mirror image across the center line."""
        out = amount * np.exp(-.5 * (((sx - (AX + cx)) / wx) ** 2 + ((sy - cy) / wy) ** 2))
        if pair:
            out = out + amount * np.exp(-.5 * (((sx - (AX - cx)) / wx) ** 2 + ((sy - cy) / wy) ** 2))
        return out

    rx = 300 - np.clip(sy - 780, 0, None) * .22  # the jaw narrows toward the chin
    ell = ((sx - AX) / rx) ** 2 + ((sy - 650) / 470) ** 2
    fall = np.clip((1 - ell) / .8, 0, 1)  # a long falloff, so no outline shows
    head = fall * fall * (3 - 2 * fall)
    sculpt = 24 * head
    sculpt += form(0, 400, 190, 125, 12)          # forehead
    sculpt += form(116, 548, 92, 28, 7, True)     # brow ridges
    sculpt += form(116, 612, 62, 32, -10, True)   # eye sockets
    sculpt += form(116, 622, 42, 17, 6, True)     # eyelids
    sculpt += form(0, 640, 23, 112, 13)           # bridge of the nose
    sculpt += form(0, 752, 30, 27, 15)            # tip of the nose
    sculpt += form(43, 772, 17, 14, 6, True)      # nostril wings
    sculpt += form(0, 797, 50, 9, -3)             # under the nose
    sculpt += form(132, 735, 70, 72, 8, True)     # cheeks
    sculpt += form(92, 835, 16, 62, -3, True)     # folds beside the mouth
    sculpt += form(0, 882, 55, 10, 3)             # upper lip
    sculpt += form(0, 912, 48, 14, 6)             # lower lip
    sculpt += form(0, 945, 40, 10, -3)            # under the lip
    sculpt += form(0, 985, 58, 34, 10)            # chin
    field = field + FACE_RELIEF * head * sculpt
field = field + .35 * noise(40) * (rad < RI)

height = field.copy()

# --- Hair: full locks swept up and back from the hairline.
hair_p, hair_t = pillow(hair_m, 70, 62)
theta = np.arctan2(sy - 920, sx - 506) + .018 * noise(55)
locks = np.abs(np.sin(theta * 62)) - .5
fine = np.sin(theta * 330 + 1.2 * noise(25))
hair_p = hair_p + hair_t * (9 * locks + 1.5 * fine)
height = np.maximum(height, lift(hair_m, hair_p, 2))

e_p, _ = pillow(eyes_m, 22, 15, soft=2.5)  # domed, so a flat top can't mirror the lights and go pale
height = np.maximum(height, lift(eyes_m, e_p, np.where(eyes_m, height, 0)))

# --- Mustache: combed outward from the center.
m_p, m_t = pillow(must_m, 30, 27, soft=3)
mt = np.arctan2(sy - 760, sx - 505) + .02 * noise(18)
m_p = m_p + m_t * 2.4 * np.sin(mt * 150)
height = np.maximum(height, lift(must_m, m_p, np.where(must_m, height, 0)))

# --- Neckerchief: lengthwise pleats in the band and tails, gathering at the knot.
b_p, b_t = pillow(band_m, 42, 40, soft=8)
chin = np.hypot(sx - 512, sy - 800) + 7 * noise(70)
b_p = b_p + b_t * 6 * np.sin(chin * .19)
t_p, t_t = pillow(tails_m, 40, 44, soft=14)
tails_theta = np.arctan2(sx - 495, sy - 1190) + .035 * noise(60)
t_p = t_p + t_t * 7 * np.sin(tails_theta * 30)
k_p, k_t = pillow(knot_body, 58, 72, soft=10)
k_grain = (sx - 495) * .6 + (sy - 1170) * .8 + 12 * noise(40)
k_p = k_p + k_t * 6 * np.sin(k_grain * .13)
height = np.maximum(height, lift(band_m, b_p, np.where(band_m, height, 0)))
height = np.maximum(height, lift(tails_m, t_p, np.where(tails_m, height, 0) + 6))
height = np.maximum(height, lift(knot_fill, np.where(knot_body, k_p, 12), np.where(knot_fill, height, 0) + 10))

# --- Ring: a heavy rounded bezel, with a small step down into the field.
mid, half = (RI + RO) / 2, (RO - RI) / 2
u = np.clip(np.abs(rad - mid) / half, 0, 1)
ring_h = 92 * np.sqrt(1 - u ** 3)
height = np.where(rad >= RI, np.maximum(ring_h, height * 0 + ring_h), height)
step = np.clip((rad - (RI - 5)) / 5, 0, 1) * (rad < RI)
height = height - 8 * step  # a fine groove where the ring meets the field
height = ndi.gaussian_filter(height, 1.6)

# --- Textures.
gel = (rad >= RI) | band_m | tails_m | knot_fill
ink = (hair_m | eyes_m | must_m) & ~gel
soft = lambda m: ndi.gaussian_filter(m.astype(np.float32), .9)
gel_s, ink_s = soft(gel), soft(ink)
material = np.stack([gel_s, ink_s, np.clip(1 - gel_s - ink_s, 0, 1)], -1)
Image.fromarray((material * 255).astype(np.uint8), 'RGB').save(OUT / 'material.png')

# Fine detail goes to the bump channel so the mesh can stay a practical size.
detail = height - ndi.gaussian_filter(height, 4)
# High-pass filtering rings around steep walls, so leave those to the true geometry.
gy, gx = np.gradient(ndi.gaussian_filter(height, 2))
steep = np.clip((np.hypot(gx, gy) - .25) / .35, 0, 1)
detail = detail * (1 - ndi.gaussian_filter(steep, 5))
peel = .09 * noise(7) + .03 * noise(2)  # the faint orange peel of fired enamel
# Tiny pinholes in the glaze, the kind only visible up close.
pits = (rng.random((N, N)) > .99994).astype(np.float32)
pits = ndi.gaussian_filter(pits, 1.6) * 16
detail = detail + peel - .6 * np.clip(pits, 0, 1) * (rad < RI - 8)
Image.fromarray(np.clip((detail / 20 + .5) * 65535, 0, 65535).astype(np.uint16)).save(OUT / 'detail.png')

# Handling marks: slow roughness drift plus a few hairline scratches.
rough = .5 + .10 * noise(60) + .05 * noise(9)
scratches = Image.new('L', (N, N), 0)
from PIL import ImageDraw
d = ImageDraw.Draw(scratches)
for _ in range(70):
    x, y, a, ln = rng.uniform(0, N), rng.uniform(0, N), rng.uniform(0, np.pi), rng.uniform(60, 420)
    d.line((x, y, x + ln * np.cos(a), y + ln * np.sin(a)), fill=int(rng.uniform(60, 190)), width=1)
rough = rough + .22 * np.array(scratches, np.float32) / 255
Image.fromarray((np.clip(rough, 0, 1) * 65535).astype(np.uint16)).save(OUT / 'rough.png')

np.save(OUT / 'height.npy', height.astype(np.float32))
print('height range', float(height[rad < RO].min()), float(height[rad < RO].max()))
