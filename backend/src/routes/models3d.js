import { Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { userOrIpKey } from "../middleware/rateLimitKey.js";
import * as c from "../controllers/model3dController.js";

/**
 * Estúdio 3D. Tem parser próprio: a foto/planta chega em base64 (até 8 MB,
 * ~11 MB em texto) — o parser global de 100kb barraria antes (ver server.js).
 */
const router = Router();
const bigJson = express.json({ limit: "12mb" });
const smallJson = express.json({ limit: "100kb" });
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  keyGenerator: userOrIpKey,
  message: { error: "Muitos pedidos de modelo 3D em pouco tempo. Tente novamente mais tarde." },
});

router.use(requireAuth);
router.get("/status", asyncHandler(c.status));
router.get("/share-candidates", requireRole("architect"), asyncHandler(c.shareCandidates));
router.get("/", asyncHandler(c.list));
router.post("/", requireRole("architect"), createLimiter, bigJson, asyncHandler(c.create));
router.get("/:id", asyncHandler(c.getOne));
router.get("/:id/file", asyncHandler(c.file));
router.get("/:id/preview", asyncHandler(c.preview));
router.patch("/:id", requireRole("architect"), smallJson, asyncHandler(c.rename));
router.delete("/:id", requireRole("architect"), asyncHandler(c.remove));
router.post("/:id/share", requireRole("architect"), smallJson, asyncHandler(c.share));
router.delete("/:id/share/:clientId", requireRole("architect"), asyncHandler(c.unshare));
router.post("/:id/comments", smallJson, asyncHandler(c.comment));

export default router;
