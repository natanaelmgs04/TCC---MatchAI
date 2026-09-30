import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeImages,
  buildHistory,
  findMentionedProducts,
  normalizeBriefing,
  briefingToMessage,
  escapeHtml,
} from "../src/services/assistantService.js";

const okImage = { mime: "image/jpeg", data: "QUJD", thumb: "data:image/jpeg;base64,QUJD" };

test("sanitizeImages: aceita foto válida e devolve lista vazia sem fotos", () => {
  assert.deepEqual(sanitizeImages(undefined), { images: [] });
  assert.deepEqual(sanitizeImages([okImage]).images[0], okImage);
});

test("sanitizeImages: recusa tipo, base64 e quantidade inválidos", () => {
  assert.ok(sanitizeImages([{ ...okImage, mime: "image/svg+xml" }]).error);
  assert.ok(sanitizeImages([{ ...okImage, data: "não é base64!" }]).error);
  assert.ok(sanitizeImages([{ ...okImage, data: "A".repeat(1_400_001) }]).error);
  assert.ok(sanitizeImages([okImage, okImage, okImage, okImage]).error);
  assert.ok(sanitizeImages("x").error);
});

test("sanitizeImages: miniatura inválida vira vazia em vez de rejeitar a foto", () => {
  const r = sanitizeImages([{ ...okImage, thumb: "javascript:alert(1)" }]);
  assert.equal(r.images[0].thumb, "");
});

test("buildHistory: começa em 'user', alterna papéis e termina em 'model'", () => {
  const h = buildHistory([
    { role: "model", text: "oi" },
    { role: "user", text: "a" },
    { role: "user", text: "b" },
    { role: "model", text: "c" },
    { role: "user", text: "pendente" },
  ]);
  assert.deepEqual(h.map((t) => t.role), ["user", "model"]);
  assert.equal(h[0].parts[0].text, "a\nb");
});

test("findMentionedProducts: só devolve produtos citados pelo nome", () => {
  const catalog = [{ name: "Piso Vinílico Carvalho" }, { name: "Luminária Arco" }];
  const found = findMentionedProducts("Que tal o piso vinílico carvalho na sala?", catalog);
  assert.deepEqual(found.map((p) => p.name), ["Piso Vinílico Carvalho"]);
  assert.deepEqual(findMentionedProducts("nada aqui", catalog), []);
});

test("normalizeBriefing: só chaves conhecidas, sempre string, com fallback", () => {
  const b = normalizeBriefing({ resumo: "  Sala  ", objetivos: ["a", "b"], intruso: "x" });
  assert.equal(b.resumo, "Sala");
  assert.equal(b.objetivos, "a; b");
  assert.equal(b.orcamento, "Não informado.");
  assert.equal("intruso" in b, false);
});

test("briefingToMessage: cabe no limite de 2000 caracteres do Message", () => {
  const big = normalizeBriefing(Object.fromEntries(["resumo", "objetivos", "estiloEMateriais", "orcamento", "restricoes"].map((k) => [k, "x".repeat(900)])));
  const text = briefingToMessage(big, { clientName: "Ana", projectName: "Apê" });
  assert.ok(text.length <= 2000);
  assert.match(text, /Ana/);
  assert.match(text, /Resumo:/);
});

test("escapeHtml neutraliza marcação", () => {
  assert.equal(escapeHtml('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");
});
