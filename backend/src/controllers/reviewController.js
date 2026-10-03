import Review from "../models/Review.js";
import User from "../models/User.js";
import { newReviewEmail } from "../services/emailService.js";
import { notify } from "../services/notificationService.js";

export async function createReview(req, res) {
  const { architect, rating, comment } = req.body;
  if (!architect || !rating)
    return res.status(400).json({ error: "Arquiteto e nota são obrigatórios" });
  // upsert: reenvio (clique duplo, ou o cliente mudando de ideia) atualiza a
  // mesma avaliação em vez de criar outra — um cliente só avalia uma vez
  // cada arquiteto (reforçado pelo índice único client+architect no model).
  const review = await Review.findOneAndUpdate(
    { client: req.user.id, architect },
    { rating: Number(rating), comment },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  res.status(201).json(review);

  const architectUser = await User.findById(architect);
  if (architectUser) {
    newReviewEmail(architectUser, req.user.name, review.rating, review.comment).catch(() => {});
    notify(architect, "review", `${req.user.name} te avaliou com ${review.rating}★`, `arquiteto.html?id=${architect}`);
  }
}

export async function listReviewsForArchitect(req, res) {
  const reviews = await Review.find({ architect: req.params.architectId })
    .populate("client", "name avatarVersion")
    .sort("-createdAt");
  const average = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;
  res.json({ reviews, average, count: reviews.length });
}
