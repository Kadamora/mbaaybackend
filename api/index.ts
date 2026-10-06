import express, { Application } from "express";
import { DbConnect } from "../config/db";
import userRouter from "../router/userRouter";
import vendorRouter from "../router/vendorRouter";
import adminRouter from "../router/adminRouter";
import "../config/cronjob";
import cors from "cors";
import communityRouter from "../router/communityRouter";
import productRouter from "../router/productsRouter";
import orderRouter from "../router/orderRouter";
import chatRouter from "../router/chatRouter";
import http from "http";
import { Server } from "socket.io";
import notificationRouter from "../router/notificationsRouter";
import reviewRouter from "../router/reviewRouter";
import { createMbaayCommunityOnStartup } from "../controller/adminController";
import { vendorModel } from "../model/vendorModel";
import { ProductModel } from "../model/productsModel";

/**
 * ✅ Startup function to enable verified: true for products from active vendors and Starter plan vendors
 */
const enableVerifiedProductsOnStartup = async () => {
  try {
    console.log(
      "🚀 Enabling verified products for active vendors and Starter plan vendors...",
    );

    // Get all vendors that should have verified products
    const activeVendors = await vendorModel.find({
      $or: [
        { "subscription.status": "Active" }, // Active subscribed vendors
        { storeType: "Starter" }, // Starter plan vendors
      ],
      verificationStatus: "Approved",
    });

    let totalEnabled = 0;

    for (const vendor of activeVendors) {
      if (vendor.subscription?.status === "Active") {
        // Active subscribed vendors: verify ALL products
        const result = await ProductModel.updateMany(
          { poster: vendor._id },
          { verified: true },
        );
        totalEnabled += result.modifiedCount;
        if (result.modifiedCount > 0) {
          console.log(
            `✅ Enabled ${result.modifiedCount} products for active vendor: ${vendor.storeName}`,
          );
        }
      } else if (vendor.storeType === "Starter") {
        // Starter plan vendors: verify only products that match their craft categories
        const allowedCategories = vendor.craftCategories || [];
        if (allowedCategories.length > 0) {
          const result = await ProductModel.updateMany(
            {
              poster: vendor._id,
              category: { $in: allowedCategories },
            },
            { verified: true },
          );
          totalEnabled += result.modifiedCount;
          if (result.modifiedCount > 0) {
            console.log(
              `✅ Enabled ${result.modifiedCount} Starter category products for vendor: ${vendor.storeName}`,
            );
          }
        }
      }
    }

    console.log(
      `🎉 Enabled verified status for ${totalEnabled} products from active vendors and Starter plan vendors`,
    );
  } catch (error: any) {
    console.error(
      "❌ Error enabling verified products on startup:",
      error.message,
    );
  }
};

const app: Application = express();
const port = process.env.PORT || 2013;

DbConnect();

// Initialize Mbaay community and enable verified products on startup
(async () => {
  // await createMbaayCommunityOnStartup();
  await enableVerifiedProductsOnStartup();
})();

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  path: "/socket.io",
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  socket.on("joinChat", (chatId) => {
    socket.join(chatId);
    console.log(`✅ Joined chat room ${chatId}`);
  });

  socket.on("leaveChat", (chatId) => {
    socket.leave(chatId);
    console.log(`🚪 Left chat room ${chatId}`);
  });

  socket.on("newMessage", (msg) => {
    console.log("📩", msg);
    io.to(msg.chatId).emit("newMessage", msg);
  });

  socket.on("messageEdited", (msg) => {
    console.log("✏️ edited:", msg);
    io.to(msg.chatId).emit("messageEdited", msg);
  });

  socket.on("messageDeleted", (id) => {
    console.log("🗑️ deleted:", id);
    io.to(id.chatId).emit("messageDeleted", id);
  });

  socket.on("customerCareChatStarted", (chat) => {
    console.log("🆕 New Chat:", chat);
    io.to(chat._id).emit("customerCareChatStarted", chat);
  });

  socket.on("customerCareMessage", (msg) => {
    console.log("📩 CC Message:", msg);
    io.to(msg.chatId).emit("customerCareMessage", msg);
  });

  socket.on("chatStarted", (chat) => {
    console.log("🆕 New chat started:", chat);
    io.to(chat._id).emit("chatStarted", chat);
  });

  socket.on("typing", ({ chatId, sender }) => {
    console.log(`💬 ${sender} is typing in chat ${chatId}`);
    socket.to(chatId).emit("typing", { sender, chatId });
  });

  socket.on("stopTyping", ({ chatId, sender }) => {
    console.log(`🛑 ${sender} stopped typing in chat ${chatId}`);
    socket.to(chatId).emit("stopTyping", { sender, chatId });
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

app.use(express.json());
app.use(cors());

app.use("/api/v1/user", userRouter);
app.use("/api/v1/vendor", vendorRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/community", communityRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/reviews", reviewRouter);

server.listen(port, () => console.log(`🚀 Server running on port ${port}`));
