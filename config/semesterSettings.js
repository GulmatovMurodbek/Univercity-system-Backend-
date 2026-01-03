export const semesterSettings = {
    // Semester 1 starts September 1st
    semester1: {
        month: 8, // September (0-indexed)
        day: 1
    },
    // Winter break starts Dec 22
    winterBreak: {
        month: 11, // December
        day: 22
    },
    // Semester 2 starts Feb 1st
    semester2: {
        month: 1, // February
        day: 1
    }
};

export const getSemesterStart = (date = new Date()) => {
    const currentYear = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const day = date.getDate();

    // If we are in Feb (1) or later, it's Semester 2
    if (month >= semesterSettings.semester2.month) {
        return new Date(currentYear, semesterSettings.semester2.month, semesterSettings.semester2.day);
    }

    // If we are in Jan (0), it's still Winter Break of the previous academic year's sem 1? 
    // Or is Sem 2 starting Feb 1?
    // Logic from original code: Jan is "break", return Sem 1 start of PREVIOUS year.
    // Original: if (now.getMonth() >= 0 && now.getMonth() <= 0) ... startYear = currentYear - 1

    if (month === 0) { // January
        return new Date(currentYear - 1, semesterSettings.semester1.month, semesterSettings.semester1.day);
    }

    // If we are in Sep-Dec
    // If we are before Sep, it must be Sem 2 of previous year? 
    // Assuming standard academic year Sep-June.
    // Logic from original code: if month >= 8 (Sep) -> currentYear, else -> currentYear - 1.

    if (month >= semesterSettings.semester1.month) {
        return new Date(currentYear, semesterSettings.semester1.month, semesterSettings.semester1.day);
    }

    // Implicit else (Spring/Summer before Sep): It is Sem 2 of previous year?
    // Let's stick to the logic for "Semester 1 Start" which is often used for "Start of Academic Year".
    return new Date(currentYear - 1, semesterSettings.semester1.month, semesterSettings.semester1.day);
};
