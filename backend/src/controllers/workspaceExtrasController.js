import mongoose from "mongoose";
import Project from "../models/Project.js";
import ProjectFile from "../models/ProjectFile.js";
import StoreProduct from "../models/StoreProduct.js";
import User from "../models/User.js";
import { notify } from "../services/notificationService.js";
import { workspaceEmail } from "../services/emailService.js";
import { deleteProjectFile } from "../services/projectFileStore.js";
import { CREW_STATUS, normalizeCrewInput, normalizeDiaryEntry, normalizeQuote, normalizeRating } from "../services/workspaceRules.js";
import { alertOther, blockedByPlan, load, log, respond } from "./workspaceController.js";

/**
 * Partes do Espaço do projeto ligadas à obra e ao escritório: equipe do
 * escritório (colegas convidados), diário de obra, cotações dos itens da
 * lista de compras e a equipe de obra (prestadores parceiros).
 */
const isId = (v) => mongoose.isValidObjectId(v);
const TEAM_LIMIT = 5;
const CREW_LIMIT = 20;
const QUOTE_LIMIT = 6;
const DIARY_LIMIT = 300;
const link = (p) => `projeto.html?id=${p._id}`;

// ---------------------------------------------------------------- equipe do escritório
export async function addTeamMember(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (!ctx.isOwner) return res.status(403).json({ error: "Só o arquiteto responsável convida a equipe." });
  if (blockedByPlan(ctx, res)) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Informe o e-mail do colega." });
  const member = await User.findOne({ email, role: "architect", status: { $ne: "suspended" } }).select("name email role");
  if (!member) return res.status(404).json({ error: "Não achamos uma conta de arquiteto com esse e-mail. Peça para o colega criar a conta (cadastro de arquiteto) e tente de novo." });
  if (String(member._id) === String(ctx.project.architect)) return res.status(400).json({ error: "Você já é o arquiteto do projeto." });
  if (ctx.project.team.some((t) => String(t.user) === String(member._id))) return res.status(409).json({ error: "Essa pessoa já está na equipe." });
  if (ctx.project.team.length >= TEAM_LIMIT) return res.status(409).json({ error: `A equipe tem no máximo ${TEAM_LIMIT} pessoas.` });
  ctx.project.team.push({ user: member._id });
  log(ctx.project, req.user.id, "team", `adicionou ${member.name} à equipe do escritório`);
  await ctx.project.save();
  notify(member._id, "timeline", `${req.user.name} adicionou você à equipe do projeto "${ctx.project.name}"`, link(ctx.project));
  workspaceEmail(member, {
    subject: `Você entrou na equipe do projeto "${ctx.project.name}" — match.IA`,
    lines: [`${req.user.name} adicionou você à equipe do escritório no projeto "${ctx.project.name}". No Espaço do projeto você vê as etapas, envia arquivos, comenta as plantas e acompanha a obra.`],
    projectId: ctx.project._id,
  }).catch(() => {});
  await respond(res, ctx, req);
}

export async function removeTeamMember(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const target = String(req.params.userId);
  const self = target === String(req.user.id);
  if (!ctx.isOwner && !self) return res.status(403).json({ error: "Só o arquiteto responsável tira alguém da equipe." });
  const before = ctx.project.team.length;
  ctx.project.team = ctx.project.team.filter((t) => String(t.user) !== target);
  if (ctx.project.team.length === before) return res.status(404).json({ error: "Essa pessoa não está na equipe." });
  log(ctx.project, req.user.id, "team", self ? "saiu da equipe do escritório" : "tirou uma pessoa da equipe do escritório");
  await ctx.project.save();
  if (self) return res.json({ left: true });
  await respond(res, ctx, req);
}

