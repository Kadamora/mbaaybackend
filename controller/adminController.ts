import { Request } from "express";
import bcrypt from "bcryptjs";
import { adminModel } from "../model/adminModel";
import { vendorModel } from "../model/vendorModel";
import NotificationModel from "../model/notificationsModel";
import { EnvironmentVariables } from "../Environment/environmentVariables";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { userModel } from "../model/userModel";
import chatModel from "../model/chatModel";
import messageModel from "../model/messageModel";
import { VendorCommunityModel } from "../model/communityModel";
import { CommunityPostModel } from "../model/communityPostModel";
import { cloudinary } from "../config/cloudinary";
import { OrderModel } from "../model/orderModel";
import { ReviewModel } from "../model/reviewModel";
import { ProductModel } from "../model/productsModel";
import { InvoiceModel } from "../model/invoiceModel";
import path from "path";
import { sendMail } from "../config/email";
import ejs from "ejs";

export const create_admin = async (req: Request, res: any) => {
  try {
    const { name, email, password, role } = req.body;

    if (!role || !["Admin", "Customer care", "Super Admin"].includes(role)) {
      return res.status(400).json({
        message:
          "Invalid role. Must be 'Admin', 'Customer care', or 'Super Admin'",
      });
    }

    const Salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, Salt);

    const new_user = await adminModel.create({
      name,
      email,
      password: hashPassword,
      role,
    });

    // Notify admin about account creation
    await NotificationModel.create({
      recipient: new_user._id,
      type: "System",
      title: "Admin Account Created",
      message: `Your admin account has been successfully created with the role: ${new_user.role}.`,
      isRead: false,
      metadata: { adminId: new_user._id, role: new_user.role },
    });

    return res.status(201).json({
      message: "Admin created successfully",
      data: new_user,
    });
  } catch (error: any) {
    console.error("❌ Error creating admin:", error);
    return res.status(500).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

export const approveOrRejectVendor = async (req: any, res: any) => {
  try {
    const { vendorId } = req.params;
    const { action } = req.body; // "Approved", "Rejected", or "Pending"
    const adminId = req.user._id;

    // Validate action
    if (!["Approved", "Rejected", "Pending"].includes(action)) {
      return res.status(400).json({
        message: "Invalid action. Use 'Approved', 'Rejected', or 'Pending'.",
      });
    }

    // Find the vendor
    const vendor: any = await vendorModel.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Find the admin
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    if (!admin.requests.includes(vendorId)) {
      return res.status(403).json({
        message: "You do not have permission to update this vendor's status",
      });
    }

    // Update the verification status
    vendor.verificationStatus = action;

    // NEW: send the approval/rejection mail immediately for a final decision
    if (action === "Approved" || action === "Rejected") {
      const templatePath = path.join(
        __dirname,
        "..",
        "..",
        "view",
        action === "Approved" ? "approved.ejs" : "rejected.ejs",
      );

      const mailTemplate = await ejs.renderFile(templatePath, {
        storeName: vendor.storeName,
      });

      await sendMail(vendor.email, "Account Verification Status", mailTemplate);

      vendor.emailSent = true; // prevents the cron job re-sending this later
    }

    await vendor.save();

    // NEW: finalize cleanup immediately for a decided vendor, mirroring what
    // the cron used to do alongside the (previously delayed) email
    if (action === "Approved" || action === "Rejected") {
      await adminModel.updateMany(
        { requests: vendorId },
        { $pull: { requests: vendorId } },
      );

      if (action === "Rejected") {
        await vendorModel.findByIdAndDelete(vendorId);
      }
    }

    // Notify vendor about status update
    await NotificationModel.create({
      recipient: vendor._id,
      sender: adminId,
      type: "System",
      title: `Vendor Status Updated`,
      message: `Your vendor account status has been updated to "${action}".`,
      isRead: false,
      metadata: { vendorId, action },
    });

    // Notify admin about action taken
    await NotificationModel.create({
      recipient: adminId,
      type: "System",
      title: `Vendor ${action}`,
      message: `You have ${action.toLowerCase()} vendor ${vendor.storeName}.`,
      isRead: false,
      metadata: { vendorId, action },
    });

    return res.status(200).json({
      message: `Vendor status has been updated to '${action}'.`,
      data: vendor,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

export const find_one_admin = async (req: any, res: any) => {
  try {
    const get_one_admin = await adminModel
      .findById(req.user._id)
      .populate("requests");

    if (!get_one_admin) {
      return res.status(404).send("Not found admin");
    }

    return res.status(200).json({
      message: "Found success",
      data: get_one_admin,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

export const getAnAdmin = async (req: any, res: any) => {
  try {
    const { adminId } = req.params;

    const admin = await adminModel.findById(adminId).populate("requests");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    return res.status(200).json({
      message: "Admin details retrieved successfully",
      data: admin,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error retrieving admin details",
      error: error.message,
    });
  }
};

export const login_admin = async (req: Request, res: any) => {
  try {
    const { emailOrPhone, password } = req.body;

    // Validate input
    if (!emailOrPhone || !password) {
      return res.status(400).json({
        message: "Please provide both email/phone number and password.",
      });
    }

    const isEmail = emailOrPhone.includes("@");
    const query = isEmail
      ? { email: emailOrPhone.toLowerCase() }
      : { phoneNumber: emailOrPhone };

    const admin = await adminModel.findOne(query).select("-verificationCode");

    if (!admin) {
      return res
        .status(404)
        .json({ message: "Invalid email or phone number." });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const accessToken = jwt.sign(
      { _id: admin._id, name: admin.name, role: admin.role },
      EnvironmentVariables.JWT_SECRET,
      { expiresIn: "15m" },
    );
    const refreshToken = jwt.sign(
      { _id: admin._id },
      process.env.JWT_REFRESH_SECRET || EnvironmentVariables.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    // Store refresh token in DB
    admin.refreshToken = refreshToken;
    await admin.save();

    // Notify admin about successful login
    await NotificationModel.create({
      recipient: admin._id,
      type: "System",
      title: "Login Successful",
      message: `You have successfully logged into your admin account.`,
      isRead: false,
      metadata: { adminId: admin._id },
    });

    return res.status(200).json({
      message: "Successfully logged in.",
      accessToken,
      refreshToken,
      user: { id: admin._id, name: admin.name },
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

export const getVendorDetails = async (req: any, res: any) => {
  try {
    const { vendorId } = req.params;

    const vendor = await vendorModel.findById(vendorId).populate("followers");
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    return res.status(200).json({
      message: "Vendor details retrieved successfully",
      data: vendor,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error retrieving vendor details",
      error: error.message,
    });
  }
};

export const startCustomerCareChat = async (req: any, res: any) => {
  try {
    const senderId = req.user._id || req.user.userId;
    const senderModel = (await userModel.findById(senderId))
      ? "users"
      : "vendors";

    // Check for existing customer care chat with this sender
    const existingChat = await chatModel.findOne({
      "participants.participantId": senderId,
      isCustomerCareChat: true,
    });

    if (existingChat) {
      return res.status(200).json({ chat: existingChat });
    }

    const customerCareAdmins = await adminModel.find({ role: "Customer care" });
    if (!customerCareAdmins.length)
      return res.status(404).json({ message: "No customer care available" });

    const randomIndex = Math.floor(Math.random() * customerCareAdmins.length);
    const selectedAdmin: any = customerCareAdmins[randomIndex];

    const chatPayload: any = {
      participants: [
        {
          participantId: senderId,
          model: senderModel,
        },
      ],
      isCustomerCareChat: true,
      customerCare: selectedAdmin._id,
    };

    const newChat = await chatModel.create(chatPayload);

    // Notify customer care admin about new chat
    await NotificationModel.create({
      recipient: selectedAdmin._id,
      sender: senderId,
      type: "System",
      title: "New Customer Care Chat",
      message: `A new customer care chat has been started by a ${
        senderModel === "users" ? "user" : "vendor"
      }.`,
      isRead: false,
      metadata: { chatId: newChat._id, senderId },
    });

    // Notify sender about chat initiation
    await NotificationModel.create({
      recipient: senderId,
      type: "System",
      title: "Customer Care Chat Started",
      message: `Your customer care chat has been successfully started.`,
      isRead: false,
      metadata: { chatId: newChat._id },
    });

    const io = req.app.get("io");
    io.to(selectedAdmin._id.toString()).emit(
      "customerCareChatStarted",
      newChat,
    );

    res.status(201).json({ success: true, chat: newChat });
  } catch (err: any) {
    res
      .status(500)
      .json({ message: "Error starting chat", error: err.message });
  }
};

export const sendcustomercareMessage = async (req: any, res: any) => {
  try {
    const { chatId, content } = req.body;
    const senderId = req.user._id || req.user.userId;

    const senderModel = (await userModel.findById(senderId))
      ? "users"
      : (await vendorModel.findById(senderId))
        ? "vendors"
        : (await adminModel.findById(senderId))
          ? "admins"
          : null;

    if (!senderModel) {
      return res.status(400).json({ message: "Sender not found" });
    }

    let chat: any = null;

    // Try to find existing chat, or create new one if not found
    if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
      chat = await chatModel.findById(chatId);
    }

    // If chat not found, create a new customer care chat
    if (!chat) {
      // Check for existing customer care chat with this sender
      const existingChat = await chatModel.findOne({
        "participants.participantId": senderId,
        isCustomerCareChat: true,
      });

      if (existingChat) {
        chat = existingChat;
      } else {
        // Create new customer care chat
        const customerCareAdmins = await adminModel.find({
          role: "Customer care",
        });
        if (!customerCareAdmins.length) {
          return res
            .status(404)
            .json({ message: "No customer care available" });
        }

        const randomIndex = Math.floor(
          Math.random() * customerCareAdmins.length,
        );
        const selectedAdmin: any = customerCareAdmins[randomIndex];

        const chatPayload: any = {
          participants: [
            {
              participantId: senderId,
              model: senderModel,
            },
          ],
          isCustomerCareChat: true,
          customerCare: selectedAdmin._id,
        };

        chat = await chatModel.create(chatPayload);

        // Notify customer care admin about new chat
        await NotificationModel.create({
          recipient: selectedAdmin._id,
          sender: senderId,
          type: "System",
          title: "New Customer Care Chat",
          message: `A new customer care chat has been started by a ${senderModel === "users" ? "user" : "vendor"}.`,
          isRead: false,
          metadata: { chatId: chat._id, senderId },
        });

        // Notify sender about chat initiation
        await NotificationModel.create({
          recipient: senderId,
          type: "System",
          title: "Customer Care Chat Started",
          message: "Your customer care chat has been successfully started.",
          isRead: false,
          metadata: { chatId: chat._id },
        });

        const io = req.app.get("io");
        io.to(selectedAdmin._id.toString()).emit(
          "customerCareChatStarted",
          chat,
        );
      }
    }

    const message = await messageModel.create({
      chat: chat._id,
      sender: senderId,
      senderModel,
      content,
    });

    await chatModel.findByIdAndUpdate(chat._id, { lastMessage: message._id });

    const populatedMessage = await messageModel
      .findById(message._id)
      .populate("sender", "name email storeName");

    // Notify chat participants about new message
    let recipientId;
    if (chat.isCustomerCareChat) {
      // For customer care chats, recipient is the other party
      if (senderModel === "admins") {
        // If sender is admin, recipient is the user/vendor
        recipientId = chat.participants[0]?.participantId;
      } else {
        // If sender is user/vendor, recipient is the customer care admin
        recipientId = chat.customerCare;
      }
    } else {
      // For regular chats
      recipientId = chat.participants.find(
        (p: any) => p.participantId.toString() !== senderId.toString(),
      )?.participantId;
    }

    if (recipientId) {
      await NotificationModel.create({
        recipient: recipientId,
        sender: senderId,
        type: "System",
        title: "New Customer Care Message",
        message: `You received a new message in your customer care chat.`,
        isRead: false,
        metadata: { chatId: chat._id, messageId: message._id },
      });
    }

    const io = req.app.get("io");
    io.to(chat._id.toString()).emit("customerCareMessage", populatedMessage);

    res.status(200).json({ success: true, message: populatedMessage });
  } catch (err: any) {
    res
      .status(500)
      .json({ message: "Error sending message", error: err.message });
  }
};

export const getCustomerCareChats = async (req: any, res: any) => {
  try {
    const customerCareId = req.user._id;

    // Check if user is a customer care admin
    const admin = await adminModel.findById(customerCareId);
    if (!admin || admin.role !== "Customer care") {
      return res.status(403).json({
        message: "Access denied. Customer care role required.",
      });
    }

    const chats = await chatModel
      .find({
        isCustomerCareChat: true,
        customerCare: customerCareId,
      })
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    // Manually populate participants based on their model
    const populatedChats = await Promise.all(
      chats.map(async (chat: any) => {
        const populatedParticipants = await Promise.all(
          chat.participants.map(async (p: any) => {
            let model: any = null;
            if (p.model === "users") model = userModel;
            else if (p.model === "vendors") model = vendorModel;

            const participantDetails = model
              ? await model.findById(p.participantId)
              : null;

            return {
              ...p.toObject(),
              details: participantDetails,
            };
          }),
        );

        return {
          ...chat.toObject(),
          participants: populatedParticipants,
        };
      }),
    );

    res.status(200).json({ success: true, chats: populatedChats });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching customer care chats",
      error: err.message,
    });
  }
};

export const getChatMessages_customerCare = async (req: any, res: any) => {
  try {
    const { chatId } = req.params;

    // Ensure chatId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid chat ID" });
    }

    const messages = await messageModel
      .find({ chat: new mongoose.Types.ObjectId(chatId) })
      .sort({ createdAt: 1 })
      .populate("sender");

    res.status(200).json({ success: true, messages });
  } catch (err: any) {
    res
      .status(500)
      .json({ message: "Error getting messages", error: err.message });
  }
};

export const approveKYC = async (req: any, res: any) => {
  try {
    const { vendorId } = req.params;
    const adminId = req.user._id;

    const vendor = await vendorModel.findByIdAndUpdate(
      vendorId,
      {
        $set: {
          kycStatus: "Approved",
          kycReviewedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // Notify vendor about KYC approval
    await NotificationModel.create({
      recipient: vendor._id,
      sender: adminId,
      type: "System",
      title: "KYC Approved",
      message: `Your KYC documents have been approved.`,
      isRead: false,
      metadata: { vendorId },
    });

    // Notify admin about KYC action
    await NotificationModel.create({
      recipient: adminId,
      type: "System",
      title: "KYC Approval",
      message: `You have approved KYC documents for vendor ${vendor.storeName}.`,
      isRead: false,
      metadata: { vendorId },
    });

    return res.status(200).json({
      success: true,
      message: "KYC approved successfully",
      vendor,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error approving KYC",
      error: error.message,
    });
  }
};

export const rejectKYC = async (req: any, res: any) => {
  try {
    const { vendorId } = req.params;
    const adminId = req.user._id;

    const vendor = await vendorModel.findByIdAndUpdate(
      vendorId,
      {
        $set: {
          kycStatus: "Rejected",
          kycDocuments: { front: null, back: null },
          kycSubmittedAt: null,
        },
      },
      { new: true },
    );

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // Notify vendor about KYC rejection
    await NotificationModel.create({
      recipient: vendor._id,
      sender: adminId,
      type: "System",
      title: "KYC Rejected",
      message: `Your KYC documents have been rejected. Please re-upload for verification.`,
      isRead: false,
      metadata: { vendorId },
    });

    // Notify admin about KYC action
    await NotificationModel.create({
      recipient: adminId,
      type: "System",
      title: "KYC Rejection",
      message: `You have rejected KYC documents for vendor ${vendor.storeName}.`,
      isRead: false,
      metadata: { vendorId },
    });

    return res.status(200).json({
      success: true,
      message: "KYC rejected and documents deleted",
      vendor,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error rejecting KYC",
      error: error.message,
    });
  }
};

export const viewAllKYCRequests = async (req: any, res: any) => {
  try {
    const vendors = await vendorModel.find(
      { kycStatus: { $in: ["Processing", "Approved", "Rejected"] } },
      {
        storeName: 1,
        email: 1,
        kycStatus: 1,
        kycDocuments: 1,
        kycSubmittedAt: 1,
      },
    );

    return res.status(200).json({
      success: true,
      count: vendors.length,
      vendors,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching KYC requests",
      error: error.message,
    });
  }
};

// export const verify_return_policy = async (req: any, res: any) => {
//   try {
//     const admin = await adminModel.findById(req.user._id);
//     if (!admin) return res.status(403).json({ message: "Unauthorized" });

//     const { vendorId } = req.params;
//     const { verified, reason } = req.body;
//     const vendor = await vendorModel.findById(vendorId);
//     if (!vendor) return res.status(404).json({ message: "Vendor not found" });

//     vendor.returnpolicyverified = verified;

//     if (verified === "Rejected") {
//       vendor.returnPolicy = null;
//     }

//     await vendor.save();

//     // Notify vendor about return policy verification status
//     await NotificationModel.create({
//       recipient: vendor._id,
//       sender: admin._id,
//       type: "System",
//       title: `Return Policy ${verified}`,
//       message: `Your return policy was ${verified.toLowerCase()}. ${
//         verified === "Approved"
//           ? "You can now upload products and begin selling on Mbaay."
//           : `Reason: ${reason}. Please re-upload for re-verification.`
//       }`,
//       isRead: false,
//       metadata: { vendorId, status: verified },
//     });

//     // Notify admin about action taken
//     await NotificationModel.create({
//       recipient: admin._id,
//       type: "System",
//       title: `Return Policy ${verified}`,
//       message: `You have ${verified.toLowerCase()} the return policy for vendor ${
//         vendor.storeName
//       }.`,
//       isRead: false,
//       metadata: { vendorId, status: verified },
//     });

//     return res
//       .status(200)
//       .json({ message: `Return policy ${verified.toLowerCase()}` });
//   } catch (error: any) {
//     return res.status(500).json({
//       message: "An error occurred",
//       error: error.message,
//     });
//   }
// };

// export const get_pending_returnPolicy = async (req: any, res: any) => {
//   try {
//     const get_return_requests = await vendorModel
//       .find({ returnpolicyverified: "Pending" })
//       .select("userName email returnPolicy storeName avatar");

//     return res.status(200).json({
//       message: "Pending return policies retrieved successfully",
//       data: get_return_requests,
//     });
//   } catch (error: any) {
//     return res.status(500).json({
//       message: "An error occurred",
//       error: error.message,
//     });
//   }
// };

export const find_one_vendor = async (req: any, res: any) => {
  try {
    const get_one_vendor = await vendorModel
      .findById(req.params.id)
      .populate("followers")
      .populate("following")
      .populate("communityPosts");

    if (!get_one_vendor) {
      return res.status(404).send("Not found vendor");
    }

    return res.status(200).json({
      message: "Found success",
      data: get_one_vendor,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

export const findOneUser = async (req: any, res: any) => {
  try {
    const getOneUser = await userModel
      .findById(req.params.id)
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

// Startup Functions
export const createMbaayCommunityOnStartup = async () => {
  try {
    console.log("🔄 Checking/creating Mbaay community...");

    // Check if Mbaay community already exists
    let community = await VendorCommunityModel.findOne({ name: "Mbaay" });

    if (!community) {
      // Get first admin or create a system admin
      let admin = await adminModel.findOne({
        role: { $in: ["Admin", "Super Admin"] },
      });

      if (!admin) {
        // Create a default system admin if none exists
        admin = await adminModel.create({
          name: "System Admin",
          email: "admin@mbaay.com",
          password: await bcrypt.hash("defaultAdminPass123!", 10),
          role: "Super Admin",
        });
        console.log("✅ Created default system admin");
      }

      community = await VendorCommunityModel.create({
        name: "Mbaay",
        description:
          "Official Mbaay Community - Connecting cultural enthusiasts and artisans worldwide",
        admin: admin._id,
        members: [admin._id],
      });

      console.log("✅ Mbaay community created successfully");
    } else {
      console.log("✅ Mbaay community already exists");
    }

    return community;
  } catch (error: any) {
    console.error("❌ Error creating Mbaay community on startup:", error);
    return null;
  }
};

// Clear all customer care chats and messages for testing
export const clearCustomerCareDataForTesting = async () => {
  try {
    console.log(
      "🧹 Clearing all customer care chats and messages for testing...",
    );

    // Find all customer care chats
    const customerCareChats = await chatModel.find({
      isCustomerCareChat: true,
    });

    let deletedMessagesCount = 0;
    let deletedChatsCount = 0;

    // Delete all messages in customer care chats
    for (const chat of customerCareChats) {
      const deletedMessages = await messageModel.deleteMany({ chat: chat._id });
      deletedMessagesCount += deletedMessages.deletedCount || 0;
    }

    // Delete all customer care chats
    const deletedChats = await chatModel.deleteMany({
      isCustomerCareChat: true,
    });
    deletedChatsCount = deletedChats.deletedCount || 0;

    console.log(`✅ Cleared ${deletedMessagesCount} customer care messages`);
    console.log(`✅ Cleared ${deletedChatsCount} customer care chats`);
    console.log("✅ Customer care data cleared for testing");

    return {
      deletedMessages: deletedMessagesCount,
      deletedChats: deletedChatsCount,
    };
  } catch (error: any) {
    console.error("❌ Error clearing customer care data:", error);
    return null;
  }
};

// Admin Community Functions
export const getMbaayCommunity = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Find or create Mbaay community
    let community = await VendorCommunityModel.findOne({ name: "Mbaay" });

    if (!community) {
      community = await VendorCommunityModel.create({
        name: "Mbaay",
        description:
          "Official Mbaay Community - Connecting cultural enthusiasts and artisans worldwide",
        admin: adminId,
        members: [adminId],
      });
    }

    // Ensure admin is a member
    if (!community.members.includes(adminId)) {
      community.members.push(adminId);
      await community.save();
    }

    const communityWithPosts = await VendorCommunityModel.findById(
      community._id,
    )
      .populate("members")
      .populate("admin")
      .populate({
        path: "communityPosts",
        populate: {
          path: "poster",
        },
        options: { sort: { createdAt: -1 } },
      });

    return res.status(200).json({
      message: "Mbaay community accessed successfully",
      data: communityWithPosts,
    });
  } catch (error: any) {
    console.error("Get Mbaay Community Error:", error);
    return res.status(500).json({
      message: "Error accessing Mbaay community",
      error: error.message,
    });
  }
};

export const createCommunityPost = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;
    const { content, tags } = req.body;

    // Validate required fields
    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Content is required" });
    }

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Get Mbaay community
    let community = await VendorCommunityModel.findOne({ name: "Mbaay" });
    if (!community) {
      community = await VendorCommunityModel.create({
        name: "Mbaay",
        description:
          "Official Mbaay Community - Connecting cultural enthusiasts and artisans worldwide",
        admin: adminId,
        members: [adminId],
      });
    }

    let imageUrls: string[] = [];

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(
        (file: Express.Multer.File): Promise<string> => {
          return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: "community/posts", resource_type: "image" },
              (error, result) => {
                if (error || !result) {
                  console.error("Cloudinary Upload Error:", error);
                  reject(new Error("Image upload failed"));
                } else {
                  resolve(result.secure_url);
                }
              },
            );
            uploadStream.end(file.buffer);
          });
        },
      );

      imageUrls = await Promise.all(uploadPromises);
    }

    const post: any = await CommunityPostModel.create({
      content,
      tags,
      posts_Images: imageUrls,
      poster: adminId,
      posterType: "community",
      community: community._id,
    });

    // Add post to community
    community.communityPosts.push(post._id);
    await community.save();

    // Notify community members
    if (community.members.length > 0) {
      const notifications = community.members
        .filter((memberId: any) => memberId.toString() !== adminId.toString())
        .map((memberId: any) =>
          NotificationModel.create({
            recipient: memberId,
            type: "Community",
            title: "New Mbaay Community Post",
            message: `A new post has been added to the Mbaay community`,
            isRead: false,
            metadata: { postId: post._id, communityId: community._id },
          }),
        );
      await Promise.all(notifications);
    }

    return res.status(201).json({
      message: "Post created successfully in Mbaay community",
      data: post,
    });
  } catch (error: any) {
    console.error("Create Community Post Error:", error);
    return res.status(500).json({
      message: "Error creating community post",
      error: error.message,
    });
  }
};

// Get all community posts (admin can see everything)
export const getAllCommunityPosts = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const posts = await CommunityPostModel.find()
      .populate("poster")
      .populate("community")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "All community posts retrieved successfully",
      data: posts,
    });
  } catch (error: any) {
    console.error("Get All Community Posts Error:", error);
    return res.status(500).json({
      message: "Error retrieving community posts",
      error: error.message,
    });
  }
};

// Get Order Functionality
export const getAllOrders = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const orders = await OrderModel.find()
      .populate({
        path: "items.product",
        select: "name images poster uploadedBy",
      })
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "All orders retrieved successfully",
      data: orders,
    });
  } catch (error: any) {
    console.error("Get All Orders Error:", error);
    return res.status(500).json({
      message: "Error retrieving orders",
      error: error.message,
    });
  }
};

// Block/Delete Users, Vendors, Admin, Customer Care
export const blockOrDeleteUser = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;
    const { userId, userType, action } = req.body; // userType: 'user', 'vendor', 'admin', 'customerCare'

    // Check if admin exists and has permission
    const admin = await adminModel.findById(adminId);
    if (!admin || (admin.role !== "Admin" && admin.role !== "Super Admin")) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (!["user", "vendor", "admin", "customerCare"].includes(userType)) {
      return res.status(400).json({ message: "Invalid user type" });
    }

    if (!["block", "unblock", "delete"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    let userModelToUse: any;
    let userField = "";

    switch (userType) {
      case "user":
        userModelToUse = userModel;
        userField = "User";
        break;
      case "vendor":
        userModelToUse = vendorModel;
        userField = "Vendor";
        break;
      case "admin":
        userModelToUse = adminModel;
        userField = "Admin";
        break;
      case "customerCare":
        userModelToUse = adminModel; // Customer care are also admins
        userField = "Customer Care";
        break;
    }

    const user = await userModelToUse.findById(userId);
    if (!user) {
      return res.status(404).json({ message: `${userField} not found` });
    }

    if (action === "delete") {
      await userModelToUse.findByIdAndDelete(userId);

      // Notify admin about action
      await NotificationModel.create({
        recipient: adminId,
        type: "System",
        title: `${userField} Deleted`,
        message: `You have successfully deleted ${userField} ${
          user.name || user.storeName || user.email
        }.`,
        isRead: false,
        metadata: { userId, userType, action },
      });

      return res.status(200).json({
        message: `${userField} deleted successfully`,
      });
    } else if (action === "block" || action === "unblock") {
      user.isBlocked = action === "block";
      await user.save();

      // Notify the user about block/unblock
      await NotificationModel.create({
        recipient: userId,
        type: "System",
        title: `Account ${action === "block" ? "Blocked" : "Unblocked"}`,
        message: `Your account has been ${
          action === "block" ? "blocked" : "unblocked"
        } by an admin.`,
        isRead: false,
        metadata: { adminId, action },
      });

      // Notify admin about action
      await NotificationModel.create({
        recipient: adminId,
        type: "System",
        title: `${userField} ${action === "block" ? "Blocked" : "Unblocked"}`,
        message: `You have ${
          action === "block" ? "blocked" : "unblocked"
        } ${userField} ${user.name || user.storeName || user.email}.`,
        isRead: false,
        metadata: { userId, userType, action },
      });

      return res.status(200).json({
        message: `${userField} ${
          action === "block" ? "blocked" : "unblocked"
        } successfully`,
        data: user,
      });
    }
  } catch (error: any) {
    console.error("Block/Delete User Error:", error);
    return res.status(500).json({
      message: "Error performing action",
      error: error.message,
    });
  }
};

// Get Vendors with Full Profiles
export const getAllVendors = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const vendors = await vendorModel
      .find()
      .populate("products")
      .populate("orders")
      .populate("followers")
      .populate("following")
      .populate("communityPosts");

    return res.status(200).json({
      message: "All vendors retrieved successfully",
      data: vendors,
    });
  } catch (error: any) {
    console.error("Get All Vendors Error:", error);
    return res.status(500).json({
      message: "Error retrieving vendors",
      error: error.message,
    });
  }
};

