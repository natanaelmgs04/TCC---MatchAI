/**
 * Site + API num MongoDB temporário em memória, com um projeto de exemplo já
 * contratado — para os testes de interface (flows.ui.js) e para abrir o site
 * localmente sem tocar no banco do Atlas (demo-server.js). Nada de rede
 * externa: e-mail, IA e 3D desligados; os e-mails simulados vão para `mails`.
 * As senhas abaixo são só destes dados de teste.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

// o mesmo MongoDB já baixado para os testes (backend/node_modules/.cache), qualquer que seja a pasta de onde se rode
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", ".cache", "mongodb-memory-server");
for (const k of ["BREVO_API_KEY", "EMAIL_HOST", "EMAIL_USER", "EMAIL_PASS", "GEMINI_API_KEY", "TRIPO_API_KEY", "MELTFLEX_API_KEY", "UNSPLASH_ACCESS_KEY", "ADMIN_EMAILS", "MONGODB_URI"]) process.env[k] = "";
process.env.JWT_SECRET = process.env.JWT_SECRET_UI || "ui-secret-only-for-tests";
process.env.MODEL3D_DEMO = "0";

export const PASSWORD = "Teste-ui-123";
export const PEOPLE = {
  cliente: { name: "Bruna Teste", email: "cliente@ui.test", role: "client" },
  arquiteta: { name: "Teresa Teste", email: "arquiteta@ui.test", role: "architect" },
};

export async function startStack({ port = 0, dbName = "matchia_ui" } = {}) {
  const mails = [];
  const log = console.log;
  console.log = (...args) => {
    const line = args.join(" ");
    if (line.startsWith("[email simulado]")) mails.push(line);
    log(...args);
  };
  const { MongoMemoryServer } = await import("mongodb-memory-server-core");
  const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 90_000 } });
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(dbName));
  const app = (await import("../../src/app.js")).default;
  const server = await new Promise((resolve) => { const s = app.listen(port, "127.0.0.1", () => resolve(s)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const people = {};

  const api = async (path, { method = "GET", as, body } = {}) => {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${people[as].token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${origin}/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    return data;
  };

  for (const [key, p] of Object.entries(PEOPLE)) {
    const r = await api(`/auth/register/${p.role}`, { method: "POST", body: { name: p.name, email: p.email, password: PASSWORD, confirmPassword: PASSWORD, city: "São Paulo", state: "SP" } });
    people[key] = { ...p, token: r.token, id: r.user.id };
  }

  /** Projeto contratado com contrato assinado, briefing respondido, 1ª etapa aprovada com Pix em aberto e uma visita amanhã. */
  async function seedWorkspace() {
    const proj = await api("/projects", { method: "POST", as: "cliente", body: { name: "Apartamento Vila Mariana", city: "São Paulo", state: "SP", preferredStyles: ["Contemporâneo"] } });
    const hire = await api("/hires", { method: "POST", as: "cliente", body: { projectId: proj._id, architectId: people.arquiteta.id, message: "Queremos integrar a cozinha." } });
    const b = await api("/briefings", { method: "POST", as: "arquiteta", body: { hireId: hire.id } });
    await api(`/briefings/${b.id}/answers`, { method: "POST", as: "cliente", body: { answers: { q1: "Casal e um gato", q3: ["Cozinha integrada", "Home office"], q4: ["Luz natural"], q6: "De R$ 50 a 150 mil" } } });
    const prop = await api("/proposals", { method: "POST", as: "arquiteta", body: { hireId: hire.id, scope: "Projeto de interiores do apartamento, com executivo e acompanhamento da obra.", signatureName: PEOPLE.arquiteta.name, stages: [
      { name: "Briefing e levantamento", weeks: 2, fee: 1800 },
      { name: "Anteprojeto", weeks: 4, fee: 3200 },
      { name: "Projeto executivo", weeks: 5, fee: 4500, closesDesign: true },
      { name: "Acompanhamento da obra", weeks: 10, fee: 2500 },
    ] } });
    await api(`/proposals/${prop.id}/sign`, { method: "POST", as: "cliente", body: { agree: true, signatureName: PEOPLE.cliente.name } });
    await api("/architects/me/billing", { method: "PUT", as: "arquiteta", body: { pix: { type: "email", key: "pix@ui.test", name: "Teresa Teste", city: "São Paulo" }, taxId: "529.982.247-25" } });
    let ws = await api(`/workspace/${proj._id}`, { as: "arquiteta" });
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
    ws = await api(`/workspace/${proj._id}/diary`, { method: "POST", as: "arquiteta", body: { date: new Date().toISOString(), text: "Demolição da parede da cozinha concluída." } });
    return { projectId: proj._id, hireId: hire.id, proposalId: prop.id, briefingId: b.id };
  }

  async function close() {
    console.log = log;
    await new Promise((r) => server.close(r));
    await mongoose.disconnect().catch(() => {});
    await mongod.stop().catch(() => {});
  }

  return { origin, api, people, mails, seedWorkspace, close, lastCode: () => (mails.filter((m) => /é o seu código/.test(m)).pop() || "").match(/Assunto: (\d{6})/)?.[1] };
}
