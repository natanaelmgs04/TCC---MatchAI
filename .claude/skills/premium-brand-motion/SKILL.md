---
name: premium-brand-motion
description: Use para traduzir a identidade do match.IA em linguagem de movimento nos vídeos (workspace video/, Remotion) — logo reveal do símbolo (mark.svg) e do wordmark "match.IA", aberturas e encerramentos, transições de marca entre capítulos, uso de cores/formas/tipografia da marca, identidade sonora e consistência entre cenas e entre vídeos. Use sempre que um vídeo mostrar o logo ou precisar "parecer da marca".
---

# Motion de marca — match.IA

O vídeo tem que parecer **feito para o match.IA**, não um template com o logo colado no fim. Isso vem de usar as formas que o símbolo já tem como vocabulário de movimento do vídeo inteiro.

## Quando usar

- Abertura, encerramento, vinheta, logo reveal.
- Transição entre capítulos (cliente → arquiteto).
- Revisar se uma cena "parece da marca".
- Criar versões curtas (redes) mantendo a identidade.

## Identidade (fonte: `PRODUCT.md` → Brand Commitments, `assets/css/style.css`)

- Nome: **match.IA** (sempre minúsculo, ponto e "IA" maiúsculo; ".IA" em terracota).
- Paleta: off-white `#FAF9F6` · areia `#EEE3DA` · sálvia `#7B8E7E` · terracota `#B0755A` · grafite `#333333` (+ `#C9B9A6`, tom da pessoa-cliente no símbolo). Tokens em `video/src/brand/tokens.ts`.
- Tipos: Playfair Display (títulos), Inter (texto), Poppins 700 (wordmark).
- Superfícies do site: vidro fosco (glassmorphism / liquid glass), cantos 8/16/28 px.
- Movimento do site: `--ease-out cubic-bezier(.2,.8,.2,1)` e `--ease-spring` só em peças pequenas — `ease.out`/`ease.spring` em `tokens.ts`.
- Assets: `npm run sync` copia `assets/img/mark.svg`, `mark.png`, `mark-light.png` (versão para fundo escuro), `logo-full.png` para `public/site/img/` → `staticFile("site/img/mark.svg")`.

## Anatomia do símbolo (`assets/img/mark.svg`, viewBox 120×120)

| peça | geometria | cor | significado |
|---|---|---|---|
| arco esquerdo | `M20 66 A40 40 0 0 1 60 20` | sálvia | o lado do cliente |
| arco direito | `M60 20 A40 40 0 0 1 100 66` | terracota | o lado do arquiteto |
| ponto do topo | círculo (60,20) r 3.4 | grafite | **o match** (onde os arcos se encontram) |
| pontos das pontas | (20,66) sálvia · (100,66) terracota | — | início de cada lado |
| pessoa esquerda | cabeça (27,70) + ombros | `#C9B9A6` | cliente |
| pessoa direita | cabeça (93,70) + ombros | terracota | arquiteto |
| casa | `M60 34 L86 58 L86 102 L34 102 L34 58 Z` + eixo central + porta | grafite | arquitetura / o projeto |
| circuito | `M62 60 L70 60 L70 70 L76 70 L76 80` + 3 nós | sálvia | a IA |

**Não use o PNG para animar** — recrie o SVG inline num componente `Mark` com cada peça separada, para animar peça por peça. Mantenha as coordenadas exatas (é o logo).

## Logo reveal padrão (~2,4 s a 30 fps)

A história do símbolo é a história do produto — o reveal conta isso:

| quadros | evento | técnica |
|---|---|---|
| 0–10 | pontos das pontas aparecem (sálvia à esq., terracota à dir.) | `scale` 0.6→1 + opacity, `ease.spring` (peça pequena) |
| 6–30 | os dois arcos se desenham **das pontas para o topo**, ao mesmo tempo | `evolvePath` de `@remotion/paths`, `ease.out` |
| 28–36 | ponto grafite do topo "acende" quando os arcos se tocam | scale 0→1, `ease.spring` |
| 30–50 | casa se desenha (contorno → eixo → porta) | `evolvePath`, stagger 4 q |
| 40–56 | pessoas aparecem (esq. depois dir., 4 q) | opacity + translate 6 px vindo do lado de cada uma |
| 50–62 | circuito se desenha, nós acendem em sequência | `evolvePath` + scale nos nós |
| 56–72 | wordmark "match" sobe por máscara; ".IA" entra 4 q depois em terracota | ver `kinetic-typography` (MaskLine) |
| 72+ | hold ≥ 1,2 s com tudo parado | — |

Os arcos que se encontram no topo são o **motivo da marca**: reutilize "duas linhas convergindo num ponto" em transições, no diagrama do match e no final.

