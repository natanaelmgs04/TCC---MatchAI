import "../config/env.js"; // carrega backend/KEYS.env de qualquer pasta
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { buildShowcaseAccounts } from "../services/showcase.js";

/**
 * Contas de vitrine no banco que o KEYS.env aponta (o mesmo pelo painel da
 * equipe: admin → Usuários → Conta de vitrine). Ver services/showcase.js.
 *   npm run seed:vitrine                  → senha sorteada, mostrada no fim
 *   npm run seed:vitrine -- --senha=XYZ   → escolhe a senha (mín. 8 caracteres)
 */
const arg = process.argv.find((a) => a.startsWith("--senha="));
const password = arg ? arg.slice("--senha=".length) : undefined;
if (password !== undefined && password.length < 8) {
  console.error("A senha precisa de pelo menos 8 caracteres.");
  process.exit(1);
}

await connectDatabase({ allowLocal: true });
const app = (await import("../app.js")).default;
try {
  const r = await buildShowcaseAccounts(app, { password });
  const site = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
  console.log("\nVitrine pronta.");
  if (site) console.log(`  Site:      ${site}`);
  console.log(`  Arquiteta: ${r.architect.email}`);
  console.log(`  Cliente:   ${r.client.email}`);
  console.log(`  Senha (as duas contas): ${r.password}`);
  console.log(`  Projeto:   ${site}/projeto.html?id=${r.projectId}`);
  console.log("  O QR Code do Pix usa uma chave fictícia: não pague, é só para mostrar.\n");
} catch (err) {
  console.error("Não deu para montar a vitrine:", err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
