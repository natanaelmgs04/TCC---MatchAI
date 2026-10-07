import mongoose from "mongoose";

/**
 * Proposta e contrato de um pedido de contratação. O arquiteto monta a
 * proposta (escopo, etapas com prazo e honorários, forma de pagamento) e
 * assina digitando o nome; o cliente lê, assina do mesmo jeito e isso fecha
 * a contratação e já cria as etapas do Espaço do projeto. O texto assinado
 * tem um código de verificação (SHA-256), igual nas duas assinaturas.
 */
const signatureSchema = new mongoose.Schema(
  { name: String, at: Date, ip: String, userAgent: String },
  { _id: false },
);

const proposalSchema = new mongoose.Schema(
  {
    hire: { type: mongoose.Schema.Types.ObjectId, ref: "Hire", required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    architect: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["sent", "signed", "declined", "cancelled"], default: "sent" },
    version: { type: Number, default: 1 },
    scope: { type: String, maxlength: 3000 },
    stages: [{ name: String, weeks: Number, fee: Number, closesDesign: Boolean, _id: false }],
    paymentTerms: { type: String, maxlength: 600 },
    total: Number,
    validUntil: Date,
    document: { type: mongoose.Schema.Types.Mixed }, // o texto exato que foi assinado
    documentHash: String,
    architectSignature: signatureSchema,
    clientSignature: signatureSchema,
    declinedReason: { type: String, maxlength: 600 },
  },
  { timestamps: true },
);

export default mongoose.model("Proposal", proposalSchema);
