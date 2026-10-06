// models/TempPayment.ts
import mongoose from "mongoose";
import { Schema, model, Document } from "mongoose";

interface ITempPayment extends Document {
  reference: string;
  sessionId: string;
  userId: mongoose.Schema.Types.ObjectId;
  ordersByVendor: Record<string, { orders: any[]; amount: number }>;
  ordersByAdmin: { orders: any[]; amount: number };
  cartItems: any;
  buyerInfo: {
    phone: string;
    address: string;
    sessionId: string;
    first_name: string;
    last_name: string;
    companyName: string;
    email: string;
    country: string;
    region: string;
    city: string;
    apartment: string;
    userId: mongoose.Schema.Types.ObjectId;
    postalCode: string;
  };
  paymentOption: "Pay Before Delivery" | "Pay After Delivery";
  // NEW: amounts locked in at checkout time, so paymentCallback can charge
  // and record exactly what was quoted to the buyer instead of recalculating
  // (and potentially drifting) later.
  subtotal: number;
  shippingFee: number;
  vat: number;
  totalAmount: number;
}

const tempPaymentSchema = new Schema<ITempPayment>(
  {
    reference: { type: String, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    sessionId: { type: String, required: true },
    ordersByVendor: { type: Object, required: true },
    ordersByAdmin: { type: Object, required: true },
    cartItems: { type: Array, required: true },
    buyerInfo: {
      first_name: String,
      last_name: String,
      companyName: String,
      email: String,
      phone: String,
      address: String,
      region: String,
      city: String,
      country: String,
      apartment: String,
      postalCode: String,
      sessionId: String,
      userId: mongoose.Schema.Types.ObjectId,
    },
    paymentOption: {
      type: String,
      enum: ["Pay Before Delivery", "Pay After Delivery"],
      required: true,
    },
    // NEW: checkout breakdown
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    vat: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export const TempPaymentModel = model<ITempPayment>(
  "TempPayment",
  tempPaymentSchema,
);
