---
name: motion-performance
description: Use para planejar e otimizar render e exportação dos vídeos do match.IA (workspace video/, Remotion) — FPS, resolução, GPU/CPU/memória desta máquina, rascunho vs. final, render por cena, pré-render de partes pesadas, cache, compressão, loudness, formatos finais (site, banca, redes) e a integração do arquivo no site (servidor, service worker, player). Também quando um render falhar, travar ou ficar lento.
---

# Performance de motion — produção e render

## Quando usar

- Antes do primeiro render de um vídeo (definir formato, caminho de render e metas de tamanho).
- Quando o Studio/preview ficar lento ou o render falhar.
- Para exportar as versões finais e publicar no site.

## Perfil desta máquina (medido em 2026-10-03)

| recurso | valor | consequência |
|---|---|---|
| CPU | Intel i5-1335U, 12 threads | `--concurrency` 4 (máx. 6); deixe folga para o sistema |
| RAM | 7,7 GB | evite > 4 abas do Studio; 3D pesado → pré-render |
| GPU | Intel Iris Xe integrada (1 GB) | sem render acelerado de verdade; efeitos de `filter` e motion blur custam caro |
| Disco | ~286 GB livres, pasta dentro do **OneDrive** | `out/` grande sincroniza na nuvem — apague sequências de quadros depois de usar |
| Bloqueio | **Smart App Control ligado** | bloqueia `ffmpeg.exe`/`ffprobe.exe` sem assinatura (do Remotion ou baixados) |

Não altere configurações de segurança do Windows para contornar o bloqueio — isso é decisão do usuário.

## Caminhos de render (escolha pela cena, antes de compor)

| caminho | como | gera | limitações |
|---|---|---|---|
| **A. Render pelo navegador** (padrão aqui) | `npm run dev` → Studio → seletor de render → "Client-side render" → "Render in browser" | MP4 H.264 + AAC em `video/out/` (testado; `moov` no início = toca antes de baixar tudo) | subconjunto de CSS (sem `backdrop-filter`, blend, `z-index`, `perspective` — ver `video-compositing`); áudio só via `@remotion/media` |
| **B. Render no servidor local** | `npx remotion render <id> out/<id>.mp4` | **falha aqui** ao juntar os quadros (FFmpeg bloqueado) | funciona em outro PC sem o bloqueio |
| **B'. Quadros/stills locais** | `npm run still -- <id> out/x.png --frame=N` · `npm run frames -- <id> out/seq --frames=0-89` | PNG/JPEG (testado) | não gera vídeo; serve para revisão e pré-render |
| **C. GitHub Actions** | workflow manual que roda `npx remotion render` no Linux | MP4/WebM/ProRes com CSS completo | precisa criar o workflow e dar push (pedir aprovação: repo é público) |

Workflow sugerido para o caminho C (criar só quando for usar, com aprovação):

```yaml
# .github/workflows/render-video.yml
name: Render video
on:
  workflow_dispatch:
    inputs:
      composition: { description: "id da composição", required: true, default: "env-check" }
jobs:
  render:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: video } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: video/package-lock.json }
      - run: npm ci
      - run: node scripts/sync-assets.mjs
      - run: npx remotion browser ensure
      - run: npx remotion render ${{ inputs.composition }} out/${{ inputs.composition }}.mp4 --codec=h264 --crf=20 --concurrency=2
      - uses: actions/upload-artifact@v4
        with: { name: ${{ inputs.composition }}, path: video/out/*.mp4 }
```

Confira versões das actions e flags na documentação antes de criar (`https://www.remotion.dev/docs/cli/render.md`).

## FPS e resolução

