import Groups from "../models/Groups.js";
import Group from "../models/Groups.js";
import Student from "../models/Student.js";

// ➕ Add new group
export const addGroup = async (req, res) => {
  try {
    const { id, name, course, faculty, subjectCount ,shift} = req.body;

    if (!id || !name || !course || !faculty) {
      return res.status(400).json({ message: "id, name, course, and faculty are required!" });
    }

    const exists = await Group.findOne({ id });
    if (exists) return res.status(400).json({ message: "Group with this ID already exists!" });

    const group = await Group.create({
      id,
      name,
      course,
      faculty,
      subjectCount: subjectCount || 0,
      shift,
      students: [],
      studentCount: 0
    });

    res.status(201).json({ message: "Group added!", group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 📋 Get all groups
export const getGroups = async (req, res) => {
  try {
    const groups = await Group.find().populate("students");
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🎯 Get group by ID
export const getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await Group.findById(id).populate("students");

    if (!group) return res.status(404).json({ message: "Group not found!" });

    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✏️ Edit group
export const editGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const group = await Group.findByIdAndUpdate(id, updates, { new: true });
    if (!group) return res.status(404).json({ message: "Group not found!" });

    res.json({ message: "Group updated!", group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ❌ Delete group
export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await Group.findByIdAndDelete(id);

    if (!group) return res.status(404).json({ message: "Group not found!" });

    res.json({ message: "Group deleted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ➕ Add student to group
export const addStudentToGroup = async (req, res) => {
  try {
    const { groupId, studentId } = req.body;

    const group = await Group.findById(groupId);
    const student = await Student.findById(studentId);

    if (!group || !student) return res.status(404).json({ message: "Group or Student not found!" });

    if (!group.students.includes(studentId)) {
      group.students.push(studentId);
      group.studentCount = group.students.length;
      await group.save();
    }

    res.json({ message: "Student added to group!", group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

