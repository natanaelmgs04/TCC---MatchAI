// Funções puras do assistente (sem rede/banco) — separadas de geminiService
// e do controller pra serem testáveis sozinhas (ver tests/assistantService.test.js).

export const MAX_TEXT = 1500;
export const MAX_IMAGES_PER_MESSAGE = 3;
export const MAX_PHOTOS_PER_CHAT = 8;
export const MAX_MESSAGES_PER_CHAT = 60;
export const MIN_USER_MESSAGES_FOR_BRIEFING = 2;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_B64 = 1_400_000; // ~1 MB de imagem (o front já reduz pra ~1280px)
const MAX_THUMB = 40_000;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Valida o que o navegador mandou como fotos. Devolve { images } limpo ou
 * { error } — nunca confia no cliente (tipo, tamanho, formato do base64).
 */
export function sanitizeImages(input) {
  if (input === undefined || input === null) return { images: [] };
  if (!Array.isArray(input)) return { error: "Formato de fotos inválido." };
  if (input.length > MAX_IMAGES_PER_MESSAGE)
    return { error: `Envie no máximo ${MAX_IMAGES_PER_MESSAGE} fotos por mensagem.` };
  const images = [];
  for (const img of input) {
    if (!img || typeof img !== "object") return { error: "Formato de fotos inválido." };
    const { mime, data, thumb } = img;
    if (!ALLOWED_MIME.has(mime)) return { error: "Só aceitamos fotos JPEG, PNG ou WebP." };
    if (typeof data !== "string" || !data.length || data.length > MAX_IMAGE_B64 || !B64_RE.test(data))
      return { error: "Uma das fotos é inválida ou grande demais." };
    const okThumb =
      typeof thumb === "string" && thumb.length <= MAX_THUMB && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(thumb);
    images.push({ mime, data, thumb: okThumb ? thumb : "" });
  }
  return { images };
}

/** Histórico no formato do SDK do Gemini: só texto, começando por "user" e alternando. */
export function buildHistory(messages, limit = 20) {
  const turns = messages
    .filter((m) => m.text && m.text.trim())
    .slice(-limit)
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  const out = [];
  for (const t of turns) {
    if (out.length && out[out.length - 1].role === t.role) out[out.length - 1].parts[0].text += `\n${t.parts[0].text}`;
    else out.push(t);
  }
  while (out.length && out[out.length - 1].role !== "model") out.pop();
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Produtos do catálogo que a IA realmente citou pelo nome na resposta. */
export function findMentionedProducts(reply, catalog) {
  const text = String(reply || "").toLowerCase();
  return catalog.filter((p) => p.name && new RegExp(escapeRe(p.name.toLowerCase())).test(text)).slice(0, 4);
}

const FIELDS = [
  ["resumo", "Resumo"],
  ["objetivos", "Objetivos"],
  ["leituraDoEspaco", "Leitura do espaço"],
  ["estiloEMateriais", "Estilo e materiais"],
  ["orcamento", "Orçamento"],
  ["prazo", "Prazo"],
  ["restricoes", "Restrições"],
  ["perguntasEmAberto", "Pontos a alinhar"],
  ["proximosPassos", "Próximo passo sugerido"],
];
export const BRIEFING_FIELDS = FIELDS;

/** Normaliza o JSON do modelo: só as chaves conhecidas, sempre string. */
export function normalizeBriefing(raw) {
  const out = {};
  for (const [key] of FIELDS) {
    const v = raw?.[key];
    out[key] = (Array.isArray(v) ? v.join("; ") : typeof v === "string" ? v : "").trim() || "Não informado.";
  }
  return out;
}

/** Texto do briefing como mensagem do cliente ao arquiteto (Message.text aceita até 2000). */
export function briefingToMessage(briefing, { clientName, projectName }) {
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const lines = [
    `Olá! Sou ${clientName} e este é o briefing do meu projeto "${projectName}", montado com o assistente do match.IA:`,
    "",
    ...FIELDS.map(([key, label]) => `${label}: ${clip(briefing[key] || "Não informado.", 260)}`),
    "",
    "Podemos conversar por aqui para alinhar os próximos passos?",
  ];
  return clip(lines.join("\n"), 1990);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
