import express from "express";
import { getLogs } from "../controllers/logController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

// 🔒 Protected route (Admin only)
router.get("/", auth(['admin']), getLogs);

export default router;
