import { Request, Response } from "express";
import path from "path";
import { userModel } from "../model/userModel";
import { sendMail } from "../config/email";
import ejs from "ejs";
import bcrypt from "bcryptjs";
import { EnvironmentVariables } from "../Environment/environmentVariables";
import jwt from "jsonwebtoken";
import axios from "axios";
import { OrderModel } from "../model/orderModel";
import { vendorModel } from "../model/vendorModel";
import { OAuth2Client } from "google-auth-library";
import notificationsModel from "../model/notificationsModel";
import { VendorCommunityModel } from "../model/communityModel";
import mongoose from "mongoose";

const client = new OAuth2Client(process.env.GOOGLE_ID);

export const googleAuthUser = async (req: any, res: any) => {
  try {
    const { token } = req.body;

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ message: "Invalid Google token" });
    }

    const { email, name, picture } = payload;

    let user = await userModel.findOne({ email });

    if (!user) {
      user = await userModel.create({
        name: name || email.split("@")[0],
        email,
        password: null,
        avatar: picture,
        isVerified: true,
      });
    }

    const authToken = jwt.sign(
      { userId: user._id, email: user.email, role: "user" },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    return res.status(200).json({
      message: "Google authentication successful",
      token: authToken,
      data: user,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Google authentication failed",
      error: error.message,
    });
  }
};

export const create_user = async (req: Request, res: any) => {
  try {
    const { name, email, password, phoneNumber } = req.body;
    function generateOTP() {
      let otp = Math.floor(10000 + Math.random() * 90000).toString();
      while (otp.length < 5) {
        otp = "3" + otp;
      }
      return otp;
    }
    const randomNumber = generateOTP();
    const Salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, Salt);
    const new_user = await userModel.create({
      name,
      email,
      password: hashPassword,
      phoneNumber,
      verificationCode: randomNumber,
    });
    const emailTemplatePath = path.join(
      __dirname,
      "..",
      "..",
      "view",
      "Send_otp.ejs",
    );
    await sendMail(
      new_user.email,
      "Verify Your Account with This OTP",
      await ejs.renderFile(emailTemplatePath, {
        otp: randomNumber,
        name: new_user.name,
      }),
    );
    return res
      .status(200)
      .json({ message: "Mail sent successfully", data: new_user });
  } catch (error: any) {
    return res
      .status(404)
      .json({ message: "An error occured", data: error.message });
  }
};