// ---------------------------------------------------------------- diário de obra
export async function addDiaryEntry(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (blockedByPlan(ctx, res)) return;
  const r = normalizeDiaryEntry(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  if (ctx.project.diary.length >= DIARY_LIMIT) return res.status(409).json({ error: "O diário deste projeto chegou ao limite de registros." });
  const ids = (Array.isArray(req.body?.files) ? req.body.files : []).filter(isId).slice(0, 6);
  const files = ids.length ? await ProjectFile.find({ _id: { $in: ids }, project: ctx.project._id, kind: "diary", uploader: req.user.id }).select("_id") : [];
  ctx.project.diary.push({ author: req.user._id, date: r.entry.date, text: r.entry.text, files: files.map((f) => f._id) });
  log(ctx.project, req.user.id, "diary", `registrou no diário de obra (${r.entry.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })})${files.length ? ` com ${files.length} foto${files.length > 1 ? "s" : ""}` : ""}`);
  await ctx.project.save();
  notify(ctx.otherId, "timeline", `${req.user.name} registrou um dia de obra em "${ctx.project.name}"`, `${link(ctx.project)}#obra`);
  await respond(res, ctx, req);
}

export async function removeDiaryEntry(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  const entry = ctx.project.diary.id(req.params.entryId);
  if (!entry) return res.status(404).json({ error: "Registro não encontrado." });
  if (String(entry.author) !== String(req.user.id)) return res.status(403).json({ error: "Só quem escreveu apaga o registro." });
  for (const f of await ProjectFile.find({ _id: { $in: entry.files }, project: ctx.project._id }).select("_id file")) await deleteProjectFile(f);
  entry.deleteOne();
  await ctx.project.save();
  await respond(res, ctx, req);
}

// ---------------------------------------------------------------- cotações
async function loadItem(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return {};
  const item = ctx.project.library.id(req.params.itemId);
  if (!item) { res.status(404).json({ error: "Item não encontrado." }); return {}; }
  return { ctx, item };
}

export async function addQuote(req, res) {
  const { ctx, item } = await loadItem(req, res);
  if (!ctx) return;
  if (blockedByPlan(ctx, res)) return;
  if ((item.quotes || []).length >= QUOTE_LIMIT) return res.status(409).json({ error: `Até ${QUOTE_LIMIT} cotações por item.` });
  let quote;
  if (req.body?.productId) {
    if (!isId(req.body.productId)) return res.status(400).json({ error: "Produto inválido." });
    const p = await StoreProduct.findById(req.body.productId).populate("store", "name status storeProfile.storeName");
    if (!p || !p.store || p.store.status === "suspended" || p.price == null) return res.status(404).json({ error: "Produto não encontrado ou sem preço." });
    quote = { storeName: p.store.storeProfile?.storeName || p.store.name, price: p.price, purchaseUrl: p.purchaseUrl, product: p._id, store: p.store._id };
  } else {
    const r = normalizeQuote(req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    quote = r.quote;
  }
  item.quotes.push({ ...quote, addedBy: req.user._id });
  log(ctx.project, req.user.id, "quote", `cotou ${item.name} em ${quote.storeName} (R$ ${quote.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

/** Escolher a cotação: ela vira a loja/preço/link do item na lista de compras. */
export async function chooseQuote(req, res) {
  const { ctx, item } = await loadItem(req, res);
  if (!ctx) return;
  if (blockedByPlan(ctx, res)) return;
  const q = item.quotes.id(req.params.quoteId);
  if (!q) return res.status(404).json({ error: "Cotação não encontrada." });
  item.quotes.forEach((x) => { x.chosen = String(x._id) === String(q._id); });
  item.storeName = q.storeName;
  item.price = q.price;
  item.purchaseUrl = q.purchaseUrl || item.purchaseUrl;
  if (q.product) { item.product = q.product; item.store = q.store; item.kind = "product"; }
  log(ctx.project, req.user.id, "quote", `escolheu a cotação de ${q.storeName} para ${item.name}`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function removeQuote(req, res) {
  const { ctx, item } = await loadItem(req, res);
  if (!ctx) return;
  const q = item.quotes.id(req.params.quoteId);
  if (!q) return res.status(404).json({ error: "Cotação não encontrada." });
  if (String(q.addedBy) !== String(req.user.id) && ctx.role !== "architect") return res.status(403).json({ error: "Só quem fez a cotação pode apagá-la." });
  q.deleteOne();
  await ctx.project.save();
  await respond(res, ctx, req);
}

const STOP = new Set(["de", "da", "do", "das", "dos", "com", "para", "em", "e", "a", "o"]);
/** Produtos parecidos no catálogo das lojas parceiras (mesma categoria ou palavras do nome), sem IA. */
export async function quoteSuggestions(req, res) {
  const { ctx, item } = await loadItem(req, res);
  if (!ctx) return;
  const words = String(item.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).slice(0, 4);
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const or = [...words.map((w) => ({ name: new RegExp(esc(w), "i") })), ...(item.category ? [{ category: new RegExp(`^${esc(item.category)}$`, "i") }] : [])];
  if (!or.length) return res.json([]);
  const stores = await User.find({ role: "store", status: { $ne: "suspended" } }).select("_id");
  const already = new Set([String(item.product || ""), ...(item.quotes || []).map((q) => String(q.product || ""))]);
  const products = await StoreProduct.find({ store: { $in: stores.map((s) => s._id) }, price: { $gt: 0 }, $or: or }).limit(30).populate("store", "name storeProfile.storeName");
  res.json(products.filter((p) => !already.has(String(p._id))).slice(0, 8).map((p) => ({
    id: String(p._id), name: p.name, price: p.price, storeName: p.store?.storeProfile?.storeName || p.store?.name || "", purchaseUrl: p.purchaseUrl || "", photo: p.photo || "",
  })));
}

// ---------------------------------------------------------------- equipe de obra (prestadores)
export async function addCrew(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Quem monta a equipe de obra é o arquiteto." });
  if (blockedByPlan(ctx, res)) return;
  if (ctx.project.crew.length >= CREW_LIMIT) return res.status(409).json({ error: `Até ${CREW_LIMIT} prestadores por projeto.` });
  let entry;
  if (req.body?.providerId) {
    if (!isId(req.body.providerId)) return res.status(400).json({ error: "Prestador inválido." });
    const pr = await User.findOne({ _id: req.body.providerId, role: "store", "storeProfile.kind": "service", status: { $ne: "suspended" } }).select("name email storeProfile");
    if (!pr) return res.status(404).json({ error: "Prestador não encontrado." });
    if (ctx.project.crew.some((c) => String(c.provider) === String(pr._id))) return res.status(409).json({ error: "Esse prestador já está na equipe de obra." });
    const trade = (pr.storeProfile.trades || []).includes(req.body.trade) ? req.body.trade : pr.storeProfile.trades?.[0] || "";
    entry = { provider: pr._id, name: pr.storeProfile.storeName || pr.name, trade };
    // LGPD: o prestador fica sabendo do ofício, da cidade e de quem indicou — sem dados do cliente
    notify(pr._id, "store", `${req.user.name} indicou você para ${trade ? trade.toLowerCase() : "um serviço"} em uma obra${ctx.project.city ? ` em ${ctx.project.city}` : ""}`, "dashboard.html");
    workspaceEmail(pr, {
      subject: `Nova indicação de ${req.user.name} — match.IA`,
      lines: [`${req.user.name}, arquiteto(a) da match.IA, indicou você para ${trade || "um serviço"} em uma obra${ctx.project.city ? ` em ${ctx.project.city}${ctx.project.state ? `/${ctx.project.state}` : ""}` : ""}.`, "O arquiteto vai entrar em contato pelo seu cadastro para pedir o orçamento."],
      cta: "Abrir meu painel",
      path: "dashboard.html",
    }).catch(() => {});
  } else {
    const r = normalizeCrewInput(req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    entry = r.entry;
  }
  ctx.project.crew.push(entry);
  log(ctx.project, req.user.id, "crew", `adicionou ${entry.name} (${entry.trade || "prestador"}) à equipe de obra`);
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function updateCrew(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Quem atualiza a equipe de obra é o arquiteto." });
  if (blockedByPlan(ctx, res)) return;
  const c = ctx.project.crew.id(req.params.crewId);
  if (!c) return res.status(404).json({ error: "Prestador não encontrado." });
  if (req.body?.status !== undefined) {
    if (!CREW_STATUS.includes(req.body.status)) return res.status(400).json({ error: "Situação inválida." });
    if (c.status !== req.body.status) log(ctx.project, req.user.id, "crew", `marcou ${c.name} como ${{ cotando: "em cotação", contratado: "contratado", concluido: "serviço concluído" }[req.body.status]}`);
    c.status = req.body.status;
  }
  if (req.body?.quote !== undefined) c.quote = Number(req.body.quote) > 0 ? Math.round(Number(req.body.quote) * 100) / 100 : undefined;
  if (typeof req.body?.note === "string") c.note = req.body.note.trim().slice(0, 300);
  if (req.body?.rating !== undefined) {
    const r = normalizeRating(req.body.rating);
    if (!r) return res.status(400).json({ error: "A nota vai de 1 a 5." });
    if (c.status !== "concluido") return res.status(409).json({ error: "Avalie quando o serviço estiver concluído." });
    c.rating = r;
    c.ratedAt = new Date();
    log(ctx.project, req.user.id, "crew", `avaliou ${c.name} com ${r} de 5`);
  }
  await ctx.project.save();
  await respond(res, ctx, req);
}

export async function removeCrew(req, res) {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.role !== "architect") return res.status(403).json({ error: "Quem monta a equipe de obra é o arquiteto." });
  const c = ctx.project.crew.id(req.params.crewId);
  if (!c) return res.status(404).json({ error: "Prestador não encontrado." });
  c.deleteOne();
  await ctx.project.save();
  await respond(res, ctx, req);
}
