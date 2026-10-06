"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVendorPayouts = exports.deleteSuspendedProducts = exports.sendSuspendedReminders = exports.sendExpiryReminders = exports.handleExpiringAuctions = exports.handleAuctions = exports.markInactiveCustomers = exports.sendMailAndRemoveVendors = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const uuid_1 = require("uuid"); // NEW
const vendorModel_1 = require("../model/vendorModel");
const adminModel_1 = require("../model/adminModel");
const productsModel_1 = require("../model/productsModel");
const orderModel_1 = require("../model/orderModel"); // NEW
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const userModel_1 = require("../model/userModel");
const email_1 = require("./email");
const orderController_1 = require("../controller/orderController"); // NEW — adjust path to wherever your paystack axios client actually lives (same one used in checkoutController)
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
const planPricing = {
    "Starter plus": {
        Monthly: 3000,
        Quarterly: 8000,
        HalfYearly: 15000,
        Yearly: 20000,
    },
    Shelf: { Monthly: 5000, Quarterly: 13500, HalfYearly: 25500, Yearly: 48000 },
    Counter: {
        Monthly: 7500,
        Quarterly: 20250,
        HalfYearly: 38250,
        Yearly: 72000,
    },
    Shop: { Monthly: 12000, Quarterly: 32400, HalfYearly: 61200, Yearly: 115200 },
    Premium: {
        Monthly: 20000,
        Quarterly: 54000,
        HalfYearly: 102000,
        Yearly: 192000,
    },
};
// ─────────────────────────────────────────────────────────────
// NEW: business-day helpers for vendor payout timing
// ─────────────────────────────────────────────────────────────
const isWeekend = (date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
};
/**
 * Adds `count` BUSINESS days (skipping Sat/Sun) to a date and returns the
 * resulting Date. Used to work out when a vendor becomes eligible for payout.
 */
const addBusinessDays = (start, count) => {
    const result = new Date(start);
    let added = 0;
    while (added < count) {
        result.setDate(result.getDate() + 1);
        if (!isWeekend(result)) {
            added++;
        }
    }
    return result;
};
/**
 * ✅ Send vendor approval/rejection emails, remove rejected vendors
 */
const sendMailAndRemoveVendors = () => __awaiter(void 0, void 0, void 0, function* () {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    const vendors = yield vendorModel_1.vendorModel.find({
        verificationStatus: { $in: ["Approved", "Rejected"] },
        createdAt: { $lt: cutoffTime },
        emailSent: false,
    });
    const acceptedPath = path_1.default.join(__dirname, "..", "..", "view", "approved.ejs");
    const rejectedPath = path_1.default.join(__dirname, "..", "..", "view", "rejected.ejs");
    for (const vendor of vendors) {
        const mailTemplate = vendor.verificationStatus === "Approved"
            ? yield ejs_1.default.renderFile(acceptedPath, { storeName: vendor.storeName })
            : yield ejs_1.default.renderFile(rejectedPath, { storeName: vendor.storeName });
        yield (0, email_1.sendMail)(vendor.email, "Account Verification Status", mailTemplate);
        yield vendorModel_1.vendorModel.findByIdAndUpdate(vendor._id, { emailSent: true });
        // remove vendor from admin requests
        yield adminModel_1.adminModel.updateMany({ requests: vendor._id }, { $pull: { requests: vendor._id } });
        // delete rejected vendors
        if (vendor.verificationStatus === "Rejected") {
            yield vendorModel_1.vendorModel.findByIdAndDelete(vendor._id);
        }
    }
});
exports.sendMailAndRemoveVendors = sendMailAndRemoveVendors;
/**
 * ✅ Mark customers inactive after 30 days of no orders
 */
