import mongoose from "mongoose";
import AssistantChat from "../models/AssistantChat.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import StoreProduct from "../models/StoreProduct.js";
import { chatAboutProject, generateConversationBriefing } from "../services/geminiService.js";
import { newMessageEmail } from "../services/emailService.js";
import { notify } from "../services/notificationService.js";
import {
  MAX_TEXT,
  MAX_PHOTOS_PER_CHAT,
  MAX_MESSAGES_PER_CHAT,
  MIN_USER_MESSAGES_FOR_BRIEFING,
  sanitizeImages,
  buildHistory,
  findMentionedProducts,
  normalizeBriefing,
  briefingToMessage,
} from "../services/assistantService.js";

const UNAVAILABLE = "O assistente não conseguiu responder agora. Tente de novo em instantes.";

async function loadProject(req, res) {
  if (!mongoose.isValidObjectId(req.params.projectId)) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return null;
  }
  const project = await Project.findOne({ _id: req.params.projectId, client: req.user.id });
  if (!project) res.status(404).json({ error: "Projeto não encontrado" });
  return project;
}

async function getOrCreateChat(req, project) {
  return (
    (await AssistantChat.findOne({ client: req.user.id, project: project.id })) ||
    (await AssistantChat.create({ client: req.user.id, project: project.id }))
  );
}

// Catálogo que a IA pode citar: produtos das lojas parceiras que cruzam com
// estilo/materiais do projeto (ou, sem cruzamento, os mais recentes).
async function catalogFor(project) {
  const products = await StoreProduct.find().sort("-createdAt").limit(60).populate("store", "name storeProfile.storeName");
  const terms = [...(project.preferredStyles || []), ...(project.preferredMaterials || [])].map((t) => String(t).toLowerCase());
  const shaped = products.map((p) => ({
    id: p.id,
    name: p.name,
    photo: p.photo,
    category: p.category,
    price: p.price,
    purchaseUrl: p.purchaseUrl,
    storeName: p.store?.storeProfile?.storeName || p.store?.name,
    score: terms.reduce(
      (sum, t) => sum + ([p.category, ...(p.styles || [])].filter(Boolean).some((x) => String(x).toLowerCase().includes(t) || t.includes(String(x).toLowerCase())) ? 1 : 0),
      0,
    ),
  }));
  return shaped.sort((a, b) => b.score - a.score).slice(0, 8);
}

function publicChat(chat, architectNames = new Map()) {
  return {
    messages: chat.messages.map((m) => ({
      role: m.role,
      text: m.text,
      thumbs: m.thumbs,
      products: m.products,
      createdAt: m.createdAt,
    })),
    photoCount: chat.photoCount,
    briefing: chat.briefing || null,
    briefingAt: chat.briefingAt || null,
    sentTo: chat.sentTo.map((s) => ({ architectId: String(s.architect), name: architectNames.get(String(s.architect)) || "Arquiteto", at: s.at })),
  };
}

async function namesFor(chat) {
  const ids = chat.sentTo.map((s) => s.architect);
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } }).select("name");
  return new Map(users.map((u) => [String(u.id), u.name]));
}

export async function getChat(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;
  const chat = await AssistantChat.findOne({ client: req.user.id, project: project.id });
  if (!chat) return res.json({ messages: [], photoCount: 0, briefing: null, briefingAt: null, sentTo: [] });
  res.json(publicChat(chat, await namesFor(chat)));
}

