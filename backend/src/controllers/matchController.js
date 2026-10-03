import User from "../models/User.js";
import { avatarPath } from "../services/avatar.js";
import Project from "../models/Project.js";
import MatchHistory from "../models/MatchHistory.js";
import Review from "../models/Review.js";
import { categorizeProjectMatches } from "../services/scoringEngine.js";
import { explainCompatibility } from "../services/geminiService.js";

const CATEGORY_META = {
  unavailable: {
    label: "Compatível, mas indisponível no momento",
    icon: "⏳",
    note: "Combina bem com o que você procura, mas está sem agenda aberta agora — vale entrar em contato mesmo assim para uma futura vaga.",
  },
  outOfRegion: {
    label: "Fora da sua região",
    icon: "📍",
    note: "Bom encaixe de estilo e perfil, mas esse arquiteto não atende a sua cidade/estado hoje.",
  },
  outOfBudget: {
    label: "Fora do seu orçamento",
    icon: "💰",
    note: "Estilo compatível, mas a faixa de preço dos projetos desse arquiteto não cruza com o orçamento informado.",
  },
  wellRated: {
    label: "Fora do estilo pedido, mas muito bem avaliado",
    icon: "🌟",
    note: "Não é o estilo que você descreveu, mas tem nota alta de clientes anteriores — pode valer a pena conhecer o portfólio.",
  },
};

function templatedExplanation(architect, reasons) {
  return reasons.length
    ? `${architect.name} é uma ótima opção por ${reasons.join(", ")}.`
    : `${architect.name} é uma opção com boa avaliação de clientes anteriores, mesmo fora do estilo pedido.`;
}

function shapeArchitect(architect, sameCity) {
  return {
    id: architect.id,
    name: architect.name,
    avatar: avatarPath(architect),
    email: architect.email,
    phone: architect.phone,
    city: architect.city,
    state: architect.state,
    profile: architect.architectProfile,
    sameCity,
  };
}

export async function runMatch(req, res) {
  const { projectId } = req.body || {};
  if (!projectId)
    return res.status(400).json({ error: "Crie um projeto para rodar seu primeiro match." });

  const project = await Project.findOne({ _id: projectId, client: req.user.id });
  if (!project) return res.status(404).json({ error: "Projeto não encontrado" });

  // Antes essa query já excluía quem estava indisponível — o que impedia
  // qualquer categoria de "indisponível, mas compatível" existir. Agora
  // busca todo mundo e deixa a categorização decidir o que fazer com cada um.
  const architects = await User.find({ role: "architect", status: { $ne: "suspended" } });
  const { main, unavailable, outOfRegion, outOfBudget, uncategorized } =
    categorizeProjectMatches(project, req.user, architects);

  const wellRated = await buildWellRatedBonus(uncategorized);

  // geminiService.explainCompatibility lê client.clientProfile pro contexto
  // do prompt — como esse dado agora mora no Project, não no perfil do
  // usuário, monta um shim só pra essa chamada (não afeta o score, só o
  // texto explicativo gerado pela IA).
  const clientContext = {
    name: req.user.name,
    city: req.user.city,
    state: req.user.state,
    clientProfile: {
      preferredStyles: project.preferredStyles,
      preferredMaterials: project.preferredMaterials,
      budget: project.budget,
      propertyType: project.propertyType,
      projectGoals: project.projectGoals,
      preferences: project.preferences,
    },
  };

  const mainResults = await Promise.all(
    main.map(async ({ architect, score, breakdown, reasons, sameCity }) => ({
      architect: shapeArchitect(architect, sameCity),
      score,
      breakdown,
      explanation: await explainCompatibility(clientContext, architect, reasons),
    })),
  );

  const extra = await Promise.all(
    [
      ["unavailable", unavailable],
      ["outOfRegion", outOfRegion],
      ["outOfBudget", outOfBudget],
      ["wellRated", wellRated],
    ]
      .filter(([, entries]) => entries.length)
      .map(async ([key, entries]) => ({
        key,
        ...CATEGORY_META[key],
        results: entries.map(({ architect, score, breakdown, reasons, sameCity }) => ({
          architect: shapeArchitect(architect, sameCity),
          score,
          breakdown,
          explanation: templatedExplanation(architect, reasons),
        })),
      })),
  );

  await MatchHistory.create({
    client: req.user.id,
    project: project.id,
    results: [
      ...mainResults.map((r) => ({ architect: r.architect.id, score: r.score, explanation: r.explanation, category: "main" })),
      ...extra.flatMap((cat) =>
        cat.results.map((r) => ({ architect: r.architect.id, score: r.score, explanation: r.explanation, category: cat.key })),
      ),
    ],
  });

  res.json({ results: mainResults, extra, project: { id: project.id, name: project.name } });
}

async function buildWellRatedBonus(uncategorized) {
  if (!uncategorized.length) return [];
  const ratings = await Review.aggregate([
    { $match: { architect: { $in: uncategorized.map((e) => e.architect._id) } } },
    { $group: { _id: "$architect", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const ratingMap = new Map(ratings.map((r) => [String(r._id), r.avg]));
  return uncategorized
    .filter((e) => (ratingMap.get(String(e.architect._id)) || 0) >= 4)
    .sort((a, b) => (ratingMap.get(String(b.architect._id)) || 0) - (ratingMap.get(String(a.architect._id)) || 0))
    .slice(0, 3)
    .map((e) => ({ ...e, reasons: [`nota ${ratingMap.get(String(e.architect._id)).toFixed(1)} de clientes anteriores`] }));
}

export async function listMatchHistory(req, res) {
  const history = await MatchHistory.find({ client: req.user.id })
    .populate("project", "name")
    .populate("results.architect", "name city state avatarVersion")
    .sort("-createdAt")
    .limit(20);
  res.json(history);
}
