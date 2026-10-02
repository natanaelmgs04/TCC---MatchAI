import mongoose from "mongoose";

/**
 * Contratação: o cliente pede para contratar um arquiteto para UM projeto e o
 * arquiteto aceita ou recusa. Aceito, o projeto "fecha" pela plataforma: passa
 * a ser do arquiteto (Project.architect, status in_progress), conta no
 * contador de projetos fechados dele e aparece no perfil público.
 * Regras de transição em services/hireRules.js.
 */
const hireSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    architect: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled"],
      default: "pending",
    },
    message: { type: String, trim: true, maxlength: 1000 },
    response: { type: String, trim: true, maxlength: 1000 },
    decidedAt: Date,
  },
  { timestamps: true },
);
// Um pedido aberto por projeto de cada vez (o cliente espera a resposta ou cancela).
hireSchema.index({ project: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
hireSchema.index({ architect: 1, status: 1, createdAt: -1 });
hireSchema.index({ client: 1, createdAt: -1 });

export default mongoose.model("Hire", hireSchema);
