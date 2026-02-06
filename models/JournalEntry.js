// models/JournalEntry.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const studentRecordSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  attendance: {
    type: String,
    enum: ["present", "absent", "late"],
    default: "absent"
  },
  preparationGrade: { type: Number, min: 0, max: 5, default: null },
  taskGrade: { type: Number, min: 0, max: 5, default: null },
});

const journalEntrySchema = new Schema(
  {
    date: { type: Date, required: true },
    shift: { type: Number, enum: [1, 2], required: true },
    lessonSlot: { type: Number, required: true, min: 1, max: 6 },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    lessonType: {
      type: String,
      enum: ["lecture", "practice", "lab"],
      default: "practice"
    },
    topic: { type: String, default: "" },
    isSubmitted: { type: Boolean, default: false },
    students: [studentRecordSchema]
  },
  { timestamps: true }
);

// Индекс
journalEntrySchema.index({ date: 1, shift: 1, lessonSlot: 1, teacherId: 1 });
journalEntrySchema.index({ groupId: 1, date: 1 });
journalEntrySchema.index({ "students.studentId": 1, date: 1 });

const JournalEntry = mongoose.model("JournalEntry", journalEntrySchema);
export default JournalEntry;
