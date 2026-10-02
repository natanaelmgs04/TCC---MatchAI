"""
Gera as texturas PBR da experiência 3D a partir das fontes CC0 baixadas por
fetch_sources.py (Poly Haven + ambientCG).

  python build_textures.py <pasta-cache>

Requer: numpy, opencv-python-headless.
Saída (commitada no repositório):
  assets/3d/textures/<material>/{color,normal,arm}.webp   (arm = AO, rugosidade, metal)
  assets/3d/textures/<material>/floor-{color,normal,arm}.webp  (madeiras: piso em tábuas)
  assets/3d/textures/<material>/swatch.webp                (miniatura da interface)
  assets/3d/configurator/data/textures.js                  (tamanho físico, relevo, cor média)

Cada material tem uma cor-alvo (a do catálogo): a variação da foto é mantida e a
média é levada até essa cor em espaço linear — por isso uma única foto de linho
vira "linho cru" e "linho sálvia" sem parecer pintada por cima.
"""
import json, os, sys
import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', '3d', 'textures')
JS_OUT = os.path.join(ROOT, 'assets', '3d', 'configurator', 'data', 'textures.js')

# id: (fonte, cor-alvo sRGB, dessaturar variação 0..1, contraste da variação, relevo, tamanho px, girar 90° para veio vertical, rugosidade extra)
MATERIALS = {
    # madeira — veneer = marcenaria/ripado (veio vertical); piso gerado em tábuas
    'carvalho-mel':       ('oak_veneer_01',        '#b98a55', 0.25, 1.0, 0.5, 1024, False, 1.0),
    'carvalho-claro':     ('white_oak_veneer',     '#d2b98f', 0.3, 1.0, 0.5, 1024, False, 1.0),
    'nogueira':           ('walnut_veneer',        '#6b4228', 0.2, 1.05, 0.5, 1024, False, 0.95),
    'carvalho-defumado':  ('smoked_walnut_veneer', '#4d3829', 0.3, 1.0, 0.5, 1024, True, 0.95),
    'freijo-ebanizado':   ('black_oak_veneer',     '#2b2521', 0.4, 1.2, 0.5, 1024, True, 0.9),
    # pedra
    'travertino':         ('Travertine009',        '#d5c6ab', 0.3, 1.0, 0.7, 1024, False, 1.0),
    'marmore-branco':     ('Marble012',            '#e4e1dc', 0.85, 1.0, 0.4, 1024, False, 1.0),
    'cimento-queimado':   ('Concrete034',          '#98938c', 1.0, 0.9, 0.5, 1024, False, 0.85),
    'concreto-aparente':  ('Concrete042A',         '#87837d', 0.8, 1.0, 0.8, 1024, False, 1.0),
    'ceramica-terracota': ('terracotta_floor_tiles', '#a8634a', 0.5, 0.9, 0.8, 1024, False, 1.0),
    # tecido
    'boucle':             ('curly_teddy_natural',  '#e8e0d1', 0.7, 1.0, 1.0, 512, False, 1.0),
    'linho':              ('rough_linen',          '#ddd1bd', 1.0, 1.0, 0.9, 512, False, 1.0),
    'linho-salvia':       ('rough_linen',          '#85978a', 1.0, 1.0, 0.9, 512, False, 1.0),
    'la-ferrugem':        ('caban',                '#a5522f', 0.7, 1.0, 1.0, 512, False, 1.0),
    'couro-conhaque':     ('fabric_leather_02',    '#8a4c26', 0.2, 1.0, 0.8, 1024, False, 0.9),
    'veludo-ocre':        ('velour_velvet',        '#b9832c', 1.0, 1.1, 0.8, 512, False, 1.0),
    'veludo-marinho':     ('velour_velvet',        '#27314b', 1.0, 1.1, 0.8, 512, False, 1.0),
    'trico-aveia':        ('knitted_fleece',       '#cdbd9d', 1.0, 1.0, 1.0, 512, False, 1.0),
    'feltro-carvao':      ('caban',                '#38383a', 1.0, 1.0, 0.9, 512, False, 1.0),
    # tinta
    'cal-areia':          ('Plaster001',           '#d9c3a0', 1.0, 0.9, 0.55, 1024, False, 1.0),
    'off-white':          ('white_stucco',         '#ebe6dc', 1.0, 0.6, 0.35, 1024, False, 1.0),
    'salvia':             ('Plaster001',           '#869988', 1.0, 0.9, 0.55, 1024, False, 1.0),
    'terracota':          ('Plaster001',           '#ab6f54', 1.0, 0.9, 0.55, 1024, False, 1.0),
    'azul-tinta':         ('white_stucco',         '#2c364e', 1.0, 0.6, 0.35, 1024, False, 1.0),
    'grafite':            ('white_stucco',         '#3a3938', 1.0, 0.6, 0.35, 1024, False, 1.0),
}
WOODS = ['carvalho-mel', 'carvalho-claro', 'nogueira', 'carvalho-defumado', 'freijo-ebanizado']
# tamanho físico (m) quando a fonte não informa
FALLBACK_SIZE = {'Marble012': 2.0, 'Concrete042A': 2.0, 'Plaster001': 2.0}
FLOOR_TILE_M = 1.8      # a textura de piso cobre 1,8 m × 1,8 m
PLANK_ROWS = 9          # tábuas de 20 cm


def srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def hex_lin(h):
    h = h.lstrip('#')
    return srgb_to_lin(np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32))


def read(path, size):
    im = cv2.imread(path, cv2.IMREAD_COLOR)
    if im is None:
        return None
    # fontes retangulares (ex.: 1024×512) viram quadradas repetindo o lado menor
    h, w = im.shape[:2]
    if h != w:
        reps_y, reps_x = int(np.ceil(max(h, w) / h)), int(np.ceil(max(h, w) / w))
        im = np.tile(im, (reps_y, reps_x, 1))[:max(h, w), :max(h, w)]
    return cv2.resize(im, (size, size), interpolation=cv2.INTER_AREA)


def physical_size(info):
    if info['source'] == 'polyhaven' and info.get('dimensions_mm'):
        return float(info['dimensions_mm'][0]) / 1000
    dims = info.get('dimensions_cm') or (0, 0)
    if dims and dims[0]:
        return max(dims) / 100
    return FALLBACK_SIZE.get(info['id'], 2.0)


def grade(bgr, target_hex, desat, contrast):
    """Leva a média da foto até a cor-alvo, mantendo a variação (linear)."""
    lin = srgb_to_lin(bgr[..., ::-1].astype(np.float32) / 255)
    mean = lin.reshape(-1, 3).mean(0) + 1e-5
    rel = lin / mean
    lum = (lin @ np.array([0.2126, 0.7152, 0.0722], np.float32))
    lum_rel = (lum / (lum.mean() + 1e-5))[..., None]
    var = rel * (1 - desat) + lum_rel * desat
    var = 1 + (var - 1) * contrast
    out = lin_to_srgb(hex_lin(target_hex) * var)
    return (out[..., ::-1] * 255 + 0.5).astype(np.uint8)


def wrapped(fn, img, pad):
    """Aplica um filtro como se a imagem se repetisse (texturas sem emenda)."""
    p = np.pad(img, ((pad, pad), (pad, pad)) + ((0, 0),) * (img.ndim - 2), mode='wrap')
    return fn(p)[pad:-pad, pad:-pad]


def blur_wrap(img, sigma):
    return wrapped(lambda p: cv2.GaussianBlur(p, (0, 0), sigma), img, int(sigma * 4) + 2)


def height_to_normal(height, strength):
    gx = wrapped(lambda p: cv2.Sobel(p, cv2.CV_32F, 1, 0, ksize=3), height, 2)
    gy = wrapped(lambda p: cv2.Sobel(p, cv2.CV_32F, 0, 1, ksize=3), height, 2)
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(height)])  # +Y para cima (OpenGL)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    rgb = (n * 0.5 + 0.5)
    return (rgb[..., ::-1] * 255 + 0.5).astype(np.uint8)


def detail_height(bgr, sigma):
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    return lum - blur_wrap(lum, sigma)


