/**
 * Estado central da experiência 3D. Um único objeto; UI, cliques no 3D e
 * arrastes só chamam os métodos daqui, e quem desenha (cena, painéis) assina
 * as mudanças. Desfazer/refazer guardam fotografias do estado inteiro.
 *
 *   state = { preset, surfaces: { piso: 'carvalho-mel', … }, time: minutos,
 *             furniture: { 'poltrona-sala': { x, z } } }
 */
import { SURFACES, MATERIAL_BY_ID, PRESETS, MOOD_WORDS, DAYLIGHT, DEFAULT_PRESET, DAY_START, DAY_END } from './data/options.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const HISTORY_LIMIT = 40;

export function presetState(id = DEFAULT_PRESET) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  return { preset: p.id, surfaces: { ...p.surfaces }, time: p.time, furniture: {} };
}

/** Garante um estado válido mesmo vindo de link/armazenamento antigo. */
export function sanitize(raw) {
  const base = presetState(raw?.preset);
  if (!raw || typeof raw !== 'object') return base;
  for (const s of SURFACES) {
    const id = raw.surfaces?.[s.id];
    const mat = MATERIAL_BY_ID[id];
    if (mat && s.accepts.includes(mat.tab)) base.surfaces[s.id] = id;
  }
  const t = Number(raw.time);
  if (Number.isFinite(t)) base.time = Math.max(DAY_START, Math.min(DAY_END, Math.round(t)));
  if (raw.furniture && typeof raw.furniture === 'object') {
    for (const [k, v] of Object.entries(raw.furniture)) {
      if (Number.isFinite(v?.x) && Number.isFinite(v?.z)) base.furniture[k] = { x: v.x, z: v.z };
    }
  }
  base.preset = PRESETS.some((p) => p.id === raw.preset && matchesPreset(base, p)) ? raw.preset : null;
  return base;
}

function matchesPreset(state, p) {
  return SURFACES.every((s) => state.surfaces[s.id] === p.surfaces[s.id]);
}

