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
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Proposal" }, // contrato assinado pelos dois, se houver
    stages: [
      {
        key: String,
        name: String,
        dueDate: Date,
        status: { type: String, enum: ["pending", "in_progress", "awaiting_approval", "approved"], default: "pending" },
        submittedAt: Date,
        approvedAt: Date,
        revisionRounds: { type: Number, default: 0 },
        closesDesign: Boolean, // etapa que "fecha o projeto" (meta e relatório contam até ela)
        // Honorários da etapa (cobrança simulada — TCC): o arquiteto define o
        // valor; aprovar a etapa abre a cobrança e o cliente marca como paga.
        fee: Number,
        feeStatus: { type: String, enum: ["none", "due", "paid"], default: "none" },
        feeDueAt: Date,
        feePaidAt: Date,
        // lembretes de prazo já enviados (zeram quando o prazo muda)
        remindedSoonAt: Date,
        remindedLateAt: Date,
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
        // Cotações do item em lojas diferentes; a escolhida vira o preço/loja da lista de compras.
        quotes: [
          {
            storeName: String,
            price: Number,
            purchaseUrl: String,
            product: { type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct" },
            store: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            note: String,
            chosen: { type: Boolean, default: false },
            addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          },
        ],
      },
    ],
    // Equipe do escritório: outros arquitetos convidados pelo arquiteto do projeto.
    team: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, addedAt: { type: Date, default: Date.now }, _id: false }],
    // Diário de obra: registros datados (texto + fotos) que o cliente acompanha.
    diary: [
      {
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        date: Date,
        text: { type: String, maxlength: 2000 },
        files: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProjectFile" }],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Equipe de obra: prestadores parceiros (marcenaria, elétrica…) ou contatos do arquiteto.
    crew: [
      {
        provider: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: String,
        trade: String,
        contact: String, // só para prestador cadastrado à mão (fora da plataforma)
        quote: Number,
        status: { type: String, enum: ["cotando", "contratado", "concluido"], default: "cotando" },
        note: String,
        rating: Number,
        ratedAt: Date,
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
