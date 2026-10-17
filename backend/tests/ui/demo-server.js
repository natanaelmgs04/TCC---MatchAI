/**
 * Abre o site localmente com um banco temporário em memória e um projeto de
 * exemplo (nada vai para o Atlas; tudo some ao fechar):
 *   node tests/ui/demo-server.js        → http://127.0.0.1:3100
 * Contas de teste: tests/ui/stack.js (PEOPLE, PASSWORD).
 */
import { PASSWORD, PEOPLE, startStack } from "./stack.js";

const port = Number(process.env.PORT) || 3100;
const stack = await startStack({ port });
const ids = await stack.seedWorkspace();
console.info(`\nSite de teste em ${stack.origin}`);
console.info(`Espaço do projeto: ${stack.origin}/projeto.html?id=${ids.projectId}`);
for (const p of Object.values(PEOPLE)) console.info(`  ${p.role}: ${p.email} / ${PASSWORD}`);
const stop = async () => { await stack.close(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