export async function postMessage(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (text.length > MAX_TEXT) return res.status(400).json({ error: `Mensagem longa demais (máximo ${MAX_TEXT} caracteres).` });
  const { images, error } = sanitizeImages(req.body?.images);
  if (error) return res.status(400).json({ error });
  if (!text && !images.length) return res.status(400).json({ error: "Escreva uma mensagem ou envie uma foto." });

  const chat = await getOrCreateChat(req, project);
  if (chat.messages.length >= MAX_MESSAGES_PER_CHAT)
    return res.status(400).json({ error: "Esta conversa ficou longa. Gere o briefing ou reinicie a conversa para continuar." });
  if (chat.photoCount + images.length > MAX_PHOTOS_PER_CHAT)
    return res.status(400).json({ error: `Limite de ${MAX_PHOTOS_PER_CHAT} fotos por conversa atingido.` });

  const catalog = await catalogFor(project);
  let reply;
  try {
    reply = await chatAboutProject({
      project,
      client: req.user,
      catalog,
      history: buildHistory(chat.messages),
      text,
      images,
    });
  } catch (err) {
    console.error("Assistente indisponível:", err.message);
    return res.status(503).json({ error: UNAVAILABLE });
  }

  const mentioned = findMentionedProducts(reply, catalog).map((p) => ({
    id: p.id,
    name: p.name,
    photo: p.photo,
    price: p.price,
    storeName: p.storeName,
    purchaseUrl: p.purchaseUrl,
  }));
  chat.messages.push({ role: "user", text, thumbs: images.map((i) => i.thumb).filter(Boolean) });
  chat.messages.push({ role: "model", text: reply, products: mentioned });
  chat.photoCount += images.length;
  await chat.save();
  res.json({ reply, products: mentioned });
}

export async function postBriefing(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;
  const chat = await AssistantChat.findOne({ client: req.user.id, project: project.id });
  const userTurns = chat?.messages.filter((m) => m.role === "user").length || 0;
  if (userTurns < MIN_USER_MESSAGES_FOR_BRIEFING)
    return res.status(400).json({ error: "Converse um pouco mais com o assistente antes de gerar o briefing." });

  const transcript = chat.messages
    .map((m) => `${m.role === "user" ? "Cliente" : "Assistente"}: ${m.text || (m.thumbs?.length ? "(enviou fotos)" : "")}`)
    .join("\n")
    .slice(-12000);
  try {
    const raw = await generateConversationBriefing({ project, client: req.user, transcript, photoCount: chat.photoCount });
    chat.briefing = normalizeBriefing(raw);
    chat.briefingAt = new Date();
    await chat.save();
    res.json({ briefing: chat.briefing, briefingAt: chat.briefingAt });
  } catch (err) {
    console.error("Briefing indisponível:", err.message);
    res.status(503).json({ error: "Não foi possível gerar o briefing agora. Tente de novo em instantes." });
  }
}

export async function postSend(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;
  const chat = await AssistantChat.findOne({ client: req.user.id, project: project.id });
  if (!chat?.briefing) return res.status(400).json({ error: "Gere o briefing antes de enviar." });

  const ids = [...new Set((Array.isArray(req.body?.architectIds) ? req.body.architectIds : []).map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return res.status(400).json({ error: "Escolha pelo menos um arquiteto." });
  if (ids.length > 5) return res.status(400).json({ error: "Envie para no máximo 5 arquitetos por vez." });

  const architects = await User.find({ _id: { $in: ids }, role: "architect" });
  if (architects.length !== ids.length) return res.status(404).json({ error: "Arquiteto não encontrado" });

  const already = new Set(chat.sentTo.map((s) => String(s.architect)));
  const text = briefingToMessage(chat.briefing, { clientName: req.user.name, projectName: project.name });
  const sent = [];
  const skipped = [];
  for (const architect of architects) {
    if (already.has(architect.id)) {
      skipped.push({ architectId: architect.id, name: architect.name });
      continue;
    }
    await Message.create({ from: req.user.id, to: architect.id, text });
    chat.sentTo.push({ architect: architect.id });
    sent.push({ architectId: architect.id, name: architect.name });
    newMessageEmail(architect, req.user.name, text).catch(() => {});
    notify(architect.id, "message", `Novo briefing de ${req.user.name}`, "dashboard.html");
  }
  await chat.save();
  if (sent.length && project.status === "draft") {
    project.status = "matching";
    await project.save();
  }
  res.json({ sent, skipped });
}

export async function resetChat(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;
  await AssistantChat.deleteOne({ client: req.user.id, project: project.id });
  res.json({ ok: true });
}
