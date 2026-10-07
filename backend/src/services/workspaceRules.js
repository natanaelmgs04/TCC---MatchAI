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
// Modelos de etapas por tipo de projeto. `closesDesign` marca a etapa que
// "fecha o projeto" (a meta de prazo e o relatório contam até ela); as
// semanas somadas até ali viram a meta de entrega.
export const STAGE_TEMPLATES = {
  residencial: {
    label: "Residencial",
    stages: [
      { key: "briefing", name: "Briefing e levantamento", weeks: 2 },
      { key: "anteprojeto", name: "Anteprojeto", weeks: 4 },
      { key: "executivo", name: "Projeto executivo", weeks: 6, closesDesign: true },
      { key: "obra", name: "Obra e acompanhamento", weeks: 0 }, // sem prazo fixo: depende da obra
    ],
  },
  interiores: {
    label: "Interiores",
    stages: [
      { name: "Briefing e medição", weeks: 1 },
      { name: "Conceito e moodboard", weeks: 2 },
      { name: "Projeto de interiores", weeks: 4 },
      { name: "Detalhamento e marcenaria", weeks: 3, closesDesign: true },
      { name: "Obra e montagem", weeks: 0 },
    ],
  },
  comercial: {
    label: "Comercial (loja, restaurante)",
    stages: [
      { name: "Briefing e levantamento", weeks: 1 },
      { name: "Estudo preliminar", weeks: 2 },
      { name: "Anteprojeto", weeks: 3 },
      { name: "Executivo e aprovações", weeks: 4, closesDesign: true },
      { name: "Obra e inauguração", weeks: 0 },
    ],
  },
  corporativo: {
    label: "Corporativo",
    stages: [
      { name: "Levantamento e programa de necessidades", weeks: 2 },
      { name: "Layout e estudo de ocupação", weeks: 2 },
      { name: "Anteprojeto", weeks: 3 },
      { name: "Executivo e compatibilização", weeks: 5, closesDesign: true },
      { name: "Obra e mudança", weeks: 0 },
    ],
  },
};
export const DEFAULT_STAGES = STAGE_TEMPLATES.residencial.stages;
const WEEK = 7 * 24 * 60 * 60 * 1000;

const slug = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "etapa";

/** Semanas até a etapa que fecha o projeto (a meta). */
export function weeksToClose(stages) {
  let last = stages.findIndex((s) => s.closesDesign);
  if (last < 0) last = stages.length - 1;
  return stages.slice(0, last + 1).reduce((t, s) => t + (Number(s.weeks) || 0), 0);
}
export const TARGET_WEEKS = weeksToClose(DEFAULT_STAGES);

/**
 * Etapas do Espaço a partir de um modelo: [{ key?, name, weeks, fee?, closesDesign? }].
 * Prazos acumulados a partir de `start`; a primeira já começa em andamento.
 * Sem etapa marcada como "fecha o projeto", a última com prazo assume.
 */
export function stagesFromTemplate(list, start = new Date()) {
  const used = new Set();
  let t = start.getTime();
  const hasClose = list.some((s) => s.closesDesign);
  const lastTimed = [...list].reverse().find((s) => Number(s.weeks) > 0);
  return list.map((st, i) => {
    t += (Number(st.weeks) || 0) * WEEK;
    let key = st.key || slug(st.name);
    while (used.has(key)) key = `${key}-${i}`;
    used.add(key);
    return {
      key,
      name: st.name,
      dueDate: Number(st.weeks) > 0 ? new Date(t) : undefined,
      status: i === 0 ? "in_progress" : "pending",
      revisionRounds: 0,
      fee: Number(st.fee) > 0 ? st.fee : undefined,
      closesDesign: hasClose ? !!st.closesDesign : st === lastTimed,
    };
  });
}

export function defaultStages(start = new Date()) {
  return stagesFromTemplate(DEFAULT_STAGES, start);
}

export function targetDate(start = new Date(), list = DEFAULT_STAGES) {
  return new Date(start.getTime() + weeksToClose(list) * WEEK);
}

/** Trocar o modelo só enquanto nenhuma etapa foi enviada, aprovada ou cobrada. */
export function canReplaceStages(stages = []) {
  return stages.every((s) => !s.submittedAt && !s.approvedAt && !s.revisionRounds && (!s.feeStatus || s.feeStatus === "none"));
}

