import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { userOrIpKey } from "../middleware/rateLimitKey.js";
import { requestHire, listHires, acceptHire, declineHire, cancelHire } from "../controllers/hireController.js";

const router = Router();
router.use(requireAuth);
// Cada pedido gera notificação e e-mail para o arquiteto: limite contra spam.
const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: userOrIpKey,
  message: { error: "Muitos pedidos de contratação em pouco tempo. Tente novamente mais tarde." },
});
router.get("/", asyncHandler(listHires));
router.post("/", requireRole("client"), requestLimiter, asyncHandler(requestHire));
router.post("/:id/accept", requireRole("architect"), asyncHandler(acceptHire));
router.post("/:id/decline", requireRole("architect"), asyncHandler(declineHire));
router.post("/:id/cancel", requireRole("client"), asyncHandler(cancelHire));
export default router;
