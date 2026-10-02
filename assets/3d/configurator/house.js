/**
 * A casa da experiência 3D.
 *
 * Contrato (o mesmo para o modelo montado abaixo e para um house.glb futuro):
 *  - superfície configurável → material chamado "surf-<id>" (ids em data/options.js);
 *  - móvel que pode ser arrastado → nó "movel-<id>" com userData.label / userData.area;
 *  - luminária → nó "luz-<id>" (vira PointLight + cúpula emissiva).
 *
 * Sem house.glb, a casa é montada aqui: arquitetura e móveis modernos em
 * geometria macia (estofados estufados, edredom caído, capitonê) com as
 * texturas PBR reais das superfícies, e peças escaneadas/modeladas CC0 do
 * Poly Haven (poltronas, mesa de centro, aparador, plantas, luminárias,
 * almofadas, vasos, livros) em assets/3d/models/props/.
 * Medidas em metros, Y para cima, piso em y = 0.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { sceneMaterials, shadeMaterial } from './materials.js';
import { artTexture, plinthLabelTexture } from './textures.js';
import { loadModel } from './loaders.js';

export const BOUNDS = { x0: -6, x1: 6, z0: -4.5, z1: 4.5 };
const H = 2.7, T = 0.14;
const PROPS_URL = 'assets/3d/models/props';

export const ROOMS = [
  { id: 'sala',       label: 'Sala',       bounds: { x0: -6, x1: 1.2, z0: -4.5, z1: 0.3 },  view: { position: [0.3, 1.5, 0.6],   target: [-3.5, 0.6, -2.6] } },
  { id: 'jantar',     label: 'Jantar',     bounds: { x0: -6, x1: -0.4, z0: 0.3, z1: 4.5 },  view: { position: [-0.6, 1.65, 4.7], target: [-4.0, 0.7, 2.3] } },
  { id: 'quarto',     label: 'Quarto',     bounds: { x0: 1.2, x1: 6, z0: -4.5, z1: 0.7 },   view: { position: [1.8, 1.8, 0.4],   target: [4.2, 0.6, -3.1] } },
  { id: 'escritorio', label: 'Escritório', bounds: { x0: -0.4, x1: 6, z0: 0.7, z1: 4.5 },   view: { position: [0.9, 1.6, 4.5],   target: [4.5, 0.7, 1.6] } },
];

export const OVERVIEW = { position: [5.6, 18.0, 20.25], target: [-0.95, 0.3, 0.05] };

// Peças CC0 (Poly Haven) usadas na casa — ver assets/3d/dev/fetch_models.py
const PROP_FILES = {
  armchair: 'modern_arm_chair_01', lounge: 'mid_century_lounge_chair', coffeeTable: 'coffee_table_round_01',
  cabinet: 'modern_wooden_cabinet', sideTable: 'side_table_01', plantTall: 'potted_plant_01', plantBush: 'potted_plant_02',
  succulent: 'potted_plant_04', pendant: 'modern_ceiling_lamp_01', deskLamp: 'desk_lamp_arm_01',
  books: 'book_encyclopedia_set_01', /* almofadas: geometria própria (pillowGeo) */ vase: 'ceramic_vase_01', vaseTall: 'ceramic_vase_03', cubeShelf: 'wooden_display_shelves_01',
  basket: 'wicker_basket_01', photo: 'standing_picture_frame_01',
};
const OPTIONAL_PROPS = new Set(['books', 'basket', 'photo', 'succulent', 'vaseTall']); // ficam de fora em aparelho fraco

/** UV em metros: cada face projetada no plano a que pertence. */
function uvInMeters(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) return geo;
  let uv = geo.attributes.uv;
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2); geo.setAttribute('uv', uv); }
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else if (nx >= nz) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geo;
}

export async function loadHouse(opts) {
  if (opts.glbUrl) try {
    const head = await fetch(opts.glbUrl, { method: 'HEAD' });
    if (head.ok && /model\/gltf|octet-stream/.test(head.headers.get('content-type') || '')) {
      return adaptGLB(await loadModel(opts.glbUrl), opts);
    }
  } catch { /* sem modelo: segue com a casa montada */ }
  return buildHouse(opts);
}

// ---------------------------------------------------------------------------
// Registro comum (casa montada e GLB)
// ---------------------------------------------------------------------------
function createRegistry(surfaceMaterials) {
  const reg = {
    root: new THREE.Group(),
    surfaceMeshes: new Map(Object.keys(surfaceMaterials).map((k) => [k, []])),
    furniture: new Map(),
    furnitureMeshes: [],
    lamps: [],
    anchors: {},
    views: [],
    shadeMaterial: shadeMaterial(),
  };
  reg.root.name = 'casa';
  reg.track = (obj) => {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const sid = o.material?.name?.startsWith('surf-') ? o.material.name.slice(5) : null;
      if (sid && reg.surfaceMeshes.has(sid)) { o.userData.surface = sid; reg.surfaceMeshes.get(sid).push(o); }
    });
    return obj;
  };
  /** Vista externa (janelas): escurece e troca dia/noite com a hora (chamado pelo main.js). */
  reg.applyDaylight = (d) => {
    reg.views.forEach((m) => {
      m.uniforms.uNight.value = d.night;
      m.uniforms.uBright.value = d.viewBright;
      m.uniforms.uTint.value.copy(d.sky);
    });
  };
  return reg;
}

/**
 * Junta as malhas de um contêiner que usam o mesmo material numa só
 * (uma chamada de desenho em vez de várias). A geometria vai para o espaço
 * local do contêiner, então um móvel continua se movendo como um bloco.
 */
const KEEP_ATTRS = ['position', 'normal', 'uv'];
function mergeByMaterial(container, skip) {
  container.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const buckets = new Map();
  container.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || Array.isArray(o.material) || skip(o)) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const withUv = list.every((m) => m.geometry.attributes.uv);
    const geos = list.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRS.includes(name) || (name === 'uv' && !withUv)) g.deleteAttribute(name);
      g.morphAttributes = {};
      g.clearGroups();
      return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld));
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    mesh.renderOrder = list[0].renderOrder;
    mesh.userData = { ...list[0].userData };
    container.add(mesh);
    list.forEach((m) => m.removeFromParent());
  }
}

