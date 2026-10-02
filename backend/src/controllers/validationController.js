import Validation from "../models/Validation.js";
import User from "../models/User.js";
import Commission from "../models/Commission.js";
import MatchHistory from "../models/MatchHistory.js";
import Project from "../models/Project.js";
import { validationClosedEmail } from "../services/emailService.js";
import { notify } from "../services/notificationService.js";

const COMMISSION_RATE = 0.08;
const FALLBACK_PROJECT_VALUE = 20000;

const midOf = (range) => {
  if (!range) return null;
  if (range.min != null && range.max != null) return (range.min + range.max) / 2;
  return range.min ?? range.max ?? null;
};

/** Cria a comissão (idempotente por validation) e soma +1 no contador de
 * projetos fechados do arquiteto, que alimenta o bônus de mérito no
 * ranking (ver architectController.listArchitects). Valor estimado é
 * melhor esforço: orçamento do projeto mais recente entre o par (via
 * histórico de match), depois a faixa de preço do arquiteto, senão um
 * valor fixo de referência -- nunca bloqueia a criação da comissão. */
async function createCommissionForClosedValidation(validation) {
  const [client, architect] = await Promise.all([
    User.findById(validation.client),
    User.findById(validation.architect),
  ]);
  if (!client || !architect) return null;

  const history = await MatchHistory.findOne({ client: client._id, project: { $ne: null }, "results.architect": architect._id })
    .sort("-createdAt")
    .populate("project", "budget");
  const estimatedValue = midOf(history?.project?.budget) ?? midOf(architect.architectProfile?.priceRange) ?? FALLBACK_PROJECT_VALUE;
  const amount = Math.round(estimatedValue * COMMISSION_RATE);

  const commission = await Commission.findOneAndUpdate(
    { validation: validation._id },
    { $setOnInsert: { architect: architect.id, client: client.id, project: history?.project?._id, validation: validation._id, rate: COMMISSION_RATE, estimatedValue, amount } },
    { upsert: true, new: true },
  );

  // Marca o projeto como "contratado" por este arquiteto, pra alimentar a
  // aba "Seus projetos" e o assistente de IA do lado do arquiteto.
  if (history?.project?._id) {
    await Project.findByIdAndUpdate(history.project._id, { architect: architect.id, status: "in_progress" });
  }

  await User.updateOne({ _id: architect.id }, { $inc: { "architectProfile.closedProjectsCount": 1 } });
  notify(architect.id, "commission", `Projeto fechado com ${client.name} pela plataforma — comissão simulada de R$${amount}`, "dashboard.html");
  return commission;
}

const pairFor = (req) => {
  const otherId = req.params.otherId;
  return req.user.role === "client"
    ? { client: req.user.id, architect: otherId }
    : { client: otherId, architect: req.user.id };
};

export async function getValidation(req, res) {
  const pair = pairFor(req);
  const validation = await Validation.findOne(pair);
  res.json({
    clientConfirmed: validation?.clientConfirmed || false,
    architectConfirmed: validation?.architectConfirmed || false,
  });
}

export async function confirmValidation(req, res) {
  const pair = pairFor(req);
  const field = req.user.role === "client" ? "clientConfirmed" : "architectConfirmed";
  const before = await Validation.findOne(pair);
  const wasFullyConfirmed = Boolean(before?.clientConfirmed && before?.architectConfirmed);

  const validation = await Validation.findOneAndUpdate(
    pair,
    { $set: { [field]: true }, $setOnInsert: pair },
    { upsert: true, new: true },
  );

  res.json({
    clientConfirmed: validation.clientConfirmed,
    architectConfirmed: validation.architectConfirmed,
  });

  const nowFullyConfirmed = validation.clientConfirmed && validation.architectConfirmed;
  if (nowFullyConfirmed && !wasFullyConfirmed) {
    const [client, architect] = await Promise.all([
      User.findById(validation.client),
      User.findById(validation.architect),
    ]);
    if (client && architect) {
      validationClosedEmail(client, architect).catch(() => {});
      validationClosedEmail(architect, client).catch(() => {});
      notify(client.id, "validation", `Resumo do projeto confirmado com ${architect.name}`, `arquiteto.html?id=${architect.id}`);
      notify(architect.id, "validation", `Resumo do projeto confirmado com ${client.name}`, `dashboard.html`);
    }
    createCommissionForClosedValidation(validation).catch((err) => console.error("Falha ao criar comissão:", err.message));
  }
}

export async function listPendingForArchitect(req, res) {
  const pending = await Validation.find({
    architect: req.user.id,
    clientConfirmed: true,
    architectConfirmed: false,
  }).populate("client", "name");
  res.json(pending.map((v) => ({ client: { id: v.client.id, name: v.client.name } })));
}

// Pares onde os dois lados já confirmaram o resumo — pré-requisito pro
// arquiteto propor um case de sucesso (ver caseStudyController.requireValidated).
export async function listConfirmedForArchitect(req, res) {
  const confirmed = await Validation.find({
    architect: req.user.id,
    clientConfirmed: true,
    architectConfirmed: true,
  }).populate("client", "name");
  res.json(confirmed.map((v) => ({ client: { id: v.client.id, name: v.client.name } })));
}
