import mongoose from "mongoose";
import ProjectFile from "../models/ProjectFile.js";
import Proposal from "../models/Proposal.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import { notify } from "../services/notificationService.js";
import { newReviewEmail, publicBaseUrl } from "../services/emailService.js";
import {
  LEGAL_STATUS,
  DEFAULT_LEGAL_DOCS,
  MEETING_KINDS,
  addMonths,
  buildIcs,
  buildReceipt,
  maintenancePlanFrom,
  meetingStatus,
  normalizeCustomLegalDoc,
  normalizeLegalDocUpdate,
  normalizeMaintenanceTask,
  normalizeMeeting,
  rrtOf,
} from "../services/officeRules.js";
import { alertOther, blockedByPlan, load, log, respond } from "./workspaceController.js";

/**
 * Rotina de escritório no Espaço do projeto: agenda (reuniões e visitas de
 * obra com convite .ics e ata), documentos legais (RRT do CAU, condomínio,
 * prefeitura…), recibo dos honorários pagos, entrega da obra com o plano de
 * manutenção do manual da casa e a avaliação verificada do arquiteto.
 */
const isId = (v) => mongoose.isValidObjectId(v);
const MEETING_LIMIT = 100;
const LEGAL_LIMIT = 20;
const MAINTENANCE_LIMIT = 30;
const when = (d) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// ---------------------------------------------------------------- agenda
function findMeeting(ctx, req, res) {
  const m = ctx.project.meetings.id(req.params.meetingId);
  if (!m) res.status(404).json({ error: "Compromisso não encontrado." });
  return m;
}

export async function addMeeting(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (blockedByPlan(ctx, res)) return;
  if (ctx.project.meetings.length >= MEETING_LIMIT) return res.status(409).json({ error: "A agenda deste projeto chegou ao limite de compromissos." });
  const r = normalizeMeeting(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  const mine = ctx.role === "client" ? { clientAnswer: "yes" } : { architectAnswer: "yes" };
  ctx.project.meetings.push({ ...r.meeting, ...mine, createdBy: req.user._id });
  log(ctx.project, req.user.id, "meeting", `marcou "${r.meeting.title}" para ${when(r.meeting.startsAt)}`);
  await ctx.project.save();
  await alertOther(ctx, `${req.user.name} marcou "${r.meeting.title}" para ${when(r.meeting.startsAt)} — confirme na agenda do projeto`, {
    subject: `${MEETING_KINDS[r.meeting.kind]} marcada: ${when(r.meeting.startsAt)} — match.IA`,
    lines: [
      `${req.user.name} marcou "${r.meeting.title}" no projeto "${ctx.project.name}".`,
      `Quando: ${when(r.meeting.startsAt)} (${r.meeting.durationMin} min)${r.meeting.place ? `\nOnde: ${r.meeting.place}` : ""}${r.meeting.note ? `\nRecado: ${r.meeting.note}` : ""}`,
      "Confirme ou recuse na aba Agenda do Espaço do projeto. Lá também dá para adicionar ao Google Agenda ou ao Outlook.",
    ],
  });
  await respond(res, ctx, req);
}

export async function answerMeeting(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const m = findMeeting(ctx, req, res);
  if (!m) return;
  if (m.cancelledAt) return res.status(409).json({ error: "Este compromisso foi cancelado." });
  const answer = req.body?.answer === "yes" ? "yes" : req.body?.answer === "no" ? "no" : null;
  if (!answer) return res.status(400).json({ error: "Responda sim ou não." });
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : "";
  if (answer === "no" && note.length < 3) return res.status(400).json({ error: "Sugira outro dia ou horário para remarcar." });
  m[ctx.role === "client" ? "clientAnswer" : "architectAnswer"] = answer;
  if (note) m.answerNote = note;
  log(ctx.project, req.user.id, "meeting", `${answer === "yes" ? "confirmou" : "recusou"} "${m.title}" (${when(m.startsAt)})${note ? `: ${note}` : ""}`);
  await ctx.project.save();
  await alertOther(ctx, `${req.user.name} ${answer === "yes" ? "confirmou" : "não pode ir em"} "${m.title}" (${when(m.startsAt)})`, {
    subject: `${answer === "yes" ? "Confirmado" : "Remarcar"}: ${m.title} — match.IA`,
    lines: [`${req.user.name} ${answer === "yes" ? "confirmou" : "recusou"} "${m.title}" de ${when(m.startsAt)} no projeto "${ctx.project.name}".`, ...(note ? [`Recado: ${note}`] : [])],
  });
  await respond(res, ctx, req);
}

export async function saveMinutes(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "A ata é registrada pelo escritório." });
  if (blockedByPlan(ctx, res)) return;
  const m = findMeeting(ctx, req, res);
  if (!m) return;
  if (meetingStatus(m) === "cancelled") return res.status(409).json({ error: "Este compromisso foi cancelado." });
  if (new Date(m.startsAt).getTime() > Date.now() + 30 * 60 * 1000) return res.status(409).json({ error: "A ata é registrada depois do encontro." });
  const minutes = typeof req.body?.minutes === "string" ? req.body.minutes.trim().slice(0, 3000) : "";
  if (minutes.length < 10) return res.status(400).json({ error: "Escreva o que foi decidido (pelo menos uma frase)." });
  m.minutes = minutes;
  m.minutesBy = req.user._id;
  m.minutesAt = new Date();
  log(ctx.project, req.user.id, "meeting", `registrou a ata de "${m.title}": ${minutes.slice(0, 160)}${minutes.length > 160 ? "…" : ""}`);
  await ctx.project.save();
  notify(ctx.otherId, "timeline", `${req.user.name} registrou a ata de "${m.title}"`, `projeto.html?id=${ctx.project._id}#agenda`);
  await respond(res, ctx, req);
}

