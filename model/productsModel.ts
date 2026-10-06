import mongoose, { Document, Schema } from "mongoose";
import { products } from "../interfaces/productsUpload";

export interface IProduct extends products, Document {}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    poster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vendors",
    },
    description: { type: String, required: true },
    price: { type: Number }, // normal sales price
    inventory: { type: Number, required: true },
    images: [{ type: String }],
    category: { type: String, required: true },
    sub_category: { type: String, required: true },
    sub_category2: { type: String, required: true },
    upload_type: { type: String, enum: ["upload", "link"] },

    product_video: { type: String },
    verified: { type: Boolean, default: true },
    uploadedBy: {
      type: String,
      enum: ["admin", null],
      default: null,
    },
    productType: {
      type: String,
      enum: ["sales", "auction", "flash sale"],
      default: "sales",
    },

    // NEW: shipping fields
    // "Negotiable" = buyer & vendor agree a shipping fee via chat AFTER
    // checkout. Order goes through with shippingFee 0 for that item; the
    // vendor sets the real fee post-order and the buyer pays it on delivery
    // (offline, not through Paystack).
    shippingType: {
      type: String,
      enum: ["Free", "Fixed", "Negotiable"],
      default: "Free",
      required: true,
    },
    shippingFee: {
      type: Number,
      default: 0, // only meaningful when shippingType === "Fixed"
    },

    // Original price for flash sales
    originalPrice: { type: Number }, // stored separately when flash sale is active
    // Flash sale fields
    flashSalePrice: { type: Number },
    flashSaleStartDate: { type: Date },
    flashSaleEndDate: { type: Date },
    flashSaleDiscount: { type: Number }, // percentage
    flashSaleStatus: {
      type: String,
      enum: ["Pending", "Active", "Ended", "Inactive"],
      default: "Inactive",
    },
    // Auction fields
    startingPrice: { type: Number }, // required if auction
    reservePrice: { type: Number }, // optional
    auctionDuration: {
      type: Number,
      enum: [1, 3, 5, 7, 10], // days
    },
    auctionEndDate: { type: Date },
    bids: [
      {
        bidder: {
          type: mongoose.Schema.Types.ObjectId,
          // required: true,
          refPath: "bids.bidderModel",
        },
        bidderModel: {
          type: String,
          // required: true,
          enum: ["users", "vendors"],
        },

        createdAt: { type: Date, default: Date.now },
        amount: { type: Number, default: 0 },
      },
    ],

    highestBid: {
      bidder: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "highestBid.bidderModel",
      },
      bidderModel: { type: String, enum: ["users", "vendors"] },
      amount: { type: Number, default: 0 },
    },

    auctionStatus: {
      type: String,
      enum: ["Pending", "Active", "Ended"],
      default: "Pending",
    },
  },
  { timestamps: true },
);

export const ProductModel = mongoose.model<IProduct>("products", ProductSchema);
