import Teacher from "../models/Teacher.js";
import bcrypt from "bcryptjs";

export const addTeacher = async (req, res) => {
  try {
    const { fullName, email, password, phone, dateOfBirth, subjects } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "FullName, email and password are required!" });
    }

    const exists = await Teacher.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already used!" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const teacher = await Teacher.create({
      fullName,
      email,
      password,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      subjects: subjects || [],
    });

    res.status(201).json({ message: "Teacher added!", teacher });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find();
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✏️ Edit teacher
export const editTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Агар password дода шавад, ҳаш кун

    const teacher = await Teacher.findByIdAndUpdate(id, updates, { new: true });
    if (!teacher) return res.status(404).json({ message: "Teacher not found!" });

    res.json({ message: "Teacher updated!", teacher });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ❌ Delete teacher
export const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;

    const teacher = await Teacher.findByIdAndDelete(id);
    if (!teacher) return res.status(404).json({ message: "Teacher not found!" });

    res.json({ message: "Teacher deleted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// 🎯 Get teacher by ID
export const getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;
    const teacher = await Teacher.findById(id);

    if (!teacher) return res.status(404).json({ message: "Teacher not found!" });

    res.json(teacher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
