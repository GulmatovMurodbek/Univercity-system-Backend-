import Teacher from "../models/Teacher.js";

export const addTeacher = async (req, res) => {
  try {
    const { fullName, email, password, phone, dateOfBirth, subjects } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "FullName, email and password are required!" });
    }

    const exists = await Teacher.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already used!" });

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
// Иваз кардани пароли муаллим (фақат худи ӯ)
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    const role = req.user.role; // "teacher" ё "student"

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Ҳарду парол ҳатмиянд!" });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ message: "Пароли нав бояд ҳадди ақал 4 рамз дошта бошад!" });
    }

    let user;
    if (role === "teacher") {
      user = await Teacher.findById(userId);
    } else if (role === "student") {
      user = await Student.findById(userId);
    } else {
      return res.status(403).json({ message: "Дастрасӣ манъ аст!" });
    }

    if (!user) {
      return res.status(404).json({ message: "Корбар ёфт нашуд!" });
    }

    // Муқоисаи мустақим — БЕ ХЕШ
    if (user.password !== currentPassword.trim()) {
      return res.status(400).json({ message: "Пароли кунунӣ нодуруст аст!" });
    }

    // Пароли навро оддӣ нигоҳ медорем — БЕ ХЕШ
    user.password = newPassword.trim();
    await user.save();

    res.json({ message: "Парол бомуваффақият иваз карда шуд!" });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ message: "Хатогӣ дар сервер" });
  }
};