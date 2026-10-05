import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStylePicks, normalizeExperience, experienceToText, normalizeStyleNotes } from "../src/services/projectPreferences.js";

test("normalizeStylePicks: descarta estilos fora do vocabulário e itens incompletos", () => {
  const picks = normalizeStylePicks([
    { question: "Qual sala?", choice: "Sala escandinava", styles: ["Escandinavo", "Inventado"] },
    { question: "", choice: "x" },
    "lixo",
  ]);
  assert.equal(picks.length, 1);
  assert.deepEqual(picks[0].styles, ["Escandinavo"]);
  assert.deepEqual(normalizeStylePicks("nada"), []);
});

test("normalizeExperience: recorta superfícies, valida horário e limita porcentagens", () => {
  const exp = normalizeExperience({
    preset: "Intimista",
    mood: { cozy: 19.4, bright: -5, moody: 300 },
    time: "22:12",
    timeLabel: "Noite",
    surfaces: { piso: { surface: "Piso", id: "carvalho-defumado", label: "Carvalho defumado" }, "<script>": { label: "x" } },
    furniture: [{ label: "Poltrona", area: "Sala" }],
    styles: ["Moderno", "Qualquer"],
  });
  assert.deepEqual(exp.mood, { cozy: 19, bright: 0, moody: 100 });
  assert.equal(exp.time, "22:12");
  assert.equal(exp.surfaces.piso.label, "Carvalho defumado");
  assert.equal("<script>" in exp.surfaces, false);
  assert.deepEqual(exp.styles, ["Moderno"]);
});

test("normalizeExperience: horário inválido vira vazio e objeto vazio vira undefined", () => {
  assert.equal(normalizeExperience({ time: "25:99", surfaces: { piso: { label: "Carvalho" } } }).time, "");
  assert.equal(normalizeExperience({}), undefined);
  assert.equal(normalizeExperience([1, 2]), undefined);
  assert.equal(normalizeExperience(null), undefined);
});

test("experienceToText: o piso escolhido aparece no texto do prompt", () => {
  const text = experienceToText(normalizeExperience({ time: "18:24", timeLabel: "Fim de tarde", surfaces: { piso: { surface: "Piso", label: "Carvalho mel" } } }));
  assert.match(text, /Piso: Carvalho mel/);
  assert.match(text, /Fim de tarde \(18:24\)/);
  assert.equal(experienceToText(undefined), "");
});

test("normalizeStyleNotes: corta em 2000 caracteres", () => {
  assert.equal(normalizeStyleNotes("a".repeat(3000)).length, 2000);
  assert.equal(normalizeStyleNotes("   "), undefined);
});

test("normalizeExperience: guarda a cena crua para reabrir a experiência, sem lixo", () => {
  const exp = normalizeExperience({
    surfaces: { piso: { surface: "Piso", id: "carvalho-mel", label: "Carvalho mel" } },
    scene: {
      preset: "fim-de-tarde",
      surfaces: { piso: "carvalho-mel", "bad key!": "x", paredes: { $gt: "" } },
      time: 1110.4,
      furniture: { "poltrona-sala": { x: 1.23456, z: -999 }, sofa: { x: "1", z: 2 } },
    },
  });
  assert.deepEqual(exp.scene, { preset: "fim-de-tarde", surfaces: { piso: "carvalho-mel" }, time: 1110, furniture: { "poltrona-sala": { x: 1.235, z: -50 } } });
  assert.equal(normalizeExperience({ summary: "ok", scene: { surfaces: {} } }).scene, undefined);
});
