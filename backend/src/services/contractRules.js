import crypto from "node:crypto";

/**
 * Regras puras da proposta/contrato (sem banco): o documento que as duas
 * partes assinam, o código de verificação e a conferência da assinatura por
 * nome digitado.
 */
export const VALID_DAYS_DEFAULT = 15;

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** A assinatura vale quando o nome digitado é o nome completo da conta (sem diferença de acento/maiúscula). */
export function signatureMatches(typed, accountName) {
  const t = norm(typed);
  return t.length >= 3 && t === norm(accountName);
}

const brl = (n) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const CONTRACT_CLAUSES = [
  "Cada etapa é entregue no Espaço do projeto da match.IA e só avança com a aprovação do CONTRATANTE. Pedidos de ajuste ficam registrados no histórico do projeto.",
  "Os honorários de cada etapa passam a ser devidos quando o CONTRATANTE aprova a etapa.",
  "Os prazos contam a partir da assinatura deste contrato. Mudanças de escopo depois da assinatura são combinadas por uma nova proposta.",
  "Os dados pessoais das partes são tratados conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e usados somente para executar este contrato.",
  "Assinatura eletrônica simples: cada parte assina digitando o nome completo; a plataforma registra data, hora, endereço IP e o código de verificação deste documento.",
  "Documento gerado em projeto acadêmico (TCC) para demonstração — não substitui um contrato revisado por advogado.",
];

/**
 * O documento assinado. Tudo que entra aqui entra no código de verificação:
 * mudar uma vírgula do escopo gera outro código (e invalida a assinatura).
 */
export function buildContractDocument({ project, client, architect, scope, stages, paymentTerms, validUntil, version }) {
  const total = Math.round(stages.reduce((t, s) => t + (Number(s.fee) || 0), 0) * 100) / 100;
  const where = [project.city, project.state].filter(Boolean).join("/");
  const object = `Projeto de arquitetura "${project.name}"${project.propertyType ? `, ${String(project.propertyType).toLowerCase()}` : ""}${project.areaM2 ? ` de ${project.areaM2} m²` : ""}${where ? `, em ${where}` : ""}.`;
  return {
    title: "Proposta e contrato de prestação de serviços de arquitetura",
    version,
    parties: { contratante: client.name, contratado: architect.name },
    object,
    scope: scope || "",
    stages: stages.map((s, i) => ({
      n: i + 1,
      name: s.name,
      weeks: s.weeks,
      fee: Number(s.fee) || 0,
      closesDesign: !!s.closesDesign,
      text: `${s.name} — ${s.weeks ? `${s.weeks} semana${s.weeks > 1 ? "s" : ""}` : "sem prazo fixo"} — ${brl(s.fee)}`,
    })),
    total,
    totalText: brl(total),
    paymentTerms: paymentTerms || "Honorários de cada etapa pagos na aprovação da etapa.",
    validUntil: new Date(validUntil).toISOString().slice(0, 10),
    clauses: CONTRACT_CLAUSES,
  };
}

export function documentHash(doc) {
  return crypto.createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

/** Dados da proposta vindos do formulário do arquiteto. */
export function normalizeProposalInput(body = {}) {
  const scope = typeof body.scope === "string" ? body.scope.trim().slice(0, 3000) : "";
  if (scope.length < 20) return { error: "Descreva o escopo do trabalho (pelo menos uma frase)." };
  const paymentTerms = typeof body.paymentTerms === "string" ? body.paymentTerms.trim().slice(0, 600) : "";
  const days = Math.round(Number(body.validDays) || VALID_DAYS_DEFAULT);
  if (days < 1 || days > 60) return { error: "A validade da proposta vai de 1 a 60 dias." };
  return { scope, paymentTerms, validDays: days };
}
