import mongoose, { Schema, Document } from "mongoose";

interface iCartItem {
  product: mongoose.Types.ObjectId;
  quantity: number;
}

interface iCart extends Document {
  sessionId: string;
  items: iCartItem[];
}

const cartItemSchema = new Schema<iCartItem>({
  product: { type: Schema.Types.ObjectId, ref: "products", required: true },
  quantity: { type: Number, default: 1 },
});

const cartSchema = new Schema<iCart>({
  sessionId: { type: String, required: true },
  items: [cartItemSchema],
});

export const CartModel = mongoose.model<iCart>("Cart", cartSchema);