// Get Users with Full Profiles
export const getAllUsers = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const users = await userModel
      .find()
      .populate("orders")
      .select("-verificationCode");

    return res.status(200).json({
      message: "All users retrieved successfully",
      data: users,
    });
  } catch (error: any) {
    console.error("Get All Users Error:", error);
    return res.status(500).json({
      message: "Error retrieving users",
      error: error.message,
    });
  }
};

// Get Admins with Full Profiles
export const getAllAdmins = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin || admin.role !== "Super Admin") {
      return res
        .status(403)
        .json({ message: "Unauthorized - Super Admin required" });
    }

    const admins = await adminModel.find().populate("requests");

    return res.status(200).json({
      message: "All admins retrieved successfully",
      data: admins,
    });
  } catch (error: any) {
    console.error("Get All Admins Error:", error);
    return res.status(500).json({
      message: "Error retrieving admins",
      error: error.message,
    });
  }
};

// Get Customer and Payment
export const getCustomersAndPayments = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Get all orders with payment info
    const orders = await OrderModel.find()
      .populate("userId", "name email")
      .populate({
        path: "items.product",
        select: "name poster uploadedBy",
      })
      .sort({ createdAt: -1 });

    // Get payment summaries
    const paymentSummary = {
      totalRevenue: 0,
      successfulPayments: 0,
      pendingPayments: 0,
      failedPayments: 0,
    };

    orders.forEach((order: any) => {
      paymentSummary.totalRevenue += order.totalPrice || 0;
      if (order.payStatus === "Successful") {
        paymentSummary.successfulPayments += 1;
      } else if (order.payStatus === "Pending") {
        paymentSummary.pendingPayments += 1;
      } else {
        paymentSummary.failedPayments += 1;
      }
    });

    return res.status(200).json({
      message: "Customers and payments retrieved successfully",
      customers: orders,
      paymentSummary,
    });
  } catch (error: any) {
    console.error("Get Customers and Payments Error:", error);
    return res.status(500).json({
      message: "Error retrieving customers and payments",
      error: error.message,
    });
  }
};

