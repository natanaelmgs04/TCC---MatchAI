/**
 * Base dos testes de ponta a ponta (tests/e2e.*.test.js): a API de verdade
 * (src/app.js) num MongoDB temporário em memória — o mesmo pacote do banco
 * local (mongodb-memory-server-core). Nada de rede externa: e-mail, IA e 3D
 * desligados. Sem o binário do MongoDB (ex.: máquina sem internet) os testes
 * são pulados em vez de falhar; para pular de propósito: SKIP_E2E=1.
 */
import { before, after } from "node:test";
import assert from "node:assert/strict";

for (const k of ["BREVO_API_KEY", "EMAIL_HOST", "EMAIL_USER", "EMAIL_PASS", "GEMINI_API_KEY", "TRIPO_API_KEY", "MELTFLEX_API_KEY", "UNSPLASH_ACCESS_KEY", "ADMIN_EMAILS"]) process.env[k] = "";
process.env.JWT_SECRET = "e2e-secret-only-for-tests";
process.env.MODEL3D_DEMO = "0";

export function useE2E(dbName = "matchia_e2e") {
  const ctx = { skipReason: null, people: {}, base: "" };
  let mongod, mongoose, server;

  before(async () => {
    if (process.env.SKIP_E2E) { ctx.skipReason = "SKIP_E2E definido"; return; }
    try {
      const { MongoMemoryServer } = await import("mongodb-memory-server-core");
      mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 90_000 } }); // Windows + antivírus: o mongod pode demorar a subir
    } catch (err) {
      ctx.skipReason = `MongoDB em memória indisponível (${err.message.split("\n")[0]})`;
      return;
    }
    mongoose = (await import("mongoose")).default;
    await mongoose.connect(mongod.getUri(dbName));
    const app = (await import("../src/app.js")).default;
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    ctx.base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    await mongoose?.disconnect().catch(() => {});
    await mongod?.stop().catch(() => {});
  });

  ctx.api = async (path, { method = "GET", as, body, raw, headers = {} } = {}) => {
    const h = { ...headers };
    if (as) h.Authorization = `Bearer ${ctx.people[as].token}`;
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (raw) h["Content-Type"] = "application/octet-stream";
    const res = await fetch(`${ctx.base}${path}`, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };

  ctx.register = async (key, role, extra = {}) => {
    const email = `${key}@e2e.test`;
    const r = await ctx.api(`/auth/register/${role}`, { method: "POST", body: { name: extra.name || `${key} Teste`, email, password: "Senha-e2e-123", confirmPassword: "Senha-e2e-123", ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    ctx.people[key] = { token: r.data.token, id: r.data.user.id, email };
  };

  return ctx;
}