/** Modelo próprio do arquiteto (ou etapas de uma proposta): 2 a 10 etapas, 0–52 semanas cada. */
export function normalizeStageList(list, { withFees = false } = {}) {
  if (!Array.isArray(list)) return { error: "Informe as etapas." };
  const stages = list
    .map((s) => ({
      name: typeof s?.name === "string" ? s.name.trim().slice(0, 60) : "",
      weeks: Math.max(0, Math.min(52, Math.round(Number(s?.weeks) || 0))),
      closesDesign: !!s?.closesDesign,
      ...(withFees ? { fee: Math.max(0, Math.min(MAX_FEE_LIMIT, Math.round((Number(s?.fee) || 0) * 100) / 100)) } : {}),
    }))
    .filter((s) => s.name);
  if (stages.length < 2 || stages.length > 10) return { error: "Use de 2 a 10 etapas, cada uma com nome." };
  if (stages.filter((s) => s.closesDesign).length > 1) return { error: "Marque só uma etapa como a que fecha o projeto." };
  return { stages };
}
const MAX_FEE_LIMIT = 10_000_000;

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
    if (stage.fee > 0 && stage.feeStatus !== "paid") {
      stage.feeStatus = "due"; // aprovou a etapa: abre a cobrança dos honorários dela
      stage.feeDueAt = now;
    }
    const next = stages[i + 1];
    if (next && next.status === "pending") next.status = "in_progress";
    return { stage, next, done: stages.every((s) => s.status === "approved") };
  }
  return fail(400, "Ação inválida.");
}

const DAY = 24 * 60 * 60 * 1000;
export const REMINDER_DAYS = 3;

/**
 * Lembretes de prazo devidos agora (cada um sai uma vez por prazo):
 *   soon — faltam até 3 dias; vai para quem está com a etapa na mão
 *          (arquiteto em andamento, cliente quando aguarda aprovação);
 *   late — passou do prazo; vai para os dois.
 */
