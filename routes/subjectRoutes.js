import express from "express";
import {
  createSubject,
  getAllSubjects,
  updateSubject,
  deleteSubject,
} from "../controllers/subjectController.js";

const router = express.Router();

// 📌 Routes
router.post("/", createSubject);       // Add subject
router.get("/", getAllSubjects);      // Get all subjects
router.put("/:id", updateSubject);    // Update subject by id
router.delete("/:id", deleteSubject); // Delete subject by id

export default router;
