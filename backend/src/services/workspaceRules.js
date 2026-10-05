/**
 * Regras puras do Espaço do projeto (sem banco/rede, testáveis): etapas com
 * prazo e aprovação do cliente, itens da biblioteca do arquiteto e a
 * assinatura dele. O controller (workspaceController.js) só carrega, chama
 * estas funções e salva.
 *
 * As etapas seguem o ciclo que a arquiteta descreveu no briefing do desafio
 * (início → anteprojeto → executivo → obra) e o prazo padrão soma 12 semanas
 * até o executivo: a meta dela de fechar o projeto em 3 meses.
 */
export const DEFAULT_STAGES = [
  { key: "briefing", name: "Briefing e levantamento", weeks: 2 },
  { key: "anteprojeto", name: "Anteprojeto", weeks: 4 },
  { key: "executivo", name: "Projeto executivo", weeks: 6 },
  { key: "obra", name: "Obra e acompanhamento", weeks: 0 }, // sem prazo fixo: depende da obra
];
export const TARGET_WEEKS = DEFAULT_STAGES.reduce((s, st) => s + st.weeks, 0);
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function defaultStages(start = new Date()) {
  let t = start.getTime();
  return DEFAULT_STAGES.map((st, i) => {
    t += st.weeks * WEEK;
    return { key: st.key, name: st.name, dueDate: st.weeks ? new Date(t) : undefined, status: i === 0 ? "in_progress" : "pending", revisionRounds: 0 };
  });
}

export function targetDate(start = new Date()) {
  return new Date(start.getTime() + TARGET_WEEKS * WEEK);
}

const fail = (status, error) => ({ status, error });

/**
 * Aplica uma ação de etapa. Devolve { error, status } quando não pode, ou
 * { stage, next, done } depois de mudar `stages` no lugar.
 *   submit          (arquiteto) em andamento → aguardando aprovação
 *   approve         (cliente)   aguardando → aprovada; a próxima começa
 *   request_changes (cliente)   aguardando → volta para em andamento (+1 rodada de ajuste)
 */
export function applyStageAction(stages, key, action, role, now = new Date()) {
  const i = stages.findIndex((s) => s.key === key);
  if (i < 0) return fail(404, "Etapa não encontrada.");
  const stage = stages[i];
  if (action === "submit") {
    if (role !== "architect") return fail(403, "Só o arquiteto envia a etapa para aprovação.");
    if (stage.status !== "in_progress") return fail(409, "Esta etapa não está em andamento.");
    stage.status = "awaiting_approval";
    stage.submittedAt = now;
    return { stage };
  }
  if (action === "approve" || action === "request_changes") {
    if (role !== "client") return fail(403, "Só o cliente aprova ou pede ajustes.");
    if (stage.status !== "awaiting_approval") return fail(409, "Esta etapa não está aguardando aprovação.");
    if (action === "request_changes") {
      stage.status = "in_progress";
      stage.revisionRounds = (stage.revisionRounds || 0) + 1;
      return { stage };
    }
    stage.status = "approved";
    stage.approvedAt = now;
    const next = stages[i + 1];
    if (next && next.status === "pending") next.status = "in_progress";
    return { stage, next, done: stages.every((s) => s.status === "approved") };
  }
  return fail(400, "Ação inválida.");
}

/** Números para o painel: etapa atual, atraso, rodadas de ajuste e progresso. */
export function summarizeStages(stages, now = new Date()) {
  const current = stages.find((s) => s.status !== "approved") || null;
  const approved = stages.filter((s) => s.status === "approved").length;
  const late = stages.filter((s) => s.status !== "approved" && s.dueDate && new Date(s.dueDate) < now).map((s) => s.key);
  return {
    current: current?.key || null,
    approved,
    total: stages.length,
    progress: stages.length ? Math.round((approved / stages.length) * 100) : 0,
    revisionRounds: stages.reduce((s, st) => s + (st.revisionRounds || 0), 0),
    late,
  };
}

// ---------------------------------------------------------------------------
// Biblioteca do projeto / lista de compras
// ---------------------------------------------------------------------------
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const httpUrl = (v) => {
  const s = str(v, 500);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
};
const num = (v, min, max, digits = 2) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const f = 10 ** digits;
  return Math.max(min, Math.min(max, Math.round(n * f) / f));
};

