import mongoose from "mongoose";
import Project from "../models/Project.js";
import ProjectFile from "../models/ProjectFile.js";
import StoreProduct from "../models/StoreProduct.js";
import Hire from "../models/Hire.js";
import User from "../models/User.js";
import { avatarPath } from "../services/avatar.js";
import { notify } from "../services/notificationService.js";
import { workspaceEmail } from "../services/emailService.js";
import { checkUpload, deleteProjectFile, openBuffer, saveBuffer } from "../services/projectFileStore.js";
import { fallbackLibraryConcept, generateLibraryConcept } from "../services/geminiService.js";
import { UPGRADE_HINT, limitsFor, publicLimits, tierOf } from "../services/planLimits.js";
import {
  ANNOTATION_LIMIT,
  normalizeAnnotation,
  applyStageAction,
  buildReport,
  canEditFee,
  feeTotals,
  normalizeFee,
  payFee,
  defaultStages,
  deriveSignature,
  normalizeCustomItem,
  normalizeItemDetails,
  shoppingTotals,
  signatureToText,
  summarizeStages,
  targetDate,
} from "../services/workspaceRules.js";

/**
 * Espaço do projeto (projeto.html): o lugar de trabalho do cliente e do
 * arquiteto depois da contratação — etapas com prazo e aprovação, arquivos
 * técnicos com versões, a biblioteca de produtos do arquiteto para o projeto
 * e a lista de compras da obra. Só os dois enxergam.
 */
const isId = (v) => mongoose.isValidObjectId(v);
const FILE_MAX = 15 * 1024 * 1024;
const ACTIVITY_LIMIT = 200;
const mb = (b) => Math.round(b / 1024 / 1024);
const link = (p) => `projeto.html?id=${p._id}`;
const person = (u) => (u && u._id ? { id: String(u._id), name: u.name, avatar: avatarPath(u) } : null);

async function load(req, res) {
  if (!isId(req.params.id)) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return null;
  }
  const project = await Project.findOne({ _id: req.params.id, $or: [{ client: req.user.id }, { architect: req.user.id }] });
  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return null;
  }
  if (!project.architect) {
    res.status(409).json({ error: "O espaço do projeto abre quando um arquiteto aceitar o pedido de contratação.", notHired: true });
    return null;
  }
  const role = String(project.client) === String(req.user.id) ? "client" : "architect";
  if (!project.stages?.length) {
    // Projetos fechados antes do Espaço existir: o prazo conta da contratação.
    const hire = await Hire.findOne({ project: project._id, status: "accepted" }).select("decidedAt");
    const start = hire?.decidedAt || new Date();
    project.stages = defaultStages(start);
    project.targetDate = targetDate(start);
    project.workspaceStartedAt = new Date();
    await project.save();
  }
  // Os limites vêm do plano do ARQUITETO do projeto — o cliente nunca paga nem esbarra em limite.
  const architect = role === "architect" ? req.user : await User.findById(project.architect).select("architectProfile.subscriptionTier");
  const tier = tierOf(architect);
  const limits = limitsFor(architect);
  let locked = false;
  if (limits.activeWorkspaces !== Infinity) {
    const active = await Project.find({ architect: project.architect, status: { $ne: "completed" }, "stages.0": { $exists: true } })
      .select("_id workspaceStartedAt createdAt").lean();
    active.sort((a, b) => (a.workspaceStartedAt || a.createdAt) - (b.workspaceStartedAt || b.createdAt));
    const allowed = active.slice(0, limits.activeWorkspaces).map((p) => String(p._id));
    locked = project.status !== "completed" && !allowed.includes(String(project._id));
  }
  return { project, role, otherId: role === "client" ? project.architect : project.client, tier, limits, locked };
}

/** Escrita do arquiteto num espaço além do limite do plano Gratuito: só leitura (o cliente segue normal). */
function blockedByPlan(ctx, res) {
  if (ctx.role !== "architect" || !ctx.locked) return false;
  res.status(403).json({ error: `No plano Gratuito você edita o Espaço de ${ctx.limits.activeWorkspaces} projeto ativo por vez — este fica só para leitura até o atual ser concluído. ${UPGRADE_HINT}`, plan: true });
  return true;
}

