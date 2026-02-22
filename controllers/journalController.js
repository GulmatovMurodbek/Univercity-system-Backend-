// controllers/journalController.js
import JournalEntry from "../models/JournalEntry.js";
import WeeklySchedule from "../models/WeeklySchedule.js";
import Group from "../models/Groups.js";
import mongoose from "mongoose";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { createLog } from "./logController.js";
import { getSemesterByDate, getAcademicYearStart, getSemesterStartDate } from "../utils/semesterUtils.js";

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

// Helper: Check if date is allowed (Past dates + Current Week only)
const isDateAllowed = (dateCheck) => {
  const d = new Date(dateCheck);
  const now = new Date();

  // Normalize check date to start of day
  const check = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Calculate Sunday of CURRENT week (Max allowed date)
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = current.getDay(); // 0 is Sunday
  const diffToSunday = day === 0 ? 0 : 7 - day; // If Sunday(0), +0. If Mon(1), +6.

  const currentWeekSunday = new Date(current);
  currentWeekSunday.setDate(current.getDate() + diffToSunday);
  currentWeekSunday.setHours(23, 59, 59, 999);

  // Allow if date is <= this coming Sunday
  return check <= currentWeekSunday;
};

export const getJournalEntry = async (req, res) => {
  try {
    let { date, shift, slot, groupId, subjectId } = req.params;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // RULE: Teachers can only access Current Week
    if (currentUserRole === "teacher") {
      if (!isDateAllowed(date)) {
        return res.status(403).json({ message: "Дастрасӣ омӯзгор фақат ба гузашта ва ҳафтаи ҷорӣ маҳдуд аст" });
      }
    }

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
    const semester = getSemesterByDate(targetDate);

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

    // ── Валидатсияи Ҳафтаи Тоқ/Ҷуфт ──────────────────────────────
    const academicYearStart = new Date(
      targetDate.getMonth() >= 8
        ? targetDate.getFullYear()
        : targetDate.getFullYear() - 1,
      8, 1 // 1 Сентябр
    );
    const diffMs = targetDate.getTime() - academicYearStart.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const weekNum = Math.floor(diffDays / 7) + 1;
    const currentWeekType = weekNum % 2 === 0 ? "odd" : "even";

    const wt = lesson.weekType || "all";
    if (wt !== "all" && wt !== currentWeekType) {
      return res.status(403).json({
        message: `Ин дарс танҳо дар ҳафтаҳои ${wt === 'odd' ? 'ТОҚ' : 'ҶУФТ'} дастрас аст`
      });
    }

    // shift-ро месанҷем
    const timeStart = lesson.time.split(" - ")[0];
    const lessonShift = timeStart >= "13:00" ? 2 : 1;
    // FIXED: Use logic consistent with getLessonsByGroupAndDate if possible, or trust user input?
    // Actually, getJournalEntry verifies specifically. 
    // Ideally validation logic should be same. 
    // However, here we just validate IF lesson exists. 
    // We already fixed shift detection in getLessonsByGroupAndDate. 
    // Here we rely on shift passed in params matching reality.

    // Allow flexible check or strict? 
    // Ideally we should do the Same Logic: fetch group shift etc.
    // For now, let's leave the Shift check as is unless it breaks.
    // The main task here is DATE RESTRICTION.

    // BUT wait, older logic:
    // const lessonShift = timeStart >= "13:00" ? 2 : 1;
    // if (lessonShift !== shift) ...
    // This logic IS FLAWED for 13:00 lessons (Shift 1 vs 2).
    // I should fix this too while I am here.

    // Fetch Group for shift check
    const groupData = await Group.findById(groupId).select("shift name");
    const groupShift = groupData ? groupData.shift : 1;

    // Accurate Shift Check
    const hour = parseInt(timeStart.split(":")[0], 10);
    let calculatedShift = 1;
    if (hour >= 14) calculatedShift = 2;
    // For 13:00
    else if (hour === 13) calculatedShift = groupShift === 2 ? 2 : 1;
    else calculatedShift = 1;

    if (calculatedShift !== shift) {
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
        attendance: "present",
        preparationGrade: null,
        taskGrade: null
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
    }

    // Танҳо як бор populate мекунем (барои ҳамаи ҳолатҳо)
    await journal.populate([
      { path: "students.studentId", select: "fullName" },
      { path: "subjectId", select: "name" },
      { path: "groupId", select: "name course" }
    ]);

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

    // RESTRICTION: Teacher can only update CURRENT WEEK
    if (currentUserRole === "teacher") {
      // Allow editing past journals too? Yes, user asked "purra dostup" (full access) for past.
      if (!isDateAllowed(journal.date)) {
        return res.status(403).json({ message: "Шумо наметавонед журнали ҳафтаҳои ояндаро таҳрир кунед" });
      }
    }

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
    journal.isSubmitted = true;
    journal.markModified("students");
    await journal.save();

    await journal.populate("students.studentId", "firstName lastName fullName");

    res.json(journal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Хатогии сервер" });
  }
};

export const bulkUpdateJournalEntries = async (req, res) => {
  try {
    const { updates } = req.body;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: "Updates бояд массив бошад" });
    }

    let totalSavedStudents = 0;
    const results = [];
    const errors = [];
    const scheduleCache = new Map(); // Cache schedules for groups during this request

    for (const update of updates) {
      const { groupId, subjectId, date, shift, slot, teacherId, students, topic, lessonType } = update;
      const targetSlot = Number(slot) || 1;

      let effectiveTeacherId = teacherId;
      if (effectiveTeacherId === "[object Object]" || (effectiveTeacherId && typeof effectiveTeacherId === 'object' && !effectiveTeacherId._id)) {
        effectiveTeacherId = undefined; // Fallback to current user
      } else if (effectiveTeacherId && typeof effectiveTeacherId === 'object' && effectiveTeacherId._id) {
        effectiveTeacherId = effectiveTeacherId._id;
      }

      console.log(`[BULK] Processing ${date} Slot:${targetSlot} Subject:${subjectId}`);

      try {
        // Teacher restriction check (same as single update)
        if (currentUserRole === "teacher" && !isDateAllowed(date)) {
          errors.push(`Санаи ${date} берун аз ҳудуди иҷозатдодашуда аст`);
          continue;
        }

        const dateObj = new Date(date);
        const dayStart = new Date(dateObj);
        dayStart.setUTCHours(0, 0, 0, 0);
        dayStart.setTime(dayStart.getTime() - 5 * 60 * 60 * 1000);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

        // STRICT find: must match lessonSlot
        let journal = await JournalEntry.findOne({
          date: { $gte: dayStart, $lte: dayEnd },
          lessonSlot: targetSlot,
          groupId,
          subjectId,
        });

        if (journal) {
          console.log(`[BULK] Found existing journal: ${journal._id}`);
          if (currentUserRole !== "admin" && journal.teacherId.toString() !== currentUserId) {
            errors.push(`Дастрасӣ манъ: журнали ${journal._id} ба муаллими дигар тааллуқ дорад`);
            continue;
          }

          if (topic !== undefined) journal.topic = topic;
          if (lessonType !== undefined) journal.lessonType = lessonType;

          if (Array.isArray(students)) {
            students.forEach(newSt => {
              const existing = journal.students.find(s =>
                s.studentId.toString() === newSt.studentId.toString()
              );
              if (existing) {
                if (newSt.attendance !== undefined) existing.attendance = newSt.attendance;
                if (newSt.preparationGrade !== undefined) existing.preparationGrade = newSt.preparationGrade;
                if (newSt.taskGrade !== undefined) existing.taskGrade = newSt.taskGrade;
              } else {
                journal.students.push({
                  studentId: newSt.studentId,
                  attendance: newSt.attendance || 'present',
                  preparationGrade: newSt.preparationGrade ?? null,
                  taskGrade: newSt.taskGrade ?? null,
                });
              }
              totalSavedStudents++;
            });
          }
          journal.isSubmitted = true;
          journal.markModified("students");
          await journal.save();
          console.log(`[BULK] Successfully updated journal: ${journal._id}`);
          results.push(journal._id);
        } else {
          // Check schedule for authorization if creating NEW and not admin
          if (currentUserRole !== "admin") {
            let schedule = scheduleCache.get(groupId);
            if (!schedule) {
              schedule = await WeeklySchedule.findOne({ groupId });
              scheduleCache.set(groupId, schedule);
            }

            const dayOfWeekEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(date).getDay()];
            const dayData = schedule?.week.find(d => d.day === dayOfWeekEn);
            const scheduleLesson = dayData?.lessons[targetSlot - 1];
            const assignedTeacherId = scheduleLesson?.teacherId?._id || scheduleLesson?.teacherId;

            if (String(assignedTeacherId) !== String(currentUserId)) {
              errors.push(`Дастрасӣ манъ: дар санаи ${date} ин дарс дар ҷадвал ба шумо тааллуқ надорад`);
              continue;
            }
          }

          console.log(`[BULK] Creating new entry for ${date} Slot:${targetSlot}`);
          journal = await JournalEntry.create({
            date: new Date(date),
            lessonSlot: targetSlot,
            groupId,
            subjectId,
            teacherId: effectiveTeacherId || currentUserId,
            shift: shift || 1,
            lessonType: lessonType || 'practice',
            students: students || [],
            topic: topic || "",
            isSubmitted: true
          });
          totalSavedStudents += (students ? students.length : 0);
          results.push(journal._id);
        }
      } catch (err) {
        console.error("[BULK] Item Error:", err);
        errors.push(`Хатогӣ дар санаи ${date}: ${err.message}`);
      }
    }

    // Log the bulk action
    await createLog(
      "BULK_UPDATE_JOURNAL",
      currentUserId,
      currentUserRole,
      {
        count: results.length,
        studentsCount: totalSavedStudents,
        groupId: updates[0]?.groupId
      }
    );

    res.json({
      message: "Навсозӣ анҷом ёфт",
      saved: results.length,
      studentsCount: totalSavedStudents,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error("bulkUpdateJournalEntries error:", err);
    res.status(500).json({ message: "Хатогии сервер дар вақти навсозии якҷоя" });
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

    // Fetch Group Info + Shift FIRST
    const group = await Group.findById(groupId).select("name shift");
    if (!group) {
      return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });
    }
    const groupShift = group.shift; // 1 or 2

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

    // Определить семестр
    const semester = getSemesterByDate(targetDate);

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
      return res.json({ lessons: [], groupName: group.name });
    }

    const dayData = groupSchedule.week.find((d) => d.day === dayOfWeekEn);

    if (!dayData || !dayData.lessons || dayData.lessons.length === 0) {
      return res.json({
        lessons: [],
        groupName: group.name,
      });
    }

    // ── Ҳисоби ҳафтаи ток/ҷуфт ──────────────────────────────────
    const academicYearStart = new Date(
      targetDate.getMonth() >= 8
        ? targetDate.getFullYear()
        : targetDate.getFullYear() - 1,
      8, 1 // 1 Сентябр
    );
    const diffMs = targetDate.getTime() - academicYearStart.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const weekNum = Math.floor(diffDays / 7) + 1;
    const currentWeekType = weekNum % 2 === 0 ? "odd" : "even";

    const lessons = dayData.lessons
      .map((lesson, idx) => ({ ...lesson.toObject(), originalIndex: idx }))
      .filter((lesson) => {
        if (!lesson || !lesson.subjectId) return false;
        // Фильтр бо weekType: "all" ҳамеша, "odd"/"even" танҳо ҳафтаи мувофиқ
        const wt = lesson.weekType || "all";
        return wt === "all" || wt === currentWeekType;
      })
      .map((lesson) => {
        const timeStart = lesson.time.split(" - ")[0] || "";
        const hour = parseInt(timeStart.split(":")[0], 10);

        let shift = 1;

        if (hour >= 14) {
          shift = 2;
        } else if (hour === 13) {
          shift = groupShift === 2 ? 2 : 1;
        } else {
          shift = 1;
        }

        const slot = lesson.originalIndex + 1;

        return {
          subjectName: lesson.subjectId.name,
          subjectId: lesson.subjectId._id,
          teacherName: lesson.teacherId?.fullName || "Муаллим нест",
          teacherId: lesson.teacherId?._id,
          lessonType: lesson.lessonType || "practice",
          weekType: lesson.weekType || "all",
          shift,
          slot,
        };
      })

    res.status(200).json({ lessons, groupName: group.name });
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

    const targetGroup = await Group.findById(groupId).populate("students");
    if (!targetGroup) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    // 1. Determine Academic Year Start
    const now = new Date();
    const currentYear = getAcademicYearStart(now);

    // 2. Determine Semester and Semester Start Date
    let semester = semesterParam;
    if (!semester) {
      semester = getSemesterByDate(now);
    }

    const semesterStart = getSemesterStartDate(semester, currentYear, targetGroup.course);

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

    if (!targetGroup) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    // 6 рӯз: Душанбе то Шанбе. 
    const days = [];
    let dayIter = new Date(weekStart);

    while (days.length < 6) {
      if (dayIter.getDay() !== 0) { // Skip Sunday
        days.push({
          date: format(dayIter, "dd.MM"),
          weekday: format(dayIter, "EEEE", { locale: ru }),
          fullDate: new Date(dayIter)
        });
      }
      dayIter.setDate(dayIter.getDate() + 1);
    }

    // Ҳар донишҷӯ — 6 рӯз × 6 дарс
    const students = targetGroup.students.map(st => ({
      _id: st._id,
      fullName: st.fullName || "Ному насаб нест",
      attendance: days.map(day => ({
        date: day.date,
        weekday: day.weekday,
        lessons: Array(3).fill(null).map(() => null) // Ҷуфти 1-3 (90 дақиқа)
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
            if (student && journal.lessonSlot >= 1 && journal.lessonSlot <= 3) {
              student.attendance[dayIndex].lessons[journal.lessonSlot - 1] = s.attendance;
            }
          });
        });
      }
    });

    res.json({
      groupName: targetGroup.name,
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
    const { subjectId, semester } = req.query;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "groupId нодуруст аст" });
    }

    const targetGroup = await Group.findById(groupId).populate({
      path: "students",
      select: "fullName _id",
    }).lean();

    if (!targetGroup) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    const now = new Date();
    const currentYear = getAcademicYearStart(now);
    let targetSemester = semester ? Number(semester) : getSemesterByDate(now);
    const semesterStart = getSemesterStartDate(targetSemester, currentYear, targetGroup.course);

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

    // Teacher Filter: only see journals they marked (or were assigned to)
    if (currentUserRole === "teacher") {
      query.teacherId = currentUserId;
    }

    const journals = await JournalEntry.find(query)
      .populate({ path: "subjectId", select: "name _id" })
      .populate({ path: "students.studentId", select: "fullName _id" })
      .sort({ updatedAt: 1 }) // Latest update wins in the frontend mapping loop
      .lean();

    // Schedule Query Logic
    const scheduleQuery = { groupId };
    if (targetSemester === 1) {
      scheduleQuery.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      scheduleQuery.semester = targetSemester;
    }

    const schedule = await WeeklySchedule.findOne(scheduleQuery)
      .populate("week.lessons.subjectId", "name _id")
      .populate("week.lessons.teacherId", "_id")
      .lean();
    const subjectMap = new Map();
    if (schedule) {
      schedule.week.forEach((day) => {
        day.lessons.forEach((lesson) => {
          if (lesson.subjectId) {
            // Teacher Filter: only see their assigned subjects
            const assignedTeacherId = lesson.teacherId?._id || lesson.teacherId;
            if (currentUserRole === "teacher" && String(assignedTeacherId) !== currentUserId) {
              return;
            }
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
      // We calculate for each of the 16 weeks based on lesson parity
      for (let w = 1; w <= 16; w++) {
        const isOddWeek = w % 2 !== 0;
        schedule.week.forEach((dayData) => {
          dayData.lessons.forEach((lesson) => {
            if (lesson.subjectId) {
              // Check week type (odd/even parity)
              if (lesson.weekType === "odd" && !isOddWeek) return;
              if (lesson.weekType === "even" && isOddWeek) return;

              const subjId = lesson.subjectId._id.toString();
              if (!weeklyLessonCounts[subjId]) weeklyLessonCounts[subjId] = {};
              if (!weeklyLessonCounts[subjId][w]) weeklyLessonCounts[subjId][w] = 0;
              weeklyLessonCounts[subjId][w]++;
            }
          });
        });
      }
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
      let dayIter = new Date(currentWeekStart);
      while (days.length < 6) {
        const date = new Date(dayIter);
        if (date.getDay() !== 0) { // Skip Sunday
          const dateStr = getDushanbeDateString(date);
          const dayOfWeek = daysEn[date.getDay()];
          const scheduleDay = schedule?.week.find(d => d.day === dayOfWeek);

          const lessonsTemplate = Array(6).fill(null).map((_, idx) => ({
            lessonSlot: idx + 1,
            attendance: null,
            preparationGrade: null,
            taskGrade: null,
            subjectId: null,
            subjectName: "—",
            lessonType: null,
          }));

          if (scheduleDay) {
            const isOddWeek = weekNum % 2 !== 0;
            scheduleDay.lessons.forEach((l, idx) => {
              if (l.subjectId && idx < 6) {
                // Check week type (odd/even parity)
                if (l.weekType === "odd" && !isOddWeek) return;
                if (l.weekType === "even" && isOddWeek) return;

                lessonsTemplate[idx].subjectId = l.subjectId._id.toString();
                lessonsTemplate[idx].subjectName = l.subjectId.name;
                lessonsTemplate[idx].lessonType = l.lessonType || "practice";
                const tId = l.teacherId?._id || l.teacherId;
                lessonsTemplate[idx].teacherId = tId ? String(tId) : null;
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
        dayIter.setDate(dayIter.getDate() + 1);
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

    const students = targetGroup.students.map((st) => ({
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
                lesson.lessonSlot = journal.lessonSlot;
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
            dateStr: day.dateStr,
            weekday: day.weekday,
            weekNumber: w.weekNumber,
            lessons
          };
        })
      ),
    }));

    res.json({
      groupName: targetGroup.name,
      course: targetGroup.course,
      semesterStart: semesterStart.toISOString(),
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
    const studentId = req.user?.id;
    if (!studentId) {
      return res.status(401).json({ message: "Донишҷӯ сабт нашудааст" });
    }

    // 1) Find student's group and course
    const group = await Group.findOne({ students: studentId }).select("course").lean();
    if (!group) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    // 2) Determine Semester and Start Date
    const now = new Date();
    const currentYear = getAcademicYearStart(now);
    const { semester: semesterParam } = req.query;
    const semester = semesterParam ? parseInt(semesterParam) : getSemesterByDate(now);

    const semesterStart = getSemesterStartDate(semester, currentYear, group.course);

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
      studentId: studentId,
      semester,
      weeks,
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
    const group = await Group.findOne({ students: studentId }).select("_id name course").lean();
    if (!group) {
      return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });
    }

    const groupId = group._id;

    const now = new Date();
    const currentYear = getAcademicYearStart(now);

    // 1. Determine Semester
    const targetSemester = req.query.semester ? Number(req.query.semester) : getSemesterByDate(now);

    // 2. Adjust semesterStart based on targetSemester
    const semesterStart = getSemesterStartDate(targetSemester, currentYear, group.course);

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
        semester: targetSemester,
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
            // Updated Logic: Expose raw data for Frontend transparency
            const status = studentEntry.attendance || "absent";
            const prep = studentEntry.preparationGrade;
            const task = studentEntry.taskGrade;

            const lessonObj = lessons[j.lessonSlot - 1];

            lessonObj.attendance = status;
            lessonObj.preparationGrade = prep; // can be null/undefined
            lessonObj.taskGrade = task; // can be null/undefined

            // Keep legacy 'grade' for fallback/compatibility if needed,
            // but Frontend will prefer the fields above.
            // Logic: if task exists, show task. Else if prep exists, show prep.
            const displayGrade = task ?? prep ?? null;
            lessonObj.grade = displayGrade !== null ? String(displayGrade) : "—";

            // subject name аз journal (source of truth) агар schedule нест/холӣ бошад
            if (
              lessonObj.subject === "—" &&
              j.subjectId?.name
            ) {
              lessonObj.subject = j.subjectId.name;
            }
            // Update type from journal if available
            if (j.lessonType) {
              lessonObj.lessonType = j.lessonType;
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

// GET — Рӯйхати дарсҳое, ки журнал надоранд (барои як рӯзи мушаххас)
export const getMissingAttendance = async (req, res) => {
  try {
    const { date } = req.query;

    // 1. Determine Date (Today or Requested)
    const targetDate = date ? new Date(date) : new Date();
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ message: "Санаи нодуруст" });
    }

    // Determine Day of Week
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

    // 2. Determine Semester
    const semester = getSemesterByDate(targetDate);

    // 3. Find All SCHEDULES for this semester that have lessons on this day
    const query = {};
    if (semester === 1) {
      query.$or = [{ semester: 1 }, { semester: { $exists: false } }];
    } else {
      query.semester = semester;
    }

    // Filter by Teacher if role is teacher
    if (req.user.role === "teacher") {
      query["week.lessons.teacherId"] = req.user.id;
    }

    // Optimization: Filter schedules that actually have lessons on this day
    query["week.day"] = dayOfWeekEn;

    const schedules = await WeeklySchedule.find(query)
      .populate("groupId", "name shift")
      .populate("week.lessons.subjectId", "name")
      .populate("week.lessons.teacherId", "fullName")
      .lean();

    const missingEntries = [];

    // 4. Iterate and Check Journal Entries
    for (const schedule of schedules) {
      const dayData = schedule.week.find((d) => d.day === dayOfWeekEn);
      if (!dayData || !dayData.lessons) continue;

      for (let i = 0; i < dayData.lessons.length; i++) {
        const lesson = dayData.lessons[i];
        if (!lesson.subjectId || !lesson.teacherId) continue; // Skip empty slots

        // Teacher Filter: specifically check if THIS lesson belongs to the teacher
        if (req.user.role === "teacher" && String(lesson.teacherId._id || lesson.teacherId) !== req.user.id) {
          continue;
        }

        // Calculate Slot and Shift
        const slot = i + 1;
        // Shift logic same as getLessonsByGroupAndDate
        const timeStart = lesson.time.split(" - ")[0] || "";
        const hour = parseInt(timeStart.split(":")[0], 10);
        let shift = 1;
        if (hour >= 14) shift = 2;
        else if (hour === 13) shift = schedule.groupId.shift === 2 ? 2 : 1;
        else shift = 1;

        // Check if Journal Exists
        const exists = await JournalEntry.exists({
          groupId: schedule.groupId._id,
          date: {
            $gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
            $lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1),
          },
          lessonSlot: slot,
          subjectId: lesson.subjectId._id,
        });

        if (!exists) {
          missingEntries.push({
            group: schedule.groupId.name,
            teacher: lesson.teacherId.fullName,
            subject: lesson.subjectId.name,
            time: lesson.time,
            slot: slot,
            shift: shift
          });
        }
      }
    }

    res.json({
      date: format(targetDate, "dd.MM.yyyy"),
      count: missingEntries.length,
      missing: missingEntries
    });
  } catch (err) {
    console.error("getMissingAttendance error:", err);
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