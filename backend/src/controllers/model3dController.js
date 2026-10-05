import mongoose from "mongoose";
import Model3D from "../models/Model3D.js";
import Message from "../models/Message.js";
import Hire from "../models/Hire.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { avatarPath } from "../services/avatar.js";
import { notify } from "../services/notificationService.js";
import { PROVIDERS, ProviderError, availability, providerFor } from "../services/model3dProviders.js";
import { deleteModel, fail, finish, openFile } from "../services/model3dStore.js";

/**
 * Estúdio 3D: o arquiteto gera modelos (objeto por texto/foto, planta → 3D),
 * compartilha com os clientes dele e os dois comentam no mesmo modelo.
 */
const isId = (v) => mongoose.isValidObjectId(v);
const dailyLimit = () => Math.max(1, Number(process.env.MODEL3D_DAILY_LIMIT) || 5);
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function parseImage(dataUri) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUri || ""));
  if (!m) return { error: "Envie uma imagem PNG, JPG ou WebP." };
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > IMAGE_MAX_BYTES) return { error: "Imagem grande demais (máximo 8 MB)." };
  if (buffer.length < 2048) return { error: "Imagem pequena demais." };
  return { image: { buffer, mime: m[1] } };
}

const person = (u) => (u && u._id ? { id: String(u._id), name: u.name, avatar: avatarPath(u), role: u.role } : null);

function shape(m, me) {
  const isOwner = String(m.owner?._id || m.owner) === String(me);
  return {
    id: String(m._id),
    title: m.title,
    kind: m.kind,
    source: m.source,
    prompt: m.prompt || "",
    provider: m.provider,
    status: m.status,
    progress: m.progress || 0,
    error: m.error || "",
    hasFile: !!m.file,
    fileSize: m.fileSize || 0,
    hasPreview: !!m.preview,
    createdAt: m.createdAt,
    completedAt: m.completedAt || null,
    isOwner,
    owner: person(m.owner),
    project: m.project?._id ? { id: String(m.project._id), name: m.project.name } : null,
    sharedWith: isOwner ? (m.sharedWith || []).map(person).filter(Boolean) : [],
    comments: (m.comments || []).map((c) => ({ id: String(c._id), text: c.text, createdAt: c.createdAt, author: person(c.author) })),
  };
}

const POPULATE = [
  { path: "owner", select: "name role avatarVersion" },
  { path: "sharedWith", select: "name role avatarVersion" },
  { path: "comments.author", select: "name role avatarVersion" },
  { path: "project", select: "name" },
];

/** Dono ou cliente com quem foi compartilhado. */
async function findVisible(id, userId) {
  if (!isId(id)) return null;
  return Model3D.findOne({ _id: id, $or: [{ owner: userId }, { sharedWith: userId }] }).populate(POPULATE);
}

/** Clientes com quem o arquiteto já conversou ou que pediram contratação a ele. */
async function clientIdsOf(architectId) {
  const [msgs, hires] = await Promise.all([
    Message.aggregate([
      { $match: { $or: [{ from: architectId }, { to: architectId }] } },
      { $project: { other: { $cond: [{ $eq: ["$from", architectId] }, "$to", "$from"] } } },
      { $group: { _id: "$other" } },
    ]),
    Hire.distinct("client", { architect: architectId }),
  ]);
  return [...new Set([...msgs.map((m) => String(m._id)), ...hires.map(String)])];
}

export async function status(req, res) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const usedToday = req.user.role === "architect" ? await Model3D.countDocuments({ owner: req.user.id, createdAt: { $gte: since } }) : 0;
  const avail = availability();
  res.json({
    object: !!avail.object,
    floorplan: !!avail.floorplan,
    demo: avail.object === "demo" || avail.floorplan === "demo",
    dailyLimit: dailyLimit(),
    usedToday,
  });
}

