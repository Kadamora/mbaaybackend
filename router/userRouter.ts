import { Router } from "express";
import {
  allUsers,
  create_user,
  findOneUser,
  forgetPassword,
  getUserOrders,
  googleAuthUser,
  loginUser,
  resentOtp,
  verifyOtp,
  verifyOtpAndResetPassword,
} from "../controller/userController";
import { authenticate } from "../middlewares/jwt_authenticate";
import { getMyPendingShippingOrders } from "../controller/orderController";

const userRouter = Router();

userRouter.post("/create_user", create_user);
userRouter.post("/verify-otp/:id", verifyOtp);
userRouter.post("/resend-otp/:userId", resentOtp);
userRouter.post("/login-user", loginUser);
userRouter.get("/get-one-user", authenticate, findOneUser);
userRouter.get("/get_orders_user", authenticate, getUserOrders);
userRouter.get(
  "/orders/pending-shipping",
  authenticate,
  getMyPendingShippingOrders,
);
userRouter.get("/alll_users", allUsers);
userRouter.post("/auth/google/user", googleAuthUser);
userRouter.post("/forgotpassword_user", forgetPassword);
userRouter.post("/resetpassword_user", verifyOtpAndResetPassword);
export default userRouter;
