import mongoose from "mongoose";

/**
 * Briefing (programa de necessidades) que o arquiteto manda ao cliente a
 * partir de um pedido de contratação. As perguntas são copiadas no envio —
 * se o arquiteto mudar o modelo depois, o briefing já enviado não muda.
 * As respostas aparecem na proposta, no Espaço do projeto e no assistente
 * de IA do arquiteto.
 */
const briefingSchema = new mongoose.Schema(
  {
    hire: { type: mongoose.Schema.Types.ObjectId, ref: "Hire", required: true, unique: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    architect: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, maxlength: 600 },
    questions: [{ type: mongoose.Schema.Types.Mixed }],
    answers: [{ id: String, value: mongoose.Schema.Types.Mixed, _id: false }],
    status: { type: String, enum: ["sent", "answered"], default: "sent" },
    sentAt: Date,
    answeredAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Briefing", briefingSchema);