export async function create(req, res) {
  const kind = req.body?.kind === "floorplan" ? "floorplan" : "object";
  const source = kind === "floorplan" ? "image" : req.body?.source === "image" ? "image" : "text";
  const title = String(req.body?.title || "").trim().slice(0, 80);
  const prompt = String(req.body?.prompt || "").trim().slice(0, 1000);
  if (!title) return res.status(400).json({ error: "Dê um nome ao modelo." });
  if (source === "text" && prompt.length < 8) return res.status(400).json({ error: "Descreva o objeto com um pouco mais de detalhe (forma, material, estilo)." });

  const provider = providerFor(kind);
  if (!provider) {
    return res.status(503).json({ error: "A geração de 3D está indisponível no momento. Ela será liberada quando a match.IA crescer e virar uma startup de verdade." });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await Model3D.countDocuments({ owner: req.user.id, createdAt: { $gte: since } });
  if (used >= dailyLimit()) return res.status(429).json({ error: `Você chegou ao limite de ${dailyLimit()} modelos em 24 horas. Tente de novo mais tarde.` });

  let image;
  if (source === "image") {
    const parsed = parseImage(req.body?.image);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    image = parsed.image;
  }

  let project;
  if (req.body?.projectId) {
    if (!isId(req.body.projectId)) return res.status(400).json({ error: "Projeto inválido." });
    project = await Project.findOne({ _id: req.body.projectId, architect: req.user.id }).select("_id");
  }

  const model = await Model3D.create({ owner: req.user.id, title, kind, source, prompt: source === "text" ? prompt : prompt || undefined, provider, project: project?._id, status: "queued" });
  try {
    const started = await PROVIDERS[provider].create({ kind, source, prompt, image });
    model.providerTaskId = started.taskId;
    model.status = "running";
    model.progress = 3;
    await model.save();
    if (started.done) finish(model, started.done).catch((err) => fail(model, err.message));
  } catch (err) {
    await fail(model, err instanceof ProviderError ? err.message : "O serviço de 3D não respondeu. Tente de novo em instantes.");
    const fresh = await Model3D.findById(model._id).populate(POPULATE);
    return res.status(502).json({ error: fresh.error, model: shape(fresh, req.user.id) });
  }
  res.status(201).json(shape(await Model3D.findById(model._id).populate(POPULATE), req.user.id));
}

export async function list(req, res) {
  const q = req.user.role === "architect" ? { owner: req.user.id } : { sharedWith: req.user.id };
  const models = await Model3D.find(q).sort("-createdAt").limit(60).populate(POPULATE);
  res.json(models.map((m) => shape(m, req.user.id)));
}

export async function getOne(req, res) {
  const m = await findVisible(req.params.id, req.user.id);
  if (!m) return res.status(404).json({ error: "Modelo não encontrado." });
  res.json(shape(m, req.user.id));
}

async function streamFile(req, res, field, type) {
  const m = await findVisible(req.params.id, req.user.id);
  if (!m || !m[field]) return res.status(404).json({ error: "Arquivo não encontrado." });
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "private, no-store"); // protegido: não fica no cache do navegador depois do logout
  if (req.query.download === "1" && field === "file") {
    const safe = m.title.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "modelo";
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.glb"`);
  }
  openFile(m[field]).on("error", () => res.destroy()).pipe(res);
}
export const file = (req, res) => streamFile(req, res, "file", "model/gltf-binary");
export const preview = (req, res) => streamFile(req, res, "preview", "image/png");

export async function rename(req, res) {
  const title = String(req.body?.title || "").trim().slice(0, 80);
  if (!title) return res.status(400).json({ error: "Dê um nome ao modelo." });
  const m = await Model3D.findOneAndUpdate({ _id: req.params.id, owner: req.user.id }, { title }, { new: true }).populate(POPULATE);
  if (!m) return res.status(404).json({ error: "Modelo não encontrado." });
  res.json(shape(m, req.user.id));
}

export async function remove(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Modelo não encontrado." });
  const m = await Model3D.findOne({ _id: req.params.id, owner: req.user.id });
  if (!m) return res.status(404).json({ error: "Modelo não encontrado." });
  await deleteModel(m);
  res.json({ ok: true });
}

export async function shareCandidates(req, res) {
  const ids = await clientIdsOf(new mongoose.Types.ObjectId(String(req.user.id)));
  const clients = await User.find({ _id: { $in: ids }, role: "client", status: { $ne: "suspended" } }).select("name role avatarVersion").sort("name");
  res.json(clients.map(person));
}

export async function share(req, res) {
  const clientId = String(req.body?.clientId || "");
  if (!isId(clientId)) return res.status(400).json({ error: "Escolha um cliente." });
  const m = await Model3D.findOne({ _id: req.params.id, owner: req.user.id });
  if (!m) return res.status(404).json({ error: "Modelo não encontrado." });
  const allowed = await clientIdsOf(new mongoose.Types.ObjectId(String(req.user.id)));
  if (!allowed.includes(clientId)) return res.status(403).json({ error: "Você só pode compartilhar com clientes com quem já conversou ou que pediram contratação." });
  if (!m.sharedWith.map(String).includes(clientId)) {
    m.sharedWith.push(clientId);
    await m.save();
    const link = `modelo-3d.html?id=${m._id}`;
    await Message.create({ from: req.user.id, to: clientId, text: `Compartilhei um modelo 3D com você: "${m.title}". Abra em Painel → Modelos 3D para girar, ver de perto e comentar.` });
    notify(clientId, "message", `${req.user.name} compartilhou um modelo 3D com você`, link);
  }
  res.json(shape(await Model3D.findById(m._id).populate(POPULATE), req.user.id));
}

export async function unshare(req, res) {
  const m = await Model3D.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.id },
    { $pull: { sharedWith: req.params.clientId } },
    { new: true },
  ).populate(POPULATE);
  if (!m) return res.status(404).json({ error: "Modelo não encontrado." });
  res.json(shape(m, req.user.id));
}

export async function comment(req, res) {
  const text = String(req.body?.text || "").trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: "Escreva um comentário." });
  const m = await findVisible(req.params.id, req.user.id);
  if (!m) return res.status(404).json({ error: "Modelo não encontrado." });
  if (m.comments.length >= 300) return res.status(409).json({ error: "Este modelo já tem comentários demais." });
  await Model3D.updateOne({ _id: m._id }, { $push: { comments: { author: req.user.id, text } } });
  // avisa os outros participantes (dono + clientes compartilhados), menos quem comentou
  const others = [String(m.owner._id), ...m.sharedWith.map((u) => String(u._id))].filter((id) => id !== String(req.user.id));
  others.forEach((id) => notify(id, "message", `${req.user.name} comentou no modelo 3D "${m.title}"`, `modelo-3d.html?id=${m._id}`));
  res.status(201).json(shape(await Model3D.findById(m._id).populate(POPULATE), req.user.id));
}
