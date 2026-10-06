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
exports.refreshTokenVendor = exports.uploadWorkTools = exports.uploadBusinessVideo = exports.changeStoreDetails = exports.verifyEmailChange = exports.changeEmailAddress = exports.changeLocation = exports.changePassword = exports.uploadKYC = exports.getVendorStats = exports.getVendorPayments = exports.getVendorCustomers = exports.getVendorInvoices = exports.verifyOtpAndResetPassword = exports.forgetPassword = exports.create_recipient_code = exports.getCraftCategories = exports.updateVendorSettings = exports.upload_businessLogo = exports.upload_avatar = exports.get_all_vendors = exports.verifySubscriptionPayment = exports.upgradeSubscription = exports.uploadReturnPolicy = exports.find_one_vendor = exports.login_vendor = exports.create_vendor = exports.googleCompleteSignup = exports.googleVerify = void 0;
const path_1 = __importDefault(require("path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const vendorModel_1 = require("../model/vendorModel");
const userModel_1 = require("../model/userModel");
const email_1 = require("../config/email");
const ejs_1 = __importDefault(require("ejs"));
const adminModel_1 = require("../model/adminModel");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const environmentVariables_1 = require("../Environment/environmentVariables");
const cloudinary_1 = require("../config/cloudinary");
const axios_1 = __importDefault(require("axios"));
const invoiceModel_1 = require("../model/invoiceModel");
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const google_auth_library_1 = require("google-auth-library");
const communityModel_1 = require("../model/communityModel");
const PAYSTACK_SECRET_KEY = "sk_live_8e60afeb1befc22f297e02606b679decd84dbeb4";
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_ID);
const accountTypeLimits = {
    Starter: 1,
    "Starter plus": 1,
    Shelf: 2,
    Counter: 3,
    Shop: 5,
    Premium: 13,
};
const subscriptionRanks = [
    "Starter",
    "Starter plus",
    "Shelf",
    "Counter",
    "Shop",
    "Premium",
];
const planPricing = {
    "Starter plus": {
        Monthly: 100,
        Quarterly: 8000,
        HalfYearly: 15000,
        Yearly: 20000,
    },
    Shelf: { Monthly: 5000, Quarterly: 13500, HalfYearly: 25500, Yearly: 48000 },
    Counter: {
        Monthly: 7500,
        Quarterly: 20250,
        HalfYearly: 38250,
        Yearly: 72000,
    },
    Shop: { Monthly: 12000, Quarterly: 32400, HalfYearly: 61200, Yearly: 115200 },
    Premium: {
        Monthly: 20000,
        Quarterly: 54000,
        HalfYearly: 102000,
        Yearly: 192000,
    },
};
const cycleMonths = {
    Monthly: 1,
    Quarterly: 3,
    HalfYearly: 6,
    Yearly: 12,
};
const googleVerify = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.body;
        const ticket = yield client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload)
            return res.status(400).json({ message: "Invalid Google token" });
        const { email, name, picture } = payload;
        let vendor = yield vendorModel_1.vendorModel.findOne({ email });
        if (vendor) {
            const authToken = jsonwebtoken_1.default.sign({ id: vendor._id, email: vendor.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
            return res.status(200).json({
                message: "Login successful",
                token: authToken,
                vendor,
            });
        }
        const tempToken = jsonwebtoken_1.default.sign({ email, name, picture }, process.env.JWT_SECRET, { expiresIn: "30m" });
        return res.status(200).json({
            message: "Google verified. Please complete profile.",
            tempToken,
            user: { email, name, picture },
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Verification failed", error: error.message });
    }
});
exports.googleVerify = googleVerify;
const googleCompleteSignup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { storeName, craftCategories, storePhone } = req.body;
        const { tempToken } = req.body;
        // Verify tempToken
        const decoded = jsonwebtoken_1.default.verify(tempToken, process.env.JWT_SECRET);
        const { email, name, picture } = decoded;
        // Double check not already created
        let vendor = yield vendorModel_1.vendorModel.findOne({ email });
        if (vendor) {
            return res.status(400).json({ message: "Vendor already exists" });
        }
        const admins = yield adminModel_1.adminModel.find({ role: "Admin" });
        if (admins.length === 0) {
            return res
                .status(400)
                .json({ message: "No admin found. Cannot create vendor." });
        }
        // Create vendor with details
        vendor = yield vendorModel_1.vendorModel.create({
            email,
            userName: name,
            avatar: picture,
            storeName,
            storePhone,
            craftCategories,
            password: "GOOGLE_AUTH",
            authProvider: "google",
            verificationStatus: "Pending",
        });
        // Assign admin
        const randomAdmin = admins[Math.floor(Math.random() * admins.length)];
        randomAdmin.requests.push(vendor._id);
        yield randomAdmin.save();
        yield notificationsModel_1.default.create({
            recipient: vendor._id,
            type: "System",
            title: "Vendor Account Created",
            message: `Your vendor account for ${storeName} has been created and is pending admin approval.`,
            isRead: false,
            metadata: { vendorId: vendor._id },
        });
        yield notificationsModel_1.default.create({
            recipient: randomAdmin._id,
            sender: vendor._id,
            type: "System",
            title: "New Vendor Registration",
            message: `A new vendor "${storeName}" has registered via Google and is awaiting your approval.`,
            isRead: false,
            metadata: { vendorId: vendor._id },
        });
        yield vendor.save();
        // Automatically add vendor to Mbaay community
        try {
            const mbaayCommunity = yield communityModel_1.VendorCommunityModel.findOne({
                name: "Mbaay",
            });
            if (mbaayCommunity &&
                !mbaayCommunity.members.some((member) => member.toString() === vendor._id.toString())) {
                mbaayCommunity.members.push(vendor._id);
                yield mbaayCommunity.save();
                console.log(`Vendor ${vendor.storeName} automatically added to Mbaay community`);
            }
        }
        catch (error) {
            console.error("Error adding vendor to Mbaay community:", error);
        }
        const authToken = jsonwebtoken_1.default.sign({ _id: vendor._id, email: vendor.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        return res.status(200).json({
            message: "Vendor created successfully",
            token: authToken,
            vendor,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Signup failed", error: error.message });
    }
});
exports.googleCompleteSignup = googleCompleteSignup;
const create_vendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { storeName, email, userName, address1, address2, country, city, state, postcode, storePhone, password, craftCategories, businessDescription, } = req.body;
        const admins = yield adminModel_1.adminModel.find({ role: "Admin" });
        if (admins.length === 0) {
            return res
                .status(400)
                .json({ message: "No admin found. Cannot create vendor." });
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashPassword = yield bcryptjs_1.default.hash(password, salt);
        // Create the vendor
        const new_user = yield vendorModel_1.vendorModel.create({
            storeName,
            email,
            password: hashPassword,
            userName,
            address1,
            address2,
            country,
            city,
            state,
            postcode,
            storePhone,
            craftCategories,
            businessDescription,
            verificationStatus: "Pending",
        });
        // Select a random admin
        const randomAdmin = admins[Math.floor(Math.random() * admins.length)];
        randomAdmin.requests.push(new_user._id);
        yield randomAdmin.save();
        // Notify vendor about account creation
        yield notificationsModel_1.default.create({
            recipient: new_user._id,
            type: "System",
            title: "Vendor Account Created",
            message: `Your vendor account for ${storeName} has been created and is pending admin approval.`,
            isRead: false,
            metadata: { vendorId: new_user._id },
        });
        // Notify admin about new vendor registration
        yield notificationsModel_1.default.create({
            recipient: randomAdmin._id,
            sender: new_user._id,
            type: "System",
            title: "New Vendor Registration",
            message: `A new vendor "${storeName}" has registered and is awaiting your approval.`,
            isRead: false,
            metadata: { vendorId: new_user._id },
        });
        yield new_user.save();
        // Automatically add vendor to Mbaay community
        try {
            const mbaayCommunity = yield communityModel_1.VendorCommunityModel.findOne({
                name: "Mbaay",
            });
            if (mbaayCommunity &&
                !mbaayCommunity.members.some((member) => member.toString() === new_user._id.toString())) {
                mbaayCommunity.members.push(new_user._id);
                yield mbaayCommunity.save();
                console.log(`Vendor ${new_user.storeName} automatically added to Mbaay community`);
            }
        }
        catch (error) {
            console.error("Error adding vendor to Mbaay community:", error);
        }
        return res.status(200).json({
            message: "Vendor created and assigned to an admin for approval",
            data: new_user,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "An error occurred",
            error: error.message,
        });
    }
});
exports.create_vendor = create_vendor;
const login_vendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const vendor = yield vendorModel_1.vendorModel.findOne(query).select("-verificationCode");
        if (!vendor) {
            return res
                .status(404)
                .json({ message: "Invalid email or phone number." });
        }
        const isPasswordValid = yield bcryptjs_1.default.compare(password, vendor.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials." });
        }
        if (vendor.verificationStatus !== "Approved") {
            // Notify vendor about unverified status
            yield notificationsModel_1.default.create({
                recipient: vendor._id,
                type: "System",
                title: "Login Attempt",
                message: `Your account is not yet verified. Please wait for admin approval.`,
                isRead: false,
                metadata: { vendorId: vendor._id },
            });
            return res.status(200).json({
                message: "You have not been verified",
            });
        }
        const accessToken = jsonwebtoken_1.default.sign({ _id: vendor._id, email: vendor.email, role: "vendor" }, environmentVariables_1.EnvironmentVariables.JWT_SECRET, { expiresIn: "15m" });
        const refreshToken = jsonwebtoken_1.default.sign({ _id: vendor._id }, process.env.JWT_REFRESH_SECRET || environmentVariables_1.EnvironmentVariables.JWT_SECRET, {
            expiresIn: "7d",
        });
        // Store refresh token in DB
        vendor.refreshToken = refreshToken;
        yield vendor.save();
        // Notify vendor about successful login
        yield notificationsModel_1.default.create({
            recipient: vendor._id,
            type: "System",
            title: "Login Successful",
            message: `You have successfully logged into your vendor account.`,
            isRead: false,
            metadata: { vendorId: vendor._id },
        });
        return res.status(200).json({
            message: "Successfully logged in.",
            accessToken,
            refreshToken,
            user: { id: vendor._id, name: vendor.userName },
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "An error occurred",
            error: error.message,
        });
    }
});
exports.login_vendor = login_vendor;
const find_one_vendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const get_one_vendor = yield vendorModel_1.vendorModel
            .findById(req.user._id)
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
    }
    catch (error) {
        return res.status(500).json({
            message: "An error occurred",
            error: error.message,
        });
    }
});
exports.find_one_vendor = find_one_vendor;
const uploadReturnPolicy = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        // Find vendor
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({
                message: "Vendor not found",
            });
        }
        // Check file
        if (!req.file) {
            return res.status(400).json({
                message: "No file uploaded",
            });
        }
        // Upload to Cloudinary
        const cloudImg = yield cloudinary_1.cloudinary.uploader.upload(req.file.path, {
            resource_type: "raw",
            folder: "vendor/return_policies",
        });
        // Save URL
        vendor.returnPolicy = cloudImg === null || cloudImg === void 0 ? void 0 : cloudImg.secure_url;
        yield vendor.save();
        // Notification
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Return Policy Uploaded",
            message: "Your return policy has been successfully uploaded.",
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "Return policy uploaded successfully",
            data: vendor,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error uploading return policy",
            error: error.message,
        });
    }
});
exports.uploadReturnPolicy = uploadReturnPolicy;
const upgradeSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { newPlan, newCategories = [], billingCycle = "Monthly" } = req.body;
        // ✅ Validate new plan
        if (!newPlan || !subscriptionRanks.includes(newPlan)) {
            return res.status(400).json({
                message: "Invalid subscription plan. Choose 'Starter', 'Starter plus' 'Shelf', 'Counter', or 'Shop'. , or 'Premium'",
            });
        }
        if (!planPricing[newPlan] || !planPricing[newPlan][billingCycle]) {
            return res.status(400).json({
                message: "Invalid billing cycle. Use Monthly, Quarterly, HalfYearly, or Yearly.",
            });
        }
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor)
            return res.status(404).json({ message: "Vendor not found" });
        const currentIndex = subscriptionRanks.indexOf(vendor.storeType);
        const newIndex = subscriptionRanks.indexOf(newPlan);
        if (newIndex <= currentIndex) {
            return res.status(400).json({
                message: "You can only upgrade to a higher plan.",
            });
        }
        // ✅ Enforce category limits
        const maxCategories = accountTypeLimits[newPlan];
        const existingCategories = vendor.craftCategories || [];
        const combinedCategories = [
            ...new Set([...existingCategories, ...newCategories]),
        ];
        if (combinedCategories.length > maxCategories) {
            return res.status(400).json({
                message: `The ${newPlan} plan allows up to ${maxCategories} categories. You currently have ${existingCategories.length}. You can only add ${maxCategories - existingCategories.length} more.`,
            });
        }
        // ✅ Calculate price in kobo
        const amount = planPricing[newPlan][billingCycle] * 100;
        // ✅ Initialize Paystack payment
        const response = yield axios_1.default.post("https://api.paystack.co/transaction/initialize", {
            email: vendor.email,
            amount,
            metadata: { vendorId, newPlan, billingCycle, newCategories },
            callback_url: "https://mbaay.com/subscription-callback",
        }, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        });
        return res.status(200).json({
            success: true,
            authorizationUrl: response.data.data.authorization_url,
            reference: response.data.data.reference,
            message: `Proceed to payment to upgrade to ${newPlan} (${billingCycle}).`,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error upgrading subscription",
            error: error.message,
        });
    }
});
exports.upgradeSubscription = upgradeSubscription;
const verifySubscriptionPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { reference } = req.query;
        if (!reference) {
            return res.status(400).json({ message: "Payment reference is required" });
        }
        // ✅ Verify with Paystack
        const response = yield axios_1.default.get(`https://api.paystack.co/transaction/verify/${reference}`, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } });
        const paymentData = response.data.data;
        if (paymentData.status !== "success") {
            return res.status(400).json({ message: "Payment not successful" });
        }
        const { vendorId, newPlan, billingCycle, newCategories } = paymentData.metadata;
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        const months = cycleMonths[billingCycle] || 1;
        const startDate = new Date();
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + months);
        const existingCategories = vendor.craftCategories || [];
        const maxCategories = accountTypeLimits[newPlan];
        const combinedCategories = [
            ...new Set([...existingCategories, ...(newCategories || [])]),
        ].slice(0, maxCategories);
        vendor.storeType = newPlan;
        vendor.craftCategories = combinedCategories;
        vendor.subscription = {
            currentPlan: newPlan,
            billingCycle,
            status: "Active",
            startDate,
            expiryDate,
            lastPaymentReference: reference,
        };
        yield vendor.save();
        yield notificationsModel_1.default.create({
            recipient: vendor._id,
            type: "System",
            title: "Subscription Activated 🎉",
            message: `Your ${newPlan} (${billingCycle}) subscription is now active until ${expiryDate.toDateString()}.`,
            isRead: false,
            metadata: { vendorId: vendor._id, newPlan, billingCycle },
        });
        return res.status(200).json({
            success: true,
            message: "Subscription activated successfully",
            subscription: vendor.subscription,
        });
    }
    catch (error) {
        console.error("Verification error:", error.message);
        return res.status(500).json({
            message: "Error verifying subscription payment",
            error: error.message,
        });
    }
});
exports.verifySubscriptionPayment = verifySubscriptionPayment;
// export const upgradeSubscription = async (req: any, res: any) => {
//   try {
//     const vendorId = req.user._id;
//     const { newPlan, newCategories = [] } = req.body;
//     if (!newPlan || !subscriptionRanks.includes(newPlan)) {
//       return res.status(400).json({
//         message:
//           "Invalid subscription plan. Choose 'Starter', 'Shelf', 'Counter', or 'Shop'.",
//       });
//     }
//     const vendor = await vendorModel.findById(vendorId);
//     if (!vendor) {
//       return res.status(404).json({ message: "Vendor not found" });
//     }
//     const currentIndex = subscriptionRanks.indexOf(vendor.storeType);
//     const newIndex = subscriptionRanks.indexOf(newPlan);
//     if (newIndex <= currentIndex) {
//       return res.status(400).json({
//         message: "You can only upgrade to a higher plan.",
//       });
//     }
//     // Get the limit for the new plan
//     const maxCategories = accountTypeLimits[newPlan];
//     // Merge existing and new categories, avoiding duplicates
//     const existingCategories = vendor.craftCategories || [];
//     const combinedCategories = [
//       ...new Set([...existingCategories, ...newCategories]),
//     ];
//     // Enforce the new category limit
//     if (combinedCategories.length > maxCategories) {
//       return res.status(400).json({
//         message: `The ${newPlan} plan allows up to ${maxCategories} categories. You currently have ${
//           existingCategories.length
//         }. You can only add ${maxCategories - existingCategories.length} more.`,
//       });
//     }
//     // Update store type and craft categories
//     vendor.storeType = newPlan;
//     vendor.craftCategories = combinedCategories;
//     await vendor.save();
//     // Notify vendor about subscription upgrade
//     await NotificationModel.create({
//       recipient: vendorId,
//       type: "System",
//       title: "Subscription Upgraded",
//       message: `Your subscription has been upgraded to the ${newPlan} plan.`,
//       isRead: false,
//       metadata: { vendorId, newPlan },
//     });
//     return res.status(200).json({
//       message: `Successfully upgraded to ${newPlan} plan.`,
//       newPlan: vendor.storeType,
//       craftCategories: vendor.craftCategories,
//     });
//   } catch (error: any) {\
//     return res.status(500).json({
//       message: "Error upgrading subscription",
//       error: error.message,
//     });
//   }
// };
const get_all_vendors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const get_all_vendors = yield vendorModel_1.vendorModel
            .find({
            verificationStatus: "Approved",
        })
            .populate("products")
            .populate({
            path: "communityPosts",
            populate: {
                path: "community",
                model: "community",
            },
        });
        // Fully populate community posts
        for (const vendor of get_all_vendors) {
            for (const post of vendor.communityPosts) {
                // Populate poster
                if (post.posterType === "vendors") {
                    post.poster = yield vendorModel_1.vendorModel
                        .findById(post.poster)
                        .select("storeName userName avatar email");
                }
                else if (post.posterType === "community") {
                    post.poster = yield communityModel_1.VendorCommunityModel.findById(post.poster).select("name description community_Images");
                }
                // Populate likes
                const populatedLikes = [];
                for (const likeId of post.likes) {
                    if (post.likeType === "vendors") {
                        const likeUser = yield vendorModel_1.vendorModel
                            .findById(likeId)
                            .select("storeName userName avatar");
                        if (likeUser)
                            populatedLikes.push(likeUser);
                    }
                    else if (post.likeType === "community") {
                        const likeUser = yield communityModel_1.VendorCommunityModel.findById(likeId).select("name description");
                        if (likeUser)
                            populatedLikes.push(likeUser);
                    }
                }
                post.likes = populatedLikes;
                // Populate tags
                const populatedTags = [];
                for (const tag of post.tags) {
                    let taggedUser = null;
                    if (tag.tagType === "vendors") {
                        taggedUser = yield vendorModel_1.vendorModel
                            .findById(tag.tagId)
                            .select("storeName userName avatar");
                    }
                    else if (tag.tagType === "community") {
                        taggedUser = yield communityModel_1.VendorCommunityModel.findById(tag.tagId).select("name description");
                    }
                    if (taggedUser) {
                        populatedTags.push({
                            tagId: tag.tagId,
                            tagType: tag.tagType,
                            user: taggedUser,
                        });
                    }
                }
                post.tags = populatedTags;
                // Populate comments and replies
                for (const comment of post.comments || []) {
                    if (comment.commentType === "vendors") {
                        comment.user = yield vendorModel_1.vendorModel
                            .findById(comment.user)
                            .select("storeName userName avatar");
                    }
                    else if (comment.commentType === "community") {
                        comment.user = yield communityModel_1.VendorCommunityModel.findById(comment.user).select("name description");
                    }
                    for (const reply of comment.replies || []) {
                        if (reply.commentType === "vendors") {
                            reply.user = yield vendorModel_1.vendorModel
                                .findById(reply.user)
                                .select("storeName userName avatar");
                        }
                        else if (reply.commentType === "community") {
                            reply.user = yield communityModel_1.VendorCommunityModel.findById(reply.user).select("name description");
                        }
                    }
                }
            }
        }
        return res.status(200).json({
            message: "Vendors fetched successfully",
            vendors: get_all_vendors,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error getting vendors",
            error: error.message,
        });
    }
});
exports.get_all_vendors = get_all_vendors;
const upload_avatar = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).send("Vendor not found");
        }
        if (!req.file) {
            return res.status(400).json({ message: "No avatar file uploaded" });
        }
        const cloudFile = yield (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, "vendor/images", "image");
        vendor.avatar = cloudFile;
        yield vendor.save();
        // Notify vendor about avatar upload
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Avatar Uploaded",
            message: `Your profile avatar has been successfully uploaded.`,
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "avatar uploaded successfully",
            vendors: exports.get_all_vendors,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error uploading avatar",
            error: error.message,
        });
    }
});
exports.upload_avatar = upload_avatar;
const upload_businessLogo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).send("Vendor not found");
        }
        if (!req.file) {
            return res.status(400).json({ message: "No logo file uploaded" });
        }
        const cloudFile = yield (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, "vendor/images", "image");
        vendor.businessLogo = cloudFile;
        yield vendor.save();
        // Notify vendor about business logo upload
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Business Logo Uploaded",
            message: `Your business logo has been successfully uploaded.`,
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "businessLogo uploaded successfully",
            vendors: exports.get_all_vendors,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error uploading businessLogo",
            error: error.message,
        });
    }
});
exports.upload_businessLogo = upload_businessLogo;
const updateVendorSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const updates = (({ storeName, email, userName, address1, address2, country, city, state, postcode, storePhone, }) => ({
            storeName,
            email,
            userName,
            address1,
            address2,
            country,
            city,
            state,
            postcode,
            storePhone,
        }))(req.body);
        const updatedVendor = yield vendorModel_1.vendorModel.findByIdAndUpdate(vendorId, { $set: updates }, { new: true });
        if (!updatedVendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        // Notify vendor about settings update
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Settings Updated",
            message: `Your vendor settings have been successfully updated.`,
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "Vendor settings updated successfully",
            vendor: updatedVendor,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error updating settings", error: error.message });
    }
});
exports.updateVendorSettings = updateVendorSettings;
const getCraftCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const vendor = yield vendorModel_1.vendorModel
            .findById(vendorId)
            .select("craftCategories");
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        return res.status(200).json({
            message: "Craft categories fetched successfully",
            craftCategories: vendor.craftCategories || [],
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error fetching craft categories",
            error: error.message,
        });
    }
});
exports.getCraftCategories = getCraftCategories;
const create_recipient_code = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const vendorId = req.user._id;
    const { account_number, bank_code, bankName, name } = req.body;
    if (!account_number || !bank_code || !name || !bankName) {
        return res.status(400).json({ message: "Missing required fields" });
    }
    try {
        const response = yield axios_1.default.post("https://api.paystack.co/transferrecipient", {
            type: "nuban",
            name,
            account_number,
            bank_code,
            currency: "NGN",
        }, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });
        const recipient = response.data.data;
        const updatedVendor = yield vendorModel_1.vendorModel.findByIdAndUpdate(vendorId, {
            paystackRecipientCode: recipient.recipient_code,
            bankAccount: {
                account_number,
                bank_code,
                bankName,
                account_name: name,
            },
        }, { new: true });
        // Notify vendor about recipient code creation
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Payment Recipient Code Created",
            message: `Your Paystack recipient code has been successfully created.`,
            isRead: false,
            metadata: { vendorId, recipientCode: recipient.recipient_code },
        });
        return res.status(200).json({
            success: true,
            message: "Recipient created and saved successfully",
            recipient_code: recipient.recipient_code,
            vendor: updatedVendor,
        });
    }
    catch (error) {
        console.error("Paystack error:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        return res.status(500).json({
            message: "Failed to create recipient code",
            error: ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message,
        });
    }
});
exports.create_recipient_code = create_recipient_code;
const forgetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        const vendor = yield vendorModel_1.vendorModel.findOne({ email });
        if (!vendor)
            return res.status(404).json({ message: "Vendor not found" });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        vendor.otpCode = otp;
        vendor.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        yield vendor.save();
        const emailTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "Send_otp.ejs");
        yield (0, email_1.sendMail)(vendor.email, "Password Reset OTP", yield ejs_1.default.renderFile(emailTemplatePath, {
            otp: otp,
            name: vendor.storeName,
        }));
        // Notify vendor about OTP generation
        yield notificationsModel_1.default.create({
            recipient: vendor._id,
            type: "System",
            title: "Password Reset OTP Sent",
            message: `A password reset OTP has been sent to your email (${email}).`,
            isRead: false,
            metadata: { vendorId: vendor._id },
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
        const vendor = yield vendorModel_1.vendorModel.findOne({ email });
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        if (vendor.otpCode !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }
        if (vendor.otpExpires && vendor.otpExpires < new Date()) {
            return res.status(400).json({ message: "OTP has expired" });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        vendor.password = hashedPassword;
        vendor.otpCode = null;
        vendor.otpExpires = null;
        yield vendor.save();
        // Notify vendor about successful password reset
        yield notificationsModel_1.default.create({
            recipient: vendor._id,
            type: "System",
            title: "Password Reset Successful",
            message: `Your password has been successfully reset.`,
            isRead: false,
            metadata: { vendorId: vendor._id },
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
const getVendorInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;
        // Build filter
        const filter = { poster: vendorId };
        if (status)
            filter.status = status;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom)
                filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo)
                filter.createdAt.$lte = new Date(dateTo);
        }
        const invoices = yield invoiceModel_1.InvoiceModel.find(filter)
            .populate({
            path: "order",
            populate: {
                path: "product",
                select: "name price images",
            },
        })
            .populate("poster", "storeName email")
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        const totalInvoices = yield invoiceModel_1.InvoiceModel.countDocuments(filter);
        // Calculate invoice summaries
        const stats = yield invoiceModel_1.InvoiceModel.aggregate([
            { $match: { poster: vendorId } },
            {
                $group: {
                    _id: null,
                    totalInvoices: { $sum: 1 },
                    totalAmount: { $sum: "$amount" },
                    paidAmount: {
                        $sum: { $cond: [{ $eq: ["$status", "Paid"] }, "$amount", 0] },
                    },
                    pendingAmount: {
                        $sum: { $cond: [{ $eq: ["$status", "Unpaid"] }, "$amount", 0] },
                    },
                },
            },
        ]);
        return res.status(200).json({
            success: true,
            message: "Vendor invoices retrieved successfully",
            invoices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalInvoices,
                pages: Math.ceil(totalInvoices / limit),
            },
            summary: stats.length > 0
                ? stats[0]
                : {
                    totalInvoices: 0,
                    totalAmount: 0,
                    paidAmount: 0,
                    pendingAmount: 0,
                },
        });
    }
    catch (err) {
        console.error("getVendorInvoices error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve vendor invoices",
            error: err.message,
        });
    }
});
exports.getVendorInvoices = getVendorInvoices;
const getVendorCustomers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        // Get vendor with customers array
        const vendor = yield vendorModel_1.vendorModel
            .findById(vendorId)
            .select("customers");
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        // Manually populate customers based on modelType
        const populatedCustomers = [];
        for (const customerData of vendor.customers) {
            let customerInfo = null;
            if (customerData.modelType === "users") {
                const user = yield userModel_1.userModel
                    .findById(customerData.customer)
                    .select("first_name last_name email phone");
                if (user) {
                    customerInfo = {
                        _id: user._id,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        phone: user.phone,
                        type: "user",
                    };
                }
            }
            else if (customerData.modelType === "vendors") {
                const vendorCustomer = yield vendorModel_1.vendorModel
                    .findById(customerData.customer)
                    .select("storeName email storePhone userName");
                if (vendorCustomer) {
                    customerInfo = {
                        _id: vendorCustomer._id,
                        first_name: vendorCustomer.storeName,
                        last_name: "",
                        email: vendorCustomer.email,
                        phone: vendorCustomer.storePhone,
                        userName: vendorCustomer.userName,
                        type: "vendor",
                    };
                }
            }
            if (customerInfo) {
                populatedCustomers.push({
                    customer: customerInfo,
                    status: customerData.status,
                    modelType: customerData.modelType,
                    lastOrderDate: customerData.lastOrderDate,
                });
            }
        }
        return res.status(200).json({
            message: "Customers fetched successfully",
            customers: populatedCustomers,
            totalCustomers: populatedCustomers.length,
        });
    }
    catch (error) {
        console.error("❌ getVendorCustomers error:", error);
        return res
            .status(500)
            .json({ message: "Server error", error: error.message });
    }
});
exports.getVendorCustomers = getVendorCustomers;
const getVendorPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        // Get vendor with payments array
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId).select("payments");
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        // Manually populate payments based on modelType
        const populatedPayments = [];
        for (const paymentData of vendor.payments) {
            let customerInfo = null;
            if (paymentData.modelType === "users") {
                const user = yield userModel_1.userModel
                    .findById(paymentData.customer)
                    .select("first_name last_name email phone");
                if (user) {
                    customerInfo = {
                        _id: user._id,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        phone: user.phone,
                        type: "user",
                    };
                }
            }
            else if (paymentData.modelType === "vendors") {
                const vendorCustomer = yield vendorModel_1.vendorModel
                    .findById(paymentData.customer)
                    .select("storeName email storePhone userName");
                if (vendorCustomer) {
                    customerInfo = {
                        _id: vendorCustomer._id,
                        first_name: vendorCustomer.storeName,
                        last_name: "",
                        email: vendorCustomer.email,
                        phone: vendorCustomer.storePhone,
                        userName: vendorCustomer.userName,
                        type: "vendor",
                    };
                }
            }
            if (customerInfo) {
                populatedPayments.push({
                    paymentId: paymentData.paymentId,
                    status: paymentData.status,
                    amount: paymentData.amount,
                    date: paymentData.date,
                    customer: customerInfo,
                    modelType: paymentData.modelType,
                });
            }
        }
        return res.status(200).json({
            message: "Payments fetched successfully",
            payments: populatedPayments,
            totalPayments: populatedPayments.length,
        });
    }
    catch (error) {
        console.error("❌ getVendorPayments error:", error);
        return res
            .status(500)
            .json({ message: "Server error", error: error.message });
    }
});
exports.getVendorPayments = getVendorPayments;
const getVendorStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId).populate({
            path: "orders",
            select: "quantity totalPrice",
        });
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        const totalProductsSold = vendor.orders.reduce((sum, order) => sum + (order.quantity || 0), 0);
        const totalRevenue = vendor.orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
        return res.status(200).json({
            message: "Vendor stats fetched successfully",
            stats: {
                totalProductsSold,
                totalRevenue,
            },
        });
    }
    catch (error) {
        console.error("❌ getVendorStats error:", error);
        return res
            .status(500)
            .json({ message: "Server error", error: error.message });
    }
});
exports.getVendorStats = getVendorStats;
const uploadKYC = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id;
        const { documentType, country } = req.body;
        const files = req.files;
        if (!(files === null || files === void 0 ? void 0 : files.front) || !(files === null || files === void 0 ? void 0 : files.back)) {
            return res
                .status(400)
                .json({ message: "Both front and back images are required." });
        }
        if (!documentType || !country) {
            return res
                .status(400)
                .json({ message: "Document type and country are required." });
        }
        const frontUrl = yield (0, cloudinary_1.uploadToCloudinary)(files.front[0].buffer, `kyc/${userId}`, "image");
        const backUrl = yield (0, cloudinary_1.uploadToCloudinary)(files.back[0].buffer, `kyc/${userId}`, "image");
        if (!frontUrl || !backUrl) {
            return res.status(500).json({ message: "Cloudinary upload failed." });
        }
        const updatedVendor = yield vendorModel_1.vendorModel.findByIdAndUpdate(userId, {
            $set: {
                kycDocuments: {
                    front: frontUrl,
                    back: backUrl,
                    documentType,
                    country,
                },
                kycStatus: "Processing",
                kycSubmittedAt: new Date(),
            },
        }, { new: true });
        if (!updatedVendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        // Notify vendor
        yield notificationsModel_1.default.create({
            recipient: userId,
            type: "System",
            title: "KYC Documents Submitted",
            message: `Your KYC documents (${documentType}) have been submitted and are pending review.`,
            isRead: false,
            metadata: { vendorId: userId, documentType, country },
        });
        // Notify one admin
        const admin = yield adminModel_1.adminModel.findOne();
        if (admin) {
            yield notificationsModel_1.default.create({
                recipient: admin._id,
                sender: userId,
                type: "System",
                title: "New KYC Submission",
                message: `Vendor ${updatedVendor.storeName} has submitted ${documentType} for review.`,
                isRead: false,
                metadata: { vendorId: userId, documentType, country },
            });
        }
        return res.status(200).json({
            success: true,
            message: "KYC documents uploaded successfully",
            kycDocuments: updatedVendor.kycDocuments,
        });
    }
    catch (error) {
        console.error(error);
        res
            .status(500)
            .json({ message: "Error uploading KYC documents", error: error.message });
    }
});
exports.uploadKYC = uploadKYC;
// ====== SETTINGS LOGIC ======
const changePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { newPassword, confirmPassword } = req.body;
        if (!newPassword || !confirmPassword) {
            return res
                .status(400)
                .json({ message: "New password and confirmation are required" });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }
        if (newPassword.length < 6) {
            return res
                .status(400)
                .json({ message: "Password must be at least 6 characters long" });
        }
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, salt);
        vendor.password = hashedPassword;
        yield vendor.save();
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Password Changed",
            message: "Your password has been successfully updated.",
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({ message: "Password changed successfully" });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error changing password", error: error.message });
    }
});
exports.changePassword = changePassword;
const changeLocation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { country, state, address1, address2, city, postcode } = req.body;
        if (!country || !state || !address1 || !city) {
            return res
                .status(400)
                .json({ message: "Country, state, address1, and city are required" });
        }
        const updatedVendor = yield vendorModel_1.vendorModel.findByIdAndUpdate(vendorId, {
            $set: Object.assign(Object.assign(Object.assign({ country,
                state,
                address1 }, (address2 && { address2 })), { city }), (postcode && { postcode })),
        }, { new: true });
        if (!updatedVendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Location Updated",
            message: "Your location details have been successfully updated.",
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "Location updated successfully",
            vendor: {
                country: updatedVendor.country,
                state: updatedVendor.state,
                address1: updatedVendor.address1,
                address2: updatedVendor.address2,
                city: updatedVendor.city,
                postcode: updatedVendor.postcode,
            },
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error updating location", error: error.message });
    }
});
exports.changeLocation = changeLocation;
const changeEmailAddress = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { email } = req.body;
        if (!email || !email.includes("@")) {
            return res
                .status(400)
                .json({ message: "Valid email address is required" });
        }
        const existingVendor = yield vendorModel_1.vendorModel.findOne({ email });
        if (existingVendor && existingVendor._id !== vendorId) {
            return res
                .status(400)
                .json({ message: "Email address is already in use" });
        }
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        // Generate OTP for email verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        vendor.otpCode = otp;
        vendor.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        vendor.pendingEmail = email;
        yield vendor.save();
        const emailTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "Send_otp.ejs");
        yield (0, email_1.sendMail)(email, "Email Change Verification", yield ejs_1.default.renderFile(emailTemplatePath, {
            otp: otp,
            name: vendor.storeName,
        }));
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Email Change Initiated",
            message: "Please verify your new email address with the OTP sent.",
            isRead: false,
            metadata: { vendorId, newEmail: email },
        });
        return res.status(200).json({
            message: "OTP sent to new email address. Please verify to complete email change.",
            requiresOtpVerification: true,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error initiating email change", error: error.message });
    }
});
exports.changeEmailAddress = changeEmailAddress;
const verifyEmailChange = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { otp } = req.body;
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        if (!vendor.pendingEmail) {
            return res.status(400).json({ message: "No pending email change" });
        }
        if (!vendor.otpCode || vendor.otpCode !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }
        if (vendor.otpExpires && vendor.otpExpires < new Date()) {
            return res.status(400).json({ message: "OTP has expired" });
        }
        // Double check uniqueness before setting
        const existingVendor = yield vendorModel_1.vendorModel.findOne({
            email: vendor.pendingEmail,
        });
        if (existingVendor && existingVendor._id !== vendorId) {
            return res
                .status(400)
                .json({ message: "Email address is already in use" });
        }
        // Update email
        vendor.email = vendor.pendingEmail;
        vendor.pendingEmail = undefined;
        vendor.otpCode = null;
        vendor.otpExpires = null;
        yield vendor.save();
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Email Address Updated",
            message: "Your email address has been successfully changed.",
            isRead: false,
            metadata: { vendorId },
        });
        return res
            .status(200)
            .json({ message: "Email address successfully updated" });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error verifying email change", error: error.message });
    }
});
exports.verifyEmailChange = verifyEmailChange;
const changeStoreDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { storeName, storePhone } = req.body;
        if (!storeName) {
            return res.status(400).json({ message: "Store name is required" });
        }
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        // Check if store name is already taken by another vendor
        const existingVendor = yield vendorModel_1.vendorModel.findOne({ storeName });
        if (existingVendor && existingVendor._id !== vendorId) {
            return res.status(400).json({ message: "Store name is already taken" });
        }
        vendor.storeName = storeName;
        if (storePhone)
            vendor.storePhone = storePhone;
        yield vendor.save();
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Store Details Updated",
            message: "Your store details have been successfully updated.",
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "Store details updated successfully",
            vendor: {
                storeName: vendor.storeName,
                storePhone: vendor.storePhone,
            },
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error updating store details", error: error.message });
    }
});
exports.changeStoreDetails = changeStoreDetails;
const uploadBusinessVideo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        // Find vendor
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({
                message: "Vendor not found",
            });
        }
        // Check if file exists
        if (!req.file) {
            return res.status(400).json({
                message: "No video file uploaded",
            });
        }
        // Upload video to Cloudinary
        const cloudVideo = yield (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, "vendor/business_videos", "video");
        // Save video URL
        vendor.businessVideo = cloudVideo;
        yield vendor.save();
        // Create notification
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Business Video Uploaded",
            message: "Your business video has been successfully uploaded.",
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "Business video uploaded successfully",
            data: vendor,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error uploading business video",
            error: error.message,
        });
    }
});
exports.uploadBusinessVideo = uploadBusinessVideo;
const uploadWorkTools = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const { workflow, history } = req.body;
        // Find vendor
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({
                message: "Vendor not found",
            });
        }
        // Check files
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                message: "No files uploaded",
            });
        }
        const uploadedUrls = [];
        // Upload all files
        for (const file of req.files) {
            const cloudImg = yield (0, cloudinary_1.uploadToCloudinary)(file.buffer, "vendor/work_tools", "image");
            uploadedUrls.push(cloudImg);
        }
        // Save images
        vendor.workTools = [...(vendor.workTools || []), ...uploadedUrls];
        // Save workflow
        if (workflow !== undefined) {
            vendor.businessWorkflow = workflow;
        }
        // Save history
        if (history !== undefined) {
            vendor.businessHistory = history;
        }
        yield vendor.save();
        // Notification
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            type: "System",
            title: "Work Tools Uploaded",
            message: "Your work tools images have been successfully uploaded.",
            isRead: false,
            metadata: { vendorId },
        });
        return res.status(200).json({
            message: "Work tools uploaded successfully",
            data: vendor,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error uploading work tools",
            error: error.message,
        });
    }
});
exports.uploadWorkTools = uploadWorkTools;
const refreshTokenVendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ message: "Refresh token is required" });
        }
        // Verify refresh token
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET || environmentVariables_1.EnvironmentVariables.JWT_SECRET);
        // Find vendor by ID and check if refresh token matches
        const vendor = yield vendorModel_1.vendorModel.findById(decoded._id);
        if (!vendor || vendor.refreshToken !== refreshToken) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }
        // Generate new access token
        const accessToken = jsonwebtoken_1.default.sign({ _id: vendor._id, email: vendor.email, role: "vendor" }, environmentVariables_1.EnvironmentVariables.JWT_SECRET, { expiresIn: "15m" });
        return res.status(200).json({
            message: "Token refreshed successfully",
            accessToken,
        });
    }
    catch (error) {
        return res
            .status(401)
            .json({ message: "Invalid refresh token", error: error.message });
    }
});
exports.refreshTokenVendor = refreshTokenVendor;