const markInactiveCustomers = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const THRESHOLD_DAYS = 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - THRESHOLD_DAYS);
        const vendors = yield vendorModel_1.vendorModel.find();
        for (const vendor of vendors) {
            let updated = false;
            vendor.customers.forEach((cust) => {
                if (cust.lastOrderDate < cutoffDate && cust.status !== "Inactive") {
                    cust.status = "Inactive";
                    updated = true;
                }
            });
            if (updated) {
                yield vendor.save();
                console.log(`✅ Updated inactive customers for vendor: ${vendor._id}`);
            }
        }
        console.log("🏁 Inactive customer check completed");
    }
    catch (err) {
        console.error("❌ Error marking inactive customers:", err);
    }
});
exports.markInactiveCustomers = markInactiveCustomers;
/**
 * ✅ Auction lifecycle manager:
 * - Activate pending auctions
 * - End expired auctions
 */
const handleAuctions = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const now = new Date();
        const pendingAuctions = yield productsModel_1.ProductModel.find({
            productType: "auction",
            auctionStatus: "Pending",
            createdAt: { $lte: now },
        }).populate("poster");
        for (const auction of pendingAuctions) {
            if (!auction.auctionEndDate && auction.auctionDuration) {
                auction.auctionEndDate = new Date(auction.createdAt.getTime() +
                    auction.auctionDuration * 24 * 60 * 60 * 1000);
            }
            auction.auctionStatus = "Active";
            yield auction.save();
            if (auction.uploadedBy === "admin") {
                const users = yield userModel_1.userModel.find({});
                for (const user of users) {
                    yield notificationsModel_1.default.create({
                        recipient: user._id,
                        type: "System",
                        title: "Auction Started",
                        message: `Admin auction "${auction.name}" is now live!`,
                        metadata: { productId: auction._id },
                    });
                }
            }
            else {
                const vendor = yield vendorModel_1.vendorModel
                    .findById(auction.poster)
                    .populate("followers");
                if ((_a = vendor === null || vendor === void 0 ? void 0 : vendor.followers) === null || _a === void 0 ? void 0 : _a.length) {
                    for (const follower of vendor.followers) {
                        yield notificationsModel_1.default.create({
                            recipient: follower._id,
                            type: "System",
                            title: "Auction Started",
                            message: `Auction "${auction.name}" by ${vendor.storeName} is now live!`,
                            metadata: { productId: auction._id },
                        });
                    }
                }
            }
        }
        // 2️⃣ Close active auctions
        const activeAuctions = yield productsModel_1.ProductModel.find({
            productType: "auction",
            auctionStatus: "Active",
            auctionEndDate: { $lte: now },
        })
            .populate("poster")
            .populate("highestBid.bidder");
        for (const auction of activeAuctions) {
            auction.auctionStatus = "Ended";
            yield auction.save();
            // notify highest bidder
            if ((_b = auction.highestBid) === null || _b === void 0 ? void 0 : _b.bidder) {
                yield notificationsModel_1.default.create({
                    recipient: auction.highestBid.bidder._id,
                    type: "System",
                    title: "Auction Won 🎉",
                    message: `Congratulations! You won "${auction.name}" with a bid of ₦${auction.highestBid.amount}. Proceed to checkout.`,
                    metadata: { productId: auction._id },
                });
            }
            if (auction.uploadedBy === "admin") {
                const admins = yield adminModel_1.adminModel.find();
                for (const admin of admins) {
                    yield notificationsModel_1.default.create({
                        recipient: admin._id,
                        type: "System",
                        title: "Auction Ended",
                        message: `Admin auction "${auction.name}" has ended.`,
                        metadata: { productId: auction._id },
                    });
                }
            }
            else {
                yield notificationsModel_1.default.create({
                    recipient: auction.poster._id,
                    type: "System",
                    title: "Auction Ended",
                    message: `Your auction "${auction.name}" has ended.`,
                    metadata: { productId: auction._id },
                });
            }
        }
    }
    catch (error) {
        console.error("Auction Cron Job Error:", error);
    }
});
exports.handleAuctions = handleAuctions;
const handleExpiringAuctions = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        // Find vendors with expired subscriptions
        const expiredVendors = yield vendorModel_1.vendorModel.find({
            "subscription.status": "Active",
            "subscription.expiryDate": { $lte: now },
        });
        for (const vendor of expiredVendors) {
            // Downgrade vendor to Starter
            vendor.storeType = "Starter";
            vendor.subscription.status = "Expired";
            vendor.subscription.suspensionStartDate = new Date();
            // Set original product count for staged deletion
            const currentProductCount = yield productsModel_1.ProductModel.countDocuments({
                poster: vendor._id,
            });
            vendor.subscription.originalProductCount = currentProductCount;
            // Optional: clear categories above Starter limit
            const maxCategories = 1;
            vendor.craftCategories = vendor.craftCategories.slice(0, maxCategories);
            // Get all products for this vendor
            const allProducts = yield productsModel_1.ProductModel.find({ poster: vendor._id });
            if (allProducts.length > 0) {
                // Randomly select 5 products to keep visible (or all if less than 5)
                const productsToKeepVisible = Math.min(5, allProducts.length);
                const shuffledProducts = allProducts.sort(() => 0.5 - Math.random());
                const visibleProducts = shuffledProducts.slice(0, productsToKeepVisible);
                const hiddenProducts = shuffledProducts.slice(productsToKeepVisible);
                // Keep selected products visible
                if (visibleProducts.length > 0) {
                    const visibleIds = visibleProducts.map((p) => p._id);
                    yield productsModel_1.ProductModel.updateMany({ _id: { $in: visibleIds } }, { verified: true });
                }
                // Hide all other products
                if (hiddenProducts.length > 0) {
                    const hiddenIds = hiddenProducts.map((p) => p._id);
                    yield productsModel_1.ProductModel.updateMany({ _id: { $in: hiddenIds } }, { verified: false });
                }
                console.log(`📦 Vendor ${vendor.storeName}: Kept ${productsToKeepVisible} products visible, hid ${hiddenProducts.length} products`);
            }
            yield vendor.save();
            // Notify vendor
            yield notificationsModel_1.default.create({
                recipient: vendor._id,
                type: "System",
                title: "Subscription Expired",
                message: `Your subscription has expired. You have been downgraded to the Starter plan. Only 5 of your products remain visible to customers. Please renew to restore full visibility.`,
                isRead: false,
                metadata: { vendorId: vendor._id },
            });
            console.log(`⚠️ Subscription expired for vendor: ${vendor.storeName}`);
        }
        console.log("✅ Subscription check completed.");
    }
    catch (error) {
        console.error("❌ Error checking expired subscriptions:", error.message);
    }
});
exports.handleExpiringAuctions = handleExpiringAuctions;
/**
 * ✅ Send expiry reminders to vendors whose subscription expires in 7 days or less
 */
