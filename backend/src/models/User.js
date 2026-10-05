import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { avatarPath } from "../services/avatar.js";

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    imageUrl: String,
    projectUrl: String,
    styles: [String],
    materials: [String],
    areaM2: Number,
    status: {
      type: String,
      enum: ["ongoing", "completed"],
      default: "completed",
    },
  },
  { timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: String,
    // Foto de perfil (data URI já reduzido no navegador, ou URL https). Nunca
    // sai nas respostas: o JSON leva só "avatar" (caminho /api/avatars/:id?v=…).
    avatarUrl: { type: String, select: false },
    avatarVersion: Number,
    // Conta suspensa pela equipe (painel admin): não entra nem aparece no match.
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    suspendedReason: String,
    // Última atividade (atualizada no máximo a cada 10 min, ver middleware/auth.js) — painel da equipe.
    lastSeenAt: Date,
    // Perfil ilustrativo (fase inicial): sem dono real, criado pelo painel da equipe.
    isDemo: { type: Boolean, default: false, index: true },
    bio: String,
    passwordHash: { type: String, required: true, select: false },
    // Guarda o hash do token de redefinição, nunca o token cru (o mesmo
    // princípio do passwordHash) — mesmo com o banco vazado, ninguém
    // consegue forjar um link de redefinição válido a partir daqui.
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    role: { type: String, required: true, enum: ["client", "architect", "store"] },
    city: String,
    state: String,
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clientProfile: {
      preferredStyles: [String],
      preferredMaterials: [String],
      budget: {
        min: { type: Number, default: undefined },
        max: { type: Number, default: undefined },
      },
      propertyType: String,
      familySize: Number,
      projectGoals: String,
      preferences: String,
      bonusMatches: { type: Number, default: 0 },
    },
    architectProfile: {
      styles: [String],
      specialties: [String],
      yearsExperience: Number,
      workingAreas: [String],
      priceRange: {
        min: { type: Number, default: undefined },
        max: { type: Number, default: undefined },
      },
      favoriteMaterials: [String],
      bio: String,
      website: String,
      instagram: String,
      bonusPortfolioSlots: { type: Number, default: 0 },
      subscriptionTier: { type: String, enum: ["free", "pro"], default: "free" },
      proSince: Date,
      closedProjectsCount: { type: Number, default: 0 },
      availability: {
        type: String,
        enum: ["available", "limited", "unavailable"],
        default: "available",
      },
      portfolio: [projectSchema],
      // "Assinatura" do arquiteto: o jeito dele de projetar, escrito por ele.
      // Orienta o assistente de IA e a biblioteca de cada projeto (ver workspaceRules.js).
      signature: {
        statement: String,
        principles: [String],
        palette: [String],
        signatureMaterials: [String],
        avoid: [String],
        updatedAt: Date,
      },
      referenceImage: {
        imageUrl: String,
        description: String,
        photographerName: String,
        photographerUrl: String,
      },
      cauVerification: {
        number: String,
        status: {
          type: String,
          enum: ["none", "pending", "verified"],
          default: "none",
        },
      },
    },
    storeProfile: {
      storeName: String,
      description: String,
      logoUrl: String,
      city: String,
      state: String,
      categories: [String],
      // Catálogo importado do site da loja (painel → Produtos → Importar do site).
      catalogUrl: String,
      catalogPlatform: String,
      catalogLabel: String,
      catalogSyncedAt: Date,
      catalogCount: Number,
    },
  },
  { timestamps: true },
);

userSchema.pre("validate", function (next) {
  if (this.role === "client" && !this.clientProfile) this.clientProfile = {};
  if (this.role === "architect" && !this.architectProfile)
    this.architectProfile = {};
  if (this.role === "store" && !this.storeProfile) this.storeProfile = {};
  next();
});

userSchema.pre("save", async function (next) {
  if (this.isModified("passwordHash"))
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Em toda resposta JSON: troca a foto pelo caminho público e nunca expõe hashes.
userSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    const path = avatarPath(ret);
    if (path) ret.avatar = path;
    delete ret.avatarUrl;
    delete ret.passwordHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpires;
    delete ret.__v;
    return ret;
  },
});

userSchema.methods.verifyPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model("User", userSchema);