function finalize(reg) {
  // Menos chamadas de desenho: por móvel (continua arrastável) e no resto da casa.
  const inFurniture = new Set();
  for (const f of reg.furniture.values()) {
    mergeByMaterial(f.group, () => false);
    f.group.traverse((o) => inFurniture.add(o));
  }
  mergeByMaterial(reg.root, (o) => inFurniture.has(o) || o.userData.noMerge);
  for (const list of reg.surfaceMeshes.values()) list.length = 0;
  reg.root.traverse((o) => { if (o.isMesh && o.userData.surface) reg.surfaceMeshes.get(o.userData.surface)?.push(o); });

  reg.root.updateMatrixWorld(true);
  reg.pickables = [...reg.surfaceMeshes.values()].flat();
  reg.surfaceBox = {};
  for (const [id, meshes] of reg.surfaceMeshes) {
    const box = new THREE.Box3();
    meshes.forEach((m) => box.expandByObject(m));
    reg.surfaceBox[id] = box;
  }
  for (const f of reg.furniture.values()) {
    f.home = { x: f.group.position.x, z: f.group.position.z };
    const box = new THREE.Box3().setFromObject(f.group);
    f.size = { w: box.max.x - box.min.x, d: box.max.z - box.min.z };
    f.group.traverse((o) => { if (o.isMesh) { o.userData.furnitureId = f.id; reg.furnitureMeshes.push(o); } });
  }
  reg.furnitureMeta = Object.fromEntries([...reg.furniture.values()].map((f) => [f.id, { label: f.label, area: f.area }]));
  reg.rooms = ROOMS;
  reg.overview = OVERVIEW;
  reg.bounds = BOUNDS;
  return reg;
}

// ---------------------------------------------------------------------------
// Geometria macia
// ---------------------------------------------------------------------------
/**
 * Caixa subdividida com cantos arredondados e "estufada" (almofada, colchão).
 * puff: quanto o tampo sobe no meio (fração da altura); side: barriga das laterais.
 */
