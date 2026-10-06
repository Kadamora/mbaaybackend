import mongoose, { Schema, model } from "mongoose";
import { Review } from "../interfaces/reviewsInterface";

const reviewSchema = new Schema<Review>(
  {
    product: { type: Schema.Types.ObjectId, ref: "products", required: true },
    customer: { type: Schema.Types.ObjectId, required: true },
    reviewerType: { type: String, enum: ["user", "vendor"], required: true },
    reviewerName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, maxlength: 200 },
    comment: { type: String, required: true, maxlength: 1000 },
    verified: { type: Boolean, default: false },
    vendorReply: {
      message: { type: String, maxlength: 1000 },
      repliedAt: Date,
      repliedBy: { type: Schema.Types.ObjectId, ref: "vendors" },
      isPublic: { type: Boolean, default: true },
    },
    vendorPrivateMessages: [
      {
        message: { type: String, required: true },
        sentAt: { type: Date, default: Date.now },
        sentBy: { type: Schema.Types.ObjectId, refPath: "messageSenderModel" },
        messageType: {
          type: String,
          enum: ["vendor_to_customer", "customer_to_vendor"],
          required: true,
        },
      },
    ],
    status: {
      type: String,
      enum: ["active", "hidden", "reported"],
      default: "active",
    },
    helpful: { type: Number, default: 0 },
    images: [{ type: String }],
  },
  { timestamps: true }
);

// Indexes
reviewSchema.index({ product: 1, customer: 1 }, { unique: true }); // One review per customer per product
reviewSchema.index({ product: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ verified: 1 });

export const ReviewModel = model<Review>("reviews", reviewSchema);
