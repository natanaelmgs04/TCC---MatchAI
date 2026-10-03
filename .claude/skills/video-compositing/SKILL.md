---
name: video-compositing
description: Use ao compor camadas em vídeos do match.IA (workspace video/, Remotion) — máscaras, layers, ordem de empilhamento, blend modes, overlays, profundidade/parallax, painéis de vidro, composição de fotos e vídeo, integração de 3D (GLBs do site), texto e gráficos sobre imagem, motion blur e efeitos de câmera. Conhece as limitações do "Render in browser" (único render de MP4 que funciona nesta máquina) e como contorná-las.
---

# Composição de vídeo — match.IA

Composição é decidir **o que fica na frente de quê, com quanta luz e foco**, para o olho achar o herói sem esforço. No Remotion cada camada é um elemento React; a ordem no JSX é a ordem de empilhamento.

## Quando usar

- Montar uma cena com fundo + foto + painel + texto + gráfico.
- Criar profundidade (parallax, desfoque de fundo), vidro, sobreposições, máscaras.
- Integrar vídeo, fotos ou 3D. Adicionar motion blur ou efeitos de câmera.

## Restrição que manda em tudo: como o MP4 é gerado aqui

Nesta máquina o **Smart App Control do Windows bloqueia o `ffmpeg.exe`** do Remotion, então `npx remotion render` (render no servidor) **não consegue gerar MP4** localmente — gera stills e sequências de imagem, mas falha na hora de juntar. O MP4 sai pelo **"Render in browser"** do Studio (`npm run dev` → botão "Render in browser"; codifica com WebCodecs, testado: H.264 1920×1080 com áudio). Esse modo **não suporta**:

| não funciona no render pelo navegador | use no lugar |
|---|---|
| `backdrop-filter` (vidro "de verdade") | **vidro falso**: cópia desfocada do fundo recortada na forma do painel (abaixo) |
| `mix-blend-mode`, `background-blend-mode` | camada de cor com `opacity` por cima; ou pré-processar a imagem (Pillow) |
| `z-index` | ordem dos elementos no JSX |
| `perspective`, `transform-style: preserve-3d` | profundidade com `scale` + parallax; 3D real via `@remotion/three` |
| máscara SVG, máscara de luminância, múltiplas máscaras | `overflow: hidden` + `borderRadius`, `clipPath` (`inset()`, `circle()`, `polygon()`), ou máscara `linear-gradient` simples |
| `object-position` | posicione a `<Img>` num contêiner com `overflow:hidden` e `translate` |
| `box-shadow` inset / spread | sombra externa simples, ou camada de gradiente |
| `<OffthreadVideo>`, `<Html5Audio>`, `<Html5Video>` | `<Video>` e `<Audio>` de `@remotion/media` |

Se um efeito da lista for **essencial**, a cena só pode ser renderizada por `npx remotion render` num ambiente sem esse bloqueio (outro PC, ou GitHub Actions — ver `motion-performance`). Decida isso **antes** de compor a cena, não depois.

Antes de usar uma propriedade CSS nova, confira em https://www.remotion.dev/docs/client-side-rendering/limitations (append `.md` para ler em texto).

## Ordem de camadas (de trás para frente)

1. **Fundo**: `color.bg`/`color.bgAlt`, gradiente radial de luz, textura de grão (PNG 3–5% de opacidade).
2. **Ambiente**: fotos/blocos desfocados, formas da marca grandes e suaves (arcos).
3. **Apoio**: painéis, cards, gráficos.
4. **Herói**: o elemento da cena (número, card, símbolo).
5. **Texto**: título/legenda (sempre legível — com faixa se estiver sobre foto).
6. **Acabamento**: vinheta, grão global, light leak sutil.

Cada nível fica num `AbsoluteFill` próprio — isso também facilita parallax e saídas.

## Profundidade e parallax

- O mesmo movimento de câmera aplicado com fatores: fundo 0.3×, ambiente 0.6×, apoio 0.85×, herói/texto 1×.
- Foco: o que não é herói ganha `filter: blur(4–8px)` + opacidade 0.6–0.8 (DOF falso). `filter` funciona no render pelo Chrome.
- Escala comunica distância: elemento "longe" menor e mais claro (mais perto da cor do fundo).
- Sombras com a direção de luz consistente em todo o vídeo (luz de cima/esquerda → sombra para baixo/direita).

## Vidro (identidade do site) sem `backdrop-filter`

```tsx
// Vidro falso: o fundo desfocado só aparece dentro do painel.
// bg = mesma imagem/camada do fundo, posicionada igual ao fundo da cena.
<div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 28, overflow: "hidden",
  boxShadow: "0 24px 60px rgba(51,51,51,.16)", outline: "1px solid rgba(255,255,255,.6)", outlineOffset: -1 }}>
  <Img src={bg} style={{ position: "absolute", left: -x, top: -y, width: W, height: H, filter: "blur(18px) saturate(1.1)", scale: "1.06" }} />
  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.55)" }} />
  <div style={{ position: "relative", padding: 32 }}>{children}</div>
</div>
```

