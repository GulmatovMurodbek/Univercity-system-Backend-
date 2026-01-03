// models/WeeklySchedule.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const LessonSchema = new Schema({
  time: {
    type: String,
    required: true,
  },
  subjectId: {
    type: Schema.Types.ObjectId,
    ref: "Subject",
    default: null,
  },
  teacherId: {
    type: Schema.Types.ObjectId,
    ref: "Teacher",
    default: null,
  },
  classroom: {
    type: String,
    default: "",
  },
  lessonType: {
    type: String,
    enum: ["lecture", "practice", "lab"],
    default: "lecture",
    required: true,
  },
  _id: false, // дар дохили массив ID-и иловагӣ лозим нест
});

const DailyScheduleSchema = new Schema({
  day: {
    type: String,
    required: true,
  },
  lessons: [LessonSchema],
});

const WeeklyScheduleSchema = new Schema(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      unique: true, // як гурӯҳ — як ҷадвал
    },
    week: [DailyScheduleSchema],
  },
  { timestamps: true }
);

// Индекс барои тезтар кор кардан
// Индекс барои тезтар кор кардан
WeeklyScheduleSchema.index({ groupId: 1 });
WeeklyScheduleSchema.index({ "week.day": 1 }); // Барои ҷустуҷӯ аз рӯи рӯз
WeeklyScheduleSchema.index({ "week.lessons.teacherId": 1 }); // Барои муаллимон

export default mongoose.models.WeeklySchedule ||
  mongoose.model("WeeklySchedule", WeeklyScheduleSchema);