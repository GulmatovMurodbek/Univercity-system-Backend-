import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const uri = process.env.DB_URL;
    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
};

export default connectDB;
