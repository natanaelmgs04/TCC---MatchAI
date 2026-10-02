"""Gera a narração do vídeo explicativo da home (assets/js/explainer-video.js).

Lê as falas da transcrição em index.html (fonte única: [data-xv-script] p[data-line]),
sintetiza cada uma com uma voz neural em pt-BR e grava:

  assets/audio/explainer/<cena>-<n>.mp3
  assets/audio/explainer/narration.json   { "<cena>-<n>": { "src", "dur", "text", "who" } }

O player compara o texto do manifesto com o da transcrição: se você editar uma fala
e esquecer de rodar este script, aquela fala só fica sem voz (as legendas seguem).

Uso (na raiz do projeto):
  python -m pip install --user edge-tts
  python assets/audio/dev/build_narration.py
"""
import asyncio
import html
import json
import os
import re
import sys

import edge_tts

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'audio', 'explainer')

# match.IA: Thalita (neural multilíngue, a mais natural em pt-BR); "Você": Antonio.
VOICES = {
    'ia': {'voice': 'pt-BR-ThalitaMultilingualNeural', 'rate': '+4%', 'pitch': '+0Hz'},
    'voce': {'voice': 'pt-BR-AntonioNeural', 'rate': '+6%', 'pitch': '+0Hz'},
}
BITRATE = 48000  # edge-tts entrega MP3 mono 24 kHz / 48 kbps (CBR)


def read_lines():
    with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as f:
        src = f.read()
    block = re.search(r'data-xv-script>(.*?)</div>', src, re.S).group(1)
    lines, count = [], {}
    for m in re.finditer(r'<p data-line="([\w-]+)" data-who="(ia|voce)"[^>]*>(.*?)</p>', block, re.S):
        scene, who, text = m.group(1), m.group(2), html.unescape(re.sub(r'\s+', ' ', m.group(3)).strip())
        n = count.get(scene, 0)
        count[scene] = n + 1
        lines.append({'id': f'{scene}-{n}', 'who': who, 'text': text})
    return lines


async def synth(line):
    """Grava o MP3 e devolve onde a fala começa e termina dentro dele (o arquivo
    vem com silêncio nas pontas; o player toca só o trecho com voz)."""
    v = VOICES[line['who']]
    path = os.path.join(OUT, line['id'] + '.mp3')
    com = edge_tts.Communicate(line['text'], v['voice'], rate=v['rate'], pitch=v['pitch'], boundary='WordBoundary')
    audio, words = bytearray(), []
    async for chunk in com.stream():
        if chunk['type'] == 'audio':
            audio += chunk['data']
        elif chunk['type'] == 'WordBoundary':
            words.append((chunk['offset'] / 1e7, (chunk['offset'] + chunk['duration']) / 1e7))  # unidades de 100 ns
    with open(path, 'wb') as f:
        f.write(audio)
    file_dur = len(audio) * 8 / BITRATE
    start = max(0.0, words[0][0] - 0.05) if words else 0.0
    end = min(file_dur, words[-1][1] + 0.25) if words else file_dur
    return line['id'], {
        'src': f"assets/audio/explainer/{line['id']}.mp3",
        'start': round(start, 2), 'dur': round(end - start, 2),
        'text': line['text'], 'who': line['who'],
    }


async def main():
    os.makedirs(OUT, exist_ok=True)
    lines = read_lines()
    if not lines:
        sys.exit('Nenhuma fala encontrada em index.html')
    manifest = {}
    for line in lines:  # uma de cada vez: o serviço recusa rajadas
        key, entry = await synth(line)
        manifest[key] = entry
        print(f"{key:10} {entry['dur']:5.2f}s  {line['text'][:60]}")
    keep = {k + '.mp3' for k in manifest}
    for name in os.listdir(OUT):
        if name.endswith('.mp3') and name not in keep:
            os.remove(os.path.join(OUT, name))
    with open(os.path.join(OUT, 'narration.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    total = sum(e['dur'] for e in manifest.values())
    size = sum(os.path.getsize(os.path.join(OUT, k + '.mp3')) for k in manifest)
    print(f'{len(manifest)} falas, {total:.1f}s de voz, {size / 1024:.0f} KB')


if __name__ == '__main__':
    asyncio.run(main())
