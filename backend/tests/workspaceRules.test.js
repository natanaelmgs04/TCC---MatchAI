import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TARGET_WEEKS, applyStageAction, defaultStages, deriveSignature, normalizeCustomItem, normalizeSignature,
  shoppingTotals, signatureToText, summarizeStages,
} from "../src/services/workspaceRules.js";
import { checkUpload } from "../src/services/projectFileStore.js";
import { fallbackLibraryConcept } from "../src/services/geminiService.js";

test("etapas padrão: 12 semanas até o executivo, a primeira já em andamento", () => {
  const start = new Date("2026-01-05T00:00:00Z");
  const st = defaultStages(start);
  assert.equal(TARGET_WEEKS, 12);
  assert.deepEqual(st.map((s) => s.status), ["in_progress", "pending", "pending", "pending"]);
  assert.equal(st[2].dueDate.toISOString(), new Date(start.getTime() + 12 * 7 * 864e5).toISOString());
  assert.equal(st[3].dueDate, undefined);
});

test("fluxo de aprovação: arquiteto envia, cliente pede ajuste, arquiteto reenvia, cliente aprova", () => {
  const st = defaultStages();
  assert.equal(applyStageAction(st, "briefing", "approve", "client").status, 409); // ainda não foi enviada
  assert.equal(applyStageAction(st, "briefing", "submit", "client").status, 403);
  applyStageAction(st, "briefing", "submit", "architect");
  assert.equal(st[0].status, "awaiting_approval");
  applyStageAction(st, "briefing", "request_changes", "client");
  assert.equal(st[0].status, "in_progress");
  assert.equal(st[0].revisionRounds, 1);
  applyStageAction(st, "briefing", "submit", "architect");
  const r = applyStageAction(st, "briefing", "approve", "client");
  assert.equal(st[0].status, "approved");
  assert.equal(r.next.key, "anteprojeto");
  assert.equal(st[1].status, "in_progress");
  const sum = summarizeStages(st);
  assert.equal(sum.current, "anteprojeto");
  assert.equal(sum.revisionRounds, 1);
  assert.equal(sum.progress, 25);
});

test("aprovar a última etapa fecha o projeto", () => {
  const st = defaultStages();
  let last;
  for (const s of st) {
    applyStageAction(st, s.key, "submit", "architect");
    last = applyStageAction(st, s.key, "approve", "client");
  }
  assert.equal(last.done, true);
});

test("item próprio: nome obrigatório, link só http(s), preço e quantidade limitados", () => {
  assert.ok(normalizeCustomItem({}).error);
  const { item } = normalizeCustomItem({ name: " Bancada em quartzo ", purchaseUrl: "javascript:alert(1)", price: "1234.567", quantity: -3 });
  assert.equal(item.name, "Bancada em quartzo");
  assert.equal(item.purchaseUrl, undefined);
  assert.equal(item.price, 1234.57);
  assert.equal(item.quantity, 0.01);
});

test("lista de compras: subtotal por loja, item sem preço não soma, comprado sai do pendente", () => {
  const t = shoppingTotals([
    { storeName: "Loja A", price: 100, quantity: 2 },
    { storeName: "Loja A", price: 50, quantity: 1, purchased: true },
    { storeName: "Loja B", price: null },
  ]);
  assert.equal(t.total, 250);
  assert.equal(t.pending, 200);
  assert.equal(t.stores.find((s) => s.store === "Loja B").withoutPrice, 1);
});

test("assinatura: limpa listas e junta com o que se repete no portfólio", () => {
  const sig = normalizeSignature({ statement: "Luz natural primeiro.", principles: "a, b, a", avoid: ["porcelanato polido"] });
  assert.deepEqual(sig.principles, ["a", "b"]);
  const derived = deriveSignature([{ styles: ["Moderno"], materials: ["Madeira"] }, { styles: ["Moderno"], materials: [] }]);
  assert.deepEqual(derived.styles[0], { name: "Moderno", count: 2 });
  const text = signatureToText(sig, derived);
  assert.match(text, /evita: porcelanato polido/);
  assert.match(text, /Moderno/);
});

test("upload: extensão e conteúdo precisam bater", () => {
  assert.ok(checkUpload("planta.exe", Buffer.from("x")).error);
  assert.ok(checkUpload("planta.pdf", Buffer.from("<html>")).error);
  const ok = checkUpload("../planta:final.pdf", Buffer.from("%PDF-1.7 ..."));
  assert.equal(ok.name, "..plantafinal.pdf");
  assert.equal(ok.mime, "application/pdf");
  assert.equal(checkUpload("corte.dwg", Buffer.from("AC1032")).ext, "dwg");
});

