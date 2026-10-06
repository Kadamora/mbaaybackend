import { Router } from "express";
import { authenticate } from "../middlewares/jwt_authenticate";
import {
  addReview,
  getProductReviews,
  vendorReplyToReview,
  sendPrivateMessage,
  getReviewMessages,
  markReviewHelpful,
  reportReview,
  getVendorReviews,
} from "../controller/reviewController";

const reviewRouter = Router();

// User routes for reviews
reviewRouter.post("/create/:userId", addReview);
reviewRouter.get("/product/:productId", getProductReviews);
reviewRouter.patch("/reply/:reviewId", vendorReplyToReview);
reviewRouter.patch("/report/:reviewId", reportReview);
reviewRouter.patch("/:reviewId/helpful", markReviewHelpful);
reviewRouter.post("/private-message", authenticate, sendPrivateMessage);
reviewRouter.get("/messages/:reviewId", authenticate, getReviewMessages);
// reviewRouter.patch("/visibility/:reviewId", updateReviewVisibility);

// Vendor routes
reviewRouter.get("/vendor", authenticate, getVendorReviews);

// Admin routes (uncomment if needed)
// reviewRouter.get("/all", authenticate, getAllReviews);

export default reviewRouter;
