import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "orders",
      required: true,
    },
    buyerInfo: {
      first_name: String,
      last_name: String,
      email: String,
      phone: String,
      address: String,
      country: String,
      city: String,
      region: String,
      postalCode: String,
    },
    poster: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    posterRole: {
      type: String,
      enum: ["vendor", "admin"],
      required: true,
    },
    items: [
      {
        name: String,
        quantity: Number,
        unitPrice: Number,
        totalPrice: Number,
      },
    ],
    subtotal: Number,
    tax: Number,
    deliveryFee: Number,
    total: Number,
    issuedDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: Date,
    status: {
      type: String,
      enum: ["Unpaid", "Paid", "Overdue"],
      default: "Unpaid",
    },
  },
  { timestamps: true }
);

export const InvoiceModel = mongoose.model("invoice", invoiceSchema);
