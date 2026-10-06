// models/Message.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  chat: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  senderModel: "users" | "vendors" | "admins";
  content?: string;
  images?: string[];
  video?: string;
  videoThumbnail?: string;
  replyTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isRead: boolean;
}

const MessageSchema = new Schema<IMessage>(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "senderModel",
    },
    senderModel: {
      type: String,
      enum: ["users", "vendors", "admins"],
      required: true,
    },
    content: { type: String },
    images: [{ type: String }],
    video: { type: String },
    videoThumbnail: { type: String },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model<IMessage>("Message", MessageSchema);
