// routes/journalRoutes.js
import express from "express";
import {
  getJournalEntry,
  updateJournalEntry,
  getLessonsByGroupAndDate,
  getWeeklyAttendance,
  getWeeklyGrades,
  getMyAttendance,
  getMyGrades,
  getMissingAttendance,
  bulkUpdateJournalEntries
} from "../controllers/journalController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();


router.get("/group/:groupId/:date", auth(["admin", "teacher", "mudir"]), getLessonsByGroupAndDate);
router.get("/missing", auth(["admin", "mudir"]), getMissingAttendance);
router.get("/:date/:shift/:slot/:groupId/:subjectId", auth(["teacher", "admin", "mudir"]), getJournalEntry);
router.put("/:id", auth(["teacher", "admin", "mudir"]), updateJournalEntry);
router.get("/weekly-attendance/:groupId", auth(["teacher", "admin", "mudir"]), getWeeklyAttendance);
router.get("/weekly-grades/:groupId", auth(["teacher", "admin", "mudir"]), getWeeklyGrades);
router.get("/my-attendance", auth(["student"]), getMyAttendance);
router.get("/my-grades", auth(["student"]), getMyGrades);
router.post("/bulk-update", auth(["teacher", "admin", "mudir"]), bulkUpdateJournalEntries);


export default router;