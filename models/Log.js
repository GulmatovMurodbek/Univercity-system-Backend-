import mongoose from "mongoose";

const LogSchema = new mongoose.Schema(
    {
        action: { type: String, required: true }, // e.g., "GRADE_CHANGE", "STUDENT_REMOVE"
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Admin/Teacher ID
        role: { type: String, required: true }, // "admin", "teacher"
        details: { type: mongoose.Schema.Types.Mixed }, // Flexible object for details
        ip: { type: String },
    },
    { timestamps: true }
);

// 🕒 TTL Index: Auto-delete logs after 30 days (2592000 seconds)
LogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export default mongoose.model("Log", LogSchema);
