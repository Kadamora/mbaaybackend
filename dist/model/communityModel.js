"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VendorCommunityModel = void 0;
const mongoose_1 = require("mongoose");
const VendorCommunitySchema = new mongoose_1.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    admin: { type: mongoose_1.Schema.Types.ObjectId, ref: "vendors", required: true },
    members: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "vendors" }],
    community_Images: { type: String },
    communityPosts: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "CommunityPost",
        },
    ],
}, { timestamps: true });
exports.VendorCommunityModel = (0, mongoose_1.model)("community", VendorCommunitySchema);
