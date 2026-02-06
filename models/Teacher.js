import mongoose from "mongoose";

const TeacherSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["teacher"], default: "teacher" },
    phone: { type: String },
    dateOfBirth: { type: Date },
    subjects: [{ type: String }],
    isDean: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Teacher", TeacherSchema);
