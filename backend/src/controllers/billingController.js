import { PIX_KEY_TYPES, formatTaxId, normalizePixProfile, normalizeTaxId } from "../services/officeRules.js";

/**
 * Recebimento dos honorários (Painel → Recebimentos): chave Pix para o QR
 * Code de cada cobrança e CPF/CNPJ opcional para os recibos. O dinheiro vai
 * direto para a conta do arquiteto — a plataforma só monta o "copia e cola".
 */
const out = (p = {}) => ({
  pix: p.pix?.key ? { type: p.pix.type, key: p.pix.key, name: p.pix.name, city: p.pix.city } : null,
  taxId: p.taxId ? formatTaxId(p.taxId) : "",
  keyTypes: PIX_KEY_TYPES,
});

export async function getMine(req, res) {
  res.json(out(req.user.architectProfile));
}

export async function updateMine(req, res) {
  const pix = normalizePixProfile(req.body?.pix || {});
  if (pix.error) return res.status(400).json({ error: pix.error });
  const tax = normalizeTaxId(req.body?.taxId);
  if (tax.error) return res.status(400).json({ error: tax.error });
  req.user.architectProfile.pix = pix.pix || undefined;
  req.user.architectProfile.taxId = tax.taxId || undefined;
  await req.user.save();
  res.json(out(req.user.architectProfile));
}
