import crypto from "node:crypto";
import User from "../models/User.js";
import { deleteUserCascade } from "./accountDeletion.js";

const photo = (id) => `/assets/img/photos/photo-${id}.webp`; // fotos do próprio site (não dependem de rede externa)
const PORTFOLIO = [
  { title: "Apartamento Pinheiros", description: "Sala integrada com luz natural o dia todo, sofá em couro e parede de galeria. Reforma completa de 85 m².", imageUrl: photo("1600210492486-724fe5c67fb0"), styles: ["Contemporâneo", "Escandinavo"], materials: ["Madeira natural", "Linho"], areaM2: 85, status: "completed" },
  { title: "Cobertura Vila Madalena", description: "Living com painel de madeira, cozinha aberta e esquadrias do piso ao teto para a varanda.", imageUrl: photo("1600607687939-ce8a6c25118c"), styles: ["Contemporâneo", "Minimalista"], materials: ["Madeira natural", "Porcelanato", "Vidro"], areaM2: 140, status: "completed" },
  { title: "Casa Alto de Pinheiros", description: "Pé-direito duplo, escada vazada em madeira e sala aberta para o jardim — pensada para a família e o cachorro.", imageUrl: photo("1600566753086-00f18fb6b3ea"), styles: ["Contemporâneo"], materials: ["Madeira natural", "Concreto aparente"], areaM2: 260, status: "completed" },
  { title: "Loft Itaim", description: "Jantar integrado à cozinha, marcenaria ripada e iluminação em trilho para um casal que recebe amigos.", imageUrl: photo("1600607687920-4e2a09cf159d"), styles: ["Minimalista", "Industrial"], materials: ["Madeira natural", "Aço", "Vidro"], areaM2: 72, status: "completed" },
  { title: "Studio Perdizes", description: "Canto de leitura e home office em 38 m²: paleta neutra, poltrona amarela como ponto de cor.", imageUrl: photo("1586023492125-27b2c045efd7"), styles: ["Minimalista", "Escandinavo"], materials: ["Madeira natural", "Linho"], areaM2: 38, status: "completed" },
  { title: "Residência Granja Viana", description: "Interiores de uma casa térrea com grandes aberturas para o gramado (em andamento).", imageUrl: photo("1600585154340-be6161a56a0c"), styles: ["Contemporâneo"], materials: ["Madeira natural", "Vidro", "Concreto aparente"], areaM2: 310, status: "ongoing" },
];

export const SHOWCASE = {
  arquiteta: { name: "Helena Duarte", email: "arquiteta.vitrine@match.arquitetos.demo" },
  cliente: { name: "Marina Costa", email: "cliente.vitrine@match.arquitetos.demo" },
};

/**
 * Contas de vitrine para apresentar o site: uma arquiteta e uma cliente
 * fictícias, já com o projeto abaixo. Recriar apaga as duas e começa do zero
 * (as datas voltam a contar de hoje). A senha é sorteada a cada vez — nunca
 * fica no código, que é público. A arquiteta vira "perfil ilustrativo"
 * (isDemo) no fim: ninguém de verdade consegue contratá-la nem mandar
 * mensagem. Os e-mails (.demo) nunca são enviados.
 *
 * Usado pelo painel da equipe (admin → Usuários → Conta de vitrine) e por
 * `npm run seed:vitrine`. `app` é o app Express: ele escuta numa porta local
 * só enquanto monta o cenário, e tudo passa pelas regras de verdade da API.
 */
