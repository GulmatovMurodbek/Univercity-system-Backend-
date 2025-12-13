import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import studentRoutes from "./routes/studentRouter.js"
import teacherRoutes from "./routes/teacherRoute.js"
import adminRoutes from "./routes/adminRoutes.js";
import groupRoutes from "./routes/groupRoutes.js"
import subjectRoutes from "./routes/subjectRoutes.js"
import weeklyScheduleRoutes from "./routes/weeklyScheduleRoutes.js"
import journalRoutes from "./routes/journalRoutes.js"
dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// DB
connectDB();

app.use("/api/auth", authRoutes);

// Student routes
app.use("/api/students",studentRoutes );
app.use("/api/groups",groupRoutes );

// Teacher routes
app.use("/api/teachers", teacherRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/subjects",subjectRoutes)
app.use("/api/weeklySchedule",weeklyScheduleRoutes)
app.use('/api/journal', journalRoutes);
app.listen(5000, () => console.log("Server running on port 5000"));
