import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Carrega backend/KEYS.env (fora do Git: tem senhas e chaves) a partir do
 * caminho deste arquivo, não da pasta em que o terminal está — assim
 * `npm run dev` na raiz, `npm run dev` dentro de backend/ e
 * `node backend/src/server.js` acham o mesmo arquivo.
 */
export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const keysFile = path.join(backendRoot, "KEYS.env");
export const keysExample = path.join(backendRoot, "KEYS.env.example");

dotenv.config({ path: keysFile, quiet: true });

const isProduction = process.env.NODE_ENV === "production";

// Sem JWT_SECRET o login quebra. Em desenvolvimento geramos um segredo
// temporário (as sessões caem a cada reinício, o que é aceitável numa máquina
// de teste); em produção ele é obrigatório.
const generatedJwt = !process.env.JWT_SECRET && !isProduction;
if (generatedJwt) process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");

/**
 * Confere o que é obrigatório para o servidor subir e devolve uma mensagem
 * dizendo exatamente o que fazer (em vez de um erro seco). Nunca mostra valores.
 */
export function checkEnv() {
  // No modo local (npm run dev:local) o banco é o do próprio projeto — ver config/database.js.
  const local = !isProduction && (process.argv.includes("--local-db") || (process.env.DB_MODE || "").toLowerCase() === "local");
  const required = isProduction ? ["MONGODB_URI", "JWT_SECRET"] : local ? [] : ["MONGODB_URI"];
  const missing = required.filter((name) => !process.env[name]);
  if (!missing.length) {
    if (generatedJwt) console.warn("⚠ JWT_SECRET ausente no KEYS.env: usando um segredo temporário (os logins caem quando o servidor reinicia).");
    return null;
  }

  const hasFile = fs.existsSync(keysFile);
  const rel = "backend/KEYS.env";
  return [
    "",
    "✖ O servidor não pode iniciar: falta configuração.",
    "",
    hasFile
      ? `  O arquivo ${rel} existe, mas está sem: ${missing.join(", ")}.`
      : `  O arquivo ${rel} não existe neste computador (ele não vai para o GitHub porque guarda senhas).`,
    "",
    "  Como resolver:",
    hasFile
      ? `   1. Abra ${rel} e preencha ${missing.join(", ")}.`
      : "   1. Rode  npm run setup  na raiz do projeto (cria o arquivo a partir do modelo),\n      ou copie o KEYS.env do seu outro computador para a pasta backend/.",
    "   2. Rode  npm run dev  de novo.",
    "",
    "  Sem o KEYS.env ou sem acesso ao Atlas nesta rede? Rode  npm run dev:local :",
    "  usa um banco local com dados de demonstração (na 1ª vez baixa o MongoDB, ~600 MB).",
    "",
    "  O MONGODB_URI fica no MongoDB Atlas: Database > Connect > Drivers.",
    "",
  ].join("\n");
}
