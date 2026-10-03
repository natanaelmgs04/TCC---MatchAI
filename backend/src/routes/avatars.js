import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { decodeAvatar } from "../services/avatar.js";

/**
 * GET /api/avatars/:id — a foto de perfil como imagem de verdade (ver
 * services/avatar.js). Pública como a foto de qualquer perfil; o ?v= muda a
 * cada troca de foto, então o navegador pode guardar a imagem por um dia.
 */
const router = Router();
router.get("/:id", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
  const user = await User.findById(req.params.id).select("+avatarUrl status");
  if (!user?.avatarUrl || user.status === "suspended") return res.status(404).end();
  if (/^https:\/\//.test(user.avatarUrl)) return res.redirect(302, user.avatarUrl);
  const img = decodeAvatar(user.avatarUrl);
  if (!img) return res.status(404).end();
  res.setHeader("Content-Type", img.type);
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.send(img.buffer);
}));

export default router;