test("conceito sem IA usa só a biblioteca, agrupada por ambiente", () => {
  const text = fallbackLibraryConcept({
    project: { name: "Casa de campo", preferredStyles: ["Rústico"] },
    library: [{ name: "Sofá Linho", room: "Sala" }, { name: "Piso de demolição" }],
    architectName: "Teresa",
  });
  assert.match(text, /Sala: Sofá Linho/);
  assert.match(text, /Geral: Piso de demolição/);
});

import { dueReminders, normalizeFee, payFee, canEditFee, feeTotals, buildReport, normalizeAnnotation } from "../src/services/workspaceRules.js";

test("lembretes: 3 dias antes para quem está com a etapa, atraso para os dois, uma vez cada", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const st = [
    { key: "a", status: "in_progress", dueDate: new Date("2026-03-12T12:00:00Z") },
    { key: "b", status: "awaiting_approval", dueDate: new Date("2026-03-11T12:00:00Z") },
    { key: "c", status: "in_progress", dueDate: new Date("2026-03-09T12:00:00Z") },
    { key: "d", status: "approved", dueDate: new Date("2026-03-01T12:00:00Z") },
    { key: "e", status: "in_progress", dueDate: new Date("2026-03-30T12:00:00Z") },
    { key: "f", status: "in_progress", dueDate: new Date("2026-03-09T12:00:00Z"), remindedLateAt: now },
  ];
  const r = dueReminders(st, now);
  assert.deepEqual(r.map((x) => [x.key, x.kind, x.to.join("+")]), [["a", "soon", "architect"], ["b", "soon", "client"], ["c", "late", "architect+client"]]);
});

test("honorários: valor válido, cobrança abre ao aprovar, só o cliente paga e não muda depois", () => {
  assert.equal(normalizeFee(""), 0);
  assert.equal(normalizeFee("-1"), null);
  assert.equal(normalizeFee("1500.555"), 1500.56);
  const st = defaultStages();
  st[0].fee = 1000;
  applyStageAction(st, "briefing", "submit", "architect");
  applyStageAction(st, "briefing", "approve", "client");
  assert.equal(st[0].feeStatus, "due");
  assert.equal(canEditFee(st[0]), false);
  assert.equal(payFee(st[0], "architect").status, 403);
  assert.equal(payFee(st[0], "client").stage.feeStatus, "paid");
  assert.equal(payFee(st[0], "client").status, 409);
  st[1].fee = 2000;
  assert.deepEqual(feeTotals(st), { total: 3000, paid: 1000, due: 0, upcoming: 2000 });
});

test("relatório: dias até o executivo, meta e rodadas de ajuste", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const d = (n) => new Date(start.getTime() + n * 864e5);
  const stages = [
    { key: "briefing", name: "Briefing", status: "approved", approvedAt: d(10), revisionRounds: 1 },
    { key: "anteprojeto", name: "Anteprojeto", status: "approved", approvedAt: d(40) },
    { key: "executivo", name: "Executivo", status: "approved", approvedAt: d(80) },
    { key: "obra", name: "Obra", status: "in_progress" },
  ];
  const r = buildReport([
    { _id: "p1", name: "A", workspaceStartedAt: start, targetDate: d(84), stages },
    { _id: "p2", name: "B", workspaceStartedAt: start, targetDate: d(84), stages: [{ key: "briefing", name: "Briefing", status: "in_progress", dueDate: d(5) }] },
  ], d(20));
  assert.equal(r.projects, 2);
  assert.equal(r.closed, 1);
  assert.equal(r.avgDaysToClose, 80);
  assert.equal(r.onTargetRate, 100);
  assert.equal(r.avgRevisionRounds, 0.5);
  assert.equal(r.noReworkRate, 50);
  assert.equal(r.lateNow, 1);
  assert.deepEqual(r.stageAverages.map((s) => [s.key, s.avgDays]), [["briefing", 10], ["anteprojeto", 30], ["executivo", 40]]);
});

test("comentário no arquivo: ponto dentro do arquivo e texto obrigatórios", () => {
  assert.ok(normalizeAnnotation({ x: 0.5, y: 0.5 }).error);
  assert.ok(normalizeAnnotation({ x: 1.2, y: 0.5, text: "a" }).error);
  assert.deepEqual(normalizeAnnotation({ x: "0.123456", y: 0, page: "3", text: " Abrir aqui " }).annotation, { page: 3, x: 0.1235, y: 0, text: "Abrir aqui" });
});
