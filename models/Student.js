import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema(
  {
    // 📌 Маълумоти шахсӣ
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String },
    dateOfBirth: { type: Date },

    // 📌 Маълумоти академикӣ
    course: { type: Number, enum: [1, 2, 3, 4], required: true }, // курси донишҷӯ
    group: { type: String, required: true }, // мисол: "G-12", "CS-23"
    // 📌 Маълумоти мошинӣ / сисфтемавӣ
    role: { type: String, enum: ["student"], default: "student" },

    status: {
      type: String,
      enum: ["active", "inactive", "graduated", "expelled"],
      default: "active",
    },

    paidAmount: { type: Number, default: 0 }, // маблағи пардохтшуда
  },
  { timestamps: true }
);

export default mongoose.model("Student", StudentSchema);
