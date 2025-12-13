import jwt from "jsonwebtoken";

// roles – массив ролиҳо, масалан: ["teacher"]
export const auth = (roles = []) => {
  return (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>
      if (!token) return res.status(401).json({ message: "No token!" });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // 👈 ИН ҚАФАСИ req.user МЕШАВАД

      // Агар roles додашуда бошад, текс кунем
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Access denied!" });
      }

      next();
    } catch (err) {
      res.status(401).json({ message: "Invalid token!" });
    }
  };
};
