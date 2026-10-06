import express from "express";
import {
  startChat,
  sendMessage,
  getUserChats,
  getChatMessages,
  editMessage,
  deleteMessage,
  sendMediaMessage,
  markChatAsRead,
  getUnreadMessages,
} from "../controller/chatController";
import { authenticate } from "../middlewares/jwt_authenticate";
import { upload } from "../config/multer";

const chatRouter = express.Router();

chatRouter.post("/create_or_get_chat", authenticate, startChat);

chatRouter.post("/chat/:chatId/message", authenticate, sendMessage);

chatRouter.post(
  "/chat/:chatId/send_media_message",
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "video", maxCount: 1 },
  ]),
  authenticate,
  sendMediaMessage
);

chatRouter.get("/chats", authenticate, getUserChats);

chatRouter.get("/chat/:chatId/messages", getChatMessages);

chatRouter.patch("/edit/:messageId", editMessage);

chatRouter.delete("/delete/:messageId", deleteMessage);
chatRouter.patch("/mark_chat_as_read/:chatId/:userId", markChatAsRead);
chatRouter.get("/get_unread_chat_count/:userId", getUnreadMessages);

export default chatRouter;
