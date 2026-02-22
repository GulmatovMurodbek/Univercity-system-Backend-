import express from "express";
import {
  getWeeklySchedule,
  saveWeeklySchedule,
  deleteWeeklySchedule,
  getMyTeachingSchedule,
} from "../controllers/weeklyScheduleController.js";
import { auth } from "../middleware/auth.js";
const router = express.Router();

router.get("/my-schedule", auth(["teacher"]), getMyTeachingSchedule);
router.get("/group/:groupId", auth(["admin", "teacher", "mudir", "student"]), getWeeklySchedule);
// Мудир ҳам метавонад ҷадвал созад ва таҳрир/пок кунад
router.post("/", auth(["admin", "mudir"]), saveWeeklySchedule);
router.delete("/group/:groupId", auth(["admin", "mudir"]), deleteWeeklySchedule);

export default router;
