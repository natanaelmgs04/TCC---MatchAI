import User from "../models/User.js";
import ProfileView from "../models/ProfileView.js";
import { buildSearchQuery, searchReferenceImage } from "../services/imageSearchService.js";
import { avatarPath } from "../services/avatar.js";

export async function listArchitects(req, res) {
  const query = { role: "architect", status: { $ne: "suspended" } };
  if (req.query.style) query["architectProfile.styles"] = req.query.style;
  if (req.query.city) query.city = { $regex: req.query.city, $options: "i" };
  if (req.query.minExperience)
    query["architectProfile.yearsExperience"] = { $gte: Number(req.query.minExperience) };

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 9));
  const minRating = req.query.minRating ? Number(req.query.minRating) : null;

  const pipeline = [
    { $match: query },
    // a foto (data URI) e os hashes não precisam sair do banco aqui
    { $project: { avatarUrl: 0, passwordHash: 0, passwordResetTokenHash: 0, passwordResetExpires: 0 } },
    {
      $lookup: {
        from: "reviews",
        localField: "_id",
        foreignField: "architect",
        as: "reviews",
      },
    },
    {
      $addFields: {
        avgRating: { $cond: [{ $gt: [{ $size: "$reviews" }, 0] }, { $round: [{ $avg: "$reviews.rating" }, 1] }, 0] },
        reviewCount: { $size: "$reviews" },
      },
    },
    {
      /**
       * Ranking por mérito + bônus de assinatura Pro -- nunca uma posição
       * garantida. meritScore (0-100) já cobre a maior parte da nota;
       * proBonus (+15) e verifiedBonus (+5, trajetória consistente) somados
       * não bastam pra superar um mérito claramente melhor (ex.: free com
       * meritScore 60 continua na frente de um Pro com meritScore 40 -- 40+15=55 < 60).
       */
      $addFields: {
        closedProjectsCount: { $ifNull: ["$architectProfile.closedProjectsCount", 0] },
        meritScore: {
          $add: [
            { $multiply: [{ $ifNull: ["$avgRating", 0] }, 10] },
            { $multiply: [{ $min: [{ $ifNull: ["$reviewCount", 0] }, 10] }, 2] },
            { $multiply: [{ $min: [{ $ifNull: ["$architectProfile.closedProjectsCount", 0] }, 10] }, 3] },
          ],
        },
        isPro: { $eq: ["$architectProfile.subscriptionTier", "pro"] },
      },
    },
    {
      $addFields: {
        verifiedBonus: {
          $cond: [{ $and: [{ $gte: ["$closedProjectsCount", 5] }, { $gte: [{ $ifNull: ["$avgRating", 0] }, 4.5] }] }, 5, 0],
        },
        proBonus: { $cond: ["$isPro", 15, 0] },
      },
    },
    { $addFields: { rankScore: { $add: ["$meritScore", "$proBonus", "$verifiedBonus"] } } },
  ];
  if (minRating) pipeline.push({ $match: { avgRating: { $gte: minRating } } });
  pipeline.push(
    { $sort: { rankScore: -1, createdAt: -1 } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: "count" }],
      },
    },
  );

  const [result] = await User.aggregate(pipeline);
  const architects = result?.data || [];
  const total = result?.totalCount?.[0]?.count || 0;

  res.json({
    architects: architects.map((architect) => ({
      id: architect._id,
      name: architect.name,
      avatar: avatarPath(architect),
      city: architect.city,
      state: architect.state,
      profile: architect.architectProfile,
      avgRating: architect.avgRating,
      reviewCount: architect.reviewCount,
      isPro: architect.isPro,
      isVerifiedTrackRecord: architect.verifiedBonus > 0,
    })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}

/**
 * Referência visual do arquiteto, calculada uma vez a partir do estilo/materiais
 * dele e guardada em `architectProfile.referenceImage` — evita bater no Unsplash
 * de novo toda vez que alguém vê o perfil ou o resultado de um match (limite
 * gratuito da API é 50 buscas/hora, compartilhado entre todo mundo no site).
 */
export async function getArchitectReferenceImage(req, res) {
  const architect = await User.findOne({ _id: req.params.id, role: "architect" });
  if (!architect) return res.status(404).json({ error: "Arquiteto não encontrado" });

  if (architect.architectProfile.referenceImage?.imageUrl) {
    return res.json(architect.architectProfile.referenceImage);
  }

  const { styles = [], favoriteMaterials = [] } = architect.architectProfile;
  if (!styles.length && !favoriteMaterials.length) {
    return res.status(404).json({ error: "Este arquiteto ainda não tem estilo/materiais suficientes para gerar uma referência." });
  }

  const query = await buildSearchQuery(styles, favoriteMaterials, []);
  const photo = await searchReferenceImage(query);
  if (!photo) return res.status(404).json({ error: "Não encontramos uma referência visual agora." });

  architect.architectProfile.referenceImage = {
    imageUrl: photo.imageUrl,
    description: photo.description,
    photographerName: photo.photographerName,
    photographerUrl: photo.photographerUrl,
  };
  await architect.save();
  res.json(architect.architectProfile.referenceImage);
}

/**
 * Registra uma visualização de perfil pras métricas do arquiteto. Sem auth
 * de propósito (visitante anônimo também conta) — a deduplicação por sessão
 * fica a cargo do front-end (sessionStorage), então isto só grava.
 */
export async function recordProfileView(req, res) {
  const exists = await User.exists({ _id: req.params.id, role: "architect" });
  if (!exists) return res.status(404).json({ error: "Arquiteto não encontrado" });
  await ProfileView.create({ architect: req.params.id });
  res.status(204).end();
}

/**
 * Assinatura Pro simulada -- sem gateway de pagamento real (mesma fidelidade
 * do resto do projeto). Isso é o que o checkout do front-end chama de
 * verdade em vez de só gravar no localStorage: passa a existir de fato no
 * back-end e afeta o limite de portfólio e o ranking (ver listArchitects).
 */
export async function setSubscriptionTier(req, res) {
  const tier = req.body?.tier;
  if (!["free", "pro"].includes(tier))
    return res.status(400).json({ error: "Plano inválido." });

  req.user.architectProfile.subscriptionTier = tier;
  if (tier === "pro" && !req.user.architectProfile.proSince) req.user.architectProfile.proSince = new Date();
  await req.user.save();
  res.json({ subscriptionTier: req.user.architectProfile.subscriptionTier, proSince: req.user.architectProfile.proSince });
}

export async function getArchitectProfile(req, res) {
  const architect = await User.findOne({
    _id: req.params.id,
    role: "architect",
    status: { $ne: "suspended" },
  }).populate("architectProfile.favoriteMaterials");
  if (!architect)
    return res.status(404).json({ error: "Arquiteto não encontrado" });
  res.json({
    id: architect.id,
    name: architect.name,
    avatar: avatarPath(architect),
    email: architect.email,
    phone: architect.phone,
    city: architect.city,
    state: architect.state,
    profile: architect.architectProfile,
  });
}
