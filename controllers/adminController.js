import Admin from "../models/Admin.js";
import bcrypt from "bcryptjs";

// Add new admin
export const addAdmin = async (req, res) => {
  try {
    const { fullName, email, password, phone, dateOfBirth } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "FullName, email and password are required!" });
    }

    const exists = await Admin.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already used!" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      fullName,
      email,
      password: hashedPassword,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    });

    res.status(201).json({ message: "Admin added!", admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all admins
export const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
