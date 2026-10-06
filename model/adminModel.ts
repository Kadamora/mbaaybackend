import { Document, model, Schema } from "mongoose";
import { admin } from "../interfaces/adminInterface";

interface iadmin extends admin, Document {}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const adminSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
    required: true,
    match: [emailRegex, "Input a valid email"],
  },
  password: {
    type: String,
    required: true,
  },
  isBlocked: {
    type: String,
    // required: true,
  },
  profileImage: {
    type: String,
  },
  role: {
    type: String,
    enum: ["Admin", "Customer care", "Super Admin"],
    required: true,
  },
  requests: [
    {
      type: Schema.Types.ObjectId,
      ref: "vendors",
    },
  ],
  orders: [
    {
      type: Schema.Types.ObjectId,
      ref: "Orders",
    },
  ],
});

export const adminModel = model<iadmin>("admins", adminSchema);
