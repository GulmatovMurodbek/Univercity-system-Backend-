import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const uri = process.env.DB_URL;
    if (!uri) {
      throw new Error("DB_URL is not defined in .env file");
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000, // Increase timeout to 15s
    });
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB Connection Error:", {
      message: err.message,
      code: err.code,
      hostname: err.hostname,
      syscall: err.syscall
    });
    process.exit(1);
  }
};

export default connectDB;