// Review and Rating for Admin
export const getAllReviews = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const reviews = await ReviewModel.find()
      .populate("product", "name images")
      .populate("customer", "name storeName email")
      .sort({ createdAt: -1 });

    // Calculate overall stats
    const stats = await ReviewModel.aggregate([
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
          ratingDistribution: { $push: "$rating" },
        },
      },
    ]);

    let reviewStats = null;
    if (stats.length > 0) {
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      stats[0].ratingDistribution.forEach((rating: number) => {
        distribution[rating as keyof typeof distribution]++;
      });

      reviewStats = {
        totalReviews: stats[0].totalReviews,
        averageRating: Math.round(stats[0].averageRating * 10) / 10,
        ratingDistribution: distribution,
      };
    }

    return res.status(200).json({
      message: "All reviews retrieved successfully",
      reviews,
      stats: reviewStats,
    });
  } catch (error: any) {
    console.error("Get All Reviews Error:", error);
    return res.status(500).json({
      message: "Error retrieving reviews",
      error: error.message,
    });
  }
};

// Admin Messaging Functions
export const sendBroadcastMessage = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;
    const { title, message, targetUsers } = req.body; // targetUsers: 'all', 'users', 'vendors', 'admins'

    // Check if admin exists and has permission
    const admin = await adminModel.findById(adminId);
    if (!admin || (admin.role !== "Admin" && admin.role !== "Super Admin")) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (!title || !message) {
      return res
        .status(400)
        .json({ message: "Title and message are required" });
    }

    if (!["all", "users", "vendors", "admins"].includes(targetUsers)) {
      return res.status(400).json({ message: "Invalid target users" });
    }

    // Get recipients based on target
    let recipients: any[] = [];

    switch (targetUsers) {
      case "all":
        const allUsers = await userModel.find({}, "_id");
        const allVendors = await vendorModel.find({}, "_id");
        const allAdmins = await adminModel.find({}, "_id");
        recipients = [
          ...allUsers.map((u: any) => ({ id: u._id, type: "user" })),
          ...allVendors.map((v: any) => ({ id: v._id, type: "vendor" })),
          ...allAdmins.map((a: any) => ({ id: a._id, type: "admin" })),
        ];
        break;
      case "users":
        const users = await userModel.find({}, "_id");
        recipients = users.map((u: any) => ({ id: u._id, type: "user" }));
        break;
      case "vendors":
        const vendors = await vendorModel.find({}, "_id");
        recipients = vendors.map((v: any) => ({ id: v._id, type: "vendor" }));
        break;
      case "admins":
        const admins = await adminModel.find({}, "_id");
        recipients = admins.map((a: any) => ({ id: a._id, type: "admin" }));
        break;
    }

    // Create notifications for all recipients
    const notifications = recipients.map((recipient: any) =>
      NotificationModel.create({
        recipient: recipient.id,
        sender: adminId,
        type: "System",
        title: `Mbaay Broadcast: ${title}`,
        message: message,
        isRead: false,
        metadata: {
          broadcast: true,
          targetUsers,
          adminId,
          sentAt: new Date(),
        },
      }),
    );

    await Promise.all(notifications);

    return res.status(200).json({
      message: `Broadcast message sent to ${recipients.length} ${targetUsers}`,
      data: {
        title,
        message,
        targetUsers,
        recipientsCount: recipients.length,
        sentAt: new Date(),
      },
    });
  } catch (error: any) {
    console.error("Send Broadcast Message Error:", error);
    return res.status(500).json({
      message: "Error sending broadcast message",
      error: error.message,
    });
  }
};

