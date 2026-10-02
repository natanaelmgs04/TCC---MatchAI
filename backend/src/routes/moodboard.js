import { Router } from "express";
import rateLimit from "express-rate-limit";
import { userOrIpKey } from "../middleware/rateLimitKey.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { generateMoodboard, generateReferenceImage } from "../controllers/moodboardController.js";

const router = Router();
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: userOrIpKey,
  message: { error: "Limite de gerações de moodboard por hora atingido. Tente novamente mais tarde." },
});
router.post("/", requireAuth, aiLimiter, asyncHandler(generateMoodboard));
router.post("/reference-image", requireAuth, aiLimiter, asyncHandler(generateReferenceImage));

// Prévia pública (sem login) usada no formulário de cadastro, antes de existir conta/token.
// Limite mais apertado por IP, já que não dá pra identificar o usuário ainda.
const previewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: "Limite de prévias por hora atingido. Tente novamente mais tarde." },
});
router.post("/preview", previewLimiter, asyncHandler(generateReferenceImage));
export default router;
