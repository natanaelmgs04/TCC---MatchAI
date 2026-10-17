/**
 * Testes de interface: o site de verdade num navegador de verdade (Edge ou
 * Chrome já instalados no computador — nada é baixado), com a API num banco
 * temporário em memória (tests/ui/stack.js).
 *
 *   npm run test:ui              (na pasta backend)
 *   UI_BROWSER=caminho/do/navegador.exe npm run test:ui   (outro navegador)
 *   UI_HEADED=1 npm run test:ui  (para ver o navegador trabalhando)
 *
 * Sem navegador instalado, os testes são pulados em vez de falhar.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PASSWORD, PEOPLE, startStack } from "./stack.js";

const CANDIDATES = [
  process.env.UI_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

let stack, browser, ids, skip = null;

before(async () => {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) { skip = "nenhum Edge/Chrome encontrado (defina UI_BROWSER)"; return; }
  const { chromium } = await import("playwright-core");
  stack = await startStack();
  ids = await stack.seedWorkspace();
  browser = await chromium.launch({ executablePath, headless: !process.env.UI_HEADED });
});

after(async () => {
  await browser?.close();
  await stack?.close();
});

/** Página já logada (token no localStorage) que falha o teste em qualquer erro de JavaScript. */
async function pageAs(key, { offlineReady = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: offlineReady ? "allow" : "block" });
  if (key) {
    const p = stack.people[key];
    await context.addInitScript(([token, user]) => {
      localStorage.setItem("matchia_token", token);
      localStorage.setItem("matchia_user", JSON.stringify(user));
    }, [p.token, { id: p.id, name: p.name, role: p.role }]);
  }
  context.setDefaultTimeout(45_000); // primeira carga sem cache (fontes do Google) pode demorar
  const page = await context.newPage();
  const errors = [];
  // a animação nativa de troca de página (@view-transition) é cancelada ao redirecionar: aviso do navegador, não erro do site
  page.on("pageerror", (e) => { if (!/ViewTransition|Transition was (skipped|aborted)/.test(e.message)) errors.push(e.message); });
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::|ViewTransition/.test(m.text())) errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  return { page, context, errors };
}

const workspaceUrl = () => `${stack.origin}/projeto.html?id=${ids.projectId}`;

