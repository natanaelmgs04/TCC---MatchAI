import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as c from "../controllers/briefingController.js";

/** Briefing do arquiteto (modelo de perguntas, envio ao cliente e respostas). */
const router = Router();
router.use(requireAuth);
router.get("/template", asyncHandler(c.getTemplate));
router.put("/template", asyncHandler(c.saveTemplate));
router.delete("/template", asyncHandler(c.resetTemplate));
router.post("/", asyncHandler(c.send));
router.get("/hire/:hireId", asyncHandler(c.getByHire));
router.get("/:id", asyncHandler(c.get));
router.post("/:id/answers", asyncHandler(c.answer));
export default router;
