"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentModel = exports.CommunityPostModel = void 0;
// ✅ commentModel.ts
const mongoose_1 = __importStar(require("mongoose"));
const ReplySchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        refPath: "commentType",
        required: true,
    },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    commentType: { type: String, enum: ["vendors", "community"], required: true },
    comment_poster: String,
    comment_poster_Image: String,
});
const CommentSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        refPath: "commentType",
        required: true,
    },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    commentType: { type: String, enum: ["vendors", "community"], required: true },
    replies: [ReplySchema],
    comment_poster: String,
    comment_poster_Image: String,
});
const CommunityPostSchema = new mongoose_1.Schema({
    content: {
        type: String,
        required: true,
    },
    tags: [
        {
            tagId: {
                type: mongoose_1.default.Schema.Types.ObjectId,
                // required: true,
            },
            tagType: {
                type: String,
                enum: ["vendors", "community"],
                // required: true,
            },
        },
    ],
    likes: [{ type: mongoose_1.default.Schema.Types.ObjectId, refPath: "likeType" }],
    likeType: {
        type: String,
        enum: ["vendors", "community"],
    },
    comments: [CommentSchema],
    poster: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        refPath: "posterType",
        required: true,
    },
    posts_Images: {
        type: [],
    },
    posterType: {
        type: String,
        enum: ["vendors", "community"],
        required: true,
    },
    createdTime: {
        type: Date,
        default: new Date(),
    },
    community: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "community",
    },
});
exports.CommunityPostModel = (0, mongoose_1.model)("CommunityPost", CommunityPostSchema);
exports.CommentModel = (0, mongoose_1.model)("Comment", CommentSchema);
