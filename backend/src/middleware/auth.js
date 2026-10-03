import jwt from "jsonwebtoken";
import User from "../models/User.js";
export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token)
      return res.status(401).json({ error: "Authentication required" });
    const { sub } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(sub);
    if (!req.user) return res.status(401).json({ error: "User not found" });
    if (req.user.status === "suspended")
      return res.status(403).json({ error: "Sua conta está suspensa. Fale com a equipe match.IA." });
    // "visto por último" para o painel da equipe, sem uma escrita por requisição
    if (!req.user.lastSeenAt || Date.now() - req.user.lastSeenAt.getTime() > 10 * 60 * 1000) {
      User.updateOne({ _id: req.user._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Insufficient permissions" });

/**
 * Equipe match.IA: e-mails listados em ADMIN_EMAILS (separados por vírgula)
 * entram no painel de gestão (admin.html). Sem a variável, ninguém entra.
 */
export const adminEmails = () =>
  String(process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isAdmin = (user) => Boolean(user?.email) && adminEmails().includes(String(user.email).toLowerCase());
export function requireAdmin(req, res, next) {
  return isAdmin(req.user) ? next() : res.status(403).json({ error: "Acesso restrito à equipe match.IA." });
}
