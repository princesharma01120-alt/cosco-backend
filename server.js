import express from "express";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import razorpay from "./razorpay.js";
import User from "./models/User.js";

dotenv.config();

const app = express();

/* -----------------------------------------------------
   🔥 CORS + LOGGER (FIXES ALL YOUR FRONTEND ERRORS)
------------------------------------------------------ */
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.path);
  next();
});

const allowedOrigins = [
  "http://localhost:3000",           // local dev
  "https://cosco-shipment.netlify.app",  // your netlify frontend (replace if needed)
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow tools like Postman
      if (allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("CORS not allowed by server"));
    },
    credentials: true,
  })
);
app.options("*", cors());

app.use(express.json());
app.use(bodyParser.json());

/* -----------------------------------------------------
   🔥 CONNECT MONGODB
------------------------------------------------------ */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected to Atlas"))
  .catch((err) => console.log("❌ Mongo Error:", err.message));

/* -----------------------------------------------------
   🔥 GMAIL SMTP TRANSPORTER
------------------------------------------------------ */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* -----------------------------------------------------
   🔥 SEND OTP
------------------------------------------------------ */
app.post("/send-otp", async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !email) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    let user = await User.findOne({ email });

    if (!user) {
      user = new User({ name, phone, email, otp });
    } else {
      user.otp = otp;
    }

    await user.save();

    await transporter.sendMail({
      from: `"COSCO Shipping" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your COSCO OTP Code",
      text: `Hello ${name}, your OTP is ${otp}.`,
    });

    res.json({ success: true, message: "OTP sent successfully!" });
  } catch (error) {
    console.log("SEND OTP ERROR:", error);
    res.json({ success: false, message: "OTP send failed" });
  }
});

/* -----------------------------------------------------
   🔥 VERIFY OTP
------------------------------------------------------ */
app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user || user.otp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    user.verified = true;
    user.otp = null;
    await user.save();

    res.json({ success: true, message: "User verified", user });
  } catch (error) {
    console.log("VERIFY ERROR:", error);
    res.json({ success: false, message: "Verification failed" });
  }
});

/* -----------------------------------------------------
   🔥 RAZORPAY ORDER CREATE
------------------------------------------------------ */
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({ success: true, order });
  } catch (error) {
    console.log("ORDER ERROR:", error);
    res.json({ success: false, message: "Order creation failed" });
  }
});

/* -----------------------------------------------------
   🔥 RAZORPAY PAYMENT VERIFY
------------------------------------------------------ */
app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSign = crypto
      .createHmac("sha256", process.env.RZP_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign === razorpay_signature) {
      return res.json({ success: true, message: "Payment Verified!" });
    }

    res.json({ success: false, message: "Invalid signature!" });
  } catch (error) {
    console.log("VERIFY ERROR:", error);
    res.json({ success: false, message: "Verification failed" });
  }
});

/* -----------------------------------------------------
   🔥 GET USER DETAILS
------------------------------------------------------ */
app.get("/user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.log("USER ERROR:", error);
    res.json({ success: false, message: "Error retrieving user" });
  }
});

/* -----------------------------------------------------
   🔥 HOME ROUTE
------------------------------------------------------ */
app.get("/", (req, res) => {
  res.send("🚀 COSCO Backend Active");
});

/* -----------------------------------------------------
   🔥 START SERVER
------------------------------------------------------ */
app.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running at ${process.env.PORT || 5000}`);
});
