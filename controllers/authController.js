import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Admin from "../models/Admin.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required!" });
    }

    // Ҷустуҷӯ дар ҳамаи модулҳо
    let user = await Student.findOne({ email });
    let role = "student";

    if (!user) {
      user = await Teacher.findOne({ email });
      role = "teacher";
    }

    if (!user) {
      user = await Admin.findOne({ email });
      role = "admin";
    }

    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    // Тасдиқи password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Wrong password!" });
    }

    // Эҷоди JWT token
    const token = jwt.sign(
      { id: user._id, role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login success!",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
