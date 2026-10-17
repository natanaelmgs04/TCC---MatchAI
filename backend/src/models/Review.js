import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    architect: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
    // Cliente que contratou o arquiteto pela plataforma ("avaliação verificada").
    verified: { type: Boolean, default: false },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  },
  { timestamps: true },
);

// Um cliente só tem uma avaliação por arquiteto — sem isso, cliques duplos ou
// reenvios acidentais criavam várias avaliações da mesma pessoa, inflando a
// média sem representar clientes distintos de verdade.
reviewSchema.index({ client: 1, architect: 1 }, { unique: true });

export default mongoose.model("Review", reviewSchema);
