import mongoose from "mongoose";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Message from "../models/Message.js";
import Review from "../models/Review.js";
import MatchHistory from "../models/MatchHistory.js";
import Favorite from "../models/Favorite.js";
import Hire from "../models/Hire.js";
import Commission from "../models/Commission.js";
import StoreReferral from "../models/StoreReferral.js";
import StoreProduct from "../models/StoreProduct.js";
import Notification from "../models/Notification.js";
import AdminLog from "../models/AdminLog.js";
import SiteSetting from "../models/SiteSetting.js";
import { notify } from "../services/notificationService.js";
import { emailStatus, cauVerifiedEmail } from "../services/emailService.js";
import { deleteUserCascade } from "../services/accountDeletion.js";
import { avatarPath } from "../services/avatar.js";
import { adminEmails } from "../middleware/auth.js";
import { clearSiteConfigCache } from "../routes/site.js";
import { countDemoArchitects, createDemoArchitects, removeDemoArchitects } from "../services/demoArchitects.js";

/**
 * Painel da equipe (admin.html). Tudo aqui exige login + e-mail em
 * ADMIN_EMAILS (ver middleware/auth.js) e toda ação que muda algo fica
 * registrada em AdminLog.
 *
 * Privacidade: o painel mostra números e metadados, nunca o texto das
 * mensagens trocadas entre clientes e arquitetos.
 */
const DAY = 24 * 60 * 60 * 1000;
const esc = (s) => String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pageOf = (req, size = 25) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || size));
  return { page, pageSize, skip: (page - 1) * pageSize };
};
const isId = (id) => mongoose.isValidObjectId(id);

function log(req, action, target = {}, details) {
  return AdminLog.create({
    adminEmail: req.user.email,
    action,
    targetType: target.type,
    targetId: target.id ? String(target.id) : undefined,
    targetLabel: target.label,
    details,
  }).catch((err) => console.error("Falha ao registrar auditoria:", err.message));
}

/** Série diária dos últimos N dias (contagem por dia), preenchendo dias vazios. */
async function dailySeries(Model, days, match = {}) {
  const since = new Date(Date.now() - days * DAY);
  since.setHours(0, 0, 0, 0);
  const rows = await Model.aggregate([
    { $match: { ...match, createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "America/Sao_Paulo" } }, n: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + (i + 1) * DAY);
    const key = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return { date: key, value: map.get(key) || 0 };
  });
}

function userRow(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    city: u.city,
    state: u.state,
    status: u.status || "active",
    avatar: avatarPath(u),
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt || null,
    plan: u.role === "architect" ? u.architectProfile?.subscriptionTier || "free" : null,
    cau: u.role === "architect" ? u.architectProfile?.cauVerification?.status || "none" : null,
    storeName: u.role === "store" ? u.storeProfile?.storeName : undefined,
    isDemo: !!u.isDemo,
  };
}

// ---------- perfis ilustrativos (arquitetos de demonstração) ----------
export async function demoStatus(req, res) {
  res.json({ count: await countDemoArchitects() });
}
export async function createDemo(req, res) {
  const result = await createDemoArchitects();
  log(req, "demo.create", { type: "system", label: "Arquitetos de demonstração" }, `${result.created} criados`);
  res.json(result);
}
export async function removeDemo(req, res) {
  const result = await removeDemoArchitects();
  log(req, "demo.remove", { type: "system", label: "Arquitetos de demonstração" }, `${result.removed} removidos`);
  res.json(result);
}

export function me(req, res) {
  res.json({ email: req.user.email, name: req.user.name, avatar: avatarPath(req.user) });
}

