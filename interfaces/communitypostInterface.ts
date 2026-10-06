import mongoose from "mongoose";

export interface communityPost {
  poster: mongoose.Schema.Types.ObjectId;
  community: mongoose.Schema.Types.ObjectId;
  content: string;
  image?: string;
  tags: {}[];
  likes: {}[];
  comments: {}[];
  createdTime: Date;
  updatedAt: Date;
  tagType: string;
  likeType: string;
  posterType: string;
  posts_Images: [];
}