const sendExpiryReminders = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        const warningDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
        const vendors = yield vendorModel_1.vendorModel.find({
            "subscription.status": "Active",
            "subscription.expiryDate": { $lte: warningDate, $gt: now },
        });
        const expiryReminderPath = path_1.default.join(__dirname, "..", "..", "view", "expiry_reminder.ejs");
        for (const vendor of vendors) {
            const expiryDate = vendor.subscription.expiryDate
                .toISOString()
                .split("T")[0];
            const daysRemaining = Math.ceil((vendor.subscription.expiryDate.getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24));
            const planName = vendor.subscription.currentPlan;
            const renewalPrice = `₦${planPricing[vendor.subscription.currentPlan][vendor.subscription.billingCycle].toLocaleString()}`;
            const variables = {
                vendorName: vendor.storeName,
                expirationDate: expiryDate,
                planName,
                daysRemaining,
                renewalPrice,
                renewalLink: "https://mbaay.com/vendor/renew",
                plansLink: "https://mbaay.com/plans",
                supportEmail: "mbaay.com@gmail.com",
                supportLink: "https://mbaay.com/support",
                faqLink: "https://mbaay.com/faq",
                docsLink: "https://mbaay.com/docs",
                dashboardLink: "https://mbaay.com/vendor/dashboard",
                accountSettingsLink: "https://mbaay.com/vendor/settings",
                privacyLink: "https://mbaay.com/privacy",
            };
            const mailTemplate = yield ejs_1.default.renderFile(expiryReminderPath, variables);
            yield (0, email_1.sendMail)(vendor.email, "Mbaay Subscription Expiring Soon", mailTemplate);
            console.log(`📧 Sent expiry reminder to ${vendor.storeName}`);
        }
        console.log("✅ Expiry reminders sent.");
    }
    catch (error) {
        console.error("❌ Error sending expiry reminders:", error.message);
    }
});
exports.sendExpiryReminders = sendExpiryReminders;
/**
 * ✅ Send suspended reminders every 4 days for 21 days after expiry
 */
