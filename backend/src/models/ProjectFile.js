import mongoose from "mongoose";

/**
 * Arquivo técnico do Espaço do projeto (planta, PDF, DWG, planilha…). O
 * conteúdo fica no GridFS (bucket "projectfiles", ver services/projectFileStore.js);
 * aqui só os dados. Arquivos com o mesmo nome na mesma etapa viram versões
 * (v1, v2…), e o cliente aprova ou pede ajustes em cada versão que o
 * arquiteto envia.
 */
const projectFileSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    stage: String,
    kind: { type: String, enum: ["doc", "diary"], default: "doc" }, // diary = foto do diário de obra
    name: { type: String, required: true },
    ext: String,
    mime: String,
    size: Number,
    version: { type: Number, default: 1 },
    file: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Comentários marcados num ponto do arquivo (imagem ou página do PDF):
    // x/y em fração da largura/altura, para valer em qualquer tamanho de tela.
    annotations: [
      {
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        page: { type: Number, default: 1 },
        x: Number,
        y: Number,
        text: { type: String, maxlength: 600 },
        resolved: { type: Boolean, default: false },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    review: {
      status: { type: String, enum: ["none", "approved", "changes"], default: "none" },
      comment: String,
      at: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model("ProjectFile", projectFileSchema);
