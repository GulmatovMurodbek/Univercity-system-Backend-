import express from "express";
import { addTeacher, getTeachers, editTeacher, deleteTeacher, getTeacherById, changePassword } from "../controllers/teacherController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

// Apply checking for admin role for all teacher operations
router.post("/", auth(["admin"]), addTeacher);
router.get("/", auth(["admin", "teacher"]), getTeachers);
router.post("/change-password", auth(["teacher", "student", "admin"]), changePassword); // Allow admin too if needed, or keep as is
router.get("/:id", auth(["admin", "teacher"]), getTeacherById);
router.put("/:id", auth(["admin"]), editTeacher);
router.delete("/:id", auth(["admin"]), deleteTeacher);

export default router;
