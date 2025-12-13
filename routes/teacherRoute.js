import express from "express";
import { addTeacher, getTeachers, editTeacher, deleteTeacher, getTeacherById } from "../controllers/teacherController.js";

const router = express.Router();

router.post("/", addTeacher);
router.get("/", getTeachers);
router.get("/:id", getTeacherById); // 🔹 Get teacher by ID
router.put("/:id", editTeacher);
router.delete("/:id", deleteTeacher);

export default router;
