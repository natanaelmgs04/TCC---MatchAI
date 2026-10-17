import User from "../models/User.js";
import { checkCode, deviceHash, issueCode, maskEmail, rememberDevice } from "../services/loginSecurity.js";

/** Painel → Conta → Segurança: login em duas etapas e aparelhos conhecidos. */
const load = (req) => User.findById(req.user._id).select("+security");
const out = (u) => ({
  twoFactor: !!u.security?.twoFactor,
  email: maskEmail(u.email),
  devices: (u.security?.devices || []).map((d) => ({ label: d.label, lastAt: d.lastAt })),
});

export async function get(req, res) {
  res.json(out(await load(req)));
}

/** Código para confirmar que o e-mail chega antes de ligar/desligar. */
export async function sendCode(req, res) {
  const u = await load(req);
  const r = await issueCode(u, "toggle");
  if (r.error) return res.status(429).json({ error: r.error });
  res.json({ sent: true, email: maskEmail(u.email) });
}

export async function toggle(req, res) {
  if (typeof req.body?.enable !== "boolean") return res.status(400).json({ error: "Diga se é para ligar ou desligar." });
  const u = await load(req);
  const r = await checkCode(u, "toggle", req.body.code);
  if (r.error) return res.status(400).json({ error: r.error });
  u.security.twoFactor = req.body.enable;
  u.markModified("security");
  await u.save();
  // o aparelho em que a pessoa está não pede código logo em seguida
  if (req.body.enable) await rememberDevice(u, deviceHash(typeof req.body.deviceId === "string" ? req.body.deviceId.slice(0, 80) : "", req.get("user-agent")), req);
  res.json(out(u));
}

export async function forgetDevices(req, res) {
  const u = await load(req);
  u.security = u.security || {};
  u.security.devices = [];
  u.markModified("security");
  await u.save();
  res.json(out(u));
}
