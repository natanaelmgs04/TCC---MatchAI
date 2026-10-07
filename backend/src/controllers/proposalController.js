import mongoose from "mongoose";
import Proposal from "../models/Proposal.js";
import Hire from "../models/Hire.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { notify } from "../services/notificationService.js";
import { proposalEmail } from "../services/emailService.js";
import { acceptHireFromContract } from "./hireController.js";
import { STAGE_TEMPLATES, normalizeStageList, stagesFromTemplate, targetDate } from "../services/workspaceRules.js";
import { buildContractDocument, documentHash, normalizeProposalInput, signatureMatches } from "../services/contractRules.js";

/**
 * Proposta e contrato (contrato.html). O arquiteto envia a proposta a partir
 * de um pedido de contratação e assina digitando o nome; o cliente assina do
 * mesmo jeito — e isso aceita a contratação e monta o Espaço do projeto com
 * as etapas, os prazos e os honorários do contrato.
 */
const isId = (v) => mongoose.isValidObjectId(v);
const DAY = 24 * 60 * 60 * 1000;

function signatureOf(req, name) {
  return { name: String(name).trim().slice(0, 120), at: new Date(), ip: String(req.ip || "").slice(0, 60), userAgent: String(req.get("user-agent") || "").slice(0, 200) };
}

const shapeSignature = (s) => (s?.at ? { name: s.name, at: s.at } : null); // IP fica guardado, mas não vai para a tela

function shape(p, me) {
  const role = String(p.architect?._id || p.architect) === String(me) ? "architect" : "client";
  return {
    id: String(p._id),
    hire: String(p.hire),
    project: String(p.project?._id || p.project),
    status: p.status,
    version: p.version,
    role,
    expired: p.status === "sent" && p.validUntil && new Date(p.validUntil) < new Date(),
    document: p.document,
    documentHash: p.documentHash,
    architectSignature: shapeSignature(p.architectSignature),
    clientSignature: shapeSignature(p.clientSignature),
    declinedReason: p.declinedReason || "",
    createdAt: p.createdAt,
    names: { architect: p.architect?.name, client: p.client?.name },
  };
}

async function loadVisible(req, res) {
  if (!isId(req.params.id)) { res.status(404).json({ error: "Proposta não encontrada." }); return null; }
  const p = await Proposal.findOne({ _id: req.params.id, $or: [{ client: req.user.id }, { architect: req.user.id }] })
    .populate("architect", "name").populate("client", "name");
  if (!p) res.status(404).json({ error: "Proposta não encontrada." });
  return p;
}

/** Dados para o arquiteto montar a proposta de um pedido pendente (modelos de etapas incluídos). */
export async function draft(req, res) {
  if (req.user.role !== "architect") return res.status(403).json({ error: "Só o arquiteto envia propostas." });
  if (!isId(req.params.hireId)) return res.status(404).json({ error: "Pedido não encontrado." });
  const hire = await Hire.findOne({ _id: req.params.hireId, architect: req.user.id }).populate("project", "name propertyType areaM2 city state budget projectGoals").populate("client", "name");
  if (!hire) return res.status(404).json({ error: "Pedido não encontrado." });
  const last = await Proposal.findOne({ hire: hire._id }).sort("-createdAt").lean();
  res.json({
    hire: { id: String(hire._id), status: hire.status, message: hire.message || "" },
    project: hire.project,
    client: { name: hire.client?.name },
    architectName: req.user.name,
    last: last ? { status: last.status, scope: last.scope, stages: last.stages, paymentTerms: last.paymentTerms, version: last.version } : null,
    templates: [
      ...Object.entries(STAGE_TEMPLATES).map(([id, t]) => ({ id, name: t.label, stages: t.stages.map(({ key, ...st }) => st) })),
      ...(req.user.architectProfile?.stageTemplates || []).map((t) => ({ id: String(t._id), name: t.name, stages: t.stages })),
    ],
  });
}

export async function create(req, res) {
  if (req.user.role !== "architect") return res.status(403).json({ error: "Só o arquiteto envia propostas." });
  const hireId = req.body?.hireId;
  if (!isId(hireId)) return res.status(400).json({ error: "Pedido inválido." });
  const hire = await Hire.findOne({ _id: hireId, architect: req.user.id }).populate("project").populate("client", "name email");
  if (!hire) return res.status(404).json({ error: "Pedido não encontrado." });
  if (hire.status !== "pending") return res.status(409).json({ error: "Este pedido já foi respondido." });
  const input = normalizeProposalInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  const st = normalizeStageList(req.body?.stages, { withFees: true });
  if (st.error) return res.status(400).json({ error: st.error });
  if (!signatureMatches(req.body?.signatureName, req.user.name)) {
    return res.status(400).json({ error: `Para assinar, digite seu nome completo exatamente como está na sua conta: ${req.user.name}.` });
  }
  const previous = await Proposal.find({ hire: hire._id }).sort("-version").select("version status");
  await Proposal.updateMany({ hire: hire._id, status: "sent" }, { $set: { status: "cancelled" } }); // a nova substitui a anterior
  const version = (previous[0]?.version || 0) + 1;
  const validUntil = new Date(Date.now() + input.validDays * DAY);
  const document = buildContractDocument({ project: hire.project, client: hire.client, architect: req.user, scope: input.scope, stages: st.stages, paymentTerms: input.paymentTerms, validUntil, version });
  const proposal = await Proposal.create({
    hire: hire._id, project: hire.project._id, client: hire.client._id, architect: req.user._id, version,
    scope: input.scope, stages: st.stages, paymentTerms: input.paymentTerms, total: document.total, validUntil,
    document, documentHash: documentHash(document), architectSignature: signatureOf(req, req.body.signatureName),
  });
  const text = `${req.user.name} enviou uma proposta${version > 1 ? ` (versão ${version})` : ""} para o projeto "${hire.project.name}"`;
  notify(hire.client._id, "hire", text, `contrato.html?id=${proposal._id}`);
  proposalEmail(hire.client, {
    subject: `Proposta de ${req.user.name} para "${hire.project.name}" — match.IA`,
    lines: [`${text}: ${st.stages.length} etapas, total de ${document.totalText}.`, `Leia com calma: se estiver tudo certo, assine digitando o seu nome. A proposta vale até ${validUntil.toLocaleDateString("pt-BR")}.`],
    proposalId: proposal._id,
  }).catch(() => {});
  const full = await Proposal.findById(proposal._id).populate("architect", "name").populate("client", "name");
  res.status(201).json(shape(full, req.user.id));
}

