"""
Baixa as texturas-fonte (todas CC0) para um cache local fora do repositório.
  Poly Haven  — https://polyhaven.com/license (CC0)
  ambientCG   — https://docs.ambientcg.com/license/ (CC0)
Uso:  python fetch_sources.py <pasta-cache>
Depois: python build_textures.py <pasta-cache>
"""
import io, json, os, sys, urllib.request, zipfile

UA = {'User-Agent': 'matchia-asset-build/1.0'}
POLYHAVEN = [
    'wood_floor', 'laminate_floor_02', 'oak_veneer_01', 'white_oak_veneer', 'walnut_veneer',
    'smoked_walnut_veneer', 'black_oak_veneer', 'terracotta_floor_tiles', 'curly_teddy_natural',
    'rough_linen', 'caban', 'fabric_leather_02', 'velour_velvet', 'knitted_fleece', 'white_stucco',
]
AMBIENTCG = ['Travertine009', 'Marble012', 'Concrete034', 'Concrete042A', 'Plaster001']

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()

def main(cache):
    os.makedirs(cache, exist_ok=True)
    for tid in POLYHAVEN:
        d = os.path.join(cache, tid)
        if os.path.exists(os.path.join(d, 'info.json')): continue
        os.makedirs(d, exist_ok=True)
        files = json.loads(get(f'https://api.polyhaven.com/files/{tid}'))
        info = json.loads(get(f'https://api.polyhaven.com/info/{tid}'))
        for key, name in (('Diffuse', 'color'), ('nor_gl', 'normal'), ('arm', 'arm')):
            open(os.path.join(d, f'{name}.jpg'), 'wb').write(get(files[key]['1k']['jpg']['url']))
        json.dump({'source': 'polyhaven', 'id': tid, 'dimensions_mm': info.get('dimensions')}, open(os.path.join(d, 'info.json'), 'w'))
        print('ok', tid)
    for aid in AMBIENTCG:
        d = os.path.join(cache, aid)
        if os.path.exists(os.path.join(d, 'info.json')): continue
        os.makedirs(d, exist_ok=True)
        z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_1K-JPG.zip')))
        for n in z.namelist():
            low = n.lower()
            for tag, name in (('_color.', 'color'), ('_normalgl.', 'normal'), ('_roughness.', 'rough'), ('_ambientocclusion.', 'ao')):
                if tag in low: open(os.path.join(d, f'{name}.jpg'), 'wb').write(z.read(n))
        meta = json.loads(get(f'https://ambientcg.com/api/v2/full_json?id={aid}&include=dimensionsData'))
        dims = meta['foundAssets'][0].get('dimensionX'), meta['foundAssets'][0].get('dimensionY')
        json.dump({'source': 'ambientcg', 'id': aid, 'dimensions_cm': dims}, open(os.path.join(d, 'info.json'), 'w'))
        print('ok', aid, dims)

if __name__ == '__main__':
    main(sys.argv[1])