/** Sininho + e-mail para a outra pessoa do projeto (eventos que pedem ação dela). */
async function alertOther(ctx, text, { subject, lines }) {
  notify(ctx.otherId, "timeline", text, link(ctx.project));
  const other = await User.findById(ctx.otherId).select("name email");
  workspaceEmail(other, { subject, lines, projectId: ctx.project._id }).catch(() => {});
}

function log(project, userId, kind, text) {
  project.activity.push({ by: userId, kind, text: text.slice(0, 300) });
  if (project.activity.length > ACTIVITY_LIMIT) project.activity.splice(0, project.activity.length - ACTIVITY_LIMIT);
}

const shapeItem = (it) => ({
  id: String(it._id),
  kind: it.kind,
  productId: it.product ? String(it.product) : null,
  name: it.name,
  photo: it.photo || "",
  category: it.category || "",
  storeName: it.storeName || "",
  purchaseUrl: it.purchaseUrl || "",
  price: it.price ?? null,
  room: it.room || "",
  note: it.note || "",
  quantity: it.quantity || 1,
  unit: it.unit || "",
  purchased: !!it.purchased,
});

const shapeFile = (f) => ({
  id: String(f._id),
  name: f.name,
  ext: f.ext,
  size: f.size,
  stage: f.stage || "",
  version: f.version,
  uploader: String(f.uploader),
  review: { status: f.review?.status || "none", comment: f.review?.comment || "", at: f.review?.at || null },
  notes: { total: (f.annotations || []).length, open: (f.annotations || []).filter((a) => !a.resolved).length },
  createdAt: f.createdAt,
});

async function shape(ctx, userId) {
  const { project, role } = ctx;
  const [parties, files] = await Promise.all([
    User.find({ _id: { $in: [project.client, project.architect] } }).select("name avatarVersion architectProfile.signature architectProfile.portfolio.styles architectProfile.portfolio.materials"),
    ProjectFile.find({ project: project._id }).sort("-createdAt"),
  ]);
  const byId = new Map(parties.map((u) => [String(u._id), u]));
  const architect = byId.get(String(project.architect));
  const items = project.library.map(shapeItem);
  return {
    id: String(project._id),
    name: project.name,
    status: project.status,
    role,
    me: String(userId),
    client: person(byId.get(String(project.client))),
    architect: person(architect),
    targetDate: project.targetDate,
    stages: project.stages.map((s) => ({
      key: s.key, name: s.name, dueDate: s.dueDate || null, status: s.status,
      submittedAt: s.submittedAt || null, approvedAt: s.approvedAt || null, revisionRounds: s.revisionRounds || 0,
      fee: s.fee || 0, feeStatus: s.feeStatus || "none", feeDueAt: s.feeDueAt || null, feePaidAt: s.feePaidAt || null,
    })),
    fees: feeTotals(project.stages),
    summary: summarizeStages(project.stages),
    library: items,
    totals: shoppingTotals(items),
    files: files.map(shapeFile),
    storage: { used: files.reduce((s, f) => s + (f.size || 0), 0), quota: ctx.limits.workspaceStorage, fileMax: FILE_MAX },
    plan: { tier: ctx.tier, locked: ctx.locked, limits: publicLimits(ctx.limits) },
    signature: architect?.architectProfile?.signature || null,
    signatureDerived: deriveSignature(architect?.architectProfile?.portfolio || []),
    activity: project.activity
      .slice(-80)
      .reverse()
      .map((a) => ({ at: a.at, kind: a.kind, text: a.text, by: person(byId.get(String(a.by))) })),
  };
}

const respond = async (res, ctx, req) => res.json(await shape(ctx, req.user.id));

export async function get(req, res) {
  const ctx = await load(req, res);
  if (ctx) await respond(res, ctx, req);
}