export async function cancelMeeting(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const m = findMeeting(ctx, req, res);
  if (!m) return;
  if (String(m.createdBy) !== String(req.user.id) && !ctx.isOwner) return res.status(403).json({ error: "Só quem marcou pode cancelar." });
  if (m.cancelledAt) return res.status(409).json({ error: "Já estava cancelado." });
  m.cancelledAt = new Date();
  log(ctx.project, req.user.id, "meeting", `cancelou "${m.title}" (${when(m.startsAt)})`);
  await ctx.project.save();
  await alertOther(ctx, `${req.user.name} cancelou "${m.title}" (${when(m.startsAt)})`, {
    subject: `Cancelado: ${m.title} — match.IA`,
    lines: [`${req.user.name} cancelou "${m.title}" de ${when(m.startsAt)} no projeto "${ctx.project.name}".`],
  });
  await respond(res, ctx, req);
}

/** Convite .ics (Google Agenda, Outlook, Apple Calendário). */
export async function meetingIcs(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const m = findMeeting(ctx, req, res);
  if (!m) return;
  const url = `${publicBaseUrl(req)}/projeto.html?id=${ctx.project._id}#agenda`;
  const ics = buildIcs({
    uid: String(m._id),
    title: `${m.title} — ${ctx.project.name}`,
    startsAt: m.startsAt,
    durationMin: m.durationMin,
    place: m.place,
    description: [m.note, `Espaço do projeto: ${url}`].filter(Boolean).join("\n"),
    url,
  });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="compromisso-${String(m._id).slice(-6)}.ics"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(ics);
}

// ---------------------------------------------------------------- documentos legais
function materializeDocs(project) {
  if (!project.legalDocs.length) project.legalDocs = DEFAULT_LEGAL_DOCS.map((d) => ({ ...d, status: "pendente" }));
}

