import { Router } from "express";
import {
  upload,
  postsImagesUpload,
  adminProfileUpload,
  communityImagesUpload,
} from "../config/multer";

import {
  approveKYC,
  approveOrRejectVendor,
  create_admin,
  find_one_admin,
  getAnAdmin,
  find_one_vendor,
  findOneUser,
  getChatMessages_customerCare,
  getCustomerCareChats,
  getVendorDetails,
  login_admin,
  rejectKYC,
  sendcustomercareMessage,
  startCustomerCareChat,
  viewAllKYCRequests,
  getMbaayCommunity,
  createCommunityPost,
  getAllCommunityPosts,
  editMbaayCommunityInfo,
  getAllOrders,
  blockOrDeleteUser,
  getAllVendors,
  getAllUsers,
  getAllAdmins,
  getCustomersAndPayments,
  getAllReviews,
  sendBroadcastMessage,
  sendPrivateMessage,
  getAdminNotifications,
  getAdminDashboardStats,
  getOneOrderForAdmin,
  getAdminProducts,
  getOneAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  getAdminPaymentsAndInvoices,
  editAdminProfile,
  refreshTokenAdmin,
} from "../controller/adminController";
import { authenticate } from "../middlewares/jwt_authenticate";

const adminRouter = Router();

adminRouter.post("/create_admin", create_admin);
adminRouter.post("/login_admin", login_admin);
adminRouter.post("/refresh_token", refreshTokenAdmin);
adminRouter.get("/get_vendor_details/:vendorId", getVendorDetails);
adminRouter.get("/find_one_admin", authenticate, find_one_admin);
adminRouter.get("/get_admin/:adminId", authenticate, getAnAdmin);
adminRouter.patch(
  "/validate_requests/:vendorId",
  authenticate,
  approveOrRejectVendor,
);

adminRouter.post("/start-customer-care", authenticate, startCustomerCareChat);
adminRouter.post("/send-message", authenticate, sendcustomercareMessage);
adminRouter.get("/customer_care_messages", authenticate, getCustomerCareChats);
adminRouter.get(
  "/customer_care_chatmessages/:chatId",
  getChatMessages_customerCare,
);
adminRouter.get("/view_all_kyc_requests", authenticate, viewAllKYCRequests);
adminRouter.patch("/approve_kyc/:vendorId", authenticate, approveKYC);
adminRouter.patch("/reject_kyc/:vendorId", authenticate, rejectKYC);
adminRouter.get("/one_vendor/:id", find_one_vendor);
adminRouter.get("/one_user/:id", findOneUser);

// New admin routes
adminRouter.get("/community/mbaay", authenticate, getMbaayCommunity);
adminRouter.put(
  "/community/mbaay/edit",
  authenticate,
  communityImagesUpload,
  editMbaayCommunityInfo,
);
adminRouter.post(
  "/community/post",
  authenticate,
  postsImagesUpload,
  createCommunityPost,
);
adminRouter.get("/community/posts/all", authenticate, getAllCommunityPosts);
adminRouter.get("/orders/all", authenticate, getAllOrders);
adminRouter.post("/user/action", authenticate, blockOrDeleteUser);
adminRouter.get("/vendors/all", authenticate, getAllVendors);
adminRouter.get("/users/all", authenticate, getAllUsers);
adminRouter.get("/admins/all", authenticate, getAllAdmins);
adminRouter.get("/customers/payments", authenticate, getCustomersAndPayments);
adminRouter.get("/reviews/all", authenticate, getAllReviews);

// Admin Messaging Routes
adminRouter.post("/broadcast", authenticate, sendBroadcastMessage);
adminRouter.post("/private-message", authenticate, sendPrivateMessage);

// New Admin Endpoints
adminRouter.get("/notifications", authenticate, getAdminNotifications);
adminRouter.get("/dashboard/stats", authenticate, getAdminDashboardStats);
adminRouter.get("/orders/:orderId", authenticate, getOneOrderForAdmin);
adminRouter.get("/products", authenticate, getAdminProducts);
adminRouter.get("/products/:productId", authenticate, getOneAdminProduct);
adminRouter.put("/products/:productId", authenticate, updateAdminProduct);
adminRouter.delete("/products/:productId", authenticate, deleteAdminProduct);
adminRouter.get(
  "/payments/invoices",
  authenticate,
  getAdminPaymentsAndInvoices,
);
adminRouter.put("/profile", authenticate, adminProfileUpload, editAdminProfile);

export default adminRouter;