def write(path, im, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ok, buf = cv2.imencode('.webp', im, [cv2.IMWRITE_WEBP_QUALITY, q])  # imwrite não aceita caminhos com acento no Windows
    assert ok, path
    with open(path, 'wb') as f:
        f.write(buf.tobytes())


def load_source(cache, src, size):
    d = os.path.join(cache, src)
    info = json.load(open(os.path.join(d, 'info.json')))
    color = read(os.path.join(d, 'color.jpg'), size)
    normal = read(os.path.join(d, 'normal.jpg'), size)
    if os.path.exists(os.path.join(d, 'arm.jpg')):
        arm = read(os.path.join(d, 'arm.jpg'), size)
    else:  # ambientCG: monta AO/rugosidade/metal
        rough = read(os.path.join(d, 'rough.jpg'), size)[..., 0]
        ao_img = read(os.path.join(d, 'ao.jpg'), size) if os.path.exists(os.path.join(d, 'ao.jpg')) else None
        ao = ao_img[..., 0] if ao_img is not None else np.full_like(rough, 255)
        arm = np.dstack([np.zeros_like(rough), rough, ao])  # BGR → R=ao, G=rough, B=metal
    return info, color, normal, arm


def wood_planks(color, arm, src_size_m, rng, size=1024):
    """Piso em tábuas a partir de uma lâmina com veio horizontal."""
    px_per_m = size / FLOOR_TILE_M
    # reamostra a fonte na mesma densidade do piso e repete para sortear trechos
    src_px = max(64, int(round(src_size_m * px_per_m)))
    c = cv2.resize(color, (src_px, src_px), interpolation=cv2.INTER_AREA)
    r = cv2.resize(arm[..., 1], (src_px, src_px), interpolation=cv2.INTER_AREA)
    reps = int(np.ceil(size * 2 / src_px)) + 1
    c = np.tile(c, (reps, reps, 1)); r = np.tile(r, (reps, reps))
    out_c = np.zeros((size, size, 3), np.uint8)
    out_r = np.zeros((size, size), np.float32)
    height = np.zeros((size, size), np.float32)
    ao = np.ones((size, size), np.float32)
    edges = np.linspace(0, size, PLANK_ROWS + 1).round().astype(int)
    for row in range(PLANK_ROWS):
        y0, y1 = edges[row], edges[row + 1]
        x = -int(rng.uniform(0, size * 0.6))
        while x < size:
            length = int(rng.uniform(0.75, 1.6) * px_per_m)
            sx, sy = int(rng.uniform(0, src_px)), int(rng.uniform(0, src_px))
            tone = rng.normal(1.0, 0.035)
            xs = np.arange(x, x + length)
            xs_wrapped = np.mod(xs, size)
            block_c = c[sy:sy + (y1 - y0), sx:sx + length].astype(np.float32) * tone
            block_r = r[sy:sy + (y1 - y0), sx:sx + length].astype(np.float32) / 255 * rng.normal(1.0, 0.05)
            n = min(len(xs_wrapped), block_c.shape[1])
            out_c[y0:y1, xs_wrapped[:n]] = np.clip(block_c[:, :n], 0, 255).astype(np.uint8)
            out_r[y0:y1, xs_wrapped[:n]] = block_r[:, :n]
            # junta de topo
            for jx in (x % size, (x + length - 1) % size):
                height[y0:y1, jx] = -1.0; ao[y0:y1, jx] = 0.55
            x += length
        height[y0, :] = -1.0; ao[y0, :] = 0.55
        if y0 + 1 < size: height[y0 + 1, :] = -0.5; ao[y0 + 1, :] = 0.8
    # junta visível na cor também (sombra fina entre as tábuas)
    out_c = np.clip(out_c.astype(np.float32) * (0.45 + 0.55 * ao)[..., None], 0, 255).astype(np.uint8)
    detail = detail_height(out_c, 3)
    h = blur_wrap(height, 0.8) * 0.06 + blur_wrap(detail, 0.7) * 0.18
    normal = height_to_normal(h, 4.0)
    rough = np.clip(out_r * (1 + (1 - ao) * 0.6), 0, 1)
    arm_out = np.dstack([np.zeros_like(rough), rough, ao]) * 255
    return out_c, normal, arm_out.astype(np.uint8)


def swatch(color, size_m, show_m, out_px=160):
    """Recorte quadrado mostrando ~show_m metros de material, com luz suave de amostra."""
    s = color.shape[0]
    crop_px = int(np.clip(s * show_m / size_m, 24, s))
    tile = color if crop_px <= s else np.tile(color, (2, 2, 1))
    im = cv2.resize(tile[:crop_px, :crop_px], (out_px, out_px), interpolation=cv2.INTER_AREA).astype(np.float32)
    yy, xx = np.mgrid[0:out_px, 0:out_px] / out_px
    light = 1.08 - 0.16 * (0.6 * yy + 0.4 * xx)
    return np.clip(im * light[..., None], 0, 255).astype(np.uint8)


def main(cache):
    rng = np.random.default_rng(7)
    meta = {}
    for mid, (src, target, desat, contrast, relief, size, rotate, rough_k) in MATERIALS.items():
        info, color, normal, arm = load_source(cache, src, size)
        size_m = physical_size(info)
        is_wood = mid in WOODS
        if is_wood:
            # orienta: veneer com veio vertical; piso com veio horizontal (ao longo da tábua)
            vertical = color if not rotate else cv2.rotate(color, cv2.ROTATE_90_CLOCKWISE)
            arm_v = arm if not rotate else cv2.rotate(arm, cv2.ROTATE_90_CLOCKWISE)
            graded_v = grade(vertical, target, desat, contrast)
            normal_v = height_to_normal(blur_wrap(detail_height(graded_v, 3), 0.7) * 0.2, 4.0)
            arm_v = arm_v.copy(); arm_v[..., 1] = np.clip(arm_v[..., 1] * rough_k, 0, 255)
            write(os.path.join(OUT, mid, 'color.webp'), graded_v, 86)
            write(os.path.join(OUT, mid, 'normal.webp'), normal_v, 90)
            write(os.path.join(OUT, mid, 'arm.webp'), arm_v, 86)
            horiz = cv2.rotate(graded_v, cv2.ROTATE_90_COUNTERCLOCKWISE)
            horiz_arm = cv2.rotate(arm_v, cv2.ROTATE_90_COUNTERCLOCKWISE)
            fc, fn, fa = wood_planks(horiz, horiz_arm, size_m, rng)
            write(os.path.join(OUT, mid, 'floor-color.webp'), fc, 86)
            write(os.path.join(OUT, mid, 'floor-normal.webp'), fn, 90)
            write(os.path.join(OUT, mid, 'floor-arm.webp'), fa, 86)
            write(os.path.join(OUT, mid, 'swatch.webp'), swatch(fc, FLOOR_TILE_M, 0.9), 88)
            mean = fc.reshape(-1, 3).mean(0)
            meta[mid] = {'size': round(size_m, 3), 'floorSize': FLOOR_TILE_M, 'normalScale': relief, 'floor': True}
        else:
            graded = grade(color, target, desat, contrast)
            arm = arm.copy(); arm[..., 1] = np.clip(arm[..., 1].astype(np.float32) * rough_k, 0, 255).astype(np.uint8)
            write(os.path.join(OUT, mid, 'color.webp'), graded, 86)
            write(os.path.join(OUT, mid, 'normal.webp'), normal, 90)
            write(os.path.join(OUT, mid, 'arm.webp'), arm, 86)
            show = 0.12 if size_m < 0.6 else 0.7
            write(os.path.join(OUT, mid, 'swatch.webp'), swatch(graded, size_m, show), 88)
            mean = graded.reshape(-1, 3).mean(0)
            meta[mid] = {'size': round(size_m, 3), 'normalScale': relief}
        meta[mid]['mean'] = '#%02x%02x%02x' % (int(mean[2]), int(mean[1]), int(mean[0]))
        print(mid, meta[mid])

    js = (
        '// Gerado por assets/3d/dev/build_textures.py — não edite à mão.\n'
        '// size = metros cobertos por uma repetição da textura; normalScale = relevo;\n'
        '// mean = cor média (sRGB) usada nas faixas de cor da interface.\n'
        f'export const TEXTURES = {json.dumps(meta, indent=2, ensure_ascii=False)};\n'
    )
    open(JS_OUT, 'w', encoding='utf-8').write(js)


if __name__ == '__main__':
    main(sys.argv[1])
