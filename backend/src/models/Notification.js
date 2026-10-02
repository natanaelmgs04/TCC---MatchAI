import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      required: true,
      enum: ["message", "review", "validation", "cau", "referral", "availability", "timeline", "case-study", "commission", "store", "hire"],
    },
    text: { type: String, required: true },
    link: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
