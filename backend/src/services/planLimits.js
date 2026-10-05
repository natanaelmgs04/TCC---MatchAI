/**
 * O que cada plano do arquiteto inclui — um lugar só, usado pelos
 * controllers (o servidor é quem barra; a tela só explica). A régua segue
 * três regras:
 *   1. nada que o CLIENTE usa fica travado (ele nunca paga);
 *   2. o que custa dinheiro para a plataforma (arquivos, IA, 3D) tem limite no Gratuito;
 *   3. o que poupa tempo de quem toca vários projetos ao mesmo tempo é Pro.
 * Preço exibido em planos.html (PRO_PRICE_MONTHLY) — cobrança simulada (TCC).
 */
export const PRO_PRICE_MONTHLY = 79;
const MB = 1024 * 1024;

export const PLAN_LIMITS = {
  free: {
    portfolioItems: 3,
    activeWorkspaces: 1, // Espaço do projeto com edição em 1 projeto ativo por vez
    workspaceStorage: 20 * MB,
    libraryItems: 20,
    copyLibrary: false,
    aiConcept: false, // o conceito sai no texto padrão, montado sem IA
    assistantDaily: 10,
    studio3d: false,
  },
  pro: {
    portfolioItems: Infinity,
    activeWorkspaces: Infinity,
    workspaceStorage: 80 * MB,
    libraryItems: 300,
    copyLibrary: true,
    aiConcept: true,
    assistantDaily: 200, // uso justo: protege a cota da IA, ninguém chega aqui trabalhando
    studio3d: true,
  },
};

export const isPro = (user) => user?.architectProfile?.subscriptionTier === "pro";
export const tierOf = (user) => (isPro(user) ? "pro" : "free");
export const limitsFor = (user) => PLAN_LIMITS[tierOf(user)];

/** Versão para JSON (Infinity vira null). */
export const publicLimits = (limits) => Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v === Infinity ? null : v]));

export const UPGRADE_HINT = "Assine o Pro em Planos para liberar.";
