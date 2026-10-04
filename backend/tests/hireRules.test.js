import { test } from "node:test";
import assert from "node:assert/strict";
import { canRequestHire, canDecideHire, publicProjectTitle } from "../src/services/hireRules.js";

const client = "c1";
const architect = { _id: "a1", role: "architect" };
const project = { client: "c1", name: "Casa", propertyType: "Apartamento", preferredStyles: ["Moderno"] };

test("canRequestHire: libera o pedido do dono do projeto para um arquiteto", () => {
  assert.equal(canRequestHire({ project, architect, clientId: client }), null);
});

test("canRequestHire: barra projeto de outra pessoa e quem não é arquiteto", () => {
  assert.equal(canRequestHire({ project, architect, clientId: "outro" }).status, 404);
  assert.equal(canRequestHire({ project, architect: { _id: "x", role: "client" }, clientId: client }).status, 404);
  assert.equal(canRequestHire({ project: null, architect, clientId: client }).status, 404);
});

test("canRequestHire: um pedido aberto por projeto e nada depois de contratado", () => {
  const same = canRequestHire({ project, architect, openHire: { architect: "a1" }, clientId: client });
  assert.equal(same.status, 409);
  assert.match(same.error, /Aguarde/);
  const other = canRequestHire({ project, architect, openHire: { architect: "a2" }, clientId: client });
  assert.match(other.error, /Cancele/);
  assert.equal(canRequestHire({ project, architect, acceptedHire: {}, clientId: client }).status, 409);
  assert.equal(canRequestHire({ project: { ...project, architect: "a9" }, architect, clientId: client }).status, 409);
});

test("canDecideHire: só o arquiteto do pedido aceita/recusa e só o cliente cancela", () => {
  const hire = { client: "c1", architect: "a1", status: "pending" };
  assert.equal(canDecideHire(hire, { action: "accept", userId: "a1", role: "architect" }), null);
  assert.equal(canDecideHire(hire, { action: "decline", userId: "a1", role: "architect" }), null);
  assert.equal(canDecideHire(hire, { action: "cancel", userId: "c1", role: "client" }), null);
  assert.equal(canDecideHire(hire, { action: "accept", userId: "a2", role: "architect" }).status, 404);
  assert.equal(canDecideHire(hire, { action: "accept", userId: "c1", role: "client" }).status, 404);
  assert.equal(canDecideHire(hire, { action: "cancel", userId: "a1", role: "architect" }).status, 404);
  assert.equal(canDecideHire(null, { action: "accept", userId: "a1", role: "architect" }).status, 404);
});

test("canDecideHire: pedido já respondido não muda de novo", () => {
  for (const status of ["accepted", "declined", "cancelled"]) {
    const r = canDecideHire({ client: "c1", architect: "a1", status }, { action: "accept", userId: "a1", role: "architect" });
    assert.equal(r.status, 409);
  }
});

test("publicProjectTitle: não expõe o nome que o cliente deu ao projeto", () => {
  assert.equal(publicProjectTitle(project), "Apartamento · Moderno");
  assert.equal(publicProjectTitle({ name: "Casa da família Silva" }), "Projeto");
});

test("canRequestHire: perfil ilustrativo (isDemo) não recebe pedido de contratação", () => {
  const problem = canRequestHire({ project, architect: { ...architect, isDemo: true }, clientId: client });
  assert.equal(problem.status, 409);
  assert.match(problem.error, /perfil ilustrativo/);
});
