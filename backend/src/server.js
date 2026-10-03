// Primeiro import de propósito: carrega o KEYS.env antes de qualquer outro módulo ler process.env.
import { checkEnv } from "./config/env.js";
import { cspFor } from "./config/csp.js";
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
import architectProjectRoutes from "./routes/architectProjects.js";
import architectAssistantRoutes from "./routes/architectAssistant.js";
import hireRoutes from "./routes/hires.js";
import avatarRoutes from "./routes/avatars.js";
import adminRoutes from "./routes/admin.js";
import siteRoutes from "./routes/site.js";
import User from "./models/User.js";
import { emailStatus } from "./services/emailService.js";

const app = express(),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  // Raiz de verdade do projeto (site estático), um nível acima de backend/ —
  // é isso que faz o mesmo processo/porta servir a API e o front-end juntos.
  siteRoot = path.resolve(root, ".."),
  isProduction = process.env.NODE_ENV === "production";

// Em hospedagem (Render e afins) o visitante chega por um proxy: sem isto,
// todo mundo teria o IP do proxy e os limites por hora seriam compartilhados
// pelo site inteiro. Só em produção — localmente não há proxy e o cabeçalho
// X-Forwarded-For poderia ser forjado para fugir do limite.
if (isProduction) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
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
app.use("/api/architect-projects", architectProjectRoutes);
app.use("/api/architect-assistant", architectAssistantRoutes);
app.use("/api/hires", hireRoutes);
app.use("/api/avatars", avatarRoutes);
app.use("/api/admin", rateLimit({ windowMs: 15 * 60 * 1000, limit: 600 }), adminRoutes);
app.use("/api/site", siteRoutes);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Site (front-end) servido pelo mesmo processo/porta que a API.
//
// siteRoot é a raiz do repositório inteiro (backend/ com o KEYS.env,
// node_modules/, scripts, docs...), então só sai daqui o que é site de verdade:
// tudo em assets/ e, na raiz, as páginas *.html, o manifest e o service worker.
// O resto cai no 404 lá embaixo. Em produção, as ferramentas de geração de
// assets (pastas dev/) também ficam de fora.
//
// Cache: em dev nada é guardado (uma alteração aparece no reload, como no
// antigo serve.py). Em produção, HTML/CSS/JS são revalidados a cada visita
// (ETag, resposta 304 barata — os nomes não têm versão, então nunca ficam
// velhos) e mídia pesada (fotos, 3D, áudio) fica 1 dia no navegador.
const HEAVY_MEDIA = /\.(?:webp|png|jpe?g|svg|glb|hdr|mp3|woff2?)$/i;
const siteStatic = (dir) =>
  express.static(dir, {
    setHeaders: (res, file) => {
      // Páginas levam a Content-Security-Policy (ver config/csp.js). Em dev o
      // hash dos scripts embutidos é recalculado a cada visita (o HTML muda).
      if (file.endsWith(".html")) res.setHeader("Content-Security-Policy", cspFor(file, { cacheResult: isProduction }));
      if (!isProduction) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
      } else if (HEAVY_MEDIA.test(file)) {
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  });
const serveSiteRoot = siteStatic(siteRoot),
  publicRootFile = /^\/(?:[\w-]+\.html|manifest\.json|sw\.js)?$/;
app.use("/assets", (req, res, next) => (isProduction && /(^|\/)dev\//.test(req.path) ? res.status(404).end() : next()), siteStatic(path.join(siteRoot, "assets")));
app.use((req, res, next) => {
  // Testa o caminho já decodificado: "%2F" e "%2e%2e" não podem virar uma
  // subpasta (ex.: /x%2F..%2Fbackend%2FKEYS.env) depois do regex.
  let file;
  try {
    file = decodeURIComponent(req.path);
  } catch {
    return next();
  }
  return publicRootFile.test(file) ? serveSiteRoot(req, res, next) : next();
});
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
    }),
  )
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
