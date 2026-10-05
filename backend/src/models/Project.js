import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Preenchido quando os dois lados confirmam a Validation e o projeto
    // "fecha" pela plataforma (ver validationController.createCommissionForClosedValidation).
    architect: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true },
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
    areaM2: Number,
    // Onde a obra acontece: é a localização que o match usa (o arquiteto
    // atende onde o projeto está, não onde o cliente mora).
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, uppercase: true, maxlength: 2 },
    // Do fluxo de criação em página cheia (novo-projeto.html + experiencia-3d.html),
    // normalizados em services/projectPreferences.js.
    styleNotes: String,
    stylePicks: [{ question: String, choice: String, styles: [String] }],
    experience: { type: mongoose.Schema.Types.Mixed },
    // Espaço do projeto (projeto.html), depois que um arquiteto aceita a
    // contratação. Regras em services/workspaceRules.js.
    targetDate: Date, // meta de fechar o projeto (padrão: 12 semanas, até o executivo)
    workspaceStartedAt: Date, // no plano Gratuito o arquiteto edita só o espaço ativo mais antigo
    stages: [
      {
        key: String,
        name: String,
        dueDate: Date,
        status: { type: String, enum: ["pending", "in_progress", "awaiting_approval", "approved"], default: "pending" },
        submittedAt: Date,
        approvedAt: Date,
        revisionRounds: { type: Number, default: 0 },
      },
    ],
    // Biblioteca do arquiteto para ESTE projeto: produtos das lojas parceiras
    // (copiados no momento da escolha, para não sumirem se a loja mudar o
    // catálogo) ou itens cadastrados por ele. É também a lista de compras.
    library: [
      {
        kind: { type: String, enum: ["product", "custom"], default: "product" },
        product: { type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct" },
        store: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: String,
        photo: String,
        category: String,
        storeName: String,
        purchaseUrl: String,
        price: Number,
        room: String,
        note: String,
        quantity: { type: Number, default: 1 },
        unit: String,
        purchased: { type: Boolean, default: false },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    // Histórico de alterações (etapas, arquivos, biblioteca) — quem fez o quê e quando.
    activity: [
      {
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        kind: String,
        text: String,
      },
    ],
    status: {
      type: String,
      enum: ["draft", "matching", "in_progress", "completed"],
      default: "draft",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Project", projectSchema);