```tsx
import { evolvePath } from "@remotion/paths";
const arcL = "M20 66 A40 40 0 0 1 60 20";
const pL = interpolate(frame, [6, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.out });
const { strokeDasharray, strokeDashoffset } = evolvePath(pL, arcL);
<path d={arcL} stroke={color.sage} strokeWidth={4.5} strokeLinecap="round" fill="none"
  strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
```

Versão curta (redes, ≤ 1 s): só arcos + ponto + wordmark.

## Fundo claro × escuro

- Padrão: símbolo colorido sobre `color.bg`.
- Encerramento/noite: fundo `color.night`; grafite do símbolo vira `color.nightInk`; sálvia e terracota se mantêm (use os tons claros do tema escuro do site se o contraste cair: sálvia `#8FA391`, terracota `#C68868`). Equivalente a `mark-light.png`.
- Nunca: logo sobre foto sem faixa de apoio, logo com sombra/glow, logo distorcido, outline ou recolorido em uma cor só (exceto versão monocromática `color.nightInk` em marca d'água).

## Elementos gráficos derivados (vocabulário do vídeo)

- **Arco** de 90° (raio 40 na escala do símbolo) como divisor, moldura ou caminho de transição.
- **Ponto** grafite/terracota como marcador de destaque (no lugar de setas genéricas).
- **Traço fino de prancha** (2 px, grafite 40%) para diagramas e "IA trabalhando".
- **Painel de vidro**: superfície clara translúcida com borda 1 px branca 60% e sombra `0 24px 60px rgba(51,51,51,.16)` — ver `video-compositing` para fazê-lo sem `backdrop-filter` no render local.
- **Gradiente da marca** `sálvia → terracota` (100°) só em barra de progresso/medidor, nunca em fundo inteiro.

## Transições de marca

- **Convergência**: dois elementos (um de cada lado) deslizam para o centro e se tocam num ponto → corte para a próxima cena a partir desse ponto. Use entre capítulos.
- **Arco wipe**: um arco grande sálvia ou terracota varre a tela no sentido esquerda→direita (cliente → arquiteto), revelando a cena seguinte por trás.
- No máximo uma transição de marca por minuto de vídeo; o resto é corte/fade simples.

## Identidade sonora (quando houver trilha)

- Vozes já definidas: **Thalita** (`pt-BR-ThalitaMultilingualNeural`) = match.IA; **Antonio** = "você" (`assets/audio/dev/build_narration.py`). Não troque as vozes entre vídeos.
- Trilha: acústica/minimal, piano ou cordas leves, 80–100 BPM, sem drops. Volume da trilha −18 a −22 dB abaixo da voz (ducking durante falas).
- "Assinatura" do logo: um único som curto e quente (toque de madeira/sino suave) no quadro em que o ponto do topo acende. Sem whoosh em toda transição.
- Só use música/efeitos com licença que permita uso (ex.: bibliotecas royalty-free com atribuição registrada em `video/production/<slug>/brief.md`). Nunca faixa comercial.
- Volume final da mixagem: ≈ −16 LUFS integrado (web), pico ≤ −1 dBTP — ver `motion-performance`.

## Consistência entre cenas e vídeos

- Valores só de `tokens.ts`/`fonts.ts` — nenhum hex ou fonte solta no componente.
- Mesmo reveal de logo e mesmo encerramento em todos os vídeos (crie `components/LogoReveal.tsx` e `components/EndCard.tsx` uma vez).
- Mesmos kickers ("Para você, cliente · 01") e mesma posição de título em todas as cenas de um vídeo.
- Revisão final: coloque stills de 4–6 cenas lado a lado — devem parecer uma família.

## Erros a evitar

- Logo só no final, sem nenhuma relação com o resto do vídeo.
- Animar o PNG inteiro (scale/fade) em vez das peças do símbolo.
- Mudar coordenadas, proporções ou cores do símbolo.
- Gradientes, brilhos ou partículas "tech" que não são da marca.
- Wordmark em outra fonte que não Poppins, ou "Match.IA"/"MATCH.IA".

## Checklist

- [ ] Símbolo recriado inline com as coordenadas de `mark.svg`, animado peça por peça.
- [ ] Reveal conta a história: lados → encontro no topo → casa → pessoas → IA → nome.
- [ ] Cores e fontes só dos tokens; ".IA" em terracota.
- [ ] Motivo dos arcos convergentes reaparece em transições/diagramas.
- [ ] Versão de fundo escuro com contraste conferido.
- [ ] Trilha/efeitos licenciados e registrados; vozes Thalita/Antonio mantidas.
- [ ] Stills das cenas lado a lado parecem da mesma família.
