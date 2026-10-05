import test from "node:test";
import assert from "node:assert/strict";
import { providerFor, availability, PROVIDERS } from "../src/services/model3dProviders.js";

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test("providerFor: usa Tripo para objeto e MeltFlex para planta quando há chave", () => {
  withEnv({ TRIPO_API_KEY: "t", MELTFLEX_API_KEY: "m" }, () => {
    assert.equal(providerFor("object"), "tripo");
    assert.equal(providerFor("floorplan"), "meltflex");
  });
});

test("providerFor: sem chave, cai no modo demonstração fora de produção (e dá para desligar)", () => {
  withEnv({ TRIPO_API_KEY: undefined, MELTFLEX_API_KEY: undefined, MODEL3D_DEMO: undefined }, () => {
    assert.equal(providerFor("object"), "demo");
    assert.deepEqual(availability(), { object: "demo", floorplan: "demo" });
  });
  withEnv({ TRIPO_API_KEY: undefined, MODEL3D_DEMO: "0" }, () => assert.equal(providerFor("object"), null));
});

test("modo demonstração: progride e termina com um arquivo de exemplo", async () => {
  const { taskId } = await PROVIDERS.demo.create({ kind: "object" });
  const running = await PROVIDERS.demo.poll(taskId);
  assert.equal(running.status, "running");
  const old = taskId.replace(/:\d+$/, `:${Date.now() - 60_000}`);
  const done = await PROVIDERS.demo.poll(old);
  assert.equal(done.status, "success");
  assert.match(done.localFile, /\.glb$/);
});
