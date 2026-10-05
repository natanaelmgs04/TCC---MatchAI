import User from "../models/User.js";
import { deriveSignature, normalizeSignature } from "../services/workspaceRules.js";

/**
 * Assinatura do arquiteto (Painel → Portfólio): o que ele escreve sobre o
 * próprio jeito de projetar + o que se repete no portfólio dele. Aparece no
 * perfil público e orienta o assistente de IA e o conceito de cada projeto.
 */
const shape = (u) => ({
  signature: u.architectProfile?.signature || null,
  derived: deriveSignature(u.architectProfile?.portfolio || []),
});

export async function getMine(req, res) {
  res.json(shape(req.user));
}

export async function updateMine(req, res) {
  const signature = normalizeSignature(req.body);
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { "architectProfile.signature": signature } }, { new: true });
  res.json(shape(user));
}
