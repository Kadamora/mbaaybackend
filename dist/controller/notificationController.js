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
exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getUserNotifications = void 0;
const adminModel_1 = require("../model/adminModel");
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const userModel_1 = require("../model/userModel");
const vendorModel_1 = require("../model/vendorModel");
const getUserNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { isRead, page = 1, limit = 10 } = req.query;
        const query = { recipient: id };
        if (isRead !== undefined) {
            query.isRead = isRead === "true";
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const notifications = yield notificationsModel_1.default
            .find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
        const populatedNotifications = yield Promise.all(notifications.map((notif) => __awaiter(void 0, void 0, void 0, function* () {
            if (!notif.sender)
                return notif;
            let senderData = null;
            senderData =
                (yield userModel_1.userModel.findById(notif.sender).select("name email")) ||
                    (yield vendorModel_1.vendorModel
                        .findById(notif.sender)
                        .select("storeName email")) ||
                    (yield adminModel_1.adminModel.findById(notif.sender).select("name email role"));
            return Object.assign(Object.assign({}, notif), { sender: senderData });
        })));
        const total = yield notificationsModel_1.default.countDocuments(query);
        return res.status(200).json({
            success: true,
            message: "Notifications retrieved successfully",
            data: {
                notifications: populatedNotifications,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    }
    catch (error) {
        console.error("❌ getUserNotifications error:", error);
        return res.status(500).json({
            success: false,
            message: "Error retrieving notifications",
            error: error.message,
        });
    }
});
exports.getUserNotifications = getUserNotifications;
const markNotificationAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { notificationsId, userId } = req.params;
        const notification = yield notificationsModel_1.default.findOneAndUpdate({ _id: notificationsId, recipient: userId }, { $set: { isRead: true } }, { new: true });
        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }
        return res.status(200).json({
            success: true,
            message: "Notification marked as read",
            data: notification,
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error marking notification as read",
            error: error.message,
        });
    }
});
exports.markNotificationAsRead = markNotificationAsRead;
const markAllNotificationsAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        yield notificationsModel_1.default.updateMany({ recipient: userId, isRead: false }, { $set: { isRead: true } });
        return res.status(200).json({
            success: true,
            message: "All notifications marked as read",
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error marking all notifications as read",
            error: error.message,
        });
    }
});
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
