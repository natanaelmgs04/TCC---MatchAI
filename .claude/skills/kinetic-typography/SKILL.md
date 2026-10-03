---
name: kinetic-typography
description: Use ao animar texto em vídeos do match.IA (workspace video/, Remotion) — títulos, frases de impacto, legendas, rótulos, palavras sincronizadas com a narração, text reveals com máscara, tracking/kerning, escala, rotação, opacidade e ritmo. Aplica a tipografia da marca (Playfair Display, Inter, Poppins) com tamanhos e regras de leitura para 1080p. Não use para números/gráficos (motion-graphs-and-charts) nem para o wordmark/logo (premium-brand-motion).
---

# Tipografia cinética — match.IA

Texto em vídeo existe para ser **lido no tempo que fica na tela**. Toda animação de texto é subordinada a isso: entrar rápido, ficar parado o suficiente, sair sem disputar atenção com o próximo.

## Quando usar

- Título de cena, frase-tema ("Dois lados, *um match*"), rótulos de capítulo ("Para você, cliente · 01").
- Legendas da narração e palavras-chave destacadas no ritmo da fala.
- Revisar legibilidade de um vídeo pronto.

## Tipografia da marca (de `video/src/brand/fonts.ts`)

| papel | fonte | peso | uso |
|---|---|---|---|
| display | **Playfair Display** | 600 (700 raro) · *itálico 500/600 = ênfase* | títulos, frase-tema, citações |
| corpo | **Inter** | 400/500 texto · 600/700 rótulos | legendas, explicações, UI |
| marca | **Poppins** | 600/700 | só wordmark "match.IA" e selos curtos |

Ênfase segue o site: a palavra-chave do título em **Playfair itálico + terracota** (`<em style={{ color: color.terracotta }}>`). No máximo **uma** ênfase por título.

## Escala para 1920×1080 (assistido em notebook e em projetor)

| elemento | tamanho | entrelinha | tracking |
|---|---|---|---|
| frase-tema / hero | 120–160 px Playfair 600 | 1.0–1.05 | −0.02em |
| título de cena | 80–96 px Playfair 600 | 1.08 | −0.015em |
| subtítulo | 40–48 px Inter 500 | 1.3 | 0 |
| legenda (narração) | 38–44 px Inter 500 | 1.35 | 0 |
| rótulo / kicker em caixa alta | 22–26 px Inter 600 | 1.2 | +0.08 a +0.12em |
| texto mínimo absoluto | 28 px | — | — |

- Linha de leitura ≤ 42 caracteres (legenda ≤ 2 linhas). Quebre por sentido, não por largura.
- Display grande pede tracking **negativo**; caixa alta pequena pede tracking **positivo**. Nunca o contrário.
- Kerning: `fontKerning: "normal"` e `fontFeatureSettings: '"kern" 1, "liga" 1'`; números que mudam: `fontVariantNumeric: "tabular-nums"` (senão o texto "treme").
- Acentos do pt-BR: o subset `latin` já cobre á ã ç é ê í ó õ ú. Confira "ção", "â" e "Ó" maiúsculo em um still.
- Contraste: texto `color.ink` sobre `color.bg` / `color.bgAlt`; sobre foto, sempre com faixa ou gradiente de apoio (≥ 4.5:1).

## Tempo de leitura (regra dura)

`tempo mínimo na tela (s) = 0,5 + caracteres / 15`. Título de 30 caracteres → 2,5 s parado e legível (sem contar entrada/saída). Se a narração for mais curta que isso, encurte o texto — não acelere a leitura.

## Técnicas de reveal (Remotion)

Toda animação vem de `useCurrentFrame()` + `interpolate()` com as curvas de `tokens.ts`. **CSS `transition`/`animation` não renderizam.** Use as propriedades `translate`, `scale`, `rotate` (não `transform`) para o Studio conseguir editar.

### 1. Linha subindo por máscara (padrão para títulos)

```tsx
// src/components/MaskLine.tsx
import { interpolate, useCurrentFrame } from "remotion";
import { ease } from "../brand/tokens";
export const MaskLine: React.FC<{ at: number; len?: number; children: React.ReactNode }> = ({ at, len = 16, children }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.out });
  return (
    <div style={{ overflow: "hidden", paddingBottom: "0.12em" /* não corta descendentes: g, j, p, ç */ }}>
      <div style={{ translate: `0 ${(1 - p) * 105}%` }}>{children}</div>
    </div>
  );
};
```

