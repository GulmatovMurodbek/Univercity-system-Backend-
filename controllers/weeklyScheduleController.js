// controllers/scheduleController.js

import WeeklySchedule from "../models/WeeklySchedule.js";
import JournalEntry from "../models/JournalEntry.js";

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

// Ёрдамӣ: "" –ро барои ObjectId майдонҳо null мекунад
const sanitizeWeek = (week) => {
  return week.map((day) => ({
    ...day,
    lessons: (day.lessons || []).map((lesson) => ({
      ...lesson,
      subjectId: lesson.subjectId || null,
      teacherId: lesson.teacherId || null,
    })),
  }));
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

    // "" строкаҳоро null мекунем (Mongoose ObjectId cast хатогӣ намедиҳад)
    const cleanWeek = sanitizeWeek(week);

    let schedule = await WeeklySchedule.findOne(query);

    if (schedule) {
      // Навсозӣ
      schedule.week = cleanWeek;
      schedule.semester = targetSemester; // Ensure it's set
      await schedule.save();
    } else {
      // Эҷод
      schedule = new WeeklySchedule({ groupId, week: cleanWeek, semester: targetSemester });
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
    const semester = req.query.semester ? parseInt(req.query.semester) : undefined;

    const query = { groupId };
    if (semester) query.semester = semester;

    const result = await WeeklySchedule.deleteMany(query);

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Ҷадвал ёфт нашуд" });
    }

    res.json({
      message: "Ҷадвал бо муваффақият пок шуд",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("deleteWeeklySchedule error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};

export const getMyTeachingSchedule = async (req, res) => {
  try {
    const teacherId = req.user.id; // аз JWT token

    // Determine current semester
    const now = new Date();
    let currentSemester = 1;
    // Feb (1) - Jun (5) -> Sem 2
    if (now.getMonth() >= 1 && now.getMonth() <= 5) {
      currentSemester = 2;
    }

    // Build query to match teacher (all semesters for groups list)
    const allQuery = {
      "week.lessons.teacherId": teacherId
    };

    // Ҳамаи ҷадвалҳо, ки муаллим дар онҳо ҳаст
    const allSchedules = await WeeklySchedule.find(allQuery)
      .populate("groupId", "name shift course faculty")
      .populate("week.lessons.subjectId", "name")
      .lean();

    if (!allSchedules.length) {
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

    // Рӯзи дархостшуда (ё имрӯз)
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();

    // Determine target semester for totals/today
    let targetSemester = 1;
    if (targetDate.getMonth() >= 1 && targetDate.getMonth() <= 5) {
      targetSemester = 2;
    }

    // Reset time to start of day for accurate Date comparison
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDayName = daysOfWeek[targetDate.getDay()];

    // Get all journal entries for the target date for this teacher to check "isHeld"
    const todayJournals = await JournalEntry.find({
      teacherId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).lean();

    allSchedules.forEach((schedule) => {
      // ALWAYS add to groupsMap regardless of semester (Teacher wants to see all their groups)
      if (schedule.groupId) {
        const groupInfo = {
          _id: schedule.groupId._id.toString(),
          name: schedule.groupId.name,
          shift: schedule.groupId.shift,
          course: schedule.groupId.course,
          faculty: schedule.groupId.faculty,
        };
        groupsMap.set(groupInfo._id, groupInfo);
      }

      // Check if this schedule matches the target semester for filtering lessons/hours
      let matchesSemester = false;
      if (targetSemester === 1) {
        matchesSemester = schedule.semester === 1 || !schedule.semester;
      } else {
        matchesSemester = schedule.semester === 2;
      }

      // Ҳисоби умумӣ ва дарсҳои имрӯз
      schedule.week.forEach((day) => {
        day.lessons.forEach((lesson) => {
          if (lesson.teacherId && lesson.teacherId.toString() === teacherId) {
            // Add subject name to set regardless of semester (or keep it semester-specific? Let's say ALL subjects)
            if (lesson.subjectId?.name) {
              subjectsSet.add(lesson.subjectId.name);
            }

            // Only count hours and today's lessons if matches target semester
            if (matchesSemester) {
              totalHours += 1;

              if (day.day === currentDayName) {
                const lessonSlot = day.lessons.indexOf(lesson) + 1;
                const isHeld = todayJournals.some(j =>
                  j.groupId.toString() === schedule.groupId._id.toString() &&
                  j.subjectId.toString() === lesson.subjectId._id.toString() &&
                  j.lessonSlot === lessonSlot &&
                  Number(j.shift) === Number(schedule.groupId.shift) &&
                  j.isSubmitted === true
                );

                todayLessons.push({
                  lessonNumber: lessonSlot,
                  time: lesson.time || "Номуайян",
                  subject: lesson.subjectId?.name || "—",
                  subjectId: lesson.subjectId?._id,
                  group: schedule.groupId.name,
                  groupId: schedule.groupId._id,
                  shift: schedule.groupId.shift,
                  classroom: lesson.classroom || "—",
                  lessonType: lesson.lessonType || "lecture",
                  isHeld: isHeld,
                  isCurrent: false,
                });
              }
            }
          }
        });
      });
    });

    // Sort todayLessons by lessonNumber
    todayLessons.sort((a, b) => a.lessonNumber - b.lessonNumber);

    res.json({
      groups: Array.from(groupsMap.values()),
      subjects: Array.from(subjectsSet),
      totalHours,
      todayLessons,
    });
  } catch (err) {
    console.error("getMyTeachingSchedule error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};

