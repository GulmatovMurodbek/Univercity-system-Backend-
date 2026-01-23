import Student from "../models/Student.js";
import Groups from "../models/Groups.js";
import JournalEntry from "../models/JournalEntry.js";

export const getDashboardStats = async (req, res) => {
    try {
        // 1. Total Students & Groups
        const totalStudents = await Student.countDocuments();
        const totalGroups = await Groups.countDocuments();

        // 2. Average Attendance (Last 30 days)
        // This is a simplified calculation. For strict accuracy, we'd unwind all student records.
        // Here we count "present" vs "total" in Journal Entries.

        // Aggregation to count presence
        const attendanceStats = await JournalEntry.aggregate([
            { $unwind: "$students" },
            {
                $group: {
                    _id: "$students.attendance",
                    count: { $sum: 1 }
                }
            }
        ]);

        let presentCount = 0;
        let totalRecords = 0;

        attendanceStats.forEach(stat => {
            totalRecords += stat.count;
            if (stat._id === 'present') presentCount += stat.count;
        });

        const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

        // 3. Average Grade (University Wide)
        // Only counting non-null grades
        const gradeStats = await JournalEntry.aggregate([
            { $unwind: "$students" },
            { $match: { "students.taskGrade": { $ne: null } } },
            {
                $group: {
                    _id: null,
                    avgGrade: { $avg: "$students.taskGrade" }
                }
            }
        ]);

        const avgGrade = gradeStats.length > 0 ? gradeStats[0].avgGrade.toFixed(1) : 0;

        // 4. Most Active Groups (by number of journal entries)
        const topGroups = await JournalEntry.aggregate([
            {
                $group: {
                    _id: "$groupId",
                    entryCount: { $sum: 1 }
                }
            },
            { $sort: { entryCount: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: "groups",
                    localField: "_id",
                    foreignField: "_id",
                    as: "groupInfo"
                }
            },
            { $unwind: "$groupInfo" },
            {
                $project: {
                    name: "$groupInfo.name",
                    entryCount: 1
                }
            }
        ]);

        // 5. High Absence Students (>48 hours)
        // Note: 1 hour = 1 lesson absent.
        const highAbsenceStudents = await JournalEntry.aggregate([
            { $unwind: "$students" },
            { $match: { "students.attendance": "absent" } },
            {
                $group: {
                    _id: "$students.studentId",
                    absentCount: { $sum: 1 }
                }
            },
            { $match: { absentCount: { $gt: 48 } } }, // > 48 hours
            {
                $lookup: {
                    from: "students",
                    localField: "_id",
                    foreignField: "_id",
                    as: "studentInfo"
                }
            },
            { $unwind: "$studentInfo" },
            {
                $lookup: {
                    from: "groups",
                    let: { studentId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $in: ["$$studentId", "$students"] } } }
                    ],
                    as: "groupInfo"
                }
            },
            // Handle case where student might not be in a group (edge case) or array empty
            { $addFields: { groupInfo: { $arrayElemAt: ["$groupInfo", 0] } } },
            {
                $project: {
                    studentName: "$studentInfo.fullName",
                    groupName: { $ifNull: ["$groupInfo.name", "Unknown"] },
                    absentCount: 1
                }
            },
            { $sort: { absentCount: -1 } }
        ]);

        res.json({
            totalStudents,
            totalGroups,
            attendanceRate,
            avgGrade,
            topGroups,
            highAbsenceStudents
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
