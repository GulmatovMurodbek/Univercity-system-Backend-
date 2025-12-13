import express from "express";
import {
  addGroup,
  getGroups,
  getGroupById,
  editGroup,
  deleteGroup,
  addStudentToGroup,
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
export default router;
