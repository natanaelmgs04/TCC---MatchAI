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
