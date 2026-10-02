/**
 * Hora do dia (minutos) → luz da cena: direção e cor do sol, céu/chão da luz
 * hemisférica, intensidade do ambiente, exposição, luminárias e a cor do
 * céu atrás da maquete (CSS). Interpola entre quadros-chave, sem degraus,
 * para o arraste do sol ser contínuo.
 */
import * as THREE from 'three';

// [minuto, sol(cor), sol(intensidade), céu, chão, hemi, ambiente, exposição, luminárias, céuCSS topo, céuCSS base]
const KEYS = [
  [360,  '#ffb98a', 0.6, '#9fb2c9', '#3a3129', 0.5,  0.32, 0.95, 0.35, '#7d8396', '#211e1c'],
  [450,  '#ffd9b0', 2.0, '#c4d3e2', '#4a3e33', 0.62, 0.5,  1.0,  0.0,  '#b9b5b2', '#2a2622'],
  [765,  '#fff6ea', 3.0, '#dfe8f1', '#5b4f43', 0.72, 0.62, 1.02, 0.0,  '#d4d0ca', '#2c2824'],
  [1020, '#ffd7a8', 2.4, '#cfc3b6', '#58463a', 0.6,  0.52, 1.0,  0.0,  '#cbb7a3', '#2a241f'],
  [1110, '#ffb070', 1.9, '#b9a08b', '#4e3a2c', 0.5,  0.42, 1.0,  0.55, '#b98e70', '#231d19'],
  [1170, '#ff8f5a', 0.7, '#7d7486', '#33281f', 0.36, 0.26, 1.0,  0.9,  '#6f6176', '#1b1716'],
  [1260, '#6f86c8', 0.22, '#3b4560', '#1a1716', 0.2,  0.12, 1.05, 1.0,  '#2c3348', '#131211'],
  [1350, '#6f86c8', 0.18, '#2f3850', '#151312', 0.16, 0.1,  1.05, 1.0,  '#20263a', '#100f0e'],
];

const c1 = new THREE.Color(), c2 = new THREE.Color();
const MOON = new THREE.Vector3(-0.35, 0.85, -0.4).normalize();
const lerp = (a, b, t) => a + (b - a) * t;

function mixHex(a, b, t, out) {
  c1.set(a); c2.set(b);
  return out.copy(c1).lerp(c2, t);
}

export function sample(minutes) {
  let i = 0;
  while (i < KEYS.length - 2 && minutes > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (minutes - a[0]) / (b[0] - a[0])));
  const smooth = t * t * (3 - 2 * t);
  return {
    sunColor: mixHex(a[1], b[1], smooth, new THREE.Color()),
    sunIntensity: lerp(a[2], b[2], smooth),
    sky: mixHex(a[3], b[3], smooth, new THREE.Color()),
    ground: mixHex(a[4], b[4], smooth, new THREE.Color()),
    hemi: lerp(a[5], b[5], smooth),
    env: lerp(a[6], b[6], smooth),
    exposure: lerp(a[7], b[7], smooth),
    lamps: lerp(a[8], b[8], smooth),
    cssTop: `#${mixHex(a[9], b[9], smooth, new THREE.Color()).getHexString()}`,
    cssBottom: `#${mixHex(a[10], b[10], smooth, new THREE.Color()).getHexString()}`,
    sunDir: sunDirection(minutes),
    // vista pelas janelas: 0 = cidade de dia, 1 = luzes da noite; brilho acompanha o céu
    night: Math.max(0, Math.min(1, (minutes - 1110) / 120)),
    viewBright: lerp(a[6], b[6], smooth) * 1.9 + 0.12,
  };
}

/**
 * O sol passa por trás da parede dos fundos (onde ficam as janelas), da
 * esquerda de manhã para a direita no fim da tarde, e entra baixo pelas
 * aberturas no fim do dia — é o que desenha as faixas de luz no piso.
 * Depois das 19h30 a mesma luz vira "lua", alta e fria.
 */
export function sunDirection(minutes) {
  const p = Math.max(0, Math.min(1, (minutes - 360) / (1170 - 360)));
  const theta = lerp(-1.25, 1.2, p);
  const elevation = 0.18 + Math.sin(p * Math.PI) * 0.95;
  const sun = new THREE.Vector3(Math.sin(theta) * Math.cos(elevation), Math.sin(elevation), -Math.cos(theta) * Math.cos(elevation));
  const w = Math.max(0, Math.min(1, (minutes - 1170) / 90));
  return sun.lerp(MOON, w * w * (3 - 2 * w)).normalize();
}
