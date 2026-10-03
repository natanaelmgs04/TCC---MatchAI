import mongoose from "mongoose";

/**
 * Configurações do site editadas pela equipe no painel de gestão (um
 * documento por chave). Hoje: "announcement" — faixa de aviso no topo de
 * todas as páginas (lançamento, manutenção, novidade).
 */
const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed,
    updatedBy: String,
  },
  { timestamps: true },
);

export default mongoose.model("SiteSetting", siteSettingSchema);
