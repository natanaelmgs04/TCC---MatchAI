import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContractDocument, documentHash, normalizeProposalInput, signatureMatches } from "../src/services/contractRules.js";
import { STAGE_TEMPLATES, canReplaceStages, defaultStages, normalizeStageList, stagesFromTemplate, targetDate, weeksToClose, normalizeQuote, normalizeDiaryEntry, normalizeCrewInput, normalizeTrades, buildReport } from "../src/services/workspaceRules.js";

test("assinatura: nome completo da conta, sem diferença de acento ou maiúscula", () => {
  assert.equal(signatureMatches("  patricia andrade   COSTA ", "Patrícia Andrade Costa"), true);
  assert.equal(signatureMatches("Patrícia", "Patrícia Andrade Costa"), false);
  assert.equal(signatureMatches("", "Ana"), false);
});

test("contrato: total das etapas e código muda se o texto muda", () => {
  const base = { project: { name: "Casa", propertyType: "Casa", areaM2: 120, city: "Santos", state: "SP" }, client: { name: "Clara" }, architect: { name: "Ana" }, scope: "Projeto completo da casa de praia.", paymentTerms: "", validUntil: new Date("2026-11-01"), version: 1 };
  const doc = buildContractDocument({ ...base, stages: [{ name: "A", weeks: 2, fee: 1000 }, { name: "B", weeks: 0, fee: 500.5, closesDesign: true }] });
  assert.equal(doc.total, 1500.5);
  assert.match(doc.object, /Santos\/SP/);
  const other = buildContractDocument({ ...base, scope: "Projeto completo da casa de praia!", stages: [{ name: "A", weeks: 2, fee: 1000 }, { name: "B", weeks: 0, fee: 500.5, closesDesign: true }] });
  assert.notEqual(documentHash(doc), documentHash(other));
  assert.equal(documentHash(doc), documentHash(JSON.parse(JSON.stringify(doc))));
  assert.ok(normalizeProposalInput({ scope: "curto" }).error);
  assert.ok(normalizeProposalInput({ scope: "Escopo completo do projeto residencial.", validDays: 90 }).error);
});

test("modelos de etapas: meta até a etapa que fecha o projeto, chaves únicas", () => {
  assert.equal(weeksToClose(STAGE_TEMPLATES.residencial.stages), 12);
  assert.equal(weeksToClose(STAGE_TEMPLATES.corporativo.stages), 12);
  const st = stagesFromTemplate([{ name: "Etapa", weeks: 1 }, { name: "Etapa", weeks: 2, fee: 300 }, { name: "Obra", weeks: 0 }], new Date("2026-01-01T00:00:00Z"));
  assert.notEqual(st[0].key, st[1].key);
  assert.equal(st[1].closesDesign, true); // sem marcação: a última com prazo fecha o projeto
  assert.equal(st[1].fee, 300);
  assert.equal(targetDate(new Date("2026-01-01T00:00:00Z"), [{ weeks: 1 }, { weeks: 2, closesDesign: true }, { weeks: 5 }]).toISOString().slice(0, 10), "2026-01-22");
  const d = defaultStages();
  assert.equal(canReplaceStages(d), true);
  d[0].submittedAt = new Date();
  assert.equal(canReplaceStages(d), false);
  assert.ok(normalizeStageList([{ name: "Só uma" }]).error);
  assert.ok(normalizeStageList([{ name: "A", closesDesign: true }, { name: "B", closesDesign: true }]).error);
});

test("relatório usa a etapa marcada como 'fecha o projeto' em qualquer modelo", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const stages = stagesFromTemplate(STAGE_TEMPLATES.interiores.stages, start).map((s) => ({ ...s, status: "approved", approvedAt: new Date(start.getTime() + 50 * 864e5) }));
  const r = buildReport([{ name: "I", workspaceStartedAt: start, targetDate: targetDate(start, STAGE_TEMPLATES.interiores.stages), stages }]);
  assert.equal(r.closed, 1);
  assert.equal(r.avgDaysToClose, 50);
});

test("obra: cotação, diário, prestador e ofícios validados", () => {
  assert.ok(normalizeQuote({ storeName: "Loja", price: 0 }).error);
  assert.equal(normalizeQuote({ storeName: "Loja", price: "99.9", purchaseUrl: "javascript:x" }).quote.purchaseUrl, undefined);
  assert.ok(normalizeDiaryEntry({ text: "ok" }).error);
  assert.ok(normalizeDiaryEntry({ text: "Concretagem da laje", date: new Date(Date.now() + 5 * 864e5).toISOString() }).error);
  assert.ok(normalizeCrewInput({ name: "Zé", trade: "Astronauta" }).error);
  assert.deepEqual(normalizeTrades(["Elétrica", "Elétrica", "x"]), ["Elétrica"]);
});
