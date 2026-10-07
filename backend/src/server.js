// Primeiro import de propósito: carrega o KEYS.env antes de qualquer outro módulo ler process.env.
import { checkEnv } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import app from "./app.js";
import User from "./models/User.js";
import { emailStatus } from "./services/emailService.js";
import { startModel3dWorker } from "./services/model3dStore.js";
import { startWorkspaceReminders } from "./services/workspaceReminders.js";

// Rede de segurança: com todo handler assíncrono agora passando erros para o
// Express via asyncHandler, isto só pega o que escapar dessa cadeia — antes,
// uma promise rejeitada (ex.: erro de validação do Mongoose) derrubava o
// processo inteiro do Node em vez de responder 400/500 ao cliente.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
const envProblem = checkEnv();
if (envProblem) {
  console.error(envProblem);
  process.exit(1);
}
connectDatabase({ allowLocal: true })
  // Contas que já tinham foto do cadastro antigo ganham a versão que publica a foto.
  .then(() => User.updateMany({ avatarUrl: { $exists: true, $nin: [null, ""] }, avatarVersion: { $exists: false } }, { $set: { avatarVersion: 1 } }).catch(() => {}))
  .then(() =>
    app.listen(process.env.PORT || 3000, () => {
      console.log(`Arkitetum running at http://localhost:${process.env.PORT || 3000}`);
      console.log(`E-mail: ${emailStatus()}`);
      startModel3dWorker();
      startWorkspaceReminders();
    }),
  )
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