export function dueReminders(stages, now = new Date()) {
  const out = [];
  for (const st of stages) {
    if (!st.dueDate || !["in_progress", "awaiting_approval"].includes(st.status)) continue;
    const left = new Date(st.dueDate).getTime() - now.getTime();
    if (left < 0) {
      if (!st.remindedLateAt) out.push({ key: st.key, kind: "late", to: ["architect", "client"] });
    } else if (left <= REMINDER_DAYS * DAY && !st.remindedSoonAt) {
      out.push({ key: st.key, kind: "soon", to: [st.status === "awaiting_approval" ? "client" : "architect"], days: Math.max(1, Math.ceil(left / DAY)) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Honorários por etapa (cobrança simulada)
// ---------------------------------------------------------------------------
export const MAX_FEE = 10_000_000;

/** Valor de honorário vindo do formulário: número ≥ 0, com centavos; vazio = sem honorário. */
export function normalizeFee(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(MAX_FEE, Math.round(n * 100) / 100);
}

/** O arquiteto só muda o valor antes da etapa ser aprovada (depois, a cobrança já existe). */
export function canEditFee(stage) {
  return stage.status !== "approved" && stage.feeStatus !== "paid";
}

/** Cliente marca a cobrança aberta como paga. */
export function payFee(stage, role, now = new Date()) {
  if (role !== "client") return { status: 403, error: "Só o cliente registra o pagamento." };
  if (stage.feeStatus !== "due") return { status: 409, error: "Não há cobrança aberta nesta etapa." };
  stage.feeStatus = "paid";
  stage.feePaidAt = now;
  return { stage };
}

export function feeTotals(stages = []) {
  const sum = (f) => Math.round(stages.filter(f).reduce((t, s) => t + (s.fee || 0), 0) * 100) / 100;
  return {
    total: sum(() => true),
    paid: sum((s) => s.feeStatus === "paid"),
    due: sum((s) => s.feeStatus === "due"),
    upcoming: sum((s) => (s.fee || 0) > 0 && (!s.feeStatus || s.feeStatus === "none")),
  };
}

// ---------------------------------------------------------------------------
// Relatório de resultado do arquiteto (a meta da arquiteta do desafio: fechar
// o projeto em 3 meses, sem retrabalho)
// ---------------------------------------------------------------------------
const days = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (list) => (list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null);
// "projeto fechado" = a etapa marcada no modelo (no residencial, o executivo); a obra vem depois
const closingStage = (stages) => stages.find((s) => s.closesDesign) || stages.find((s) => s.key === "executivo");

/**
 * projects: [{ name, status, workspaceStartedAt, createdAt, targetDate, stages }]
 * Devolve os números do relatório e uma linha por projeto.
 */
export function buildReport(projects = [], now = new Date()) {
  const rows = [];
  const stageDays = new Map();
  for (const p of projects) {
    if (!p.stages?.length) continue;
    const start = p.workspaceStartedAt || p.createdAt;
    let prev = start;
    for (const st of p.stages) {
      if (st.status !== "approved" || !st.approvedAt) break;
      const key = st.key;
      if (!stageDays.has(key)) stageDays.set(key, { name: st.name, values: [] });
      stageDays.get(key).values.push(Math.max(0, days(prev, st.approvedAt)));
      prev = st.approvedAt;
    }
    const design = closingStage(p.stages);
    const closedAt = design?.status === "approved" ? design.approvedAt : null;
    const rounds = p.stages.reduce((t, s) => t + (s.revisionRounds || 0), 0);
    const late = p.stages.filter((s) => s.status !== "approved" && s.dueDate && new Date(s.dueDate) < now).length;
    rows.push({
      id: String(p._id || p.id || ""),
      name: p.name,
      status: p.status,
      startedAt: start,
      targetDate: p.targetDate || null,
      closedAt,
      daysToClose: closedAt ? round1(days(start, closedAt)) : null,
      onTarget: closedAt && p.targetDate ? new Date(closedAt) <= new Date(p.targetDate) : null,
      revisionRounds: rounds,
      lateStages: late,
      fees: feeTotals(p.stages),
    });
  }
  const closed = rows.filter((r) => r.closedAt);
  return {
    projects: rows.length,
    closed: closed.length,
    avgDaysToClose: avg(closed.map((r) => r.daysToClose)),
    onTargetRate: closed.filter((r) => r.onTarget !== null).length
      ? Math.round((closed.filter((r) => r.onTarget).length / closed.filter((r) => r.onTarget !== null).length) * 100)
      : null,
    avgRevisionRounds: avg(rows.map((r) => r.revisionRounds)),
    noReworkRate: rows.length ? Math.round((rows.filter((r) => r.revisionRounds === 0).length / rows.length) * 100) : null,
    lateNow: rows.reduce((t, r) => t + r.lateStages, 0),
    stageAverages: [...stageDays.entries()].map(([key, v]) => ({ key, name: v.name, avgDays: avg(v.values), count: v.values.length })),
    fees: rows.reduce((t, r) => ({ total: t.total + r.fees.total, paid: t.paid + r.fees.paid, due: t.due + r.fees.due }), { total: 0, paid: 0, due: 0 }),
    rows,
  };
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

// ---------------------------------------------------------------------------
// Comentários marcados no arquivo
// ---------------------------------------------------------------------------
export const ANNOTATION_LIMIT = 200;

/** Valida um comentário novo: ponto dentro do arquivo (0–1), página ≥ 1 e texto. */
export function normalizeAnnotation(body = {}) {
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 600) : "";
  if (!text) return { error: "Escreva o comentário." };
  const x = Number(body.x);
  const y = Number(body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return { error: "Marque um ponto dentro do arquivo." };
  const page = Math.floor(Number(body.page) || 1);
  if (page < 1 || page > 2000) return { error: "Página inválida." };
  return { annotation: { page, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000, text } };
}

// ---------------------------------------------------------------------------
// Obra: prestadores, cotações e diário
// ---------------------------------------------------------------------------
export const TRADES = ["Marcenaria", "Elétrica", "Hidráulica", "Pintura", "Gesso e drywall", "Marmoraria", "Vidraçaria", "Serralheria", "Paisagismo", "Ar-condicionado", "Iluminação técnica", "Pedreiro e acabamento"];
export const CREW_STATUS = ["cotando", "contratado", "concluido"];

export function normalizeTrades(v) {
  return [...new Set((Array.isArray(v) ? v : []).filter((t) => TRADES.includes(t)))].slice(0, 6);
}

/** Prestador cadastrado à mão pelo arquiteto. */
export function normalizeCrewInput(body = {}) {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return { error: "Informe o nome do prestador." };
  const trade = TRADES.includes(body.trade) ? body.trade : "";
  if (!trade) return { error: "Escolha o ofício." };
  return {
    entry: {
      name,
      trade,
      contact: typeof body.contact === "string" ? body.contact.trim().slice(0, 120) : "",
      quote: normalizeFee(body.quote) || undefined,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 300) : "",
    },
  };
}

export function normalizeRating(v) {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 5 ? n : null;
}

/** Cotação manual de um item da lista de compras. */
export function normalizeQuote(body = {}) {
  const storeName = typeof body.storeName === "string" ? body.storeName.trim().slice(0, 80) : "";
  if (!storeName) return { error: "Informe a loja da cotação." };
  const price = normalizeFee(body.price);
  if (!price) return { error: "Informe o preço cotado." };
  let purchaseUrl;
  if (typeof body.purchaseUrl === "string" && body.purchaseUrl.trim()) {
    try {
      const u = new URL(body.purchaseUrl.trim());
      if (u.protocol === "https:" || u.protocol === "http:") purchaseUrl = u.href.slice(0, 500);
    } catch { /* link inválido: fica sem */ }
  }
  return { quote: { storeName, price, purchaseUrl, note: typeof body.note === "string" ? body.note.trim().slice(0, 200) : "" } };
}

/** Registro do diário: data (não no futuro) e texto. */
export function normalizeDiaryEntry(body = {}, now = new Date()) {
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (text.length < 3) return { error: "Escreva o que aconteceu na obra." };
  const date = body.date ? new Date(body.date) : now;
  if (Number.isNaN(date.getTime())) return { error: "Data inválida." };
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return { error: "O diário registra o que já aconteceu — escolha uma data até hoje." };
  return { entry: { text, date } };
}
