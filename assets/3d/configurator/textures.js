/**
 * Texturas PBR dos materiais do catálogo — fotos reais (CC0, Poly Haven e
 * ambientCG) preparadas por assets/3d/dev/build_textures.py:
 *   assets/3d/textures/<material>/{color,normal,arm}.webp
 *   assets/3d/textures/<material>/floor-{color,normal,arm}.webp  (madeiras no piso: tábuas)
 * arm = AO (R), rugosidade (G), metal (B). Toda geometria configurável tem UV
 * em metros, então `repeat = 1 / size` deixa o material na escala real.
 * Carregadas sob demanda, com cache (a mesma textura serve a várias superfícies).
 */
import * as THREE from 'three';
import { TEXTURES } from './data/textures.js';

const BASE = 'assets/3d/textures';
const loader = new THREE.TextureLoader();
const cache = new Map();   // url → Promise<Texture>
const sets = new Map();    // chave do conjunto → Promise<set>
let maxAnisotropy = 1;
export function setAnisotropy(n) { maxAnisotropy = n; }

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function loadTexture(url, color) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((tex) => {
      tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAnisotropy;
      return tex;
    }));
  }
  return cache.get(url);
}

/** Qual variação usar: madeira no piso vira tábuas; no resto, lâmina com veio vertical. */
export function textureVariant(mat, surfaceId) {
  const info = TEXTURES[mat.id];
  return surfaceId === 'piso' && info?.floor ? 'floor' : 'base';
}

/**
 * Conjunto {map, normalMap, armMap, size, normalScale} de um material.
 * As texturas de um conjunto são compartilhadas (mesma escala) por todas as superfícies que o usam.
 */
export function loadTextureSet(mat, variant = 'base') {
  const key = `${mat.id}:${variant}`;
  if (!sets.has(key)) {
    const info = TEXTURES[mat.id];
    const prefix = `${BASE}/${mat.id}/${variant === 'floor' ? 'floor-' : ''}`;
    const size = variant === 'floor' ? info.floorSize : info.size;
    sets.set(key, Promise.all([
      loadTexture(`${prefix}color.webp`, true),
      loadTexture(`${prefix}normal.webp`, false),
      loadTexture(`${prefix}arm.webp`, false),
    ]).then(([map, normalMap, armMap]) => {
      [map, normalMap, armMap].forEach((t) => t.repeat.set(1 / size, 1 / size));
      return { key, map, normalMap, armMap, size, normalScale: info.normalScale };
    }));
  }
  return sets.get(key);
}

/** Miniatura da interface (foto real do material). */
export function swatchURL(mat) {
  return `${BASE}/${mat.id}/swatch.webp`;
}

/** Cor média do material (faixas de cor dos presets). */
export function meanColor(mat) {
  return TEXTURES[mat.id]?.mean || mat.base;
}

export async function disposeTextures() {
  const all = await Promise.allSettled([...cache.values()]);
  all.forEach((r) => r.value?.dispose());
  cache.clear();
  sets.clear();
}

// ---------------------------------------------------------------------------
// Texturas de cena (não configuráveis): arte nas paredes, letreiro do pedestal, chão.
// ---------------------------------------------------------------------------
export function artTexture(seed, palette) {
  const S = 256, c = document.createElement('canvas');
  c.width = S; c.height = Math.round(S * 1.3);
  const ctx = c.getContext('2d'), r = rng(seed);
  ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, c.width, c.height);
  // composição modernista: arcos, círculo e bloco — mesmo espírito das gravuras do vídeo
  ctx.fillStyle = palette[1];
  ctx.beginPath(); ctx.arc(S * (0.35 + r() * 0.3), c.height * 0.38, S * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = palette[2];
  ctx.beginPath(); ctx.ellipse(S * 0.5, c.height * 0.66, S * 0.32, S * 0.16, (r() - 0.5) * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = palette[3];
  ctx.fillRect(S * (0.15 + r() * 0.3), c.height * 0.12, S * 0.18, c.height * 0.28);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function plinthLabelTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '700 72px Poppins, Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d9b49f';
  ctx.fillText('match', 40, 66);
  const w = ctx.measureText('match').width;
  ctx.fillStyle = '#B0755A';
  ctx.fillText('.IA', 40 + w, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Chão escuro com linhas-guia em terracota que somem em direção às bordas. */
export function groundTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(46,40,36,1)'); g.addColorStop(0.55, 'rgba(26,23,21,1)'); g.addColorStop(1, 'rgba(18,16,15,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(176,117,90,0.55)';
  ctx.lineWidth = 2.4;
  const L = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  L([[110, 760], [290, 760], [290, 900]]);
  L([[930, 250], [760, 250], [760, 120]]);
  L([[640, 930], [900, 930]]);
  L([[120, 220], [120, 380]]);
  ctx.strokeStyle = 'rgba(176,117,90,0.25)';
  L([[180, 820], [470, 960]]);
  L([[860, 420], [960, 470]]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
