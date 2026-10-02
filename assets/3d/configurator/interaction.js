/**
 * Interação direta com a maquete:
 *  - arrastar um móvel: ele se levanta, uma base de vidro aparece no piso e
 *    o móvel desliza suavemente atrás do cursor; ao soltar, pousa (como no vídeo);
 *  - pickSurface(): qual superfície configurável está sob um ponto da tela
 *    (usado quando o cliente arrasta uma amostra da bandeja);
 *  - duplo clique no piso: entra naquele ambiente.
 * Teclado: selectFurniture()/nudge()/drop() fazem o mesmo sem mouse.
 */
import * as THREE from 'three';

const DRAG_THRESHOLD = 5;
const LIFT = 0.16;

export function createInteraction(ctx, house, { gsap, reduceMotion, onFurnitureMoved, onEnterRoom, onSelectFurniture }) {
  const { renderer, camera, controls, scene, requestRender, beginActive, endActive } = ctx;
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmp = new THREE.Vector3();

  const footprint = createFootprint();
  scene.add(footprint);

  let drag = null;       // { f, offset, target, startX, startY, moved }
  let selected = null;   // móvel escolhido pelo teclado

  function setNdc(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function hitFurniture(clientX, clientY) {
    setNdc(clientX, clientY);
    const hit = raycaster.intersectObjects(house.furnitureMeshes, false)[0];
    return hit ? house.furniture.get(hit.object.userData.furnitureId) : null;
  }

  function pickSurface(clientX, clientY) {
    setNdc(clientX, clientY);
    // Móveis na frente bloqueiam (ex.: piso atrás de uma poltrona).
    const hits = raycaster.intersectObjects([...house.pickables, ...house.furnitureMeshes], false);
    const hit = hits.find((h) => h.object.userData.surface);
    if (!hit || (hits[0] !== hit && !hits[0].object.userData.surface)) return null;
    return { surface: hit.object.userData.surface, point: hit.point.clone() };
  }

  function floorPoint(clientX, clientY) {
    setNdc(clientX, clientY);
    return raycaster.ray.intersectPlane(floorPlane, tmp) ? tmp.clone() : null;
  }

  function clampToBounds(f, p) {
    const b = house.bounds, hw = f.size.w / 2 + 0.05, hd = f.size.d / 2 + 0.05;
    p.x = Math.max(b.x0 + hw, Math.min(b.x1 - hw, p.x));
    p.z = Math.max(b.z0 + hd, Math.min(b.z1 - hd, p.z));
    return p;
  }

  // ---------- levantar / pousar ----------
  function lift(f) {
    gsap.killTweensOf(f.group.position, 'y');
    footprint.scale.set(f.size.w + 0.3, 1, f.size.d + 0.3);
    footprint.position.set(f.group.position.x, 0.012, f.group.position.z);
    footprint.visible = true;
    beginActive();
    if (reduceMotion) { f.group.position.y = LIFT; footprint.material.uniforms.uOpacity.value = 1; return; }
    gsap.to(f.group.position, { y: LIFT, duration: 0.24, ease: 'matchOut' });
    gsap.to(footprint.material.uniforms.uOpacity, { value: 1, duration: 0.25, ease: 'matchOut' });
  }
  function settle(f, moved) {
    const done = () => { footprint.visible = false; ctx.updateShadows(); endActive(); };
    if (reduceMotion) { f.group.position.y = 0; footprint.material.uniforms.uOpacity.value = 0; done(); }
    else {
      gsap.to(f.group.position, { y: 0, duration: 0.32, ease: 'back.out(1.6)' });
      gsap.to(footprint.material.uniforms.uOpacity, { value: 0, duration: 0.35, delay: 0.08, ease: 'power2.out', onComplete: done });
    }
    if (moved) onFurnitureMoved(f.id, { x: f.group.position.x, z: f.group.position.z });
  }

  // ---------- ponteiro ----------
  // Captura no pai do canvas: decide ANTES do OrbitControls se o gesto é
  // arrastar um móvel (aí a câmera não gira).
  const host = canvas.parentElement;
  function onPointerDown(e) {
    if (e.button !== 0 || e.target !== canvas) return;
    const f = hitFurniture(e.clientX, e.clientY);
    if (!f) return;
    e.stopPropagation();
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    const p = floorPoint(e.clientX, e.clientY) || f.group.position.clone();
    drag = { f, pointerId: e.pointerId, offset: new THREE.Vector3(f.group.position.x - p.x, 0, f.group.position.z - p.z), target: f.group.position.clone(), startX: e.clientX, startY: e.clientY, moved: false };
    canvas.classList.add('is-grabbing');
    lift(f);
    onSelectFurniture?.(f, true);
  }
  function onPointerMove(e) {
    if (drag && e.pointerId === drag.pointerId) {
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      const p = floorPoint(e.clientX, e.clientY);
      if (p) drag.target.copy(clampToBounds(drag.f, p.add(drag.offset)));
      return;
    }
    if (e.pointerType === 'mouse' && !e.buttons) {
      canvas.classList.toggle('is-grab', !!hitFurniture(e.clientX, e.clientY));
    }
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { f, moved } = drag;
    drag = null;
    canvas.classList.remove('is-grabbing');
    controls.enabled = true;
    settle(f, moved);
    onSelectFurniture?.(f, false);
  }
  function onDblClick(e) {
    if (hitFurniture(e.clientX, e.clientY)) return;
    const p = floorPoint(e.clientX, e.clientY);
    if (!p) return;
    const room = house.rooms.find((r) => p.x >= r.bounds.x0 && p.x <= r.bounds.x1 && p.z >= r.bounds.z0 && p.z <= r.bounds.z1);
    if (room) onEnterRoom(room);
  }

  // Suaviza o móvel em direção ao alvo a cada quadro enquanto arrasta.
  const stopFrame = ctx.onFrame(() => {
    if (!drag?.moved) return;
    const g = drag.f.group.position;
    const k = reduceMotion ? 1 : 0.24;
    g.x += (drag.target.x - g.x) * k;
    g.z += (drag.target.z - g.z) * k;
    footprint.position.x = g.x;
    footprint.position.z = g.z;
    requestRender();
  });

  host.addEventListener('pointerdown', onPointerDown, true);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('dblclick', onDblClick);

  // ---------- teclado (alternativa acessível ao arraste) ----------
  function selectFurniture(id) {
    if (selected) drop();
    const f = house.furniture.get(id);
    if (!f) return null;
    selected = { f, moved: false };
    lift(f);
    return f;
  }
  function nudge(dx, dz) {
    if (!selected) return;
    const g = selected.f.group.position;
    const p = clampToBounds(selected.f, new THREE.Vector3(g.x + dx, 0, g.z + dz));
    selected.moved = true;
    if (reduceMotion) { g.x = p.x; g.z = p.z; footprint.position.set(p.x, 0.012, p.z); requestRender(); return; }
    gsap.to(g, { x: p.x, z: p.z, duration: 0.18, ease: 'matchOut', onUpdate: () => { footprint.position.x = g.x; footprint.position.z = g.z; requestRender(); } });
  }
  function drop() {
    if (!selected) return;
    const { f, moved } = selected;
    selected = null;
    settle(f, moved);
  }

  /** Aplica posições vindas do estado (desfazer, link, restauração). */
  function applyFurniture(state, { animate = true } = {}) {
    for (const f of house.furniture.values()) {
      if (drag?.f === f || selected?.f === f) continue;
      const pos = state.furniture[f.id] || f.home;
      if (Math.abs(f.group.position.x - pos.x) < 1e-3 && Math.abs(f.group.position.z - pos.z) < 1e-3) continue;
      if (!animate || reduceMotion) { f.group.position.x = pos.x; f.group.position.z = pos.z; continue; }
      gsap.to(f.group.position, { x: pos.x, z: pos.z, duration: 0.6, ease: 'matchOut', onUpdate: requestRender, onComplete: ctx.updateShadows });
    }
    ctx.updateShadows();
  }

  return {
    pickSurface, selectFurniture, nudge, drop, applyFurniture,
    get selected() { return selected?.f || null; },
    dispose() {
      stopFrame();
      host.removeEventListener('pointerdown', onPointerDown, true);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('dblclick', onDblClick);
    },
  };
}

/** Base de vidro sob o móvel levantado: retângulo arredondado translúcido com borda luminosa. */
function createFootprint() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#dfeef8') }, uRim: { value: new THREE.Color('#ffffff') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv; uniform float uOpacity; uniform vec3 uColor; uniform vec3 uRim;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        vec2 p = vUv - 0.5;
        float d = sdRound(p, vec2(0.5), 0.12);
        if (d > 0.0) discard;
        float rim = smoothstep(-0.045, 0.0, d);
        float glow = smoothstep(-0.16, 0.0, d);
        vec3 col = mix(uColor, uRim, rim);
        float a = (0.16 + glow * 0.22 + rim * 0.6) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  mesh.visible = false;
  return mesh;
}
