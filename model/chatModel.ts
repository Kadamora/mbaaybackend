import mongoose, { Schema } from "mongoose";

export interface IChat extends Document {
  participants: Array<{
    participantId: mongoose.Types.ObjectId;
    model: string;
  }>;
  lastMessage?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  customerCare: mongoose.Types.ObjectId;
  isCustomerCareChat: boolean;
}

const ChatSchema = new Schema(
  {
    participants: [
      {
        participantId: {
          type: Schema.Types.ObjectId,
          required: true,
        },
        model: {
          type: String,
          required: true,
          enum: ["users", "vendors", "Admin"],
        },
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    customerCare: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    isCustomerCareChat: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default mongoose.model<IChat>("Chat", ChatSchema);
