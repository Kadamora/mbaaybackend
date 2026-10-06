import { Router } from "express";
import {
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../controller/notificationController";

const notificationRouter = Router();

notificationRouter.get("/allnotifications/:id", getUserNotifications);

notificationRouter.patch(
  "/notifications/read-all/:userId",
  markAllNotificationsAsRead
);

notificationRouter.patch(
  "/notifications/:notificationsId/:userId",
  markNotificationAsRead
);

export default notificationRouter;
