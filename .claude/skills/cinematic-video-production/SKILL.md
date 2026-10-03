---
name: cinematic-video-production
description: Use para planejar e montar um vídeo do match.IA com aparência cinematográfica no workspace video/ (Remotion) — estrutura narrativa, roteiro amarrado à narração, storyboard, shot list, enquadramento, câmera virtual, profundidade, luz, ritmo de montagem, transições e continuidade. Cria a pasta de produção (video/production/<slug>/) e a estrutura de cenas/composições. Use depois da direção (motion-graphics-director) e antes de animar tipografia, gráficos e marca.
---

# Produção cinematográfica — match.IA

"Cinematográfico" aqui não é efeito: é **enquadramento intencional, câmera que respira, luz que guia o olho e montagem com ritmo**. Um motion graphics 2D pode ser cinematográfico; um vídeo cheio de efeitos, não.

## Quando usar

- Planejar um vídeo novo ou refazer o explicativo da home.
- Transformar um roteiro/narração em cenas, shot list e composições do Remotion.
- Revisar continuidade e ritmo de uma montagem.

## Organização da produção

```
video/
├── production/
│   ├── _template/            # brief.md, storyboard.md, shotlist.md (copie para começar)
│   └── <slug>/               # ex.: explicativo-home
│       ├── brief.md          # frase-brief, público, onde passa, duração, formatos
│       ├── storyboard.md     # 1 bloco por cena: quadro-chave, intenção, fala
│       ├── shotlist.md       # tabela de planos (abaixo)
│       └── frames/           # stills de revisão (gerados, não versionar)
└── src/
    ├── brand/                # tokens.ts, fonts.ts (não duplicar valores)
    ├── components/           # peças reutilizáveis (Camera, MaskReveal, GlassPanel…)
    └── compositions/<slug>/  # Index.tsx (TransitionSeries) + uma cena por arquivo
```

- **Uma cena = um arquivo** (`C1Match.tsx`, `A3Briefing.tsx`), com duração própria. A composição só encadeia.
- Id da composição em kebab-case = slug da pasta (`explicativo-home`).

## Estrutura narrativa (vídeo de produto 60–90 s)

| ato | tempo | função | no match.IA |
|---|---|---|---|
| gancho | 0–4 s | uma imagem/frase que prende | "Dois lados, um match" com os dois lados convergindo |
| tensão | 4–15 s | o problema que o público sente | escolher arquiteto no escuro; arquiteto recebendo cliente que não combina |
| mecanismo | 15–55 s | como funciona, em 3 passos no máximo | projeto → compatibilidade com o portfólio real → motivos explicados |
| prova | 55–75 s | evidência concreta | score com quebra por critério, projeto fechado no perfil |
| convite | últimos 5–10 s | o que fazer agora | logo + "Crie seu projeto" / URL |

O roteiro atual (intro → cliente 01–05 → ponte → arquiteto 01–06 → final) já segue essa linha. Mantenha a narração como **fonte da verdade do tempo**.

## Amarrar cenas à narração

`assets/audio/explainer/narration.json` tem a duração real de cada fala. Dimensione as cenas a partir dela com `calculateMetadata` — nunca chute segundos:

```tsx
// src/compositions/explicativo-home/timing.ts
import { staticFile } from "remotion";
type Line = { src: string; start: number; dur: number; text: string; who: "ia" | "voce" };
export async function loadNarration(): Promise<Record<string, Line>> {
  const res = await fetch(staticFile("site/audio/explainer/narration.json"));
  return res.json();
}
// duração da cena = soma das falas dela + respiros (entrada 0,6 s, hold final 1,2 s)
export const sceneFrames = (lines: Line[], fps: number, lead = 0.6, tail = 1.2) =>
  Math.ceil((lead + lines.reduce((s, l) => s + l.dur, 0) + tail) * fps);
```

Na `<Composition>`, `calculateMetadata` soma as cenas e devolve `durationInFrames`; cada fala entra como `<Audio src={staticFile("site/audio/explainer/c1-0.mp3")} />` numa `<Sequence from={...}>` dentro da cena. **Importe `Audio` de `@remotion/media`** (já instalado) — é o único componente de áudio que o "Render in browser" suporta (`Html5Audio` não renderiza lá). Se as falas mudarem, rode `python assets/audio/dev/build_narration.py` e `npm run sync` — o vídeo se reajusta.

## Storyboard (por cena)

```
## C1 — Encontre seu arquiteto ideal          fala: c1-0 (Antonio, 5,2 s)
Quadro-chave: chips de preferência à esquerda, anel de compatibilidade no centro, card da arquiteta à direita.
Intenção: o cliente diz o que quer e a IA devolve UMA pessoa compatível, com número.
Plano: médio → push-in leve no anel (3%) quando o número fecha.
Entra: título (máscara) → chips (esq., stagger) → anel 0→95% → card (dir.)
Sai: wipe para a direita levando o card (continuidade com C2).
```

## Shot list

| # | cena | plano | câmera | herói | duração | transição de saída |
|---|---|---|---|---|---|---|
| 1 | intro | geral (os dois lados) | fixa, push-in 4% em 3 s | símbolo se formando | 3,5 s | match cut no ponto do símbolo |
| 2 | c1 | médio | fixa | anel 95% | 5,8 s | wipe → |

