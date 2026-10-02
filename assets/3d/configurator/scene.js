/**
 * Renderer, câmera, controles, luzes, ambiente HDR e pós-processamento, com
 * loop SOB DEMANDA (a maquete é estática: só desenha quando algo muda —
 * câmera, material, luz, móvel). Pausa fora da tela e com a aba escondida.
 *
 * Realismo: HDR de interior (reflexos), sol com sombra suave, GTAO (oclusão
 * de contato entre móveis, rodapés e paredes), bloom só nas luminárias,
 * MSAA e tone mapping fílmico (ACES, contraste de foto de interiores).
 *
 * Refinamento progressivo (padrão de archviz na web): enquanto algo se move
 * (câmera, arraste, onda, sol) o quadro sai direto e rápido; quando a cena
 * para, um único quadro em qualidade máxima (GTAO + bloom + MSAA) substitui o
 * rápido. Aparelho fraco: só o caminho rápido.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sample } from './daylight.js';
import { groundTexture, setAnisotropy } from './textures.js';

const ENV_URL = 'assets/3d/hdr/hotel_room_1k.hdr';
const EXPOSURE_GAIN = 0.95;
const ENV_GAIN = 0.36;       // o HDR de interior é mais forte que o RoomEnvironment; pouco preenchimento = mais profundidade

export function detectQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 520;
  const low = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || (coarse && small);
  const strong = !low && (navigator.deviceMemory || 8) >= 8 && !coarse;
  return {
    low, mobile: coarse && small,
    texSize: low ? 512 : 1024,
    shadowSize: low ? 1024 : strong ? 4096 : 2048,
    pixelRatio: Math.min(devicePixelRatio || 1, low ? 1.25 : 1.75),
    post: !low,          // GTAO + MSAA
  };
}

export function createScene(host, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: !quality.low, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'x3-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // ambiente provisório (instantâneo); o HDR real entra quando baixar
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const envReady = new HDRLoader().loadAsync(ENV_URL).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const old = scene.environment;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentRotation.y = -0.6;
    old?.dispose(); hdr.dispose(); pmrem.dispose();
    requestRender();
  }).catch(() => { pmrem.dispose(); });

  // Céu dentro da cena (degradê que acompanha a hora)
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.backgroundIntensity = 1;
  function paintSky(top, bottom) {
    const c = skyCanvas.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top); g.addColorStop(0.58, bottom); g.addColorStop(1, '#0d0c0b');
    c.fillStyle = g; c.fillRect(0, 0, 2, 256);
    skyTex.needsUpdate = true;
  }

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;

  // Sol (única luz com sombra) + hemisférica
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  Object.assign(sun.shadow.camera, { left: -8.5, right: 8.5, top: 8.5, bottom: -8.5, near: 1, far: 42 });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = quality.low ? 2 : 4;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#dfe8f1', '#4a3e33', 0.6);
  scene.add(hemi);

  // Chão escuro com linhas-guia em terracota sob o pedestal
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshBasicMaterial({ map: groundTexture(), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.95;
  ground.renderOrder = -1;
  scene.add(ground);

  // ---------- pós-processamento ----------
  const size = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality.post ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(quality.pixelRatio);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (quality.post) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.2, thickness: 1.5, scale: 1.6, samples: 12, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    gtao.blendIntensity = 1;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.55, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let needsRender = true;
  let active = 0; // animações/arrastes em andamento pedem quadro todo frame
  const frameHooks = new Set();
  const renderHooks = new Set();
  const requestRender = () => { needsRender = true; };
  controls.addEventListener('change', requestRender);

  const fast = () => renderer.render(scene, camera);
  const draw = () => (quality.post ? composer.render() : fast());
  let lastBusy = 0, hqTimer = 0;
  const HQ_DELAY = 180;
  function scheduleHQ() {
    if (!quality.post) return;
    clearTimeout(hqTimer);
    hqTimer = setTimeout(() => {
      if (performance.now() - lastBusy < HQ_DELAY - 20 || active > 0) { scheduleHQ(); return; }
      composer.render();
      renderHooks.forEach((fn) => fn());
    }, HQ_DELAY);
  }
  const loop = (time) => {
    frameHooks.forEach((fn) => fn(time));
    const moving = controls.update();
    const busy = moving || active > 0;
    if (!needsRender && !busy) return;
    needsRender = false;
    if (busy) lastBusy = performance.now();
    fast();
    renderHooks.forEach((fn) => fn());
    scheduleHQ();
  };

  // Pausa fora da tela / aba escondida
  let visible = true;
  const sync = () => renderer.setAnimationLoop(visible && !document.hidden ? loop : null);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
  io.observe(host);
  document.addEventListener('visibilitychange', sync);
  sync();

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    // GTAO em meia resolução: a oclusão é suave por natureza, o custo cai a ~1/4
    if (gtao) gtao.setSize(Math.round(w * quality.pixelRatio * 0.5), Math.round(h * quality.pixelRatio * 0.5));
    size.set(w, h);
    camera.aspect = w / h;
    // Telas estreitas: abre o campo de visão para a maquete caber.
    camera.fov = w / h < 0.8 ? 46 : w / h < 1.2 ? 38 : 30;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let lamps = [];
  let lampShade = null;
  function setLamps(list, shade) { lamps = list; lampShade = shade; }
  const daylightHooks = new Set();

  /** Aplica a hora do dia em toda a iluminação. */
  function setDaylight(minutes, { updateShadows = true } = {}) {
    const d = sample(minutes);
    sun.color.copy(d.sunColor);
    sun.intensity = d.sunIntensity * 1.55;
    sun.position.copy(d.sunDir).multiplyScalar(22);
    hemi.color.copy(d.sky);
    hemi.groundColor.copy(d.ground);
    hemi.intensity = d.hemi * 0.33;
    scene.environmentIntensity = d.env * ENV_GAIN;
    renderer.toneMappingExposure = d.exposure * EXPOSURE_GAIN;
    const lampLevel = d.lamps;
    // sempre visíveis (intensidade 0 de dia): ligar/desligar luz recompila todos os shaders e engasga o arraste do sol
    lamps.forEach((l) => { l.light.intensity = lampLevel * 7 * l.strength; });
    if (lampShade) lampShade.emissiveIntensity = lampLevel * 3.2;
    bloom.strength = 0.12 + lampLevel * 0.38;
    paintSky(d.cssTop, d.cssBottom);
    host.style.setProperty('--x3-sky-top', d.cssTop);
    host.style.setProperty('--x3-sky-bottom', d.cssBottom);
    daylightHooks.forEach((fn) => fn(d));
    if (updateShadows) renderer.shadowMap.needsUpdate = true;
    requestRender();
    return d;
  }

  function updateShadows() { renderer.shadowMap.needsUpdate = true; requestRender(); }

  /** Imagem da cena atual (resumo, miniaturas, "salvar imagem"). */
  function capture(maxWidth = 1400) {
    draw();
    const src = renderer.domElement;
    const k = Math.min(1, maxWidth / src.width);
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function dispose() {
    clearTimeout(hqTimer);
    renderer.setAnimationLoop(null);
    io.disconnect(); ro.disconnect();
    document.removeEventListener('visibilitychange', sync);
    controls.dispose();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      [].concat(o.material).forEach((m) => { if (!m) return; Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
    });
    scene.environment?.dispose();
    skyTex.dispose();
    composer.dispose();
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return {
    renderer, scene, camera, controls, sun, hemi, composer, envReady,
    requestRender, setDaylight, setLamps, updateShadows, capture, dispose,
    onDaylight: (fn) => { daylightHooks.add(fn); return () => daylightHooks.delete(fn); },
    /** Um quadro fora do requestAnimationFrame (testes com a aba escondida). */
    step: () => loop(performance.now()),
    onFrame: (fn) => { frameHooks.add(fn); return () => frameHooks.delete(fn); },
    onRender: (fn) => { renderHooks.add(fn); return () => renderHooks.delete(fn); },
    beginActive: () => { active += 1; },
    endActive: () => { active = Math.max(0, active - 1); requestRender(); },
  };
}
