import mongoose from "mongoose";

/**
 * Conversa do cliente com o assistente de IA sobre UM projeto dele (uma
 * conversa por par cliente+projeto). As fotos enviadas ao Gemini NÃO ficam
 * guardadas aqui — só uma miniatura pequena (pra reexibir a conversa) e o
 * que a própria IA escreveu sobre elas, que já vai no histórico de texto.
 * Isso mantém o documento leve e evita guardar foto da casa do cliente.
 */
const assistantChatSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    messages: [
      {
        role: { type: String, enum: ["user", "model"], required: true },
        text: { type: String, default: "", maxlength: 4000 },
        thumbs: [String],
        // Produtos do catálogo das lojas parceiras que a IA citou nesta resposta.
        products: [
          {
            id: String,
            name: String,
            photo: String,
            price: Number,
            storeName: String,
            purchaseUrl: String,
          },
        ],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    photoCount: { type: Number, default: 0 },
    briefing: { type: mongoose.Schema.Types.Mixed },
    briefingAt: Date,
    sentTo: [
      {
        architect: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
assistantChatSchema.index({ client: 1, project: 1 }, { unique: true });

export default mongoose.model("AssistantChat", assistantChatSchema);