export const verifyOtp = async (req: Request, res: any) => {
  try {
    const { otp } = req.body;

    let checkOtp: any = await userModel.findById(req.params.id);
    // .select("-verificationCode");

    if (!otp) {
      return res.status(400).json({
        message: "Input Otp",
      });
    }

    if (!checkOtp) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (otp !== checkOtp!.verificationCode) {
      return res.status(404).json({
        message: "Incorrect Otp",
      });
    }

    console.log(checkOtp!.verificationCode);

    const emailTemplatePath = path.join(
      __dirname,
      "..",
      "..",
      "view",
      "welcome.ejs",
    );

    await sendMail(
      checkOtp!.email,
      "Welcome to Mbaay",
      await ejs.renderFile(emailTemplatePath, { userName: checkOtp!.name }),
    );

    checkOtp!.isverified = true;
    await checkOtp.save();

    // Automatically add user to Mbaay community
    try {
      const mbaayCommunity = await VendorCommunityModel.findOne({
        name: "Mbaay",
      });
      if (
        mbaayCommunity &&
        !mbaayCommunity.members.some(
          (member: any) => member.toString() === checkOtp!._id.toString(),
        )
      ) {
        mbaayCommunity.members.push(checkOtp!._id);
        await mbaayCommunity.save();
        console.log(
          `User ${checkOtp!.name} automatically added to Mbaay community`,
        );
      }
    } catch (error) {
      console.error("Error adding user to Mbaay community:", error);
    }

    return res.status(200).json({
      message: `Successfully signed in ${checkOtp.name}`,
      data: checkOtp,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

export const resentOtp = async (req: Request, res: any) => {
  try {
    const { userId } = req.params;

    const getUser = await userModel.findById(userId);

    if (!getUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }
    function generateOTP() {
      let otp = Math.floor(10000 + Math.random() * 90000).toString();

      while (otp.length < 5) {
        otp = "3" + otp;
      }

      return otp;
    }

    const randomNumber: any = generateOTP();

    getUser!.verificationCode = randomNumber;
    await getUser.save();
    const emailTemplatePath = path.join(
      __dirname,
      "..",
      "..",
      "view",
      "Send_otp.ejs",
    );

    await sendMail(
      getUser!.email,
      "Mbaay Verification Code",
      await ejs.renderFile(emailTemplatePath, {
        otp: randomNumber,
        name: getUser!.name,
      }),
    );

    return res.status(200).json({
      message: `OTP resent to ${getUser!.email} successfully`,
      data: getUser,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

export const loginUser = async (req: Request, res: any) => {
  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res.status(400).json({
        message: "Please provide both email/phone number and password.",
      });
    }

    const isEmail = emailOrPhone.includes("@");
    const query = isEmail
      ? { email: emailOrPhone }
      : { phoneNumber: emailOrPhone };

    const user: any = await userModel.findOne(query);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // 🔍 Get IP Address
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // 🌍 Fetch City and Country from IP
    const locationResponse: any = await axios.get(
      `http://ip-api.com/json/${ip}`,
    );
    const { city, country } = locationResponse.data;

    user.country = `${city},${country}`;
    // 🔐 Generate Token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        ...user.toObject(),
        location: { city, country }, // 🗺️ Attach City & Country
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const findOneUser = async (req: any, res: any) => {
  try {
    const getOneUser = await userModel
      .findById(req.user._id)
      .select("-verificationCode"); // Exclude the verificationCode field

    if (!getOneUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Respond with user data and additional information
    return res.status(200).json({
      message: `User ${getOneUser.name} found successfully`,
      data: getOneUser,
    });
  } catch (error: any) {
    console.error("Error fetching user details:", error);

    // Return an internal server error response
    return res.status(500).json({
      message: "An error occurred while fetching user details",
      error: error.message,
    });
  }
};

export const getUserOrders = async (req: any, res: any) => {
  try {
    const shopperId: string | undefined = req.user?.userId ?? req.user?._id;

    if (!shopperId) {
      return res.status(401).json({ message: "Unauthenticated request" });
    }

    // FIX 1: Query Order directly using userId (correct direction)
    let orders = await OrderModel.find({ userId: shopperId })
      .populate({
        path: "items.product",
        model: "products",
        select: "name images price poster storeName", // Now you will see name & images
      })
      .sort({ createdAt: -1 });

    // If no orders as buyer, check if it's a vendor buying something
    if (!orders || orders.length === 0) {
      orders = await OrderModel.find({
        _id: {
          $in:
            (
              await vendorModel
                .findById(shopperId)
                .select("my_bought_products_orders")
            )?.my_bought_products_orders || [],
        },
      })
        .populate({
          path: "items.product",
          model: "products",
          select: "name images price poster storeName",
        })
        .sort({ createdAt: -1 });
    }

    // Determine account type
    const isVendor = await vendorModel.findById(shopperId);
    const accountType = isVendor ? "vendor" : "user";

    return res.status(200).json({
      success: true,
      accountType,
      message:
        orders.length > 0 ? "Orders fetched successfully" : "No orders found",
      orders: orders || [],
    });
  } catch (err: any) {
    console.error("Get Orders Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
export const allUsers = async (req: any, res: any) => {
  try {
    const users = await userModel.find();

    return res.status(200).json({
      message: "All users fetched successfully",
      data: users,
    });
  } catch (error: any) {
    console.error("Get Orders Error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const forgetPassword = async (req: any, res: any) => {
  try {
    const { email } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) return res.status(404).json({ message: "user not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();

    const emailTemplatePath = path.join(
      __dirname,
      "..",
      "..",
      "view",
      "Send_otp.ejs",
    );

    await sendMail(
      user.email,
      "Password Reset OTP",
      await ejs.renderFile(emailTemplatePath, {
        otp: otp,
        name: user.name,
      }),
    );

    // Notify user about OTP generation
    await notificationsModel.create({
      recipient: user._id,
      type: "System",
      title: "Password Reset OTP Sent",
      message: `A password reset OTP has been sent to your email (${email}).`,
      isRead: false,
      metadata: { userId: user._id },
    });

    return res.status(200).json({
      message: "code has been sent to mail",
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

export const verifyOtpAndResetPassword = async (req: any, res: any) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "us not found" });
    }

    if (user.otpCode !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpires && user.otpExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    user.otpCode = null;
    user.otpExpires = null;

    await user.save();

    // Notify us about successful password reset
    await notificationsModel.create({
      recipient: user._id,
      type: "System",
      title: "Password Reset Successful",
      message: `Your password has been successfully reset.`,
      isRead: false,
      metadata: { userId: user._id },
    });

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error: any) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

export const clearAllOrdersCompletely = async () => {
  try {
    console.log("Starting FULL order cleanup...");

    // 1. Delete ALL orders from Order collection
    const orderResult = await OrderModel.deleteMany({});
    console.log(
      `Deleted ${orderResult.deletedCount} orders from Order collection`,
    );

    // 2. Clear orders array from ALL users
    const userResult = await userModel.updateMany({}, { $set: { orders: [] } });
    console.log(`Cleared orders array from ${userResult.modifiedCount} users`);

    // 3. Clear my_bought_products_orders from ALL vendors
    const vendorResult = await vendorModel.updateMany(
      {},
      { $set: { my_bought_products_orders: [], orders: [] } },
    );
    console.log(
      `Cleared my_bought_products_orders from ${vendorResult.modifiedCount} vendors`,
    );

    // 4. Optional: Also clear any notifications related to orders (if you have a notifications model)
    await notificationsModel.deleteMany({
      "metadata.orderId": { $exists: true },
    });

    console.log("FULL ORDER CLEANUP COMPLETED SUCCESSFULLY!");
    console.log("Database is now 100% clean - no orders anywhere.");
  } catch (error: any) {
    console.error("Failed during full order cleanup:", error.message);
    throw error;
  }
};
