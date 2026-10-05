/**
 * Porta de entrada da experiência 3D (experiencia-3d.html). Junta as peças:
 *
 *   store (preferences.js) ──change──▶ cena (materiais/luz/móveis) + ui.js
 *   ui.js / interaction.js ──só chamam o store──┘
 *
 * mount(host, opts) devolve { unmount, store, experience() }.
 * A página (page.js) cuida de autenticação, rascunho e criação do projeto.
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { SURFACES, MATERIAL_BY_ID, PRESETS, DAYLIGHT } from './data/options.js';
import { createStore, toExperience } from './preferences.js';
import { createSurfaceMaterial, changeSurfaceMaterial } from './materials.js';
import { loadTextureSet, textureVariant, disposeTextures } from './textures.js';
import { loadHouse } from './house.js';
import { detectQuality, createScene } from './scene.js';
import { createCameraRig } from './camera.js';
import { createInteraction } from './interaction.js';
import { createUI } from './ui.js';

gsap.registerPlugin(CustomEase);
CustomEase.create('matchOut', '.2,.8,.2,1');       // = --ease-out do site
CustomEase.create('matchSpring', '.34,1.56,.64,1'); // = --ease-spring (só peças pequenas)

// De onde a onda parte quando um preset muda a casa inteira: o centro da sala.
const LIVING_CENTER = new THREE.Vector3(-2.4, 0, -1.6);
const WAVE_SPEED = 8.5; // m/s — mesma frente de onda para todas as superfícies

export async function mount(host, { initial, projectName, glbUrl, mode = 'create', onProgress, onChange, onFinish, onBack } = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const quality = detectQuality();
  const stage = host.querySelector('[data-x3-stage]');
  const progress = (p, label) => onProgress?.(p, label);

  progress(0.08, 'Preparando os materiais');
  // O letreiro do pedestal usa Poppins num canvas: a fonte precisa estar pronta.
  await Promise.race([document.fonts.load('700 72px Poppins'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});

  const store = createStore(initial);
  const state0 = store.get();
  const setFor = (surfaceId, matId) => { const mat = MATERIAL_BY_ID[matId]; return loadTextureSet(mat, textureVariant(mat, surfaceId)); };
  const ctx = createScene(stage, quality);
  const sets = await Promise.all(SURFACES.map((s) => setFor(s.id, state0.surfaces[s.id])));
  const surfaceMaterials = Object.fromEntries(SURFACES.map((s, i) => [s.id, createSurfaceMaterial(s.id, sets[i])]));

  progress(0.3, 'Montando a casa');
  const house = await loadHouse({ surfaceMaterials, quality, glbUrl, onProgress: (p) => progress(0.3 + p * 0.35, 'Trazendo os móveis') });
  ctx.scene.add(house.root);
  ctx.setLamps(house.lamps, house.shadeMaterial);
  ctx.onDaylight(house.applyDaylight);
  ctx.setDaylight(state0.time);
  await Promise.race([ctx.envReady, new Promise((r) => setTimeout(r, 4000))]);

  progress(0.72, 'Acendendo as luzes');
  const rig = createCameraRig(ctx, house, gsap, reduceMotion);
  // Posição inicial (sem voo) para compilar os shaders com a câmera certa.
  const pose = rig.overviewPose();
  ctx.camera.position.copy(pose.position);
  ctx.controls.target.copy(pose.target);
  ctx.camera.lookAt(ctx.controls.target);
  // Com a aba em segundo plano a compilação assíncrona pode demorar muito: no pior caso compila no primeiro quadro.
  await Promise.race([ctx.renderer.compileAsync(ctx.scene, ctx.camera), new Promise((r) => setTimeout(r, 3500))]).catch(() => {});
  progress(0.85, 'Últimos retoques');

  let ui = null; // criada depois da cena; os callbacks abaixo só disparam com o cliente interagindo
  // Posições de móveis salvas no estado (link/rascunho) entram sem animação.
  const interaction = createInteraction(ctx, house, {
    gsap, reduceMotion,
    onFurnitureMoved: (id, pos) => store.moveFurniture(id, pos),
    onEnterRoom: (room) => api.enterRoom(room.id),
    onSelectFurniture: (f, lifted) => ui?.furnitureLifted(f, lifted),
  });
  interaction.applyFurniture(state0, { animate: false });

  // ---------- estado → cena ----------
  const farthest = (box, p) => {
    let d = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) d = Math.max(d, p.distanceTo(new THREE.Vector3(x, y, z)));
    return d + 0.3;
  };
  const globalRadius = () => Math.max(...SURFACES.map((s) => farthest(house.surfaceBox[s.id], LIVING_CENTER)));

  async function applySurface(surfaceId, change) {
    const matId = store.get().surfaces[surfaceId];
    const set = await setFor(surfaceId, matId);
    if (store.get().surfaces[surfaceId] !== matId) return; // o cliente já trocou de novo
    const material = surfaceMaterials[surfaceId];
    const box = house.surfaceBox[surfaceId];
    let origin, radius, duration;
    if (change.type === 'preset') {
      origin = LIVING_CENTER; radius = globalRadius(); duration = radius / WAVE_SPEED;
    } else {
      origin = change.point && change.surfaces.length === 1 ? change.point : (house.anchors[surfaceId] || box.getCenter(new THREE.Vector3()));
      radius = farthest(box, origin);
      duration = Math.min(1.5, Math.max(0.75, radius * 0.16));
    }
    changeSurfaceMaterial(material, set, { origin, radius, duration, gsap, reduceMotion, onUpdate: ctx.requestRender });
  }

  // Hora: tween suave quando o preset/desfazer muda o horário (o sol "anda").
  const clock = { t: state0.time };
  let timeTween = null;
  function animateTime(from, to) {
    timeTween?.kill();
    if (from === to || from == null || reduceMotion) { clock.t = to; ctx.setDaylight(to); ui?.daylight(to); return; }
    clock.t = from;
    ctx.beginActive();
    timeTween = gsap.to(clock, {
      t: to, duration: 1.4, ease: 'matchOut',
      onUpdate: () => { ctx.setDaylight(clock.t); ui?.daylight(clock.t); },
      onComplete: () => { timeTween = null; ctx.endActive(); },
      onInterrupt: () => ctx.endActive(),
    });
  }

  let thumbsTimer = null;
  store.subscribe((state, change) => {
    if (change.type === 'time') {
      timeTween?.kill(); timeTween = null;
      clock.t = state.time;
      ctx.setDaylight(state.time, { updateShadows: !change.transient || !quality.low });
    }
    const ids = change.surfaces || [];
    if (change.type === 'preset' && ids.length > 1) {
      // espera as texturas de todas as superfícies para a onda sair inteira, de uma vez
      Promise.all(ids.map((sid) => setFor(sid, state.surfaces[sid]))).then(() => ids.forEach((sid) => applySurface(sid, change)));
    } else ids.forEach((sid) => applySurface(sid, change));
    if (change.type === 'preset' || change.type === 'history') animateTime(change.fromTime, state.time);
    if (change.type === 'history') interaction.applyFurniture(state);
    ui.update(state, change);
    if (!change.transient) onChange?.(state);
    // Miniaturas do painel "Luz do dia" acompanham os materiais escolhidos.
    if (change.surfaces?.length) { clearTimeout(thumbsTimer); thumbsTimer = setTimeout(refreshThumbs, 1800); }
  });

  // ---------- realce de superfície durante o arraste ----------
  let hovered = null;
  function hover(surfaceId) {
    if (surfaceId === hovered) return;
    const tween = (sid, value) => {
      const u = surfaceMaterials[sid].userData.reveal.uHover;
      if (reduceMotion) { u.value = value; ctx.requestRender(); return; }
      gsap.to(u, { value, duration: 0.22, ease: 'matchOut', onUpdate: ctx.requestRender });
    };
    if (hovered) tween(hovered, 0);
    hovered = surfaceId;
    if (surfaceId) tween(surfaceId, 0.2);
  }

  // ---------- miniaturas de cada horário (renders reais da maquete) ----------
  function captureThumbs() {
    if (rig.mode !== 'overview' || rig.flying) return null;
    const saved = clock.t;
    const out = {};
    const thumb = document.createElement('canvas');
    thumb.width = 320; thumb.height = 188;
    const t2d = thumb.getContext('2d');
    for (const d of DAYLIGHT) {
      ctx.setDaylight(d.time);
      // recorte no centro: a maquete preenche a miniatura
      const full = ctx.capture(1000);
      const cw = full.width * 0.6, ch = cw * (thumb.height / thumb.width);
      t2d.drawImage(full, (full.width - cw) / 2, (full.height - ch) / 2, cw, ch, 0, 0, thumb.width, thumb.height);
      out[d.id] = thumb.toDataURL('image/jpeg', 0.8);
    }
    ctx.setDaylight(saved);
    return out;
  }
  function refreshThumbs() {
    const thumbs = captureThumbs();
    if (thumbs) ui.setThumbs(thumbs);
  }

  // ---------- API usada pela interface ----------
  const roomById = (id) => house.rooms.find((r) => r.id === id);
  const api = {
    store, house, ctx, gsap, reduceMotion, quality, projectName,
    mode, // 'create' (novo projeto) ou 'edit' (cliente voltou a um projeto que já existe)
    pickSurface: (x, y) => interaction.pickSurface(x, y),
    hover,
    project(v) {
      const p = v.clone().project(ctx.camera);
      const r = ctx.renderer.domElement.getBoundingClientRect();
      return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height, visible: p.z < 1 };
    },
    enterRoom(id) {
      const room = roomById(id);
      if (!room) return;
      interaction.drop();
      ui.roomMode(room);
      rig.enterRoom(room);
    },
    overview() {
      ui.roomMode(null);
      rig.overview();
    },
    get cameraMode() { return rig.mode; },
    selectFurniture(id) {
      const f = interaction.selectFurniture(id);
      if (f) rig.focus(new THREE.Vector3(f.group.position.x, 0.4, f.group.position.z));
      return f;
    },
    nudge: (dx, dz) => interaction.nudge(dx, dz),
    dropFurniture: () => interaction.drop(),
    capture: (w = 1400) => ctx.capture(w),
    /** Baixa antes as texturas das amostras visíveis (a troca começa sem espera). */
    prefetch(matIds) {
      matIds.forEach((id) => {
        const mat = MATERIAL_BY_ID[id];
        if (!mat) return;
        SURFACES.filter((s) => s.accepts.includes(mat.tab)).map((s) => textureVariant(mat, s.id))
          .filter((v, i, a) => a.indexOf(v) === i).forEach((v) => loadTextureSet(mat, v).catch(() => {}));
      });
    },
    experience: () => toExperience(store.get(), house.furnitureMeta),
    finish: (experience) => onFinish?.(experience),
    back: () => onBack?.(store.get()),
  };

  ui = createUI(host, api);
  ui.update(store.get(), { type: 'init' });
  // Só em testes (?debug): acesso pelo console e animações que não congelam com a aba em segundo plano.
  if (new URLSearchParams(location.search).has('debug')) {
    gsap.ticker.lagSmoothing(0);
    // Painel de testes sem pintura não roda requestAnimationFrame: avança o GSAP e desenha à mão.
    setInterval(() => { gsap.ticker.tick(); ctx.step(); }, 50);
    window.__x3 = { api, rig, ctx, house, interaction, gsap };
  }
  progress(1, 'Pronto');

  // Depois da entrada, baixa as texturas dos climas prontos (as trocas mais prováveis).
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
  const warm = () => api.prefetch([...new Set(PRESETS.flatMap((p) => Object.values(p.surfaces)))]);

  return {
    store,
    experience: api.experience,
    /** Chamado quando o cliente fecha a introdução. */
    start() {
      ui.reveal();
      rig.intro(() => {
        refreshThumbs();
        idle(warm);
      });
    },
    unmount() {
      clearTimeout(thumbsTimer);
      timeTween?.kill();
      ui.dispose();
      interaction.dispose();
      ctx.dispose();
      disposeTextures();
    },
  };
}
