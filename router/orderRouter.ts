import express, { Router } from "express";
import {
  checkout,
  confirmOrderReceived,
  getAdminOrders,
  getOneOrder,
  getVendorOrders,
  handleCancellationOrPostponement,
  paymentCallback,
  // paystackWebhook,
  submitOrderCancellationOrPostponement,
  submitOrderReturn,
} from "../controller/orderController";
import { authenticate } from "../middlewares/jwt_authenticate";

const orderRouter = Router();

function rawBodySaver(req: any, res: any, buf: Buffer) {
  req.rawBody = buf;
}

orderRouter.post("/order_checkout/:sessionId/:userId", checkout);
orderRouter.get("/payment_callback", paymentCallback);
// orderRouter.post(
//   "/paystack/webhook",
//   express.json({ verify: rawBodySaver }),
//   paystackWebhook
// );

orderRouter.get("/vendor_orders", authenticate, getVendorOrders);
orderRouter.get("/admin_orders", getAdminOrders);
orderRouter.get("/get_one_order/:orderId", getOneOrder);
orderRouter.patch("/confirmOrderReceived/:orderId", confirmOrderReceived);

// Order management routes
orderRouter.post("/cancel-or-postpone", submitOrderCancellationOrPostponement);
orderRouter.post("/return", submitOrderReturn);
orderRouter.patch(
  "/handleCancellationOrPostponement",
  handleCancellationOrPostponement
);

export default orderRouter;