Planos traduzidos para motion graphics:
- **Geral (establishing)**: a interface/cenário inteiro, elementos pequenos — situa.
- **Médio**: um card ou painel ocupando ~50–60% da largura — explica.
- **Close / detalhe**: um número, um chip, um traço — enfatiza. Use para o clímax de cada cena.
- **Insert**: foto real de projeto em tela cheia — dá respiro e realidade.

## Enquadramento

- Formato do site: **1920×1080, 30 fps**. Área segura: `safe(w,h)` de `tokens.ts` (5% lateral, 7% vertical) — título e legenda nunca fora dela.
- Regra dos terços para o herói; **centro** só para momentos de marca (símbolo, frase-tema, final).
- Espaço negativo é parte da composição: com fundo `color.bg`, deixe ≥ 35% da tela vazia em cena de leitura.
- Peso visual: cliente/esquerda e arquiteto/direita equilibram a tela; o match fica no eixo central.

## Câmera virtual

Não existe câmera no DOM: crie um componente `Camera` que move um "mundo" (contêiner com todas as camadas) — e nunca anime os elementos para simular câmera.

```tsx
// src/components/Camera.tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ease } from "../brand/tokens";
type Key = { f: number; x: number; y: number; zoom: number };
export const Camera: React.FC<{ keys: Key[]; children: React.ReactNode }> = ({ keys, children }) => {
  const frame = useCurrentFrame();
  const fs = keys.map((k) => k.f);
  const opts = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.out } as const;
  const x = interpolate(frame, fs, keys.map((k) => k.x), opts);
  const y = interpolate(frame, fs, keys.map((k) => k.y), opts);
  const zoom = interpolate(frame, fs, keys.map((k) => k.zoom), opts);
  return (
    <AbsoluteFill style={{ scale: String(zoom), translate: `${-x}px ${-y}px`, transformOrigin: "50% 50%" }}>
      {children}
    </AbsoluteFill>
  );
};
```

- Push-in **lento**: 3–6% de zoom em 2–4 s. Nunca > 15% numa cena de leitura.
- Pan só com motivo (seguir algo que se desloca de um lado ao outro = cliente → arquiteto).
- Câmera parada também é decisão: cenas de leitura ficam paradas.
- Profundidade (parallax): camadas com fatores diferentes do mesmo movimento — fundo 0,3×, meio 0,6×, frente 1×. Detalhes em `video-compositing`.

## Luz e profundidade

- Luz = para onde o olho vai. Um gradiente radial quente (`color.bg` → `color.bgAlt`) atrás do herói faz o papel de "spot".
- Vinheta suave (radial de transparente a `rgba(51,51,51,.08)`) segura o olhar no centro — sutil, nunca escura.
- Profundidade de campo falsa: camadas de fundo com `filter: blur(4–8px)` e opacidade menor (filter funciona no "Render in browser" com Chrome).
- Fotos de projeto: leve graduação quente (overlay terracota 6–10% via camada com opacidade, já que `mix-blend-mode` não funciona no render local).

## Montagem e continuidade

- **Direção de tela fixa** (cliente esq., arquiteto dir.) — ver `motion-graphics-director`.
- **Continuidade de forma**: um elemento que sai de uma cena reaparece na seguinte no mesmo lugar (anel → ponto do símbolo; card → avatar). É isso que faz parecer "um filme" e não slides.
- **Continuidade de cor**: o fundo não salta de claro para escuro sem transição; o escuro é reservado para o final.
- Corte no movimento: troque de cena quando um elemento está em movimento de saída, não parado.
- Respiro antes de mudar de capítulo (cliente → arquiteto): 0,5–0,8 s de cena limpa.

## Transições no Remotion

Use `@remotion/transitions` (`TransitionSeries`): `fade()`, `wipe({direction: "from-left"})`, `slide()`. A transição **sobrepõe** cenas: a duração total diminui pela duração da transição — some isso no `calculateMetadata`. Toda `TransitionSeries.Sequence` com `premountFor={fps}`.

## Erros a evitar

- Duração de cena escolhida "no olho" em vez da narração.
- Câmera que se move em toda cena (enjoa) ou zoom rápido em foto.
- Inverter o lado de cliente/arquiteto entre cenas.
- Fundo escuro no meio do vídeo sem motivo narrativo.
- Cenas que começam com tudo já na tela (sem entrada) ou terminam sem hold.

## Checklist

- [ ] `production/<slug>/brief.md`, `storyboard.md` e `shotlist.md` preenchidos antes do código.
- [ ] Atos: gancho ≤ 4 s, mecanismo em ≤ 3 passos, prova concreta, convite claro.
- [ ] Duração das cenas derivada de `narration.json` via `calculateMetadata`.
- [ ] Uma cena por arquivo; composição só encadeia.
- [ ] Câmera via `Camera`, push-ins lentos, cenas de leitura paradas.
- [ ] Continuidade de forma entre cenas e direção de tela fixa.
- [ ] Título/legenda dentro da área segura em todos os quadros-chave.
