import { Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { userOrIpKey } from "../middleware/rateLimitKey.js";
import * as c from "../controllers/workspaceController.js";

/**
 * Espaço do projeto (cliente + arquiteto contratado). O envio de arquivo
 * chega cru (application/octet-stream, até 15 MB) com o nome no cabeçalho
 * X-File-Name — sem base64, para não inflar o tamanho.
 */
const router = Router();
const rawFile = express.raw({ type: () => true, limit: "15mb" });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, keyGenerator: userOrIpKey, message: { error: "Muitos envios em pouco tempo. Tente de novo mais tarde." } });
const conceptLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, keyGenerator: userOrIpKey, message: { error: "Limite de conceitos por hora atingido." } });

router.use(requireAuth);
router.get("/:id", asyncHandler(c.get));
router.patch("/:id/target", asyncHandler(c.updateTarget));
router.patch("/:id/stages/:key", asyncHandler(c.updateStage));
router.post("/:id/stages/:key/:action", asyncHandler(c.stageAction));
router.post("/:id/files", uploadLimiter, rawFile, asyncHandler(c.uploadFile));
router.get("/:id/files/:fileId", asyncHandler(c.downloadFile));
router.delete("/:id/files/:fileId", asyncHandler(c.removeFile));
router.post("/:id/files/:fileId/review", asyncHandler(c.reviewFile));
router.get("/:id/catalog", asyncHandler(c.catalog));
router.post("/:id/library", asyncHandler(c.addItem));
router.post("/:id/library/copy-from/:otherId", asyncHandler(c.copyLibrary));
router.patch("/:id/library/:itemId", asyncHandler(c.updateItem));
router.delete("/:id/library/:itemId", asyncHandler(c.removeItem));
router.post("/:id/concept", conceptLimiter, asyncHandler(c.concept));
export default router;
