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
      password: hashedPassword,
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
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✨ Edit student
export const editStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

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

export const getMyDashboardStats = async (req, res) => {
  try {
    const studentId = req.user.id;
    if (!studentId) return res.status(401).json({ message: "User not authenticated" });

    const group = await Group.findOne({
      students: new mongoose.Types.ObjectId(studentId)
    }).populate("students");
    if (!group) return res.status(404).json({ message: "Гурӯҳ ёфт нашуд" });

    const student = group.students.find(s => s._id.toString() === studentId);
    const gpa = student?.gpa || 0;

    const presentCount = await JournalEntry.countDocuments({
      "students.studentId": studentId,
      "students.attendance": "present"
    });
    const totalClasses = await JournalEntry.countDocuments({
      "students.studentId": studentId
    });
    const attendanceRate = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

    res.json({
      groupName: group.name,
      course: group.course || "1",
      subjectsCount: group.subjects?.length || 8,
      attendanceRate,
      gpa: gpa.toFixed(2),
      todayClassesCount: 6
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Хатогӣ" });
  }
};

export const getMyTodayClasses = async (req, res) => {
  try {
    const studentId = req.user.id;
    const today = new Date();
    const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];

    const schedule = await WeeklySchedule.findOne({
      groupId: (await Group.findOne({ students: studentId }))._id
    }).populate("week.lessons.subjectId week.lessons.teacherId");

    if (!schedule) return res.json({ classes: [] });

    const todayLessons = schedule.week.find(d => d.day === dayOfWeek)?.lessons || [];

    const classes = todayLessons.map((l, idx) => ({
      lessonNumber: idx + 1,
      time: l.time,
      subject: l.subjectId?.name || "—",
      teacher: l.teacherId?.fullName || "—",
      classroom: l.classroom || "—",
      isCurrent: false // ту метавонӣ ҳисоб кунӣ
    }));

    res.json({ classes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ classes: [] });
  }
};

export const getMyGradesOverview = async (req, res) => {
  try {
    const studentId = req.user.id;

    const journals = await JournalEntry.find({
      "students.studentId": studentId
    })
      .populate("subjectId", "name")
      .select("subjectId students.taskGrade students.preparationGrade");

    const gradesBySubject = {};

    journals.forEach(j => {
      const entry = j.students.find(s => s.studentId.toString() === studentId);
      if (!entry) return;

      const grade = entry.taskGrade ?? entry.preparationGrade ?? 0;
      const subjectName = j.subjectId?.name || "Номаълум";

      if (!gradesBySubject[subjectName]) {
        gradesBySubject[subjectName] = { total: 0, count: 0 };
      }
      gradesBySubject[subjectName].total += grade;
      gradesBySubject[subjectName].count += 1;
    });

    const overview = Object.keys(gradesBySubject).map(name => ({
      subject: name,
      average: Math.round((gradesBySubject[name].total / gradesBySubject[name].count) * 10) / 10
    }));

    res.json({ grades: overview });
  } catch (err) {
    console.error(err);
    res.json({ grades: [] });
  }
};
// controllers/studentController.js
// controllers/studentController.js
