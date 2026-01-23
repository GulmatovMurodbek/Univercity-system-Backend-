import Groups from "../models/Groups.js";
import Group from "../models/Groups.js";
import Student from "../models/Student.js";
import WeeklySchedule from "../models/WeeklySchedule.js";

// ➕ Add new group
export const addGroup = async (req, res) => {
  try {
    const { id, name, course, faculty, subjectCount, shift } = req.body;

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
    // ⚠️ POPULATE REMOVED FOR PERFORMANCE
    // Fetching thousands of students just to list groups is too slow.
    // If you need student count, it is already stored in 'studentCount'.
    const groups = await Group.find().sort({ name: 1 });
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

    // Cascade delete associated weekly schedule
    await WeeklySchedule.findOneAndDelete({ groupId: id });

    res.json({ message: "Group deleted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ➕ Add student to group
export const addStudentToGroup = async (req, res) => {
  try {
    const { groupId, studentId } = req.body; // studentId = array

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found!" });
    }

    // Санҷиш: studentId бояд array бошад
    if (!Array.isArray(studentId)) {
      return res.status(400).json({ message: "studentId must be an array" });
    }

    // Илова кардани студентҳо бе такрор
    studentId.forEach(id => {
      if (!group.students.includes(id)) {
        group.students.push(id);
      }
    });

    group.studentCount = group.students.length;
    await group.save();

    res.json({
      message: "Students added to group!",
      group
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🗑️ Remove student from group
export const removeStudentFromGroup = async (req, res) => {
  try {
    const { groupId, studentId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found!" });

    // Remove student using $pull
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      {
        $pull: { students: studentId },
        $inc: { studentCount: -1 }
      },
      { new: true }
    );

    res.json({ message: "Student removed from group!", group: updatedGroup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