- **30 fps** em tudo (narração, UI e o resto do site já pensam em 30). 60 fps só dobra o custo sem ganho em motion graphics; 24 fps deixa texto em movimento "picotado".
- **1920×1080** para o final. Rascunho: Studio com zoom 50% e renders de teste com `--scale=0.5` (caminho B'/C) ou intervalo curto de quadros.
- Redes: 1080×1920 (9:16) e 1080×1080 — composições próprias com o mesmo conteúdo reorganizado, não um corte da 16:9.

## Fluxo de iteração rápido

1. **Por cena**: registre cada cena também como composição própria (`explicativo-home--c1`) para abrir/renderizar só ela. A composição final só encadeia.
2. Revise **stills de quadros-chave** antes de renderizar movimento (B').
3. Renderize em MP4 a cena isolada (A) quando o movimento estiver aprovado.
4. Vídeo inteiro só no final.

## Pré-render e cache

- Partes caras e estáveis (cena 3D, motion blur, mapa complexo) → renderize como sequência PNG uma vez e use as imagens na composição (`<Img>` por quadro, ou converta para vídeo no caminho C).
- `calculateMetadata` lê `narration.json` uma vez por render; não faça `fetch` dentro de componentes por quadro.
- Assets via `staticFile()` (servidos localmente) — nunca URL remota em render (lento e não determinístico).
- O bundler usa cache entre renders; se algo "não atualiza", apague `video/node_modules/.cache`.
- `delayRender()` sempre com `continueRender()` garantido (inclusive no erro), senão o render espera até o timeout.

## Otimização de assets

- Fotos: as `.webp` de `assets/img/photos/` já são leves; não use imagem maior que 2× o tamanho na tela.
- Fontes: só os pesos de `src/brand/fonts.ts`.
- Áudio: narração em `assets/audio/explainer/*.mp3` (voz neural). Trilha em MP3/AAC 128–192 kbps.
- Não importe bibliotecas grandes por um efeito só; prefira `@remotion/*` oficiais (versões fixas iguais à do `remotion` — adicione com `npx remotion add <pacote>`).
- Antes de atualizar o Remotion: `npm run upgrade` (atualiza todos os `@remotion/*` juntos) e rode a composição `env-check`.

## Áudio e loudness

- Meta web: ≈ **−16 LUFS** integrado, pico ≤ **−1 dBTP**; trilha −18 a −22 dB abaixo da voz.
- Volume por trecho com a prop `volume` (função do quadro) do `<Audio>` para ducking.
- Medição/normalização com `loudnorm` exige FFmpeg → faça no caminho C (ou num PC sem o bloqueio). Localmente, mantenha as falas como saem do edge-tts (já consistentes entre si) e a trilha bem abaixo.

## Compressão e formatos finais

| destino | formato | alvo |
|---|---|---|
| **site** (seção do vídeo) | MP4 H.264 (High), yuv420p, AAC 128 kbps, `moov` no início, 1920×1080 | ~90 s ≤ **10 MB**; versão 1280×720 ≤ 5 MB para celular |
| site (opcional) | WebM VP9 + Opus | só se ficar ≥ 20% menor que o MP4 |
| **banca** (apresentação) | MP4 H.264 1080p, CRF 18 (caminho C) ou o MP4 do navegador | arquivo **local** no notebook — não depender de internet |
| redes | MP4 H.264 9:16 1080×1920, ≤ 60 s | ≤ 50 MB |
| master para edição | ProRes 422 HQ (`--codec=prores`) | só caminho C |

No caminho C, use `--crf` (18–23) em vez de bitrate fixo. No caminho A, se o MP4 passar do alvo, reduza ruído/grão (grão animado comprime mal), encurte holds longos ou exporte 720p.

## Publicar no site (quando o vídeo existir)

- Arquivos em `assets/video/<slug>/` (`<slug>-1080.mp4`, `<slug>-720.mp4`, `poster.webp`, `<slug>.pt-BR.vtt`).
- `backend/src/server.js`: incluir `mp4|webm|vtt` na regex `HEAVY_MEDIA` (cache de 1 dia). O `express.static` já atende *Range* (necessário para pular no vídeo).
- `sw.js`: incluir `mp4|webm` em `SKIP` — service worker cacheando vídeo quebra *Range* e enche o armazenamento — e subir a versão do cache.
- CSP (`backend/src/config/csp.js`): `media-src 'self'` já permite.
- `<video>` com `preload="metadata"` (ou `none`), `poster`, `playsinline`, controles; legendas via `<track kind="captions" srclang="pt-BR">` gerado de `narration.json`; sem autoplay com som. Com `prefers-reduced-motion`, não dar autoplay.
- Manter a transcrição em texto na página (acessibilidade e SEO) — o player atual já faz isso.
- Testar em produção: tamanho transferido, início do play < 2 s em 4G, pular para o meio funciona.

## Erros a evitar

- Desligar o Smart App Control "para o FFmpeg funcionar" sem o usuário decidir.
- Compor cena com `backdrop-filter`/blend e descobrir no render pelo navegador.
- Renderizar o vídeo inteiro a cada ajuste.
- 60 fps, 4K ou motion blur global "para ficar mais profissional".
- Sequências de milhares de PNG esquecidas em `out/` dentro do OneDrive.
- Vídeo servido sem cache, ou cacheado pelo service worker.
- `delayRender` sem `continueRender` no caminho de erro.

## Checklist

- [ ] Caminho de render decidido por cena (A, B' ou C) antes de compor.
- [ ] 30 fps, 1920×1080, composições separadas por formato.
- [ ] Iteração por cena com stills de quadros-chave.
- [ ] Partes pesadas pré-renderizadas; nada remoto no render.
- [ ] MP4 final dentro do alvo de tamanho, `moov` no início, áudio ≈ −16 LUFS.
- [ ] Integração no site: `HEAVY_MEDIA`, `SKIP` do SW, poster, VTT, `preload` correto.
- [ ] `out/` limpo de sequências de quadros após o uso.
