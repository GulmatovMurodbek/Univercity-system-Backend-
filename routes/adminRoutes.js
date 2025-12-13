import express from "express";
import { addAdmin, getAdmins } from "../controllers/adminController.js";

const router = express.Router();

// Add admin
router.post("/", addAdmin);

// Get all admins
router.get("/", getAdmins);

export default router;
