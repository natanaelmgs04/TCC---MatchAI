import { Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { userOrIpKey } from "../middleware/rateLimitKey.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getChat, postMessage, postBriefing, postSend, resetChat } from "../controllers/assistantController.js";

const router = Router();
// As fotos vão em base64 no corpo (o front já reduz pra ~1280px), então esta
// rota precisa de um limite maior que o global de 100kb — o parser global
// pula /api/assistant (ver server.js) pra este aqui valer.
router.use(express.json({ limit: "6mb" }));
router.use(requireAuth, requireRole("client"));

const limiter = (limit) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    keyGenerator: userOrIpKey,
    message: { error: "Limite de mensagens por hora atingido. Tente novamente mais tarde." },
  });

router.get("/:projectId", asyncHandler(getChat));
router.post("/:projectId/message", limiter(60), asyncHandler(postMessage));
router.post("/:projectId/briefing", limiter(20), asyncHandler(postBriefing));
router.post("/:projectId/send", limiter(20), asyncHandler(postSend));
router.delete("/:projectId", asyncHandler(resetChat));
export default router;
