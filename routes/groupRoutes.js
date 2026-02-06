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

import { auth } from "../middleware/auth.js";

const router = express.Router();

// ➕ Add group
router.post("/", auth(["admin"]), addGroup);

// 📋 Get all groups
router.get("/", auth(["admin", "teacher", "mudir"]), getGroups);

// 🎯 Get group by ID
router.get("/:id", auth(["admin", "teacher", "mudir"]), getGroupById);

// ✏️ Edit group
router.put("/:id", auth(["admin"]), editGroup);

// 🗑️ Remove student from group
router.delete("/remove-student", auth(["admin"]), removeStudentFromGroup);

// ➕ Add student to group
router.post("/add-student", auth(["admin"]), addStudentToGroup);

// ❌ Delete group
router.delete("/:id", auth(["admin"]), deleteGroup);

export default router;