export function createStore(initial) {
  let state = sanitize(initial);
  const past = [];
  const future = [];
  const listeners = new Set();

  const emit = (change) => listeners.forEach((fn) => fn(state, change));
  function commit(next, change) {
    past.push(state);
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    state = next;
    emit(change);
  }
  const withPreset = (next) => {
    next.preset = PRESETS.find((p) => matchesPreset(next, p))?.id || null;
    return next;
  };

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    setSurface(surfaceId, materialId, meta = {}) {
      const s = SURFACES.find((x) => x.id === surfaceId);
      const mat = MATERIAL_BY_ID[materialId];
      if (!s || !mat || !s.accepts.includes(mat.tab) || state.surfaces[surfaceId] === materialId) return false;
      const next = clone(state);
      next.surfaces[surfaceId] = materialId;
      commit(withPreset(next), { type: 'surface', surfaces: [surfaceId], ...meta });
      return true;
    },

    applyPreset(presetId, meta = {}) {
      const p = PRESETS.find((x) => x.id === presetId);
      if (!p) return;
      const next = clone(state);
      const changed = SURFACES.filter((s) => next.surfaces[s.id] !== p.surfaces[s.id]).map((s) => s.id);
      next.surfaces = { ...p.surfaces };
      next.time = p.time;
      next.preset = p.id;
      commit(next, { type: 'preset', surfaces: changed, fromTime: state.time, ...meta });
    },

    /** transient: true durante o arraste do sol/slider (não vira histórico). */
    setTime(minutes, { transient = false, ...meta } = {}) {
      const t = Math.max(DAY_START, Math.min(DAY_END, Math.round(minutes)));
      if (t === state.time && transient) return;
      if (transient) { state = { ...state, time: t }; emit({ type: 'time', transient: true, ...meta }); return; }
      const next = clone(state);
      next.time = t;
      commit(next, { type: 'time', ...meta });
    },
    /** Fecha um arraste de luz como um único passo no histórico. */
    commitTime(fromTime) {
      if (fromTime === state.time) return;
      const before = { ...clone(state), time: fromTime };
      past.push(before);
      if (past.length > HISTORY_LIMIT) past.shift();
      future.length = 0;
      emit({ type: 'time', settled: true });
    },

    moveFurniture(id, pos) {
      const next = clone(state);
      next.furniture[id] = { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) };
      commit(next, { type: 'furniture', id });
    },

    undo() {
      if (!past.length) return;
      future.push(state);
      const prev = past.pop();
      const surfaces = SURFACES.filter((s) => prev.surfaces[s.id] !== state.surfaces[s.id]).map((s) => s.id);
      const fromTime = state.time;
      state = prev;
      emit({ type: 'history', surfaces, fromTime });
    },
    redo() {
      if (!future.length) return;
      past.push(state);
      const next = future.pop();
      const surfaces = SURFACES.filter((s) => next.surfaces[s.id] !== state.surfaces[s.id]).map((s) => s.id);
      const fromTime = state.time;
      state = next;
      emit({ type: 'history', surfaces, fromTime });
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Dados derivados — nunca guardados, sempre calculados do estado.
// ---------------------------------------------------------------------------
export const formatTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function daylightLabel(min) {
  if (min < 10 * 60) return 'Manhã';
  if (min < 16 * 60) return 'Meio-dia';
  if (min < 20 * 60) return 'Fim de tarde';
  return 'Noite';
}

/** Peso de cada clima conforme a hora (curvas suaves, sem degraus). */
function timeMood(min) {
  const h = min / 60;
  const bell = (c, w) => Math.exp(-(((h - c) / w) ** 2));
  return { bright: 4 * bell(12.5, 3.2) + 1.5 * bell(8, 1.6), cozy: 4 * bell(18.3, 1.5), moody: 4.2 * Math.max(0, Math.min(1, (h - 19.4) / 2)) };
}

export function computeMood(state) {
  const acc = { cozy: 0, bright: 0, moody: 0 };
  for (const s of SURFACES) {
    const mood = MATERIAL_BY_ID[state.surfaces[s.id]]?.mood || {};
    for (const k of Object.keys(acc)) acc[k] += (mood[k] || 0) * s.weight;
  }
  const t = timeMood(state.time);
  for (const k of Object.keys(acc)) acc[k] += t[k] * 3.2;
  const total = acc.cozy + acc.bright + acc.moody || 1;
  const pct = { cozy: Math.round((acc.cozy / total) * 100), bright: Math.round((acc.bright / total) * 100) };
  pct.moody = Math.max(0, 100 - pct.cozy - pct.bright);
  return pct;
}

export function dominantMood(mood) {
  return Object.entries(mood).sort((a, b) => b[1] - a[1])[0][0];
}

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** A frase viva do painel: descreve a combinação atual em português. */
export function describe(state, mood = computeMood(state)) {
  const walls = MATERIAL_BY_ID[state.surfaces.paredes];
  const floor = MATERIAL_BY_ID[state.surfaces.piso];
  const t = state.time;
  const light = t >= 20 * 60 ? 'as luminárias acesas' : t >= 17 * 60 ? 'um sol baixo e dourado' : t >= 10 * 60 ? 'o sol a pino' : 'a luz suave da manhã';
  const dom = dominantMood(mood);
  const feel = { cozy: 'quente e acolhedor', bright: 'claro e arejado', moody: 'profundo e envolvente' }[dom];
  const wallsPhrase = walls.tab === 'pedra' ? `paredes em ${lower(walls.label)}` : `paredes ${walls.tab === 'tinta' ? 'em' : 'de'} ${lower(walls.label)}`;
  return {
    text: `${wallsPhrase.charAt(0).toUpperCase() + wallsPhrase.slice(1)}, piso de ${lower(floor.label)} e ${light}: ${feel}.`,
    word: MOOD_WORDS[dom],
  };
}

/** Estilos sugeridos pelas escolhas (vocabulário de PROJECT_STYLES). */
export function deriveStyles(state) {
  const score = new Map();
  for (const s of SURFACES) {
    for (const st of MATERIAL_BY_ID[state.surfaces[s.id]]?.styles || []) score.set(st, (score.get(st) || 0) + s.weight);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([st]) => st);
}

/** Materiais no vocabulário dos arquitetos, para o match. */
export function deriveMaterials(state) {
  const key = ['piso', 'paredes', 'parede-destaque', 'marcenaria', 'estofados'];
  return [...new Set(key.map((k) => MATERIAL_BY_ID[state.surfaces[k]]?.matchName).filter(Boolean))];
}

/**
 * O que vai para o back-end (normalizado em backend/src/services/projectPreferences.js)
 * e para o resumo final. `furnitureMeta` vem da casa (rótulo e ambiente de cada móvel).
 */
export function toExperience(state, furnitureMeta = {}) {
  const mood = computeMood(state);
  const surfaces = {};
  for (const s of SURFACES) {
    const mat = MATERIAL_BY_ID[state.surfaces[s.id]];
    surfaces[s.id] = { surface: s.label, id: mat.id, label: mat.label };
  }
  const furniture = Object.keys(state.furniture)
    .map((id) => furnitureMeta[id] && { label: furnitureMeta[id].label, area: furnitureMeta[id].area })
    .filter(Boolean);
  const styles = deriveStyles(state);
  const desc = describe(state, mood);
  const preset = DAYLIGHT.reduce((a, b) => (Math.abs(b.time - state.time) < Math.abs(a.time - state.time) ? b : a));
  return {
    styles,
    materials: deriveMaterials(state),
    mood,
    payload: {
      v: 1,
      preset: state.preset || 'personalizado',
      mood,
      time: formatTime(state.time),
      timeLabel: preset.label,
      surfaces,
      furniture,
      summary: `${desc.text} O clima é ${desc.word}.`,
      styles,
      // Estado cru da cena: é o que permite reabrir a experiência depois e continuar de onde parou.
      scene: clone({ preset: state.preset, surfaces: state.surfaces, time: state.time, furniture: state.furniture }),
    },
  };
}
