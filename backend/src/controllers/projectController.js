import Project from "../models/Project.js";
import { suggestProductsForProject } from "../services/storeMatchService.js";
import { normalizeStyleNotes, normalizeStylePicks, normalizeExperience } from "../services/projectPreferences.js";

// Estilos e materiais podem ser digitados pelo cliente ("+ Outros..."):
// cada item recortado, sem repetição e com um limite de itens.
const normalizeStringArray = (value) => {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set();
  return list
    .map((item) => String(item ?? "").trim().replace(/\s+/g, " ").slice(0, 60))
    .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))
    .slice(0, 20);
};
const cleanPropertyType = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : undefined);

const normalizeBudget = (body) => {
  const min = body.budgetMin !== undefined && body.budgetMin !== "" ? Number(body.budgetMin) : undefined;
  const max = body.budgetMax !== undefined && body.budgetMax !== "" ? Number(body.budgetMax) : undefined;
  if (min === undefined && max === undefined) return undefined;
  return { min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined };
};

export async function listProjects(req, res) {
  const projects = await Project.find({ client: req.user.id }).sort("-createdAt");
  res.json(projects);
}

// Localização da obra (o match usa esta; ver services/scoringEngine.js).
const cleanCity = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
const cleanState = (v) => (typeof v === "string" && /^[a-z]{2}$/i.test(v.trim()) ? v.trim().toUpperCase() : undefined);

export async function createProject(req, res) {
  if (!req.body.name?.trim())
    return res.status(400).json({ error: "Nome do projeto é obrigatório" });

  const project = await Project.create({
    client: req.user.id,
    name: req.body.name.trim(),
    preferredStyles: normalizeStringArray(req.body.preferredStyles),
    preferredMaterials: normalizeStringArray(req.body.preferredMaterials),
    budget: normalizeBudget(req.body),
    propertyType: cleanPropertyType(req.body.propertyType),
    familySize: req.body.familySize ? Number(req.body.familySize) : undefined,
    projectGoals: req.body.projectGoals,
    preferences: req.body.preferences,
    areaM2: req.body.areaM2 ? Number(req.body.areaM2) : undefined,
    city: cleanCity(req.body.city),
    state: cleanState(req.body.state),
    status: req.body.status,
    styleNotes: normalizeStyleNotes(req.body.styleNotes),
    stylePicks: normalizeStylePicks(req.body.stylePicks),
    experience: normalizeExperience(req.body.experience),
  });
  res.status(201).json(project);
}

export async function updateProject(req, res) {
  const project = await Project.findOne({ _id: req.params.id, client: req.user.id });
  if (!project) return res.status(404).json({ error: "Projeto não encontrado" });

  const allowed = ["name", "propertyType", "projectGoals", "preferences", "status"];
  for (const key of allowed) if (req.body[key] !== undefined) project[key] = req.body[key];
  if (req.body.propertyType !== undefined) project.propertyType = cleanPropertyType(req.body.propertyType);
  if (req.body.familySize !== undefined) project.familySize = Number(req.body.familySize);
  if (req.body.areaM2 !== undefined) project.areaM2 = req.body.areaM2 ? Number(req.body.areaM2) : undefined;
  if (req.body.city !== undefined) project.city = cleanCity(req.body.city);
  if (req.body.state !== undefined) project.state = cleanState(req.body.state);
  if (req.body.preferredStyles !== undefined) project.preferredStyles = normalizeStringArray(req.body.preferredStyles);
  if (req.body.preferredMaterials !== undefined) project.preferredMaterials = normalizeStringArray(req.body.preferredMaterials);
  if (req.body.budgetMin !== undefined || req.body.budgetMax !== undefined) project.budget = normalizeBudget(req.body);
  if (req.body.styleNotes !== undefined) project.styleNotes = normalizeStyleNotes(req.body.styleNotes);
  if (req.body.stylePicks !== undefined) project.stylePicks = normalizeStylePicks(req.body.stylePicks);
  if (req.body.experience !== undefined) project.experience = normalizeExperience(req.body.experience);

  await project.save();
  res.json(project);
}

export async function deleteProject(req, res) {
  const project = await Project.findOneAndDelete({ _id: req.params.id, client: req.user.id });
  if (!project) return res.status(404).json({ error: "Projeto não encontrado" });
  res.json({ ok: true });
}

// Projetos de clientes que contrataram este arquiteto pela plataforma
// (ver validationController.createCommissionForClosedValidation) — alimenta
// a aba "Seus projetos" e o assistente de IA do lado do arquiteto.
export async function listArchitectProjects(req, res) {
  const projects = await Project.find({ architect: req.user.id })
    .sort("-updatedAt")
    .populate("client", "name city state");
  res.json(
    projects.map((p) => ({
      _id: p.id,
      name: p.name,
      status: p.status,
      propertyType: p.propertyType,
      areaM2: p.areaM2,
      preferredStyles: p.preferredStyles,
      preferredMaterials: p.preferredMaterials,
      budget: p.budget,
      projectGoals: p.projectGoals,
      preferences: p.preferences,
      styleNotes: p.styleNotes,
      stylePicks: p.stylePicks,
      experience: p.experience,
      client: p.client ? { id: p.client.id, name: p.client.name, city: p.client.city, state: p.client.state } : null,
    })),
  );
}

export async function listSuggestedProducts(req, res) {
  const project = await Project.findOne({ _id: req.params.id, client: req.user.id });
  if (!project) return res.status(404).json({ error: "Projeto não encontrado" });
  const products = await suggestProductsForProject(project);
  res.json(products);
}
