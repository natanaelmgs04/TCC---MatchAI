"""Recorta os retratos de estúdio dos arquitetos (fundo cinza liso) para o hero
editorial do perfil (arquiteto.html): a pessoa recortada fica POR CIMA do nome
gigante que rola atrás dela.

Sem IA: o fundo de estúdio é um degradê suave, então ele é modelado por um
plano (cor = a + b·x + c·y, por canal) ajustado nas bordas da foto; tudo que
foge desse modelo é pessoa. A máscara é limpa (maior região que toca a base,
buracos preenchidos), suavizada e vira canal alfa.

Saída: assets/img/photos/arquiteto-hero-N-cut.webp (RGBA, mesmo tamanho da foto,
alinhado pixel a pixel com o original — os dois empilham no hero).

Uso (na raiz do projeto):  python assets/img/dev/cutout_portraits.py
Requer: numpy, scipy, scikit-image, Pillow.
"""
import glob
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PHOTOS = os.path.join(ROOT, 'assets', 'img', 'photos')


def background_model(img):
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w]
    band = np.zeros((h, w), bool)
    m = max(8, w // 40)
    band[:, :m] = band[:, -m:] = True       # laterais
    band[:m, :] = True                      # topo
    X = np.stack([np.ones(band.sum()), xx[band] / w, yy[band] / h, (xx[band] / w) ** 2], 1)
    A = np.stack([np.ones(h * w), xx.ravel() / w, yy.ravel() / h, (xx.ravel() / w) ** 2], 1)
    model = np.empty_like(img)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(X, img[..., c][band], rcond=None)
        model[..., c] = (A @ coef).reshape(h, w)
    return model


def cutout(path):
    im = Image.open(path).convert('RGB')
    img = np.asarray(im).astype(np.float32)
    bg = background_model(img)
    diff = np.sqrt(((img - bg) ** 2).sum(-1))
    h, w = diff.shape
    # watershed sobre o gradiente: a fronteira cai na borda mais forte entre
    # "certamente fundo" (faixa das bordas da foto) e "certamente pessoa"
    # (o que foge muito do fundo + o miolo inferior, onde está a camisa)
    gray = ndi.gaussian_filter(img.mean(-1), 1.0)
    grad = np.hypot(ndi.sobel(gray, 0), ndi.sobel(gray, 1))
    markers = np.zeros((h, w), np.int32)
    m = max(10, w // 50)
    markers[:, :m] = markers[:, -m:] = markers[:m, :] = 1
    # semente "pessoa": pele e cabelo (mais escuros que o fundo ou com cor);
    # manchas claras e neutras são luz do estúdio no fundo, não pessoa
    mx, mn = img.max(-1), img.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    darker = gray < bg.mean(-1) - 28
    sure_fg = ndi.binary_erosion((diff > 42) & (darker | (sat > 0.14)), iterations=3)
    markers[sure_fg] = 2
    markers[int(h * 0.9):, int(w * 0.45):int(w * 0.55)] = 2
    # camisa branca: no quarto inferior da foto, o que é bem mais claro que o fundo
    shirt = np.zeros((h, w), bool)
    shirt[int(h * 0.75):, :] = gray[int(h * 0.75):, :] > bg.mean(-1)[int(h * 0.75):, :] + 16
    markers[ndi.binary_erosion(shirt, iterations=4) & (markers == 0)] = 2
    from skimage.segmentation import watershed
    fg = watershed(grad, markers) == 2
    fg = ndi.binary_opening(fg, iterations=2)
    # só a maior região conectada que encosta na base (a pessoa)
    lab, n = ndi.label(fg)
    if n:
        bottom = set(np.unique(lab[-3:, :])) - {0}
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        keep = max(bottom or range(1, n + 1), key=lambda k: sizes[k - 1])
        fg = lab == keep
    fg = ndi.binary_fill_holes(fg)
    alpha = ndi.gaussian_filter(fg.astype(np.float32), 1.4)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    rgba = np.dstack([np.asarray(im), (alpha * 255).astype(np.uint8)])
    out = path.replace('.webp', '-cut.webp')
    Image.fromarray(rgba, 'RGBA').save(out, 'WEBP', quality=86, method=6)
    return out, float(fg.mean())


if __name__ == '__main__':
    for p in sorted(glob.glob(os.path.join(PHOTOS, 'arquiteto-hero-[0-9].webp'))):
        out, cover = cutout(p)
        print(f'{os.path.basename(out)}  pessoa = {cover:.0%} da foto')
