// controllers/journalController.js
import JournalEntry from "../models/JournalEntry.js";
import WeeklySchedule from "../models/WeeklySchedule.js";
import Group from "../models/Groups.js";
import mongoose from "mongoose";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import Subject from "../models/Subject.js";
export const getJournalEntry = async (req, res) => {
  try {
    let { date, shift, slot } = req.params;
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

    // Ҷустуҷӯи ҳамаи ҷадвалҳо
    const allSchedules = await WeeklySchedule.find({}).populate([
      { path: "week.lessons.subjectId", select: "name" },
      { path: "week.lessons.teacherId", select: "fullName" },
    ]);

    let foundLesson = null;
    let targetGroupId = null;
    let targetTeacherId = null;

    for (const schedule of allSchedules) {
      const dayData = schedule.week.find((d) => d.day === dayOfWeekEn);
      if (!dayData || !dayData.lessons[lessonSlot - 1]) continue;

      const lesson = dayData.lessons[lessonSlot - 1];

      // Аз вақт shift-ро муайян мекунем
      const timeStart = lesson.time.split(" - ")[0];
      const lessonShift = timeStart >= "13:00" ? 2 : 1;

      if (lessonShift === shift && lesson.teacherId) {
        foundLesson = lesson;
        targetGroupId = schedule.groupId;
        targetTeacherId = lesson.teacherId._id;
        break;
      }
    }

    if (!foundLesson) {
      return res
        .status(404)
        .json({
          message: "Дар ин рӯз ва слот дарс нест ё ба шумо тааллуқ надорад",
        });
    }

    // Журналро меҷӯем (ё эҷод мекунем)
    let journal = await JournalEntry.findOne({
      date: targetDate,
      shift,
      lessonSlot,
      groupId: targetGroupId,
      teacherId: targetTeacherId,
    }).populate({
      path: "students.studentId",
      select: "fullName", // fullName-ро ҳам илова кун!
    });
    if (!journal) {
      const group = await Group.findById(targetGroupId).populate("students");
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
        groupId: targetGroupId,
        subjectId: foundLesson.subjectId._id,
        teacherId: targetTeacherId,
        students: studentsRecords, // ИНРО ИВАЗ КАРДӢ!
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
      .filter((lesson) => lesson.subjectId)
      .map((lesson, index) => {
        const isSecondShift =
          lesson.time.includes("13:") ||
          lesson.time.includes("14:") ||
          lesson.time.includes("15:");
        const shift = isSecondShift ? 2 : 1;
        const slot = index + 1;

        return {
          subjectName: lesson.subjectId.name,
          teacherName: lesson.teacherId?.fullName || "Муаллим нест",
          shift,
          slot,
        };
      });

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

    // Пур кардани маълумотҳо
    journals.forEach(journal => {
      const dayIndex = days.findIndex(d => d.fullDate.toDateString() === journal.date.toDateString());
      if (dayIndex === -1) return;

      journal.students.forEach(s => {
        const student = students.find(st => st._id.toString() === s.studentId._id.toString());
        if (student && journal.lessonSlot >= 1 && journal.lessonSlot <= 6) {
          student.attendance[dayIndex].lessons[journal.lessonSlot - 1] = s.attendance;
        }
      });
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

    // Ҳисоби оғози семестр (1 сентябр)
    const currentYear = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const semesterStart = new Date(currentYear, 8, 1);
    const today = new Date();

    // Ҳамаи журналҳо аз оғози семестр то имрӯз
    const journals = await JournalEntry.find({
      groupId,
      date: { $gte: semesterStart, $lte: today },
    })
      .populate({ path: "subjectId", select: "name _id" })
      .populate({ path: "students.studentId", select: "fullName _id" })
      .sort({ date: 1, lessonSlot: 1 });

    const group = await Group.findById(groupId).populate({
      path: "students",
      select: "fullName _id",
    });

    if (!group) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    // Ҷадвали ҳафтагӣ барои ҳисоби шумораи дарсҳо дар ҳар ҳафта
    const schedule = await WeeklySchedule.findOne({ groupId }).populate("week.lessons.subjectId", "name _id");

    // Ҷамъоварии ҳамаи фанҳо (аз журнал + аз ҷадвал)
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

    // Ҳисоби шумораи дарсҳои пешбинишуда дар ҳар ҳафта барои ҳар фан
    // { subjectId: { weekNumber: count } }
    const weeklyLessonCounts = {};

    if (schedule) {
      schedule.week.forEach((day, dayIndex) => {
        // Ҳар ҳафта 6 рӯз дорад (индекси 0-5 = ҳафтаи 1, 6-11 = ҳафтаи 2 ва ғ.)
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

    // Сохтани рӯзҳо (то имрӯз, макс. 16 ҳафта)
    const weeks = [];
    let currentWeekStart = new Date(semesterStart);
    let weekNum = 1;

    while (currentWeekStart <= today && weekNum <= 16) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);

      const days = [];
      for (let i = 0; i < 6; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(currentWeekStart.getDate() + i);
        if (date > today) break;

        days.push({
          date: format(date, "dd.MM"),
          weekday: format(date, "EEEE", { locale: ru }),
          fullDate: date,
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

    // Сохтани структураи донишҷӯён
    const students = group.students.map((st) => ({
      _id: st._id.toString(),
      fullName: st.fullName || "Ному насаб нест",
      grades: weeks.flatMap((w) =>
        w.days.map((day) => ({
          date: day.date,
          weekday: day.weekday,
          weekNumber: w.weekNumber,
          lessons: Array(6).fill(null).map(() => ({
            attendance: null,
            preparationGrade: null,
            taskGrade: null,
            subjectId: null,
            subjectName: "—",
          })),
        }))
      ),
    }));

    // Пур кардани баҳоҳо аз журнал
    journals.forEach((journal) => {
      weeks.forEach((w) => {
        // Fix: Use simple YYYY-MM-DD comparison to avoid timezone issues with toDateString
        // MongoDB dates are usually ISO. JS Date objects convert to local. 
        // Best way: Compare formatted strings "YYYY-MM-DD"
        const dayIndex = w.days.findIndex(
          (d) => d.fullDate.toISOString().split('T')[0] === journal.date.toISOString().split('T')[0]
        );
        if (dayIndex === -1) return;

        const globalDayIndex =
          weeks.slice(0, w.weekNumber - 1).reduce((acc, ww) => acc + ww.days.length, 0) + dayIndex;

        journal.students.forEach((s) => {
          const student = students.find((st) => st._id === s.studentId._id.toString());
          if (student && journal.lessonSlot >= 1 && journal.lessonSlot <= 6) {
            const lesson = student.grades[globalDayIndex].lessons[journal.lessonSlot - 1];
            lesson.attendance = s.attendance;
            lesson.preparationGrade = s.preparationGrade;
            lesson.taskGrade = s.taskGrade;
            lesson.subjectId = journal.subjectId?._id?.toString() || null;
            lesson.subjectName = journal.subjectId?.name || "—";
          }
        });
      });
    });

    // Ҷавоби ниҳоӣ
    res.json({
      groupName: group.name,
      students,
      subjects,
      weeklyLessonCounts, // Ин муҳим аст!
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
          j.date.toISOString().split('T')[0] === dayDate.toISOString().split('T')[0]
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

    // Агар дар давраи истгоҳ бошад (22 декабр – 31 январ) → баҳои семестри 1 нишон медиҳем
    // Аммо агар феврал шуд → аз нав аз феврал

    const journals = await JournalEntry.find({
      "students.studentId": studentId,
      date: { $gte: semesterStart, $lte: today }
    })
      .populate("subjectId", "name")
      .select("date lessonSlot subjectId students")
      .sort({ date: 1, lessonSlot: 1 });

    if (!journals.length && !schedule) {
      return res.json({
        message: "Шумо ҳанӯз баҳо нагирифтаед",
        weeks: [],
        stats: { total: 0, average: 0, maxGrade: 0, minGrade: 0 }
      });
    }

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

        // Агар дар давраи истгоҳ бошад (22 декабр – 31 январ) — рӯзҳоро намепурсем
        if (!isSecondSemester && dayDate.getMonth() + 1 === 12 && dayDate.getDate() >= 22) continue;
        if (!isSecondSemester && dayDate.getMonth() === 0) continue; // январ

        const dayOfWeek = daysEn[dayDate.getDay()];
        const dayData = schedule?.week.find(d => d.day === dayOfWeek);

        const lessons = Array(6).fill({ grade: "—", subject: "—" });

        if (dayData) {
          dayData.lessons.forEach((lesson, index) => {
            if (lesson.subjectId) {
              lessons[index] = { grade: "—", subject: lesson.subjectId.name || "—" };
            }
          });
        }

        const dayJournals = journals.filter(j => j.date.toISOString().split('T')[0] === dayDate.toISOString().split('T')[0]);

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
            date: format(journal.date, "dd.MM.yyyy"),
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
          date: format(journal.date, "dd.MM.yyyy"),
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