import bcrypt from "bcryptjs";
import Student from "../models/Student.js";
import JournalEntry from "../models/JournalEntry.js";
import Group from "../models/Groups.js";
import WeeklySchedule from "../models/WeeklySchedule.js";
import mongoose from "mongoose";

// ✨ Add student
export const addStudent = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      dateOfBirth,
      paidAmount,
      course,
      group,
    } = req.body;

    if (!fullName || !email || !password || !course || !group) {
      return res
        .status(400)
        .json({
          message:
            "FullName, email, password, enrollmentNumber, course and group are required!",
        });
    }

    const exists = await Student.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already used!" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const student = await Student.create({
      fullName,
      email,
      password,
      phone,
      dateOfBirth,
      paidAmount: paidAmount || 0,
      course,
      group,
    });

    res.status(201).json({
      message: "Донишҷӯ илова шуд!",
      student: {
        _id: student._id, // инҷо!
        fullName: student.fullName,
        email: student.email,
      },
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({ error: err.message });
  }
};

// ✨ Get all students
export const getStudents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      query.fullName = { $regex: search, $options: "i" };
    }

    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .populate("group", "name") // Populate group name
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(limit);

    res.json({
      students,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✨ Edit student
export const editStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const student = await Student.findByIdAndUpdate(id, updates, { new: true });
    if (!student)
      return res.status(404).json({ message: "Student not found!" });

    res.json({ message: "Student updated!", student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✨ Delete student
export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findByIdAndDelete(id);
    if (!student)
      return res.status(404).json({ message: "Student not found!" });

    res.json({ message: "Student deleted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findById(id);

    if (!student)
      return res.status(404).json({ message: "Student not found!" });

    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// controllers/studentController.js

// Helper to get semester dates (reused logic)
const getSemesterDates = (sem) => {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  let semester = sem ? parseInt(sem) : (currentMonth >= 8 || currentMonth <= 0 ? 1 : 2);

  let start, end;
  if (semester === 2) {
    // Spring: Feb 10 - June 30 (approx)
    // If we are in Autumn (Sept-Dec), asking for Sem 2 implies next year
    const year = currentMonth >= 8 ? currentYear + 1 : currentYear;
    start = new Date(year, 1, 10); // Feb 10
    end = new Date(year, 5, 30);   // June 30
  } else {
    // Autumn: Sept 1 - Jan 31 (approx)
    // If we are in Spring (Jan-Aug), asking for Sem 1 implies prev year
    const year = (currentMonth >= 0 && currentMonth < 8) ? currentYear - 1 : currentYear;
    start = new Date(year, 8, 1);  // Sept 1
    end = new Date(year + 1, 0, 31); // Jan 31 next year
  }
  return { start, end, semester };
};

export const getMyDashboardStats = async (req, res) => {
  try {
    const studentId = req.user.id;
    if (!studentId) return res.status(401).json({ message: "User not authenticated" });

    // Semester
    const { start, end, semester } = getSemesterDates(req.query.semester);

    const group = await Group.findOne({
      students: new mongoose.Types.ObjectId(studentId)
    }).populate({ path: "students", select: "gpa" }); // Optimize select

    if (!group) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    // GPA is usually global, but let's keep it as is from student profile for now.
    // If we want semester GPA, we'd need to calculate it. For "Current GPA" usually means cumulative.
    const student = group.students.find(s => s._id.toString() === studentId);
    const gpa = student?.gpa || 0;

    // Attendance Rate for THIS Semester
    const presentCount = await JournalEntry.countDocuments({
      "students.studentId": studentId,
      "students.attendance": "present",
      date: { $gte: start, $lte: end }
    });
    const totalClasses = await JournalEntry.countDocuments({
      "students.studentId": studentId,
      date: { $gte: start, $lte: end }
    });

    const attendanceRate = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

    // Subjects count might differ per semester if we had subject-semester mapping.
    // For now, assuming group subjects are total. 
    // Ideally query WeeklySchedule for unique subjects in this semester.
    const schedule = await WeeklySchedule.findOne({
      groupId: group._id,
      $or: [{ semester: semester }, { semester: { $exists: false } }] // Fallback
    });

    // Count unique subjects in schedule
    let subjectsCount = 0;
    if (schedule) {
      const uniqueSubjects = new Set();
      schedule.week.forEach(d => d.lessons.forEach(l => {
        if (l.subjectId) uniqueSubjects.add(l.subjectId.toString());
      }));
      subjectsCount = uniqueSubjects.size;
    } else {
      subjectsCount = group.subjects?.length || 0;
    }

    res.json({
      groupName: group.name,
      course: group.course || "1",
      subjectsCount,
      attendanceRate,
      gpa: gpa.toFixed(2),
      todayClassesCount: 0 // Will be fetched separately properly or removed if redundant
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Хатогӣ" });
  }
};

export const getMyTodayClasses = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { semester } = getSemesterDates(req.query.semester); // Ensure we target correct schedule
    const today = new Date();
    const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];

    const group = await Group.findOne({ students: studentId });
    if (!group) return res.json({ classes: [] });

    // Match semester schedule
    const schedule = await WeeklySchedule.findOne({
      groupId: group._id,
      $or: [{ semester: semester }, { semester: { $exists: false } }]
    }).populate("week.lessons.subjectId week.lessons.teacherId");

    if (!schedule) return res.json({ classes: [] });

    const todayLessons = schedule.week.find(d => d.day === dayOfWeek)?.lessons || [];

    const classes = todayLessons.map((l, idx) => {
      if (!l.subjectId) return null;
      return {
        lessonNumber: idx + 1,
        time: l.time,
        subject: l.subjectId?.name || "—",
        teacher: l.teacherId?.fullName || "—",
        classroom: l.classroom || "—",
        isCurrent: false
      };
    }).filter(c => c !== null);

    res.json({ classes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ classes: [] });
  }
};

export const getMyGradesOverview = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { start, end } = getSemesterDates(req.query.semester);

    const journals = await JournalEntry.find({
      "students.studentId": studentId,
      date: { $gte: start, $lte: end }
    })
      .populate("subjectId", "name")
      // .select("subjectId students.taskGrade students.preparationGrade"); // Cannot select subdoc array fields easily with filtering
      // Just select fields
      .select("subjectId students");

    const gradesBySubject = {};

    journals.forEach(j => {
      const entry = j.students.find(s => s.studentId.toString() === studentId);
      if (!entry) return;

      // Grade logic: same as MyGrades (exclude lectures if possible, though Journal doesn't easy have type here unless populated or stored)
      // Actually JournalEntry has lessonType usually?
      // "j.lessonType". Let's assume we skip lectures for average if field exists.
      // But we didn't select it. Let's select it.
    });

    // Re-fetch with better select
    // Actually let's assume filtering happens inside loop

    // Quick Fix: Use the fetched journals
    for (const j of journals) {
      if (j.lessonType === 'lecture') continue; // Skip lectures for average

      const entry = j.students.find(s => s.studentId.toString() === studentId);
      if (!entry) continue;

      const grade = entry.taskGrade ?? entry.preparationGrade ?? 0;
      const subjectName = j.subjectId?.name || "—";

      if (!gradesBySubject[subjectName]) {
        gradesBySubject[subjectName] = { total: 0, count: 0 };
      }

      // Count 0s too? Yes, aligned with new logic.
      gradesBySubject[subjectName].total += grade;
      gradesBySubject[subjectName].count += 1;
    }

    const overview = Object.keys(gradesBySubject).map(name => ({
      subject: name,
      average: (Math.round((gradesBySubject[name].total / gradesBySubject[name].count) * 10) / 10).toFixed(1)
    }));

    res.json({ grades: overview });
  } catch (err) {
    console.error(err);
    res.json({ grades: [] });
  }
};
// controllers/studentController.js
// controllers/studentController.js