const sendSuspendedReminders = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        const vendors = yield vendorModel_1.vendorModel.find({
            "subscription.status": "Expired",
            "subscription.suspensionStartDate": { $exists: true },
        });
        const suspendedReminderPath = path_1.default.join(__dirname, "..", "..", "view", "suspended_reminder.ejs");
        for (const vendor of vendors) {
            const suspensionDays = Math.floor((now.getTime() - vendor.subscription.suspensionStartDate.getTime()) /
                (1000 * 60 * 60 * 24));
            const daysSinceLastRemind = vendor.subscription.lastSuspendedReminderSent
                ? Math.floor((now.getTime() -
                    vendor.subscription.lastSuspendedReminderSent.getTime()) /
                    (1000 * 60 * 60 * 24))
                : 4;
            if (suspensionDays > 21)
                continue; // Grace period over
            if (daysSinceLastRemind >= 4) {
                const daysRemaining = 21 - suspensionDays;
                `₦${planPricing[vendor.subscription.currentPlan][vendor.subscription.billingCycle].toLocaleString()}`;
                const variables = {
                    vendorName: vendor.storeName,
                    expirationDate: vendor.subscription.expiryDate
                        .toISOString()
                        .split("T")[0],
                    daysRemaining,
                    renewalLink: "https://mbaay.com/vendor/renew",
                    plansLink: "https://mbaay.com/plans",
                    dashboardLink: "https://mbaay.com/vendor/dashboard",
                    accountSettingsLink: "https://mbaay.com/vendor/settings",
                    supportLink: "https://mbaay.com/support",
                    privacyLink: "https://mbaay.com/privacy",
                };
                const mailTemplate = yield ejs_1.default.renderFile(suspendedReminderPath, variables);
                yield (0, email_1.sendMail)(vendor.email, "Mbaay Account Suspended - Renew Now", mailTemplate);
                vendor.subscription.lastSuspendedReminderSent = now;
                yield vendor.save();
                console.log(`📧 Sent suspended reminder to ${vendor.storeName}`);
            }
        }
        console.log("✅ Suspended reminders sent.");
    }
    catch (error) {
        console.error("❌ Error sending suspended reminders:", error.message);
    }
});
exports.sendSuspendedReminders = sendSuspendedReminders;
/**
 * ✅ Delete products of suspended vendors staged over 21 days after expiry (leaves exactly 5 products from Starter categories)
 */
const deleteSuspendedProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        const suspendableVendors = yield vendorModel_1.vendorModel.find({
            "subscription.status": "Expired",
            "subscription.suspensionStartDate": { $exists: true },
        });
        for (const vendor of suspendableVendors) {
            const suspensionDays = Math.floor((now.getTime() - vendor.subscription.suspensionStartDate.getTime()) /
                (1000 * 60 * 60 * 24));
            // Only proceed if subscription has expired AND 21 days grace has passed
            if (suspensionDays < 21) {
                console.log(`⏳ Vendor ${vendor.storeName} still in ${21 - suspensionDays} days grace period. Skipping deletion.`);
                continue;
            }
            const originalCount = vendor.subscription.originalProductCount || 0;
            if (originalCount === 0)
                continue; // No products to delete
            // Get allowed categories for Starter plan (first category after downgrade)
            const allowedCategories = vendor.craftCategories || [];
            let targetStage = 0;
            if (suspensionDays >= 31) {
                targetStage = 4; // Delete all but exactly 5 products from allowed categories
            }
            else if (suspensionDays >= 28) {
                targetStage = 3; // 75% deleted
            }
            else if (suspensionDays >= 25) {
                targetStage = 2; // 50% deleted
            }
            else if (suspensionDays >= 22) {
                targetStage = 1; // 25% deleted
            }
            const currentStage = vendor.subscription.deletionStage || 0;
            if (targetStage > currentStage) {
                // Delete products for each new stage reached
                for (let stage = currentStage + 1; stage <= targetStage; stage++) {
                    const allRemainingProducts = yield productsModel_1.ProductModel.find({
                        poster: vendor._id,
                    });
                    // Separate products by category
                    const allowedCategoryProducts = allRemainingProducts.filter((product) => allowedCategories.includes(product.category));
                    const otherCategoryProducts = allRemainingProducts.filter((product) => !allowedCategories.includes(product.category));
                    if (stage === 4) {
                        // Final stage: ensure exactly 5 products remain from allowed categories
                        const targetRemaining = 5;
                        if (allowedCategoryProducts.length >= targetRemaining) {
                            // We have enough from allowed categories, delete all others + excess from allowed
                            const productsToKeep = allowedCategoryProducts.slice(0, targetRemaining);
                            const productsToDelete = [
                                ...allowedCategoryProducts.slice(targetRemaining),
                                ...otherCategoryProducts,
                            ];
                            if (productsToDelete.length > 0) {
                                const idsToDelete = productsToDelete.map((p) => p._id);
                                yield productsModel_1.ProductModel.deleteMany({ _id: { $in: idsToDelete } });
                                console.log(`🗑️ Final deletion for ${vendor.storeName}: Kept ${targetRemaining} products from Starter categories, deleted ${productsToDelete.length} others.`);
                            }
                        }
                        else {
                            // Not enough from allowed categories, keep all allowed + some from others to reach 5
                            const keepFromOthers = targetRemaining - allowedCategoryProducts.length;
                            const productsToKeep = [
                                ...allowedCategoryProducts,
                                ...otherCategoryProducts.slice(0, keepFromOthers),
                            ];
                            const productsToDelete = otherCategoryProducts.slice(keepFromOthers);
                            if (productsToDelete.length > 0) {
                                const idsToDelete = productsToDelete.map((p) => p._id);
                                yield productsModel_1.ProductModel.deleteMany({ _id: { $in: idsToDelete } });
                                console.log(`🗑️ Final deletion for ${vendor.storeName}: Kept ${allowedCategoryProducts.length} from Starter categories + ${keepFromOthers} others to reach ${targetRemaining} total.`);
                            }
                        }
                    }
                    else {
                        // Other stages: delete 25% of original count, prioritizing non-allowed categories
                        let maxToDeletePerStage = Math.ceil(originalCount * 0.25);
                        // First delete from non-allowed categories
                        let productsToDelete = [];
                        if (otherCategoryProducts.length > 0) {
                            const deleteFromOthers = Math.min(maxToDeletePerStage, otherCategoryProducts.length);
                            productsToDelete = [
                                ...otherCategoryProducts.slice(0, deleteFromOthers),
                            ];
                            maxToDeletePerStage -= deleteFromOthers;
                        }
                        // If still need to delete more, take from allowed categories (but leave at least 5 total)
                        const totalAfterDelete = allRemainingProducts.length - productsToDelete.length;
                        if (maxToDeletePerStage > 0 && totalAfterDelete > 5) {
                            const canDeleteFromAllowed = Math.min(maxToDeletePerStage, totalAfterDelete - 5);
                            if (canDeleteFromAllowed > 0) {
                                productsToDelete = [
                                    ...productsToDelete,
                                    ...allowedCategoryProducts.slice(0, canDeleteFromAllowed),
                                ];
                            }
                        }
                        if (productsToDelete.length > 0) {
                            const idsToDelete = productsToDelete.map((p) => p._id);
                            yield productsModel_1.ProductModel.deleteMany({ _id: { $in: idsToDelete } });
                            console.log(`🗑️ Deleted ${productsToDelete.length} products (stage ${stage}) for vendor: ${vendor.storeName}. ${allRemainingProducts.length - productsToDelete.length} products remaining.`);
                        }
                    }
                }
                vendor.subscription.deletionStage = targetStage;
                yield vendor.save();
                console.log(`📈 Vendor ${vendor.storeName} deletion stage updated to ${targetStage}/${4}`);
                if (targetStage === 4) {
                    const remainingCount = yield productsModel_1.ProductModel.countDocuments({
                        poster: vendor._id,
                    });
                    const allowedCategoryCount = yield productsModel_1.ProductModel.countDocuments({
                        poster: vendor._id,
                        category: { $in: allowedCategories },
                    });
                    console.log(`💀 Final deletion completed for ${vendor.storeName}. ${remainingCount} products remaining (${allowedCategoryCount} from Starter categories).`);
                }
            }
        }
        console.log("✅ Staged product deletion completed.");
    }
    catch (error) {
        console.error("❌ Error deleting suspended products:", error.message);
    }
});
exports.deleteSuspendedProducts = deleteSuspendedProducts;
/**
 * NEW: ✅ Pay out vendors 2 BUSINESS days after an order is marked "Delivered",
 * as long as it hasn't moved into any return-related status in the meantime.
 *
 * - Only touches orders with status "Delivered" — the moment a return is
 *   requested, submitOrderReturn flips status to "Return Requested"/"Returned",
 *   so this query naturally skips it. No separate return check needed.
 * - Groups the order's items by vendor (product.poster) and pays each vendor
 *   the sum of their items' `total` via Paystack transfer, using the
 *   recipient code they set up on their vendor profile.
 * - Marks order.vendorPaid = true once payout succeeds, so it's never paid twice.
 * - Emails the vendor a payout confirmation using the same EJS template style
 *   as your other transactional mails.
 */
