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
router.post("/", auth(["admin"]), saveWeeklySchedule);
router.delete("/group/:groupId", auth(["admin"]), deleteWeeklySchedule);

export default router;
