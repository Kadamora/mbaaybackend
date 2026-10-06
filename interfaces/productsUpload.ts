import mongoose from "mongoose";

export interface products {
  name: string;
  description: string;
  verified: boolean;
  price: number;
  inventory: number;
  images: string[];
  category: string;
  sub_category: string;
  sub_category2: string;
  upload_type: "upload" | "link";
  product_video: string;
  poster: mongoose.Types.ObjectId;
  uploadedBy: "admin" | null;
  shippingType: "Free" | "Fixed" | "Negotiable";
  shippingFee: number;
  productType: "sales" | "auction" | "flash sale";
  // Original price for flash sales
  originalPrice?: number;
  // Auction fields
  startingPrice?: number;
  reservePrice?: number;
  auctionDuration?: number;
  auctionEndDate?: Date;
  bids?: {
    bidder: mongoose.Types.ObjectId;
    amount: number;
    createdAt: Date;
  }[];
  highestBid?: {
    bidder: mongoose.Types.ObjectId;
    amount: number;
  };
  auctionStatus?: "Pending" | "Active" | "Ended";
  // Flash sale fields
  flashSalePrice?: number;
  flashSaleStartDate?: Date;
  flashSaleEndDate?: Date;
  flashSaleDiscount?: number;
  flashSaleStatus?: "Pending" | "Active" | "Ended" | "Inactive";
}
