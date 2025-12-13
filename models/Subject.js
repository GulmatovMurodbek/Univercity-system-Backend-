import mongoose from "mongoose";

const SubjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    creditHours: { type: Number, required: true },

    // Якчанд муаллим
    teachers: [
      {
        teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
        teacherName: { type: String },
      },
    ],

    groupId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Group",
      required: false
    },

    classroom: {
      type: String,
      required: false,
    }
  },
  { timestamps: true }
);

export default mongoose.model("Subject", SubjectSchema);
