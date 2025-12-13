import mongoose from "mongoose";

const GroupSchema = new mongoose.Schema(
  {
    // Идентификатор ва номи гуруҳ
    id: { type: String, required: true, unique: true }, // мисол: "CS-301"
    name: { type: String, required: true },

    // Маъlumotҳои академикӣ
    course: { type: Number, required: true, enum: [1, 2, 3, 4] },
    faculty: { type: String, required: true }, // мисол: "Computer Science",

    // 🚀 Илова шуд — басти гурӯҳ
    shift: {
      type: Number,
      required: true,
      enum: [1, 2], // 1 = 08:00–13:50, 2 = 13:00–18:50
    },

    // Маъlumotҳои статсистикӣ
    studentCount: { type: Number, default: 0 },
    subjectCount: { type: Number, default: 0 },

    // Пайвастшавӣ бо Student
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  },
  { timestamps: true }
);

export default mongoose.model("Group", GroupSchema);