export const sendPrivateMessage = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;
    const { recipientId, recipientType, title, message } = req.body; // recipientType: 'user', 'vendor', 'admin'

    // Check if admin exists and has permission
    const admin = await adminModel.findById(adminId);
    if (!admin || (admin.role !== "Admin" && admin.role !== "Super Admin")) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (!recipientId || !recipientType || !title || !message) {
      return res.status(400).json({
        message: "Recipient ID, type, title, and message are required",
      });
    }

    if (!["user", "vendor", "admin"].includes(recipientType)) {
      return res.status(400).json({ message: "Invalid recipient type" });
    }

    // Verify recipient exists
    let recipientModel: any;
    switch (recipientType) {
      case "user":
        recipientModel = userModel;
        break;
      case "vendor":
        recipientModel = vendorModel;
        break;
      case "admin":
        recipientModel = adminModel;
        break;
    }

    const recipient = await recipientModel.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    // Create private notification
    await NotificationModel.create({
      recipient: recipientId,
      sender: adminId,
      type: "System",
      title: `Private Message: ${title}`,
      message: message,
      isRead: false,
      metadata: {
        privateMessage: true,
        recipientType,
        adminId,
        sentAt: new Date(),
      },
    });

    return res.status(200).json({
      message: `Private message sent to ${recipientType}`,
      data: {
        recipientId,
        recipientType,
        title,
        message,
        sentAt: new Date(),
      },
    });
  } catch (error: any) {
    console.error("Send Private Message Error:", error);
    return res.status(500).json({
      message: "Error sending private message",
      error: error.message,
    });
  }
};

