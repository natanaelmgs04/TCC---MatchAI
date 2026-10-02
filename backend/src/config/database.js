import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import { backendRoot } from "./env.js";

const isProduction = process.env.NODE_ENV === "production";
// Banco local persistente deste computador (fora do Git, ver .gitignore).
const LOCAL_DB_PATH = path.join(backendRoot, ".localdb");

/**
 * Conecta ao MongoDB.
 *
 * Padrão: o MongoDB do KEYS.env (Atlas). Com `allowLocal` (só o servidor usa),
 * em desenvolvimento dá para usar um MongoDB LOCAL dentro do projeto
 * (backend/.localdb), já com materiais, arquitetos de demonstração e a conta
 * demo — útil quando a rede bloqueia o Atlas (laboratórios costumam bloquear a
 * porta 27017) ou quando não há KEYS.env. É opcional de propósito: na primeira
 * vez ele baixa o MongoDB (~600 MB no Windows, uma vez só por usuário).
 *   - `npm run dev:local` (na raiz), ou DB_MODE=local no KEYS.env: usa o local;
 *   - `npm run dev`: usa o Atlas e, se não der, explica o que fazer.
 * Em produção é sempre o Atlas.
 */
export async function connectDatabase({ allowLocal = false } = {}) {
  const wantsLocal = process.argv.includes("--local-db") || (process.env.DB_MODE || "").toLowerCase() === "local";
  if (allowLocal && wantsLocal && !isProduction) return connectLocal();

  const NL = String.fromCharCode(10);
  const hint = allowLocal && !isProduction
    ? `${NL}  Sem acesso ao Atlas nesta rede? Rode  npm run dev:local  (banco local com dados de demonstração).`
    : "";
  if (!process.env.MONGODB_URI) throw new Error(`MONGODB_URI is required in KEYS.env${hint}`);

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    // Causa mais comum numa máquina nova: o IP dela não está liberado no Atlas,
    // ou a rede (laboratório, empresa) bloqueia a porta do MongoDB.
    throw new Error(
      [
        `Não consegui conectar ao MongoDB (${error.message.split(NL)[0]}).`,
        "  Confira o MONGODB_URI no KEYS.env e, no MongoDB Atlas, se o IP deste computador está liberado em",
        "  Security > Network Access (para testes, dá para liberar 0.0.0.0/0).",
      ].join(NL) + hint,
    );
  }
  console.log("MongoDB connected");
  return { mode: "atlas" };
}

async function connectLocal() {
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import("mongodb-memory-server-core"));
  } catch {
    throw new Error("O MongoDB local não está instalado: rode  npm install  na raiz do projeto.");
  }
  fs.mkdirSync(LOCAL_DB_PATH, { recursive: true });

  console.log("Iniciando o MongoDB local… (na primeira vez ele é baixado, ~600 MB; depois fica guardado)");
  const start = () =>
    MongoMemoryServer.create({ instance: { dbPath: LOCAL_DB_PATH, storageEngine: "wiredTiger", dbName: "matchia" } });
  let server;
  try {
    server = await start();
  } catch {
    // Ao reiniciar (node --watch), o mongod anterior pode levar um instante para soltar a pasta.
    await new Promise((r) => setTimeout(r, 2000));
    server = await start();
  }
  const uri = server.getUri("matchia");
  await mongoose.connect(uri);

  const stop = async () => {
    await mongoose.disconnect().catch(() => {});
    await server.stop({ doCleanup: false }).catch(() => {}); // mantém os dados em backend/.localdb
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.warn(
    [
      "",
      "⚠ Usando o banco LOCAL deste computador (backend/.localdb).",
      "  O site funciona normalmente, mas as contas e projetos criados aqui ficam só neste computador.",
      "  Para usar o banco do Atlas, rode  npm run dev  (com o MONGODB_URI no backend/KEYS.env).",
      "",
    ].join("\n"),
  );

  await seedIfEmpty(uri);
  return { mode: "local", uri };
}

// Primeira vez com o banco local: roda os mesmos seeds do projeto (npm run seed:*),
// na ordem em que dependem um do outro. Sem chaves de API para não travar numa
// rede que bloqueia serviços externos.
async function seedIfEmpty(uri) {
  const users = await mongoose.connection.db.collection("users").estimatedDocumentCount();
  if (users > 0) return;
  console.log("Banco local vazio: cadastrando materiais, arquitetos de demonstração e a conta demo…");
  const env = { ...process.env, MONGODB_URI: uri, DB_MODE: "atlas", UNSPLASH_ACCESS_KEY: "", GEMINI_API_KEY: "" };
  for (const seed of ["materials", "architects", "demoAccount"]) {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(backendRoot, "src", "seeds", `${seed}.js`)], { env, stdio: ["ignore", "inherit", "inherit"] });
      child.on("exit", resolve);
      child.on("error", () => resolve(1));
    });
    if (code !== 0) {
      console.warn(`  (o seed "${seed}" não terminou; o site funciona, só com menos dados de exemplo)`);
      break;
    }
  }
  console.log("Pronto. Conta demo: demo@matchia.com / MatchIA@Demo2026\n");
}
