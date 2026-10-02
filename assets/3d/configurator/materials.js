/**
 * Um MeshStandardMaterial PBR por superfície configurável (cor + relevo +
 * AO/rugosidade de fotos reais), com um "patch" de shader que faz a troca de
 * material como no vídeo de referência: o novo material se espalha em onda a
 * partir do ponto onde a amostra foi solta, com um anel de luz na frente da
 * onda. Fora do raio continua o material antigo (cor, relevo e rugosidade);
 * dentro, o novo. uOldScale corrige a escala quando os dois têm tamanhos
 * físicos diferentes (ex.: tábua de 1,8 m → linho de 27 cm).
 *
 * Também carrega o realce de "superfície sob o cursor" (uHover) usado no arraste.
 */
import * as THREE from 'three';

const VERT_DECL = 'varying vec3 vRevealPos;\n';
const FRAG_DECL = `
varying vec3 vRevealPos;
uniform float uRevealActive;
uniform vec3 uRevealCenter;
uniform float uRevealRadius;
uniform sampler2D uOldMap;
uniform sampler2D uOldNormalMap;
uniform sampler2D uOldArmMap;
uniform float uOldScale;
uniform vec3 uEdgeColor;
uniform float uHover;
uniform vec3 uHoverColor;
`;

export function createSurfaceMaterial(surfaceId, set) {
  const material = new THREE.MeshStandardMaterial({
    name: `surf-${surfaceId}`,
    map: set.map,
    normalMap: set.normalMap,
    normalScale: new THREE.Vector2(set.normalScale, set.normalScale),
    roughnessMap: set.armMap,
    aoMap: set.armMap,
    aoMapIntensity: 0.9,
    roughness: 1,
    metalness: 0,
  });
  const uniforms = {
    uRevealActive: { value: 0 },
    uRevealCenter: { value: new THREE.Vector3() },
    uRevealRadius: { value: 0 },
    uOldMap: { value: set.map },
    uOldNormalMap: { value: set.normalMap },
    uOldArmMap: { value: set.armMap },
    uOldScale: { value: 1 },
    uEdgeColor: { value: new THREE.Color('#ffe9d8') },
    uHover: { value: 0 },
    uHoverColor: { value: new THREE.Color('#B0755A') },
  };
  material.userData.reveal = uniforms;
  material.userData.set = set;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vRevealPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        float rDist = distance(vRevealPos, uRevealCenter);
        float rMix = uRevealActive > 0.5 ? 1.0 - smoothstep(uRevealRadius - 0.06, uRevealRadius, rDist) : 1.0;
        vec4 rOld = texture2D(uOldMap, vMapUv * uOldScale);
        diffuseColor.rgb = mix(rOld.rgb * diffuse, diffuseColor.rgb, rMix);
      `)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughness * texture2D(uOldArmMap, vRoughnessMapUv * uOldScale).g, roughnessFactor, rMix);
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = mix(texture2D(uOldNormalMap, vNormalMapUv * uOldScale).xyz, texture2D(normalMap, vNormalMapUv).xyz, rMix) * 2.0 - 1.0;
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);
      `)
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float rEdge = uRevealActive > 0.5 ? 1.0 - smoothstep(0.0, 0.09, abs(rDist - uRevealRadius)) : 0.0;
        totalEmissiveRadiance += uEdgeColor * rEdge * 1.6 + uHoverColor * uHover;
      `);
  };
  material.customProgramCacheKey = () => 'match-reveal-pbr-v2';
  return material;
}

function applySet(material, set) {
  material.map = set.map;
  material.normalMap = set.normalMap;
  material.normalScale.set(set.normalScale, set.normalScale);
  material.roughnessMap = set.armMap;
  material.aoMap = set.armMap;
  material.userData.set = set;
}

/**
 * Troca o conjunto de texturas da superfície. Com `origin`, anima a onda
 * (GSAP); sem `origin` (ou motion reduzido), troca na hora.
 */
export function changeSurfaceMaterial(material, set, { origin, radius = 14, duration = 1.15, delay = 0, gsap, onUpdate, reduceMotion }) {
  const u = material.userData.reveal;
  const old = material.userData.set;
  gsap?.killTweensOf(u.uRevealRadius);
  const settle = () => {
    u.uRevealActive.value = 0;
    u.uOldMap.value = set.map; u.uOldNormalMap.value = set.normalMap; u.uOldArmMap.value = set.armMap;
    u.uOldScale.value = 1;
    onUpdate?.();
  };
  applySet(material, set);
  if (!origin || reduceMotion || !gsap || !old || old === set) { settle(); return; }
  // O "antigo" é o que estava na tela (mesmo se outra onda ainda corria).
  u.uOldMap.value = old.map; u.uOldNormalMap.value = old.normalMap; u.uOldArmMap.value = old.armMap;
  u.uOldScale.value = set.size / old.size;
  u.uRevealCenter.value.copy(origin);
  u.uRevealRadius.value = 0;
  u.uRevealActive.value = 1;
  onUpdate?.();
  gsap.to(u.uRevealRadius, { value: radius, duration, delay, ease: 'power2.inOut', onUpdate, onComplete: settle });
}

export function setHover(material, amount) {
  material.userData.reveal.uHover.value = amount;
}

/** Materiais fixos da cena (não configuráveis). */
export function sceneMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    plinth: std({ name: 'plinth', color: '#1b1918', roughness: 0.82 }),
    plinthRim: std({ name: 'plinth-rim', color: '#e9e2d6', roughness: 0.7 }),
    section: std({ name: 'section', color: '#efebe4', roughness: 0.9 }),                 // topo das paredes cortadas
    baseboard: std({ name: 'baseboard', color: '#ece8e1', roughness: 0.45 }),
    frame: std({ name: 'frame', color: '#1d1d1f', roughness: 0.38, metalness: 0.75 }),   // alumínio preto
    glass: new THREE.MeshPhysicalMaterial({ name: 'glass', color: '#dfeaee', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.14, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.6, depthWrite: false }),
    curtain: std({ name: 'curtain', color: '#f3ede2', roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.93 }),
    lacquer: std({ name: 'lacquer', color: '#e9e5de', roughness: 0.32 }),
    metal: std({ name: 'metal', color: '#232325', roughness: 0.42, metalness: 0.85 }),
    brass: std({ name: 'brass', color: '#c39a5c', roughness: 0.28, metalness: 1 }),
    marble: std({ name: 'marble', color: '#ece8e2', roughness: 0.18 }),
    ceramic: std({ name: 'ceramic', color: '#ebe5da', roughness: 0.22 }),
    ceramicDark: std({ name: 'ceramic-dark', color: '#3a3532', roughness: 0.3 }),
    sheet: std({ name: 'sheet', color: '#f6f3ee', roughness: 0.92 }),
    rubber: std({ name: 'rubber', color: '#141414', roughness: 0.7 }),
    screen: new THREE.MeshStandardMaterial({ name: 'screen', color: '#05070b', emissive: '#a9c6ff', emissiveIntensity: 0.55, roughness: 0.15 }),
    bezel: std({ name: 'bezel', color: '#0e0e10', roughness: 0.3, metalness: 0.5 }),
  };
}

/** Cúpula de luminária: tecido translúcido que acende junto com as luzes (ver daylight.js). */
export function shadeMaterial() {
  return new THREE.MeshStandardMaterial({ name: 'lamp-shade', color: '#f4ead9', emissive: '#ffc98e', emissiveIntensity: 0, roughness: 0.9, side: THREE.DoubleSide });
}