// ---------------------------------------------------------------- etapas
export async function updateStage(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Só o arquiteto ajusta as etapas." });
  if (blockedByPlan(ctx, res)) return;
  const stage = ctx.project.stages.find((s) => s.key === req.params.key);
  if (!stage) return res.status(404).json({ error: "Etapa não encontrada." });
  const changes = [];
  const newName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 60) : "";
  if (newName && newName !== stage.name) {
    stage.name = newName;
    changes.push(`renomeou a etapa para "${stage.name}"`);
  }
  const sameDay = (a, b) => (a ? new Date(a).toISOString().slice(0, 10) : "") === (b ? b.toISOString().slice(0, 10) : "");
  if (req.body?.dueDate !== undefined) {
    const d = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (d && Number.isNaN(d.getTime())) return res.status(400).json({ error: "Data inválida." });
  }
  // o formulário manda o prazo junto sempre: só conta (e zera lembretes) quando muda de verdade
  if (req.body?.dueDate !== undefined && !sameDay(stage.dueDate, req.body.dueDate ? new Date(req.body.dueDate) : null)) {
    const d = req.body.dueDate ? new Date(req.body.dueDate) : null;
    stage.dueDate = d || undefined;
    stage.remindedSoonAt = undefined; // prazo novo, lembretes novos
    stage.remindedLateAt = undefined;
    changes.push(d ? `mudou o prazo de "${stage.name}" para ${d.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : `tirou o prazo de "${stage.name}"`);
  }
  if (req.body?.fee !== undefined) {
    const fee = normalizeFee(req.body.fee);
    if (fee === null) return res.status(400).json({ error: "Valor de honorário inválido." });
    if ((stage.fee || 0) !== fee) {
      if (!canEditFee(stage)) return res.status(409).json({ error: "Os honorários desta etapa já foram cobrados — não dá para mudar o valor." });
      stage.fee = fee;
      changes.push(fee ? `definiu os honorários de "${stage.name}" em R$ ${fee.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `tirou os honorários de "${stage.name}"`);
    }
  }
  if (!changes.length) return respond(res, ctx, req); // nada mudou de verdade
  log(ctx.project, req.user.id, "stage", changes.join(" e "));
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function updateTarget(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Só o arquiteto ajusta a meta." });
  if (blockedByPlan(ctx, res)) return;
  const d = new Date(req.body?.targetDate);
  if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Data inválida." });
  ctx.project.targetDate = d;
  log(ctx.project, req.user.id, "stage", `mudou a meta de entrega do projeto para ${d.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

const ACTIONS = { submit: "submit", approve: "approve", "request-changes": "request_changes" };

export async function stageAction(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const action = ACTIONS[req.params.action];
  if (!action) return res.status(404).json({ error: "Ação inválida." });
  if (blockedByPlan(ctx, res)) return;
  const text = String(req.body?.text || "").trim().slice(0, 1000);
  if (action === "request_changes" && text.length < 5) return res.status(400).json({ error: "Explique o que precisa mudar — é isso que evita uma nova rodada de ajustes." });
  const result = applyStageAction(ctx.project.stages, req.params.key, action, ctx.role);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const { stage, next, done } = result;
  const who = req.user.name;
  if (action === "submit") {
    log(ctx.project, req.user.id, "submit", `enviou "${stage.name}" para aprovação${text ? `: ${text}` : ""}`);
    await alertOther(ctx, `${who} enviou a etapa "${stage.name}" para a sua aprovação`, {
      subject: `Aprovação pendente: ${stage.name} — match.IA`,
      lines: [`${who} enviou a etapa "${stage.name}" do projeto "${ctx.project.name}" para você aprovar.`, ...(text ? [`Recado: ${text}`] : []), "Confira os arquivos da etapa e aprove ou peça ajustes — o projeto só avança com a sua resposta."],
    });
  } else if (action === "approve") {
    log(ctx.project, req.user.id, "approve", `aprovou "${stage.name}"${text ? `: ${text}` : ""}`);
    await alertOther(ctx, `${who} aprovou a etapa "${stage.name}"${next ? ` — "${next.name}" começou` : ""}`, {
      subject: `Etapa aprovada: ${stage.name} — match.IA`,
      lines: [`${who} aprovou a etapa "${stage.name}" do projeto "${ctx.project.name}".`, ...(text ? [`Comentário: ${text}`] : []), next ? `A próxima etapa, "${next.name}", já começou.` : "Todas as etapas foram aprovadas: projeto concluído."],
    });
    if (done) ctx.project.status = "completed";
  } else {
    log(ctx.project, req.user.id, "changes", `pediu ajustes em "${stage.name}": ${text}`);
    await alertOther(ctx, `${who} pediu ajustes na etapa "${stage.name}"`, {
      subject: `Ajustes pedidos: ${stage.name} — match.IA`,
      lines: [`${who} pediu ajustes na etapa "${stage.name}" do projeto "${ctx.project.name}":`, text],
    });
  }
  await ctx.project.save();
  await respond(res, ctx, req);
}

/** Pagamento simulado dos honorários de uma etapa aprovada (nenhum dinheiro de verdade). */
export async function payStageFee(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const stage = ctx.project.stages.find((s) => s.key === req.params.key);
  if (!stage) return res.status(404).json({ error: "Etapa não encontrada." });
  const r = payFee(stage, ctx.role);
  if (r.error) return res.status(r.status).json({ error: r.error });
  const value = `R$ ${stage.fee.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  log(ctx.project, req.user.id, "fee", `registrou o pagamento de ${value} dos honorários de "${stage.name}" (simulado)`);
  await ctx.project.save();
  await alertOther(ctx, `${req.user.name} pagou ${value} dos honorários de "${stage.name}"`, {
    subject: `Honorários pagos: ${stage.name} — match.IA`,
    lines: [`${req.user.name} registrou o pagamento de ${value} dos honorários da etapa "${stage.name}" do projeto "${ctx.project.name}".`, "Pagamento simulado (projeto acadêmico): nenhum valor foi cobrado de verdade."],
  });
  await respond(res, ctx, req);
}

/** Relatório de resultado do arquiteto: todos os projetos dele com Espaço do projeto. */
export async function report(req, res) {
  if (req.user.role !== "architect") return res.status(403).json({ error: "Relatório disponível para arquitetos." });
  const projects = await Project.find({ architect: req.user.id, "stages.0": { $exists: true } })
    .select("name status workspaceStartedAt createdAt targetDate stages").sort("-createdAt").lean();
  res.json(buildReport(projects));
}

// ---------------------------------------------------------------- arquivos
export async function uploadFile(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (blockedByPlan(ctx, res)) return;
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer?.length) return res.status(400).json({ error: "Arquivo vazio." });
  if (buffer.length > FILE_MAX) return res.status(413).json({ error: "Arquivo grande demais (máximo 15 MB)." });
  let rawName = "";
  try { rawName = decodeURIComponent(String(req.get("x-file-name") || "")); } catch { /* nome inválido: cai na validação */ }
  const checked = checkUpload(rawName, buffer);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const stageKey = ctx.project.stages.some((s) => s.key === req.query.stage) ? req.query.stage : "";

  const used = (await ProjectFile.aggregate([{ $match: { project: ctx.project._id } }, { $group: { _id: null, n: { $sum: "$size" } } }]))[0]?.n || 0;
  if (used + buffer.length > ctx.limits.workspaceStorage) {
    const extra = ctx.role === "architect" && ctx.tier === "free" ? ` No Pro são ${mb(limitsFor({ architectProfile: { subscriptionTier: "pro" } }).workspaceStorage)} MB por projeto.` : "";
    return res.status(413).json({ error: `O espaço de arquivos deste projeto está cheio (${mb(ctx.limits.workspaceStorage)} MB). Apague versões antigas para enviar novas.${extra}` });
  }

  const prev = await ProjectFile.findOne({ project: ctx.project._id, stage: stageKey, name: checked.name }).sort("-version").select("version");
  const fileId = await saveBuffer(buffer, { filename: checked.name, owner: req.user.id, project: ctx.project._id });
  const doc = await ProjectFile.create({
    project: ctx.project._id, uploader: req.user.id, stage: stageKey, name: checked.name, ext: checked.ext,
    mime: checked.mime, size: buffer.length, version: (prev?.version || 0) + 1, file: fileId,
  });
  log(ctx.project, req.user.id, "file", `enviou ${checked.name}${doc.version > 1 ? ` (versão ${doc.version})` : ""}`);
  await ctx.project.save();
  notify(ctx.otherId, "timeline", `${req.user.name} enviou o arquivo ${checked.name} no projeto "${ctx.project.name}"`, link(ctx.project));
  await respond(res, ctx, req);
}

export async function downloadFile(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (!isId(req.params.fileId)) return res.status(404).json({ error: "Arquivo não encontrado." });
  const f = await ProjectFile.findOne({ _id: req.params.fileId, project: ctx.project._id });
  if (!f) return res.status(404).json({ error: "Arquivo não encontrado." });
  res.setHeader("Content-Type", f.mime || "application/octet-stream");
  res.setHeader("Content-Length", String(f.size));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  openBuffer(f.file).on("error", () => res.destroy()).pipe(res);
}

export async function removeFile(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (!isId(req.params.fileId)) return res.status(404).json({ error: "Arquivo não encontrado." });
  const f = await ProjectFile.findOne({ _id: req.params.fileId, project: ctx.project._id });
  if (!f) return res.status(404).json({ error: "Arquivo não encontrado." });
  if (String(f.uploader) !== String(req.user.id)) return res.status(403).json({ error: "Só quem enviou o arquivo pode apagá-lo." });
  await deleteProjectFile(f);
  log(ctx.project, req.user.id, "file", `apagou ${f.name}${f.version > 1 ? ` (versão ${f.version})` : ""}`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function reviewFile(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "client") return res.status(403).json({ error: "Só o cliente aprova os arquivos." });
  if (!isId(req.params.fileId)) return res.status(404).json({ error: "Arquivo não encontrado." });
  const f = await ProjectFile.findOne({ _id: req.params.fileId, project: ctx.project._id });
  if (!f) return res.status(404).json({ error: "Arquivo não encontrado." });
  if (String(f.uploader) === String(req.user.id)) return res.status(400).json({ error: "Você não precisa aprovar um arquivo que você mesmo enviou." });
  const decision = req.body?.decision === "approved" ? "approved" : req.body?.decision === "changes" ? "changes" : null;
  const comment = String(req.body?.comment || "").trim().slice(0, 600);
  if (!decision) return res.status(400).json({ error: "Escolha aprovar ou pedir ajustes." });
  if (decision === "changes" && comment.length < 5) return res.status(400).json({ error: "Explique o que precisa mudar no arquivo." });
  f.review = { status: decision, comment, at: new Date() };
  await f.save();
  const label = `${f.name}${f.version > 1 ? ` (v${f.version})` : ""}`;
  log(ctx.project, req.user.id, decision === "approved" ? "approve" : "changes", decision === "approved" ? `aprovou ${label}` : `pediu ajustes em ${label}: ${comment}`);
  await ctx.project.save();
  if (decision === "approved") notify(ctx.otherId, "timeline", `${req.user.name} aprovou ${label}`, link(ctx.project));
  else await alertOther(ctx, `${req.user.name} pediu ajustes em ${label}`, { subject: `Ajustes pedidos em ${f.name} — match.IA`, lines: [`${req.user.name} pediu ajustes no arquivo ${label} do projeto "${ctx.project.name}":`, comment] });
  await respond(res, ctx, req);
}

// ---------------------------------------------------------------- comentários no arquivo
async function loadFile(req, res, ctx) {
  if (!isId(req.params.fileId)) {
    res.status(404).json({ error: "Arquivo não encontrado." });
    return null;
  }
  const f = await ProjectFile.findOne({ _id: req.params.fileId, project: ctx.project._id });
  if (!f) res.status(404).json({ error: "Arquivo não encontrado." });
  return f;
}

async function annotationsOut(f, ctx) {
  const people = await User.find({ _id: { $in: [ctx.project.client, ctx.project.architect] } }).select("name avatarVersion");
  const byId = new Map(people.map((u) => [String(u._id), u]));
  return {
    fileId: String(f._id),
    annotations: f.annotations.map((a, i) => ({
      id: String(a._id), n: i + 1, page: a.page, x: a.x, y: a.y, text: a.text, resolved: !!a.resolved,
      createdAt: a.createdAt, author: person(byId.get(String(a.author))), mine: String(a.author) === String(ctx.me),
    })),
  };
}

export async function listAnnotations(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const f = await loadFile(req, res, ctx);
  if (!f) return;
  res.json(await annotationsOut(f, { ...ctx, me: req.user.id }));
}

export async function addAnnotation(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const f = await loadFile(req, res, ctx);
  if (!f) return;
  const r = normalizeAnnotation(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  if (f.annotations.length >= ANNOTATION_LIMIT) return res.status(409).json({ error: "Este arquivo já tem comentários demais. Resolva e envie uma nova versão." });
  f.annotations.push({ ...r.annotation, author: req.user.id });
  await f.save();
  const where = `${f.name}${f.version > 1 ? ` (v${f.version})` : ""}${r.annotation.page > 1 ? `, página ${r.annotation.page}` : ""}`;
  log(ctx.project, req.user.id, "note", `comentou em ${where}: ${r.annotation.text}`);
  await ctx.project.save();
  notify(ctx.otherId, "timeline", `${req.user.name} comentou em ${where}`, `${link(ctx.project)}#arquivos`);
  res.status(201).json(await annotationsOut(f, { ...ctx, me: req.user.id }));
}

export async function updateAnnotation(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const f = await loadFile(req, res, ctx);
  if (!f) return;
  const a = f.annotations.id(req.params.annotationId);
  if (!a) return res.status(404).json({ error: "Comentário não encontrado." });
  if (typeof req.body?.resolved !== "boolean") return res.status(400).json({ error: "Nada para mudar." });
  a.resolved = req.body.resolved;
  a.resolvedBy = a.resolved ? req.user.id : undefined;
  await f.save();
  res.json(await annotationsOut(f, { ...ctx, me: req.user.id }));
}

export async function removeAnnotation(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const f = await loadFile(req, res, ctx);
  if (!f) return;
  const a = f.annotations.id(req.params.annotationId);
  if (!a) return res.status(404).json({ error: "Comentário não encontrado." });
  if (String(a.author) !== String(req.user.id)) return res.status(403).json({ error: "Só quem escreveu pode apagar o comentário." });
  a.deleteOne();
  await f.save();
  res.json(await annotationsOut(f, { ...ctx, me: req.user.id }));
}

// ---------------------------------------------------------------- biblioteca
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Busca no catálogo das lojas parceiras. Sem busca: os que mais combinam com o projeto (sem IA). */
export async function catalog(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Só o arquiteto monta a biblioteca." });
  const q = String(req.query.q || "").trim().slice(0, 60);
  const activeStores = await User.find({ role: "store", status: { $ne: "suspended" } }).select("_id");
  const filter = { store: { $in: activeStores.map((s) => s._id) } };
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: re }, { category: re }, { tags: re }, { styles: re }];
  }
  let products = await StoreProduct.find(filter).sort("-createdAt").limit(q ? 40 : 200).populate("store", "name storeProfile.storeName");
  if (!q) {
    const terms = [...(ctx.project.preferredStyles || []), ...(ctx.project.preferredMaterials || [])].map((t) => t.toLowerCase());
    const score = (p) => terms.reduce((s, t) => s + ([p.category, ...(p.styles || []), ...(p.tags || []), p.name].filter(Boolean).some((x) => { const v = String(x).toLowerCase(); return v.includes(t) || t.includes(v); }) ? 1 : 0), 0);
    products = products.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s).slice(0, 24).map((x) => x.p);
  }
  const chosen = new Set(ctx.project.library.filter((i) => i.product).map((i) => String(i.product)));
  res.json(products.map((p) => ({
    id: String(p._id), name: p.name, photo: p.photo || "", category: p.category || "", price: p.price ?? null,
    purchaseUrl: p.purchaseUrl || "", storeName: p.store?.storeProfile?.storeName || p.store?.name || "", inLibrary: chosen.has(String(p._id)),
  })));
}

