// Tokens da marca match.IA para vídeo. Fonte da verdade: :root de
// assets/css/style.css e PRODUCT.md (Brand Commitments). Se mudar lá, mude aqui.
import { Easing } from "remotion";

export const color = {
  bg: "#FAF9F6", // off-white quente — fundo padrão
  bgAlt: "#EEE3DA", // bege areia — superfícies, faixas
  sage: "#7B8E7E", // verde sálvia — lado do cliente / dado secundário
  sageDark: "#5F7060",
  terracotta: "#B0755A", // terracota — ação, destaque, lado do arquiteto
  terracottaDark: "#96603F",
  ink: "#333333", // grafite — texto
  inkSoft: "rgba(51,51,51,0.74)",
  line: "rgba(51,51,51,0.12)",
  sand: "#C9B9A6", // tom das pessoas no símbolo (mark.svg)
  white: "#FFFFFF",
  // tema escuro (cenas noturnas / encerramento) = modo escuro do site
  night: "#1C1B19",
  nightAlt: "#2A2723",
  nightInk: "#F0EDE8",
} as const;

// As duas curvas do site — e só elas — para manter a mesma assinatura de movimento.
export const ease = {
  out: Easing.bezier(0.2, 0.8, 0.2, 1), // = --ease-out: entradas, reveals, câmera
  spring: Easing.bezier(0.34, 1.56, 0.64, 1), // = --ease-spring: só peças pequenas (chips, ícones)
  inOut: Easing.bezier(0.65, 0, 0.35, 1), // saídas e trocas de cena (simétrica)
} as const;

// Durações em segundos; converta com sec(fps, s).
export const dur = {
  micro: 0.2, // pop de chip, tick
  reveal: 0.55, // entrada de bloco/título
  stagger: 0.07, // atraso entre itens de uma lista
  hold: 1.2, // mínimo parado na tela para ler uma linha curta
  sceneSwap: 0.6, // troca de cena (transição)
  camera: 1.2, // movimento de câmera / reenquadramento
} as const;

export const sec = (fps: number, s: number) => Math.round(fps * s);

// Formatos de entrega. 16:9 é o do site; 9:16 e 1:1 só para redes sociais.
export const format = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

// Área segura: título/legenda nunca fora dela (5% lateral, 7% vertical).
export const safe = (w: number, h: number) => ({ x: Math.round(w * 0.05), y: Math.round(h * 0.07) });

export const radius = { sm: 8, md: 16, lg: 28 } as const;
