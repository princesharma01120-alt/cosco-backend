import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  datePurchased: { type: Date, default: Date.now },
  status: { type: String, default: "Active" },
});

const Product = mongoose.model("Product", productSchema);
export default Product;