// Edit Mbaay Community Info (Admin Only)
// Get Admin Notifications
export const getAdminNotifications = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;
    const { isRead, page = 1, limit = 10 } = req.query;

    const query: any = { recipient: adminId };
    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const notifications = await NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string))
      .lean();

    const populatedNotifications = await Promise.all(
      notifications.map(async (notif: any) => {
        if (!notif.sender) return notif;

        let senderData = null;

        senderData =
          (await userModel.findById(notif.sender).select("name email")) ||
          (await vendorModel
            .findById(notif.sender)
            .select("storeName email")) ||
          (await adminModel.findById(notif.sender).select("name email role"));

        return {
          ...notif,
          sender: senderData,
        };
      }),
    );

    const total = await NotificationModel.countDocuments(query);

    return res.status(200).json({
      success: true,
      message: "Admin notifications retrieved successfully",
      data: {
        notifications: populatedNotifications,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error: any) {
    console.error("❌ getAdminNotifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving admin notifications",
      error: error.message,
    });
  }
};

// Admin Dashboard Stats
export const getAdminDashboardStats = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Balance - Total revenue from successful payments
    const totalRevenue = await OrderModel.aggregate([
      { $match: { payStatus: "Successful" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);

    const balance = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    // Total orders
    const totalOrders = await OrderModel.countDocuments();

    // Products sold - Sum of quantities from all orders
    const productsSoldResult = await OrderModel.aggregate([
      { $unwind: "$items" },
      { $group: { _id: null, total: { $sum: "$items.quantity" } } },
    ]);

    const productsSold =
      productsSoldResult.length > 0 ? productsSoldResult[0].total : 0;

    // Monthly revenue - Current month
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const monthlyRevenueResult = await OrderModel.aggregate([
      {
        $match: {
          payStatus: "Successful",
          createdAt: { $gte: currentMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);

    const monthlyRevenue =
      monthlyRevenueResult.length > 0 ? monthlyRevenueResult[0].total : 0;

    return res.status(200).json({
      message: "Admin dashboard stats retrieved successfully",
      data: {
        balance,
        totalOrders,
        productsSold,
        monthlyRevenue,
      },
    });
  } catch (error: any) {
    console.error("Get Admin Dashboard Stats Error:", error);
    return res.status(500).json({
      message: "Error retrieving dashboard stats",
      error: error.message,
    });
  }
};

// Get One Order by ID for Admin
export const getOneOrderForAdmin = async (req: any, res: any) => {
  try {
    const { orderId } = req.params;
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const order = await OrderModel.findById(orderId)
      .populate({
        path: "items.product",
        select: "name images poster uploadedBy price description",
      })
      .populate("userId", "name email profileImage");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      order,
    });
  } catch (err: any) {
    console.error("Get One Order For Admin Error:", err);
    return res.status(500).json({
      message: "Error fetching order",
      error: err.message,
    });
  }
};

// Get Admin Products
export const getAdminProducts = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const products = await ProductModel.find({ uploadedBy: "admin" })
      .populate("poster", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Admin products retrieved successfully",
      products,
    });
  } catch (error: any) {
    console.error("Get Admin Products Error:", error);
    return res.status(500).json({
      message: "Error retrieving admin products",
      error: error.message,
    });
  }
};

