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
    name: { type: String, required: true },
    ext: String,
    mime: String,
    size: Number,
    version: { type: Number, default: 1 },
    file: { type: mongoose.Schema.Types.ObjectId, required: true },
    review: {
      status: { type: String, enum: ["none", "approved", "changes"], default: "none" },
      comment: String,
      at: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model("ProjectFile", projectFileSchema);
