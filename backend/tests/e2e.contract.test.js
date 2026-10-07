/**
 * Ponta a ponta, segunda parte: proposta e contrato assinados pelos dois,
 * modelos de etapas, equipe do escritório, diário de obra, cotações,
 * prestadores de serviço e LGPD (exportação e exclusão de conta).
 * Base (banco em memória, API, cadastro): tests/e2eHarness.js.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useE2E } from "./e2eHarness.js";

const e2e = useE2E("matchia_e2e_contract");
const { api, register, people } = e2e;

test("contrato assinado pelos dois, modelos, equipe, diário, cotações, prestadores e LGPD", async (t) => {
  if (e2e.skipReason) return t.skip(e2e.skipReason);
  await register("cliente2", "client", { name: "Bruno Cliente" });
  await register("outro", "client", { name: "Otávio Outro" });
  await register("arq2", "architect", { name: "Carla Arquiteta" });
  await register("colega", "architect", { name: "Diego Colega" });
  await register("marceneiro", "store", { name: "Eva Marceneira", storeName: "Marcenaria Eva", partnerKind: "service", trades: ["Marcenaria"], city: "Santos", state: "SP" });
  await register("loja2", "store", { name: "Loja Dois", storeName: "Luz & Cia" });

  // ---- proposta: o arquiteto assina com o nome; o cliente pede mudança; nova versão; o cliente assina
  const proj = await api("/projects", { method: "POST", as: "cliente2", body: { name: "Loja do Bruno", city: "Santos", state: "SP" } });
  const pid = proj.data._id;
  const hire = await api("/hires", { method: "POST", as: "cliente2", body: { projectId: pid, architectId: people.arq2.id } });
  const draft = await api(`/proposals/draft/${hire.data.id}`, { as: "arq2" });
  assert.equal(draft.status, 200);
  assert.ok(draft.data.templates.some((x) => x.id === "comercial"));
  const stages = [{ name: "Estudo", weeks: 2, fee: 2000 }, { name: "Executivo", weeks: 4, fee: 3000, closesDesign: true }, { name: "Obra", weeks: 0, fee: 0 }];
  const body = { hireId: hire.data.id, stages, scope: "Projeto de interiores da loja, com executivo e acompanhamento da obra.", validDays: 10 };
  assert.equal((await api("/proposals", { method: "POST", as: "arq2", body: { ...body, signatureName: "Outra Pessoa" } })).status, 400);
  const v1 = await api("/proposals", { method: "POST", as: "arq2", body: { ...body, signatureName: "carla arquiteta" } });
  assert.equal(v1.status, 201, JSON.stringify(v1.data));
  assert.equal(v1.data.document.total, 5000);
  assert.equal((await api(`/proposals/${v1.data.id}`, { as: "outro" })).status, 404);
  assert.equal((await api(`/proposals/${v1.data.id}/decline`, { method: "POST", as: "cliente2", body: { reason: "Prefiro pagar em 3 vezes." } })).data.status, "declined");
  const v2 = await api("/proposals", { method: "POST", as: "arq2", body: { ...body, paymentTerms: "Em 3 parcelas.", signatureName: "Carla Arquiteta" } });
  assert.equal(v2.data.version, 2);
  assert.equal((await api(`/proposals/${v2.data.id}/sign`, { method: "POST", as: "cliente2", body: { agree: true, signatureName: "Bruno" } })).status, 400);
  assert.equal((await api(`/proposals/${v2.data.id}/sign`, { method: "POST", as: "cliente2", body: { agree: false, signatureName: "Bruno Cliente" } })).status, 400);
  const signed = await api(`/proposals/${v2.data.id}/sign`, { method: "POST", as: "cliente2", body: { agree: true, signatureName: "Bruno Cliente" } });
  assert.equal(signed.status, 200, JSON.stringify(signed.data));
  assert.equal(signed.data.status, "signed");
  assert.equal(signed.data.clientSignature.name, "Bruno Cliente");
  assert.equal(signed.data.architectSignature.ip, undefined); // o IP fica guardado, mas não é exposto
  // a contratação fechou e o Espaço nasceu com as etapas e os honorários do contrato
  const ws = await api(`/workspace/${pid}`, { as: "arq2" });
  assert.deepEqual(ws.data.stages.map((s) => [s.name, s.fee]), [["Estudo", 2000], ["Executivo", 3000], ["Obra", 0]]);
  assert.equal(ws.data.contractId, v2.data.id);
  assert.equal(ws.data.canChangeTemplate, true);
  assert.equal((await api(`/proposals/${v2.data.id}/sign`, { method: "POST", as: "cliente2", body: { agree: true, signatureName: "Bruno Cliente" } })).status, 409);
  const hires = await api("/hires", { as: "cliente2" });
  assert.equal(hires.data[0].status, "accepted");
  assert.equal(hires.data[0].proposal.status, "signed");

  // ---- modelos de etapas: salvar o próprio e aplicar
  const saved = await api("/workspace/templates/me", { method: "POST", as: "arq2", body: { name: "Loja rápida", stages: [{ name: "Briefing", weeks: 1 }, { name: "Projeto", weeks: 3, closesDesign: true }] } });
  assert.equal(saved.status, 201);
  const applied = await api(`/workspace/${pid}/stages/template`, { method: "POST", as: "arq2", body: { template: saved.data.mine[0].id } });
  assert.deepEqual(applied.data.stages.map((s) => s.name), ["Briefing", "Projeto"]);
  await api(`/workspace/${pid}/stages/template`, { method: "POST", as: "arq2", body: { template: "comercial" } });

  // ---- equipe do escritório: o colega entra, vê e trabalha; não mexe em honorários
  assert.equal((await api(`/workspace/${pid}`, { as: "colega" })).status, 404);
  assert.equal((await api(`/workspace/${pid}/team`, { method: "POST", as: "arq2", body: { email: "naoexiste@e2e.test" } })).status, 404);
  assert.equal((await api(`/workspace/${pid}/team`, { method: "POST", as: "arq2", body: { email: people.colega.email } })).status, 200);
  const asTeam = await api(`/workspace/${pid}`, { as: "colega" });
  assert.equal(asTeam.status, 200);
  assert.equal(asTeam.data.isOwner, false);
  const firstKey = asTeam.data.stages[0].key;
  assert.equal((await api(`/workspace/${pid}/stages/${firstKey}`, { method: "PATCH", as: "colega", body: { fee: 999 } })).status, 403);
  assert.equal((await api(`/workspace/${pid}/stages/${firstKey}/submit`, { method: "POST", as: "colega", body: {} })).status, 200);
  assert.ok((await api("/architect-projects", { as: "colega" })).data.some((p) => String(p._id) === pid && p.asTeam));

  // ---- diário de obra com foto (só imagem; não aparece em Arquivos)
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  assert.equal((await api(`/workspace/${pid}/files?kind=diary`, { method: "POST", as: "arq2", raw: Buffer.from("%PDF-1.4\n%%EOF"), headers: { "X-File-Name": "x.pdf" } })).status, 400);
  const photo = await api(`/workspace/${pid}/files?kind=diary`, { method: "POST", as: "arq2", raw: png, headers: { "X-File-Name": "laje.png" } });
  assert.ok(photo.data.uploaded);
  assert.equal(photo.data.files.some((f) => f.name === "laje.png"), false);
  const diary = await api(`/workspace/${pid}/diary`, { method: "POST", as: "arq2", body: { text: "Concretagem da laje do mezanino.", files: [photo.data.uploaded] } });
  assert.equal(diary.data.diary[0].files.length, 1);
  assert.equal((await api(`/workspace/${pid}/diary/${diary.data.diary[0].id}`, { method: "DELETE", as: "cliente2" })).status, 403);

  // ---- cotações: catálogo + manual; a escolhida vira o preço da lista
  const prod = await api("/stores/me/products", { method: "POST", as: "loja2", body: { name: "Pendente Latão Grande", price: 890, category: "Iluminação" } });
  const lib = await api(`/workspace/${pid}/library`, { method: "POST", as: "arq2", body: { name: "Pendente latão", category: "Iluminação", storeName: "Loja X", price: 1200, quantity: 2 } });
  const itemId = lib.data.library[0].id;
  const hints = await api(`/workspace/${pid}/library/${itemId}/quote-suggestions`, { as: "cliente2" });
  assert.ok(hints.data.some((h) => h.id === prod.data._id));
  await api(`/workspace/${pid}/library/${itemId}/quotes`, { method: "POST", as: "cliente2", body: { productId: prod.data._id } });
  const q2 = await api(`/workspace/${pid}/library/${itemId}/quotes`, { method: "POST", as: "arq2", body: { storeName: "Loja Y", price: 950 } });
  const cheap = q2.data.library[0].quotes.find((q) => q.storeName === "Luz & Cia");
  const chosen = await api(`/workspace/${pid}/library/${itemId}/quotes/${cheap.id}/choose`, { method: "POST", as: "cliente2" });
  assert.equal(chosen.data.library[0].price, 890);
  assert.equal(chosen.data.library[0].storeName, "Luz & Cia");
  assert.equal(chosen.data.totals.total, 1780);

  // ---- prestadores: diretório, indicação e avaliação no fim do serviço
  const dir = await api("/stores/providers?trade=Marcenaria&state=SP", { as: "arq2" });
  assert.equal(dir.data[0].name, "Marcenaria Eva");
  assert.equal((await api("/stores/providers", { as: "cliente2" })).status, 403);
  const crew = await api(`/workspace/${pid}/crew`, { method: "POST", as: "arq2", body: { providerId: people.marceneiro.id, trade: "Marcenaria" } });
  const cid = crew.data.crew[0].id;
  assert.equal((await api(`/workspace/${pid}/crew/${cid}`, { method: "PATCH", as: "arq2", body: { rating: 5 } })).status, 409);
  await api(`/workspace/${pid}/crew/${cid}`, { method: "PATCH", as: "arq2", body: { status: "concluido" } });
  await api(`/workspace/${pid}/crew/${cid}`, { method: "PATCH", as: "arq2", body: { rating: 5 } });
  const mine = await api("/stores/me/crew", { as: "marceneiro" });
  assert.equal(mine.data.requests[0].architect, "Carla Arquiteta");
  assert.equal(mine.data.requests[0].where, "Santos/SP");
  assert.equal(JSON.stringify(mine.data).includes("Bruno"), false); // nada do cliente (LGPD)
  assert.deepEqual(mine.data.rating, { avg: 5, count: 1 });

  // ---- LGPD: exportação completa e exclusão sem deixar rastro nos projetos dos outros
  const fid = (await api(`/workspace/${pid}/files`, { method: "POST", as: "arq2", raw: Buffer.from("%PDF-1.4\n%%EOF"), headers: { "X-File-Name": "planta.pdf" } })).data.uploaded;
  await api(`/workspace/${pid}/files/${fid}/annotations`, { method: "POST", as: "colega", body: { x: 0.5, y: 0.5, text: "Conferir esta medida" } });
  const exp = await api("/dashboard/me/export", { as: "cliente2" });
  assert.equal(exp.data.propostasEContratos.length, 2);
  assert.ok(exp.data.contratacoes.length >= 1);
  const expColega = await api("/dashboard/me/export", { as: "colega" });
  assert.equal(expColega.data.comentariosEmArquivos[0].texto, "Conferir esta medida");
  assert.equal((await api("/dashboard/me", { method: "DELETE", as: "colega" })).status, 200);
  const after = await api(`/workspace/${pid}/files/${fid}/annotations`, { as: "arq2" });
  assert.equal(after.data.annotations.length, 0);
  assert.equal((await api(`/workspace/${pid}`, { as: "arq2" })).data.team.length, 0);
});