// Get One Admin Product by ID
export const getOneAdminProduct = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const product = await ProductModel.findOne({
      _id: productId,
      uploadedBy: "admin",
    }).populate("poster", "name email");

    if (!product) {
      return res.status(404).json({ message: "Admin product not found" });
    }

    return res.status(200).json({
      message: "Admin product retrieved successfully",
      product,
    });
  } catch (error: any) {
    console.error("Get One Admin Product Error:", error);
    return res.status(500).json({
      message: "Error retrieving admin product",
      error: error.message,
    });
  }
};

// Update Admin Product
export const updateAdminProduct = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const adminId = req.user._id;
    const updateData = req.body;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const product: any = await ProductModel.findOne({
      _id: productId,
      uploadedBy: "admin",
    });

    if (!product) {
      return res.status(404).json({ message: "Admin product not found" });
    }

    // Update product fields
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined) {
        product[key] = updateData[key];
      }
    });

    await product.save();

    return res.status(200).json({
      message: "Admin product updated successfully",
      product,
    });
  } catch (error: any) {
    console.error("Update Admin Product Error:", error);
    return res.status(500).json({
      message: "Error updating admin product",
      error: error.message,
    });
  }
};

// Delete Admin Product
export const deleteAdminProduct = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const product = await ProductModel.findOneAndDelete({
      _id: productId,
      uploadedBy: "admin",
    });

    if (!product) {
      return res.status(404).json({ message: "Admin product not found" });
    }

    return res.status(200).json({
      message: "Admin product deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete Admin Product Error:", error);
    return res.status(500).json({
      message: "Error deleting admin product",
      error: error.message,
    });
  }
};

