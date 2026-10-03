import Favorite from "../models/Favorite.js";
import { avatarPath } from "../services/avatar.js";

export async function listFavorites(req, res) {
  const favorites = await Favorite.find({ client: req.user.id })
    .populate("architect", "name city state architectProfile avatarVersion status")
    .sort("-createdAt");
  res.json(
    favorites
      .filter((f) => f.architect && f.architect.status !== "suspended")
      .map((f) => ({
        id: f.architect.id,
        name: f.architect.name,
        avatar: avatarPath(f.architect),
        city: f.architect.city,
        state: f.architect.state,
        profile: f.architect.architectProfile,
        favoritedAt: f.createdAt,
      })),
  );
}

export async function addFavorite(req, res) {
  await Favorite.findOneAndUpdate(
    { client: req.user.id, architect: req.params.architectId },
    {},
    { upsert: true, setDefaultsOnInsert: true },
  );
  res.status(201).json({ ok: true });
}

export async function removeFavorite(req, res) {
  await Favorite.deleteOne({ client: req.user.id, architect: req.params.architectId });
  res.json({ ok: true });
}
