import mongoose from "mongoose";

/**
 * Produto de uma loja parceira — é isso que a IA casa contra o estilo/materiais
 * de um projeto em storeMatchService.suggestProductsForProject. Entra de dois
 * jeitos: cadastrado à mão no painel (`source: "manual"`) ou importado do
 * catálogo público que a própria loja indicou (`source: "import"`, ver
 * services/catalogImporter.js), identificado por `externalId` para que uma nova
 * sincronização atualize em vez de duplicar.
 */
const storeProductSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    photo: String,
    category: String,
    styles: [String],
    tags: [String],
    price: Number,
    purchaseUrl: String,
    source: { type: String, enum: ["manual", "import"], default: "manual" },
    externalId: String,
  },
  { timestamps: true },
);

storeProductSchema.index({ store: 1, externalId: 1 });

export default mongoose.model("StoreProduct", storeProductSchema);
