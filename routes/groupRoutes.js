import express from "express";
import {
  addGroup,
  getGroups,
  getGroupById,
  editGroup,
  deleteGroup,
  addStudentToGroup,
  removeStudentFromGroup,
} from "../controllers/groupController.js";

const router = express.Router();

// ➕ Add group
router.post("/", addGroup);

// 📋 Get all groups
router.get("/", getGroups);

// 🎯 Get group by ID
router.get("/:id", getGroupById);

// ✏️ Edit group
router.put("/:id", editGroup);

// ❌ Delete group
router.delete("/:id", deleteGroup);

// ➕ Add student to group
router.post("/add-student", addStudentToGroup);

// 🗑️ Remove student from group
router.delete("/remove-student", removeStudentFromGroup);

export default router;
