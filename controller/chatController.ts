import { uploadToCloudinary } from "../config/cloudinary";
import { adminModel } from "../model/adminModel";
import Chat from "../model/chatModel";
import messageModel from "../model/messageModel";
import { userModel } from "../model/userModel";
import { vendorModel } from "../model/vendorModel";
import Notification, { INotification } from "../model/notificationsModel";

const createNotification = async ({
  recipient,
  sender,
  type,
  title,
  message,
  metadata,
}: Partial<INotification>) => {
  try {
    const notif = await Notification.create({
      recipient,
      sender,
      type,
      title,
      message,
      metadata,
    });
    return notif;
  } catch (err) {
    console.error("❌ Failed to create notification:", err);
  }
};

export const startChat = async (req: any, res: any) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user._id || req.user.userId;

    const senderIsUser = await userModel.findById(senderId);
    const receiverIsUser = await userModel.findById(receiverId);

    const senderModel = senderIsUser ? "users" : "vendors";
    const receiverModel = receiverIsUser ? "users" : "vendors";

    let chat = await Chat.findOne({
      "participants.participantId": { $all: [senderId, receiverId] },
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [
          { participantId: senderId, model: senderModel },
          { participantId: receiverId, model: receiverModel },
        ],
      });

      const senderDoc: any =
        senderModel === "users"
          ? await userModel.findById(senderId)
          : await vendorModel.findById(senderId);

      const receiverDoc: any =
        receiverModel === "users"
          ? await userModel.findById(receiverId)
          : await vendorModel.findById(receiverId);

      if (senderDoc && receiverDoc) {
        senderDoc.messages = senderDoc.messages || [];
        receiverDoc.messages = receiverDoc.messages || [];
        senderDoc.messages.push(chat._id);
        receiverDoc.messages.push(chat._id);
        await senderDoc.save();
        await receiverDoc.save();
      }

      // 📌 Create notification for receiver
      await createNotification({
        recipient: receiverId,
        sender: senderId,
        type: "Message",
        title: "New Chat Started",
        message: `You have a new chat with ${
          senderDoc?.name || senderDoc?.storeName
        }`,
        metadata: { chatId: chat._id },
      });

      const io = req.app.get("io");
      io.to(senderId.toString()).emit("chatStarted", chat);
      io.to(receiverId.toString()).emit("chatStarted", chat);
    }

    res.status(200).json({ success: true, chat });
  } catch (err: any) {
    res.status(500).json({
      message: "Error starting chat",
      error: err.message,
    });
  }
};

export const sendMessage = async (req: any, res: any) => {
  try {
    const { chatId } = req.params;
    const { content, replyTo } = req.body;
    const senderId = req.user._id || req.user.userId;

    let senderModel: "users" | "vendors" | "admins" = "vendors";
    if (await userModel.findById(senderId)) {
      senderModel = "users";
    } else if (req.user.role === "admin") {
      senderModel = "admins";
    }

    const message = await messageModel.create({
      chat: chatId,
      sender: senderId,
      senderModel,
      replyTo: replyTo || null,
      content,
    });

    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

    const populatedMessage: any = await messageModel
      .findById(message._id)
      .populate("sender", "name email storeName")
      .populate("replyTo");

    const chat: any = await Chat.findById(chatId);
    if (chat) {
      for (const participant of chat.participants) {
        if (participant.participantId.toString() !== senderId.toString()) {
          await createNotification({
            recipient: participant.participantId,
            sender: senderId,
            type: "Message",
            title: `New Message from ${
              senderModel === "admins"
                ? "Admin"
                : senderModel === "users"
                ? populatedMessage.sender.name
                : populatedMessage.sender.storeName
            }`,
            message: content,
            metadata: { chatId },
          });
        }
      }
    }

    const io = req.app.get("io");
    io.to(chatId).emit("newMessage", populatedMessage);

    res.status(200).json({ success: true, message: populatedMessage });
  } catch (err: any) {
    res.status(500).json({
      message: "Error sending message",
      error: err.message,
    });
  }
};

export const getChatMessages = async (req: any, res: any) => {
  try {
    const { chatId } = req.params;
    const messages = await messageModel
      .find({ chat: chatId })
      .populate({
        path: "sender",
        select: "storeName name email",
      })
      .sort({ createdAt: 1 });

    res.status(200).json({ success: true, messages });
  } catch (err: any) {
    res
      .status(500)
      .json({ message: "Error fetching messages", error: err.message });
  }
};

