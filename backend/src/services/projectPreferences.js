// Preferências extras do projeto vindas do novo fluxo de criação
// (novo-projeto.html + experiencia-3d.html): notas de estilo livres, escolhas
// por imagem e a configuração montada na experiência 3D. Tudo chega do
// navegador, então cada campo é recortado para um formato conhecido e com
// tamanho limitado antes de ir para o banco ou para o prompt da IA.

// Mesmo vocabulário de PROJECT_STYLES em assets/js/dashboard.js — é o que o
// motor de match compara com o portfólio dos arquitetos.
export const PROJECT_STYLES = ["Moderno", "Contemporâneo", "Minimalista", "Industrial", "Clássico", "Rústico", "Escandinavo", "Biofílico", "Brutalista", "Alto padrão"];

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const onlyStyles = (v) => (Array.isArray(v) ? [...new Set(v.filter((s) => PROJECT_STYLES.includes(s)))] : []);
const clampPct = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : 0);

export function normalizeStyleNotes(value) {
  return str(value, 2000) || undefined;
}

export function normalizeStylePicks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 10)
    .map((p) => ({ question: str(p?.question, 120), choice: str(p?.choice, 120), styles: onlyStyles(p?.styles) }))
    .filter((p) => p.question && p.choice);
}

// Estado cru da experiência 3D (ids de material por superfície, hora em
// minutos e posição dos móveis), guardado para o cliente reabrir e continuar
// mexendo. O navegador ainda valida tudo contra o catálogo ao carregar.
const ID_RE = /^[\w-]{1,40}$/;
const coord = (v) => (Number.isFinite(v) ? Math.max(-50, Math.min(50, Math.round(v * 1000) / 1000)) : null);

function normalizeScene(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const surfaces = {};
  if (value.surfaces && typeof value.surfaces === "object") {
    for (const [k, id] of Object.entries(value.surfaces).slice(0, 12)) {
      if (ID_RE.test(k) && typeof id === "string" && ID_RE.test(id)) surfaces[k] = id;
    }
  }
  const furniture = {};
  if (value.furniture && typeof value.furniture === "object") {
    for (const [k, p] of Object.entries(value.furniture).slice(0, 30)) {
      const x = coord(p?.x);
      const z = coord(p?.z);
      if (ID_RE.test(k) && x !== null && z !== null) furniture[k] = { x, z };
    }
  }
  const time = Number(value.time);
  if (!Object.keys(surfaces).length) return undefined;
  return {
    preset: typeof value.preset === "string" && ID_RE.test(value.preset) ? value.preset : null,
    surfaces,
    time: Number.isFinite(time) ? Math.max(0, Math.min(1439, Math.round(time))) : undefined,
    furniture,
  };
}

export function normalizeExperience(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const surfaces = {};
  if (value.surfaces && typeof value.surfaces === "object") {
    for (const [key, s] of Object.entries(value.surfaces).slice(0, 12)) {
      const k = str(key, 30).replace(/[^\w-]/g, "");
      if (!k || !s || typeof s !== "object") continue;
      const label = str(s.label, 60);
      if (label) surfaces[k] = { surface: str(s.surface, 40), id: str(s.id, 40), label };
    }
  }
  const furniture = Array.isArray(value.furniture)
    ? value.furniture.slice(0, 20).map((f) => ({ label: str(f?.label, 60), area: str(f?.area, 40) })).filter((f) => f.label)
    : [];
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) ? value.time : "";
  const out = {
    v: 1,
    preset: str(value.preset, 40),
    mood: { cozy: clampPct(value.mood?.cozy), bright: clampPct(value.mood?.bright), moody: clampPct(value.mood?.moody) },
    time,
    timeLabel: str(value.timeLabel, 30),
    surfaces,
    furniture,
    summary: str(value.summary, 400),
    styles: onlyStyles(value.styles),
    scene: normalizeScene(value.scene),
  };
  if (!out.scene) delete out.scene;
  return Object.keys(surfaces).length || time || out.summary ? out : undefined;
}

/** Texto legível para o prompt das IAs (cliente e arquiteto). */
export function experienceToText(exp) {
  if (!exp) return "";
  const lines = [];
  for (const s of Object.values(exp.surfaces || {})) lines.push(`${s.surface || "superfície"}: ${s.label}`);
  if (exp.time) lines.push(`luz preferida: ${exp.timeLabel || "personalizada"} (${exp.time})`);
  const m = exp.mood || {};
  if (m.cozy || m.bright || m.moody) lines.push(`clima resultante: aconchegante ${m.cozy}%, luminoso ${m.bright}%, intimista ${m.moody}%`);
  if (exp.furniture?.length) lines.push(`móveis que o cliente reposicionou: ${exp.furniture.map((f) => (f.area ? `${f.label} (${f.area})` : f.label)).join(", ")}`);
  if (exp.styles?.length) lines.push(`estilos sugeridos pelas escolhas: ${exp.styles.join(", ")}`);
  if (exp.summary) lines.push(`resumo: ${exp.summary}`);
  return lines.join("; ");
}
