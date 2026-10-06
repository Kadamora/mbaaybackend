"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductModel = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ProductSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    poster: {
        type: mongoose_1.default.Schema.Types.ObjectId,
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
                type: mongoose_1.default.Schema.Types.ObjectId,
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
            type: mongoose_1.default.Schema.Types.ObjectId,
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
}, { timestamps: true });
exports.ProductModel = mongoose_1.default.model("products", ProductSchema);
