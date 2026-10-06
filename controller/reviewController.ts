import { Request, Response } from "express";
import { ReviewModel } from "../model/reviewModel";
import { OrderModel } from "../model/orderModel";
import { vendorModel } from "../model/vendorModel";
import { userModel } from "../model/userModel";
import { ProductModel } from "../model/productsModel";
import NotificationModel from "../model/notificationsModel";

export const addReview = async (req: any, res: any) => {
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
    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if user or vendor has purchased this product (for verification)
    const hasPurchased = await OrderModel.findOne({
      userId,
      "items.product": productId,
      status: "Delivered",
    });

    // Check if user already reviewed this product
    const existingReview = await ReviewModel.findOne({
      product: productId,
      customer: userId,
    });

    if (existingReview) {
      return res
        .status(400)
        .json({ message: "You have already reviewed this product" });
    }

    // Get reviewer info (can be user or vendor)
    const user = await userModel.findById(userId);
    const vendor = await vendorModel.findById(userId);

    if (!user && !vendor) {
      return res.status(404).json({ message: "Reviewer not found" });
    }

    const reviewerType = user ? "user" : "vendor";
    const reviewerName = user
      ? user.name
      : vendor
      ? vendor.storeName
      : "Anonymous";

    const review = await ReviewModel.create({
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
    const productVendor = await vendorModel.findById(product.poster);
    if (productVendor) {
      await NotificationModel.create({
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
  } catch (error: any) {
    console.error("Add Review Error:", error);
    res
      .status(500)
      .json({ message: "Failed to add review", error: error.message });
  }
};

export const getProductReviews = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = -1,
    } = req.query;

    // Check if product exists
    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const reviews = await ReviewModel.find({
      product: productId,
      status: "active",
    })
      .populate("customer", "name")
      .sort({ [sortBy]: sortOrder })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalReviews = await ReviewModel.countDocuments({
      product: productId,
      status: "active",
    });

    // Calculate review stats
    const stats = await ReviewModel.aggregate([
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
      stats[0].ratingDistribution.forEach((rating: number) => {
        distribution[rating as keyof typeof distribution]++;
      });

      reviewStats = {
        totalReviews: stats[0].totalReviews,
        averageRating: Math.round(stats[0].averageRating * 10) / 10,
        ratingDistribution: distribution,
        verifiedReviewsCount: await ReviewModel.countDocuments({
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
  } catch (error: any) {
    console.error("Get Product Reviews Error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch reviews", error: error.message });
  }
};

export const vendorReplyToReview = async (req: any, res: any) => {
  try {
    const vendorId = req.user._id;
    const { reviewId, message, isPublic } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Reply message is required" });
    }

    // Find the review
    const review = await ReviewModel.findById(reviewId).populate("product");
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Check if vendor owns the product
    const product = review.product as any;
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

    await review.save();

    // If public reply, notify the customer
    if (isPublic) {
      await NotificationModel.create({
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
      message: `Reply ${
        isPublic ? "posted publicly" : "sent privately"
      } successfully`,
      review: review,
    });
  } catch (error: any) {
    console.error("Vendor Reply Error:", error);
    res
      .status(500)
      .json({ message: "Failed to reply to review", error: error.message });
  }
};

export const sendPrivateMessage = async (req: any, res: any) => {
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
    const review = await ReviewModel.findById(reviewId).populate("product");
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Validate permissions based on message type
    const product = review.product as any;
    if (messageType === "vendor_to_customer") {
      // Check if sender is the vendor
      if (product.poster.toString() !== senderId.toString()) {
        return res
          .status(403)
          .json({ message: "Only the vendor can send this type of message" });
      }
    } else if (messageType === "customer_to_vendor") {
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

    await review.save();

    res.json({
      message: "Private message sent successfully",
      review: review,
    });
  } catch (error: any) {
    console.error("Private Message Error:", error);
    res
      .status(500)
      .json({ message: "Failed to send message", error: error.message });
  }
};

export const getReviewMessages = async (req: any, res: any) => {
  try {
    const userId = req.user._id;
    const { reviewId } = req.params;

    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Check if user is authorized to view messages (reviewer or vendor)
    const isReviewer = review.customer.toString() === userId.toString();
    const product = await ProductModel.findById(review.product);
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
  } catch (error: any) {
    console.error("Get Review Messages Error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch messages", error: error.message });
  }
};

export const markReviewHelpful = async (req: any, res: any) => {
  try {
    const { reviewId } = req.params;

    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.helpful += 1;
    await review.save();

    res.json({ message: "Review marked as helpful", helpful: review.helpful });
  } catch (error: any) {
    console.error("Mark Helpful Error:", error);
    res.status(500).json({
      message: "Failed to mark review as helpful",
      error: error.message,
    });
  }
};

export const reportReview = async (req: any, res: any) => {
  try {
    const { reviewId, reason } = req.body;

    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.status = "reported";
    await review.save();

    res.json({ message: "Review reported successfully" });
  } catch (error: any) {
    console.error("Report Review Error:", error);
    res
      .status(500)
      .json({ message: "Failed to report review", error: error.message });
  }
};

export const getVendorReviews = async (req: any, res: any) => {
  try {
    const vendorId = req.user._id;
    const {
      page = 1,
      limit = 20,
      status = "active",
      sortBy = "createdAt",
      sortOrder = -1,
    } = req.query;

    // Find all products posted by this vendor
    const vendorProducts = await ProductModel.find({ poster: vendorId }).select(
      "_id"
    );
    const productIds = vendorProducts.map((p) => p._id);

    // Get reviews for vendor's products
    const reviews = await ReviewModel.find({
      product: { $in: productIds },
      status: status,
    })
      .populate("product", "name images")
      .populate("customer", "name email")
      .sort({ [sortBy]: sortOrder })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalReviews = await ReviewModel.countDocuments({
      product: { $in: productIds },
      status: status,
    });

    // Calculate stats
    const stats = await ReviewModel.aggregate([
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
      stats[0].ratingDistribution.forEach((rating: number) => {
        distribution[rating as keyof typeof distribution]++;
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
  } catch (error: any) {
    console.error("Get Vendor Reviews Error:", error);
    res.status(500).json({
      message: "Failed to fetch vendor reviews",
      error: error.message,
    });
  }
};
