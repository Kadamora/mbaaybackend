import { Schema, Document, model } from "mongoose";
import { community } from "../interfaces/communityinterface";

interface icommunity extends community, Document {}

const VendorCommunitySchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    admin: { type: Schema.Types.ObjectId, ref: "vendors", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "vendors" }],
    community_Images: { type: String },
    communityPosts: [
      {
        type: Schema.Types.ObjectId,
        ref: "CommunityPost",
      },
    ],
  },
  { timestamps: true }
);

export const VendorCommunityModel = model<icommunity>(
  "community",
  VendorCommunitySchema
);
