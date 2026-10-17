import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { loginCodeEmail, newLoginEmail } from "./emailService.js";
import { deviceLabel } from "./officeRules.js";

/**
 * Login em duas etapas (código de 6 dígitos por e-mail quando o aparelho é
 * novo) e aviso de acesso novo. Opcional — cada pessoa liga em Painel →
 * Conta. O código fica guardado só como hash, vale 10 minutos e aceita 5
 * tentativas; o "desafio" do login é assinado com outra chave, então não
 * serve como login (middleware/auth.js também recusa tokens com finalidade).
 */
const CODE_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER = 30 * 1000;
const MAX_DEVICES = 10;

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const challengeSecret = () => `${process.env.JWT_SECRET}:2fa`;
const codeHash = (user, purpose, code) => sha(`${user._id}:${purpose}:${code}`);

export const deviceHash = (deviceId, userAgent) => sha(deviceId ? `id:${deviceId}` : `ua:${userAgent || ""}`);

export function maskEmail(email = "") {
  const [name, domain] = email.split("@");
  if (!domain) return "";
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export const isKnownDevice = (user, hash) => (user.security?.devices || []).some((d) => d.hash === hash);

/** Gera e manda um código. Devolve { error } se pediu de novo cedo demais. */
export async function issueCode(user, purpose) {
  const prev = user.security?.code;
  if (prev?.purpose === purpose && prev.sentAt && Date.now() - prev.sentAt.getTime() < RESEND_AFTER) return { error: "Espere alguns segundos para pedir outro código." };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  user.security = user.security || {};
  user.security.code = { hash: codeHash(user, purpose, code), purpose, expires: new Date(Date.now() + CODE_TTL), attempts: 0, sentAt: new Date() };
  await user.save();
  await loginCodeEmail(user, code, purpose);
  return { sent: true };
}

/** Confere o código (uso único). */
export async function checkCode(user, purpose, code) {
  const c = user.security?.code;
  if (!c?.hash || c.purpose !== purpose) return { error: "Peça um código novo." };
  if (c.expires < new Date()) return { error: "O código venceu. Peça um novo." };
  if ((c.attempts || 0) >= MAX_ATTEMPTS) return { error: "Tentativas demais. Peça um código novo." };
  const ok = /^\d{6}$/.test(String(code || "")) && crypto.timingSafeEqual(Buffer.from(c.hash), Buffer.from(codeHash(user, purpose, String(code))));
  if (!ok) {
    c.attempts = (c.attempts || 0) + 1;
    user.markModified("security");
    await user.save();
    return { error: `Código incorreto. ${MAX_ATTEMPTS - c.attempts > 0 ? `Restam ${MAX_ATTEMPTS - c.attempts} tentativas.` : "Peça um código novo."}` };
  }
  user.security.code = undefined;
  await user.save();
  return { ok: true };
}

/** Guarda o aparelho; com alert, avisa por e-mail que houve um acesso de um aparelho novo. */
export async function rememberDevice(user, hash, req, { alert = false } = {}) {
  user.security = user.security || {};
  const list = user.security.devices || [];
  const known = list.find((d) => d.hash === hash);
  const label = deviceLabel(req.get("user-agent") || "");
  const hadDevices = list.length > 0;
  if (known) known.lastAt = new Date();
  else list.push({ hash, label, lastAt: new Date() });
  list.sort((a, b) => b.lastAt - a.lastAt);
  user.security.devices = list.slice(0, MAX_DEVICES);
  user.markModified("security");
  await user.save();
  // o primeiro aparelho (ou a primeira entrada depois que o recurso existiu) não gera aviso
  if (alert && !known && hadDevices) newLoginEmail(user, { label, at: new Date() }).catch(() => {});
}

export const challengeFor = (user, hash) => jwt.sign({ sub: user.id, dh: hash, purpose: "2fa" }, challengeSecret(), { expiresIn: "10m" });

export function readChallenge(token) {
  try {
    const p = jwt.verify(String(token || ""), challengeSecret());
    return p.purpose === "2fa" ? p : null;
  } catch {
    return null;
  }
}
