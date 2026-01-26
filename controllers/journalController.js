// controllers/journalController.js
import JournalEntry from "../models/JournalEntry.js";
import WeeklySchedule from "../models/WeeklySchedule.js";
import Group from "../models/Groups.js";
import mongoose from "mongoose";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { createLog } from "./logController.js";

// Helper: Санаро ҳамеша ба вақти Душанбе (Asia/Dushanbe) табдил медиҳем
// Create formatter once to reuse (Performance optimization)
const dushanbeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dushanbe",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const getDushanbeDateString = (date) => {
  return dushanbeFormatter.format(new Date(date));
};

export const getJournalEntry = async (req, res) => {
  try {
    let { date, shift, slot, groupId, subjectId } = req.params;
    const currentUserId = req.user.id;

    // shift-ро ба number табдил медиҳем
    if (shift === "first" || shift === "1") shift = 1;
    else if (shift === "second" || shift === "2") shift = 2;
    else return res.status(400).json({ message: "shift нодуруст аст!" });

    const targetDate = new Date(date);
    const dayOfWeekEn = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][targetDate.getDay()];
    const lessonSlot = Number(slot);

    // 1. Determine semester based on date
    let semester = 1;
    if (targetDate.getMonth() >= 1 && targetDate.getMonth() <= 5) { // Feb-Jun
      semester = 2;
    }

    // 2. Ҷадвали махсуси ҳамин гурӯҳро мегирем (бо назардошти семестр)
    const query = { groupId: new mongoose.Types.ObjectId(groupId) };
    if (semester === 1) {
      query.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      query.semester = semester;
    }

    const schedule = await WeeklySchedule.findOne(query).populate([
      { path: "week.lessons.subjectId", select: "name" },
      { path: "week.lessons.teacherId", select: "fullName" },
    ]);

    if (!schedule) {
      return res.status(404).json({ message: "Ҷадвали ин гурӯҳ ёфт нашуд" });
    }

    // 2. Дарси лозимиро дар ҷадвал меёбем (барои ҳамин вақт ва ҳамин фан)
    const dayData = schedule.week.find((d) => d.day === dayOfWeekEn);
    if (!dayData) {
      return res.status(404).json({ message: "Дар ин рӯз дарс нест" });
    }

    const lesson = dayData.lessons[lessonSlot - 1];
    if (!lesson || !lesson.subjectId || String(lesson.subjectId._id) !== subjectId) {
      return res.status(404).json({ message: "Дар ин вақт ин фан дар ҷадвал нест" });
    }

    // shift-ро месанҷем
    const timeStart = lesson.time.split(" - ")[0];
    const lessonShift = timeStart >= "13:00" ? 2 : 1;
    if (lessonShift !== shift) {
      return res.status(400).json({ message: "Басти дарс (shift) мувофиқат намекунад" });
    }

    const targetTeacherId = lesson.teacherId?._id;

    // 3. Журналро меҷӯем (ё эҷод мекунем)
    let journal = await JournalEntry.findOne({
      date: targetDate,
      shift,
      lessonSlot,
      groupId,
      subjectId,
    }).populate({
      path: "students.studentId",
      select: "fullName",
    });

    if (!journal) {
      const group = await Group.findById(groupId).populate("students");
      if (!group) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

      const studentsRecords = group.students.map((st) => ({
        studentId: st._id,
        attendance: "absent",
        preparationGrade: null,
        taskGrade: null,
        notes: "",
      }));

      journal = await JournalEntry.create({
        date: targetDate,
        shift,
        lessonSlot,
        groupId,
        subjectId,
        teacherId: targetTeacherId,
        lessonType: lesson.lessonType || "practice",
        students: studentsRecords,
      });

      await journal.populate("students.studentId", "fullName");
    }
    res.json(journal);
  } catch (err) {
    console.error("getJournalEntry error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};
export const updateJournalEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { students, topic } = req.body;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    const journal = await JournalEntry.findById(id);

    if (!journal) return res.status(404).json({ message: "Журнал ёфт нашуд" });

    // АДМИН ҲАМЕША ИҶОЗАТ ДОРАД
    if (currentUserRole !== "admin" && journal.teacherId.toString() !== currentUserId) {
      return res.status(403).json({ message: "Дастрасӣ манъ аст" });
    }

    // Update topic if provided
    if (topic !== undefined) {
      journal.topic = topic;
    }

    // Check for changes to log (Optimization: only log if something changed)
    // For simplicity, we log that "Grades/Attendance updated"
    // Ideally we would compare oldJournal vs newJournal students

    // Log the action
    await createLog(
      "UPDATE_JOURNAL",
      currentUserId,
      currentUserRole,
      {
        journalId: id,
        groupId: journal.groupId,
        subjectId: journal.subjectId,
        date: journal.date
      }
    );

    journal.students = students;
    journal.markModified("students");
    await journal.save();

    await journal.populate("students.studentId", "firstName lastName fullName");

    res.json(journal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Хатогии сервер" });
  }
};
export const getLessonsByGroupAndDate = async (req, res) => {
  try {
    const { groupId, date } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "groupId нодуруст аст" });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ message: "Санаи нодуруст" });
    }

    const daysEn = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayOfWeekEn = daysEn[targetDate.getDay()];

    // Определить семестр по дате
    let semester = 1;
    if (targetDate.getMonth() >= 1 && targetDate.getMonth() <= 5) { // Feb-Jun
      semester = 2;
    }



    const query = {
      groupId: new mongoose.Types.ObjectId(groupId),
    };

    if (semester === 1) {
      query.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      query.semester = semester;
    }

    const groupSchedule = await WeeklySchedule.findOne(query)
      .populate({ path: "week.lessons.subjectId", select: "name" })
      .populate({ path: "week.lessons.teacherId", select: "fullName" });

    if (!groupSchedule) {
      return res.json({ lessons: [], groupName: "Гурӯҳ" });
    }

    const dayData = groupSchedule.week.find((d) => d.day === dayOfWeekEn);

    if (!dayData || !dayData.lessons || dayData.lessons.length === 0) {
      return res.json({
        lessons: [],
        groupName: groupSchedule.groupName || "Гурӯҳ",
      });
    }

    const lessons = dayData.lessons
      .map((lesson, index) => {
        if (!lesson || !lesson.subjectId) return null;

        const isSecondShift =
          lesson.time.includes("13:") ||
          lesson.time.includes("14:") ||
          lesson.time.includes("15:");
        const shift = isSecondShift ? 2 : 1;
        const slot = index + 1;

        return {
          subjectName: lesson.subjectId.name,
          subjectId: lesson.subjectId._id,
          teacherName: lesson.teacherId?.fullName || "Муаллим нест",
          teacherId: lesson.teacherId?._id,
          lessonType: lesson.lessonType || "practice",
          shift,
          slot,
        };
      })
      .filter((l) => l !== null);

    const group = await Group.findById(groupId).select("name");
    const groupName = group?.name || "Гурӯҳ";

    res.status(200).json({ lessons, groupName });
  } catch (err) {
    console.error("getLessonsByGroupAndDate error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};
export const getWeeklyAttendance = async (req, res) => {
  try {
    const { groupId } = req.params;
    const weekParam = parseInt(req.query.week);
    const semesterParam = parseInt(req.query.semester);

    // 1. Determine Academic Year Start (Sep 1 of current academic cycle)
    // If today is Sept-Dec, academic year starts this year.
    // If today is Jan-Aug, academic year started previous year.
    const now = new Date();
    const currentYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

    // 2. Determine Semester and Semester Start Date
    let semester = semesterParam;
    if (!semester) {
      // Auto-detect if not provided
      semester = (now.getMonth() >= 1 && now.getMonth() <= 5) ? 2 : 1;
    }

    let semesterStart;
    if (semester === 2) {
      semesterStart = new Date(currentYear + 1, 1, 1); // 1 Феврал
    } else {
      semesterStart = new Date(currentYear, 8, 1); // 1 Сентябр
    }

    // 3. Determine Week Number
    // If week is provided, use it. If not, calculate current week relative to semesterStart (if we are in that semester)
    let weekNumber = weekParam;
    if (!weekNumber) {
      const diffTime = Math.abs(now.getTime() - semesterStart.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      weekNumber = Math.ceil(diffDays / 7);
      if (weekNumber < 1) weekNumber = 1;
    }

    // 4. Calculate Week Start and End Dates based on Week Number
    const weekStart = new Date(semesterStart);
    weekStart.setDate(semesterStart.getDate() + (weekNumber - 1) * 7);

    // Adjust to Monday if needed? The original code simply added 0..6 days to weekStart.
    // Original logic: "1 сентябр" is fixed anchor. 
    // If Sep 1 is Friday, then Week 1 starts Friday? 
    // Usually weeks should align with Monday. 
    // The current logic just calculates pure 7-day chunks from Sep 1. Let's stick to that for consistency unless requested otherwise.

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // Маълумотҳо аз JournalEntry
    const journals = await JournalEntry.find({
      groupId,
      date: { $gte: weekStart, $lte: weekEnd }
    })
      .populate("students.studentId", "fullName")
      .sort({ date: 1, lessonSlot: 1 });

    const group = await Group.findById(groupId).populate("students");
    if (!group) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    // 6 рӯз: Душанбе то Шанбе. 
    const days = [];
    let currentDayIter = new Date(weekStart);

    // Loop until we have 6 days OR we exceed a reasonable range (e.g. 2 weeks safety)
    while (days.length < 6) {
      // Create independent date object
      const dateToCheck = new Date(currentDayIter);

      // Skip Sunday (0)
      if (dateToCheck.getDay() !== 0) {
        days.push({
          date: format(dateToCheck, "dd.MM"),
          weekday: format(dateToCheck, "EEEE", { locale: ru }),
          fullDate: dateToCheck // Store full date object for matching
        });
      }

      // Move to next day
      currentDayIter.setDate(currentDayIter.getDate() + 1);

      // Safety break to prevent infinite loop if weird logic
      if (Math.abs((currentDayIter - weekStart) / (1000 * 60 * 60 * 24)) > 14) break;
    }

    // Ҳар донишҷӯ — 6 рӯз × 6 дарс
    const students = group.students.map(st => ({
      _id: st._id,
      fullName: st.fullName || "Ному насаб нест",
      attendance: days.map(day => ({
        date: day.date,
        weekday: day.weekday,
        lessons: Array(6).fill(null).map(() => null) // L1 to L6, initialized to null
      }))
    }));

    // OPTIMIZATION: Create Map for journals by date string
    const journalMap = new Map();
    journals.forEach(j => {
      const dKey = getDushanbeDateString(j.date);
      if (!journalMap.has(dKey)) journalMap.set(dKey, []);
      journalMap.get(dKey).push(j);
    });

    // Пур кардани маълумотҳо
    days.forEach((day, dayIndex) => {
      const dKey = getDushanbeDateString(day.fullDate); // Use the Full Date object stored in day
      const dayJournals = journalMap.get(dKey);

      if (dayJournals) {
        dayJournals.forEach(journal => {
          journal.students.forEach(s => {
            const student = students.find(st => st._id.toString() === s.studentId._id.toString());
            if (student && journal.lessonSlot >= 1 && journal.lessonSlot <= 6) {
              student.attendance[dayIndex].lessons[journal.lessonSlot - 1] = s.attendance;
            }
          });
        });
      }
    });

    res.json({
      groupName: group.name,
      weekNumber,
      semester,
      weekStart: format(weekStart, "dd.MM.yyyy"),
      weekEnd: format(weekEnd, "dd.MM.yyyy"),
      days: days.map(d => ({ date: d.date, weekday: d.weekday })),
      students
    });
  } catch (err) {
    console.error("getWeeklyAttendance error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};
export const getWeeklyGrades = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { subjectId, semester } = req.query; // Accept semester from query

    const currentYear = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    let semesterStart = new Date(currentYear, 8, 1);
    const today = new Date();

    // 1. Determine Semester
    let targetSemester = 1;

    if (semester) {
      targetSemester = Number(semester);
    } else {
      // Logic to auto-detect semester
      const now = new Date();
      if (now.getMonth() >= 1 && now.getMonth() <= 5) {
        targetSemester = 2; // Feb-Jun
      }
    }

    // 2. Adjust semesterStart based on targetSemester
    // If Semester 1: Sep 1 of current academic year
    // If Semester 2: Feb 1 of current academic year
    if (targetSemester === 2) {
      semesterStart = new Date(currentYear + 1, 1, 2); // Feb 2nd
    } else {
      semesterStart = new Date(currentYear, 8, 1); // Sep 1st
    }

    // Query for Journals
    const query = {
      groupId,
      date: { $gte: semesterStart }, // Fetch everything from semester start
    };
    // Note: Removed $lte: today to ensure we see future grades if they exist (unlikely but safer), or keep it?
    // User logic usually wants "up to now", but admin might want to see full range.
    // Let's keep it bounded by Today or end of semester for correctness?
    // Actually, simple $gte is enough for "current semester context".

    if (subjectId) {
      query.subjectId = subjectId;
    }

    const journals = await JournalEntry.find(query)
      .populate({ path: "subjectId", select: "name _id" })
      .populate({ path: "students.studentId", select: "fullName _id" })
      .lean();

    const group = await Group.findById(groupId).populate({
      path: "students",
      select: "fullName _id",
    }).lean();

    if (!group) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    // Schedule Query Logic
    const scheduleQuery = { groupId };
    if (targetSemester === 1) {
      scheduleQuery.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      scheduleQuery.semester = targetSemester;
    }

    const schedule = await WeeklySchedule.findOne(scheduleQuery).populate("week.lessons.subjectId", "name _id").lean();

    const subjectMap = new Map();
    if (schedule) {
      schedule.week.forEach((day) => {
        day.lessons.forEach((lesson) => {
          if (lesson.subjectId) {
            subjectMap.set(lesson.subjectId._id.toString(), lesson.subjectId.name);
          }
        });
      });
    }
    journals.forEach((j) => {
      if (j.subjectId) {
        subjectMap.set(j.subjectId._id.toString(), j.subjectId.name);
      }
    });

    const subjects = Array.from(subjectMap.entries()).map(([id, name]) => ({
      _id: id,
      name,
    }));

    const weeklyLessonCounts = {};
    if (schedule) {
      schedule.week.forEach((day, dayIndex) => {
        const weekNumber = Math.floor(dayIndex / 6) + 1;
        day.lessons.forEach((lesson) => {
          if (lesson.subjectId) {
            const subjId = lesson.subjectId._id.toString();
            if (!weeklyLessonCounts[subjId]) weeklyLessonCounts[subjId] = {};
            if (!weeklyLessonCounts[subjId][weekNumber]) weeklyLessonCounts[subjId][weekNumber] = 0;
            weeklyLessonCounts[subjId][weekNumber]++;
          }
        });
      });
    }

    // MAP JOURNALS BY DATE
    const journalsByDate = new Map();
    journals.forEach(j => {
      const dKey = getDushanbeDateString(new Date(j.date));
      if (!journalsByDate.has(dKey)) journalsByDate.set(dKey, []);
      journalsByDate.get(dKey).push(j);
    });

    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weeks = [];
    let currentWeekStart = new Date(semesterStart);
    let weekNum = 1;

    while (weekNum <= 16) {
      const days = [];
      for (let i = 0; i < 6; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(currentWeekStart.getDate() + i);
        if (false) break; // Allow future dates

        const dateStr = getDushanbeDateString(date);
        const dayOfWeek = daysEn[date.getDay()];
        const scheduleDay = schedule?.week.find(d => d.day === dayOfWeek);

        const lessonsTemplate = Array(6).fill(null).map(() => ({
          attendance: null,
          preparationGrade: null,
          taskGrade: null,
          subjectId: null,
          subjectName: "—",
          lessonType: null,
        }));

        if (scheduleDay) {
          scheduleDay.lessons.forEach((l, idx) => {
            if (l.subjectId && idx < 6) {
              lessonsTemplate[idx].subjectId = l.subjectId._id.toString();
              lessonsTemplate[idx].subjectName = l.subjectId.name;
              lessonsTemplate[idx].lessonType = l.lessonType || "practice";
            }
          });
        }

        days.push({
          date: format(date, "dd.MM"),
          weekday: format(date, "EEEE", { locale: ru }),
          fullDate: date,
          lessonsTemplate,
          dateStr // Needed for mapping
        });
      }

      if (days.length > 0) {
        weeks.push({
          weekNumber: weekNum,
          days,
        });
      }
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekNum++;
    }

    const students = group.students.map((st) => ({
      _id: st._id.toString(),
      fullName: st.fullName || "Ному насаб нест",
      grades: weeks.flatMap((w) =>
        w.days.map((day) => {
          // Clone the template for this student
          const lessons = day.lessonsTemplate.map(l => ({ ...l }));

          // Get journals for this specific day
          const daysJournals = journalsByDate.get(day.dateStr);

          if (daysJournals) {
            daysJournals.forEach(journal => {
              // Find this student's entry in the journal
              const sEntry = journal.students.find(s => s.studentId._id.toString() === st._id.toString());

              if (sEntry && journal.lessonSlot >= 1 && journal.lessonSlot <= 6) {
                const lesson = lessons[journal.lessonSlot - 1];
                lesson.attendance = sEntry.attendance;
                lesson.preparationGrade = sEntry.preparationGrade;
                lesson.taskGrade = sEntry.taskGrade;
                lesson.lessonType = journal.lessonType || "practice";

                // Ensure subject ID matches the journal (source of truth)
                if (journal.subjectId) {
                  lesson.subjectId = journal.subjectId._id.toString();
                  lesson.subjectName = journal.subjectId.name;
                }
              }
            });
          }

          return {
            date: day.date,
            weekday: day.weekday,
            weekNumber: w.weekNumber,
            lessons
          };
        })
      ),
    }));

    res.json({
      groupName: group.name,
      students,
      subjects,
      weeklyLessonCounts,
    });
  } catch (err) {
    console.error("getWeeklyGrades error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};
export const getMyAttendance = async (req, res) => {
  try {
    const studentId = req.user?.id; // санҷиши бехатар
    if (!studentId) {
      return res.status(401).json({ message: "Донишҷӯ сабт нашудааст" });
    }

    // Semester logic (mirrors getMyGrades)
    let { semester } = req.query;
    const currentMonth = new Date().getMonth(); // 0=Jan, 11=Dec
    const currentYear = new Date().getFullYear();

    // Default semester if not provided
    if (!semester) {
      if (currentMonth >= 8 || currentMonth <= 0) semester = 1; // Sept-Jan -> Sem 1
      else semester = 2; // Feb-Aug -> Sem 2
    }
    semester = parseInt(semester);

    let semesterStart;
    const isSecondSemester = semester === 2;

    if (isSecondSemester) {
      // Semester 2: Starts ~Feb 10
      // If currently Jan-Aug, it's this year. If Sept-Dec, it implies next year (but usually we query for current/past).
      // Assuming straightforward academic year:
      // If today is late 2025 (Sem 1), asking for Sem 2 means Spring 2026.
      // If today is Spring 2026 (Sem 2), asking for Sem 2 means Spring 2026.
      // Simply: Logic from getMyGrades
      if (currentMonth >= 8) {
        // We are in Sem 1 (Autumn), Sem 2 is next year
        semesterStart = new Date(currentYear + 1, 1, 2);
      } else {
        // We are in Sem 2 (Spring) or Summer, it's this year
        semesterStart = new Date(currentYear, 1, 2);
      }
    } else {
      // Semester 1: Starts Sept 1
      if (currentMonth >= 0 && currentMonth < 8) {
        // We are in Spring (Jan-Aug), Sem 1 was previous year
        semesterStart = new Date(currentYear - 1, 8, 1);
      } else {
        // We are in Autumn (Sept-Dec), Sem 1 is this year
        semesterStart = new Date(currentYear, 8, 1);
      }
    }

    // Set end date boundary (for data fetching efficiency, though we loop 16 weeks fixedly)
    // Actually, distinct from logic "up to today", usually we want to see the whole semester grid?
    // User complaint: "calculating 20 weeks".
    // Let's standardise to 16 weeks regardless of "today", but don't show future dates if not needed?
    // MyGrades shows 16 weeks. Let's show 16 weeks here too.
    const weeksLimit = 16;

    // We fetch journals for the whole potential semester range
    const semesterEnd = new Date(semesterStart);
    semesterEnd.setDate(semesterStart.getDate() + (weeksLimit * 7));

    // Ҷустуҷӯ барои журналҳои донишҷӯ
    const journals = await JournalEntry.find({
      "students.studentId": { $exists: true }, // optimization: ensure student is in array? No, query inside student array
      "students.studentId": studentId, // Better query
      date: { $gte: semesterStart, $lte: semesterEnd }
    })
      .select("date lessonSlot students.$") // Only fetch specific student from array? Mongoose syntax slightly complex.
      // Simpler: fetch doc, filter in JS. Or "students.studentId": studentId
      .sort({ date: 1, lessonSlot: 1 });

    const weeks = [];
    let currentWeekStart = new Date(semesterStart);
    let weekNumber = 1;

    // Loop exactly 16 weeks
    while (weekNumber <= weeksLimit) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);

      const days = [];
      for (let i = 0; i < 6; i++) {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + i);

        // Filter journals for this day
        // Note: Using JS filter since we fetched a range
        const dayJournals = journals.filter(j =>
          new Date(j.date).toDateString() === dayDate.toDateString()
        );

        const lessons = Array(6).fill("—");

        dayJournals.forEach(j => {
          // Since we queried "students.studentId": studentId, the student SHOULD be there, 
          // but if we didn't use projection `students.$`, we iterate.
          // Earlier I changed find query to include studentId, but returned full docs.
          const studentEntry = j.students.find(s => s.studentId?.toString() === studentId);

          if (studentEntry && j.lessonSlot >= 1 && j.lessonSlot <= 6) {
            const status = studentEntry.attendance;
            const type = j.lessonType === "lecture" ? "Lec" :
              j.lessonType === "lab" ? "Lab" : "Pr";

            // For attendance, we usually just show Status (H/N/L)
            // Maybe adding type hint is useful? For now keep simple status
            lessons[j.lessonSlot - 1] = status === "present" ? "H" :
              status === "absent" ? "N" :
                status === "late" ? "L" : "—";
          }
        });

        days.push({
          date: format(dayDate, "dd.MM"),
          weekday: format(dayDate, "EEEE", { locale: ru }),
          lessons
        });
      }

      weeks.push({
        weekNumber,
        weekStart: format(currentWeekStart, "dd.MM.yyyy"),
        weekEnd: format(weekEnd, "dd.MM.yyyy"),
        days
      });

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekNumber++;
    }

    // Ҳисоби умумӣ
    let total = 0, present = 0;
    weeks.forEach(w =>
      w.days.forEach(d =>
        d.lessons.forEach(l => {
          if (l !== "—") total++;
          if (l === "H") present++;
        })
      )
    );

    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    res.json({
      weeks,
      stats: { total, present, absent: total - present, rate }
    });
  } catch (err) {
    console.error("getMyAttendance error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};


export const getMyGrades = async (req, res) => {
  try {
    const studentId = req.user?.id;
    if (!studentId) {
      return res.status(401).json({ message: "Донишҷӯ сабт нашудааст" });
    }

    // 1) Гурӯҳи донишҷӯро ёфтан
    const group = await Group.findOne({ students: studentId }).select("_id name").lean();
    if (!group) {
      return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });
    }

    const groupId = group._id;

    // 2) Ҷадвали ҳафтаинаи гурӯҳ
    // 2) Ҷадвали ҳафтаинаи гурӯҳ
    // 2) Ҷадвали ҳафтаинаи гурӯҳ
    const now = new Date();
    const currentYear = now.getFullYear();
    const { semester } = req.query; // Accept semester from query

    let targetSemester = 1;
    let semesterStart;
    let isSecondSemester = false;

    // Determine target based on query OR date
    if (semester) {
      targetSemester = Number(semester);
    } else {
      // Logic to auto-detect semester
      if (now.getMonth() + 1 === 12 && now.getDate() >= 22) { // Late Dec
        targetSemester = 1;
      } else if (now.getMonth() === 0) { // Jan
        targetSemester = 1;
      } else if (now.getMonth() + 1 >= 2 && now.getMonth() + 1 <= 6) { // Feb-Jun
        targetSemester = 2;
      } else {
        targetSemester = 1; // Default/Sep-Dec
      }
    }

    // Set dates based on targetSemester
    if (targetSemester === 2) {
      isSecondSemester = true;
      // If current month is before Feb (e.g. looking ahead) or way after, guess year?
      // Usually we look at current academic year.
      // Implementation Detail: if it's Jan 2026, Sem 2 starts Feb 2026.
      // If it's Sep 2025, Sem 2 starts Feb 2026.
      // If currently Sep-Dec (Sem 1), showing Sem 2 is "future".
      // If currently Feb-Jun (Sem 2), showing Sem 1 is "past" (Sep prev year).

      // ROBUST YEAR LOGIC:
      // Academic Year is defined by "Sep of Year X" to "Jun of Year X+1".
      // If now is Sep-Dec 2025 -> Academic Year Start is 2025. Sem 2 is 2026.
      // If now is Jan-Jun 2026 -> Academic Year Start is 2025. Sem 2 is 2026.

      const academicYearStart = (now.getMonth() >= 8) ? currentYear : currentYear - 1;
      semesterStart = new Date(academicYearStart + 1, 1, 1); // Feb 1st of next year
    } else {
      isSecondSemester = false;
      const academicYearStart = (now.getMonth() >= 8) ? currentYear : currentYear - 1;
      semesterStart = new Date(academicYearStart, 8, 1); // Sep 1st
    }

    // Override manual logic with explicit calculation
    // ...

    const scheduleQuery = { groupId };
    if (targetSemester === 1) {
      scheduleQuery.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      scheduleQuery.semester = targetSemester;
    }

    const schedule = await WeeklySchedule.findOne(scheduleQuery)
      .populate("week.lessons.subjectId", "name _id")
      .lean();

    // Logic moved up

    const today = new Date();

    // 3) JournalEntry-ҳо (фақат дар ҳамин семестр ва барои ҳамин student)
    // IMPORTANT: Remove $lte: today to allow viewing full semester (even future if exists, though unlikely)
    // or just to avoid bug where "today" cuts off valid evening grades.
    const journals = await JournalEntry.find({
      "students.studentId": studentId,
      date: { $gte: semesterStart },
    })
      .populate("subjectId", "name _id")
      .select("date lessonSlot subjectId lessonType students.studentId students.taskGrade students.preparationGrade")
      .sort({ date: 1, lessonSlot: 1 })
      .lean();

    if ((!journals || journals.length === 0) && !schedule) {
      return res.json({
        message: "Шумо ҳанӯз баҳо нагирифтаед",
        semester: isSecondSemester ? 2 : 1,
        semesterStart: getDushanbeDateString(semesterStart),
        weeks: [],
        stats: { total: 0, average: 0, maxGrade: 0, minGrade: 0 },
      });
    }

    // 4) Map journals бо date барои lookup O(1)
    const journalsByDate = new Map();
    journals.forEach((j) => {
      const dKey = getDushanbeDateString(j.date);
      if (!journalsByDate.has(dKey)) journalsByDate.set(dKey, []);
      journalsByDate.get(dKey).push(j);
    });

    // 5) Сохтани ҳафтаҳо (1-16 ҳафта)
    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const weeks = [];
    let currentWeekStart = new Date(semesterStart);
    let weekNumber = 1;

    while (currentWeekStart <= today && weekNumber <= 16) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);

      const days = [];

      // Душанбе то Шанбе (6 рӯз)
      for (let i = 0; i < 6; i++) {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + i);
        if (dayDate > today) break;

        const dayOfWeek = daysEn[dayDate.getDay()];
        const dayData = schedule?.week?.find((d) => d.day === dayOfWeek);

        // Template барои 6 дарс
        const lessons = Array(6)
          .fill(null)
          .map(() => ({
            grade: "—",
            subject: "—",
          }));

        // Аз schedule фанҳоро пур мекунем (то фан нишон диҳад ҳатто агар баҳо набошад)
        if (dayData?.lessons?.length) {
          dayData.lessons.forEach((lesson, index) => {
            if (index < 6 && lesson?.subjectId) {
              lessons[index] = {
                grade: "—",
                subject: lesson.subjectId.name || "—",
                lessonType: lesson.lessonType || "practice", // Capture type
              };
            }
          });
        }

        // ✅ ИН ҶО FIX: dayJournals define мешавад
        const dKey = getDushanbeDateString(dayDate);
        const dayJournals = journalsByDate.get(dKey) || [];

        // пур кардани баҳоҳо аз журнал
        dayJournals.forEach((j) => {
          const studentEntry = j.students.find(
            (s) => s.studentId?.toString() === studentId
          );

          if (!studentEntry) return;

          if (j.lessonSlot >= 1 && j.lessonSlot <= 6) {
            const grade =
              studentEntry.taskGrade ?? studentEntry.preparationGrade ?? null;

            lessons[j.lessonSlot - 1].grade =
              grade !== null && grade !== undefined ? String(grade) : "—";

            // subject name аз journal (source of truth) агар schedule нест/холӣ бошад
            if (
              lessons[j.lessonSlot - 1].subject === "—" &&
              j.subjectId?.name
            ) {
              lessons[j.lessonSlot - 1].subject = j.subjectId.name;
            }
            // Update type from journal if available
            if (j.lessonType) {
              lessons[j.lessonSlot - 1].lessonType = j.lessonType;
            }
          }
        });

        // Агар дар schedule фан ҳаст, аммо баҳо нест -> 0 (ФАҚАТ АГАР ЛЕКЦИЯ НАБОШАД)
        lessons.forEach((l) => {
          if (l.subject !== "—" && l.grade === "—") {
            if (l.lessonType !== "lecture") {
              l.grade = "0";
            } else {
              l.grade = "—"; // Explicitly keep as dash for lectures
            }
          }
        });

        days.push({
          date: format(dayDate, "dd.MM"),
          weekday: format(dayDate, "EEEE", { locale: ru }),
          lessons,
        });
      }

      if (days.length > 0) {
        weeks.push({
          weekNumber,
          weekStart: format(currentWeekStart, "dd.MM.yyyy"),
          weekEnd: format(weekEnd > today ? today : weekEnd, "dd.MM.yyyy"),
          days,
        });
      }

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekNumber++;
    }

    // 6) Stats ҳисоб мекунем
    let total = 0;
    let sum = 0;
    let gradesArr = [];

    weeks.forEach((w) =>
      w.days.forEach((d) =>
        d.lessons.forEach((l) => {
          const num = parseFloat(l.grade);
          if (!isNaN(num)) {
            total++;
            sum += num;
            gradesArr.push(num);
          }
        })
      )
    );

    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
    const maxGrade = gradesArr.length ? Math.max(...gradesArr) : 0;
    const minGrade = gradesArr.length ? Math.min(...gradesArr) : 0;

    return res.json({
      semester: isSecondSemester ? 2 : 1,
      semesterStart: getDushanbeDateString(semesterStart),
      group: {
        _id: groupId,
        name: group.name,
      },
      weeks,
      stats: {
        total,
        average,
        maxGrade,
        minGrade,
      },
    });
  } catch (err) {
    console.error("getMyGrades error:", err);
    return res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};



export const getAdminNotes = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "groupId нодуруст аст" });
    }

    // Ҳамаи журналҳои ин гурӯҳро меҷӯем
    const journals = await JournalEntry.find({ groupId })
      .populate("subjectId", "name")
      .populate("teacherId", "fullName")
      .populate("groupId", "name")
      .populate("students.studentId", "fullName")
      .select("date subjectId teacherId groupId students")
      .sort({ date: -1 }); // Аз навтарин

    const notes = [];

    journals.forEach((journal) => {
      journal.students.forEach((studentEntry) => {
        // Фақат агар notes дошта бошад ва холӣ набошад
        if (studentEntry.notes && studentEntry.notes.trim() !== "") {
          notes.push({
            date: getDushanbeDateString(journal.date).split("-").reverse().join("."),
            subject: journal.subjectId?.name || "—",
            teacher: journal.teacherId?.fullName || "Муаллим нест",
            group: journal.groupId?.name || "Гурӯҳ",
            studentName: studentEntry.studentId?.fullName || "Донишҷӯ номаълум",
            notes: studentEntry.notes.trim(),
          });
        }
      });
    });

    // Гуруҳбандӣ кардан аз рӯи номи гурӯҳ (барои осонӣ дар frontend)
    const groupedNotes = notes.reduce((acc, note) => {
      const key = note.group;
      if (!acc[key]) acc[key] = [];
      acc[key].push(note);
      return acc;
    }, {});

    // Дар дохили ҳар гурӯҳ аз навтарин то куҳнатар
    Object.keys(groupedNotes).forEach((group) => {
      groupedNotes[group].sort((a, b) => {
        const dateA = new Date(a.date.split(".").reverse().join("-"));
        const dateB = new Date(b.date.split(".").reverse().join("-"));
        return dateB - dateA;
      });
    });

    res.json(groupedNotes);
  } catch (err) {
    console.error("getAdminNotes error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};

// GET — Барои донишҷӯ: эзоҳҳои худи ӯ (аз ҳамаи гурӯҳҳо)
export const getMyNotes = async (req, res) => {
  try {
    const studentId = req.user.id;

    const journals = await JournalEntry.find({
      "students.studentId": studentId,
    })
      .populate("subjectId", "name")
      .populate("teacherId", "fullName")
      .populate("groupId", "name")
      .select("date subjectId teacherId groupId students")
      .sort({ date: -1 });

    const notes = [];

    journals.forEach((journal) => {
      const studentEntry = journal.students.find(
        (s) => s.studentId && s.studentId.toString() === studentId
      );

      if (studentEntry && studentEntry.notes && studentEntry.notes.trim() !== "") {
        notes.push({
          date: getDushanbeDateString(journal.date).split("-").reverse().join("."),
          subject: journal.subjectId?.name || "—",
          teacher: journal.teacherId?.fullName || "Муаллим нест",
          group: journal.groupId?.name || "Гурӯҳ",
          notes: studentEntry.notes.trim(),
        });
      }
    });

    // Гуруҳбандӣ аз рӯи гурӯҳ
    const groupedNotes = notes.reduce((acc, note) => {
      const key = note.group;
      if (!acc[key]) acc[key] = [];
      acc[key].push(note);
      return acc;
    }, {});

    // Сортировка аз навтарин
    Object.keys(groupedNotes).forEach((group) => {
      groupedNotes[group].sort((a, b) => {
        const dateA = new Date(a.date.split(".").reverse().join("-"));
        const dateB = new Date(b.date.split(".").reverse().join("-"));
        return dateB - dateA;
      });
    });

    res.json(groupedNotes);
  } catch (err) {
    console.error("getMyNotes error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};