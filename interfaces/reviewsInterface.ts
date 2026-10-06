import mongoose from "mongoose";

export interface Review {
  _id?: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  reviewerType: "user" | "vendor";
  reviewerName: string;
  rating: number; // 1-5 stars
  title: string;
  comment: string;
  verified: boolean; // purchased the product
  vendorReply?: {
    message: string;
    repliedAt: Date;
    repliedBy: mongoose.Types.ObjectId; // vendor/user who replied
    isPublic: boolean; // true for public, false for private (chat only)
  };
  vendorPrivateMessages?: {
    message: string;
    sentAt: Date;
    sentBy: mongoose.Types.ObjectId;
    messageType: "vendor_to_customer" | "customer_to_vendor";
  }[];
  createdAt: Date;
  updatedAt: Date;
  status: "active" | "hidden" | "reported";
  helpful: number; // number of people who found this helpful
  images?: string[]; // review images/videos
}

export interface VendorReplyRequest {
  reviewId: string;
  message: string;
  isPublic: boolean;
}

export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  verifiedReviewsCount: number;
}
