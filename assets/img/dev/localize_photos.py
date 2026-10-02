"""Baixa as fotos do Unsplash usadas no site e troca os links por cópias locais.

Por quê: em redes que bloqueiam images.unsplash.com (laboratórios, empresas),
o site ficava sem nenhuma foto — só as da equipe, que já eram locais. Com as
fotos dentro do projeto, o site não depende de nenhum domínio externo para elas.
As fotos seguem a Unsplash License (uso livre, inclusive comercial; ver
assets/img/photos/CREDITS.md).

O que faz:
  1. procura todo link https://images.unsplash.com/... nos .html/.js/.css do site;
  2. baixa cada foto uma vez, na maior largura pedida (no máximo 1600 px),
     e salva em assets/img/photos/<id>.webp;
  3. reescreve os links para o caminho local.
Pode rodar de novo à vontade (ex.: depois de colocar uma foto nova do Unsplash).

Uso (na raiz do projeto):  python assets/img/dev/localize_photos.py
"""
import io
import os
import re
import sys
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'img', 'photos')
SKIP_DIRS = {'node_modules', '.git', '.claude', 'backend', 'mcp-server', 'dev'}
URL_RE = re.compile(r"https://images\.unsplash\.com/(photo-[A-Za-z0-9-]+)(\?[^\"'\s)`]*)?")
MAX_W = 1600


def site_files():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name.endswith(('.html', '.js', '.css')):
                yield os.path.join(base, name)


def width_of(query):
    q = urllib.parse.parse_qs((query or '?')[1:])
    try:
        return int(q.get('w', ['1200'])[0])
    except ValueError:
        return 1200


def download(photo_id, width):
    url = f'https://images.unsplash.com/{photo_id}?auto=format&fit=max&w={width}&q=82&fm=jpg'
    req = urllib.request.Request(url, headers={'User-Agent': 'matchia-localize/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        img = Image.open(io.BytesIO(r.read())).convert('RGB')
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=80, method=6)
    with open(os.path.join(OUT, photo_id + '.webp'), 'wb') as f:
        f.write(buf.getvalue())
    buf = buf.getvalue()
    return len(buf)


def main():
    os.makedirs(OUT, exist_ok=True)
    files = list(site_files())
    wanted = {}
    for path in files:
        with open(path, encoding='utf-8') as f:
            for m in URL_RE.finditer(f.read()):
                wanted[m.group(1)] = max(wanted.get(m.group(1), 0), min(MAX_W, width_of(m.group(2))))
    if not wanted:
        print('Nenhum link do Unsplash encontrado: tudo já é local.')
        return

    total, failed = 0, []
    for photo_id, width in sorted(wanted.items()):
        target = os.path.join(OUT, photo_id + '.webp')
        if os.path.exists(target):
            continue
        try:
            size = download(photo_id, width)
            total += size
            print(f'{photo_id:40} {width:5}px  {size / 1024:6.0f} KB')
        except Exception as e:  # noqa: BLE001 — segue com as outras
            failed.append(photo_id)
            print(f'{photo_id:40} FALHOU: {e}')

    changed = 0
    for path in files:
        with open(path, encoding='utf-8', newline='') as f:
            src = f.read()
        rel = os.path.relpath(OUT, os.path.dirname(path)).replace(os.sep, '/')
        # caminho relativo à raiz do site (os .js montam HTML que roda nas páginas da raiz)
        local = 'assets/img/photos' if path.endswith('.js') else rel
        new = URL_RE.sub(lambda m: m.group(0) if m.group(1) in failed else f'{local}/{m.group(1)}.webp', src)
        if new != src:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(new)
            changed += 1
    print(f'\n{len(wanted) - len(failed)} fotos locais ({total / 1024 / 1024:.1f} MB baixados agora), {changed} arquivos atualizados.')
    if failed:
        print('Falharam (links mantidos):', ', '.join(failed))
        sys.exit(1)


if __name__ == '__main__':
    main()
