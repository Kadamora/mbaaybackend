import mongoose, { Schema, model } from "mongoose";

import { Document } from "mongoose";

export interface IBuyerInfo {
  phone: string;
  address: string;
  sessionId: string;
  first_name: string;
  last_name: string;
  companyName?: string;
  email: string;
  country: string;
  region: string;
  city: string;
  apartment?: string;
  postalCode: string;
  saveInfo: boolean;
  userId: mongoose.Schema.Types.ObjectId;
  couponCode?: string;
}

// NEW: one order item, now carrying its own shipping fee + negotiation status
export interface IOrderItem {
  product: mongoose.Schema.Types.ObjectId;
  quantity: number;
  price: number;
  total: number;
  shippingFee: number;
  shippingStatus: "Not Required" | "Pending Agreement" | "Agreed";
}

export interface IOrder extends Document {
  items: IOrderItem[]; // CHANGED: was untyped []
  buyerSession: string;
  status:
    | "Pending"
    | "Processing"
    | "Shipped"
    | "Delivered"
    | "Cancelled"
    | "Cancellation Requested"
    | "Postponement Requested"
    | "Return Requested"
    | "Returned";
  buyerInfo: IBuyerInfo;
  payStatus: "Pending" | "Successful" | "Payment Failed";
  paymentOption: "Pay Before Delivery" | "Pay After Delivery";
  userId: mongoose.Schema.Types.ObjectId;
  postponementDates?: {
    from: Date;
    to: Date;
  };
  returnDetails?: {
    reason: string;
    condition: string;
    method: string;
    comments?: string;
    requestedAt: Date;
    returnedProducts: any[];
  };
  cancelledQuantity?: number;
  postponedQuantity?: number;
  returnedQuantity?: number;
  totalPrice: number;
  // NEW: order-level shipping/VAT breakdown
  shippingFee: number; // sum of items[].shippingFee (Pending Agreement items count as 0 until agreed)
  vat: number; // 10% of totalPrice
  grandTotal: number; // totalPrice + shippingFee + vat
  hasPendingShipping: boolean; // true while any item is still "Pending Agreement"
  deliveryDate?: Date;
  vendorPaid?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderSchema = new Schema(
  {
    items: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "products",
          required: true,
        },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        total: { type: Number, required: true },
        // NEW: per-item shipping fee + status
        shippingFee: { type: Number, default: 0 },
        shippingStatus: {
          type: String,
          enum: ["Not Required", "Pending Agreement", "Agreed"],
          default: "Not Required",
        },
      },
    ],

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // NEW: order-level shipping/VAT breakdown
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    vat: {
      type: Number,
      default: 0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    hasPendingShipping: {
      type: Boolean,
      default: false,
    },

    buyerSession: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Cancellation Requested",
        "Postponement Requested",
        "Return Requested",
        "Returned",
      ],
      default: "Pending",
    },
    payStatus: {
      type: String,
      enum: ["Pending", "Successful", "Payment Failed"],
      default: "Pending",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    buyerInfo: {
      first_name: String,
      last_name: String,
      email: String,
      phone: String,
      address: String,
      country: String,
      region: String,
      city: String,
      sessionId: String,
      companyName: String,
      apartment: String,
      postalCode: String,
      couponCode: String,
      userId: mongoose.Schema.Types.ObjectId,
    },
    paymentOption: {
      type: String,
      enum: ["Pay Before Delivery", "Pay After Delivery"],
      default: "Pay Before Delivery", // or whatever suits your default
    },
    postponementDates: {
      from: Date,
      to: Date,
    },
    returnDetails: {
      reason: String,
      condition: String,
      method: String,
      comments: String,
      requestedAt: Date,
      returnedProducts: [
        {
          productId: { type: mongoose.Schema.Types.ObjectId, ref: "products" },
          quantity: { type: Number, required: true },
        },
      ],
    },
    deliveryDate: Date,
    vendorPaid: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const OrderModel = model<IOrder>("Order", orderSchema);
