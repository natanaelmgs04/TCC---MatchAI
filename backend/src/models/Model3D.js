import mongoose from "mongoose";

/**
 * Modelo 3D gerado no Estúdio 3D do arquiteto (objeto por texto/foto via Tripo,
 * planta baixa via MeltFlex). O .glb fica no próprio banco (GridFS, bucket
 * "models3d") — os links dos provedores expiram em minutos. O arquiteto pode
 * compartilhar com clientes (sharedWith), e os dois comentam no mesmo modelo.
 */
const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const model3dSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, trim: true, maxlength: 80, required: true },
    kind: { type: String, enum: ["object", "floorplan"], required: true },
    source: { type: String, enum: ["text", "image"], required: true },
    prompt: { type: String, trim: true, maxlength: 1000 },
    provider: { type: String, enum: ["tripo", "meltflex", "demo"], required: true },
    providerTaskId: String,
    status: { type: String, enum: ["queued", "running", "success", "failed"], default: "queued", index: true },
    progress: { type: Number, default: 0 },
    error: String,
    file: mongoose.Schema.Types.ObjectId,      // GridFS: o .glb
    fileSize: Number,
    preview: mongoose.Schema.Types.ObjectId,   // GridFS: imagem de prévia (quando o provedor manda)
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    comments: [commentSchema],
    lastPolledAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Model3D", model3dSchema);
