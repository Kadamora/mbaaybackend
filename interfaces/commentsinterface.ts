import mongoose from "mongoose";

export interface Comment {
  user: mongoose.Schema.Types.ObjectId;
  text: string;
  createdAt: Date;
  commentType: string;
  comment_poster: string;
  comment_poster_Image: string;
  replies?: Comment[]; // ✅ Allow nested replies
}
