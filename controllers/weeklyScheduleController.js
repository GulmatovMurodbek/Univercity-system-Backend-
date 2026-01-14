// controllers/scheduleController.js

import WeeklySchedule from "../models/WeeklySchedule.js";

// GET — гирифтани ҷадвал барои гурӯҳ
export const getWeeklySchedule = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (groupId === "ALL") {
      // Истифодаи lean() ва танҳо майдонҳои лозима
      const schedules = await WeeklySchedule.find()
        .populate({
          path: "groupId",
          select: "name shift faculty"
        })
        .populate({
          path: "week.lessons.subjectId",
          select: "name"
        })
        .populate({
          path: "week.lessons.teacherId",
          select: "fullName"
        })
        .lean()
        .exec();

      // Filter out schedules where the group no longer exists
      const validSchedules = schedules.filter(s => s.groupId !== null);
      return res.json(validSchedules);
    }

    // Ҳисоби семестри ҷорӣ (default)
    const now = new Date();
    const currentYear = now.getFullYear();
    let currentSemester = 1;

    // Logic: 
    // Sep (8) - Jan (0) -> Sem 1
    // Feb (1) - Jun (5) -> Sem 2 (roughly)
    if (now.getMonth() >= 1 && now.getMonth() <= 5) {
      currentSemester = 2;
    } else {
      currentSemester = 1;
    }

    const semester = req.query.semester ? parseInt(req.query.semester) : currentSemester;

    // Backward compatibility: If querying Sem 1, found docs with no semester field too
    const query = { groupId };
    if (semester === 1) {
      query.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      query.semester = semester;
    }

    const schedule = await WeeklySchedule.findOne(query)
      .populate("groupId", "name shift faculty")
      .populate("week.lessons.subjectId", "name")
      .populate("week.lessons.teacherId", "fullName")
      .lean()
      .exec();

    if (!schedule) {
      // Fallback: If requesting specific semester but not found, return 404
      // But for backward compatibility, if semester wasn't explicitly requested, maybe try finding ANY schedule? 
      // For now, let's keep it strict or user will be confused.
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
    const { groupId, week, semester } = req.body;

    if (!groupId || !week) {
      return res.status(400).json({ message: "groupId ва week лозим аст" });
    }

    // Default semester if not provided
    let targetSemester = semester;
    if (!targetSemester) {
      const now = new Date();
      if (now.getMonth() >= 1 && now.getMonth() <= 5) targetSemester = 2;
      else targetSemester = 1;
    }

    // Backward compatibility find
    const query = { groupId };
    if (targetSemester === 1) {
      query.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      query.semester = targetSemester;
    }

    let schedule = await WeeklySchedule.findOne(query);

    if (schedule) {
      // Навсозӣ
      schedule.week = week;
      schedule.semester = targetSemester; // Ensure it's set
      await schedule.save();
    } else {
      // Эҷод
      schedule = new WeeklySchedule({ groupId, week, semester: targetSemester });
      await schedule.save();
    }

    // МУҲИМ: Ҳамеша populate мекунем, то номҳоро баргардонем!
    const populatedSchedule = await WeeklySchedule.findById(schedule._id)
      .populate("week.lessons.subjectId", "name")
      .populate("week.lessons.teacherId", "fullName")
      .lean();

    res.json(populatedSchedule);
  } catch (err) {
    console.error("saveWeeklySchedule error:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Маълумотҳо нодуруст" });
    }
    if (err.name === "CastError") {
      return res.status(400).json({ message: "ID нодуруст" });
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
    const teacherId = req.user.id; // аз JWT token

    // Ҳамаи ҷадвалҳо, ки муаллим дар онҳо ҳаст
    const schedules = await WeeklySchedule.find({
      "week.lessons.teacherId": teacherId,
    })
      .populate("groupId", "name shift")
      .populate("week.lessons.subjectId", "name")
      .lean();

    if (!schedules.length) {
      return res.json({
        message: "Шумо ҳанӯз дар ягон гурӯҳ дарс надоред",
        groups: [],
        subjects: [],
        totalHours: 0,
        todayLessons: [],
      });
    }

    const groupsMap = new Map();
    const subjectsSet = new Set();
    let totalHours = 0;
    const todayLessons = [];

    // Рӯзи ҷорӣ барои todayLessons
    const today = new Date();
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDayName = daysOfWeek[today.getDay()];

    schedules.forEach((schedule) => {
      const groupInfo = {
        id: schedule.groupId._id.toString(),
        name: schedule.groupId.name,
        shift: schedule.groupId.shift,
      };
      groupsMap.set(groupInfo.id, groupInfo);

      // Ҳисоби умумӣ (ҳамаи рӯзҳо)
      schedule.week.forEach((day) => {
        day.lessons.forEach((lesson) => {
          // Санҷиши бехатар: teacherId вуҷуд дошта бошад
          if (lesson.teacherId && lesson.teacherId.toString() === teacherId) {
            if (lesson.subjectId?.name) {
              subjectsSet.add(lesson.subjectId.name);
            }
            totalHours += 1;

            // Агар рӯзи имрӯз бошад — ба todayLessons илова мекунем
            if (day.day === currentDayName) {
              todayLessons.push({
                lessonNumber: day.lessons.indexOf(lesson) + 1,
                time: lesson.time || "Номуайян",
                subject: lesson.subjectId?.name || "—",
                group: schedule.groupId.name,
                classroom: lesson.classroom || "—",
                isCurrent: false, // метавонӣ бо вақти ҷорӣ ҳисоб кунӣ
              });
            }
          }
        });
      });
    });

    // Натиҷа
    res.json({
      groups: Array.from(groupsMap.values()),
      subjects: Array.from(subjectsSet),
      totalHours,
      todayLessons, // ← МУҲИМ: барои "Дарсҳои имрӯз"
    });
  } catch (err) {
    console.error("getMyTeachingSchedule error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};