import Subject from "../models/Subject.js";

// ➕ Create Subject
export const createSubject = async (req, res) => {
  try {
    const subject = await Subject.create(req.body);
    res.status(201).json(subject);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📌 Get All Subjects
export const getAllSubjects = async (req, res) => {
  try {
    const currentUserRole = req.user.role;
    const currentUserId = req.user.id;

    let query = {};
    if (currentUserRole === "teacher") {
      query = { "teachers.teacherId": currentUserId };
    }

    const subjects = await Subject.find(query)
      .populate("teachers.teacherId", "fullName")   // номи муаллимро меорад
      .populate("groupId", "name")         // номи гуруҳро меорад
      .exec();

    res.json(subjects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✏️ Update Subject
export const updateSubject = async (req, res) => {
  try {
    const updated = await Subject.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ❌ Delete Subject
export const deleteSubject = async (req, res) => {
  try {
    await Subject.findByIdAndDelete(req.params.id);
    res.json({ message: "Subject removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
