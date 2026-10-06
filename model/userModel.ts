import mongoose, { Document, model, Schema } from "mongoose";
import { user } from "../interfaces/userInterface";

interface iuser extends user, Document {}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    unique: true,
    required: true,
    match: [emailRegex, "Input a valid email"],
  },
  otpCode: {
    type: String,
  },
  otpExpires: {
    type: Date,
  },
  password: {
    type: String,
    // required: true,
  },
  isBlocked: {
    type: String,
    // required: true,
  },
  isverified: {
    type: Boolean,
    default: false,
  },
  phoneNumber: {
    type: String,
    // required: true,
  },
  country: {
    type: String,
    // required: true,
  },
  verificationCode: {
    type: String,
    // required: true,
  },
  refreshToken: {
    type: String,
  },
  orders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
  ],
  notifications: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "notifications",
    },
  ],
  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: ["vendors", "users"],
    },
  ],
  following: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: ["vendors", "users"],
    },
  ],
});

export const userModel = model<iuser>("users", userSchema);
