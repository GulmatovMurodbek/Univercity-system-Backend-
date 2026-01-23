import express from "express";
import { getDashboardStats } from "../controllers/analyticsController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.get("/dashboard", auth(), getDashboardStats);

export default router;