O fundo dentro do painel deve se mover junto com o fundo da cena (mesmo `translate` da câmera), senão o vidro "descola". Para fundo liso (`color.bg`), basta `rgba(255,255,255,.6)` + borda + sombra.

## Máscaras e recortes

- Revelar texto/foto: contêiner com `overflow: hidden` e o conteúdo se deslocando dentro (ver `kinetic-typography`).
- Wipe de foto: `clipPath: inset(0 ${100 - p * 100}% 0 0)` (esquerda → direita = cliente → arquiteto).
- Revelar em círculo a partir do ponto do símbolo: `clipPath: circle(${r}% at 50% 18%)`.
- Formas da marca (arco) como máscara: desenhe o arco por cima com a cor do fundo em vez de máscara SVG.

## Fotos e vídeo

- Fotos: `<Img src={staticFile("site/img/photos/...webp")} />` (sincronizadas por `npm run sync`). `<Img>` espera carregar antes do quadro.
- Enquadre fotos com `objectFit: "cover"` num contêiner com `overflow: hidden`; reenquadre com `translate`/`scale` (Ken Burns lento: 1.0→1.05 em 4–6 s, `ease.out`).
- Graduação quente da marca: camada `color.terracotta` a 6–10% de opacidade por cima (substitui blend mode).
- Vídeo: `<Video>` de `@remotion/media` (já instalado). Prefira clipes curtos, H.264, 1080p; corte com `trimBefore`/`trimAfter`.
- Créditos de foto Unsplash: `assets/img/photos/CREDITS.md` — se a foto aparecer no vídeo, o crédito vai na descrição/página.

## Texto e gráficos sobre imagem

- Sempre uma camada de apoio: faixa `color.bg` a 85–92% ou gradiente linear do lado do texto (de `rgba(250,249,246,.95)` a transparente).
- Gráficos sobre foto ficam dentro de um painel (vidro falso), nunca soltos.

## Integração de 3D

- O site tem GLBs otimizados em `assets/3d/` (Draco). No vídeo, use `@remotion/three` (`<ThreeCanvas>`) — instale com `npx remotion add @remotion/three` mais `three` e `@react-three/fiber` **na mesma versão de three do site** (r186.x). Veja a skill oficial `remotion-markup` → `3d.md` e `threejs-architectural-visualizer` para luz/materiais.
- Câmera 3D animada por `useCurrentFrame()` (nunca `useFrame`/clock do R3F — não é determinístico).
- Esta máquina tem GPU integrada (Intel Iris Xe) e 7,7 GB de RAM: cenas 3D pesadas renderizam devagar. Alternativa: pré-renderizar o 3D como sequência PNG (`npm run frames` numa composição só do 3D) e compor as imagens.
- Confirme que `<ThreeCanvas>` renderiza no "Render in browser" com um teste curto antes de planejar uma cena 3D longa.

## Motion blur e câmera

- `@remotion/motion-blur` (instalado): `<CameraMotionBlur samples={6} shutterAngle={180}>` só em movimentos **rápidos** (wipes, entradas de longe). Custa N renders por quadro — aplique na cena, não no vídeo inteiro.
- `<Trail>` só para um efeito pontual de rastro; não como estilo.
- Efeitos de câmera aceitáveis: push-in lento, pan motivado, leve "respiração" (escala 1.000↔1.008 em 4 s) em cena parada longa. Nada de shake, roll ou zoom rápido.
- Light leak: a skill oficial `remotion-markup` (`light-leaks.md`) mostra o componente; use 1 vez, na abertura ou no final, em tom quente.

## Erros a evitar

- Usar `backdrop-filter`/blend mode e só descobrir no render que não saiu.
- Vidro cujo fundo não acompanha o movimento da cena.
- Texto direto sobre foto sem apoio.
- Blur em tudo (fica lavado) ou blur animado como transição padrão.
- Motion blur ligado no vídeo inteiro (render 6× mais lento sem ganho).
- 3D só para "ter 3D", sem papel na história.

## Checklist

- [ ] Nenhuma propriedade da tabela de limitações (ou a cena está marcada para render no servidor/CI).
- [ ] Camadas na ordem fundo → ambiente → apoio → herói → texto → acabamento.
- [ ] Parallax com fatores consistentes; DOF falso só no que não é herói.
- [ ] Vidro falso acompanhando o fundo; borda e sombra da marca.
- [ ] Texto sobre imagem com camada de apoio e contraste ≥ 4.5:1.
- [ ] Motion blur só em movimentos rápidos; 3D testado no render pelo navegador.
