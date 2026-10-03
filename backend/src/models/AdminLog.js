import mongoose from "mongoose";

/** Auditoria do painel da equipe: quem fez o quê, em quem, e quando. */
const adminLogSchema = new mongoose.Schema(
  {
    adminEmail: { type: String, required: true },
    action: { type: String, required: true },
    targetType: String,
    targetId: String,
    targetLabel: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);
adminLogSchema.index({ createdAt: -1 });

export default mongoose.model("AdminLog", adminLogSchema);