Títulos de 2 linhas: uma `MaskLine` por linha com 3–4 quadros de atraso.

### 2. Palavra por palavra (frase-tema, ≤ 8 palavras)

Cada palavra: `opacity` 0→1 e `translate` 0.35em→0, 12 quadros, stagger 3 quadros. A palavra de ênfase entra **por último** e com 4 quadros a mais de duração.

### 3. Letra por letra — só para palavras curtas de marca

Permitido em "match.IA" ou numa palavra de até ~8 letras, com stagger de 1 quadro. Proibido em frase (fica lento e "efeito de IA").

### 4. Sublinhado que se desenha (destaque de termo)

Um `<div>` absoluto embaixo da palavra com `scale` X 0→1 (`transformOrigin: "left"`), cor terracota, 3 px, 14 quadros, começando quando a palavra termina de entrar.

### 5. Troca de palavra (A → B no mesmo lugar)

Palavra antiga sobe e some (8 q, `ease.inOut`), nova sobe da máscara (12 q, `ease.out`), sobreposição de 2 quadros. Reserve largura com a palavra mais longa para o resto da linha não pular.

### 6. Escala e rotação

- Escala: entrar de 0.96→1 junto com a opacidade (nunca de 0). Em `scale` use `output: "perceptual-scale"` quando for uma animação longa.
- Rotação: no máximo ±2° em rótulo/selo. Texto principal não gira.

### Saídas

Mais curtas que a entrada (~70%), `ease.inOut`, todas as linhas juntas (ou de baixo para cima com 2 q de atraso). Nunca deixe o texto antigo na tela quando o novo começa a entrar no mesmo lugar.

## Sincronizar com a narração

- `narration.json` dá **início e duração por fala** (não por palavra). Para legenda por frase isso basta: mostre a fala inteira de `start` até `start + dur`, dividida em blocos de ≤ 2 linhas proporcionais ao número de caracteres.
- Para destacar **palavras** no tempo exato da voz: o `edge-tts` instalado (7.2.8) aceita `boundary="WordBoundary"` em `edge_tts.Communicate(...)`, que devolve o tempo de cada palavra. Estenda `assets/audio/dev/build_narration.py` para gravar `words: [{t, d, w}]` no `narration.json` — sem rodar Whisper.
- Whisper (`@remotion/openai-whisper` / whisper.cpp) é alternativa, mas o binário não é assinado e provavelmente será bloqueado pelo Smart App Control desta máquina (o mesmo motivo do FFmpeg) — prefira o `WordBoundary`.
- Para legendas no estilo TikTok/karaokê use a skill oficial `remotion-captions` (`createTikTokStyleCaptions`), alimentando com os tempos do `WordBoundary`.
- O destaque visual chega **2–4 quadros antes** da palavra falada.

## Hierarquia tipográfica numa cena

1. Kicker (pequeno, caixa alta, sálvia ou terracota) entra primeiro e fica discreto.
2. Título (herói) entra 4–6 quadros depois.
3. Apoio (subtítulo/legenda) só depois que o título parou.
No máximo **3 níveis** por cena.

## Medir texto

Para caber numa caixa ou alinhar a outro elemento, use `@remotion/layout-utils` (`measureText`, `fitText`) — instale com `npx remotion add @remotion/layout-utils` quando precisar. Meça **depois** de a fonte carregar (as fontes de `fonts.ts` já bloqueiam o render até carregar).

## Erros a evitar

- Fonte fora da marca (nem "só para este título").
- Texto pequeno demais (< 28 px) ou linhas longas demais.
- Frase inteira letra por letra; texto girando/3D; texto com glow ou sombra pesada.
- Blur animado em texto como transição (fica "barato" e pesa no render).
- Duas ênfases no mesmo título; ênfase em sálvia (sálvia é cor de apoio).
- Legenda que muda no meio da palavra falada.
- Texto que treme porque o número muda de largura (falta `tabular-nums`).

## Checklist

- [ ] Só Playfair / Inter / Poppins, nos pesos de `fonts.ts`.
- [ ] Tamanhos dentro da tabela; nada abaixo de 28 px.
- [ ] Cada texto fica parado ≥ `0,5 + caracteres/15` s.
- [ ] Máscara com `paddingBottom` (descendentes não cortados).
- [ ] Uma ênfase por título, em Playfair itálico terracota.
- [ ] Sincronia: destaque 2–4 q antes da palavra.
- [ ] Still conferido com acentos (ç, ã, é, Ó).
