"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TempPaymentModel = void 0;
// models/TempPayment.ts
const mongoose_1 = __importDefault(require("mongoose"));
const mongoose_2 = require("mongoose");
const tempPaymentSchema = new mongoose_2.Schema({
    reference: { type: String, required: true },
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
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
        userId: mongoose_1.default.Schema.Types.ObjectId,
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
}, { timestamps: true });
exports.TempPaymentModel = (0, mongoose_2.model)("TempPayment", tempPaymentSchema);
