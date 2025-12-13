// controllers/scheduleController.js

import WeeklySchedule from "../models/WeeklySchedule.js";

// GET — гирифтани ҷадвал барои гурӯҳ
export const getWeeklySchedule = async (req, res) => {
  try {
    const { groupId } = req.params;

    const schedule = await WeeklySchedule.findOne({ groupId })
      .populate({
        path: "week.lessons.subjectId",
        select: "name",
      })
      .populate({
        path: "week.lessons.teacherId",
        select: "fullName",
      })
      .lean(); // .lean() барои тезтар кор кардан

    if (!schedule) {
      return res.status(404).json({ message: "Ҷадвал ёфт нашуд" });
    }

    res.json(schedule);
  } catch (err) {
    console.error("getWeeklySchedule error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};

// POST — Сабт / Навсозӣ
export const saveWeeklySchedule = async (req, res) => {
  try {
    const { groupId, week } = req.body;

    if (!groupId || !week) {
      return res.status(400).json({ message: "groupId ва week лозим аст" });
    }

    let schedule = await WeeklySchedule.findOne({ groupId });

    if (schedule) {
      // Навсозӣ
      schedule.week = week;
      await schedule.save();
    } else {
      // Эҷод кардан
      schedule = await WeeklySchedule.create({ groupId, week });
    }

    // Ҳамеша populate мекунем, то ки фронтенд номҳоро бинад
    const populated = await WeeklySchedule.findById(schedule._id)
      .populate("week.lessons.subjectId", "name")
      .populate("week.lessons.teacherId", "fullName")
      .lean();

    res.status(schedule.isNew ? 201 : 200).json(populated);
  } catch (err) {
    console.error("saveWeeklySchedule error:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Маълумотҳо нодуруст" });
    }
    if (err.name === "CastError") {
      return res.status(400).json({ message: "ID-и нодуруст" });
    }

    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};

// DELETE — Пок кардани ҷадвал
export const deleteWeeklySchedule = async (req, res) => {
  try {
    const { groupId } = req.params;
    const result = await WeeklySchedule.findOneAndDelete({ groupId });

    if (!result) {
      return res.status(404).json({ message: "Ҷадвал ёфт нашуд" });
    }

    res.json({ message: "Ҷадвал бо муваффақият пок карда шуд" });
  } catch (err) {
    console.error("deleteWeeklySchedule error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};

export const getMyTeachingSchedule = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const schedules = await WeeklySchedule.find({
      "week.lessons.teacherId": teacherId,
    })
      .populate("groupId", "name shift")
      .populate("week.lessons.subjectId", "name");

    if (!schedules.length) {
      return res.json({
        message: "Шумо ҳанӯз дар ягон гурӯҳ дарс надоред",
        groups: [],
        subjects: [],
        totalHours: 0,
      });
    }

    const groupsMap = new Map();
    const subjectsSet = new Set();
    let totalHours = 0;

    schedules.forEach((schedule) => {
      if (schedule.groupId) {
        groupsMap.set(schedule.groupId._id.toString(), {
          id: schedule.groupId._id,
          name: schedule.groupId.name,
          shift: schedule.groupId.shift,
        });
      }

      schedule.week.forEach((day) => {
        day.lessons.forEach((lesson) => {
          if (lesson.teacherId.toString() === teacherId) {
            if (lesson.subjectId?.name) {
              subjectsSet.add(lesson.subjectId.name);
            }
            totalHours += 1;
          }
        });
      });
    });

    res.json({
      groups: Array.from(groupsMap.values()),
      subjects: Array.from(subjectsSet),
      totalHours,
    });
  } catch (err) {
    console.error("getMyTeachingSchedule error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};