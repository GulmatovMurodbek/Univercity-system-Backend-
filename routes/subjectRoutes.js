import express from "express";
import {
  createSubject,
  getAllSubjects,
  updateSubject,
  deleteSubject,
} from "../controllers/subjectController.js";

import { auth } from "../middleware/auth.js";

const router = express.Router();

// 📌 Routes
router.post("/", auth(["admin"]), createSubject);       // Add subject
router.get("/", auth(["admin", "teacher", "mudir"]), getAllSubjects);      // Get all subjects
router.put("/:id", auth(["admin"]), updateSubject);    // Update subject by id
router.delete("/:id", auth(["admin"]), deleteSubject); // Delete subject by id

export default router;