// Get Admin Payments and Invoices
export const getAdminPaymentsAndInvoices = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;

    // Check if admin exists
    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Get all invoices for admin products
    const invoices = await InvoiceModel.find({
      posterRole: "admin",
    })
      .populate("order", "userId totalPrice status payStatus buyerInfo")
      .populate("poster", "name email")
      .sort({ createdAt: -1 });

    // Get payment summaries
    const paymentSummary = {
      totalRevenue: 0,
      successfulPayments: 0,
      pendingPayments: 0,
      failedPayments: 0,
    };

    invoices.forEach((invoice: any) => {
      paymentSummary.totalRevenue += invoice.amount || 0;
      if (invoice.status === "Paid") {
        paymentSummary.successfulPayments += 1;
      } else if (invoice.status === "Unpaid") {
        paymentSummary.pendingPayments += 1;
      } else {
        paymentSummary.failedPayments += 1;
      }
    });

    return res.status(200).json({
      message: "Admin payments and invoices retrieved successfully",
      invoices,
      paymentSummary,
    });
  } catch (error: any) {
    console.error("Get Admin Payments and Invoices Error:", error);
    return res.status(500).json({
      message: "Error retrieving admin payments and invoices",
      error: error.message,
    });
  }
};

// Edit Admin Profile
export const editAdminProfile = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;
    const { name, email } = req.body;

    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Handle profile image upload
    if (req.file) {
      try {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "admin/profiles", resource_type: "image" },
          async (error, result) => {
            if (error || !result) {
              console.error("Cloudinary Upload Error:", error);
              return res.status(500).json({
                message: "Profile image upload failed",
                error: error?.message || "Unknown error",
              });
            }

            admin.profileImage = result.secure_url;
            admin.name = name || admin.name;
            admin.email = email || admin.email;

            await admin.save();

            return res.status(200).json({
              message: "Admin profile updated successfully",
              data: admin,
            });
          },
        );
        uploadStream.end(req.file.buffer);
      } catch (uploadError: any) {
        console.error("Profile image upload error:", uploadError);
        return res.status(500).json({
          message: "Error uploading profile image",
          error: uploadError.message,
        });
      }
    } else {
      // No file upload, just update text fields
      admin.name = name || admin.name;
      admin.email = email || admin.email;
      await admin.save();

      return res.status(200).json({
        message: "Admin profile updated successfully",
        data: admin,
      });
    }
  } catch (error: any) {
    console.error("Edit Admin Profile Error:", error);
    return res.status(500).json({
      message: "Error updating admin profile",
      error: error.message,
    });
  }
};

