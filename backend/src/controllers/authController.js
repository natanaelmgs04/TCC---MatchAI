import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import User from "../models/User.js";
import { welcomeEmail, passwordResetEmail, publicBaseUrl } from "../services/emailService.js";
import { notify } from "../services/notificationService.js";

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const tokenFor = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

const common = (body) => ({
  name: body.name,
  email: body.email,
  avatarUrl: body.avatarUrl,
  bio: body.bio,
  passwordHash: body.password,
});

export async function register(req, res) {
  const role = req.params.role;
  if (!["client", "architect", "store"].includes(role))
    return res.status(400).json({ error: "Invalid role" });

  const { password, confirmPassword } = req.body;
  if (!password || password !== confirmPassword)
    return res.status(400).json({ error: "Passwords do not match" });

  const email = String(req.body.email || "").toLowerCase();
  if (await User.exists({ email }))
    return res.status(409).json({ error: "Email is already registered" });

  // Cadastro enxuto: nome, e-mail, senha, foto e bio — o resto do perfil
  // (estilo, materiais, portfólio...) nasce vazio e é preenchido depois,
  // a partir dos projetos/peças de portfólio/produtos que a pessoa cria no painel.
  const profile =
    role === "architect"
      ? { bio: req.body.bio }
      : role === "store"
        ? { storeName: req.body.storeName, description: req.body.bio, logoUrl: req.body.avatarUrl }
        : {};

  let referrer = null;
  if (req.body.referredBy) {
    referrer = await User.findById(req.body.referredBy).catch(() => null);
  }

  const user = await User.create({
    ...common({ ...req.body, email }),
    role,
    referredBy: referrer?.id,
    [role + "Profile"]: profile,
  });

  res.status(201).json({
    token: tokenFor(user),
    user: { id: user.id, name: user.name, role: user.role },
  });
  welcomeEmail(user).catch(() => {});

  if (referrer && referrer.role !== "store") {
    const bonusField = referrer.role === "client" ? "clientProfile.bonusMatches" : "architectProfile.bonusPortfolioSlots";
    User.updateOne({ _id: referrer.id }, { $inc: { [bonusField]: 1 } }).catch(() => {});
    const bonusText = referrer.role === "client" ? "+1 busca de match bônus" : "+1 vaga bônus no portfólio";
    notify(referrer.id, "referral", `${user.name} se cadastrou pelo seu link — você ganhou ${bonusText}!`, "dashboard.html");
  }
}

export async function login(req, res) {
  const user = await User.findOne({
    email: req.body.email?.toLowerCase(),
  }).select("+passwordHash");
  if (!user || !(await user.verifyPassword(req.body.password || "")))
    return res.status(401).json({ error: "Invalid email or password" });

  res.json({
    token: tokenFor(user),
    user: { id: user.id, name: user.name, role: user.role },
  });
}

/**
 * Pedido de redefinição de senha. Sempre responde a mesma mensagem de
 * sucesso, exista ou não a conta — senão dá pra descobrir quais e-mails
 * estão cadastrados só tentando "esqueci minha senha" com cada um.
 */
export async function forgotPassword(req, res) {
  const email = String(req.body.email || "").toLowerCase();
  const user = await User.findOne({ email });
  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetTokenHash = hashToken(rawToken);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const resetUrl = `${publicBaseUrl(req)}/redefinir-senha.html?token=${rawToken}`;
    passwordResetEmail(user, resetUrl).catch((err) => console.error("Falha ao enviar e-mail de redefinição:", err.message));
  }
  res.json({ ok: true, message: "Se esse e-mail estiver cadastrado, enviamos um link de redefinição." });
}

export async function resetPassword(req, res) {
  const { token, password, confirmPassword } = req.body;
  if (!token || !password || password !== confirmPassword)
    return res.status(400).json({ error: "Preencha a nova senha corretamente nos dois campos." });

  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user)
    return res.status(400).json({ error: "Link de redefinição inválido ou expirado. Peça um novo." });

  user.passwordHash = password;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  res.json({ ok: true });
}
