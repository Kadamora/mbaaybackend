import mongoose from "mongoose";
import { adminModel } from "../model/adminModel";
import notificationsModel from "../model/notificationsModel";
import { userModel } from "../model/userModel";
import { vendorModel } from "../model/vendorModel";

export const getUserNotifications = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { isRead, page = 1, limit = 10 } = req.query;

    const query: any = { recipient: id };
    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const notifications = await notificationsModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string))
      .lean();

    const populatedNotifications = await Promise.all(
      notifications.map(async (notif: any) => {
        if (!notif.sender) return notif;

        let senderData = null;

        senderData =
          (await userModel.findById(notif.sender).select("name email")) ||
          (await vendorModel
            .findById(notif.sender)
            .select("storeName email")) ||
          (await adminModel.findById(notif.sender).select("name email role"));

        return {
          ...notif,
          sender: senderData,
        };
      })
    );

    const total = await notificationsModel.countDocuments(query);

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      data: {
        notifications: populatedNotifications,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error: any) {
    console.error("❌ getUserNotifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving notifications",
      error: error.message,
    });
  }
};

export const markNotificationAsRead = async (req: any, res: any) => {
  try {
    const { notificationsId, userId } = req.params;

    const notification = await notificationsModel.findOneAndUpdate(
      { _id: notificationsId, recipient: userId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error marking notification as read",
      error: error.message,
    });
  }
};

export const markAllNotificationsAsRead = async (req: any, res: any) => {
  try {
    const { userId } = req.params;

    await notificationsModel.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error marking all notifications as read",
      error: error.message,
    });
  }
};
