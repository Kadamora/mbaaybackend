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
exports.migrateMessagesReadStatus = exports.getUnreadMessages = exports.markChatAsRead = exports.sendMediaMessage = exports.deleteMessage = exports.editMessage = exports.getUserChats = exports.getChatMessages = exports.sendMessage = exports.startChat = void 0;
const cloudinary_1 = require("../config/cloudinary");
const adminModel_1 = require("../model/adminModel");
const chatModel_1 = __importDefault(require("../model/chatModel"));
const messageModel_1 = __importDefault(require("../model/messageModel"));
const userModel_1 = require("../model/userModel");
const vendorModel_1 = require("../model/vendorModel");
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const createNotification = (_a) => __awaiter(void 0, [_a], void 0, function* ({ recipient, sender, type, title, message, metadata, }) {
    try {
        const notif = yield notificationsModel_1.default.create({
            recipient,
            sender,
            type,
            title,
            message,
            metadata,
        });
        return notif;
    }
    catch (err) {
        console.error("❌ Failed to create notification:", err);
    }
});
const startChat = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { receiverId } = req.body;
        const senderId = req.user._id || req.user.userId;
        const senderIsUser = yield userModel_1.userModel.findById(senderId);
        const receiverIsUser = yield userModel_1.userModel.findById(receiverId);
        const senderModel = senderIsUser ? "users" : "vendors";
        const receiverModel = receiverIsUser ? "users" : "vendors";
        let chat = yield chatModel_1.default.findOne({
            "participants.participantId": { $all: [senderId, receiverId] },
        });
        if (!chat) {
            chat = yield chatModel_1.default.create({
                participants: [
                    { participantId: senderId, model: senderModel },
                    { participantId: receiverId, model: receiverModel },
                ],
            });
            const senderDoc = senderModel === "users"
                ? yield userModel_1.userModel.findById(senderId)
                : yield vendorModel_1.vendorModel.findById(senderId);
            const receiverDoc = receiverModel === "users"
                ? yield userModel_1.userModel.findById(receiverId)
                : yield vendorModel_1.vendorModel.findById(receiverId);
            if (senderDoc && receiverDoc) {
                senderDoc.messages = senderDoc.messages || [];
                receiverDoc.messages = receiverDoc.messages || [];
                senderDoc.messages.push(chat._id);
                receiverDoc.messages.push(chat._id);
                yield senderDoc.save();
                yield receiverDoc.save();
            }
            // 📌 Create notification for receiver
            yield createNotification({
                recipient: receiverId,
                sender: senderId,
                type: "Message",
                title: "New Chat Started",
                message: `You have a new chat with ${(senderDoc === null || senderDoc === void 0 ? void 0 : senderDoc.name) || (senderDoc === null || senderDoc === void 0 ? void 0 : senderDoc.storeName)}`,
                metadata: { chatId: chat._id },
            });
            const io = req.app.get("io");
            io.to(senderId.toString()).emit("chatStarted", chat);
            io.to(receiverId.toString()).emit("chatStarted", chat);
        }
        res.status(200).json({ success: true, chat });
    }
    catch (err) {
        res.status(500).json({
            message: "Error starting chat",
            error: err.message,
        });
    }
});
exports.startChat = startChat;
const sendMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { chatId } = req.params;
        const { content, replyTo } = req.body;
        const senderId = req.user._id || req.user.userId;
        let senderModel = "vendors";
        if (yield userModel_1.userModel.findById(senderId)) {
            senderModel = "users";
        }
        else if (req.user.role === "admin") {
            senderModel = "admins";
        }
        const message = yield messageModel_1.default.create({
            chat: chatId,
            sender: senderId,
            senderModel,
            replyTo: replyTo || null,
            content,
        });
        yield chatModel_1.default.findByIdAndUpdate(chatId, { lastMessage: message._id });
        const populatedMessage = yield messageModel_1.default
            .findById(message._id)
            .populate("sender", "name email storeName")
            .populate("replyTo");
        const chat = yield chatModel_1.default.findById(chatId);
        if (chat) {
            for (const participant of chat.participants) {
                if (participant.participantId.toString() !== senderId.toString()) {
                    yield createNotification({
                        recipient: participant.participantId,
                        sender: senderId,
                        type: "Message",
                        title: `New Message from ${senderModel === "admins"
                            ? "Admin"
                            : senderModel === "users"
                                ? populatedMessage.sender.name
                                : populatedMessage.sender.storeName}`,
                        message: content,
                        metadata: { chatId },
                    });
                }
            }
        }
        const io = req.app.get("io");
        io.to(chatId).emit("newMessage", populatedMessage);
        res.status(200).json({ success: true, message: populatedMessage });
    }
    catch (err) {
        res.status(500).json({
            message: "Error sending message",
            error: err.message,
        });
    }
});
exports.sendMessage = sendMessage;
const getChatMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { chatId } = req.params;
        const messages = yield messageModel_1.default
            .find({ chat: chatId })
            .populate({
            path: "sender",
            select: "storeName name email",
        })
            .sort({ createdAt: 1 });
        res.status(200).json({ success: true, messages });
    }
    catch (err) {
        res
            .status(500)
            .json({ message: "Error fetching messages", error: err.message });
    }
});
exports.getChatMessages = getChatMessages;
const getUserChats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id || req.user.userId;
        const chats = yield chatModel_1.default.find({ "participants.participantId": userId })
            .populate("lastMessage")
            .sort({ updatedAt: -1 });
        const populatedChats = yield Promise.all(chats.map((chat) => __awaiter(void 0, void 0, void 0, function* () {
            const populatedParticipants = yield Promise.all(chat.participants.map((p) => __awaiter(void 0, void 0, void 0, function* () {
                let model = null;
                if (p.model === "users")
                    model = userModel_1.userModel;
                else if (p.model === "vendors")
                    model = vendorModel_1.vendorModel;
                else if (p.model === "Admin")
                    model = adminModel_1.adminModel;
                const user = model ? yield model.findById(p.participantId) : null;
                return Object.assign(Object.assign({}, p.toObject()), { details: user });
            })));
            return Object.assign(Object.assign({}, chat.toObject()), { participants: populatedParticipants });
        })));
        res.status(200).json({ success: true, chats: populatedChats });
    }
    catch (err) {
        res
            .status(500)
            .json({ message: "Error fetching chats", error: err.message });
    }
});
exports.getUserChats = getUserChats;
const editMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { messageId } = req.params;
        const { text } = req.body;
        const updatedMessage = yield messageModel_1.default.findByIdAndUpdate(messageId, { content: text }, { new: true });
        if (!updatedMessage) {
            return res.status(404).json({ message: "Message not found" });
        }
        const io = req.app.get("io");
        io.to(updatedMessage.chat.toString()).emit("messageEdited", updatedMessage);
        return res.status(200).json({
            success: true,
            message: "Message updated successfully",
            data: updatedMessage,
        });
    }
    catch (err) {
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
});
exports.editMessage = editMessage;
const deleteMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { messageId } = req.params;
        const deletedMessage = yield messageModel_1.default.findByIdAndDelete(messageId);
        if (!deletedMessage) {
            return res.status(404).json({ message: "Message not found" });
        }
        const io = req.app.get("io");
        io.to(deletedMessage.chat.toString()).emit("messageDeleted", messageId);
        return res.status(200).json({
            success: true,
            message: "Message deleted successfully",
        });
    }
    catch (err) {
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
});
exports.deleteMessage = deleteMessage;
const sendMediaMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { chatId } = req.params;
        const { content, replyTo } = req.body;
        const files = req.files;
        const senderId = req.user._id || req.user.userId;
        const senderModel = (yield userModel_1.userModel.findById(senderId))
            ? "users"
            : "vendors";
        const images = [];
        let video = "";
        let videoThumbnail = "";
        if (files === null || files === void 0 ? void 0 : files.images) {
            for (const file of files.images) {
                const imageUrl = yield (0, cloudinary_1.uploadToCloudinary)(file.buffer, "chat/images", "image");
                images.push(imageUrl);
            }
        }
        if (files === null || files === void 0 ? void 0 : files.video) {
            video = (yield (0, cloudinary_1.uploadToCloudinary)(files.video[0].buffer, "chat/videos", "video"));
            videoThumbnail = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/so_1/${video.split("/").pop()}.jpg`;
        }
        const message = yield messageModel_1.default.create({
            chat: chatId,
            sender: senderId,
            senderModel,
            content,
            images,
            video,
            videoThumbnail,
            replyTo,
        });
        yield chatModel_1.default.findByIdAndUpdate(chatId, { lastMessage: message._id });
        const populatedMessage = yield messageModel_1.default
            .findById(message._id)
            .populate("sender", "name email storeName")
            .populate("replyTo");
        const chat = yield chatModel_1.default.findById(chatId);
        if (chat) {
            for (const participant of chat.participants) {
                if (participant.participantId.toString() !== senderId.toString()) {
                    yield createNotification({
                        recipient: participant.participantId,
                        sender: senderId,
                        type: "Message",
                        title: video
                            ? `New Video Messages from ${senderModel === "users"
                                ? populatedMessage.sender.name
                                : populatedMessage.sender.storeName}`
                            : images.length > 0
                                ? `New Image Messages from ${senderModel === "users"
                                    ? populatedMessage.sender.name
                                    : populatedMessage.sender.storeName}`
                                : `New Media Messages from ${senderModel === "users"
                                    ? populatedMessage.sender.name
                                    : populatedMessage.sender.storeName}`,
                        message: content ||
                            (video
                                ? "📹 You received a video"
                                : `🖼️ You received ${images.length} image(s)`),
                        metadata: { chatId, messageId: message._id },
                    });
                }
            }
        }
        const io = req.app.get("io");
        io.to(chatId).emit("newMessage", populatedMessage);
        res.status(200).json({ success: true, message: populatedMessage });
    }
    catch (err) {
        console.error(err);
        res
            .status(500)
            .json({ message: "Failed to send message", error: err.message });
    }
});
exports.sendMediaMessage = sendMediaMessage;
const markChatAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { chatId, userId } = req.params;
        const chat = yield chatModel_1.default.findById(chatId);
        if (!chat)
            return res.status(404).json({ message: "Chat not found" });
        yield messageModel_1.default.updateMany({ chat: chatId, sender: { $ne: userId }, isRead: false }, { $set: { isRead: true } });
        return res.status(200).json({
            success: true,
            message: "Messages marked as read",
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error marking messages as read",
            error: err.message,
        });
    }
});
exports.markChatAsRead = markChatAsRead;
const getUnreadMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const chats = yield chatModel_1.default.find({ "participants.participantId": userId });
        const results = yield Promise.all(chats.map((chat) => __awaiter(void 0, void 0, void 0, function* () {
            const unreadCount = yield messageModel_1.default.countDocuments({
                chat: chat._id,
                sender: { $ne: userId },
                isRead: false,
            });
            return {
                chatId: chat._id,
                unreadCount,
            };
        })));
        return res.status(200).json({
            success: true,
            data: results,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error fetching unread messages",
            error: err.message,
        });
    }
});
exports.getUnreadMessages = getUnreadMessages;
const migrateMessagesReadStatus = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("🔄 Running message read-status migration...");
        // 1. Set `isRead = false` if missing
        const updatedIsRead = yield messageModel_1.default.updateMany({ isRead: { $exists: false } }, { $set: { isRead: false } });
        // 2. Set `readBy = []` if missing
        const updatedReadBy = yield messageModel_1.default.updateMany({ readBy: { $exists: false } }, { $set: { readBy: [] } });
        console.log(`✅ Migration completed: ${updatedIsRead.modifiedCount} messages updated with isRead, ${updatedReadBy.modifiedCount} messages updated with readBy`);
    }
    catch (err) {
        console.error("❌ Error running message migration:", err.message);
    }
});
exports.migrateMessagesReadStatus = migrateMessagesReadStatus;
