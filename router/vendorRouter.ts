import { Router } from "express";
import {
  create_vendor,
  find_one_vendor,
  uploadReturnPolicy,
  login_vendor,
  upgradeSubscription,
  get_all_vendors,
  upload_avatar,
  upload_businessLogo,
  updateVendorSettings,
  getCraftCategories,
  create_recipient_code,
  forgetPassword,
  verifyOtpAndResetPassword,
  getVendorCustomers,
  getVendorPayments,
  getVendorStats,
  uploadKYC,
  googleVerify,
  googleCompleteSignup,
  verifySubscriptionPayment,
  changePassword,
  changeLocation,
  changeEmailAddress,
  changeStoreDetails,
  verifyEmailChange,
  uploadBusinessVideo,
  uploadWorkTools,
  refreshTokenVendor,
} from "../controller/vendorController";
import { authenticate } from "../middlewares/jwt_authenticate";
import {
  avatarUpload,
  businessLogoUpload,
  kycUpload,
  businessVideoUpload,
  workToolsUpload,
  returnPolicyupload,
} from "../config/multer";
import {
  getVendorPendingShippingOrders,
  setOrderItemShippingFee,
  updateProductShippingFee,
} from "../controller/orderController";

const vendorRouter = Router();

vendorRouter.post("/create_vendor", create_vendor);
vendorRouter.post("/login_vendor", login_vendor);
vendorRouter.post("/forgotpassword", forgetPassword);
vendorRouter.post("/resetpassword", verifyOtpAndResetPassword);
vendorRouter.get("/find_one_vendor", authenticate, find_one_vendor);
vendorRouter.post(
  "/upload_return_policy",
  authenticate,
  returnPolicyupload,
  uploadReturnPolicy,
);
vendorRouter.patch("/upgrade_plan", authenticate, upgradeSubscription);
vendorRouter.patch("/verify_subscription_payment", verifySubscriptionPayment);
vendorRouter.get("/get_all_vendors", get_all_vendors);
vendorRouter.patch("/upload_avatar", authenticate, avatarUpload, upload_avatar);
vendorRouter.patch(
  "/upload_businesslogo",
  authenticate,
  businessLogoUpload,
  upload_businessLogo,
);

vendorRouter.get("/user_craft_categories", authenticate, getCraftCategories);
vendorRouter.patch("/update_vendor_info", authenticate, updateVendorSettings);
vendorRouter.post(
  "/create_recipient_code",
  authenticate,
  create_recipient_code,
);

vendorRouter.get("/allcustomers", authenticate, getVendorCustomers);
vendorRouter.get("/allpayments", authenticate, getVendorPayments);
vendorRouter.get("/vendorstats", authenticate, getVendorStats);
vendorRouter.get(
  "/vendor-orders/pending-shipping",
  authenticate,
  getVendorPendingShippingOrders,
);
vendorRouter.post("/upload_kyc", authenticate, kycUpload, uploadKYC);
vendorRouter.post("/google-verify", googleVerify);
vendorRouter.post("/google-complete", googleCompleteSignup);

// Vendor settings routes
vendorRouter.patch("/change_password", authenticate, changePassword);
vendorRouter.patch("/change_location", authenticate, changeLocation);
vendorRouter.patch("/change_email", authenticate, changeEmailAddress);
vendorRouter.patch("/verify_email", authenticate, verifyEmailChange);
vendorRouter.patch("/update_store_details", authenticate, changeStoreDetails);
vendorRouter.patch(
  "/order/:productId/update-shipping",
  authenticate,
  updateProductShippingFee,
);
vendorRouter.patch(
  "/orders/:orderId/items/:productId/agree-shipping",
  authenticate,
  setOrderItemShippingFee,
);

// Business profile routes
vendorRouter.patch(
  "/upload_business_video",
  authenticate,
  businessVideoUpload,
  uploadBusinessVideo,
);
vendorRouter.patch(
  "/upload_work_tools",
  authenticate,
  workToolsUpload,
  uploadWorkTools,
);

// Refresh token route
vendorRouter.post("/refresh_token", refreshTokenVendor);

export default vendorRouter;
