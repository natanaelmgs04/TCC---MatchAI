import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_LIMITS, PRO_PRICE_MONTHLY, isPro, limitsFor, publicLimits } from "../src/services/planLimits.js";

test("planos: Gratuito tem limites, Pro libera o que custa ou escala", () => {
  assert.equal(PRO_PRICE_MONTHLY, 79);
  const free = limitsFor({ role: "architect", architectProfile: {} });
  const pro = limitsFor({ architectProfile: { subscriptionTier: "pro" } });
  assert.equal(free.activeWorkspaces, 1);
  assert.equal(free.studio3d, false);
  assert.equal(free.copyLibrary, false);
  assert.equal(pro.activeWorkspaces, Infinity);
  assert.ok(pro.workspaceStorage > free.workspaceStorage);
  assert.ok(pro.assistantDaily > free.assistantDaily);
  assert.equal(isPro(null), false);
});

test("planos: Infinity vira null no JSON", () => {
  const out = publicLimits(PLAN_LIMITS.pro);
  assert.equal(out.activeWorkspaces, null);
  assert.equal(JSON.parse(JSON.stringify(out)).portfolioItems, null);
});
