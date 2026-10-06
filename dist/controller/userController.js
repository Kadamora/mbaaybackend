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
exports.clearAllOrdersCompletely = exports.verifyOtpAndResetPassword = exports.forgetPassword = exports.allUsers = exports.getUserOrders = exports.findOneUser = exports.loginUser = exports.resentOtp = exports.verifyOtp = exports.create_user = exports.googleAuthUser = void 0;
const path_1 = __importDefault(require("path"));
const userModel_1 = require("../model/userModel");
const email_1 = require("../config/email");
const ejs_1 = __importDefault(require("ejs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const axios_1 = __importDefault(require("axios"));
const orderModel_1 = require("../model/orderModel");
const vendorModel_1 = require("../model/vendorModel");
const google_auth_library_1 = require("google-auth-library");
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const communityModel_1 = require("../model/communityModel");
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_ID);
const googleAuthUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.body;
        const ticket = yield client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            return res.status(400).json({ message: "Invalid Google token" });
        }
        const { email, name, picture } = payload;
        let user = yield userModel_1.userModel.findOne({ email });
        if (!user) {
            user = yield userModel_1.userModel.create({
                name: name || email.split("@")[0],
                email,
                password: null,
                avatar: picture,
                isVerified: true,
            });
        }
        const authToken = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email, role: "user" }, process.env.JWT_SECRET, { expiresIn: "7d" });
        return res.status(200).json({
            message: "Google authentication successful",
            token: authToken,
            data: user,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Google authentication failed",
            error: error.message,
        });
    }
});
exports.googleAuthUser = googleAuthUser;
const create_user = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const Salt = yield bcryptjs_1.default.genSalt(10);
        const hashPassword = yield bcryptjs_1.default.hash(password, Salt);
        const new_user = yield userModel_1.userModel.create({
            name,
            email,
            password: hashPassword,
            phoneNumber,
            verificationCode: randomNumber,
        });
        const emailTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "Send_otp.ejs");
        yield (0, email_1.sendMail)(new_user.email, "Verify Your Account with This OTP", yield ejs_1.default.renderFile(emailTemplatePath, {
            otp: randomNumber,
            name: new_user.name,
        }));
        return res
            .status(200)
            .json({ message: "Mail sent successfully", data: new_user });
    }
    catch (error) {
        return res
            .status(404)
            .json({ message: "An error occured", data: error.message });
    }
});
exports.create_user = create_user;
const verifyOtp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { otp } = req.body;
        let checkOtp = yield userModel_1.userModel.findById(req.params.id);
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
        if (otp !== checkOtp.verificationCode) {
            return res.status(404).json({
                message: "Incorrect Otp",
            });
        }
        console.log(checkOtp.verificationCode);
        const emailTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "welcome.ejs");
        yield (0, email_1.sendMail)(checkOtp.email, "Welcome to Mbaay", yield ejs_1.default.renderFile(emailTemplatePath, { userName: checkOtp.name }));
        checkOtp.isverified = true;
        yield checkOtp.save();
        // Automatically add user to Mbaay community
        try {
            const mbaayCommunity = yield communityModel_1.VendorCommunityModel.findOne({
                name: "Mbaay",
            });
            if (mbaayCommunity &&
                !mbaayCommunity.members.some((member) => member.toString() === checkOtp._id.toString())) {
                mbaayCommunity.members.push(checkOtp._id);
                yield mbaayCommunity.save();
                console.log(`User ${checkOtp.name} automatically added to Mbaay community`);
            }
        }
        catch (error) {
            console.error("Error adding user to Mbaay community:", error);
        }
        return res.status(200).json({
            message: `Successfully signed in ${checkOtp.name}`,
            data: checkOtp,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "An error occurred",
            error: error.message,
        });
    }
});
exports.verifyOtp = verifyOtp;
const resentOtp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const getUser = yield userModel_1.userModel.findById(userId);
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
        const randomNumber = generateOTP();
        getUser.verificationCode = randomNumber;
        yield getUser.save();
        const emailTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "Send_otp.ejs");
        yield (0, email_1.sendMail)(getUser.email, "Mbaay Verification Code", yield ejs_1.default.renderFile(emailTemplatePath, {
            otp: randomNumber,
            name: getUser.name,
        }));
        return res.status(200).json({
            message: `OTP resent to ${getUser.email} successfully`,
            data: getUser,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "An error occurred",
            error: error.message,
        });
    }
});
exports.resentOtp = resentOtp;
const loginUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const user = yield userModel_1.userModel.findOne(query);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const isPasswordValid = yield bcryptjs_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials." });
        }
        // 🔍 Get IP Address
        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
        // 🌍 Fetch City and Country from IP
        const locationResponse = yield axios_1.default.get(`http://ip-api.com/json/${ip}`);
        const { city, country } = locationResponse.data;
        user.country = `${city},${country}`;
        // 🔐 Generate Token
        const token = jsonwebtoken_1.default.sign({ userId: user._id }, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });
        return res.status(200).json({
            message: "Login successful",
            token,
            user: Object.assign(Object.assign({}, user.toObject()), { location: { city, country } }),
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
});
exports.loginUser = loginUser;
const findOneUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const getOneUser = yield userModel_1.userModel
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
    }
    catch (error) {
        console.error("Error fetching user details:", error);
        // Return an internal server error response
        return res.status(500).json({
            message: "An error occurred while fetching user details",
            error: error.message,
        });
    }
});
exports.findOneUser = findOneUser;
const getUserOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const shopperId = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : (_c = req.user) === null || _c === void 0 ? void 0 : _c._id;
        if (!shopperId) {
            return res.status(401).json({ message: "Unauthenticated request" });
        }
        // FIX 1: Query Order directly using userId (correct direction)
        let orders = yield orderModel_1.OrderModel.find({ userId: shopperId })
            .populate({
            path: "items.product",
            model: "products",
            select: "name images price poster storeName", // Now you will see name & images
        })
            .sort({ createdAt: -1 });
        // If no orders as buyer, check if it's a vendor buying something
        if (!orders || orders.length === 0) {
            orders = yield orderModel_1.OrderModel.find({
                _id: {
                    $in: ((_d = (yield vendorModel_1.vendorModel
                        .findById(shopperId)
                        .select("my_bought_products_orders"))) === null || _d === void 0 ? void 0 : _d.my_bought_products_orders) || [],
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
        const isVendor = yield vendorModel_1.vendorModel.findById(shopperId);
        const accountType = isVendor ? "vendor" : "user";
        return res.status(200).json({
            success: true,
            accountType,
            message: orders.length > 0 ? "Orders fetched successfully" : "No orders found",
            orders: orders || [],
        });
    }
    catch (err) {
        console.error("Get Orders Error:", err);
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
});
exports.getUserOrders = getUserOrders;
const allUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield userModel_1.userModel.find();
        return res.status(200).json({
            message: "All users fetched successfully",
            data: users,
        });
    }
    catch (error) {
        console.error("Get Orders Error:", error);
        return res
            .status(500)
            .json({ message: "Server error", error: error.message });
    }
});
exports.allUsers = allUsers;
const forgetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        const user = yield userModel_1.userModel.findOne({ email });
        if (!user)
            return res.status(404).json({ message: "user not found" });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otpCode = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        yield user.save();
        const emailTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "Send_otp.ejs");
        yield (0, email_1.sendMail)(user.email, "Password Reset OTP", yield ejs_1.default.renderFile(emailTemplatePath, {
            otp: otp,
            name: user.name,
        }));
        // Notify user about OTP generation
        yield notificationsModel_1.default.create({
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
    }
    catch (error) {
        return res.status(500).json({
            message: "Failed to send OTP",
            error: error.message,
        });
    }
});
exports.forgetPassword = forgetPassword;
const verifyOtpAndResetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const user = yield userModel_1.userModel.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "us not found" });
        }
        if (user.otpCode !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }
        if (user.otpExpires && user.otpExpires < new Date()) {
            return res.status(400).json({ message: "OTP has expired" });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        user.password = hashedPassword;
        user.otpCode = null;
        user.otpExpires = null;
        yield user.save();
        // Notify us about successful password reset
        yield notificationsModel_1.default.create({
            recipient: user._id,
            type: "System",
            title: "Password Reset Successful",
            message: `Your password has been successfully reset.`,
            isRead: false,
            metadata: { userId: user._id },
        });
        return res.status(200).json({ message: "Password reset successful" });
    }
    catch (error) {
        return res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
});
exports.verifyOtpAndResetPassword = verifyOtpAndResetPassword;
const clearAllOrdersCompletely = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Starting FULL order cleanup...");
        // 1. Delete ALL orders from Order collection
        const orderResult = yield orderModel_1.OrderModel.deleteMany({});
        console.log(`Deleted ${orderResult.deletedCount} orders from Order collection`);
        // 2. Clear orders array from ALL users
        const userResult = yield userModel_1.userModel.updateMany({}, { $set: { orders: [] } });
        console.log(`Cleared orders array from ${userResult.modifiedCount} users`);
        // 3. Clear my_bought_products_orders from ALL vendors
        const vendorResult = yield vendorModel_1.vendorModel.updateMany({}, { $set: { my_bought_products_orders: [], orders: [] } });
        console.log(`Cleared my_bought_products_orders from ${vendorResult.modifiedCount} vendors`);
        // 4. Optional: Also clear any notifications related to orders (if you have a notifications model)
        yield notificationsModel_1.default.deleteMany({
            "metadata.orderId": { $exists: true },
        });
        console.log("FULL ORDER CLEANUP COMPLETED SUCCESSFULLY!");
        console.log("Database is now 100% clean - no orders anywhere.");
    }
    catch (error) {
        console.error("Failed during full order cleanup:", error.message);
        throw error;
    }
});
exports.clearAllOrdersCompletely = clearAllOrdersCompletely;
