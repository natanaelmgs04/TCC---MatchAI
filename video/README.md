# match.IA — produção de vídeo (Remotion)

Workspace separado do site: vídeos e motion graphics feitos em código com
[Remotion](https://www.remotion.dev) 4 (React + TypeScript). **Nada daqui é
servido pelo Express** nem instalado no deploy do Render — o resultado final
(MP4, poster, legendas) é copiado para `assets/video/` do site.

> Licença Remotion: grátis para pessoas físicas, organizações com até 3
> funcionários, sem fins lucrativos e avaliação. Se o match.IA virar empresa com
> mais de 3 pessoas, é preciso licença: https://www.remotion.pro/license

## Começar

```bash
npm install          # dentro de video/
npm run dev          # copia os assets do site e abre o Studio em http://localhost:3123
```

## Scripts

| script | o que faz |
|---|---|
| `npm run sync` | copia marca, fotos, equipe e narração de `../assets` para `public/site/` |
| `npm run dev` | `sync` + Remotion Studio (preview, timeline, **Render in browser**) |
| `npm run still -- <id> out/x.png --frame=N` | um quadro em PNG (revisão) |
| `npm run frames -- <id> out/seq --frames=0-89` | sequência JPEG (revisão / pré-render) |
| `npm run render -- <id> out/<id>.mp4` | render no servidor — **não funciona nesta máquina** (ver abaixo) |
| `npm run lint` | ESLint + TypeScript |
| `npm run upgrade` | atualiza Remotion e todos os `@remotion/*` juntos |

## Como gerar o MP4 nesta máquina

O Smart App Control do Windows bloqueia o `ffmpeg.exe` do Remotion (não é
assinado), então o render no servidor falha na etapa de juntar os quadros.
Use o render pelo navegador:

1. `npm run dev`
2. No Studio, seletor ao lado do botão de render → **Client-side render**
3. **Render in browser** → MP4 H.264 em `out/`

Esse modo não suporta `backdrop-filter`, blend modes, `z-index` e `perspective`
(lista completa na skill `video-compositing`). Cenas que precisarem disso
renderizam no GitHub Actions (skill `motion-performance`).

## Organização

```
video/
├── production/
│   ├── _template/        brief.md · storyboard.md · shotlist.md
│   └── <slug>/           planejamento de cada vídeo (frames/ é gerado)
├── public/site/          GERADO por `npm run sync` (não editar, não versionar)
├── scripts/sync-assets.mjs
├── src/
│   ├── brand/            tokens.ts (cores, curvas, durações, formatos) · fonts.ts
│   ├── components/       peças reutilizáveis (Camera, MaskLine, Mark, GlassPanel…)
│   ├── compositions/     uma pasta por vídeo; EnvCheck.tsx (id "env-check") testa o ambiente
│   ├── Root.tsx          registra as composições
│   └── index.ts
└── out/                  renders (não versionar)
```

## Skills do Claude Code para este workspace

Em `../.claude/skills/`, na ordem de uso:

1. `motion-graphics-director` — intenção, hierarquia, ritmo, timing, transições (antes do código)
2. `cinematic-video-production` — narrativa, storyboard, shot list, câmera, montagem
3. `kinetic-typography` — texto animado e sincronia com a narração
4. `motion-graphs-and-charts` — score, quebra por critério, números, diagramas, mapas
5. `premium-brand-motion` — logo reveal, cores, formas, som, consistência
6. `video-compositing` — camadas, vidro, máscaras, 3D, motion blur, limites do render
7. `motion-performance` — render, cache, compressão, formatos, publicação no site

Oficiais do Remotion (instaladas via `npx skills add remotion-dev/skills`):
`remotion-best-practices`, `remotion-markup`, `remotion-render`,
`remotion-studio`, `remotion-captions`, `remotion-docs`.
