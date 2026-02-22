import Groups from "../models/Groups.js";
import Group from "../models/Groups.js";
import Student from "../models/Student.js";
import Request from "express"; // Not used but preserving structure if needed, or just insert mongoose
import WeeklySchedule from "../models/WeeklySchedule.js";
import mongoose from "mongoose";

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
    const currentUserRole = req.user.role;
    const currentUserId = req.user.id;

    if (currentUserRole === "teacher") {
      // Find all groups where this teacher has lessons in the weekly schedule
      const schedules = await WeeklySchedule.find({
        "week.lessons.teacherId": currentUserId
      }).select("groupId");

      const groupIds = [...new Set(schedules.map(s => s.groupId.toString()))];

      const groups = await Group.find({ _id: { $in: groupIds } }).sort({ name: 1 });
      return res.json(groups);
    }

    // Admins and others see all groups
    const groups = await Group.find().sort({ name: 1 });
    res.json(groups);
  } catch (err) {
    console.error("getGroups error:", err);
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
    const { groupId, studentId } = req.body; // studentId = array of strings

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid Group ID" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found!" });
    }

    // Санҷиш: studentId бояд array бошад
    if (!Array.isArray(studentId)) {
      return res.status(400).json({ message: "studentId must be an array" });
    }

    // Filter valid IDs only
    const validStudentIds = studentId.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validStudentIds.length === 0 && studentId.length > 0) {
      return res.status(400).json({ message: "No valid student IDs provided" });
    }

    // Илова кардани студентҳо бе такрор
    // Convert current students to strings for comparison
    const currentStudentIds = group.students.map(s => s.toString());

    let addedCount = 0;
    validStudentIds.forEach(id => {
      if (!currentStudentIds.includes(id)) {
        group.students.push(id);
        currentStudentIds.push(id); // Prevent adding same ID twice in this batch if duplicate in input
        addedCount++;
      }
    });

    if (addedCount > 0) {
      group.studentCount = group.students.length;

      // 🛠️ Auto-fix: Ensure 'id' exists before saving
      if (!group.id) {
        group.id = group._id.toString();
      }

      await group.save();
    }

    res.json({
      message: `Successfully added ${addedCount} students!`,
      group
    });

  } catch (err) {
    console.error("Error adding student to group:", err);
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

