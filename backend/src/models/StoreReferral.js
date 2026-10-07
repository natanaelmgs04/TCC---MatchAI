import mongoose from "mongoose";

/**
 * Indicação simulada de compra — só existe quando o cliente confirma
 * explicitamente ("Simular compra") a partir da sugestão de produto dentro
 * do projeto, nunca por rastreamento passivo de clique. Mesma fidelidade do
 * resto do projeto: nenhum pagamento real acontece.
 */
const storeReferralSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    commissionRate: { type: Number, default: 0.1 },
    // LGPD: a loja só vê nome e e-mail do cliente se ele autorizou nesta
    // indicação — e ele pode revogar depois (Conta → Privacidade).
    shareContact: { type: Boolean, default: false },
    consentAt: Date,
    consentRevokedAt: Date,
    simulatedAmount: Number,
  },
  { timestamps: true },
);

export default mongoose.model("StoreReferral", storeReferralSchema);
