import Mudir from "../models/Mudir.js";
import bcrypt from "bcryptjs";

// Add new mudir
export const addMudir = async (req, res) => {
    try {
        const { fullName, email, password, phone, dateOfBirth } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "FullName, email and password are required!" });
        }

        const exists = await Mudir.findOne({ email });
        if (exists) return res.status(400).json({ message: "Email already used!" });

        const hashedPassword = await bcrypt.hash(password, 10);

        const mudir = await Mudir.create({
            fullName,
            email,
            password: hashedPassword,
            phone,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        });

        res.status(201).json({ message: "Mudir added!", mudir });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all mudirs
export const getMudirs = async (req, res) => {
    try {
        const mudirs = await Mudir.find().select("-password");
        res.json(mudirs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Delete mudir
export const deleteMudir = async (req, res) => {
    try {
        const { id } = req.params;
        await Mudir.findByIdAndDelete(id);
        res.json({ message: "Mudir deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
