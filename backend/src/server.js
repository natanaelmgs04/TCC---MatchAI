import dotenv from "dotenv";
dotenv.config({ path: "KEYS.env" });
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./config/database.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import matchRoutes from "./routes/matches.js";
import materialRoutes from "./routes/materials.js";
import architectRoutes from "./routes/architects.js";
import messageRoutes from "./routes/messages.js";
import reviewRoutes from "./routes/reviews.js";
import moodboardRoutes from "./routes/moodboard.js";
import projectRoutes from "./routes/projects.js";
import validationRoutes from "./routes/validations.js";
import statsRoutes from "./routes/stats.js";
import notificationRoutes from "./routes/notifications.js";
import favoriteRoutes from "./routes/favorites.js";
import timelineRoutes from "./routes/timeline.js";
import caseStudyRoutes from "./routes/caseStudies.js";
import briefRoutes from "./routes/briefs.js";
import commissionRoutes from "./routes/commissions.js";
import storeRoutes from "./routes/stores.js";
import assistantRoutes from "./routes/assistant.js";

const app = express(),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  // Raiz de verdade do projeto (site estático), um nível acima de backend/ —
  // é isso que faz o mesmo processo/porta servir a API e o front-end juntos.
  siteRoot = path.resolve(root, "..");

app.use(cors());
// /api/assistant recebe fotos em base64 e tem o próprio parser (limite maior,
// ver routes/assistant.js) — o global de 100kb barraria a foto antes dela.
const jsonParser = express.json({ limit: "100kb" });
app.use((req, res, next) => (req.path.startsWith("/api/assistant") ? next() : jsonParser(req, res, next)));
app.use(
  "/api/auth",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 40 }),
  authRoutes,
);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/architects", architectRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/moodboard", moodboardRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/validations", validationRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/timeline", timelineRoutes);
app.use("/api/case-studies", caseStudyRoutes);
app.use("/api/briefs", briefRoutes);
app.use("/api/commissions", commissionRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/assistant", assistantRoutes);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Site (front-end) servido pelo mesmo processo/porta que a API — sem
// cache em dev, pra uma alteração em qualquer arquivo aparecer no reload
// sem precisar de Ctrl+Shift+R (mesmo espírito do antigo serve.py).
app.use(
  express.static(siteRoot, {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
    },
  }),
);
// Front-end de referência original do Arkitetum.AI, mantido por trás do
// nosso site — só é alcançado por arquivos que não existem na raiz acima.
app.use(express.static(path.join(root, "public")));

app.use((req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "Rota não encontrada" });
  res.status(404).sendFile(path.join(siteRoot, "404.html"));
});
app.use((err, _req, res, _next) => {
  if (err?.name === "ValidationError") {
    return res.status(400).json({
      error: Object.values(err.errors).map((e) => e.message).join("; "),
    });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Conteúdo grande demais. Envie menos fotos ou fotos menores." });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: "Este e-mail já está cadastrado" });
  }
  console.error(err);
  res.status(500).json({ error: "Erro inesperado no servidor" });
});

// Rede de segurança: com todo handler assíncrono agora passando erros para o
// Express via asyncHandler, isto só pega o que escapar dessa cadeia — antes,
// uma promise rejeitada (ex.: erro de validação do Mongoose) derrubava o
// processo inteiro do Node em vez de responder 400/500 ao cliente.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
connectDatabase()
  .then(() =>
    app.listen(process.env.PORT || 3000, () =>
      console.log(`Arkitetum running at http://localhost:${process.env.PORT || 3000}`),
    ),
  )
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
