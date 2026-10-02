// `npm run setup` (na raiz): prepara uma máquina nova para rodar o match.IA.
// Confere a versão do Node e as dependências, cria backend/KEYS.env a partir
// do modelo se ele não existir e diz o que falta preencher. Nunca mostra
// valores do KEYS.env, só os nomes das variáveis.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const keysFile = path.join(backendRoot, "KEYS.env");
const example = path.join(backendRoot, "KEYS.env.example");
const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const fail = (m) => console.log(`  ✖ ${m}`);

console.log("\nmatch.IA — preparando este computador\n");
let problems = 0;

const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) ok(`Node ${process.versions.node}`);
else { fail(`Node ${process.versions.node}: instale o Node 20 ou mais novo (nodejs.org).`); problems++; }

if (fs.existsSync(path.join(backendRoot, "node_modules", "mongoose"))) ok("Dependências do backend instaladas");
else { fail("Dependências do backend faltando: rode  npm install  na raiz do projeto."); problems++; }

if (!fs.existsSync(keysFile)) {
  fs.copyFileSync(example, keysFile);
  warn("backend/KEYS.env não existia: criei a partir do modelo (KEYS.env.example).");
}

const values = Object.fromEntries(
  fs.readFileSync(keysFile, "utf8").split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map(([, name, value]) => [name, value.replace(/^["']|["']$/g, "").trim()]),
);
const empty = (name) => !values[name];

if (empty("MONGODB_URI")) {
  fail("MONGODB_URI vazio em backend/KEYS.env: preencha para usar o banco do Atlas com  npm run dev ,");
  console.log("     ou rode  npm run dev:local  para usar um banco local com dados de demonstração (baixa ~600 MB na 1ª vez).");
  problems++;
} else ok("MONGODB_URI preenchido (se o Atlas não responder nesta rede, use  npm run dev:local )");
if (empty("JWT_SECRET")) warn("JWT_SECRET vazio: em desenvolvimento funciona, mas os logins caem a cada reinício.");
else ok("JWT_SECRET preenchido");
if (empty("GEMINI_API_KEY")) warn("GEMINI_API_KEY vazio: assistente e briefing usam respostas padrão em vez da IA.");
else ok("GEMINI_API_KEY preenchido");

console.log("");
if (problems) {
  console.log("Falta pouco. Preencha o que está marcado com ✖ em backend/KEYS.env (ou use  npm run dev:local )");
  console.log("(ou copie o KEYS.env do seu outro computador por cima dele) e rode  npm run setup  de novo.\n");
  process.exitCode = 1;
} else {
  console.log("Tudo pronto. Rode  npm run dev  e abra http://localhost:3000\n");
}
