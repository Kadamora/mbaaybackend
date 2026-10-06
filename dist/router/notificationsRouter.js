"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notificationController_1 = require("../controller/notificationController");
const notificationRouter = (0, express_1.Router)();
notificationRouter.get("/allnotifications/:id", notificationController_1.getUserNotifications);
notificationRouter.patch("/notifications/read-all/:userId", notificationController_1.markAllNotificationsAsRead);
notificationRouter.patch("/notifications/:notificationsId/:userId", notificationController_1.markNotificationAsRead);
exports.default = notificationRouter;
