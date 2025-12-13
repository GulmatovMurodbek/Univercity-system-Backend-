import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin"], default: "admin" },
    phone: { type: String },
    dateOfBirth: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Admin", AdminSchema);