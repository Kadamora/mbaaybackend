"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const invoiceSchema = new mongoose_1.default.Schema({
    orderId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
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
        type: mongoose_1.default.Schema.Types.ObjectId,
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
}, { timestamps: true });
exports.InvoiceModel = mongoose_1.default.model("invoice", invoiceSchema);
