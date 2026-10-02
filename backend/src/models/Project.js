import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Preenchido quando os dois lados confirmam a Validation e o projeto
    // "fecha" pela plataforma (ver validationController.createCommissionForClosedValidation).
    architect: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true },
    preferredStyles: [String],
    preferredMaterials: [String],
    budget: {
      min: { type: Number, default: undefined },
      max: { type: Number, default: undefined },
    },
    propertyType: String,
    familySize: Number,
    projectGoals: String,
    preferences: String,
    areaM2: Number,
    // Do fluxo de criação em página cheia (novo-projeto.html + experiencia-3d.html),
    // normalizados em services/projectPreferences.js.
    styleNotes: String,
    stylePicks: [{ question: String, choice: String, styles: [String] }],
    experience: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["draft", "matching", "in_progress", "completed"],
      default: "draft",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Project", projectSchema);
