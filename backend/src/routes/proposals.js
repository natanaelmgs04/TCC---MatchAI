import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { userOrIpKey } from "../middleware/rateLimitKey.js";
import * as c from "../controllers/proposalController.js";

const router = Router();
const sendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: userOrIpKey, message: { error: "Muitas propostas em pouco tempo. Tente mais tarde." } });
router.use(requireAuth);
router.get("/draft/:hireId", asyncHandler(c.draft));
router.post("/", sendLimiter, asyncHandler(c.create));
router.get("/:id", asyncHandler(c.get));
router.post("/:id/sign", asyncHandler(c.sign));
router.post("/:id/decline", asyncHandler(c.decline));
export default router;
