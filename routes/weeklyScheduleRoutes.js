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
router.get("/group/:groupId",getWeeklySchedule);
router.post("/", saveWeeklySchedule);
router.delete("/group/:groupId", deleteWeeklySchedule);

export default router;
