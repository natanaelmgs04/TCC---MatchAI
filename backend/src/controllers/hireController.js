import mongoose from "mongoose";
import { avatarPath } from "../services/avatar.js";
import Hire from "../models/Hire.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import Validation from "../models/Validation.js";
import Commission from "../models/Commission.js";
import { canRequestHire, canDecideHire, publicProjectTitle } from "../services/hireRules.js";
import { notify } from "../services/notificationService.js";
import { hireRequestEmail, hireDecisionEmail, hireCancelledEmail } from "../services/emailService.js";

const COMMISSION_RATE = 0.08;
const FALLBACK_PROJECT_VALUE = 20000;
const isId = (v) => mongoose.isValidObjectId(v);
const midOf = (range) => {
  if (!range) return null;
  if (range.min != null && range.max != null) return (range.min + range.max) / 2;
  return range.min ?? range.max ?? null;
};
const clip = (v) => (typeof v === "string" ? v.trim().slice(0, 1000) : undefined);

function shape(hire) {
  const p = hire.project;
  return {
    id: hire.id,
    status: hire.status,
    message: hire.message || "",
    response: hire.response || "",
    createdAt: hire.createdAt,
    decidedAt: hire.decidedAt || null,
    project: p?._id
      ? {
          id: p.id,
          name: p.name,
          propertyType: p.propertyType,
          areaM2: p.areaM2,
          city: p.city,
          state: p.state,
          preferredStyles: p.preferredStyles || [],
          preferredMaterials: p.preferredMaterials || [],
          budget: p.budget,
          projectGoals: p.projectGoals,
          status: p.status,
        }
      : { id: String(p) },
    client: hire.client?._id ? { id: hire.client.id, name: hire.client.name, avatar: avatarPath(hire.client), city: hire.client.city, state: hire.client.state } : { id: String(hire.client) },
    architect: hire.architect?._id ? { id: hire.architect.id, name: hire.architect.name, avatar: avatarPath(hire.architect), city: hire.architect.city, state: hire.architect.state } : { id: String(hire.architect) },
  };
}
const populateAll = (q) =>
  q.populate("project", "name propertyType areaM2 city state preferredStyles preferredMaterials budget projectGoals status")
    .populate("client", "name city state avatarVersion")
    .populate("architect", "name city state avatarVersion");

/** POST /api/hires { projectId, architectId, message } — cliente pede a contratação. */
export async function requestHire(req, res) {
  const { projectId, architectId } = req.body || {};
  if (!isId(projectId) || !isId(architectId)) return res.status(400).json({ error: "Escolha o projeto e o arquiteto." });

  const [project, architect, openHire, acceptedHire] = await Promise.all([
    Project.findById(projectId),
    User.findById(architectId),
    Hire.findOne({ project: projectId, status: "pending" }),
    Hire.findOne({ project: projectId, status: "accepted" }),
  ]);
  const problem = canRequestHire({ project, architect, openHire, acceptedHire, clientId: req.user.id });
  if (problem) return res.status(problem.status).json({ error: problem.error });

  let hire;
  try {
    hire = await Hire.create({ project: project.id, client: req.user.id, architect: architect.id, message: clip(req.body.message) });
  } catch (err) {
    // Dois cliques ao mesmo tempo: o índice único de "um pedido aberto por projeto" barra o segundo.
    if (err?.code === 11000) return res.status(409).json({ error: "Este projeto já tem um pedido de contratação aguardando resposta." });
    throw err;
  }
  if (project.status === "draft") await Project.updateOne({ _id: project.id }, { status: "matching" });

  notify(architect.id, "hire", `${req.user.name} quer contratar você para o projeto "${project.name}"`, "dashboard.html#contratacoes");
  hireRequestEmail(architect, req.user, project).catch(() => {});
  res.status(201).json(shape(await populateAll(Hire.findById(hire.id))));
}

/** GET /api/hires — do cliente: os pedidos que ele fez; do arquiteto: os que recebeu. */
export async function listHires(req, res) {
  const filter = req.user.role === "architect" ? { architect: req.user.id } : { client: req.user.id };
  const hires = await populateAll(Hire.find(filter).sort("-createdAt").limit(200));
  res.json(hires.map(shape));
}

