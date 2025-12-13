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
    const subjects = await Subject.find()
      .populate("_id", "fullName")   // номи муаллимро меорад
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