const processVendorPayouts = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        // Delivered orders not yet paid out
        const deliveredOrders = yield orderModel_1.OrderModel.find({
            status: "Delivered",
            vendorPaid: false,
            deliveryDate: { $exists: true },
        }).populate({ path: "items.product", model: "products" });
        const payoutTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "vendor_payout.ejs");
        for (const order of deliveredOrders) {
            const eligibleDate = addBusinessDays(order.deliveryDate, 2);
            if (now < eligibleDate) {
                continue; // Not yet 2 business days since delivery
            }
            // Group this order's items by vendor
            const vendorAmounts = {};
            for (const item of order.items) {
                const product = item.product;
                if (!product || !product.poster)
                    continue;
                const posterId = product.poster.toString();
                if (!vendorAmounts[posterId]) {
                    const vendor = yield vendorModel_1.vendorModel.findById(posterId);
                    if (!vendor)
                        continue;
                    vendorAmounts[posterId] = { vendor, amount: 0 };
                }
                vendorAmounts[posterId].amount += item.total;
            }
            let allPayoutsSucceeded = true;
            for (const [vendorId, { vendor, amount }] of Object.entries(vendorAmounts)) {
                if (amount <= 0)
                    continue;
                if (!vendor.recipientCode) {
                    // Vendor hasn't set up payout details — skip and flag, don't block others
                    console.error(`⚠️ Vendor ${vendor.storeName} has no recipientCode set. Skipping payout for order ${order._id}.`);
                    allPayoutsSucceeded = false;
                    yield notificationsModel_1.default.create({
                        recipient: vendor._id,
                        type: "Transaction",
                        title: "Payout On Hold",
                        message: `Your payout of ₦${amount.toLocaleString()} for order ${order._id} is on hold because your payout account details are not set up. Please update your account details.`,
                        isRead: false,
                        metadata: { orderId: order._id },
                    });
                    continue;
                }
                try {
                    const payoutReference = `payout_${order._id}_${(0, uuid_1.v4)()}`;
                    yield orderController_1.paystack.post("/transfer", {
                        source: "balance",
                        amount: Math.round(amount * 100), // kobo
                        recipient: vendor.recipientCode,
                        reason: `Payout for order ${order._id}`,
                        reference: payoutReference,
                    });
                    // In-app notification
                    yield notificationsModel_1.default.create({
                        recipient: vendor._id,
                        type: "Transaction",
                        title: "Payout Sent",
                        message: `You've been paid ₦${amount.toLocaleString()} for order ${order._id}.`,
                        isRead: false,
                        metadata: {
                            orderId: order._id,
                            amount,
                            reference: payoutReference,
                        },
                    });
                    // Email confirmation
                    const mailVariables = {
                        vendorName: vendor.storeName,
                        orderId: order._id.toString(),
                        amount: `₦${amount.toLocaleString()}`,
                        payoutDate: now.toLocaleDateString(),
                        transactionReference: payoutReference,
                        dashboardLink: "https://mbaay.com/vendor/dashboard",
                        accountSettingsLink: "https://mbaay.com/vendor/settings",
                        supportEmail: "mbaay.com@gmail.com",
                        supportLink: "https://mbaay.com/support",
                        privacyLink: "https://mbaay.com/privacy",
                    };
                    const mailTemplate = yield ejs_1.default.renderFile(payoutTemplatePath, mailVariables);
                    yield (0, email_1.sendMail)(vendor.email, "Your Mbaay Payout Has Been Processed", mailTemplate);
                    console.log(`💸 Paid out ₦${amount} to ${vendor.storeName} for order ${order._id}`);
                }
                catch (transferError) {
                    allPayoutsSucceeded = false;
                    console.error(`❌ Payout failed for vendor ${vendor.storeName} on order ${order._id}:`, transferError.message);
                    const admin = yield adminModel_1.adminModel.findOne();
                    if (admin) {
                        yield notificationsModel_1.default.create({
                            recipient: admin._id,
                            type: "System",
                            title: "Vendor Payout Failed",
                            message: `Payout of ₦${amount.toLocaleString()} to vendor ${vendor.storeName} for order ${order._id} failed: ${transferError.message}`,
                            isRead: false,
                            metadata: {
                                orderId: order._id,
                                vendorId,
                                error: transferError.message,
                            },
                        });
                    }
                }
            }
            // Only mark as paid if every vendor on this order was actually paid —
            // otherwise leave vendorPaid: false so the next run retries the
            // outstanding vendor(s) without re-paying the ones that succeeded.
            // NOTE: if you want to avoid double-paying already-successful vendors
            // on retry, track paid vendor IDs on the order (see note below).
            if (allPayoutsSucceeded) {
                order.vendorPaid = true;
                yield order.save();
            }
        }
        console.log("✅ Vendor payout run completed.");
    }
    catch (error) {
        console.error("❌ Error processing vendor payouts:", error.message);
    }
});
exports.processVendorPayouts = processVendorPayouts;
/**
 * ✅ Cron Schedules
 */
node_cron_1.default.schedule("* * * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🔄 Running auction lifecycle cron...");
    yield handleAuctions();
}));
node_cron_1.default.schedule("* * * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("📩 Running vendor approval/rejection mail cron...");
    yield sendMailAndRemoveVendors();
}));
node_cron_1.default.schedule("0 0 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🕒 Running inactive customer cron...");
    yield markInactiveCustomers();
}));
node_cron_1.default.schedule("0 0 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🕒 Running expiring auction...");
    yield handleExpiringAuctions();
}));
node_cron_1.default.schedule("0 0,6,12,18 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("📧 Running expiry reminders...");
    yield sendExpiryReminders();
}));
node_cron_1.default.schedule("0 0 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("📧 Running suspended reminders...");
    yield sendSuspendedReminders();
}));
node_cron_1.default.schedule("0 0 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🗑️ Running suspended product deletion...");
    yield deleteSuspendedProducts();
}));
// NEW: run a few times a day so payouts go out promptly once eligible,
// without hammering Paystack every minute
node_cron_1.default.schedule("0 9,15 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("💸 Running vendor payout cron...");
    yield processVendorPayouts();
}));
