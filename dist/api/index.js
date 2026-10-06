"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../config/db");
const userRouter_1 = __importDefault(require("../router/userRouter"));
const vendorRouter_1 = __importDefault(require("../router/vendorRouter"));
const adminRouter_1 = __importDefault(require("../router/adminRouter"));
require("../config/cronjob");
const cors_1 = __importDefault(require("cors"));
const communityRouter_1 = __importDefault(require("../router/communityRouter"));
const productsRouter_1 = __importDefault(require("../router/productsRouter"));
const orderRouter_1 = __importDefault(require("../router/orderRouter"));
const chatRouter_1 = __importDefault(require("../router/chatRouter"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const notificationsRouter_1 = __importDefault(require("../router/notificationsRouter"));
const reviewRouter_1 = __importDefault(require("../router/reviewRouter"));
const vendorModel_1 = require("../model/vendorModel");
const productsModel_1 = require("../model/productsModel");
/**
 * ✅ Startup function to enable verified: true for products from active vendors and Starter plan vendors
 */
const enableVerifiedProductsOnStartup = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log("🚀 Enabling verified products for active vendors and Starter plan vendors...");
        // Get all vendors that should have verified products
        const activeVendors = yield vendorModel_1.vendorModel.find({
            $or: [
                { "subscription.status": "Active" }, // Active subscribed vendors
                { storeType: "Starter" }, // Starter plan vendors
            ],
            verificationStatus: "Approved",
        });
        let totalEnabled = 0;
        for (const vendor of activeVendors) {
            if (((_a = vendor.subscription) === null || _a === void 0 ? void 0 : _a.status) === "Active") {
                // Active subscribed vendors: verify ALL products
                const result = yield productsModel_1.ProductModel.updateMany({ poster: vendor._id }, { verified: true });
                totalEnabled += result.modifiedCount;
                if (result.modifiedCount > 0) {
                    console.log(`✅ Enabled ${result.modifiedCount} products for active vendor: ${vendor.storeName}`);
                }
            }
            else if (vendor.storeType === "Starter") {
                // Starter plan vendors: verify only products that match their craft categories
                const allowedCategories = vendor.craftCategories || [];
                if (allowedCategories.length > 0) {
                    const result = yield productsModel_1.ProductModel.updateMany({
                        poster: vendor._id,
                        category: { $in: allowedCategories },
                    }, { verified: true });
                    totalEnabled += result.modifiedCount;
                    if (result.modifiedCount > 0) {
                        console.log(`✅ Enabled ${result.modifiedCount} Starter category products for vendor: ${vendor.storeName}`);
                    }
                }
            }
        }
        console.log(`🎉 Enabled verified status for ${totalEnabled} products from active vendors and Starter plan vendors`);
    }
    catch (error) {
        console.error("❌ Error enabling verified products on startup:", error.message);
    }
});
const app = (0, express_1.default)();
const port = process.env.PORT || 2013;
(0, db_1.DbConnect)();
// Initialize Mbaay community and enable verified products on startup
(() => __awaiter(void 0, void 0, void 0, function* () {
    // await createMbaayCommunityOnStartup();
    yield enableVerifiedProductsOnStartup();
}))();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
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
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.use("/api/v1/user", userRouter_1.default);
app.use("/api/v1/vendor", vendorRouter_1.default);
app.use("/api/v1/admin", adminRouter_1.default);
app.use("/api/v1/community", communityRouter_1.default);
app.use("/api/v1/products", productsRouter_1.default);
app.use("/api/v1/order", orderRouter_1.default);
app.use("/api/v1/chat", chatRouter_1.default);
app.use("/api/v1/notifications", notificationsRouter_1.default);
app.use("/api/v1/reviews", reviewRouter_1.default);
server.listen(port, () => console.log(`🚀 Server running on port ${port}`));
