// ✅ commentModel.ts
import mongoose, { Document, Schema, model } from "mongoose";
import { communityPost } from "../interfaces/communitypostInterface";
import { Comment } from "../interfaces/commentsinterface";

interface ICommunityPost extends communityPost, Document {}
interface IComment extends Comment, Document {}

const ReplySchema = new Schema<IComment>({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "commentType",
    required: true,
  },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  commentType: { type: String, enum: ["vendors", "community"], required: true },
  comment_poster: String,
  comment_poster_Image: String,
});

const CommentSchema = new Schema<IComment>({
  user: {
    type: mongoose.Schema.Types.ObjectId,
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

const CommunityPostSchema = new Schema<ICommunityPost>({
  content: {
    type: String,
    required: true,
  },
  tags: [
    {
      tagId: {
        type: mongoose.Schema.Types.ObjectId,
        // required: true,
      },
      tagType: {
        type: String,
        enum: ["vendors", "community"],
        // required: true,
      },
    },
  ],

  likes: [{ type: mongoose.Schema.Types.ObjectId, refPath: "likeType" }],
  likeType: {
    type: String,
    enum: ["vendors", "community"],
  },
  comments: [CommentSchema],
  poster: {
    type: mongoose.Schema.Types.ObjectId,
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
    type: mongoose.Schema.Types.ObjectId,
    ref: "community",
  },
});

export const CommunityPostModel = model<ICommunityPost>(
  "CommunityPost",
  CommunityPostSchema
);
export const CommentModel = model<IComment>("Comment", CommentSchema);
