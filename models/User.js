import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  otp: String,
  verified: { type: Boolean, default: false },

  // NEW FIELDS
  balance: { type: Number, default: 0 },
  totalIncome: { type: Number, default: 0 },
  referredUsers: [{ type: String }], // list of emails

  purchasedPlans: [
    {
      planName: String,
      amount: Number,
      profitPerDay: Number,
      purchaseDate: { type: Date, default: Date.now },
    }
  ],

  withdrawHistory: [
    {
      amount: Number,
      date: { type: Date, default: Date.now },
      status: String,
    }
  ],

  depositHistory: [
    {
      amount: Number,
      date: { type: Date, default: Date.now },
      method: String,
    }
  ]
});

export default mongoose.model("User", userSchema);