// ---------------- Visão geral ----------------
export async function overview(_req, res) {
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY), d30 = new Date(now - 30 * DAY);
  const [
    byRole, newUsers7, newUsers30, active7, suspended, pro, cauPending,
    projects, projectsByStatus, matches, matches7, messages, messages7,
    hiresByStatus, reviewAgg, favorites, commissionAgg, referralAgg, products,
    signups, matchSeries, messageSeries, hireSeries, topStyles, topCities,
  ] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
    User.countDocuments({ createdAt: { $gte: d7 } }),
    User.countDocuments({ createdAt: { $gte: d30 } }),
    User.countDocuments({ lastSeenAt: { $gte: d7 } }),
    User.countDocuments({ status: "suspended" }),
    User.countDocuments({ role: "architect", "architectProfile.subscriptionTier": "pro" }),
    User.countDocuments({ role: "architect", "architectProfile.cauVerification.status": "pending" }),
    Project.countDocuments(),
    Project.aggregate([{ $group: { _id: { $ifNull: ["$status", "draft"] }, n: { $sum: 1 } } }]),
    MatchHistory.countDocuments(),
    MatchHistory.countDocuments({ createdAt: { $gte: d7 } }),
    Message.countDocuments(),
    Message.countDocuments({ createdAt: { $gte: d7 } }),
    Hire.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Review.aggregate([{ $group: { _id: null, n: { $sum: 1 }, avg: { $avg: "$rating" } } }]),
    Favorite.countDocuments(),
    Commission.aggregate([{ $group: { _id: null, n: { $sum: 1 }, total: { $sum: { $ifNull: ["$amount", 0] } } } }]),
    StoreReferral.aggregate([{ $group: { _id: null, n: { $sum: 1 }, total: { $sum: { $ifNull: ["$simulatedAmount", 0] } } } }]),
    StoreProduct.countDocuments(),
    dailySeries(User, 30),
    dailySeries(MatchHistory, 30),
    dailySeries(Message, 30),
    dailySeries(Hire, 30),
    Project.aggregate([{ $unwind: "$preferredStyles" }, { $group: { _id: "$preferredStyles", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
    User.aggregate([{ $match: { city: { $nin: [null, ""] } } }, { $group: { _id: "$city", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
  ]);
  const roles = Object.fromEntries(byRole.map((r) => [r._id, r.n]));
  res.json({
    users: { total: byRole.reduce((s, r) => s + r.n, 0), clients: roles.client || 0, architects: roles.architect || 0, stores: roles.store || 0, new7: newUsers7, new30: newUsers30, active7, suspended },
    architects: { pro, cauPending },
    projects: { total: projects, byStatus: Object.fromEntries(projectsByStatus.map((p) => [p._id, p.n])) },
    matches: { total: matches, last7: matches7 },
    messages: { total: messages, last7: messages7 },
    hires: Object.fromEntries(hiresByStatus.map((h) => [h._id, h.n])),
    reviews: { total: reviewAgg[0]?.n || 0, average: reviewAgg[0] ? Math.round(reviewAgg[0].avg * 10) / 10 : 0 },
    favorites,
    finance: {
      commissions: { count: commissionAgg[0]?.n || 0, total: commissionAgg[0]?.total || 0 },
      referrals: { count: referralAgg[0]?.n || 0, total: referralAgg[0]?.total || 0 },
      products,
    },
    series: { signups, matches: matchSeries, messages: messageSeries, hires: hireSeries },
    topStyles: topStyles.map((s) => ({ label: s._id, value: s.n })),
    topCities: topCities.map((c) => ({ label: c._id, value: c.n })),
  });
}

// ---------------- Usuários ----------------
export async function listUsers(req, res) {
  const { page, pageSize, skip } = pageOf(req);
  const q = {};
  if (["client", "architect", "store"].includes(req.query.role)) q.role = req.query.role;
  if (["active", "suspended"].includes(req.query.status)) q.status = req.query.status === "active" ? { $ne: "suspended" } : "suspended";
  if (req.query.cau === "pending") { q.role = "architect"; q["architectProfile.cauVerification.status"] = "pending"; }
  if (req.query.plan === "pro") { q.role = "architect"; q["architectProfile.subscriptionTier"] = "pro"; }
  if (req.query.q) {
    const rx = new RegExp(esc(String(req.query.q).slice(0, 80)), "i");
    q.$or = [{ name: rx }, { email: rx }, { city: rx }];
  }
  const sort = req.query.sort === "lastSeen" ? { lastSeenAt: -1 } : req.query.sort === "name" ? { name: 1 } : { createdAt: -1 };
  const [users, total] = await Promise.all([
    User.find(q).sort(sort).skip(skip).limit(pageSize).select("-architectProfile.portfolio -architectProfile.referenceImage"),
    User.countDocuments(q),
  ]);
  res.json({ users: users.map(userRow), total, page, pageSize });
}

export async function getUser(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Usuário não encontrado" });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
  const id = u._id;
  const [projects, matches, sent, received, favorites, reviewsGiven, reviewsReceived, hiresAsClient, hiresAsArchitect, products, referredCount] = await Promise.all([
    Project.countDocuments({ client: id }),
    MatchHistory.countDocuments({ client: id }),
    Message.countDocuments({ from: id }),
    Message.countDocuments({ to: id }),
    Favorite.countDocuments({ client: id }),
    Review.countDocuments({ client: id }),
    Review.aggregate([{ $match: { architect: id } }, { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: "$rating" } } }]),
    Hire.countDocuments({ client: id }),
    Hire.aggregate([{ $match: { architect: id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    StoreProduct.countDocuments({ store: id }),
    User.countDocuments({ referredBy: id }),
  ]);
  const recentProjects = u.role === "client"
    ? await Project.find({ client: id }).sort("-createdAt").limit(5).select("name status propertyType areaM2 city state createdAt")
    : [];
  res.json({
    ...userRow(u),
    phone: u.phone,
    bio: u.bio || u.architectProfile?.bio || "",
    suspendedReason: u.suspendedReason || "",
    referredBy: u.referredBy || null,
    clientProfile: u.role === "client" ? { budget: u.clientProfile?.budget, preferredStyles: u.clientProfile?.preferredStyles, bonusMatches: u.clientProfile?.bonusMatches || 0 } : undefined,
    architectProfile: u.role === "architect" ? {
      styles: u.architectProfile?.styles, yearsExperience: u.architectProfile?.yearsExperience,
      availability: u.architectProfile?.availability, cauNumber: u.architectProfile?.cauVerification?.number || "",
      portfolioCount: (u.architectProfile?.portfolio || []).length, bonusPortfolioSlots: u.architectProfile?.bonusPortfolioSlots || 0,
      closedProjectsCount: u.architectProfile?.closedProjectsCount || 0, proSince: u.architectProfile?.proSince || null,
      website: u.architectProfile?.website, instagram: u.architectProfile?.instagram,
    } : undefined,
    counts: {
      projects, matches, messagesSent: sent, messagesReceived: received, favorites, reviewsGiven,
      reviewsReceived: reviewsReceived[0]?.n || 0, ratingAverage: reviewsReceived[0] ? Math.round(reviewsReceived[0].avg * 10) / 10 : null,
      hiresAsClient, hiresAsArchitect: Object.fromEntries(hiresAsArchitect.map((h) => [h._id, h.n])), products, referred: referredCount,
    },
    recentProjects,
  });
}

/** Ações da equipe sobre uma conta (uma por chamada, todas auditadas). */
export async function updateUser(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Usuário não encontrado" });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
  const b = req.body || {};
  const target = { type: "user", id: u.id, label: `${u.name} <${u.email}>` };
  const done = [];

  if (b.status !== undefined) {
    if (!["active", "suspended"].includes(b.status)) return res.status(400).json({ error: "Status inválido." });
    if (b.status === "suspended" && adminEmails().includes(u.email)) return res.status(400).json({ error: "Não é possível suspender alguém da equipe." });
    u.status = b.status;
    u.suspendedReason = b.status === "suspended" ? String(b.reason || "").slice(0, 300) : undefined;
    done.push(b.status === "suspended" ? "suspend" : "reactivate");
  }
  if (b.plan !== undefined) {
    if (u.role !== "architect" || !["free", "pro"].includes(b.plan)) return res.status(400).json({ error: "Plano inválido para esta conta." });
    u.architectProfile.subscriptionTier = b.plan;
    if (b.plan === "pro" && !u.architectProfile.proSince) u.architectProfile.proSince = new Date();
    done.push(`plan:${b.plan}`);
  }
  if (b.cau !== undefined) {
    if (u.role !== "architect" || !["verified", "rejected"].includes(b.cau)) return res.status(400).json({ error: "Ação de verificação inválida." });
    const cv = u.architectProfile.cauVerification || {};
    u.architectProfile.cauVerification = { number: cv.number, status: b.cau === "verified" ? "verified" : "none" };
    done.push(`cau:${b.cau}`);
  }
  if (b.bonusMatches !== undefined && u.role === "client") {
    u.clientProfile.bonusMatches = Math.max(0, Math.min(999, Number(b.bonusMatches) || 0));
    done.push(`bonusMatches:${u.clientProfile.bonusMatches}`);
  }
  if (b.bonusPortfolioSlots !== undefined && u.role === "architect") {
    u.architectProfile.bonusPortfolioSlots = Math.max(0, Math.min(999, Number(b.bonusPortfolioSlots) || 0));
    done.push(`bonusPortfolioSlots:${u.architectProfile.bonusPortfolioSlots}`);
  }
  for (const key of ["name", "city", "state"]) {
    if (typeof b[key] === "string" && b[key].trim()) { u[key] = key === "state" ? b[key].trim().slice(0, 2).toUpperCase() : b[key].trim().slice(0, 120); done.push(key); }
  }
  if (b.removeAvatar) { u.avatarUrl = undefined; u.avatarVersion = undefined; done.push("removeAvatar"); }
  if (!done.length) return res.status(400).json({ error: "Nada para alterar." });

  await u.save();
  log(req, done.join(", "), target, b.reason ? { reason: b.reason } : undefined);

  // avisos para a pessoa
  if (b.cau === "verified") {
    cauVerifiedEmail(u).catch(() => {});
    notify(u.id, "cau", "Seu registro CAU/A foi verificado pela equipe match.IA", "dashboard.html");
  } else if (b.cau === "rejected") {
    notify(u.id, "cau", "Não conseguimos confirmar seu registro CAU/A. Confira o número e envie de novo.", "dashboard.html");
  }
  if (b.plan === "pro") notify(u.id, "system", "Seu plano Pro foi ativado pela equipe match.IA", "dashboard.html");
  res.json(userRow(u));
}

export async function deleteUser(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Usuário não encontrado" });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
  if (adminEmails().includes(u.email)) return res.status(400).json({ error: "Contas da equipe não podem ser excluídas por aqui." });
  if (String(req.body?.confirm || "").toLowerCase() !== u.email) return res.status(400).json({ error: "Digite o e-mail da conta para confirmar a exclusão." });
  await deleteUserCascade(u._id);
  log(req, "delete-user", { type: "user", id: u.id, label: `${u.name} <${u.email}>` }, { role: u.role });
  res.json({ ok: true });
}

export async function notifyUser(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Usuário não encontrado" });
  const u = await User.findById(req.params.id).select("name email");
  if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
  const text = String(req.body?.text || "").trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: "Escreva a mensagem." });
  await notify(u.id, "system", text, String(req.body?.link || "").slice(0, 200) || undefined);
  log(req, "notify-user", { type: "user", id: u.id, label: `${u.name} <${u.email}>` }, { text });
  res.json({ ok: true });
}

/** Comunicado para todos (ou um papel): vira notificação no sininho de cada um. */
export async function broadcast(req, res) {
  const text = String(req.body?.text || "").trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: "Escreva a mensagem." });
  const role = ["client", "architect", "store"].includes(req.body?.role) ? req.body.role : null;
  const link = String(req.body?.link || "").slice(0, 200) || undefined;
  const ids = await User.find({ ...(role ? { role } : {}), status: { $ne: "suspended" } }).distinct("_id");
  for (let i = 0; i < ids.length; i += 500) {
    await Notification.insertMany(ids.slice(i, i + 500).map((user) => ({ user, type: "system", text, link })));
  }
  log(req, "broadcast", { type: "audience", label: role || "todos" }, { text, link, recipients: ids.length });
  res.json({ ok: true, recipients: ids.length });
}

export async function exportUsersCsv(req, res) {
  const users = await User.find().sort("-createdAt").select("name email role city state status createdAt lastSeenAt architectProfile.subscriptionTier").lean();
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["nome", "email", "papel", "cidade", "uf", "status", "plano", "criado_em", "visto_em"].join(",")];
  for (const u of users) {
    lines.push([u.name, u.email, u.role, u.city, u.state, u.status || "active", u.architectProfile?.subscriptionTier || "", u.createdAt?.toISOString(), u.lastSeenAt?.toISOString() || ""].map(cell).join(","));
  }
  log(req, "export-users-csv", { type: "users", label: `${users.length} contas` });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=matchia-usuarios.csv");
  res.send("﻿" + lines.join("\n"));
}

// ---------------- Conteúdo da plataforma ----------------
export async function listProjects(req, res) {
  const { page, pageSize, skip } = pageOf(req);
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.q) q.name = new RegExp(esc(String(req.query.q).slice(0, 80)), "i");
  const [items, total] = await Promise.all([
    Project.find(q).sort("-createdAt").skip(skip).limit(pageSize)
      .select("name status propertyType areaM2 city state preferredStyles budget createdAt client architect")
      .populate("client", "name email").populate("architect", "name"),
    Project.countDocuments(q),
  ]);
  res.json({ items, total, page, pageSize });
}

export async function listMatches(req, res) {
  const { page, pageSize, skip } = pageOf(req);
  const [items, total] = await Promise.all([
    MatchHistory.find().sort("-createdAt").skip(skip).limit(pageSize).populate("client", "name email").populate("project", "name").populate("results.architect", "name").lean(),
    MatchHistory.countDocuments(),
  ]);
  res.json({
    items: items.map((m) => {
      const scores = (m.results || []).map((r) => r.score || 0);
      return {
        id: m._id, createdAt: m.createdAt, client: m.client, project: m.project,
        results: scores.length, best: scores.length ? Math.min(100, Math.round(Math.max(...scores))) : 0,
        top: (m.results || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3).map((r) => ({ name: r.architect?.name || "removido", score: Math.min(100, Math.round(r.score || 0)) })),
      };
    }),
    total, page, pageSize,
  });
}

export async function listHires(req, res) {
  const { page, pageSize, skip } = pageOf(req);
  const q = ["pending", "accepted", "declined", "cancelled"].includes(req.query.status) ? { status: req.query.status } : {};
  const [items, total] = await Promise.all([
    Hire.find(q).sort("-createdAt").skip(skip).limit(pageSize).populate("client", "name email").populate("architect", "name email").populate("project", "name"),
    Hire.countDocuments(q),
  ]);
  res.json({ items, total, page, pageSize });
}

export async function listReviews(req, res) {
  const { page, pageSize, skip } = pageOf(req);
  const q = req.query.maxRating ? { rating: { $lte: Number(req.query.maxRating) } } : {};
  const [items, total] = await Promise.all([
    Review.find(q).sort("-createdAt").skip(skip).limit(pageSize).populate("client", "name email").populate("architect", "name"),
    Review.countDocuments(q),
  ]);
  res.json({ items, total, page, pageSize });
}

export async function deleteReview(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Avaliação não encontrada" });
  const r = await Review.findById(req.params.id).populate("architect", "name").populate("client", "name");
  if (!r) return res.status(404).json({ error: "Avaliação não encontrada" });
  await r.deleteOne();
  log(req, "delete-review", { type: "review", id: r.id, label: `${r.client?.name || "?"} → ${r.architect?.name || "?"}` }, { rating: r.rating, comment: r.comment, reason: req.body?.reason });
  res.json({ ok: true });
}

export async function finance(_req, res) {
  const [commissions, referrals, pros] = await Promise.all([
    Commission.find().sort("-createdAt").limit(50).populate("architect", "name").populate("client", "name").populate("project", "name"),
    StoreReferral.find().sort("-createdAt").limit(50).populate("store", "name storeProfile.storeName").populate("client", "name").populate("product", "name"),
    User.find({ role: "architect", "architectProfile.subscriptionTier": "pro" }).sort("-architectProfile.proSince").select("name email architectProfile.proSince"),
  ]);
  res.json({
    commissions: commissions.map((c) => ({ id: c.id, createdAt: c.createdAt, architect: c.architect?.name, client: c.client?.name, project: c.project?.name, amount: c.amount || 0, rate: c.rate, estimatedValue: c.estimatedValue })),
    referrals: referrals.map((r) => ({ id: r.id, createdAt: r.createdAt, store: r.store?.storeProfile?.storeName || r.store?.name, client: r.client?.name, product: r.product?.name, amount: r.simulatedAmount || 0 })),
    pros: pros.map((p) => ({ id: p.id, name: p.name, email: p.email, since: p.architectProfile?.proSince || null })),
  });
}

// ---------------- Marca & site ----------------
export async function getSettings(_req, res) {
  const doc = await SiteSetting.findOne({ key: "announcement" }).lean();
  res.json({ announcement: { active: false, text: "", link: "", tone: "info", ...(doc?.value || {}) }, updatedAt: doc?.updatedAt || null, updatedBy: doc?.updatedBy || null });
}

export async function saveSettings(req, res) {
  const a = req.body?.announcement || {};
  const link = String(a.link || "").trim();
  if (link && !/^(https:\/\/|\/|[\w-]+\.html)/.test(link)) return res.status(400).json({ error: "Use um link https:// ou uma página do site (ex.: planos.html)." });
  const value = {
    active: Boolean(a.active),
    text: String(a.text || "").trim().slice(0, 180),
    link: link.slice(0, 200),
    tone: ["info", "success", "warning"].includes(a.tone) ? a.tone : "info",
  };
  if (value.active && !value.text) return res.status(400).json({ error: "Escreva o texto do aviso." });
  await SiteSetting.findOneAndUpdate({ key: "announcement" }, { value, updatedBy: req.user.email }, { upsert: true });
  clearSiteConfigCache();
  log(req, "update-announcement", { type: "site", label: "Faixa de aviso" }, value);
  res.json({ ok: true, announcement: value });
}

// ---------------- Auditoria e sistema ----------------
export async function logs(req, res) {
  const { page, pageSize, skip } = pageOf(req, 40);
  const [items, total] = await Promise.all([AdminLog.find().sort("-createdAt").skip(skip).limit(pageSize), AdminLog.countDocuments()]);
  res.json({ items, total, page, pageSize });
}

export function system(_req, res) {
  const states = ["desconectado", "conectado", "conectando", "desconectando"];
  const mem = process.memoryUsage();
  res.json({
    environment: process.env.NODE_ENV || "development",
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(mem.rss / 1024 / 1024),
    database: states[mongoose.connection.readyState] || "desconhecido",
    databaseName: mongoose.connection.name,
    email: emailStatus(),
    services: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      unsplash: Boolean(process.env.UNSPLASH_ACCESS_KEY),
      email: Boolean(process.env.BREVO_API_KEY || process.env.EMAIL_HOST),
      jwtFixed: Boolean(process.env.JWT_SECRET) && process.env.JWT_SECRET.length >= 32,
      appUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || null,
    },
    admins: adminEmails().length,
  });
}
