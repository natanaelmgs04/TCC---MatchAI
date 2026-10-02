"""
Baixa os modelos glTF (CC0, Poly Haven — https://polyhaven.com/license) usados
na experiência 3D para um cache local. Depois, build_models.sh os converte em
GLB otimizados (Draco + WebP) em assets/3d/models/props/.

  python fetch_models.py <pasta-cache>
"""
import json, os, sys, urllib.request

UA = {'User-Agent': 'matchia-asset-build/1.0'}
MODELS = [
    'modern_arm_chair_01', 'mid_century_lounge_chair', 'coffee_table_round_01', 'modern_wooden_cabinet',
    'side_table_01', 'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'modern_ceiling_lamp_01',
    'desk_lamp_arm_01', 'book_encyclopedia_set_01', 'ceramic_vase_01', 'ceramic_vase_03',
    'wooden_display_shelves_01', 'wicker_basket_01', 'standing_picture_frame_01',
]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read()


def main(cache):
    for mid in MODELS:
        d = os.path.join(cache, mid)
        if os.path.exists(os.path.join(d, 'done')): continue
        os.makedirs(d, exist_ok=True)
        files = json.loads(get(f'https://api.polyhaven.com/files/{mid}'))
        g = files['gltf']['1k']['gltf']
        open(os.path.join(d, f'{mid}.gltf'), 'wb').write(get(g['url']))
        for rel, inc in g.get('include', {}).items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, 'wb').write(get(inc['url']))
        open(os.path.join(d, 'done'), 'w').write('ok')
        print('ok', mid)


if __name__ == '__main__':
    main(sys.argv[1])
