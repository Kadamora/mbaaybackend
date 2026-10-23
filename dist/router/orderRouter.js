"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderController_1 = require("../controller/orderController");
const jwt_authenticate_1 = require("../middlewares/jwt_authenticate");
const orderRouter = (0, express_1.Router)();
function rawBodySaver(req, res, buf) {
    req.rawBody = buf;
}
orderRouter.post("/order_checkout/:sessionId/:userId", orderController_1.checkout);
orderRouter.get("/payment_callback", orderController_1.paymentCallback);
// orderRouter.post(
//   "/paystack/webhook",
//   express.json({ verify: rawBodySaver }),
//   paystackWebhook
// );
orderRouter.get("/vendor_orders", jwt_authenticate_1.authenticate, orderController_1.getVendorOrders);
orderRouter.get("/admin_orders", orderController_1.getAdminOrders);
orderRouter.get("/get_one_order/:orderId", orderController_1.getOneOrder);
orderRouter.patch("/confirmOrderReceived/:orderId", orderController_1.confirmOrderReceived);
// Order management routes
orderRouter.post("/cancel-or-postpone", orderController_1.submitOrderCancellationOrPostponement);
orderRouter.post("/return", orderController_1.submitOrderReturn);
orderRouter.patch("/handleCancellationOrPostponement", orderController_1.handleCancellationOrPostponement);
exports.default = orderRouter;