export async function buildShowcaseAccounts(app, { password } = {}) {
  const pass = password || crypto.randomBytes(9).toString("base64url");
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const people = {};
  const api = async (path, { method = "GET", as, body } = {}) => {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${people[as].token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.error || ""}`);
    return data;
  };
  try {
    for (const p of Object.values(SHOWCASE)) {
      const old = await User.findOne({ email: p.email }).select("_id");
      if (old) await deleteUserCascade(old._id);
    }
    for (const [key, role] of [["arquiteta", "architect"], ["cliente", "client"]]) {
      const p = SHOWCASE[key];
      const r = await api(`/auth/register/${role}`, { method: "POST", body: { name: p.name, email: p.email, password: pass, confirmPassword: pass } });
      people[key] = { token: r.token, id: r.user.id };
    }
    await User.updateOne({ _id: people.arquiteta.id }, {
      $set: {
        city: "São Paulo",
        state: "SP",
        bio: "Arquiteta de interiores (perfil ilustrativo para demonstração da plataforma).",
        "architectProfile.bio": "Interiores residenciais contemporâneos, com luz natural e marcenaria sob medida.",
        "architectProfile.styles": ["Contemporâneo", "Minimalista"],
        "architectProfile.yearsExperience": 12,
        "architectProfile.subscriptionTier": "pro", // mostra tudo, sem os limites do Gratuito
        "architectProfile.proSince": new Date(),
        "architectProfile.specialties": ["Interiores residenciais", "Reformas de apartamento"],
        "architectProfile.workingAreas": ["São Paulo", "Grande São Paulo"],
        "architectProfile.favoriteMaterials": ["Madeira natural", "Porcelanato", "Granito", "Linho"],
        "architectProfile.availability": "available",
        "architectProfile.priceRange": { min: 8000, max: 40000 },
        "architectProfile.portfolio": PORTFOLIO,
        "architectProfile.signature": {
          statement: "Casas calmas, com luz natural, madeira de verdade e marcenaria que organiza a rotina — nada que precise de manutenção difícil.",
          principles: ["Luz natural antes de qualquer luminária", "Ambientes integrados, mas com cantos de recolhimento", "Marcenaria sob medida no lugar de móveis soltos"],
          palette: ["Off-white", "Areia", "Madeira clara", "Verde-oliva"],
          signatureMaterials: ["Madeira natural", "Porcelanato", "Linho"],
          avoid: ["Gesso decorativo", "Espelhos em excesso"],
          updatedAt: new Date(),
        },
      },
    });
    await User.updateOne({ _id: people.cliente.id }, { $set: { city: "São Paulo", state: "SP" } });
    const ids = await seedShowcase(api, { arquiteta: SHOWCASE.arquiteta.name, cliente: SHOWCASE.cliente.name }, { architectId: people.arquiteta.id });
    await User.updateOne({ _id: people.arquiteta.id }, { $set: { isDemo: true } }); // depois da contratação
    return { password: pass, architect: SHOWCASE.arquiteta, client: SHOWCASE.cliente, projectId: ids.projectId };
  } finally {
    server.closeAllConnections(); // o fetch mantém a conexão aberta (keep-alive)
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * Projeto de vitrine: o mesmo cenário usado nos testes de interface e na
 * demonstração do site (src/scripts/showcase.js). Tudo passa pela API, então
 * as regras de verdade (contrato, etapas, Pix, documentos) valem aqui também.
 *
 * `api(path, { method, as, body })` chama a API como "cliente" ou "arquiteta";
 * `names` traz o nome completo de cada conta (a assinatura do contrato confere).
 */
export async function seedShowcase(api, names, { architectId, pixKey = "pix@match.arquitetos.demo" }) {
  const proj = await api("/projects", { method: "POST", as: "cliente", body: { name: "Apartamento Vila Mariana", city: "São Paulo", state: "SP", propertyType: "Apartamento", areaM2: 92, preferredStyles: ["Contemporâneo"], projectGoals: "Integrar a cozinha à sala e criar um home office." } });
  const hire = await api("/hires", { method: "POST", as: "cliente", body: { projectId: proj._id, architectId, message: "Queremos integrar a cozinha." } });
  const b = await api("/briefings", { method: "POST", as: "arquiteta", body: { hireId: hire.id } });
  await api(`/briefings/${b.id}/answers`, { method: "POST", as: "cliente", body: { answers: { q1: "Casal e um gato", q2: "Os dois trabalham de casa três dias por semana.", q3: ["Cozinha integrada", "Home office"], q4: ["Luz natural", "Muito armazenamento"], q6: "De R$ 50 a 150 mil", q8: "Piso frio no quarto" } } });
  const prop = await api("/proposals", { method: "POST", as: "arquiteta", body: { hireId: hire.id, scope: "Projeto de interiores do apartamento: levantamento, anteprojeto para aprovação, projeto executivo com detalhamento de marcenaria e acompanhamento da obra.", signatureName: names.arquiteta, stages: [
    { name: "Briefing e levantamento", weeks: 2, fee: 1800 },
    { name: "Anteprojeto", weeks: 4, fee: 3200 },
    { name: "Projeto executivo", weeks: 5, fee: 4500, closesDesign: true },
    { name: "Acompanhamento da obra", weeks: 10, fee: 2500 },
  ] } });
  await api(`/proposals/${prop.id}/sign`, { method: "POST", as: "cliente", body: { agree: true, signatureName: names.cliente } });
  await api("/architects/me/billing", { method: "PUT", as: "arquiteta", body: { pix: { type: "email", key: pixKey, name: names.arquiteta, city: "São Paulo" } } });
  const ws = await api(`/workspace/${proj._id}`, { as: "arquiteta" });
  const k0 = ws.stages[0].key;
  await api(`/workspace/${proj._id}/stages/${k0}/submit`, { method: "POST", as: "arquiteta", body: { text: "Levantamento e programa fechados." } });
  await api(`/workspace/${proj._id}/stages/${k0}/approve`, { method: "POST", as: "cliente", body: {} });
  await api(`/workspace/${proj._id}/legal-docs/rrt`, { method: "PATCH", as: "arquiteta", body: { status: "concluido", number: "12345678" } });
  await api(`/workspace/${proj._id}/legal-docs/condominio`, { method: "PATCH", as: "arquiteta", body: { status: "andamento" } });
  const tomorrow = new Date(Date.now() + 26 * 3600e3);
  tomorrow.setMinutes(0, 0, 0);
  await api(`/workspace/${proj._id}/meetings`, { method: "POST", as: "arquiteta", body: { kind: "visita", title: "Visita técnica e medição", startsAt: tomorrow.toISOString(), durationMin: 90, place: "Rua Domingos de Morais, 1000" } });
  for (const it of [
    { name: "Porcelanato 90x90 cinza", category: "Revestimento", storeName: "Casa & Piso", price: 129.9, quantity: 48, unit: "m²", room: "Sala", warrantyMonths: 60 },
    { name: "Bancada em granito São Gabriel", category: "Pedras", storeName: "Marmoraria Sul", price: 2800, room: "Cozinha", warrantyMonths: 12 },
    { name: "Pendente de latão", category: "Iluminação", storeName: "Luz & Cia", price: 890, quantity: 2, room: "Cozinha" },
  ]) await api(`/workspace/${proj._id}/library`, { method: "POST", as: "arquiteta", body: it });
  await api(`/workspace/${proj._id}/crew`, { method: "POST", as: "arquiteta", body: { name: "Marcenaria Bom Corte", trade: "Marcenaria", contact: "(11) 4000-0000" } });
  await api(`/workspace/${proj._id}/diary`, { method: "POST", as: "arquiteta", body: { date: new Date().toISOString(), text: "Demolição da parede da cozinha concluída." } });
  return { projectId: proj._id, hireId: hire.id, proposalId: prop.id, briefingId: b.id };
}