export async function updateLegalDoc(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Os documentos são atualizados pelo escritório." });
  if (blockedByPlan(ctx, res)) return;
  materializeDocs(ctx.project);
  const doc = ctx.project.legalDocs.find((d) => d.key === req.params.key);
  if (!doc) return res.status(404).json({ error: "Documento não encontrado." });
  const r = normalizeLegalDocUpdate(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  Object.assign(doc, r.changes);
  if (req.body?.fileId !== undefined) {
    if (!req.body.fileId) doc.file = undefined;
    else {
      if (!isId(req.body.fileId) || !(await ProjectFile.exists({ _id: req.body.fileId, project: ctx.project._id, kind: { $ne: "diary" } }))) return res.status(400).json({ error: "Arquivo inválido." });
      doc.file = req.body.fileId;
    }
  }
  doc.updatedAt = new Date();
  log(ctx.project, req.user.id, "legal", `atualizou "${doc.name}": ${LEGAL_STATUS[doc.status]}${doc.number ? ` (nº ${doc.number})` : ""}`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function addLegalDoc(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Os documentos são atualizados pelo escritório." });
  if (blockedByPlan(ctx, res)) return;
  materializeDocs(ctx.project);
  if (ctx.project.legalDocs.length >= LEGAL_LIMIT) return res.status(409).json({ error: `Até ${LEGAL_LIMIT} documentos por projeto.` });
  const r = normalizeCustomLegalDoc(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  ctx.project.legalDocs.push(r.doc);
  log(ctx.project, req.user.id, "legal", `incluiu "${r.doc.name}" nos documentos da obra`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function removeLegalDoc(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Os documentos são atualizados pelo escritório." });
  if (!String(req.params.key).startsWith("custom-")) return res.status(400).json({ error: "Os documentos padrão não saem da lista — marque como \"Não se aplica\"." });
  const before = ctx.project.legalDocs.length;
  ctx.project.legalDocs = ctx.project.legalDocs.filter((d) => d.key !== req.params.key);
  if (ctx.project.legalDocs.length === before) return res.status(404).json({ error: "Documento não encontrado." });
  await ctx.project.save();
  await respond(res, ctx, req);
}

// ---------------------------------------------------------------- recibo
export async function stageReceipt(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const index = ctx.project.stages.findIndex((s) => s.key === req.params.key);
  const stage = ctx.project.stages[index];
  if (!stage) return res.status(404).json({ error: "Etapa não encontrada." });
  if (stage.feeStatus !== "paid") return res.status(409).json({ error: "O recibo sai quando o arquiteto confirma o recebimento." });
  const [client, architect, contract] = await Promise.all([
    User.findById(ctx.project.client).select("name"),
    User.findById(ctx.project.architect).select("name architectProfile.taxId architectProfile.cauVerification.number"),
    ctx.project.contract ? Proposal.findById(ctx.project.contract).select("version") : null,
  ]);
  res.json(buildReceipt({ project: ctx.project, stage, stageIndex: index, client, architect, rrt: rrtOf(ctx.project.legalDocs || []), contractVersion: contract?.version }));
}

// ---------------------------------------------------------------- entrega da obra e manutenção
export async function registerHandover(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (!ctx.isOwner) return res.status(403).json({ error: "Só o arquiteto responsável registra a entrega da obra." });
  if (blockedByPlan(ctx, res)) return;
  const d = req.body?.date ? new Date(req.body.date) : new Date();
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 864e5) return res.status(400).json({ error: "Data de entrega inválida." });
  ctx.project.handoverAt = d;
  if (!ctx.project.maintenance.length) ctx.project.maintenance = maintenancePlanFrom({ library: ctx.project.library, crew: ctx.project.crew }, d);
  log(ctx.project, req.user.id, "handover", `registrou a entrega da obra em ${d.toLocaleDateString("pt-BR", { timeZone: "UTC" })} — o manual da casa está pronto`);
  await ctx.project.save();
  await alertOther(ctx, `${req.user.name} registrou a entrega da obra — o manual da sua casa está pronto`, {
    subject: `Manual da casa: "${ctx.project.name}" — match.IA`,
    lines: [`A obra do projeto "${ctx.project.name}" foi entregue. No Espaço do projeto, aba Obra, está o manual da casa: os materiais usados, onde foram comprados, as garantias, quem executou cada serviço e o plano de manutenção.`, "Vamos te lembrar por e-mail quando chegar a hora de cada manutenção."],
  });
  await respond(res, ctx, req);
}

export async function addMaintenance(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "O plano de manutenção é montado pelo escritório." });
  if (blockedByPlan(ctx, res)) return;
  if (ctx.project.maintenance.length >= MAINTENANCE_LIMIT) return res.status(409).json({ error: `Até ${MAINTENANCE_LIMIT} itens de manutenção.` });
  const r = normalizeMaintenanceTask(req.body, ctx.project.handoverAt || new Date());
  if (r.error) return res.status(400).json({ error: r.error });
  ctx.project.maintenance.push(r.task);
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function removeMaintenance(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "O plano de manutenção é montado pelo escritório." });
  const t = ctx.project.maintenance.id(req.params.taskId);
  if (!t) return res.status(404).json({ error: "Item não encontrado." });
  t.deleteOne();
  await ctx.project.save();
  await respond(res, ctx, req);
}

/** Manutenção feita: o próximo lembrete conta a partir de hoje. */
export async function maintenanceDone(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const t = ctx.project.maintenance.id(req.params.taskId);
  if (!t) return res.status(404).json({ error: "Item não encontrado." });
  const now = new Date();
  t.lastDoneAt = now;
  t.nextAt = addMonths(now, t.everyMonths);
  t.remindedAt = undefined;
  log(ctx.project, req.user.id, "handover", `marcou como feita: ${t.task}`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

// ---------------------------------------------------------------- avaliação verificada
export async function reviewArchitect(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "client") return res.status(403).json({ error: "Quem avalia é o cliente." });
  if (!ctx.project.stages.some((s) => s.status === "approved")) return res.status(409).json({ error: "Avalie depois que a primeira etapa for aprovada." });
  const rating = Math.round(Number(req.body?.rating));
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "Dê uma nota de 1 a 5." });
  const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 1000) : "";
  const review = await Review.findOneAndUpdate(
    { client: req.user._id, architect: ctx.project.architect },
    { rating, comment, verified: true, project: ctx.project._id },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const architect = await User.findById(ctx.project.architect).select("name email");
  if (architect) {
    newReviewEmail(architect, req.user.name, review.rating, review.comment).catch(() => {});
    notify(architect._id, "review", `${req.user.name} te avaliou com ${review.rating}★ (avaliação verificada)`, `arquiteto.html?id=${architect._id}`);
  }
  await respond(res, ctx, req);
}
