import Log from "../models/Log.js";

// 📝 Create a new log (Internal Helper)
export const createLog = async (action, userId, role, details) => {
    try {
        await Log.create({
            action,
            performedBy: userId,
            role,
            details,
        });
    } catch (err) {
        console.error("Error creating log:", err);
    }
};

// 📋 Get logs (Admin only)
export const getLogs = async (req, res) => {
    try {
        const logs = await Log.find()
            .sort({ createdAt: -1 })
            .populate("performedBy", "name email") // Assuming User model has name/email
            .limit(100); // Limit to last 100 logs for performance

        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
