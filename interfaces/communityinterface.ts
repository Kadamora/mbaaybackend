import mongoose from "mongoose";

export interface community {
  name: string;
  description: string;
  admin: mongoose.Schema.Types.ObjectId; // Vendor who owns the community
  members: mongoose.Schema.Types.ObjectId[]; // Users in the community
  createdAt: Date;
  updatedAt: Date;
  communityPosts: {}[];
  community_Images: string;
}