/** Campos que o arquiteto ajusta em qualquer item (ambiente, quantidade, observação). */
export function normalizeItemDetails(body = {}) {
  const out = {};
  if (body.room !== undefined) out.room = str(body.room, 60) || "";
  if (body.note !== undefined) out.note = str(body.note, 300) || "";
  if (body.unit !== undefined) out.unit = str(body.unit, 20) || "";
  if (body.quantity !== undefined) out.quantity = num(body.quantity, 0.01, 100000) ?? 1;
  return out;
}

/** Item cadastrado pelo próprio arquiteto (fora do catálogo das lojas). */
export function normalizeCustomItem(body = {}) {
  const name = str(body.name, 120);
  if (!name) return { error: "Dê um nome ao item." };
  return {
    item: {
      kind: "custom",
      name,
      category: str(body.category, 60) || "",
      storeName: str(body.storeName, 80) || "",
      purchaseUrl: httpUrl(body.purchaseUrl),
      photo: httpUrl(body.photo),
      price: num(body.price, 0, 10_000_000),
      ...normalizeItemDetails(body),
    },
  };
}

/** Lista de compras: agrupa por loja, com subtotal; item sem preço fica "sob consulta". */
export function shoppingTotals(items = []) {
  const groups = new Map();
  for (const it of items) {
    const key = it.storeName || "Sem loja definida";
    if (!groups.has(key)) groups.set(key, { store: key, items: 0, subtotal: 0, pending: 0, withoutPrice: 0 });
    const g = groups.get(key);
    const line = it.price != null ? it.price * (it.quantity || 1) : null;
    g.items += 1;
    if (line == null) g.withoutPrice += 1;
    else {
      g.subtotal += line;
      if (!it.purchased) g.pending += line;
    }
  }
  const stores = [...groups.values()].map((g) => ({ ...g, subtotal: Math.round(g.subtotal * 100) / 100, pending: Math.round(g.pending * 100) / 100 }));
  const total = stores.reduce((s, g) => s + g.subtotal, 0);
  const pending = stores.reduce((s, g) => s + g.pending, 0);
  return { stores, total: Math.round(total * 100) / 100, pending: Math.round(pending * 100) / 100, purchased: items.filter((i) => i.purchased).length, count: items.length };
}

// ---------------------------------------------------------------------------
// Assinatura do arquiteto
// ---------------------------------------------------------------------------
const list = (v, maxItems, maxLen) =>
  [...new Set((Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((s) => str(String(s), maxLen)).filter(Boolean))].slice(0, maxItems);

export function normalizeSignature(body = {}) {
  return {
    statement: str(body.statement, 600) || "",
    principles: list(body.principles, 6, 120),
    palette: list(body.palette, 6, 30),
    signatureMaterials: list(body.signatureMaterials, 10, 60),
    avoid: list(body.avoid, 8, 80),
    updatedAt: new Date(),
  };
}

/** O que se repete no portfólio: estilos e materiais mais usados, com contagem. */
export function deriveSignature(portfolio = []) {
  const count = (key) => {
    const m = new Map();
    portfolio.forEach((p) => (p[key] || []).forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, count: n }));
  };
  return { projects: portfolio.length, styles: count("styles"), materials: count("materials") };
}

/** Texto para o prompt das IAs. Vazio quando não há nada a dizer. */
export function signatureToText(signature, derived) {
  const lines = [];
  if (signature?.statement) lines.push(`como projeta, nas palavras dele: ${signature.statement}`);
  if (signature?.principles?.length) lines.push(`princípios: ${signature.principles.join("; ")}`);
  if (signature?.signatureMaterials?.length) lines.push(`materiais de assinatura: ${signature.signatureMaterials.join(", ")}`);
  if (signature?.palette?.length) lines.push(`paleta: ${signature.palette.join(", ")}`);
  if (signature?.avoid?.length) lines.push(`evita: ${signature.avoid.join(", ")}`);
  if (derived?.styles?.length) lines.push(`estilos mais presentes no portfólio: ${derived.styles.map((s) => s.name).join(", ")}`);
  if (derived?.materials?.length) lines.push(`materiais que mais repete no portfólio: ${derived.materials.map((s) => s.name).join(", ")}`);
  return lines.join("\n");
}
