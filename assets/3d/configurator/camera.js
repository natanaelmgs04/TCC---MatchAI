/**
 * Movimentos de câmera: visão geral da maquete (orbita limitada, como no
 * vídeo) e "mergulho" em um ambiente na altura dos olhos. Posição e alvo
 * sempre no mesmo timeline GSAP, com a curva de easing do site (matchOut).
 */
import * as THREE from 'three';

const V = (a) => new THREE.Vector3(...a);

export function createCameraRig(ctx, house, gsap, reduceMotion) {
  const { camera, controls, requestRender, beginActive, endActive } = ctx;
  let mode = 'overview';
  let flight = null;

  /**
   * Vista geral que cabe na tela: mesma direção do OVERVIEW, mas afasta a
   * câmera quando a tela é estreita (celular em pé) para a casa inteira caber.
   */
  const FIT_RADIUS = 7.4; // meia diagonal do pedestal, com folga
  function overviewPose() {
    const target = V(house.overview.target);
    const dir = V(house.overview.position).sub(target);
    const halfV = THREE.MathUtils.degToRad(camera.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    const distance = Math.max(dir.length(), FIT_RADIUS / Math.sin(Math.min(halfV, halfH)));
    const position = target.clone().add(dir.normalize().multiplyScalar(distance));
    // Em pé, a bandeja ocupa o terço de baixo: desce a câmera para a casa subir na tela.
    if (camera.aspect < 0.9) {
      const forward = dir.clone().negate();
      const up = new THREE.Vector3().crossVectors(new THREE.Vector3().crossVectors(forward, camera.up).normalize(), forward).normalize();
      const shift = up.multiplyScalar(-0.07 * 2 * distance * Math.tan(halfV));
      position.add(shift); target.add(shift);
    }
    return { position, target, distance };
  }

  function limitsOverview() {
    const { position, target, distance } = overviewPose();
    const dir = position.clone().sub(target);
    const baseAz = Math.atan2(dir.x, dir.z);
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 1.18;
    controls.minAzimuthAngle = baseAz - 0.75;
    controls.maxAzimuthAngle = baseAz + 0.75;
    controls.minDistance = Math.min(12, distance * 0.6);
    controls.maxDistance = distance * 1.4;
  }
  function limitsRoom() {
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.48;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minDistance = 1.2;
    controls.maxDistance = 7;
  }

  // Durante o voo os limites ficam livres (OrbitControls.update() prenderia a
  // câmera no meio do caminho); cada destino reaplica os seus ao chegar.
  function freeLimits() {
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    controls.minDistance = 0; controls.maxDistance = Infinity;
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  }
  const applyLimits = () => (mode === 'room' ? limitsRoom() : limitsOverview());

  function flyTo(position, target, { duration = 1.25, onComplete } = {}) {
    flight?.kill();
    freeLimits();
    if (reduceMotion) {
      camera.position.copy(position); controls.target.copy(target); controls.update(); requestRender();
      onComplete?.();
      return;
    }
    controls.enabled = false;
    beginActive();
    flight = gsap.timeline({
      defaults: { duration, ease: 'matchOut' },
      onUpdate: () => { camera.lookAt(controls.target); requestRender(); },
      onComplete: () => { controls.enabled = true; controls.update(); endActive(); flight = null; onComplete?.(); },
      onInterrupt: () => { controls.enabled = true; applyLimits(); endActive(); },
    });
    flight.to(camera.position, { x: position.x, y: position.y, z: position.z }, 0)
      .to(controls.target, { x: target.x, y: target.y, z: target.z }, 0);
  }

  return {
    get mode() { return mode; },
    overviewPose,
    get flying() { return !!flight; },
    /** Entrada: da vista alta e distante até a maquete. */
    intro(onComplete) {
      const { position: end, target } = overviewPose();
      const start = end.clone().sub(target).multiplyScalar(1.45).add(target).add(new THREE.Vector3(-4, 4, 0));
      camera.position.copy(reduceMotion ? end : start);
      controls.target.copy(target);
      camera.lookAt(target);
      flyTo(end, target, { duration: 2.4, onComplete: () => { applyLimits(); onComplete?.(); } });
    },
    overview(onComplete) {
      mode = 'overview';
      const { position, target } = overviewPose();
      flyTo(position, target, { duration: 1.3, onComplete: () => { applyLimits(); onComplete?.(); } });
    },
    enterRoom(room, onComplete) {
      mode = 'room';
      flyTo(V(room.view.position), V(room.view.target), { duration: 1.35, onComplete: () => { applyLimits(); onComplete?.(); } });
    },
    /** Aproxima de um ponto (ex.: móvel escolhido pelo teclado), mantendo o ângulo atual. */
    focus(point, distance = mode === 'room' ? 3.2 : 9) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      flyTo(point.clone().add(dir.multiplyScalar(distance)), point.clone(), { duration: 1, onComplete: applyLimits });
    },
    interrupt() { flight?.kill(); flight = null; controls.enabled = true; },
  };
}
