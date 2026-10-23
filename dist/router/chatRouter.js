"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_1 = require("../controller/chatController");
const jwt_authenticate_1 = require("../middlewares/jwt_authenticate");
const multer_1 = require("../config/multer");
const chatRouter = express_1.default.Router();
chatRouter.post("/create_or_get_chat", jwt_authenticate_1.authenticate, chatController_1.startChat);
chatRouter.post("/chat/:chatId/message", jwt_authenticate_1.authenticate, chatController_1.sendMessage);
chatRouter.post("/chat/:chatId/send_media_message", multer_1.upload.fields([
    { name: "images", maxCount: 5 },
    { name: "video", maxCount: 1 },
]), jwt_authenticate_1.authenticate, chatController_1.sendMediaMessage);
chatRouter.get("/chats", jwt_authenticate_1.authenticate, chatController_1.getUserChats);
chatRouter.get("/chat/:chatId/messages", chatController_1.getChatMessages);
chatRouter.patch("/edit/:messageId", chatController_1.editMessage);
chatRouter.delete("/delete/:messageId", chatController_1.deleteMessage);
chatRouter.patch("/mark_chat_as_read/:chatId/:userId", chatController_1.markChatAsRead);
chatRouter.get("/get_unread_chat_count/:userId", chatController_1.getUnreadMessages);
exports.default = chatRouter;
