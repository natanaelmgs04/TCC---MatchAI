/**
 * Teste de ponta a ponta dos fluxos principais, com a API de verdade
 * (src/app.js) e um MongoDB temporário em memória — o mesmo pacote do banco
 * local (mongodb-memory-server-core), que já fica baixado nesta máquina.
 * Nada de rede externa: e-mail, IA e 3D desligados.
 *
 *   contratar → Espaço do projeto → honorários → etapas → arquivo + comentários
 *   → biblioteca/limites do plano → relatório → linha do tempo → LGPD → lembretes
 *
 * Sem o binário do MongoDB disponível (ex.: outra máquina sem internet), o
 * teste é pulado em vez de falhar. Para pular de propósito: SKIP_E2E=1.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

for (const k of ["BREVO_API_KEY", "EMAIL_HOST", "EMAIL_USER", "EMAIL_PASS", "GEMINI_API_KEY", "TRIPO_API_KEY", "MELTFLEX_API_KEY", "UNSPLASH_ACCESS_KEY", "ADMIN_EMAILS"]) process.env[k] = "";
process.env.JWT_SECRET = "e2e-secret-only-for-tests";
process.env.MODEL3D_DEMO = "0";

let mongod, mongoose, server, base, skipReason = null;
const people = {};

before(async () => {
  if (process.env.SKIP_E2E) { skipReason = "SKIP_E2E definido"; return; }
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server-core");
    mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 90_000 } }); // Windows + antivírus: o mongod pode demorar a subir
  } catch (err) {
    skipReason = `MongoDB em memória indisponível (${err.message.split("\n")[0]})`;
    return;
  }
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri("matchia_e2e"));
  const app = (await import("../src/app.js")).default;
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose?.disconnect().catch(() => {});
  await mongod?.stop().catch(() => {});
});

async function api(path, { method = "GET", as, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (as) h.Authorization = `Bearer ${people[as].token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (raw) h["Content-Type"] = "application/octet-stream";
  const res = await fetch(`${base}${path}`, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function register(key, role, extra = {}) {
  const email = `${key}@e2e.test`;
  const r = await api(`/auth/register/${role}`, { method: "POST", body: { name: extra.name || `${key} Teste`, email, password: "Senha-e2e-123", confirmPassword: "Senha-e2e-123", ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  people[key] = { token: r.data.token, id: r.data.user.id, email };
}

test("fluxo completo: contratação, Espaço do projeto, relatório, LGPD e lembretes", async (t) => {
  if (skipReason) return t.skip(skipReason);

  await register("cliente", "client", { name: "Clara Cliente" });
  await register("arquiteta", "architect", { name: "Ana Arquiteta" });
  await register("outro", "client", { name: "Otávio Outro" });
  await register("loja", "store", { name: "Loja Teste", storeName: "Casa & Luz" });

  // ---- contratação
  const proj = await api("/projects", { method: "POST", as: "cliente", body: { name: "Apartamento E2E", preferredStyles: ["Moderno"] } });
  assert.equal(proj.status, 201);
  const pid = proj.data._id;
  const hire = await api("/hires", { method: "POST", as: "cliente", body: { projectId: pid, architectId: people.arquiteta.id, message: "Olá!" } });
  assert.equal(hire.status, 201, JSON.stringify(hire.data));
  const accepted = await api(`/hires/${hire.data.id}/accept`, { method: "POST", as: "arquiteta", body: {} });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));

  // ---- Espaço do projeto: só os dois enxergam
  const ws = await api(`/workspace/${pid}`, { as: "cliente" });
  assert.equal(ws.status, 200);
  assert.equal(ws.data.stages.length, 4);
  assert.equal(ws.data.stages[0].status, "in_progress");
  assert.equal(ws.data.plan.tier, "free");
  assert.equal((await api(`/workspace/${pid}`, { as: "outro" })).status, 404);

  // ---- honorários + aprovação de etapa
  assert.equal((await api(`/workspace/${pid}/stages/briefing`, { method: "PATCH", as: "arquiteta", body: { fee: 1500 } })).status, 200);
  assert.equal((await api(`/workspace/${pid}/stages/briefing/submit`, { method: "POST", as: "cliente", body: {} })).status, 403);
  assert.equal((await api(`/workspace/${pid}/stages/briefing/submit`, { method: "POST", as: "arquiteta", body: { text: "Programa fechado" } })).status, 200);
  assert.equal((await api(`/workspace/${pid}/stages/briefing/request-changes`, { method: "POST", as: "cliente", body: { text: "" } })).status, 400);
  const approved = await api(`/workspace/${pid}/stages/briefing/approve`, { method: "POST", as: "cliente", body: {} });
  assert.equal(approved.data.stages[0].status, "approved");
  assert.equal(approved.data.stages[0].feeStatus, "due");
  assert.equal(approved.data.stages[1].status, "in_progress");
  assert.equal((await api(`/workspace/${pid}/stages/briefing`, { method: "PATCH", as: "arquiteta", body: { fee: 9 } })).status, 409);
  assert.equal((await api(`/workspace/${pid}/stages/briefing/pay`, { method: "POST", as: "arquiteta" })).status, 403);
  const paid = await api(`/workspace/${pid}/stages/briefing/pay`, { method: "POST", as: "cliente" });
  assert.equal(paid.data.stages[0].feeStatus, "paid");
  assert.deepEqual([paid.data.fees.paid, paid.data.fees.due], [1500, 0]);

  // ---- arquivo técnico + comentários marcados
  const pdf = Buffer.from("%PDF-1.4\n% planta e2e\n%%EOF");
  const fake = await api(`/workspace/${pid}/files?stage=anteprojeto`, { method: "POST", as: "arquiteta", raw: Buffer.from("<html>"), headers: { "X-File-Name": "planta.pdf" } });
  assert.equal(fake.status, 400);
  const up = await api(`/workspace/${pid}/files?stage=anteprojeto`, { method: "POST", as: "arquiteta", raw: pdf, headers: { "X-File-Name": encodeURIComponent("Planta térreo.pdf") } });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const fid = up.data.files[0].id;
  const dl = await fetch(`${base}/workspace/${pid}/files/${fid}`, { headers: { Authorization: `Bearer ${people.cliente.token}` } });
  assert.equal(dl.headers.get("content-disposition").startsWith("attachment"), true);
  assert.equal(Buffer.from(await dl.arrayBuffer()).equals(pdf), true);
  assert.equal((await api(`/workspace/${pid}/files/${fid}/annotations`, { method: "POST", as: "cliente", body: { x: 2, y: 0.5, text: "fora" } })).status, 400);
  const note = await api(`/workspace/${pid}/files/${fid}/annotations`, { method: "POST", as: "cliente", body: { x: 0.4, y: 0.6, page: 1, text: "Abrir esta parede para a cozinha" } });
  assert.equal(note.status, 201);
  const aid = note.data.annotations[0].id;
  assert.equal((await api(`/workspace/${pid}/files/${fid}/annotations/${aid}`, { method: "DELETE", as: "arquiteta" })).status, 403);
  const resolved = await api(`/workspace/${pid}/files/${fid}/annotations/${aid}`, { method: "PATCH", as: "arquiteta", body: { resolved: true } });
  assert.equal(resolved.data.annotations[0].resolved, true);

  // ---- biblioteca: limite do plano Gratuito (20 itens) e lista de compras
  for (let i = 1; i <= 20; i++) {
    const r = await api(`/workspace/${pid}/library`, { method: "POST", as: "arquiteta", body: { name: `Item ${i}`, storeName: i % 2 ? "Loja A" : "Loja B", price: 100, quantity: 2 } });
    assert.equal(r.status, 200, `item ${i}: ${JSON.stringify(r.data)}`);
  }
  const over = await api(`/workspace/${pid}/library`, { method: "POST", as: "arquiteta", body: { name: "Item 21" } });
  assert.equal(over.status, 409);
  const full = await api(`/workspace/${pid}`, { as: "cliente" });
  assert.equal(full.data.totals.total, 4000);
  assert.equal((await api(`/workspace/${pid}/library`, { method: "POST", as: "cliente", body: { name: "x" } })).status, 403);

  // ---- relatório de resultado da arquiteta
  const rep = await api("/workspace/report/me", { as: "arquiteta" });
  assert.equal(rep.status, 200);
  assert.equal(rep.data.projects, 1);
  assert.equal(rep.data.fees.paid, 1500);
  assert.equal(rep.data.stageAverages[0].key, "briefing");

  // ---- linha do tempo do chat leva ao Espaço depois da contratação
  const tl = await api(`/timeline/${people.arquiteta.id}`, { as: "cliente" });
  assert.equal(tl.data.workspace.id, pid);
  assert.equal((await api(`/timeline/${people.arquiteta.id}/advance`, { method: "POST", as: "cliente" })).status, 409);

  // ---- LGPD: a loja só vê o contato com consentimento, e o cliente revoga
  const prod = await api("/stores/me/products", { method: "POST", as: "loja", body: { name: "Pendente de latão", price: 450 } });
  assert.equal(prod.status, 201);
  await api("/stores/referrals", { method: "POST", as: "cliente", body: { productId: prod.data._id, projectId: pid } });
  let refs = await api("/stores/me/referrals", { as: "loja" });
  assert.equal(refs.data.referrals[0].clientName, null);
  await api("/stores/referrals", { method: "POST", as: "cliente", body: { productId: prod.data._id, projectId: pid, shareContact: true } });
  refs = await api("/stores/me/referrals", { as: "loja" });
  assert.equal(refs.data.referrals.filter((r) => r.clientName === "Clara Cliente").length, 1);
  assert.equal((await api("/stores/consents", { as: "cliente" })).data.length, 1);
  await api("/stores/consents/revoke", { method: "POST", as: "cliente" });
  refs = await api("/stores/me/referrals", { as: "loja" });
  assert.equal(refs.data.referrals.every((r) => r.clientName === null && r.clientEmail === null), true);

  // ---- lembretes de prazo: uma vez por prazo
  const yesterday = new Date(Date.now() - 864e5).toISOString();
  assert.equal((await api(`/workspace/${pid}/stages/anteprojeto`, { method: "PATCH", as: "arquiteta", body: { dueDate: yesterday } })).status, 200);
  const { sendDueReminders } = await import("../src/services/workspaceReminders.js");
  assert.ok((await sendDueReminders()) >= 2); // atrasada: avisa os dois
  assert.equal(await sendDueReminders(), 0);
  const notes = await api("/notifications", { as: "cliente" });
  const list = Array.isArray(notes.data) ? notes.data : notes.data.notifications || [];
  assert.ok(list.some((n) => /passou do prazo/.test(n.text)));
});