export const editMbaayCommunityInfo = async (req: any, res: any) => {
  try {
    const adminId = req.user._id;
    const { name, description } = req.body;

    // Check if admin exists and has permission
    const admin = await adminModel.findById(adminId);
    if (!admin || (admin.role !== "Admin" && admin.role !== "Super Admin")) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Find Mbaay community
    const community = await VendorCommunityModel.findOne({ name: "Mbaay" });
    if (!community) {
      return res.status(404).json({ message: "Mbaay community not found" });
    }

    // Validate input
    if (!name && !description && !req.file) {
      return res.status(400).json({
        message:
          "At least one field (name, description, or logo) must be provided",
      });
    }

    // Update fields
    const updates: any = {};

    if (name) {
      // Check if name is already taken by another community
      const existingCommunity = await VendorCommunityModel.findOne({
        name,
        _id: { $ne: community._id },
      });
      if (existingCommunity) {
        return res.status(400).json({
          message: "Community name already exists",
        });
      }
      updates.name = name;
    }

    if (description) {
      updates.description = description;
    }

    // Handle logo upload if file is provided
    if (req.file) {
      try {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "community/logos", resource_type: "image" },
          async (error, result) => {
            if (error || !result) {
              console.error("Cloudinary Upload Error:", error);
              return res.status(500).json({
                message: "Logo upload failed",
                error: error?.message || "Unknown error",
              });
            }

            updates.community_Images = result.secure_url;
            await community.save();

            // Notify community members about info update
            if (community.members.length > 0) {
              const notifications = community.members.map((memberId: any) =>
                NotificationModel.create({
                  recipient: memberId,
                  type: "Community",
                  title: "Mbaay Community Updated",
                  message: `The Mbaay community information has been updated`,
                  isRead: false,
                  metadata: {
                    communityId: community._id,
                    updatedBy: adminId,
                    updatedAt: new Date(),
                  },
                }),
              );
              await Promise.all(notifications);
            }

            return res.status(200).json({
              message: "Mbaay community information updated successfully",
              data: community,
            });
          },
        );
        uploadStream.end(req.file.buffer);
      } catch (uploadError: any) {
        console.error("Logo upload error:", uploadError);
        return res.status(500).json({
          message: "Error uploading logo",
          error: uploadError.message,
        });
      }
    } else {
      // No file upload, just update text fields
      Object.assign(community, updates);
      await community.save();

      // Notify community members about info update
      if (community.members.length > 0) {
        const notifications = community.members.map((memberId: any) =>
          NotificationModel.create({
            recipient: memberId,
            type: "Community",
            title: "Mbaay Community Updated",
            message: `The Mbaay community information has been updated`,
            isRead: false,
            metadata: {
              communityId: community._id,
              updatedBy: adminId,
              updatedAt: new Date(),
            },
          }),
        );
        await Promise.all(notifications);
      }

      return res.status(200).json({
        message: "Mbaay community information updated successfully",
        data: community,
      });
    }
  } catch (error: any) {
    console.error("Edit Mbaay Community Info Error:", error);
    return res.status(500).json({
      message: "Error updating community information",
      error: error.message,
    });
  }
};

export const refreshTokenAdmin = async (req: Request, res: any) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    // Verify refresh token
    const decoded: any = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || EnvironmentVariables.JWT_SECRET,
    );

    // Find admin by ID and check if refresh token matches
    const admin = await adminModel.findById(decoded._id);
    if (!admin || admin.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { _id: admin._id, name: admin.name, role: admin.role },
      EnvironmentVariables.JWT_SECRET,
      { expiresIn: "15m" },
    );

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken,
    });
  } catch (error: any) {
    return res
      .status(401)
      .json({ message: "Invalid refresh token", error: error.message });
  }
};
