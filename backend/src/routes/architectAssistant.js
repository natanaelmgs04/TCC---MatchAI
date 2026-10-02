import { Router } from "express";
import rateLimit from "express-rate-limit";
import { userOrIpKey } from "../middleware/rateLimitKey.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getChat, postMessage, resetChat } from "../controllers/architectAssistantController.js";

const router = Router();
router.use(requireAuth, requireRole("architect"));

const limiter = (limit) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    keyGenerator: userOrIpKey,
    message: { error: "Limite de mensagens por hora atingido. Tente novamente mais tarde." },
  });

router.get("/:projectId", asyncHandler(getChat));
router.post("/:projectId/message", limiter(60), asyncHandler(postMessage));
router.delete("/:projectId", asyncHandler(resetChat));
export default router;