export async function addItem(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Só o arquiteto monta a biblioteca." });
  if (blockedByPlan(ctx, res)) return;
  if (ctx.project.library.length >= ctx.limits.libraryItems) {
    return res.status(409).json({ error: `A biblioteca deste projeto chegou ao limite de ${ctx.limits.libraryItems} itens.${ctx.tier === "free" ? ` ${UPGRADE_HINT}` : ""}`, plan: ctx.tier === "free" });
  }
  let item;
  if (req.body?.productId) {
    if (!isId(req.body.productId)) return res.status(400).json({ error: "Produto inválido." });
    const p = await StoreProduct.findById(req.body.productId).populate("store", "name status storeProfile.storeName");
    if (!p || !p.store || p.store.status === "suspended") return res.status(404).json({ error: "Produto não encontrado." });
    if (ctx.project.library.some((i) => String(i.product) === String(p._id))) return res.status(409).json({ error: "Este produto já está na biblioteca." });
    item = {
      kind: "product", product: p._id, store: p.store._id, name: p.name, photo: p.photo, category: p.category,
      storeName: p.store.storeProfile?.storeName || p.store.name, purchaseUrl: p.purchaseUrl, price: p.price,
      ...normalizeItemDetails(req.body),
    };
  } else {
    const custom = normalizeCustomItem(req.body);
    if (custom.error) return res.status(400).json({ error: custom.error });
    item = custom.item;
  }
  ctx.project.library.push(item);
  log(ctx.project, req.user.id, "library", `adicionou ${item.name} à biblioteca`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function updateItem(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const it = ctx.project.library.id(req.params.itemId);
  if (!it) return res.status(404).json({ error: "Item não encontrado." });
  if (typeof req.body?.purchased === "boolean" && req.body.purchased !== it.purchased) {
    it.purchased = req.body.purchased;
    log(ctx.project, req.user.id, "purchase", `${it.purchased ? "marcou como comprado" : "desmarcou a compra de"} ${it.name}`);
  }
  if (ctx.role === "architect" && !ctx.locked) {
    Object.assign(it, normalizeItemDetails(req.body));
    if (it.kind === "custom" && req.body?.price !== undefined) {
      const fixed = normalizeCustomItem({ name: it.name, price: req.body.price }).item;
      it.price = fixed.price;
    }
  }
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function removeItem(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Só o arquiteto monta a biblioteca." });
  const it = ctx.project.library.id(req.params.itemId);
  if (!it) return res.status(404).json({ error: "Item não encontrado." });
  const name = it.name;
  it.deleteOne();
  log(ctx.project, req.user.id, "library", `tirou ${name} da biblioteca`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

/** Reaproveita a seleção de outro projeto do mesmo arquiteto (sem quantidades nem compras). */
export async function copyLibrary(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Só o arquiteto monta a biblioteca." });
  if (blockedByPlan(ctx, res)) return;
  if (!ctx.limits.copyLibrary) return res.status(403).json({ error: `Trazer a biblioteca de outro projeto faz parte do Pro. ${UPGRADE_HINT}`, plan: true });
  if (!isId(req.params.otherId)) return res.status(404).json({ error: "Projeto não encontrado." });
  const other = await Project.findOne({ _id: req.params.otherId, architect: req.user.id }).select("name library");
  if (!other) return res.status(404).json({ error: "Projeto não encontrado." });
  const have = new Set(ctx.project.library.map((i) => (i.product ? `p:${i.product}` : `c:${i.name.toLowerCase()}`)));
  let added = 0;
  for (const i of other.library) {
    const key = i.product ? `p:${i.product}` : `c:${i.name.toLowerCase()}`;
    if (have.has(key) || ctx.project.library.length >= ctx.limits.libraryItems) continue;
    const { _id, purchased, quantity, room, addedAt, ...rest } = i.toObject();
    ctx.project.library.push({ ...rest, quantity: 1, purchased: false });
    have.add(key);
    added += 1;
  }
  if (added) log(ctx.project, req.user.id, "library", `trouxe ${added} ${added === 1 ? "item" : "itens"} da biblioteca de "${other.name}"`);
  await ctx.project.save();
  res.json({ added, workspace: await shape(ctx, req.user.id) });
}

/** Conceito do projeto escrito só com a biblioteca + a assinatura do arquiteto. */
export async function concept(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (!ctx.project.library.length) return res.status(400).json({ error: "A biblioteca ainda está vazia — o conceito é escrito só com os itens dela." });
  const architect = await User.findById(ctx.project.architect).select("name architectProfile.signature architectProfile.portfolio");
  const input = {
    project: ctx.project,
    library: ctx.project.library.map(shapeItem),
    signatureText: signatureToText(architect?.architectProfile?.signature, deriveSignature(architect?.architectProfile?.portfolio || [])),
    architectName: architect?.name || "o arquiteto",
  };
  // Gratuito: o texto padrão, montado só com a biblioteca (sem chamada de IA).
  if (!ctx.limits.aiConcept) return res.json({ concept: fallbackLibraryConcept(input), ai: false });
  res.json({ concept: await generateLibraryConcept(input), ai: true });
}
