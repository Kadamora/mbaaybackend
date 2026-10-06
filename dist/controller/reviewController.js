"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVendorReviews = exports.reportReview = exports.markReviewHelpful = exports.getReviewMessages = exports.sendPrivateMessage = exports.vendorReplyToReview = exports.getProductReviews = exports.addReview = void 0;
const reviewModel_1 = require("../model/reviewModel");
const orderModel_1 = require("../model/orderModel");
const vendorModel_1 = require("../model/vendorModel");
const userModel_1 = require("../model/userModel");
const productsModel_1 = require("../model/productsModel");
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const addReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { productId, rating, title, comment, images } = req.body;
        // Validate input
        if (!rating || rating < 1 || rating > 5) {
            return res
                .status(400)
                .json({ message: "Rating must be between 1 and 5" });
        }
        if (!title || !comment) {
            return res
                .status(400)
                .json({ message: "Title and comment are required" });
        }
        // Check if product exists
        const product = yield productsModel_1.ProductModel.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        // Check if user or vendor has purchased this product (for verification)
        const hasPurchased = yield orderModel_1.OrderModel.findOne({
            userId,
            "items.product": productId,
            status: "Delivered",
        });
        // Check if user already reviewed this product
        const existingReview = yield reviewModel_1.ReviewModel.findOne({
            product: productId,
            customer: userId,
        });
        if (existingReview) {
            return res
                .status(400)
                .json({ message: "You have already reviewed this product" });
        }
        // Get reviewer info (can be user or vendor)
        const user = yield userModel_1.userModel.findById(userId);
        const vendor = yield vendorModel_1.vendorModel.findById(userId);
        if (!user && !vendor) {
            return res.status(404).json({ message: "Reviewer not found" });
        }
        const reviewerType = user ? "user" : "vendor";
        const reviewerName = user
            ? user.name
            : vendor
                ? vendor.storeName
                : "Anonymous";
        const review = yield reviewModel_1.ReviewModel.create({
            product: productId,
            customer: userId,
            reviewerType,
            reviewerName,
            rating,
            title,
            comment,
            verified: !!hasPurchased,
            images: images || [],
        });
        // Notify vendor
        const productVendor = yield vendorModel_1.vendorModel.findById(product.poster);
        if (productVendor) {
            yield notificationsModel_1.default.create({
                recipient: productVendor._id,
                sender: userId,
                type: "Review",
                title: "New Product Review",
                message: `Your product "${product.name}" received a new ${rating}-star review.`,
                isRead: false,
                metadata: {
                    reviewId: review._id,
                    productId,
                    rating,
                },
            });
        }
        res.status(201).json({
            message: "Review added successfully",
            review,
        });
    }
    catch (error) {
        console.error("Add Review Error:", error);
        res
            .status(500)
            .json({ message: "Failed to add review", error: error.message });
    }
});
exports.addReview = addReview;
const getProductReviews = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10, sortBy = "createdAt", sortOrder = -1, } = req.query;
        // Check if product exists
        const product = yield productsModel_1.ProductModel.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        const reviews = yield reviewModel_1.ReviewModel.find({
            product: productId,
            status: "active",
        })
            .populate("customer", "name")
            .sort({ [sortBy]: sortOrder })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        const totalReviews = yield reviewModel_1.ReviewModel.countDocuments({
            product: productId,
            status: "active",
        });
        // Calculate review stats
        const stats = yield reviewModel_1.ReviewModel.aggregate([
            { $match: { product: product._id, status: "active" } },
            {
                $group: {
                    _id: null,
                    totalReviews: { $sum: 1 },
                    averageRating: { $avg: "$rating" },
                    ratingDistribution: {
                        $push: "$rating",
                    },
                },
            },
        ]);
        let reviewStats = null;
        if (stats.length > 0) {
            const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            stats[0].ratingDistribution.forEach((rating) => {
                distribution[rating]++;
            });
            reviewStats = {
                totalReviews: stats[0].totalReviews,
                averageRating: Math.round(stats[0].averageRating * 10) / 10,
                ratingDistribution: distribution,
                verifiedReviewsCount: yield reviewModel_1.ReviewModel.countDocuments({
                    product: productId,
                    verified: true,
                    status: "active",
                }),
            };
        }
        res.json({
            reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalReviews,
                pages: Math.ceil(totalReviews / limit),
            },
            stats: reviewStats,
        });
    }
    catch (error) {
        console.error("Get Product Reviews Error:", error);
        res
            .status(500)
            .json({ message: "Failed to fetch reviews", error: error.message });
    }
});
exports.getProductReviews = getProductReviews;
const vendorReplyToReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { reviewId, message, isPublic } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ message: "Reply message is required" });
        }
        // Find the review
        const review = yield reviewModel_1.ReviewModel.findById(reviewId).populate("product");
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }
        // Check if vendor owns the product
        const product = review.product;
        if (product.poster.toString() !== vendorId.toString()) {
            return res
                .status(403)
                .json({ message: "You can only reply to reviews of your products" });
        }
        // Update review with vendor reply
        review.vendorReply = {
            message: message.trim(),
            repliedAt: new Date(),
            repliedBy: vendorId,
            isPublic: isPublic !== false, // default to true
        };
        yield review.save();
        // If public reply, notify the customer
        if (isPublic) {
            yield notificationsModel_1.default.create({
                recipient: review.customer,
                sender: vendorId,
                type: "Review",
                title: "Vendor Reply to Your Review",
                message: `The vendor replied to your review for "${product.name}"`,
                isRead: false,
                metadata: {
                    reviewId: review._id,
                    productId: product._id,
                    replyType: "public",
                },
            });
        }
        res.json({
            message: `Reply ${isPublic ? "posted publicly" : "sent privately"} successfully`,
            review: review,
        });
    }
    catch (error) {
        console.error("Vendor Reply Error:", error);
        res
            .status(500)
            .json({ message: "Failed to reply to review", error: error.message });
    }
});
exports.vendorReplyToReview = vendorReplyToReview;
const sendPrivateMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const senderId = req.user._id;
        const { reviewId, message, messageType } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ message: "Message is required" });
        }
        if (!["vendor_to_customer", "customer_to_vendor"].includes(messageType)) {
            return res.status(400).json({ message: "Invalid message type" });
        }
        // Find the review
        const review = yield reviewModel_1.ReviewModel.findById(reviewId).populate("product");
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }
        // Validate permissions based on message type
        const product = review.product;
        if (messageType === "vendor_to_customer") {
            // Check if sender is the vendor
            if (product.poster.toString() !== senderId.toString()) {
                return res
                    .status(403)
                    .json({ message: "Only the vendor can send this type of message" });
            }
        }
        else if (messageType === "customer_to_vendor") {
            // Check if sender is the customer
            if (review.customer.toString() !== senderId.toString()) {
                return res
                    .status(403)
                    .json({ message: "Only the customer can send this type of message" });
            }
        }
        // Add message to the review's private messages
        if (!review.vendorPrivateMessages) {
            review.vendorPrivateMessages = [];
        }
        review.vendorPrivateMessages.push({
            message: message.trim(),
            sentAt: new Date(),
            sentBy: senderId,
            messageType,
        });
        yield review.save();
        res.json({
            message: "Private message sent successfully",
            review: review,
        });
    }
    catch (error) {
        console.error("Private Message Error:", error);
        res
            .status(500)
            .json({ message: "Failed to send message", error: error.message });
    }
});
exports.sendPrivateMessage = sendPrivateMessage;
const getReviewMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id;
        const { reviewId } = req.params;
        const review = yield reviewModel_1.ReviewModel.findById(reviewId);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }
        // Check if user is authorized to view messages (reviewer or vendor)
        const isReviewer = review.customer.toString() === userId.toString();
        const product = yield productsModel_1.ProductModel.findById(review.product);
        const isVendor = product && product.poster.toString() === userId.toString();
        if (!isReviewer && !isVendor) {
            return res
                .status(403)
                .json({ message: "Not authorized to view these messages" });
        }
        res.json({
            messages: review.vendorPrivateMessages || [],
            review: {
                _id: review._id,
                product: review.product,
                customer: review.customer,
                title: review.title,
            },
        });
    }
    catch (error) {
        console.error("Get Review Messages Error:", error);
        res
            .status(500)
            .json({ message: "Failed to fetch messages", error: error.message });
    }
});
exports.getReviewMessages = getReviewMessages;
const markReviewHelpful = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { reviewId } = req.params;
        const review = yield reviewModel_1.ReviewModel.findById(reviewId);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }
        review.helpful += 1;
        yield review.save();
        res.json({ message: "Review marked as helpful", helpful: review.helpful });
    }
    catch (error) {
        console.error("Mark Helpful Error:", error);
        res.status(500).json({
            message: "Failed to mark review as helpful",
            error: error.message,
        });
    }
});
exports.markReviewHelpful = markReviewHelpful;
const reportReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { reviewId, reason } = req.body;
        const review = yield reviewModel_1.ReviewModel.findById(reviewId);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }
        review.status = "reported";
        yield review.save();
        res.json({ message: "Review reported successfully" });
    }
    catch (error) {
        console.error("Report Review Error:", error);
        res
            .status(500)
            .json({ message: "Failed to report review", error: error.message });
    }
});
exports.reportReview = reportReview;
const getVendorReviews = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { page = 1, limit = 20, status = "active", sortBy = "createdAt", sortOrder = -1, } = req.query;
        // Find all products posted by this vendor
        const vendorProducts = yield productsModel_1.ProductModel.find({ poster: vendorId }).select("_id");
        const productIds = vendorProducts.map((p) => p._id);
        // Get reviews for vendor's products
        const reviews = yield reviewModel_1.ReviewModel.find({
            product: { $in: productIds },
            status: status,
        })
            .populate("product", "name images")
            .populate("customer", "name email")
            .sort({ [sortBy]: sortOrder })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        const totalReviews = yield reviewModel_1.ReviewModel.countDocuments({
            product: { $in: productIds },
            status: status,
        });
        // Calculate stats
        const stats = yield reviewModel_1.ReviewModel.aggregate([
            { $match: { product: { $in: productIds }, status: status } },
            {
                $group: {
                    _id: null,
                    totalReviews: { $sum: 1 },
                    averageRating: { $avg: "$rating" },
                    ratingDistribution: { $push: "$rating" },
                },
            },
        ]);
        let reviewStats = null;
        if (stats.length > 0) {
            const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            stats[0].ratingDistribution.forEach((rating) => {
                distribution[rating]++;
            });
            reviewStats = {
                totalReviews: stats[0].totalReviews,
                averageRating: Math.round(stats[0].averageRating * 10) / 10,
                ratingDistribution: distribution,
            };
        }
        res.json({
            reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalReviews,
                pages: Math.ceil(totalReviews / limit),
            },
            stats: reviewStats,
        });
    }
    catch (error) {
        console.error("Get Vendor Reviews Error:", error);
        res.status(500).json({
            message: "Failed to fetch vendor reviews",
            error: error.message,
        });
    }
});
exports.getVendorReviews = getVendorReviews;
