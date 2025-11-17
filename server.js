// server.js (ready-to-paste)
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

/* -------------------------
   Simple request logger
--------------------------*/
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.originalUrl, "from", req.headers.origin || "no-origin");
  next();
});

/* -------------------------
   CORS config (dev + prod)
   Allow:
     - localhost frontends
     - 127.0.0.1 frontends (you used 3001)
     - your Netlify production URL(s)
--------------------------*/
const FRONTEND_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3001",                  // your local/register origin you used in screenshots
  "http://127.0.0.1:5500",                  // if you open HTML file via live server
  "https://coscoships-login.netlify.app",   // your Netlify (example from screenshots)
  "https://cosco-ships.netlify.app",        // another Netlify variant you mentioned
  "https://cosco-backend.onrender.com"      // allow backend origin for safe internal calls (optional)
];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (curl, Postman, or file:// cases)
      if (!origin) return callback(null, true);
      if (FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
      console.warn("CORS blocked for origin:", origin);
      return callback(new Error("CORS not allowed by server"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-requested-with"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
app.options("*", cors()); // enable pre-flight for all routes

/* -------------------------
   Body parsers
--------------------------*/
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* -------------------------
   Env checks (helpful)
--------------------------*/
if (!process.env.MONGO_URI) {
  console.warn("⚠️  MONGO_URI NOT SET. Set MONGO_URI in .env or Render Environment variables.");
}
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("⚠️  EMAIL_USER / EMAIL_PASS not set - OTP emails will fail without these.");
}
if (!process.env.RZP_KEY_SECRET) {
  console.warn("⚠️  RZP_KEY_SECRET not set - Razorpay verification will fail without it.");
}

/* -------------------------
   Connect MongoDB
--------------------------*/
mongoose
  .connect(process.env.MONGO_URI || "", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected to Atlas"))
  .catch((err) => console.log("❌ Mongo Error:", err?.message || err));

/* -------------------------
   Nodemailer transporter (Gmail)
--------------------------*/
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* -------------------------
   SEND OTP
--------------------------*/
app.post("/send-otp", async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name, phone, email, otp });
    } else {
      user.otp = otp;
    }

    await user.save();

    // send email (catch SMTP errors)
    try {
      await transporter.sendMail({
        from: `"COSCO Shipping" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your COSCO OTP Code",
        text: `Hello ${name}, your OTP is ${otp}.`,
      });
    } catch (mailErr) {
      console.error("Mail send error:", mailErr);
      return res.status(500).json({ success: false, message: "Failed to send OTP email", error: mailErr.message });
    }

    return res.json({ success: true, message: "OTP sent successfully!" });
  } catch (error) {
    console.error("SEND OTP ERROR:", error);
    return res.status(500).json({ success: false, message: "OTP send failed", error: error?.message });
  }
});

/* -------------------------
   VERIFY OTP
--------------------------*/
app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Missing fields" });

    const user = await User.findOne({ email });
    if (!user || user.otp !== otp) return res.status(400).json({ success: false, message: "Invalid OTP" });

    user.verified = true;
    user.otp = null;
    await user.save();

    return res.json({ success: true, message: "User verified", user });
  } catch (error) {
    console.error("VERIFY ERROR:", error);
    return res.status(500).json({ success: false, message: "Verification failed", error: error?.message });
  }
});

/* -------------------------
   CREATE ORDER (Razorpay)
--------------------------*/
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

    const options = {
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    return res.json({ success: true, order });
  } catch (error) {
    console.error("ORDER ERROR:", error);
    return res.status(500).json({ success: false, message: "Order creation failed", error: error?.message });
  }
});

/* -------------------------
   VERIFY PAYMENT (Razorpay signature)
--------------------------*/
app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ success: false, message: "Missing fields" });

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto.createHmac("sha256", process.env.RZP_KEY_SECRET || "").update(sign).digest("hex");

    if (expectedSign === razorpay_signature) {
      return res.json({ success: true, message: "Payment Verified!" });
    }

    return res.status(400).json({ success: false, message: "Invalid signature!" });
  } catch (error) {
    console.error("VERIFY ERROR:", error);
    return res.status(500).json({ success: false, message: "Verification failed", error: error?.message });
  }
});

/* -------------------------
   GET USER BY EMAIL
--------------------------*/
app.get("/user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, user });
  } catch (error) {
    console.error("USER ERROR:", error);
    return res.status(500).json({ success: false, message: "Error retrieving user", error: error?.message });
  }
});

/* -------------------------
   Root - returns JSON (safer than HTML)
--------------------------*/
app.get("/", (req, res) => {
  res.json({ success: true, message: "🚀 COSCO Backend Active" });
});

/* -------------------------
   Start server (works on Render)
--------------------------*/
const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
