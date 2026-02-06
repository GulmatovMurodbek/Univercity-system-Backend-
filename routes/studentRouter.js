import express from "express";
import { addStudent, getStudents, editStudent, deleteStudent, getStudentById, getMyDashboardStats, getMyTodayClasses, getMyGradesOverview } from "../controllers/studentController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.post("/", addStudent);
router.get("/", auth(["admin", "teacher", "mudir"]), getStudents);
router.get("/:id", auth(["admin", "teacher", "mudir"]), getStudentById); // 🔹 Get student by ID
router.put("/:id", auth(["admin"]), editStudent);
router.delete("/:id", auth(["admin"]), deleteStudent);
router.get("/dashboard", auth(["student"]), getMyDashboardStats);
router.get("/today-classes", auth(["student"]), getMyTodayClasses);
router.get("/grades-overview", auth(["student"]), getMyGradesOverview);
export default router;