async function closeProject(hire) {
  const [client, architect, project] = await Promise.all([
    User.findById(hire.client),
    User.findById(hire.architect),
    Project.findById(hire.project),
  ]);
  if (!client || !architect || !project) return;

  await Project.updateOne({ _id: project.id }, { architect: architect.id, status: "in_progress" });
  await User.updateOne({ _id: architect.id }, { $inc: { "architectProfile.closedProjectsCount": 1 } });

  // A contratação vale como "resumo confirmado pelos dois lados" — é o que
  // libera o case de sucesso (ver caseStudyController) e conta nas estatísticas.
  const validation = await Validation.findOneAndUpdate(
    { client: client.id, architect: architect.id },
    { $set: { clientConfirmed: true, architectConfirmed: true } },
    { upsert: true, new: true },
  );

  // Comissão simulada (sem gateway de pagamento), uma por par cliente–arquiteto.
  const estimatedValue = midOf(project.budget) ?? midOf(architect.architectProfile?.priceRange) ?? FALLBACK_PROJECT_VALUE;
  const amount = Math.round(estimatedValue * COMMISSION_RATE);
  await Commission.findOneAndUpdate(
    { validation: validation._id },
    { $setOnInsert: { architect: architect.id, client: client.id, project: project.id, validation: validation._id, rate: COMMISSION_RATE, estimatedValue, amount } },
    { upsert: true, new: true },
  );
  notify(architect.id, "commission", `Projeto "${project.name}" fechado com ${client.name} — comissão simulada de R$${amount}`, "dashboard.html#contratacoes");
}

async function decide(req, res, action) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Pedido não encontrado" });
  const hire = await Hire.findById(req.params.id);
  const problem = canDecideHire(hire, { action, userId: req.user.id, role: req.user.role });
  if (problem) return res.status(problem.status).json({ error: problem.error });

  const status = { accept: "accepted", decline: "declined", cancel: "cancelled" }[action];
  // Atômico: só muda se ainda estiver pendente (protege contra clique duplo).
  const updated = await Hire.findOneAndUpdate(
    { _id: hire.id, status: "pending" },
    { status, decidedAt: new Date(), ...(action !== "cancel" && clip(req.body?.response) ? { response: clip(req.body.response) } : {}) },
    { new: true },
  );
  if (!updated) return res.status(409).json({ error: "Este pedido já foi respondido." });

  const full = await populateAll(Hire.findById(updated.id));
  const projectName = full.project?.name || "seu projeto";
  if (action === "accept") {
    await closeProject(updated);
    notify(updated.client, "hire", `${req.user.name} aceitou seu pedido — o projeto "${projectName}" foi fechado!`, `arquiteto.html?id=${req.user.id}`);
    hireDecisionEmail(await User.findById(updated.client), req.user, projectName, true, updated.response).catch(() => {});
  } else if (action === "decline") {
    if (full.project?.id) await Project.updateOne({ _id: full.project.id, architect: { $exists: false } }, { status: "draft" });
    notify(updated.client, "hire", `${req.user.name} não pôde aceitar o projeto "${projectName}". Você pode contratar outro arquiteto.`, "dashboard.html");
    hireDecisionEmail(await User.findById(updated.client), req.user, projectName, false, updated.response).catch(() => {});
  } else {
    notify(updated.architect, "hire", `${req.user.name} cancelou o pedido de contratação do projeto "${projectName}"`, "dashboard.html#contratacoes");
    hireCancelledEmail(await User.findById(updated.architect), req.user, projectName).catch(() => {});
  }
  res.json(shape(await populateAll(Hire.findById(updated.id))));
}

export const acceptHire = (req, res) => decide(req, res, "accept");
export const declineHire = (req, res) => decide(req, res, "decline");
export const cancelHire = (req, res) => decide(req, res, "cancel");

/** GET /api/architects/:id/closed-projects — público: projetos fechados pela plataforma, sem dados do cliente. */
export async function listClosedProjects(req, res) {
  if (!isId(req.params.id)) return res.json([]);
  const hires = await Hire.find({ architect: req.params.id, status: "accepted" })
    .sort("-decidedAt")
    .limit(50)
    .populate("project", "propertyType areaM2 preferredStyles status city state")
    .populate("client", "city state");
  res.json(
    hires
      .filter((h) => h.project)
      .map((h) => ({
        id: h.id,
        title: publicProjectTitle(h.project),
        styles: (h.project.preferredStyles || []).slice(0, 3),
        areaM2: h.project.areaM2 || null,
        location: [h.project.city || h.client?.city, h.project.state || h.client?.state].filter(Boolean).join(" · ") || null,
        status: h.project.status === "completed" ? "completed" : "in_progress",
        closedAt: h.decidedAt || h.updatedAt,
      })),
  );
}