function softBox(w, h, d, r, { puff = 0, side = 0, seg = 10 } = {}) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const sx = Math.max(2, Math.round(seg * w / Math.max(w, h, d)) * 2);
  const sy = Math.max(2, Math.round(seg * h / Math.max(w, h, d)) * 2);
  const sz = Math.max(2, Math.round(seg * d / Math.max(w, h, d)) * 2);
  // vértices unidos: as quinas arredondadas ficam lisas (sem vinco entre as faces)
  const box = new THREE.BoxGeometry(w, h, d, sx + 4, sy + 4, sz + 4);
  box.deleteAttribute('normal'); box.deleteAttribute('uv');
  const geo = mergeVertices(box, 1e-5);
  const p = geo.attributes.position;
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(THREE.MathUtils.clamp(v.x, -inner.x, inner.x), THREE.MathUtils.clamp(v.y, -inner.y, inner.y), THREE.MathUtils.clamp(v.z, -inner.z, inner.z));
    const dir = v.clone().sub(q);
    if (dir.lengthSq() > 1e-10) v.copy(q.add(dir.normalize().multiplyScalar(r)));
    const nx = (2 * v.x) / w, ny = (2 * v.y) / h, nz = (2 * v.z) / d;
    const bell = (1 - nx * nx) * (1 - nz * nz);
    if (puff && v.y > 0) v.y += puff * h * bell * Math.min(1, ny * 1.5 + 0.2);
    if (side) {
      const belly = (1 - ny * ny) * side;
      v.x += Math.sign(v.x) * belly * w * 0.04 * (1 - nz * nz);
      v.z += Math.sign(v.z) * belly * d * 0.04 * (1 - nx * nx);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Almofada: miolo cheio no centro e cantos "beliscados", como uma almofada de
 * verdade (não um tijolo arredondado). Em pé, de frente para +z.
 */
function pillowGeo(w, h, t) {
  const geo = softBox(w, h, t, t * 0.48, { seg: 14 });
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const nx = (2 * p.getX(i)) / w, ny = (2 * p.getY(i)) / h;
    const fill = (1 - Math.pow(Math.abs(nx), 3)) * (1 - Math.pow(Math.abs(ny), 3));
    p.setZ(i, p.getZ(i) * (0.22 + 0.78 * Math.max(0, fill)));
    // bordas levemente côncavas entre os cantos
    p.setX(i, p.getX(i) * (1 - 0.05 * (1 - ny * ny)));
    p.setY(i, p.getY(i) * (1 - 0.05 * (1 - nx * nx)));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Ruído suave (soma de senos) para rugas de tecido. */
function wrinkle(seed) {
  const r = mulberry(seed);
  const waves = Array.from({ length: 6 }, () => ({ fx: 2 + r() * 9, fz: 2 + r() * 9, ph: r() * 6.28, a: 0.3 + r() * 0.7 }));
  return (x, z) => waves.reduce((s, w) => s + Math.sin(x * w.fx + z * w.fz + w.ph) * w.a, 0) / 6;
}

/**
 * Tecido caído sobre um tampo (edredom, manta): cobre w × d e escorre `drop`
 * pelos lados e pelo pé, com borda arredondada, rugas e barra ondulada.
 * Origem: centro da cabeceira do tampo, z cresce para o pé.
 */
function drape(w, d, drop, { round = 0.05, wrinkleAmp = 0.012, seed = 1, puff = 0.03, segX = 56, segZ = 48, head = false } = {}) {
  const W = w + drop * 2, D = d + drop + (head ? drop : 0);
  const geo = new THREE.PlaneGeometry(W, D, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, D / 2 - (head ? drop : 0));
  const p = geo.attributes.position;
  const noise = wrinkle(seed);
  const arcLen = (Math.PI / 2) * round;
  const fold = (e) => (e <= arcLen
    ? { out: round * Math.sin(e / round), down: round * (1 - Math.cos(e / round)) }
    : { out: round, down: round + (e - arcLen) });
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const ex = Math.max(0, Math.abs(x) - w / 2);
    const ezF = Math.max(0, z - d), ezH = head ? Math.max(0, -z) : 0;
    const ez = Math.max(ezF, ezH);
    let nx = Math.min(Math.abs(x), w / 2) * Math.sign(x), nz = THREE.MathUtils.clamp(z, 0, d), y = 0;
    const e = Math.hypot(ex, ez);
    if (e > 0) {
      const f = fold(e);
      nx += Math.sign(x) * f.out * (ex / e);
      nz += (ezF > 0 ? 1 : -1) * f.out * (ez / e);
      y -= f.down;
      // barra ondulada: o tecido pendurado ondula mais perto da ponta
      const hang = Math.max(0, f.down - round) / drop;
      const along = ex > 0 ? z : x;
      const wave = Math.sin(along * 9 + seed) * 0.022 * hang;
      if (ex >= ez) nx += Math.sign(x) * wave; else nz += wave;
    } else {
      const u = (2 * x) / w, t = z / d;
      y += puff * (1 - u * u * u * u) * Math.min(1, t * 6) ;
    }
    y += noise(x, z) * wrinkleAmp * (e > 0 ? 0.6 : 1);
    p.setXYZ(i, nx, y, nz);
  }
  geo.computeVertexNormals();
  return geo;
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------
// Vista pelas janelas: plano no vão com paralaxe (a cidade parece estar longe)
// ---------------------------------------------------------------------------
function createViewMaterial(day, night, { depth = 18, width = 30 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: day }, uNight: { value: 0 }, uNightTex: { value: night },
      uBright: { value: 1 }, uTint: { value: new THREE.Color('#ffffff') },
      uDepth: { value: depth }, uWidth: { value: width },
    },
    vertexShader: `
      varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vTangentW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
        vTangentW = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform sampler2D uDay; uniform sampler2D uNightTex; uniform float uNight; uniform float uBright;
      uniform vec3 uTint; uniform float uDepth; uniform float uWidth;
      varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vTangentW;
      void main() {
        // raio da câmera atravessa a janela e encontra um "painel" da cidade a uDepth metros
        vec3 ray = normalize(vWorld - cameraPosition);
        float t = uDepth / max(0.05, dot(ray, -vNormalW));
        vec3 hit = vWorld + ray * t;
        vec3 bitan = cross(vNormalW, vTangentW);
        float u = dot(hit, vTangentW) / uWidth + 0.5;
        float v = (hit.y + 2.0) / (uWidth * 0.25) ;
        vec2 uv = vec2(fract(u), clamp(v, 0.02, 0.98));
        vec3 dayC = texture2D(uDay, uv).rgb;
        vec3 nightC = texture2D(uNightTex, uv).rgb;
        vec3 c = mix(dayC * mix(vec3(1.0), uTint, 0.35), nightC * 1.4, uNight) * uBright;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: true,
  });
}

// ---------------------------------------------------------------------------
// A casa montada
// ---------------------------------------------------------------------------
async function buildHouse({ surfaceMaterials: S, quality, onProgress }) {
  const reg = createRegistry(S);
  const M = sceneMaterials();
  const root = reg.root;
  const seg = quality.low ? 6 : 10;

  // Peças CC0 em paralelo com a montagem
  const propNames = Object.keys(PROP_FILES).filter((k) => !(quality.low && OPTIONAL_PROPS.has(k)));
  let loaded = 0;
  const propsPromise = Promise.all(propNames.map((k) => loadModel(`${PROPS_URL}/${PROP_FILES[k]}.glb`)
    .then((g) => { loaded += 1; onProgress?.(loaded / propNames.length); return [k, g.scene]; })
    .catch((err) => { console.warn('[casa] peça não carregou:', PROP_FILES[k], err); return [k, null]; })));
  const texLoader = new THREE.TextureLoader();
  const viewDay = texLoader.loadAsync('assets/3d/textures/vista/dia.webp');
  const viewNight = texLoader.loadAsync('assets/3d/textures/vista/noite.webp');

  const mesh = (geo, mat, x = 0, y = 0, z = 0, { ry = 0, rx = 0, rz = 0, cast = true, receive = true, uv = true } = {}) => {
    if (uv) uvInMeters(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  };
  const box = (w, h, d, mat, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
  const soft = (w, h, d, r, mat, x, y, z, o = {}) => mesh(softBox(w, h, d, r, { puff: o.puff, side: o.side, seg: o.seg || seg }), mat, x, y, z, o);
  const cyl = (rt, rb, h, mat, x, y, z, o = {}) => mesh(new THREE.CylinderGeometry(rt, rb, h, o.segments || 24, 1, !!o.open), mat, x, y, z, o);
  const lathe = (pts, mat, x, y, z, o = {}) => mesh(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), o.segments || 40), mat, x, y, z, o);
  const add = (parent, ...objs) => { objs.forEach((o) => o && parent.add(o)); return parent; };

  // ---------- pedestal + piso ----------
  add(root,
    box(12.6, 0.86, 9.6, M.plinth, 0, -0.51, 0, { uv: false }),
    box(12.62, 0.035, 9.62, M.plinthRim, 0, -0.07, 0, { uv: false }),
  );
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.55), new THREE.MeshBasicMaterial({ map: plinthLabelTexture(), transparent: true, toneMapped: false, opacity: 0.92 }));
  label.position.set(-2.5, -0.46, 4.806);
  root.add(label);
  add(root, box(12, 0.08, 9, S.piso, 0, -0.04, 0, { cast: false }));
  reg.anchors.piso = new THREE.Vector3(-0.6, 0.02, -1.2);

  // ---------- paredes (vãos para as janelas), topo em corte branco, rodapés ----------
  const cap = (w, d, x, y, z) => box(w, 0.012, d, M.section, x, y + 0.006, z, { cast: false, uv: false });
  const segZ = (mat, x, zA, zB, yA, yB, t = T) => [box(t, yB - yA, zB - zA, mat, x, (yA + yB) / 2, (zA + zB) / 2), yB >= H - 1e-3 || yB < 1.6 ? cap(t + 0.004, zB - zA, x, yB, (zA + zB) / 2) : null];
  const segX = (mat, z, xA, xB, yA, yB, t = T) => [box(xB - xA, yB - yA, t, mat, (xA + xB) / 2, (yA + yB) / 2, z), yB >= H - 1e-3 || yB < 1.6 ? cap(xB - xA, t + 0.004, (xA + xB) / 2, yB, z) : null];
  const xL = BOUNDS.x0 - T / 2, xR = BOUNDS.x1 + T / 2, zB = BOUNDS.z0 - T / 2, zF = BOUNDS.z1 + T / 2;
  const walls = [
    // destaque (esquerda), janela z ∈ [-3.5, -1.7]
    ...segZ(S['parede-destaque'], xL, -4.64, -3.5, 0, H), ...segZ(S['parede-destaque'], xL, -1.7, 4.64, 0, H),
    ...segZ(S['parede-destaque'], xL, -3.5, -1.7, 0, 0.75), ...segZ(S['parede-destaque'], xL, -3.5, -1.7, 2.3, H),
    // fundos: caixilho de piso a teto x ∈ [-1.7, 0.9]
    ...segX(S.paredes, zB, -6.14, -1.7, 0, H), ...segX(S.paredes, zB, 0.9, 6.14, 0, H), ...segX(S.paredes, zB, -1.7, 0.9, 2.45, H),
    // direita: janela do quarto z ∈ [-3.3, -1.7] e do escritório z ∈ [1.6, 3.4]
    ...segZ(S.paredes, xR, -4.64, -3.3, 0, H), ...segZ(S.paredes, xR, -1.7, 1.6, 0, H), ...segZ(S.paredes, xR, 3.4, 4.64, 0, H),
    ...segZ(S.paredes, xR, -3.3, -1.7, 0, 0.9), ...segZ(S.paredes, xR, -3.3, -1.7, 2.25, H),
    ...segZ(S.paredes, xR, 1.6, 3.4, 0, 0.85), ...segZ(S.paredes, xR, 1.6, 3.4, 2.2, H),
    // frente em corte (maquete), divisória sala/quarto e mureta quarto/escritório
    ...segX(S.paredes, zF, -6.14, 6.14, 0, 0.5),
    ...segZ(S.paredes, 1.2, -4.5, -1.0, 0, H, 0.12),
    ...segX(S.paredes, 0.7, 2.4, 6.0, 0, 1.1, 0.12),
  ];
  add(root, ...walls);
  reg.anchors['parede-destaque'] = new THREE.Vector3(-5.92, 1.8, 0.9);
  reg.anchors.paredes = new THREE.Vector3(2.4, 2.2, -4.42);

  const skirtX = (z, xA, xB, dir) => box(xB - xA, 0.08, 0.014, M.baseboard, (xA + xB) / 2, 0.04, z + dir * (T / 2 + 0.007), { uv: false, cast: false });
  const skirtZ = (x, zA, zB, dir) => box(0.014, 0.08, zB - zA, M.baseboard, x + dir * (T / 2 + 0.007), 0.04, (zA + zB) / 2, { uv: false, cast: false });
  add(root,
    skirtZ(xL, -4.5, -3.5, 1), skirtZ(xL, -1.7, 4.5, 1),
    skirtX(zB, -6, -1.7, 1), skirtX(zB, 0.9, 6, 1),
    skirtZ(xR, -4.5, -3.3, -1), skirtZ(xR, -1.7, 1.6, -1), skirtZ(xR, 3.4, 4.5, -1),
    skirtZ(1.2, -4.5, -1.0, -0.86), skirtZ(1.2, -4.5, -1.0, 0.86),
  );

  // ---------- janelas: caixilho de alumínio, vidro com reflexo e a vista lá fora ----------
  const [dayTex, nightTex] = await Promise.all([viewDay, viewNight]);
  [dayTex, nightTex].forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; });
  const windowUnit = (axis, fixed, a, b, yA, yB, mullions, inward) => {
    const g = new THREE.Group();
    const len = b - a, mid = (a + b) / 2, h = yB - yA, ym = (yA + yB) / 2;
    const along = (p, y, w, hh, depth, mat) => (axis === 'x' ? box(w, hh, depth, mat, p, y, fixed, { uv: false }) : box(depth, hh, w, mat, fixed, y, p, { uv: false }));
    const pane = along(mid, ym, len, h, 0.012, M.glass);
    pane.castShadow = false; pane.receiveShadow = false; pane.renderOrder = 2; pane.userData.noMerge = true;
    g.add(pane);
    const prof = 0.055;
    g.add(along(mid, yA + prof / 2, len, prof, 0.08, M.frame), along(mid, yB - prof / 2, len, prof, 0.08, M.frame),
      along(a + prof / 2, ym, prof, h, 0.08, M.frame), along(b - prof / 2, ym, prof, h, 0.08, M.frame));
    for (let i = 1; i < mullions; i++) g.add(along(a + (len * i) / mullions, ym, 0.04, h, 0.07, M.frame));
    // peitoril de pedra
    if (yA > 0.2) g.add(along(mid, yA - 0.015, len + 0.08, 0.03, T + 0.06, M.marble));
    // vista: plano logo atrás do vidro, voltado para dentro
    const viewMat = createViewMaterial(dayTex, nightTex);
    reg.views.push(viewMat);
    const view = new THREE.Mesh(new THREE.PlaneGeometry(len, h), viewMat);
    view.userData.noMerge = true;
    view.position.set(axis === 'x' ? mid : fixed - inward * 0.05, ym, axis === 'x' ? fixed - inward * 0.05 : mid);
    view.rotation.y = axis === 'x' ? (inward > 0 ? 0 : Math.PI) : (inward > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.add(view);
    root.add(g);
  };
  windowUnit('z', xL, -3.5, -1.7, 0.75, 2.3, 2, 1);
  windowUnit('x', zB, -1.7, 0.9, 0.05, 2.45, 4, 1);
  windowUnit('z', xR, -3.3, -1.7, 0.9, 2.25, 2, -1);
  windowUnit('z', xR, 1.6, 3.4, 0.85, 2.2, 2, -1);

  // cortinas de linho translúcido, com pregas fundas e barra ondulada
  const curtain = (x, z, w, h, ry, seed) => {
    const geo = new THREE.PlaneGeometry(w, h, 48, 12);
    const p = geo.attributes.position, n = wrinkle(seed);
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i);
      const pleat = Math.sin((px / w) * Math.PI * 10) * 0.045 + Math.sin((px / w) * Math.PI * 23 + seed) * 0.01;
      const flare = (1 - (py + h / 2) / h) * 0.025 * n(px * 3, py);
      p.setZ(i, pleat + flare);
    }
    geo.computeVertexNormals();
    const m = mesh(geo, M.curtain, x, h / 2 + 0.08, z, { ry, uv: false });
    m.receiveShadow = true;
    return m;
  };
  add(root,
    curtain(-5.86, -3.82, 0.62, 2.5, Math.PI / 2, 1), curtain(-5.86, -1.38, 0.62, 2.5, Math.PI / 2, 2),
    curtain(-2.05, -4.36, 0.7, 2.55, 0, 3), curtain(1.25, -4.36, 0.7, 2.55, 0, 4),
    curtain(5.86, -3.62, 0.55, 2.45, -Math.PI / 2, 5), curtain(5.86, -1.38, 0.55, 2.45, -Math.PI / 2, 6),
  );
  // trilho das cortinas
  add(root, box(0.03, 0.03, 3.6, M.metal, -5.9, 2.62, -2.6, { uv: false }), box(4.0, 0.03, 0.03, M.metal, -0.4, 2.62, -4.36, { uv: false }), box(0.03, 0.03, 2.9, M.metal, 5.9, 2.62, -2.5, { uv: false }));

  // ---------- painel ripado (fundos, atrás do sofá) ----------
  const slats = [];
  for (let i = 0; i < 12; i++) slats.push(uvInMeters(softBox(0.055, 2.6, 0.045, 0.006, { seg: 4 })).translate(-5.42 + 0.03 + i * 0.13, 1.3, -4.39));
  const slatMesh = new THREE.Mesh(mergeGeometries(slats), S.ripado);
  slatMesh.castShadow = slatMesh.receiveShadow = true;
  add(root, slatMesh, box(1.56, 2.6, 0.02, S.ripado, -4.7, 1.3, -4.45));
  reg.anchors.ripado = new THREE.Vector3(-4.7, 1.25, -4.38);

  // prateleiras sobre o sofá
  [1.38, 1.8].forEach((y) => root.add(soft(1.3, 0.035, 0.26, 0.008, S.marcenaria, -2.85, y, -4.36, { seg: 6 })));
  reg.anchors.marcenaria = new THREE.Vector3(-2.85, 1.85, -4.3);

  // ---------- SALA ----------
  root.add(rug(3.6, 2.6, S.tapetes, -3.75, -2.2));
  reg.anchors.tapetes = new THREE.Vector3(-2.4, 0.03, -1.3);

  // sofá em L: base, assentos estufados, encostos inclinados e braço arredondado
  const sofa = new THREE.Group();
  add(sofa,
    soft(2.9, 0.26, 0.96, 0.05, S.estofados, 0, 0.24, 0, { side: 0.4 }),
    soft(0.94, 0.26, 1.0, 0.05, S.estofados, -0.98, 0.24, -0.95, { side: 0.4 }),
    soft(2.9, 0.44, 0.2, 0.08, S.estofados, 0, 0.6, 0.38, { side: 0.3 }),
    soft(0.2, 0.6, 0.96, 0.09, S.estofados, 1.35, 0.4, 0, { puff: 0.04 }),
    // assentos
    soft(0.9, 0.17, 0.74, 0.07, S.estofados, -0.5, 0.45, -0.06, { puff: 0.22, side: 0.6 }),
    soft(0.88, 0.17, 0.74, 0.07, S.estofados, 0.42, 0.45, -0.06, { puff: 0.22, side: 0.6 }),
    soft(0.92, 0.17, 1.72, 0.07, S.estofados, -0.98, 0.45, -0.6, { puff: 0.18, side: 0.6 }),
    // encostos soltos, levemente inclinados
    soft(0.92, 0.5, 0.2, 0.08, S.estofados, -0.98, 0.76, 0.24, { puff: 0.06, side: 1, rx: -0.14 }),
    soft(0.9, 0.5, 0.2, 0.08, S.estofados, -0.04, 0.76, 0.24, { puff: 0.06, side: 1, rx: -0.14 }),
    soft(0.86, 0.5, 0.2, 0.08, S.estofados, 0.84, 0.76, 0.24, { puff: 0.06, side: 1, rx: -0.14 }),
  );
  [[-1.38, -0.4], [1.38, -0.4], [-1.38, 0.4], [1.38, 0.4], [-1.38, -1.38], [-0.58, -1.38]].forEach(([x, z]) => sofa.add(cyl(0.02, 0.016, 0.11, M.metal, x, 0.055, z, { segments: 12 })));
  placeFurniture(reg, sofa, 'sofa', 'Sofá', 'Sala', -3.85, -3.45, Math.PI);
  reg.anchors.estofados = new THREE.Vector3(-3.6, 0.95, -3.55);
  reg.anchors.detalhes = new THREE.Vector3(-3.85, 0.95, -3.65);

  // pufe de tricô
  const pouf = new THREE.Group();
  pouf.add(lathe([[0, 0], [0.22, 0], [0.27, 0.03], [0.29, 0.12], [0.29, 0.26], [0.26, 0.35], [0.18, 0.385], [0, 0.39]], S.detalhes, 0, 0, 0));
  placeFurniture(reg, pouf, 'pufe', 'Pufe', 'Sala', -2.35, -0.45);

  // luminária de arco: base de mármore, haste de latão, cúpula
  const arcLamp = new THREE.Group();
  const arc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.1, 2.35, 0), new THREE.Vector3(1.15, 1.85, 0));
  add(arcLamp, cyl(0.2, 0.21, 0.05, M.marble, 0, 0.025, 0, { segments: 40 }), mesh(new THREE.TubeGeometry(arc, 48, 0.013, 10), M.brass, 0, 0, 0, { uv: false }));
  const dome = mesh(new THREE.SphereGeometry(0.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), reg.shadeMaterial, 1.15, 1.72, 0, { uv: false, cast: false });
  arcLamp.add(dome);
  addLight(reg, arcLamp, 1.15, 1.62, 0, dome, 0.75);
  placeFurniture(reg, arcLamp, 'luminaria-piso', 'Luminária de arco', 'Sala', -5.6, -2.2, Math.PI / 4);

  // aparador de madeira (real) + abajur, vasos e porta-retrato
  const tableLamp = (parent, x, y, z, { h = 0.3 } = {}) => {
    const g = new THREE.Group();
    g.add(lathe([[0, 0], [0.06, 0], [0.085, 0.04], [0.09, h * 0.45], [0.05, h * 0.85], [0.016, h], [0, h]], M.ceramic, 0, 0, 0));
    const shade = cyl(0.12, 0.16, 0.2, reg.shadeMaterial, 0, h + 0.09, 0, { open: true, segments: 40, uv: false, cast: false });
    g.add(shade);
    addLight(reg, g, 0, h + 0.05, 0, shade, 0.55);
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // ---------- JANTAR ----------
  const dining = new THREE.Group();
  add(dining, soft(1.9, 0.045, 0.95, 0.012, S.marcenaria, 0, 0.75, 0, { seg: 8 }));
  [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]].forEach(([x, z]) => {
    const leg = cyl(0.028, 0.018, 0.73, S.marcenaria, x, 0.365, z, { segments: 16 });
    leg.rotation.set(z * 0.12, 0, -x * 0.04);
    dining.add(leg);
  });
  [[-0.45, -0.7, 0], [0.45, -0.7, 0], [-0.45, 0.7, Math.PI], [0.45, 0.7, Math.PI]].forEach(([x, z, r]) => {
    const ch = diningChair();
    ch.position.set(x, 0, z); ch.rotation.y = r;
    dining.add(ch);
  });
  placeFurniture(reg, dining, 'mesa-jantar', 'Mesa de jantar', 'Jantar', -3.8, 2.55);

  // ---------- QUARTO ----------
  root.add(rug(3.0, 2.5, S.tapetes, 3.9, -2.7));
  const bed = new THREE.Group();
  // cama de plataforma, colchão, edredom caído, travesseiros e cabeceira capitonê
  add(bed,
    soft(1.86, 0.24, 2.16, 0.02, S.marcenaria, 0, 0.16, 0.02, { seg: 8 }),
    box(1.7, 0.06, 2.0, M.rubber, 0, 0.03, 0.02, { uv: false }),
    soft(1.62, 0.24, 2.0, 0.06, M.sheet, 0, 0.4, 0.02, { side: 0.4 }),
  );
  const duvet = mesh(drape(1.66, 1.5, 0.24, { seed: 3, puff: 0.05, wrinkleAmp: 0.014 }), S.cama, 0, 0.53, -0.47);
  bed.add(duvet);
  const turn = mesh(drape(1.66, 0.28, 0.2, { seed: 9, puff: 0.03, wrinkleAmp: 0.008, segX: 40, segZ: 10 }), M.sheet, 0, 0.545, -0.6);
  bed.add(turn);
  add(bed,
    soft(0.68, 0.15, 0.44, 0.07, M.sheet, -0.38, 0.6, -0.78, { puff: 0.5, side: 0.8, rx: -0.12 }),
    soft(0.68, 0.15, 0.44, 0.07, M.sheet, 0.38, 0.6, -0.78, { puff: 0.5, side: 0.8, rx: -0.12 }),
  );
  // manta nos pés
  bed.add(mesh(drape(1.7, 0.42, 0.26, { seed: 5, puff: 0.012, wrinkleAmp: 0.01, segX: 48, segZ: 14 }), S.detalhes, 0, 0.6, 0.55));
  for (let i = 0; i < 8; i++) bed.add(soft(0.24, 1.0, 0.1, 0.05, S.estofados, -0.84 + i * 0.24, 0.78, -1.12, { side: 1.4, puff: 0.04, seg: 8 }));
  bed.add(box(1.95, 1.04, 0.05, S.marcenaria, 0, 0.78, -1.18));
  bed.position.set(3.9, 0, -3.3);
  root.add(bed);
  reg.anchors.cama = new THREE.Vector3(3.9, 0.6, -2.95);

  const bench = new THREE.Group();
  add(bench, soft(1.3, 0.12, 0.42, 0.05, S.estofados, 0, 0.44, 0, { puff: 0.15, side: 0.6 }), box(1.32, 0.03, 0.44, S.marcenaria, 0, 0.365, 0));
  [[-0.6, -0.17], [0.6, -0.17], [-0.6, 0.17], [0.6, 0.17]].forEach(([x, z]) => bench.add(cyl(0.018, 0.014, 0.36, M.metal, x, 0.18, z, { segments: 10 })));
  placeFurniture(reg, bench, 'banco-quarto', 'Banco', 'Quarto', 3.9, -1.82);

  // armário laqueado com frisos e puxadores de latão
  const ward = new THREE.Group();
  add(ward, box(0.62, 2.3, 1.8, M.lacquer, 0, 1.17, 0, { uv: false }), box(0.6, 0.06, 1.76, M.rubber, 0, 0.03, 0, { uv: false }));
  [-0.6, 0, 0.6].forEach((z) => ward.add(box(0.004, 2.22, 0.006, M.frame, 0.311, 1.17, z, { uv: false })));
  [[-0.06], [0.06]].forEach(([z]) => ward.add(cyl(0.008, 0.008, 0.5, M.brass, 0.33, 1.17, z, { segments: 10, uv: false })));
  ward.position.set(1.6, 0, -3.55);
  root.add(ward);

  // ---------- ESCRITÓRIO ----------
  const desk = new THREE.Group();
  add(desk, soft(1.5, 0.032, 0.68, 0.01, S.marcenaria, 0, 0.74, 0, { seg: 8 }));
  [[-0.7, -0.29], [0.7, -0.29], [-0.7, 0.29], [0.7, 0.29]].forEach(([x, z]) => desk.add(box(0.035, 0.725, 0.035, M.metal, x, 0.36, z, { uv: false })));
  add(desk, box(1.42, 0.035, 0.035, M.metal, 0, 0.7, -0.29, { uv: false }), box(1.42, 0.035, 0.035, M.metal, 0, 0.7, 0.29, { uv: false }));
  // monitor fino com tela acesa
  const screenTex = screenTexture();
  const screen = new THREE.MeshStandardMaterial({ name: 'screen-ui', color: '#101010', emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.85, roughness: 0.15 });
  reg.screens = [screen];
  add(desk, box(0.64, 0.38, 0.018, M.bezel, 0, 1.08, -0.2, { uv: false }), box(0.05, 0.24, 0.03, M.metal, 0, 0.87, -0.215, { uv: false }), box(0.24, 0.012, 0.16, M.metal, 0, 0.76, -0.22, { uv: false }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.61, 0.35), screen);
  scr.position.set(0, 1.08, -0.19);
  desk.add(scr);
  add(desk, soft(0.42, 0.015, 0.13, 0.006, M.bezel, -0.05, 0.765, 0.08, { seg: 4 }), soft(0.06, 0.02, 0.1, 0.01, M.bezel, 0.28, 0.768, 0.09, { seg: 4 }));
  desk.position.set(3.65, 0, 1.12);
  root.add(desk);

  const chair = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = box(0.3, 0.025, 0.04, M.metal, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, { uv: false });
    arm.rotation.y = -a;
    chair.add(arm, mesh(new THREE.SphereGeometry(0.025, 10, 8), M.rubber, Math.cos(a) * 0.29, 0.025, Math.sin(a) * 0.29, { uv: false }));
  }
  add(chair, cyl(0.022, 0.022, 0.36, M.metal, 0, 0.24, 0, { uv: false }),
    soft(0.5, 0.09, 0.48, 0.04, S.estofados, 0, 0.47, 0, { puff: 0.25, side: 0.6 }),
    soft(0.46, 0.5, 0.07, 0.035, S.estofados, 0, 0.8, 0.24, { puff: 0.1, side: 0.8, rx: 0.12 }),
    box(0.05, 0.36, 0.03, M.metal, 0, 0.6, 0.26, { uv: false }));
  placeFurniture(reg, chair, 'cadeira-escritorio', 'Cadeira de trabalho', 'Escritório', 3.65, 1.85);

  // ---------- peças reais (Poly Haven) ----------
  const P = Object.fromEntries(await propsPromise);
  const prop = (key, opts) => P[key] && placeProp(P[key], S, opts);

  // sala
  const coffee = prop('coffeeTable', { fit: 'x', size: 0.92 });
  if (coffee) { const g = new THREE.Group(); g.add(coffee); add(g, prop('vase', { fit: 'y', size: 0.2, x: 0.18, y: coffee.userData.height, z: -0.05 })); placeFurniture(reg, g, 'mesa-centro', 'Mesa de centro', 'Sala', -3.9, -1.75); }
  const arm = prop('armchair', { fit: 'y', size: 0.86, surfaces: { modern_arm_chair_01_pillow: 'estofados' } });
  if (arm) { const g = new THREE.Group(); g.add(arm); placeFurniture(reg, g, 'poltrona-sala', 'Poltrona', 'Sala', -1.75, -1.6, Math.PI / 2 - 0.45); }
  const bush = prop('plantBush', { fit: 'y', size: 1.0 });
  if (bush) { const g = new THREE.Group(); g.add(bush); placeFurniture(reg, g, 'planta-sala', 'Planta', 'Sala', 0.55, -4.0); }
  // almofadas no sofá (o par do modelo) — superfície "detalhes"
  [[-1.12, 0.12, 0.2, 0.5], [-0.72, 0.15, -0.12, 0.46], [0.62, 0.13, 0.15, 0.48], [1.0, 0.16, -0.2, 0.42]].forEach(([x, z, rz, w]) => sofa.add(mesh(pillowGeo(w, w, 0.16), S.detalhes, x, 0.55 + w / 2, z, { rx: 0.32, rz })));
  add(root,
    prop('cabinet', { fit: 'x', size: 1.75, x: -5.72, z: -0.5, ry: Math.PI / 2 }),
    prop('basket', { fit: 'x', size: 0.4, x: -2.0, z: -4.05 }),
    prop('books', { fit: 'x', size: 0.5, x: -3.2, y: 1.4, z: -4.36 }),
    prop('vaseTall', { fit: 'y', size: 0.3, x: -2.4, y: 1.4, z: -4.36 }),
    prop('succulent', { fit: 'y', size: 0.18, x: -2.5, y: 1.82, z: -4.36 }),
    prop('vase', { fit: 'y', size: 0.24, x: -5.72, y: 0.5, z: -0.05 }),
    prop('photo', { fit: 'y', size: 0.24, x: -5.75, y: 0.5, z: 0.25, ry: Math.PI / 2 - 0.3 }),
  );
  tableLamp(root, -5.72, 0.5, -1.0);
  artOnWall(root, M, 'x', -5.91, -0.4, 1.55, 0.7, 0.92, 11, ['#efe6d6', '#c66b45', '#e0a33c', '#2f3a52']);
  artOnWall(root, M, 'x', -5.91, 0.5, 1.45, 0.46, 0.6, 23, ['#e9dfcc', '#2f3a52', '#c66b45', '#d9b98a']);

  // jantar: pendente de globo sobre a mesa, planta no canto
  const pend = prop('pendant', { fit: 'y', size: 0.95, x: -3.8, y: 2.7 - 0.95, z: 2.55 });
  if (pend) {
    pend.traverse((o) => { if (o.isMesh && /glass/i.test(o.material.name)) o.material = reg.shadeMaterial; });
    root.add(pend);
    const bulb = mesh(new THREE.SphereGeometry(0.05, 16, 12), reg.shadeMaterial, -3.8, 1.86, 2.55, { uv: false, cast: false });
    root.add(bulb);
    addLight(reg, root, -3.8, 1.78, 2.55, bulb, 0.9);
  }
  add(root, prop('plantTall', { fit: 'y', size: 1.35, x: -5.45, z: 4.0 }), prop('vase', { fit: 'y', size: 0.22, x: -3.6, y: 0.775, z: 2.6 }));

  // estante vazada na divisória sala/jantar
  add(root,
    prop('cubeShelf', { fit: 'y', size: 1.55, x: -0.05, z: 2.15, ry: Math.PI / 2 }),
  );

  // quarto: criados-mudos reais com abajur, quadro, planta
  [2.62, 5.18].forEach((x) => {
    add(root, prop('sideTable', { fit: 'y', size: 0.5, x, z: -4.15 }));
    tableLamp(root, x, 0.5, -4.18, { h: 0.24 });
  });
  [[-0.32, 0.1], [0.32, -0.1]].forEach(([x, rz]) => bed.add(mesh(pillowGeo(0.5, 0.42, 0.15), S.detalhes, x, 0.84, -0.66, { rx: -0.42, rz })));
  bed.add(mesh(pillowGeo(0.42, 0.3, 0.13), S.estofados, 0, 0.78, -0.54, { rx: -0.5 }));
  artOnWall(root, M, 'z', -4.43, 3.9, 1.9, 0.82, 0.62, 41, ['#eadfcd', '#c66b45', '#2f3a52', '#e0a33c']);
  const plantQ = prop('plantTall', { fit: 'y', size: 1.25 });
  if (plantQ) { const g = new THREE.Group(); g.add(plantQ); placeFurniture(reg, g, 'planta-quarto', 'Planta', 'Quarto', 5.45, -1.2); }

  // escritório: luminária articulada, poltrona de couro, planta
  const dl = prop('deskLamp', { fit: 'y', size: 0.5, x: 4.2, y: 0.756, z: 0.92, ry: Math.PI + 0.6 });
  if (dl) {
    let head = null;
    dl.traverse((o) => { if (o.isMesh && /light/i.test(o.material.name)) { o.material = reg.shadeMaterial; head = o; } });
    root.add(dl);
    addLight(reg, root, 4.05, 1.05, 1.05, head, 0.45);
  }
  add(root, prop('succulent', { fit: 'y', size: 0.16, x: 3.1, y: 0.756, z: 0.95 }), prop('plantBush', { fit: 'y', size: 0.95, x: 5.5, z: 4.05 }));
  const lounge = prop('lounge', { fit: 'y', size: 0.95 });
  if (lounge) { const g = new THREE.Group(); g.add(lounge); placeFurniture(reg, g, 'poltrona-escritorio', 'Poltrona do escritório', 'Escritório', 5.1, 3.5, -Math.PI / 2 - 0.6); }

  reg.track(root);
  return finalize(reg);

  // ---------- peças reutilizadas ----------
  function diningChair() {
    const g = new THREE.Group();
    // assento estofado, encosto curvo de madeira, pés afinados
    add(g, soft(0.44, 0.06, 0.42, 0.025, S.detalhes, 0, 0.47, 0, { puff: 0.25, side: 0.6, seg: 6 }), box(0.42, 0.025, 0.4, S.marcenaria, 0, 0.43, 0));
    const back = softBox(0.44, 0.16, 0.025, 0.01, { seg: 6 });
    const bp = back.attributes.position;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i); bp.setZ(i, bp.getZ(i) + (x * x) * 0.6); }
    back.computeVertexNormals();
    g.add(mesh(back, S.marcenaria, 0, 0.8, 0.2));
    [[-0.19, -0.18, 0.44], [0.19, -0.18, 0.44], [-0.19, 0.18, 0.8], [0.19, 0.18, 0.8]].forEach(([x, z, h]) => {
      const leg = cyl(0.016, 0.012, h, S.marcenaria, x, h / 2, z, { segments: 10 });
      leg.rotation.set(-z * 0.15, 0, x * 0.12);
      g.add(leg);
    });
    return g;
  }

  function rug(w, d, mat, x, z) {
    const shape = new THREE.Shape();
    const r = 0.06;
    shape.moveTo(-w / 2 + r, -d / 2); shape.lineTo(w / 2 - r, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    shape.lineTo(w / 2, d / 2 - r); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    shape.lineTo(-w / 2 + r, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    shape.lineTo(-w / 2, -d / 2 + r); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return mesh(geo, mat, x, 0.002, z, { cast: false });
  }
}

/**
 * Coloca uma peça GLB: centraliza, apoia no chão (ou em `y`), escala por uma
 * medida (`fit` = eixo, `size` = metros) e troca materiais nomeados por
 * superfícies configuráveis — com UV recalculado em metros para a textura
 * ficar na escala certa.
 */
function placeProp(src, S, { fit = 'y', size = 1, x = 0, y = 0, z = 0, ry = 0, rx = 0, surfaces } = {}) {
  const inner = src.clone(true);
  const box = new THREE.Box3().setFromObject(inner);
  const dims = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = size / Math.max(1e-4, dims[fit]);
  inner.position.set(-center.x, -box.min.y, -center.z);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.scale.setScalar(s);
  wrap.updateMatrixWorld(true);
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const sid = surfaces?.[o.material?.name];
    if (sid && S[sid]) {
      const g = o.geometry.clone();
      const tmp = g.clone().applyMatrix4(o.matrixWorld);
      tmp.computeVertexNormals();
      uvInMeters(tmp);
      g.setAttribute('uv', tmp.attributes.uv);
      o.geometry = g;
      o.material = S[sid];
    }
  });
  wrap.position.set(x, y, z);
  wrap.rotation.set(rx, ry, 0, 'YXZ');
  wrap.userData.height = dims.y * s;
  return wrap;
}

function placeFurniture(reg, group, id, label, area, x, z, ry = 0) {
  group.name = `movel-${id}`;
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  group.userData = { label, area };
  reg.root.add(group);
  reg.furniture.set(id, { id, label, area, group });
}

/** PointLight presa a uma cúpula. A intensidade vem de daylight.js (acendem no fim da tarde). */
function addLight(reg, parent, x, y, z, shade, strength) {
  const light = new THREE.PointLight('#ffc98c', 0, 6, 2);
  light.position.set(x, y, z);
  light.castShadow = false;
  parent.add(light);
  reg.lamps.push({ light, shade, strength });
}

/** Quadro: moldura fina, passe-partout branco e vidro. */
function artOnWall(root, M, axis, fixed, along, y, w, h, seed, palette) {
  const g = new THREE.Group();
  const depth = 0.03;
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1c1a19', roughness: 0.5 });
  const mat = new THREE.MeshStandardMaterial({ color: '#f5f2ec', roughness: 0.95 });
  const art = new THREE.MeshStandardMaterial({ map: artTexture(seed, palette), roughness: 0.9 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), frameMat);
  const passe = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), mat);
  passe.position.z = depth / 2 + 0.001;
  const print = new THREE.Mesh(new THREE.PlaneGeometry((w - 0.04) * 0.72, (h - 0.04) * 0.72), art);
  print.position.z = depth / 2 + 0.002;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), M.glass);
  glass.position.z = depth / 2 + 0.004;
  glass.userData.noMerge = true;
  g.add(frame, passe, print, glass);
  frame.castShadow = true;
  g.position.set(axis === 'x' ? fixed + depth / 2 : along, y, axis === 'x' ? along : fixed + depth / 2);
  g.rotation.y = axis === 'x' ? Math.PI / 2 : 0;
  root.add(g);
}

/** Tela do monitor: um editor de plantas — ninguém deixa o monitor desligado numa foto de interiores. */
function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 292;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 292);
  g.addColorStop(0, '#f4efe7'); g.addColorStop(1, '#e6ddd0');
  x.fillStyle = g; x.fillRect(0, 0, 512, 292);
  x.fillStyle = '#2b2a28'; x.fillRect(0, 0, 512, 22);
  x.fillStyle = '#B0755A'; x.fillRect(14, 7, 8, 8);
  x.strokeStyle = '#7B8E7E'; x.lineWidth = 3;
  x.strokeRect(70, 52, 250, 190); x.beginPath(); x.moveTo(170, 52); x.lineTo(170, 160); x.lineTo(320, 160); x.stroke();
  x.fillStyle = 'rgba(176,117,90,.35)'; x.fillRect(180, 170, 130, 62);
  x.fillStyle = '#d9cfc2'; for (let i = 0; i < 6; i++) x.fillRect(350, 52 + i * 30, 140, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// house.glb (quando existir): aplica o contrato de nomes ao modelo carregado
// ---------------------------------------------------------------------------
function adaptGLB(gltf, { surfaceMaterials: S }) {
  const reg = createRegistry(S);
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      const name = o.material?.name || '';
      if (name.startsWith('surf-') && S[name.slice(5)]) o.material = S[name.slice(5)];
    }
  });
  const furniture = [], lights = [];
  scene.traverse((o) => {
    if (o.name.startsWith('movel-')) furniture.push(o);
    if (o.name.startsWith('luz-')) lights.push(o);
  });
  reg.root.add(scene);
  furniture.forEach((o) => {
    const id = o.name.slice(6);
    reg.furniture.set(id, { id, label: o.userData.label || id, area: o.userData.area || '', group: o });
  });
  lights.forEach((o) => {
    const shade = o.children.find((c) => c.isMesh) || null;
    if (shade) shade.material = reg.shadeMaterial;
    addLight(reg, o, 0, 0, 0, shade, 0.8);
  });
  reg.track(reg.root);
  // âncoras das etiquetas: centro de cada superfície
  for (const [id, meshes] of reg.surfaceMeshes) {
    if (!meshes.length) continue;
    const box = new THREE.Box3();
    meshes.forEach((m) => box.expandByObject(m));
    reg.anchors[id] = box.getCenter(new THREE.Vector3());
  }
  return finalize(reg);
}
