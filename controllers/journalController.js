// controllers/journalController.js
import JournalEntry from "../models/JournalEntry.js";
import WeeklySchedule from "../models/WeeklySchedule.js";
import Group from "../models/Groups.js";
import mongoose from "mongoose";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

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

    // 1. Ҷадвали махсуси ҳамин гурӯҳро мегирем
    const schedule = await WeeklySchedule.findOne({ groupId }).populate([
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
    const { students } = req.body;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    const journal = await JournalEntry.findById(id);

    if (!journal) return res.status(404).json({ message: "Журнал ёфт нашуд" });

    // АДМИН ҲАМЕША ИҶОЗАТ ДОРАД
    if (currentUserRole !== "admin" && journal.teacherId.toString() !== currentUserId) {
      return res.status(403).json({ message: "Дастрасӣ манъ аст" });
    }

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

    const groupSchedule = await WeeklySchedule.findOne({
      groupId: new mongoose.Types.ObjectId(groupId),
    })
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

    // 1 сентябри соли ҷорӣ (агар сентябр гузашта бошад — соли гузашта)
    const currentYear = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const semesterStart = new Date(currentYear, 8, 1); // 1 сентябр

    const weekNumber = weekParam || Math.max(1, Math.ceil((new Date().getTime() - semesterStart.getTime()) / (7 * 24 * 60 * 60 * 1000)));

    // Ҳафтаи интихобшуда
    const weekStart = new Date(semesterStart);
    weekStart.setDate(semesterStart.getDate() + (weekNumber - 1) * 7);
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

    // 6 рӯз: Душанбе то Шанбе
    const days = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      days.push({
        date: format(date, "dd.MM"),
        weekday: format(date, "EEEE", { locale: ru }),
        fullDate: date
      });
    }

    // Ҳар донишҷӯ — 6 рӯз × 6 дарс
    const students = group.students.map(st => ({
      _id: st._id,
      fullName: st.fullName || "Ному насаб нест",
      attendance: days.map(day => ({
        date: day.date,
        weekday: day.weekday,
        lessons: Array(6).fill(null).map(() => null) // L1 to L6
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
    // Iterate days, look up journals in Map (O(1)) instead of array find
    days.forEach((day, dayIndex) => {
      const dKey = getDushanbeDateString(day.fullDate);
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
    const { subjectId } = req.query;

    const currentYear = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const semesterStart = new Date(currentYear, 8, 1);
    const today = new Date();

    const query = {
      groupId,
      date: { $gte: semesterStart, $lte: today },
    };

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

    const schedule = await WeeklySchedule.findOne({ groupId }).populate("week.lessons.subjectId", "name _id").lean();

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

    while (currentWeekStart <= today && weekNum <= 16) {
      const days = [];
      for (let i = 0; i < 6; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(currentWeekStart.getDate() + i);
        if (date > today) break;

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

    // Соли ҷорӣ барои семестр
    const currentYear = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const semesterStart = new Date(currentYear, 8, 1);
    const today = new Date();

    // Ҷустуҷӯ барои журналҳои донишҷӯ
    const journals = await JournalEntry.find({
      "students.studentId": { $exists: true },
      date: { $gte: semesterStart, $lte: today }
    })
      .select("date lessonSlot students.studentId students.attendance")
      .sort({ date: 1, lessonSlot: 1 });

    // Ҳифзи ҳафтаҳо аз 1 сентябр
    const weeks = [];
    let currentWeekStart = new Date(semesterStart);
    let weekNumber = 1;

    while (currentWeekStart <= today) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);

      const days = [];
      for (let i = 0; i < 6; i++) {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + i);

        if (dayDate > today) break;

        const dayJournals = journals.filter(j =>
          getDushanbeDateString(j.date) === getDushanbeDateString(dayDate)
        );

        const lessons = Array(6).fill("—"); // пешфарзӣ

        dayJournals.forEach(j => {
          const studentEntry = j.students.find(
            s => s.studentId?.toString() === studentId
          );
          if (studentEntry && j.lessonSlot >= 1 && j.lessonSlot <= 6) {
            const status = studentEntry.attendance;
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
        weekEnd: format(weekEnd > today ? today : weekEnd, "dd.MM.yyyy"),
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

    const group = await Group.findOne({ students: studentId }).select('_id');
    if (!group) {
      return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });
    }
    const groupId = group._id;

    const schedule = await WeeklySchedule.findOne({ groupId }).populate('week.lessons.subjectId', 'name');

    const now = new Date();
    const currentYear = now.getFullYear();

    // Муайян кардани семестри ҷорӣ
    // Семестри 1: сентябр то 21 декабр
    // Истгоҳ: 22 декабр то 31 январ
    // Семестри 2: аз 1 феврал

    let semesterStart;
    let isSecondSemester = false;

    if (now.getMonth() + 1 === 12 && now.getDate() >= 22) {
      // Аз 22 декабр — истгоҳ
      isSecondSemester = false;
      const startYear = currentYear;
      semesterStart = new Date(startYear, 8, 1); // 1 сентябр
    } else if (now.getMonth() >= 0 && now.getMonth() <= 0) { // январ
      // Январ — ҳанӯз истгоҳ аст → семестри 1 тамом шуд
      isSecondSemester = false;
      const startYear = currentYear - 1;
      semesterStart = new Date(startYear, 8, 1);
    } else if (now.getMonth() + 1 >= 2) { // феврал ва баъд
      isSecondSemester = true;
      semesterStart = new Date(currentYear, 1, 1); // 1 феврал
    } else {
      // сентябр то 21 декабр — семестри 1
      isSecondSemester = false;
      const startYear = now.getMonth() + 1 >= 9 ? currentYear : currentYear - 1;
      semesterStart = new Date(startYear, 8, 1); // 1 сентябр
    }

    const today = new Date();

    const journals = await JournalEntry.find({
      "students.studentId": studentId,
      date: { $gte: semesterStart, $lte: today }
    })
      .populate("subjectId", "name")
      .select("date lessonSlot subjectId students")
      .sort({ date: 1, lessonSlot: 1 })
      .lean();

    if (!journals.length && !schedule) {
      return res.json({
        message: "Шумо ҳанӯз баҳо нагирифтаед",
        weeks: [],
        stats: { total: 0, average: 0, maxGrade: 0, minGrade: 0 }
      });
    }

    // OPTIMIZATION: Map journals by date for O(1) lookup
    const journalsByDate = new Map();
    journals.forEach(j => {
      const dKey = getDushanbeDateString(new Date(j.date));
      if (!journalsByDate.has(dKey)) journalsByDate.set(dKey, []);
      journalsByDate.get(dKey).push(j);
    });

    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weeks = [];
    let currentWeekStart = new Date(semesterStart);
    let weekNumber = 1;

    while (currentWeekStart <= today && weekNumber <= 16) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);

      const days = [];
      for (let i = 0; i < 6; i++) {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + i);
        if (dayDate > today) break;

        const dayOfWeek = daysEn[dayDate.getDay()];
        const dayData = schedule?.week.find(d => d.day === dayOfWeek);

        const lessons = Array(6).fill(null).map(() => ({ grade: "—", subject: "—" }));

        if (dayData) {
          dayData.lessons.forEach((lesson, index) => {
            if (lesson.subjectId) {
              lessons[index] = { grade: "—", subject: lesson.subjectId.name || "—" };
            }
          });
        }

        dayJournals.forEach(j => {
          const studentEntry = j.students.find(s => s.studentId?.toString() === studentId);
          if (studentEntry && j.lessonSlot >= 1 && j.lessonSlot <= 6) {
            const grade = studentEntry.taskGrade ?? studentEntry.preparationGrade ?? null;
            lessons[j.lessonSlot - 1].grade = grade !== null ? grade.toString() : "—";
          }
        });

        lessons.forEach(lesson => {
          if (lesson.grade === "—" && lesson.subject !== "—") {
            lesson.grade = "0";
          }
        });

        days.push({
          date: format(dayDate, "dd.MM"),
          weekday: format(dayDate, "EEEE", { locale: ru }),
          lessons
        });
      }

      if (days.length > 0) {
        weeks.push({
          weekNumber,
          weekStart: format(currentWeekStart, "dd.MM.yyyy"),
          weekEnd: format(weekEnd > today ? today : weekEnd, "dd.MM.yyyy"),
          days
        });
      }

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekNumber++;
    }

    let total = 0, sum = 0, grades = [];
    weeks.forEach(w =>
      w.days.forEach(d =>
        d.lessons.forEach(l => {
          const num = parseFloat(l.grade);
          if (!isNaN(num)) {
            total++;
            sum += num;
            grades.push(num);
          }
        })
      )
    );

    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
    const maxGrade = grades.length > 0 ? Math.max(...grades) : 0;
    const minGrade = grades.length > 0 ? Math.min(...grades) : 0;

    res.json({
      weeks,
      stats: { total, average, maxGrade, minGrade }
    });
  } catch (err) {
    console.error("getMyGrades error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
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