test("login em duas etapas: aparelho novo pede o código do e-mail", async (t) => {
  if (skip) return t.skip(skip);
  await stack.api("/dashboard/me/security/code", { method: "POST", as: "cliente" });
  await stack.api("/dashboard/me/security", { method: "POST", as: "cliente", body: { enable: true, code: stack.lastCode(), deviceId: "outro-aparelho" } });
  const { page, context, errors } = await pageAs(null);
  await page.goto(`${stack.origin}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", PEOPLE.cliente.email);
  await page.fill("#password", PASSWORD);
  await page.click("#submitBtn");
  await page.waitForSelector("#codeForm:not([hidden])");
  assert.match(await page.textContent("#codeLead"), /aparelho é novo/);
  await page.fill("#loginCode", "000000");
  await page.click("#codeBtn");
  await page.waitForSelector("#formError.show");
  await page.fill("#loginCode", stack.lastCode());
  await page.click("#codeBtn");
  await page.waitForURL(/dashboard\.html/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("Espaço do projeto: todas as abas abrem sem erro; Pix, aviso de pagamento, confirmação e recibo", async (t) => {
  if (skip) return t.skip(skip);
  const client = await pageAs("cliente");
  await client.page.goto(workspaceUrl(), { waitUntil: "domcontentloaded" });
  await client.page.waitForSelector("#pjApp:not([hidden])");
  for (const tab of ["agenda", "arquivos", "documentos", "biblioteca", "compras", "obra", "historico", "etapas"]) {
    await client.page.click(`[data-pj-tab="${tab}"]`);
    await client.page.waitForSelector(`[data-pj-panel="${tab}"]:not([hidden])`);
  }
  const qr = await client.page.getAttribute(".pj-pix-qr", "src");
  assert.match(qr, /^data:image\/svg\+xml;base64,/);
  assert.match(await client.page.inputValue(".pj-pix-copy input"), /^000201.*br\.gov\.bcb\.pix/);
  await client.page.click('[data-act="pay"]');
  await client.page.waitForSelector("text=Você avisou o pagamento");

  const arch = await pageAs("arquiteta");
  await arch.page.goto(workspaceUrl(), { waitUntil: "domcontentloaded" });
  await arch.page.click('[data-act="confirm-fee"]');
  await arch.page.waitForSelector('[data-act="receipt"]');

  await client.page.reload();
  await client.page.evaluate(() => { window.print = () => {}; });
  await client.page.click('[data-act="receipt"]');
  await client.page.waitForFunction(() => /Recibo de honorários/.test(document.getElementById("pjPrint").textContent));
  assert.match(await client.page.textContent("#pjPrint"), /mil e oitocentos reais.*RRT nº 12345678/s);
  assert.deepEqual([...client.errors, ...arch.errors], []);
  await client.context.close();
  await arch.context.close();
});

test("agenda: o cliente marca, a arquiteta confirma e registra a ata depois", async (t) => {
  if (skip) return t.skip(skip);
  const client = await pageAs("cliente");
  await client.page.goto(`${workspaceUrl()}#agenda`, { waitUntil: "domcontentloaded" });
  await client.page.waitForSelector('[data-pj-panel="agenda"]:not([hidden])');
  const soon = new Date(Date.now() + 15 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  await client.page.selectOption('[data-form="meeting"] [name="kind"]', "reuniao");
  await client.page.fill('[data-form="meeting"] [name="title"]', "Escolha de revestimentos");
  await client.page.fill('[data-form="meeting"] [name="day"]', `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`);
  await client.page.fill('[data-form="meeting"] [name="time"]', `${pad(soon.getHours())}:${pad(soon.getMinutes())}`);
  await client.page.click('[data-form="meeting"] [type="submit"]');
  await client.page.waitForSelector("text=Escolha de revestimentos");

  const arch = await pageAs("arquiteta");
  await arch.page.goto(`${workspaceUrl()}#agenda`, { waitUntil: "domcontentloaded" });
  const card = arch.page.locator(".pj-meeting", { hasText: "Escolha de revestimentos" });
  await card.locator('[data-answer="yes"]').click();
  await arch.page.locator(".pj-meeting", { hasText: "Escolha de revestimentos" }).locator(".pj-chip", { hasText: "Confirmado" }).waitFor();
  const again = arch.page.locator(".pj-meeting", { hasText: "Escolha de revestimentos" });
  await again.locator("summary").click();
  await again.locator("textarea").fill("Porcelanato da sala aprovado; a cliente traz amostras do box.");
  await again.locator('[type="submit"]').click();
  await arch.page.waitForSelector("text=Porcelanato da sala aprovado");
  assert.deepEqual([...client.errors, ...arch.errors], []);
  await client.context.close();
  await arch.context.close();
});

test("diário de obra sem internet: guarda no aparelho e envia quando a conexão volta", async (t) => {
  if (skip) return t.skip(skip);
  const arch = await pageAs("arquiteta");
  await arch.page.goto(`${workspaceUrl()}#obra`, { waitUntil: "domcontentloaded" });
  await arch.page.waitForSelector('[data-pj-panel="obra"]:not([hidden])');
  await arch.context.setOffline(true);
  await arch.page.fill("#pjDiaryText", "Chegaram as placas de drywall (registrado sem sinal).");
  await arch.page.click('[data-form="diary"] [type="submit"]');
  await arch.page.waitForSelector(".pj-pending");
  assert.match(await arch.page.textContent(".pj-pending"), /1 registro aguardando internet/);
  await arch.context.setOffline(false);
  await arch.page.waitForSelector(".pj-diary-text >> text=Chegaram as placas de drywall");
  await arch.page.waitForSelector(".pj-pending", { state: "detached" });
  const ws = await stack.api(`/workspace/${ids.projectId}`, { as: "arquiteta" });
  assert.ok(ws.diary.some((d) => /placas de drywall/.test(d.text)));
  assert.deepEqual(arch.errors, []);
  await arch.context.close();
});

test("briefing: a cliente responde pela tela e a arquiteta lê as respostas", async (t) => {
  if (skip) return t.skip(skip);
  const proj = await stack.api("/projects", { method: "POST", as: "cliente", body: { name: "Casa de praia" } });
  const hire = await stack.api("/hires", { method: "POST", as: "cliente", body: { projectId: proj._id, architectId: stack.people.arquiteta.id } });
  const b = await stack.api("/briefings", { method: "POST", as: "arquiteta", body: { hireId: hire.id, message: "Para eu entender a rotina." } });
  const client = await pageAs("cliente");
  await client.page.goto(`${stack.origin}/briefing.html?id=${b.id}`, { waitUntil: "domcontentloaded" });
  await client.page.waitForSelector("#bfAnswer");
  await client.page.click('[type="submit"]');
  await client.page.waitForSelector("#bfError:not(:empty)"); // obrigatórias em branco
  await client.page.fill("textarea[data-q='q1']", "Família de quatro, com dois cachorros");
  await client.page.check("fieldset[data-q='q3'] input[value='Área gourmet']");
  await client.page.check("fieldset[data-q='q4'] input[value='Baixa manutenção']");
  await client.page.check("fieldset[data-q='q6'] input[value='Ainda não sei']");
  await client.page.click('[type="submit"]');
  await client.page.waitForSelector("text=Briefing respondido");
  const arch = await pageAs("arquiteta");
  await arch.page.goto(`${stack.origin}/contrato.html?hire=${hire.id}`, { waitUntil: "domcontentloaded" });
  await arch.page.waitForSelector(".ct-briefing");
  assert.match(await arch.page.textContent(".ct-briefing"), /Área gourmet/);
  assert.deepEqual([...client.errors, ...arch.errors], []);
  await client.context.close();
  await arch.context.close();
});
