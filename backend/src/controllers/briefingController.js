import mongoose from "mongoose";
import Briefing from "../models/Briefing.js";
import Hire from "../models/Hire.js";
import User from "../models/User.js";
import { notify } from "../services/notificationService.js";
import { workspaceEmail } from "../services/emailService.js";
import { BRIEFING_TYPES, DEFAULT_BRIEFING, briefingToText, normalizeBriefingAnswers, normalizeBriefingQuestions } from "../services/officeRules.js";

/**
 * Briefing do arquiteto (briefing.html): ele monta o próprio questionário
 * (programa de necessidades), manda para o cliente a partir de um pedido de
 * contratação, e as respostas aparecem na proposta, no Espaço do projeto e
 * no assistente de IA dele.
 */
const isId = (v) => mongoose.isValidObjectId(v);
const templateOf = (user) => (user.architectProfile?.briefingQuestions?.length ? user.architectProfile.briefingQuestions : DEFAULT_BRIEFING);
const link = (b) => `briefing.html?id=${b._id}`;

function shape(b, me) {
  return {
    id: String(b._id),
    hire: String(b.hire),
    project: { id: String(b.project?._id || b.project), name: b.project?.name || "" },
    role: String(b.architect?._id || b.architect) === String(me) ? "architect" : "client",
    names: { architect: b.architect?.name || "", client: b.client?.name || "" },
    message: b.message || "",
    questions: b.questions,
    answers: Object.fromEntries((b.answers || []).map((a) => [a.id, a.value])),
    status: b.status,
    sentAt: b.sentAt,
    answeredAt: b.answeredAt || null,
    summary: b.status === "answered" ? briefingToText(b.questions, b.answers) : "",
  };
}

const populate = (q) => q.populate("architect", "name").populate("client", "name").populate("project", "name");

export async function getTemplate(req, res) {
  if (req.user.role !== "architect") return res.status(403).json({ error: "O briefing é montado pelo arquiteto." });
  res.json({ questions: templateOf(req.user), isDefault: !req.user.architectProfile?.briefingQuestions?.length, types: BRIEFING_TYPES });
}

export async function saveTemplate(req, res) {
  if (req.user.role !== "architect") return res.status(403).json({ error: "O briefing é montado pelo arquiteto." });
  const r = normalizeBriefingQuestions(req.body?.questions);
  if (r.error) return res.status(400).json({ error: r.error });
  req.user.architectProfile.briefingQuestions = r.questions;
  await req.user.save();
  res.json({ questions: r.questions, isDefault: false, types: BRIEFING_TYPES });
}

export async function resetTemplate(req, res) {
  if (req.user.role !== "architect") return res.status(403).json({ error: "O briefing é montado pelo arquiteto." });
  req.user.architectProfile.briefingQuestions = [];
  await req.user.save();
  res.json({ questions: DEFAULT_BRIEFING, isDefault: true, types: BRIEFING_TYPES });
}

/** O arquiteto manda (ou reenvia, enquanto não foi respondido) o briefing de um pedido de contratação. */
export async function send(req, res) {
  if (req.user.role !== "architect") return res.status(403).json({ error: "Só o arquiteto envia o briefing." });
  if (!isId(req.body?.hireId)) return res.status(400).json({ error: "Pedido inválido." });
  const hire = await Hire.findOne({ _id: req.body.hireId, architect: req.user.id, status: { $in: ["pending", "accepted"] } }).populate("project", "name").populate("client", "name email");
  if (!hire || !hire.project || !hire.client) return res.status(404).json({ error: "Pedido não encontrado." });
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 600) : "";
  let b = await Briefing.findOne({ hire: hire._id });
  if (b?.status === "answered") return res.status(409).json({ error: "O cliente já respondeu este briefing." });
  const questions = templateOf(req.user);
  if (b) Object.assign(b, { questions, message, sentAt: new Date() });
  else b = new Briefing({ hire: hire._id, project: hire.project._id, architect: req.user._id, client: hire.client._id, questions, message, sentAt: new Date() });
  await b.save();
  notify(hire.client._id, "hire", `${req.user.name} mandou um briefing sobre o projeto "${hire.project.name}" — responda para receber a proposta certa`, link(b));
  workspaceEmail(hire.client, {
    subject: `Briefing de ${req.user.name}: "${hire.project.name}" — match.IA`,
    lines: [`${req.user.name} quer conhecer melhor o seu projeto "${hire.project.name}" antes de mandar a proposta: são ${questions.length} perguntas rápidas (programa de necessidades).`, ...(message ? [`Recado: ${message}`] : [])],
    cta: "Responder o briefing",
    path: link(b),
  }).catch(() => {});
  res.status(201).json(shape(await populate(Briefing.findById(b._id)), req.user.id));
}

async function loadVisible(req, res, filter) {
  const b = await populate(Briefing.findOne({ ...filter, $or: [{ architect: req.user.id }, { client: req.user.id }] }));
  if (!b) res.status(404).json({ error: "Briefing não encontrado." });
  return b;
}

export async function get(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Briefing não encontrado." });
  const b = await loadVisible(req, res, { _id: req.params.id });
  if (b) res.json(shape(b, req.user.id));
}

export async function getByHire(req, res) {
  if (!isId(req.params.hireId)) return res.status(404).json({ error: "Briefing não encontrado." });
  const b = await loadVisible(req, res, { hire: req.params.hireId });
  if (b) res.json(shape(b, req.user.id));
}

export async function answer(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Briefing não encontrado." });
  const b = await loadVisible(req, res, { _id: req.params.id });
  if (!b) return;
  if (String(b.client._id) !== String(req.user.id)) return res.status(403).json({ error: "Quem responde o briefing é o cliente." });
  if (b.status === "answered") return res.status(409).json({ error: "Você já respondeu este briefing." });
  const r = normalizeBriefingAnswers(b.questions, req.body?.answers);
  if (r.error) return res.status(400).json({ error: r.error });
  b.answers = r.answers;
  b.status = "answered";
  b.answeredAt = new Date();
  await b.save();
  notify(b.architect._id, "hire", `${req.user.name} respondeu o briefing do projeto "${b.project?.name || ""}"`, link(b));
  const architect = await User.findById(b.architect._id).select("name email");
  workspaceEmail(architect, {
    subject: `Briefing respondido: "${b.project?.name || ""}" — match.IA`,
    lines: [`${req.user.name} respondeu o briefing do projeto "${b.project?.name || ""}". As respostas aparecem na hora de montar a proposta e no seu assistente de IA.`],
    cta: "Ver as respostas",
    path: link(b),
  }).catch(() => {});
  res.json(shape(b, req.user.id));
}
