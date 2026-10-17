/**
 * Ponta a ponta, terceira parte: Pix e recibo dos honorários, RRT e
 * documentos legais, agenda (.ics, ata, lembrete), briefing do arquiteto,
 * entrega da obra com o manual da casa, avaliação verificada, login em duas
 * etapas e LGPD dos dados novos. Base: tests/e2eHarness.js.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useE2E } from "./e2eHarness.js";

const e2e = useE2E("matchia_e2e_office");
const { api, register, people } = e2e;

// e-mails simulados vão para o console: é dali que o teste lê o código de acesso
const mails = [];
const log = console.log;
console.log = (...args) => {
  const line = args.join(" ");
  if (line.startsWith("[email simulado]")) mails.push(line);
  else log(...args);
};
const lastCode = () => (mails.filter((m) => /é o seu código/.test(m)).pop() || "").match(/Assunto: (\d{6})/)?.[1];

test("Pix, recibo, documentos, agenda, briefing, manual da casa, avaliação verificada e login em duas etapas", async (t) => {
  if (e2e.skipReason) return t.skip(e2e.skipReason);
  await register("cli", "client", { name: "Bruna Cliente" });
  await register("arq", "architect", { name: "Teresa Arquiteta" });

  // ---- briefing: o arquiteto personaliza, manda pelo pedido e o cliente responde
  assert.equal((await api("/briefings/template", { as: "arq" })).data.isDefault, true);
  assert.equal((await api("/briefings/template", { method: "PUT", as: "arq", body: { questions: [{ text: "Só uma?" }] } })).status, 400);
  const tpl = await api("/briefings/template", { method: "PUT", as: "arq", body: { questions: [
    { id: "quem", text: "Quem vai morar?", required: true },
    { id: "amb", text: "Quais ambientes?", type: "multi", options: ["Sala", "Cozinha", "Home office"], required: true },
    { id: "verba", text: "Quanto pretende investir?", type: "choice", options: ["Até 100 mil", "Mais de 100 mil"] },
  ] } });
  assert.equal(tpl.data.isDefault, false);
  const proj = await api("/projects", { method: "POST", as: "cli", body: { name: "Apto da Bruna", city: "São Paulo", state: "SP" } });
  const pid = proj.data._id;
  const hire = await api("/hires", { method: "POST", as: "cli", body: { projectId: pid, architectId: people.arq.id } });
  const sent = await api("/briefings", { method: "POST", as: "arq", body: { hireId: hire.data.id, message: "Para eu entender a rotina de vocês." } });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.questions.length, 3);
  assert.equal((await api(`/briefings/${sent.data.id}/answers`, { method: "POST", as: "arq", body: { answers: {} } })).status, 403);
  assert.equal((await api(`/briefings/${sent.data.id}/answers`, { method: "POST", as: "cli", body: { answers: { quem: "Casal" } } })).status, 400);
  const answered = await api(`/briefings/${sent.data.id}/answers`, { method: "POST", as: "cli", body: { answers: { quem: "Casal e um gato", amb: ["Sala", "Home office"], verba: "Até 100 mil" } } });
  assert.equal(answered.data.status, "answered");
  assert.equal((await api(`/briefings/${sent.data.id}/answers`, { method: "POST", as: "cli", body: { answers: { quem: "x", amb: ["Sala"] } } })).status, 409);
  const draft = await api(`/proposals/draft/${hire.data.id}`, { as: "arq" });
  assert.match(draft.data.briefing.summary, /Quais ambientes\? Sala, Home office/);
  assert.equal((await api("/hires", { as: "arq" })).data[0].briefing.status, "answered");

  // ---- contrato assinado; RRT registrado em Documentos aparece junto do contrato
  const stages = [{ name: "Estudo", weeks: 2, fee: 1500 }, { name: "Executivo", weeks: 4, fee: 2500, closesDesign: true }];
  const prop = await api("/proposals", { method: "POST", as: "arq", body: { hireId: hire.data.id, stages, scope: "Projeto de interiores do apartamento inteiro.", signatureName: "Teresa Arquiteta" } });
  assert.ok(prop.data.document.clauses.some((c) => /RRT/.test(c)));
  await api(`/proposals/${prop.data.id}/sign`, { method: "POST", as: "cli", body: { agree: true, signatureName: "Bruna Cliente" } });
  let ws = await api(`/workspace/${pid}`, { as: "cli" });
  assert.equal(ws.data.legalDocs[0].key, "rrt");
  assert.equal(ws.data.briefingId, sent.data.id);
  assert.equal((await api(`/workspace/${pid}/legal-docs/rrt`, { method: "PATCH", as: "cli", body: { status: "concluido" } })).status, 403);
  ws = await api(`/workspace/${pid}/legal-docs/rrt`, { method: "PATCH", as: "arq", body: { status: "concluido", number: "8765432" } });
  assert.equal(ws.data.rrt, "8765432");
  assert.equal(ws.data.legalDocs.length, 6);
  ws = await api(`/workspace/${pid}/legal-docs`, { method: "POST", as: "arq", body: { name: "Laudo de vistoria do vizinho" } });
  const custom = ws.data.legalDocs.at(-1).key;
  assert.equal((await api(`/workspace/${pid}/legal-docs/condominio`, { method: "DELETE", as: "arq" })).status, 400);
  assert.equal((await api(`/workspace/${pid}/legal-docs/${custom}`, { method: "DELETE", as: "arq" })).data.legalDocs.length, 6);
  assert.equal((await api(`/proposals/${prop.data.id}`, { as: "cli" })).data.rrt, "8765432");

  // ---- Pix: sem chave não há QR; com chave, o QR vai direto para a conta do arquiteto
  assert.equal((await api("/architects/me/billing", { method: "PUT", as: "arq", body: { pix: { type: "cpf", key: "111.111.111-11", name: "Teresa", city: "SP" } } })).status, 400);
  const bill = await api("/architects/me/billing", { method: "PUT", as: "arq", body: { pix: { type: "email", key: "Teresa@Escritorio.com", name: "Teresa Arquiteta", city: "São Paulo" }, taxId: "529.982.247-25" } });
  assert.equal(bill.data.pix.key, "teresa@escritorio.com");
  assert.equal(bill.data.taxId, "529.982.247-25");
  const key0 = ws.data.stages[0].key;
  await api(`/workspace/${pid}/stages/${key0}/submit`, { method: "POST", as: "arq", body: {} });
  ws = await api(`/workspace/${pid}/stages/${key0}/approve`, { method: "POST", as: "cli", body: {} });
  const pix = ws.data.stages[0].pix;
  assert.match(pix.payload, /^000201.*br\.gov\.bcb\.pix.*teresa@escritorio\.com.*54071500\.00.*6009Sao Paulo/);
  assert.match(pix.qr, /^data:image\/svg\+xml;base64,/);
  assert.equal((await api(`/workspace/${pid}/stages/${key0}/receipt`, { as: "cli" })).status, 409);
  ws = await api(`/workspace/${pid}/stages/${key0}/pay`, { method: "POST", as: "cli" });
  assert.equal(ws.data.stages[0].feeStatus, "reported");
  ws = await api(`/workspace/${pid}/stages/${key0}/confirm-payment`, { method: "POST", as: "arq" });
  assert.equal(ws.data.stages[0].pix, null);
  const receipt = await api(`/workspace/${pid}/stages/${key0}/receipt`, { as: "cli" });
  assert.match(receipt.data.text, /Recebi de Bruna Cliente a importância de R\$ 1\.500,00 \(mil e quinhentos reais\).*RRT nº 8765432/);
  assert.equal(receipt.data.payeeDocument, "CPF 529.982.247-25");

  // ---- agenda: o cliente marca, o arquiteto confirma; convite .ics; ata; lembrete 24 h antes
  assert.equal((await api(`/workspace/${pid}/meetings`, { method: "POST", as: "cli", body: { startsAt: "2020-01-01T10:00:00Z" } })).status, 400);
  const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  ws = await api(`/workspace/${pid}/meetings`, { method: "POST", as: "cli", body: { kind: "visita", startsAt: soon, durationMin: 60, place: "Rua das Flores, 120" } });
  const m = ws.data.meetings[0];
  assert.equal(m.status, "pending");
  assert.equal(m.clientAnswer, "yes");
  assert.equal((await api(`/workspace/${pid}/meetings/${m.id}/answer`, { method: "POST", as: "arq", body: { answer: "no" } })).status, 400);
  ws = await api(`/workspace/${pid}/meetings/${m.id}/answer`, { method: "POST", as: "arq", body: { answer: "yes" } });
  assert.equal(ws.data.meetings[0].status, "confirmed");
  const ics = await fetch(`${e2e.base}/workspace/${pid}/meetings/${m.id}/ics`, { headers: { Authorization: `Bearer ${people.cli.token}` } });
  assert.match(ics.headers.get("content-type"), /text\/calendar/);
  assert.match(await ics.text(), /BEGIN:VEVENT[\s\S]*SUMMARY:Visita de obra — Apto da Bruna[\s\S]*LOCATION:Rua das Flores\\, 120/);
  const { sendMeetingReminders, sendMaintenanceReminders } = await import("../src/services/workspaceReminders.js");
  assert.equal(await sendMeetingReminders(), 2);
  assert.equal(await sendMeetingReminders(), 0);
  assert.equal((await api(`/workspace/${pid}/meetings/${m.id}/minutes`, { method: "POST", as: "cli", body: { minutes: "Ficou decidido tudo." } })).status, 403);
  ws = await api(`/workspace/${pid}/meetings/${m.id}/minutes`, { method: "POST", as: "arq", body: { minutes: "Medidas conferidas; a bancada fica em granito." } });
  assert.match(ws.data.meetings[0].minutes, /granito/);
  assert.ok(ws.data.activity.some((a) => /registrou a ata/.test(a.text)));

  // ---- entrega da obra: manual da casa com plano de manutenção e lembrete ao cliente
  await api(`/workspace/${pid}/library`, { method: "POST", as: "arq", body: { name: "Bancada em granito", category: "Pedras", price: 3000, warrantyMonths: 12 } });
  assert.equal((await api(`/workspace/${pid}/handover`, { method: "POST", as: "cli", body: {} })).status, 403);
  ws = await api(`/workspace/${pid}/handover`, { method: "POST", as: "arq", body: { date: new Date().toISOString() } });
  assert.ok(ws.data.handoverAt);
  assert.deepEqual(ws.data.maintenance.map((x) => x.task.slice(0, 20)), ["Limpar e desinfetar ", "Reimpermeabilizar pe"]);
  assert.equal(ws.data.library[0].warrantyMonths, 12);
  const in7months = new Date(Date.now() + 210 * 864e5);
  assert.equal(await sendMaintenanceReminders(in7months), 1);
  assert.equal(await sendMaintenanceReminders(in7months), 0);
  ws = await api(`/workspace/${pid}/maintenance/${ws.data.maintenance[0].id}/done`, { method: "POST", as: "cli" });
  assert.ok(ws.data.maintenance[0].lastDoneAt);

  // ---- avaliação verificada: no fim do projeto, pelo Espaço
  const key1 = ws.data.stages[1].key;
  await api(`/workspace/${pid}/stages/${key1}/submit`, { method: "POST", as: "arq", body: {} });
  await api(`/workspace/${pid}/stages/${key1}/approve`, { method: "POST", as: "cli", body: {} });
  const notes = await api("/notifications", { as: "cli" });
  const list = Array.isArray(notes.data) ? notes.data : notes.data.notifications || [];
  assert.ok(list.some((n) => /Deixe sua avaliação/.test(n.text)));
  ws = await api(`/workspace/${pid}/review`, { method: "POST", as: "cli", body: { rating: 5, comment: "Entregou no prazo." } });
  assert.deepEqual(ws.data.review, { rating: 5, comment: "Entregou no prazo.", verified: true });
  const pub = await api(`/reviews/${people.arq.id}`);
  assert.equal(pub.data.reviews[0].verified, true);

  // ---- login em duas etapas: liga com código; aparelho novo pede código; o desafio não vale como login
  assert.equal((await api("/dashboard/me/security", { method: "POST", as: "cli", body: { enable: true, code: "000000" } })).status, 400);
  await api("/dashboard/me/security/code", { method: "POST", as: "cli" });
  const on = await api("/dashboard/me/security", { method: "POST", as: "cli", body: { enable: true, code: lastCode(), deviceId: "aparelho-de-casa" } });
  assert.equal(on.data.twoFactor, true);
  const same = await api("/auth/login", { method: "POST", body: { email: people.cli.email, password: "Senha-e2e-123", deviceId: "aparelho-de-casa" } });
  assert.ok(same.data.token); // aparelho conhecido: entra direto
  const fresh = await api("/auth/login", { method: "POST", body: { email: people.cli.email, password: "Senha-e2e-123", deviceId: "celular-novo" } });
  assert.equal(fresh.data.twoFactor, true);
  assert.equal(fresh.data.token, undefined);
  assert.equal((await fetch(`${e2e.base}/dashboard/me`, { headers: { Authorization: `Bearer ${fresh.data.challenge}` } })).status, 401);
  assert.equal((await api("/auth/login/verify", { method: "POST", body: { challenge: fresh.data.challenge, code: "123456" } })).status, 400);
  const ok = await api("/auth/login/verify", { method: "POST", body: { challenge: fresh.data.challenge, code: lastCode() } });
  assert.ok(ok.data.token);
  assert.equal((await api("/auth/login/verify", { method: "POST", body: { challenge: fresh.data.challenge, code: lastCode() } })).status, 400); // uso único
  const sec = await api("/dashboard/me/security", { as: "cli" });
  assert.equal(sec.data.devices.length, 2);

  // aviso de acesso novo (sem duas etapas): o arquiteto entra de outro aparelho
  await api("/auth/login", { method: "POST", body: { email: people.arq.email, password: "Senha-e2e-123", deviceId: "notebook" } });
  const before = mails.length;
  await api("/auth/login", { method: "POST", body: { email: people.arq.email, password: "Senha-e2e-123", deviceId: "outro-pc" } });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(mails.slice(before).some((x) => /Novo acesso à sua conta/.test(x)));

  // ---- LGPD: o briefing e a segurança vão na exportação; a exclusão apaga o briefing
  const exp = await api("/dashboard/me/export", { as: "cli" });
  assert.equal(exp.data.briefings.length, 1);
  assert.equal(exp.data.seguranca.loginEmDuasEtapas, true);
  assert.equal(JSON.stringify(exp.data).includes(fresh.data.challenge), false);
  assert.equal(JSON.stringify(exp.data.conta).includes("devices"), false);
  assert.equal((await api("/dashboard/me", { method: "DELETE", as: "cli" })).status, 200);
  assert.equal((await api(`/briefings/${sent.data.id}`, { as: "arq" })).status, 404);
});
