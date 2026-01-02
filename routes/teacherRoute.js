import express from "express";
import { addTeacher, getTeachers, editTeacher, deleteTeacher, getTeacherById, changePassword } from "../controllers/teacherController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.post("/", addTeacher);
router.get("/", getTeachers);
router.post("/change-password",auth(["teacher","student"]), changePassword);
router.get("/:id", getTeacherById); 
router.put("/:id", editTeacher);
router.delete("/:id", deleteTeacher);

export default router;