export const getUserChats = async (req: any, res: any) => {
  try {
    const userId = req.user._id || req.user.userId;

    const chats = await Chat.find({ "participants.participantId": userId })
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    const populatedChats = await Promise.all(
      chats.map(async (chat: any) => {
        const populatedParticipants = await Promise.all(
          chat.participants.map(async (p: any) => {
            let model: any = null;
            if (p.model === "users") model = userModel;
            else if (p.model === "vendors") model = vendorModel;
            else if (p.model === "Admin") model = adminModel;

            const user = model ? await model.findById(p.participantId) : null;

            return {
              ...p.toObject(),
              details: user,
            };
          })
        );

        return {
          ...chat.toObject(),
          participants: populatedParticipants,
        };
      })
    );

    res.status(200).json({ success: true, chats: populatedChats });
  } catch (err: any) {
    res
      .status(500)
      .json({ message: "Error fetching chats", error: err.message });
  }
};

export const editMessage = async (req: any, res: any) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;

    const updatedMessage = await messageModel.findByIdAndUpdate(
      messageId,
      { content: text },
      { new: true }
    );

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
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

export const deleteMessage = async (req: any, res: any) => {
  try {
    const { messageId } = req.params;

    const deletedMessage = await messageModel.findByIdAndDelete(messageId);

    if (!deletedMessage) {
      return res.status(404).json({ message: "Message not found" });
    }

    const io = req.app.get("io");
    io.to(deletedMessage.chat.toString()).emit("messageDeleted", messageId);

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

export const sendMediaMessage = async (req: any, res: any) => {
  try {
    const { chatId } = req.params;
    const { content, replyTo } = req.body;
    const files = req.files;

    const senderId = req.user._id || req.user.userId;
    const senderModel = (await userModel.findById(senderId))
      ? "users"
      : "vendors";

    const images: string[] = [];
    let video = "";
    let videoThumbnail = "";

    if (files?.images) {
      for (const file of files.images) {
        const imageUrl = await uploadToCloudinary(
          file.buffer,
          "chat/images",
          "image"
        );
        images.push(imageUrl as string);
      }
    }

    if (files?.video) {
      video = (await uploadToCloudinary(
        files.video[0].buffer,
        "chat/videos",
        "video"
      )) as string;
      videoThumbnail = `https://res.cloudinary.com/${
        process.env.CLOUDINARY_CLOUD_NAME
      }/video/upload/so_1/${video.split("/").pop()}.jpg`;
    }

    const message = await messageModel.create({
      chat: chatId,
      sender: senderId,
      senderModel,
      content,
      images,
      video,
      videoThumbnail,
      replyTo,
    });

    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

    const populatedMessage: any = await messageModel
      .findById(message._id)
      .populate("sender", "name email storeName")
      .populate("replyTo");

    const chat: any = await Chat.findById(chatId);
    if (chat) {
      for (const participant of chat.participants) {
        if (participant.participantId.toString() !== senderId.toString()) {
          await createNotification({
            recipient: participant.participantId,
            sender: senderId,
            type: "Message",
            title: video
              ? `New Video Messages from ${
                  senderModel === "users"
                    ? populatedMessage.sender.name
                    : populatedMessage.sender.storeName
                }`
              : images.length > 0
              ? `New Image Messages from ${
                  senderModel === "users"
                    ? populatedMessage.sender.name
                    : populatedMessage.sender.storeName
                }`
              : `New Media Messages from ${
                  senderModel === "users"
                    ? populatedMessage.sender.name
                    : populatedMessage.sender.storeName
                }`,
            message:
              content ||
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
  } catch (err: any) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Failed to send message", error: err.message });
  }
};

export const markChatAsRead = async (req: any, res: any) => {
  try {
    const { chatId, userId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    await messageModel.updateMany(
      { chat: chatId, sender: { $ne: userId }, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Error marking messages as read",
      error: err.message,
    });
  }
};

export const getUnreadMessages = async (req: any, res: any) => {
  try {
    const { userId } = req.params;

    const chats = await Chat.find({ "participants.participantId": userId });

    const results = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await messageModel.countDocuments({
          chat: chat._id,
          sender: { $ne: userId },
          isRead: false,
        });

        return {
          chatId: chat._id,
          unreadCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching unread messages",
      error: err.message,
    });
  }
};

export const migrateMessagesReadStatus = async () => {
  try {
    console.log("🔄 Running message read-status migration...");

    // 1. Set `isRead = false` if missing
    const updatedIsRead = await messageModel.updateMany(
      { isRead: { $exists: false } },
      { $set: { isRead: false } }
    );

    // 2. Set `readBy = []` if missing
    const updatedReadBy = await messageModel.updateMany(
      { readBy: { $exists: false } },
      { $set: { readBy: [] } }
    );

    console.log(
      `✅ Migration completed: ${updatedIsRead.modifiedCount} messages updated with isRead, ${updatedReadBy.modifiedCount} messages updated with readBy`
    );
  } catch (err: any) {
    console.error("❌ Error running message migration:", err.message);
  }
};
