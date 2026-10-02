import mongoose from "mongoose";

/**
 * Conversa do arquiteto com o assistente de IA sobre UM projeto que ele
 * fechou com um cliente (uma conversa por par arquiteto+projeto). Variante
 * mais simples da AssistantChat do cliente: aqui a IA só dá sugestões de
 * como desenvolver o projeto a partir do que o cliente já informou — sem
 * fotos, sem briefing, sem passo de "enviar para arquitetos".
 */
const architectAssistantChatSchema = new mongoose.Schema(
  {
    architect: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    messages: [
      {
        role: { type: String, enum: ["user", "model"], required: true },
        text: { type: String, default: "", maxlength: 4000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
architectAssistantChatSchema.index({ architect: 1, project: 1 }, { unique: true });

export default mongoose.model("ArchitectAssistantChat", architectAssistantChatSchema);
