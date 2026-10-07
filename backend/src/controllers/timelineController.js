import Timeline from "../models/Timeline.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import { notify } from "../services/notificationService.js";

const pairFor = (req) => {
  const otherId = req.params.otherId;
  return req.user.role === "client"
    ? { client: req.user.id, architect: otherId }
    : { client: otherId, architect: req.user.id };
};

// Depois da contratação, quem guia o projeto são as etapas do Espaço do
// projeto (projeto.html) — a linha do tempo da conversa passa a levar até lá.
async function workspaceFor(pair) {
  const p = await Project.findOne({ client: pair.client, architect: pair.architect }).sort("-updatedAt").select("_id name");
  return p ? { id: String(p._id), name: p.name } : null;
}

export async function getTimeline(req, res) {
  const pair = pairFor(req);
  const [timeline, workspace] = await Promise.all([Timeline.findOne(pair), workspaceFor(pair)]);
  res.json({ phase: timeline?.phase || 0, phases: Timeline.PHASES, workspace });
}

export async function advanceTimeline(req, res) {
  const pair = pairFor(req);
  const workspace = await workspaceFor(pair);
  if (workspace) return res.status(409).json({ error: "Este projeto já foi contratado: as etapas agora ficam no Espaço do projeto.", workspace });
  const existing = await Timeline.findOne(pair);
  const nextPhase = Math.min((existing?.phase || 0) + 1, Timeline.PHASES.length - 1);

  const timeline = await Timeline.findOneAndUpdate(
    pair,
    {
      $set: { phase: nextPhase },
      $push: { history: { phase: nextPhase, changedBy: req.user.id } },
      $setOnInsert: pair,
    },
    { upsert: true, new: true },
  );

  res.json({ phase: timeline.phase, phases: Timeline.PHASES });

  const otherId = req.user.role === "client" ? pair.architect : pair.client;
  const other = await User.findById(otherId);
  if (other) {
    notify(
      otherId,
      "timeline",
      `${req.user.name} avançou o projeto para a etapa "${Timeline.PHASES[nextPhase]}"`,
      "dashboard.html",
    );
  }
}
