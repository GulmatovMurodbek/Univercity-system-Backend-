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
  getAdminNotes,  // НАВ
} from "../controllers/journalController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();


router.get("/group/:groupId/:date", getLessonsByGroupAndDate);
router.get("/:date/:shift/:slot", auth(["teacher","admin"]), getJournalEntry);
router.put("/:id",auth(["teacher","admin"]), updateJournalEntry);
router.get("/weekly-attendance/:groupId",auth(["teacher","admin"]), getWeeklyAttendance);
router.get("/weekly-grades/:groupId",auth(["teacher","admin"]), getWeeklyGrades);
router.get("/my-attendance", auth(["student"]), getMyAttendance);
router.get("/my-grades", auth(["student"]), getMyGrades);
router.get("/admin-notes/:groupId/",auth(["admin"]),getAdminNotes)


export default router;