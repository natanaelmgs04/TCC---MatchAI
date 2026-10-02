"""
Ambiente da experiência 3D (CC0, Poly Haven):
  - assets/3d/hdr/hotel_room_1k.hdr      reflexos e luz ambiente (scene.environment)
  - assets/3d/textures/vista/dia.webp     vista desfocada pelas janelas (canary_wharf)
  - assets/3d/textures/vista/noite.webp   (shanghai_bund)
  python fetch_environment.py
"""
import os, urllib.request
import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
UA = {'User-Agent': 'matchia-asset-build/1.0'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read()


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def vista(hdri, y0, y1, out, sigma):
    raw = np.frombuffer(get(f'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/{hdri}.jpg'), np.uint8)
    im = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    h = im.shape[0]
    band = im[int(h * y0):int(h * y1)]
    band = cv2.resize(band, (2048, 512), interpolation=cv2.INTER_AREA)
    band = cv2.GaussianBlur(band, (0, 0), sigma)  # profundidade de campo: a cidade fica fora de foco
    ok, buf = cv2.imencode('.webp', band, [cv2.IMWRITE_WEBP_QUALITY, 80])
    save(out, buf.tobytes())


save(os.path.join(ROOT, 'assets', '3d', 'hdr', 'hotel_room_1k.hdr'),
     get('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/hotel_room_1k.hdr'))
vista('canary_wharf', 0.06, 0.5, os.path.join(ROOT, 'assets', '3d', 'textures', 'vista', 'dia.webp'), 2.2)
vista('shanghai_bund', 0.22, 0.56, os.path.join(ROOT, 'assets', '3d', 'textures', 'vista', 'noite.webp'), 2.2)
print('ok')
