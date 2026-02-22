// utils/semesterUtils.js

/**
 * Determines the current semester based on date and (optionally) course.
 *
 * Sem 1: Sept (8) – Jan (0)
 * Sem 2:
 *   Course 4 → starts Jan 19  (month=0, day>=19)
 *   Others   → starts Jan 26  (month=0, day>=26)
 *   All      → Feb–Jun (month 1–5) is always Sem 2
 *
 * @param {Date}   date   - The date to check (default: today)
 * @param {number} course - Student course 1–4 (optional, default: 0 = generic)
 * @returns {number} 1 or 2
 */
export const getSemesterByDate = (date = new Date(), course = 0) => {
    const month = date.getMonth(); // 0 = Jan … 11 = Dec
    const day = date.getDate();  // 1 – 31

    // Feb – Jun → always Semester 2
    if (month >= 1 && month <= 5) return 2;

    // January: check by start day
    if (month === 0) {
        if (course === 4 && day >= 19) return 2; // course 4: Jan 19+
        if (course !== 4 && day >= 26) return 2; // others : Jan 26+
        return 1;
    }

    // Sept – Dec → Semester 1
    return 1;
};

/**
 * Gets the semester start date based on semester, academic year start year, and course.
 *
 * Sem 1       → Sept 1
 * Sem 2, crs4 → Jan 19  (next calendar year)
 * Sem 2, rest → Jan 26  (next calendar year)
 *
 * @param {number} semester  - 1 or 2
 * @param {number} startYear - Academic year start (e.g. 2025 for 2025/26)
 * @param {number} course    - Student course 1–4
 * @returns {Date}
 */
export const getSemesterStartDate = (semester, startYear, course) => {
    if (semester === 1) {
        return new Date(startYear, 8, 1); // 1 Sept
    }
    // Semester 2
    if (course === 4) {
        return new Date(startYear + 1, 0, 19); // 19 Jan
    }
    return new Date(startYear + 1, 0, 26);     // 26 Jan
};

/**
 * Calculates current academic year start year.
 *   Sept–Dec 2025 → 2025
 *   Jan–Aug  2026 → 2025
 *
 * @param {Date} date
 * @returns {number}
 */
export const getAcademicYearStart = (date = new Date()) => {
    return date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
};
