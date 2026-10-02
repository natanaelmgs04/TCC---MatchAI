import mongoose from "mongoose";
import ArchitectAssistantChat from "../models/ArchitectAssistantChat.js";
import AssistantChat from "../models/AssistantChat.js";
import Project from "../models/Project.js";
import { chatAboutProjectForArchitect } from "../services/geminiService.js";
import { MAX_TEXT, MAX_MESSAGES_PER_CHAT, buildHistory } from "../services/assistantService.js";

const UNAVAILABLE = "O assistente não conseguiu responder agora. Tente de novo em instantes.";

async function loadProject(req, res) {
  if (!mongoose.isValidObjectId(req.params.projectId)) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return null;
  }
  const project = await Project.findOne({ _id: req.params.projectId, architect: req.user.id }).populate("client", "name city state");
  if (!project) res.status(404).json({ error: "Projeto não encontrado" });
  return project;
}

async function getOrCreateChat(req, project) {
  return (
    (await ArchitectAssistantChat.findOne({ architect: req.user.id, project: project.id })) ||
    (await ArchitectAssistantChat.create({ architect: req.user.id, project: project.id }))
  );
}

function publicChat(chat) {
  return {
    messages: chat.messages.map((m) => ({ role: m.role, text: m.text, createdAt: m.createdAt })),
  };
}

export async function getChat(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;
  const chat = await ArchitectAssistantChat.findOne({ architect: req.user.id, project: project.id });
  if (!chat) return res.json({ messages: [] });
  res.json(publicChat(chat));
}

export async function postMessage(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Escreva uma mensagem." });
  if (text.length > MAX_TEXT) return res.status(400).json({ error: `Mensagem longa demais (máximo ${MAX_TEXT} caracteres).` });

  const chat = await getOrCreateChat(req, project);
  if (chat.messages.length >= MAX_MESSAGES_PER_CHAT)
    return res.status(400).json({ error: "Esta conversa ficou longa. Reinicie a conversa para continuar." });

  const clientChat = await AssistantChat.findOne({ client: project.client?._id, project: project.id });

  let reply;
  try {
    reply = await chatAboutProjectForArchitect({
      project,
      client: project.client,
      clientBriefing: clientChat?.briefing || null,
      history: buildHistory(chat.messages),
      text,
    });
  } catch (err) {
    console.error("Assistente do arquiteto indisponível:", err.message);
    return res.status(503).json({ error: UNAVAILABLE });
  }

  chat.messages.push({ role: "user", text });
  chat.messages.push({ role: "model", text: reply });
  await chat.save();
  res.json({ reply });
}

export async function resetChat(req, res) {
  const project = await loadProject(req, res);
  if (!project) return;
  await ArchitectAssistantChat.deleteOne({ architect: req.user.id, project: project.id });
  res.json({ ok: true });
}
