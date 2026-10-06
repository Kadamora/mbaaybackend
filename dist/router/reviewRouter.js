"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwt_authenticate_1 = require("../middlewares/jwt_authenticate");
const reviewController_1 = require("../controller/reviewController");
const reviewRouter = (0, express_1.Router)();
// User routes for reviews
reviewRouter.post("/create/:userId", reviewController_1.addReview);
reviewRouter.get("/product/:productId", reviewController_1.getProductReviews);
reviewRouter.patch("/reply/:reviewId", reviewController_1.vendorReplyToReview);
reviewRouter.patch("/report/:reviewId", reviewController_1.reportReview);
reviewRouter.patch("/:reviewId/helpful", reviewController_1.markReviewHelpful);
reviewRouter.post("/private-message", jwt_authenticate_1.authenticate, reviewController_1.sendPrivateMessage);
reviewRouter.get("/messages/:reviewId", jwt_authenticate_1.authenticate, reviewController_1.getReviewMessages);
// reviewRouter.patch("/visibility/:reviewId", updateReviewVisibility);
// Vendor routes
reviewRouter.get("/vendor", jwt_authenticate_1.authenticate, reviewController_1.getVendorReviews);
// Admin routes (uncomment if needed)
// reviewRouter.get("/all", authenticate, getAllReviews);
exports.default = reviewRouter;
