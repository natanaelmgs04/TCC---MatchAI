/**
 * Conta de vitrine pelo painel da equipe: cria a arquiteta e a cliente
 * fictícias com o projeto completo, a senha volta só na resposta e muda a
 * cada vez. Base: tests/e2eHarness.js.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useE2E } from "./e2eHarness.js";

const e2e = useE2E("matchia_e2e_showcase");
const { api, register, people } = e2e;

test("conta de vitrine: só a equipe cria; login com a senha sorteada; projeto completo; recriar troca a senha", async (t) => {
  if (e2e.skipReason) return t.skip(e2e.skipReason);
  process.env.ADMIN_EMAILS = "equipe@e2e.test";
  await register("equipe", "client", { name: "Equipe Teste" });
  await register("curioso", "client", { name: "Cliente Curioso" });
  assert.equal((await api("/admin/showcase", { method: "POST", as: "curioso" })).status, 403);

  const first = await api("/admin/showcase", { method: "POST", as: "equipe" });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.architect.email, "arquiteta.vitrine@match.arquitetos.demo");
  assert.ok(first.data.password.length >= 12);

  const login = await api("/auth/login", { method: "POST", body: { email: first.data.architect.email, password: first.data.password } });
  assert.ok(login.data.token);
  people.vitrine = { token: login.data.token };
  const ws = await api(`/workspace/${first.data.projectId}`, { as: "vitrine" });
  assert.equal(ws.status, 200);
  assert.equal(ws.data.stages.length, 4);
  assert.equal(ws.data.stages[0].feeStatus, "due");
  assert.ok(ws.data.stages[0].pix.payload.startsWith("000201"));
  assert.equal(ws.data.rrt, "12345678");
  assert.equal(ws.data.meetings.length, 1);
  assert.ok(ws.data.briefingId);
  assert.equal(ws.data.plan.tier, "pro");
  const profile = await api(`/architects/${login.data.user.id}`);
  assert.equal(profile.data.profile.portfolio.length, 6);
  assert.match(profile.data.profile.portfolio[0].imageUrl, /^\/assets\/img\/photos\//);

  // perfil ilustrativo: cliente de verdade não contrata a vitrine
  const proj = await api("/projects", { method: "POST", as: "curioso", body: { name: "Meu projeto" } });
  assert.equal((await api("/hires", { method: "POST", as: "curioso", body: { projectId: proj.data._id, architectId: login.data.user.id } })).status, 409);

  const again = await api("/admin/showcase", { method: "POST", as: "equipe" });
  assert.notEqual(again.data.password, first.data.password);
  assert.equal((await api("/auth/login", { method: "POST", body: { email: first.data.architect.email, password: first.data.password } })).status, 401);
  assert.ok((await api("/auth/login", { method: "POST", body: { email: again.data.client.email, password: again.data.password } })).data.token);
});
