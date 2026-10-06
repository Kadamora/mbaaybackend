"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vendorModel = void 0;
const mongoose_1 = require("mongoose");
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const accountTypeLimits = {
    "Starter plus": 1,
    Shelf: 2,
    Counter: 3,
    Shop: 5,
};
const vendorSchema = new mongoose_1.Schema({
    storeName: {
        type: String,
        required: true,
        trim: true,
    },
    otpCode: {
        type: String,
    },
    otpExpires: {
        type: Date,
    },
    refreshToken: {
        type: String,
    },
    storePhone: {
        type: String,
        required: true,
        trim: true,
    },
    storeType: {
        type: String,
        enum: ["Starter", "Starter plus", "Shelf", "Counter", "Shop", "Premium"],
        default: "Starter",
    },
    userName: {
        type: String,
        trim: true,
    },
    paystackRecipientCode: {
        type: String,
        trim: true,
    },
    bankAccount: {
        account_number: String,
        bank_code: String,
        account_name: String,
        bankName: String,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        match: [emailRegex, "Input a valid email"],
    },
    pendingEmail: {
        type: String,
        trim: true,
        unique: true,
        match: [emailRegex, "Input a valid email"],
    },
    password: {
        type: String,
        trim: true,
        required: function () {
            return this.authProvider !== "google";
        },
    },
    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local",
    },
    state: {
        type: String,
        // required: true,
        trim: true,
    },
    country: {
        type: String,
        // required: true,
        trim: true,
    },
    city: {
        type: String,
        // required: true,
        trim: true,
    },
    address1: {
        type: String,
        // required: true,
    },
    address2: {
        type: String,
    },
    avatar: {
        type: String,
    },
    bio: {
        type: String,
        // required: true,
    },
    emailSent: {
        type: Boolean,
        default: false,
    },
    businessLogo: {
        type: String,
    },
    businessDescription: {
        type: String,
    },
    businessVideo: {
        type: String,
    },
    businessHistory: {
        type: String,
    },
    businessWorkflow: {
        type: String,
    },
    workTools: [
        {
            type: String,
        },
    ],
    verificationStatus: {
        type: String,
        enum: ["Approved", "Rejected", "Pending"],
        default: "Pending",
    },
    followers: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: ["vendors", "users"],
        },
    ],
    communityPosts: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "CommunityPost",
        },
    ],
    orders: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Order",
        },
    ],
    kycDocuments: {
        front: { type: String },
        back: { type: String },
        documentType: {
            type: String,
            enum: ["National ID", "Passport", "Driver's License", "Other"],
            // required: true,
        },
        country: {
            type: String,
            // required: true,
            trim: true,
        },
    },
    kycStatus: {
        type: String,
        enum: ["Pending", "Processing", "Approved", "Rejected"],
        default: "Pending",
    },
    kycSubmittedAt: {
        type: Date,
    },
    kycReviewedAt: {
        type: Date,
    },
    isBlocked: {
        type: String,
        // required: true,
    },
    my_bought_products_orders: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Order",
        },
    ],
    products: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "products",
        },
    ],
    customers: [
        {
            customer: {
                type: mongoose_1.Schema.Types.ObjectId,
                refPath: "customers.modelType",
                required: true,
            },
            status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
            modelType: { type: String, enum: ["users", "vendors"] },
            lastOrderDate: { type: Date, default: Date.now },
        },
    ],
    communities: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "community",
        },
    ],
    following: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: ["vendors", "users"],
        },
    ],
    craftCategories: {
        type: [String], // Array of categories
        required: true,
    },
    createdAt: {
        type: Date, // Array of categories
        default: Date.now(),
    },
    returnPolicy: {
        type: String,
    },
    returnpolicyverified: {
        type: String,
        enum: ["Approved", "Rejected", "Pending"],
    },
    notifications: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "notifications",
        },
    ],
    payments: [
        {
            paymentId: { type: String, required: true },
            status: {
                type: String,
                enum: ["Pending", "Successful", "Failed"],
                default: "Pending",
            },
            amount: { type: Number, required: true },
            date: { type: Date, default: Date.now },
            customer: { type: mongoose_1.Schema.Types.ObjectId, refPath: "payments.modelType" },
            modelType: { type: String, enum: ["users", "vendors"] },
        },
    ],
    subscription: {
        currentPlan: {
            type: String,
            enum: ["Starter", "Starter plus", "Shelf", "Counter", "Shop", "Premium"],
            default: "Starter",
        },
        billingCycle: {
            type: String,
            enum: ["Monthly", "Quarterly", "HalfYearly", "Yearly"],
            default: "Monthly",
        },
        status: {
            type: String,
            enum: ["Active", "Expired", "Pending"],
            default: "Pending",
        },
        startDate: {
            type: Date,
        },
        expiryDate: {
            type: Date,
        },
        lastPaymentReference: {
            type: String,
        },
        lastExpiryReminderSent: {
            type: Date,
            default: null,
        },
        lastSuspendedReminderSent: {
            type: Date,
            default: null,
        },
        suspensionStartDate: {
            type: Date,
            default: null,
        },
        deletionStage: {
            type: Number,
            default: 0,
        },
        originalProductCount: {
            type: Number,
            default: 0,
        },
    },
});
// Middleware to validate craftCategories based on storeType and workTools max 8
vendorSchema.pre("save", function (next) {
    const doc = this;
    const limit = accountTypeLimits[doc.storeType];
    if (doc.craftCategories.length > limit) {
        const error = new Error(`A ${doc.storeType} account can select up to ${limit} categories. You selected ${doc.craftCategories.length}.`);
        next(error);
    }
    else if (doc.workTools && doc.workTools.length > 8) {
        const error = new Error(`You can upload up to 8 work tool images. You have ${doc.workTools.length}.`);
        next(error);
    }
    else if (doc.workTools && doc.workTools.length > 8) {
        const error = new Error(`You can upload up to 8 work tool images. You have ${doc.workTools.length}.`);
        next(error);
    }
    else {
        next();
    }
});
exports.vendorModel = (0, mongoose_1.model)("vendors", vendorSchema);
