"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminModel = void 0;
const mongoose_1 = require("mongoose");
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const adminSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
    },
    refreshToken: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
        required: true,
        match: [emailRegex, "Input a valid email"],
    },
    password: {
        type: String,
        required: true,
    },
    isBlocked: {
        type: String,
        // required: true,
    },
    profileImage: {
        type: String,
    },
    role: {
        type: String,
        enum: ["Admin", "Customer care", "Super Admin"],
        required: true,
    },
    requests: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "vendors",
        },
    ],
    orders: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Orders",
        },
    ],
});
exports.adminModel = (0, mongoose_1.model)("admins", adminSchema);
