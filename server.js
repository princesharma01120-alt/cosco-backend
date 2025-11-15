import express from "express";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ MongoDB Atlas Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected to Atlas"))
  .catch((err) => console.log("❌ Mongo Error:", err.message));

// ✅ User Schema
const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  otp: String,
  verified: { type: Boolean, default: false },
});

const User = mongoose.model("User", userSchema);

// ✅ Gmail Transporter (for sending OTP)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Gmail address
    pass: process.env.EMAIL_PASS, // App password
  },
});

// ✅ Route: Send OTP
app.post("/send-otp", async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name || !email)
    return res.json({ success: false, message: "Missing fields" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    let user = await User.findOne({ email });
    if (!user) user = new User({ name, phone, email, otp });
    else user.otp = otp;

    await user.save();

    await transporter.sendMail({
      from: `"COSCO Shipping" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your COSCO OTP Code",
      text: `Hello ${name}, your OTP is ${otp}. It will expire in 10 minutes.`,
    });

    res.json({ success: true, message: "✅ OTP sent to email successfully!" });
  } catch (error) {
    console.error("Send OTP Error:", error);
    res.json({ success: false, message: "❌ Failed to send OTP" });
  }
});

// ✅ Route: Verify OTP
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });

  if (!user || user.otp !== otp)
    return res.json({ success: false, message: "❌ Invalid OTP" });

  user.verified = true;
  user.otp = null;
  await user.save();

  res.json({
    success: true,
    message: "✅ User verified successfully!",
    user,
  });
});

// 🟩 Route: Get user details by email
app.get("/user/:email", async (req, res) => {
  const email = req.params.email;
  const user = await User.findOne({ email });

  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  res.json({ success: true, user });
});


// ✅ Root Route
app.get("/", (req, res) => {
  res.send("🚀 COSCO Backend is Live and Connected to MongoDB Atlas!");
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