export async function get(req, res) {
  const p = await loadVisible(req, res);
  if (p) res.json(shape(p, req.user.id));
}

export async function sign(req, res) {
  const p = await loadVisible(req, res);
  if (!p) return;
  if (String(p.client._id) !== String(req.user.id)) return res.status(403).json({ error: "Só o cliente assina a proposta recebida." });
  if (p.status !== "sent") return res.status(409).json({ error: "Esta proposta não está mais aberta para assinatura." });
  if (p.validUntil && new Date(p.validUntil) < new Date()) return res.status(409).json({ error: "A proposta venceu. Peça ao arquiteto uma nova versão." });
  if (req.body?.agree !== true) return res.status(400).json({ error: "Marque que leu e concorda com a proposta." });
  if (!signatureMatches(req.body?.signatureName, req.user.name)) {
    return res.status(400).json({ error: `Para assinar, digite seu nome completo exatamente como está na sua conta: ${req.user.name}.` });
  }
  if (documentHash(p.document) !== p.documentHash) return res.status(409).json({ error: "O documento não confere com o que foi assinado pelo arquiteto." });

  const architect = await User.findById(p.architect._id);
  const hire = await acceptHireFromContract(p.hire, architect);
  if (!hire) return res.status(409).json({ error: "Este pedido de contratação já foi respondido." });

  p.clientSignature = signatureOf(req, req.body.signatureName);
  p.status = "signed";
  await p.save();

  // O Espaço do projeto nasce com as etapas, prazos e honorários do contrato.
  const start = new Date();
  await Project.updateOne({ _id: p.project }, {
    $set: {
      stages: stagesFromTemplate(p.stages.map((s) => (s.toObject ? s.toObject() : s)), start),
      targetDate: targetDate(start, p.stages),
      workspaceStartedAt: start,
      contract: p._id,
    },
    $push: { activity: { by: req.user._id, kind: "approve", text: `assinou o contrato (versão ${p.version}) — o projeto começou com ${p.stages.length} etapas` } },
  });

  const project = await Project.findById(p.project).select("name");
  notify(architect._id, "hire", `${req.user.name} assinou o contrato do projeto "${project.name}" — o Espaço do projeto já está com as etapas`, `projeto.html?id=${p.project}`);
  proposalEmail(architect, {
    subject: `Contrato assinado: "${project.name}" — match.IA`,
    lines: [`${req.user.name} assinou o contrato do projeto "${project.name}". A contratação foi fechada e o Espaço do projeto já tem as etapas, os prazos e os honorários do contrato.`],
    proposalId: p._id,
  }).catch(() => {});
  const full = await Proposal.findById(p._id).populate("architect", "name").populate("client", "name");
  res.json(shape(full, req.user.id));
}

export async function decline(req, res) {
  const p = await loadVisible(req, res);
  if (!p) return;
  if (String(p.client._id) !== String(req.user.id)) return res.status(403).json({ error: "Só o cliente recusa a proposta." });
  if (p.status !== "sent") return res.status(409).json({ error: "Esta proposta não está mais aberta." });
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 600) : "";
  if (reason.length < 5) return res.status(400).json({ error: "Conte ao arquiteto o que mudar — ele pode mandar uma nova versão." });
  p.status = "declined";
  p.declinedReason = reason;
  await p.save();
  const project = await Project.findById(p.project).select("name");
  notify(p.architect._id, "hire", `${req.user.name} pediu mudanças na proposta do projeto "${project?.name || ""}"`, `contrato.html?hire=${p.hire}`);
  const architect = await User.findById(p.architect._id).select("name email");
  proposalEmail(architect, {
    subject: `Mudanças pedidas na proposta — match.IA`,
    lines: [`${req.user.name} não assinou a proposta do projeto "${project?.name || ""}" e pediu mudanças:`, reason, "Você pode enviar uma nova versão pelo pedido de contratação."],
    proposalId: p._id,
  }).catch(() => {});
  const full = await Proposal.findById(p._id).populate("architect", "name").populate("client", "name");
  res.json(shape(full, req.user.id));
}
