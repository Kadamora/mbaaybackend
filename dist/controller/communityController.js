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
exports.getMutualFriends = exports.getAllCommunities = exports.getOneCommunity = exports.getUserTotalCommunities = exports.getAllPostComments = exports.getVerifiedVendorsAndCommunities = exports.searchVendorOrCommunity = exports.leaveCommunity = exports.unfollowVendor = exports.joinCommunity = exports.followVendor = exports.getFeedPosts = exports.commentOnComment = exports.unlikePost = exports.commentOnPost = exports.likePost = exports.createPost = exports.createCommunity = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const communityModel_1 = require("../model/communityModel");
const communityPostModel_1 = require("../model/communityPostModel");
const vendorModel_1 = require("../model/vendorModel");
const userModel_1 = require("../model/userModel");
const cloudinary_1 = require("../config/cloudinary");
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const createCommunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, description } = req.body;
        const creatorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        const existingCommunity = yield communityModel_1.VendorCommunityModel.findOne({ name });
        if (existingCommunity) {
            return res.status(400).json({ message: "Community name already taken." });
        }
        const admin = yield vendorModel_1.vendorModel.findById(creatorId);
        if (!admin) {
            return res.status(400).json({ message: "admin not found" });
        }
        let cloudImgUrl = "";
        if (req.file) {
            const cloudImg = yield cloudinary_1.cloudinary.uploader.upload(req.file.path);
            cloudImgUrl = cloudImg.secure_url;
        }
        // Create new community
        const community = yield communityModel_1.VendorCommunityModel.create({
            name,
            description,
            admin: creatorId,
            community_Images: cloudImgUrl || null,
            members: [creatorId],
        });
        admin.communities.push(new mongoose_1.default.Types.ObjectId(community._id));
        yield admin.save();
        yield community.save();
        // Create notification for admin
        yield notificationsModel_1.default.create({
            recipient: creatorId,
            type: "System",
            title: "Community Created",
            message: `You successfully created the ${name} community!`,
            isRead: false,
            metadata: { communityId: community._id },
        });
        return res.status(201).json({
            message: "Community created successfully",
            data: community,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error creating community", error: error.message });
    }
});
exports.createCommunity = createCommunity;
const createPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { content, tags, userType, communityId } = req.body;
        const userId = req.user._id;
        if (!["vendors", "community"].includes(userType)) {
            return res.status(400).json({ message: "Invalid user type" });
        }
        // Ensure tags is an array
        if (typeof tags === "string") {
            try {
                tags = JSON.parse(tags);
            }
            catch (err) {
                return res
                    .status(400)
                    .json({ message: "Invalid tags format (must be JSON array)" });
            }
        }
        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map((file) => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary_1.cloudinary.uploader.upload_stream({ folder: "posts", resource_type: "image" }, (error, result) => {
                        if (error || !result) {
                            console.error("Cloudinary Upload Error:", error);
                            reject(new Error("Image upload failed"));
                        }
                        else {
                            resolve(result.secure_url);
                        }
                    });
                    uploadStream.end(file.buffer);
                });
            });
            imageUrls = yield Promise.all(uploadPromises);
        }
        const postData = {
            content,
            tags,
            posts_Images: imageUrls,
            poster: userId,
            posterType: userType,
        };
        if (userType === "community" && communityId) {
            postData.community = communityId;
        }
        const post = yield communityPostModel_1.CommunityPostModel.create(postData);
        let vendor = null;
        if (userType === "vendors") {
            vendor = yield vendorModel_1.vendorModel.findById(userId);
            if (!vendor) {
                return res.status(404).json({ message: "Vendor not found" });
            }
            yield vendorModel_1.vendorModel.findByIdAndUpdate(userId, {
                $push: { communityPosts: post._id },
            });
        }
        else if (userType === "community" && communityId) {
            yield communityModel_1.VendorCommunityModel.findByIdAndUpdate(communityId, {
                $push: { communityPosts: post._id },
            });
        }
        if (tags && Array.isArray(tags)) {
            const notificationPromises = tags.map((tag) => {
                if (tag.tagId) {
                    return notificationsModel_1.default.create({
                        recipient: tag.tagId,
                        sender: userId,
                        type: "Other",
                        title: "Tagged in Post",
                        message: `You were tagged in a new post by ${userType === "vendors"
                            ? (vendor === null || vendor === void 0 ? void 0 : vendor.storeName) || "a vendor"
                            : "a community"}`,
                        isRead: false,
                        metadata: { postId: post._id, communityId: communityId || null },
                    });
                }
            });
            yield Promise.all(notificationPromises);
        }
        // 🔔 Notify community members if community post
        if (userType === "community" && communityId) {
            const community = yield communityModel_1.VendorCommunityModel.findById(communityId);
            if (community && community.members) {
                const notificationPromises = community.members
                    .filter((memberId) => memberId.toString() !== userId.toString())
                    .map((memberId) => notificationsModel_1.default.create({
                    recipient: memberId,
                    sender: userId,
                    type: "Other",
                    title: "New Community Post",
                    message: `A new post was added to ${community.name}`,
                    isRead: false,
                    metadata: { postId: post._id, communityId },
                }));
                yield Promise.all(notificationPromises);
            }
        }
        return res.status(201).json({
            message: "Post created successfully",
            data: post,
        });
    }
    catch (error) {
        console.error("❌ Create Post Error:", error);
        return res.status(500).json({
            message: "Error creating post",
            error: error.message,
        });
    }
});
exports.createPost = createPost;
const likePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { postId } = req.params;
        const userId = req.user._id.toString();
        const post = yield communityPostModel_1.CommunityPostModel.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }
        const alreadyLiked = post.likes.some((like) => like.toString() === userId);
        if (alreadyLiked) {
            return res.status(400).json({ message: "You already liked this post" });
        }
        post.likes.push(userId);
        yield post.save();
        if (post.poster.toString() !== userId) {
            const sender = yield vendorModel_1.vendorModel.findById(userId);
            yield notificationsModel_1.default.create({
                recipient: post.poster,
                sender: userId,
                type: "Other",
                title: "Post Liked",
                message: `${(sender === null || sender === void 0 ? void 0 : sender.storeName) || "A user"} liked your post`,
                isRead: false,
                metadata: { postId: post._id },
            });
        }
        return res
            .status(200)
            .json({ message: "Post liked successfully", data: post });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error liking post", error: error.message });
    }
});
exports.likePost = likePost;
const commentOnPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { postId } = req.params;
        const { text, userType } = req.body;
        const userId = req.user._id;
        if (!text) {
            return res.status(400).json({ message: "Comment text is required" });
        }
        const post = yield communityPostModel_1.CommunityPostModel.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }
        const checkPoster = userType === "vendors"
            ? vendorModel_1.vendorModel
            : communityModel_1.VendorCommunityModel;
        const user = yield checkPoster.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const newComment = yield communityPostModel_1.CommentModel.create({
            user: userId,
            commentType: userType,
            text,
            comment_poster: userType === "vendors" ? user.storeName : user.name,
            createdAt: new Date(),
        });
        post.comments.push({
            user: userId,
            commentType: userType,
            text,
            comment_poster: userType === "vendors" ? user.storeName : user.name,
            createdAt: new Date(),
        });
        yield post.save();
        // Create notification for post owner if commenter is not the post owner
        if (post.poster.toString() !== userId.toString()) {
            yield notificationsModel_1.default.create({
                recipient: post.poster,
                sender: userId,
                type: "Other",
                title: "New Comment",
                message: `${userType === "vendors" ? user.storeName : user.name} commented on your post`,
                isRead: false,
                metadata: { postId: post._id, commentId: newComment._id },
            });
        }
        return res.status(201).json({
            message: "Comment added successfully",
            data: newComment,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error commenting on post",
            error: error.message,
        });
    }
});
exports.commentOnPost = commentOnPost;
const unlikePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { postId } = req.params;
        const userId = req.user._id;
        const post = yield communityPostModel_1.CommunityPostModel.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }
        const likeIndex = post.likes.findIndex((like) => like.toString() === userId);
        if (likeIndex === -1) {
            return res.status(400).json({ message: "You have not liked this post" });
        }
        post.likes.splice(likeIndex, 1);
        yield post.save();
        return res.status(200).json({ message: "Post unliked", data: post });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error unliking post", error: error.message });
    }
});
exports.unlikePost = unlikePost;
const commentOnComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { postId, commentId } = req.params;
        const { text } = req.body;
        const userId = req.user._id;
        if (!text) {
            return res.status(400).json({ message: "Comment text is required" });
        }
        const vendor = yield vendorModel_1.vendorModel.findById(userId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        const post = yield communityPostModel_1.CommunityPostModel.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }
        const comment = post.comments.find((c) => c._id.toString() === commentId);
        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }
        if (!comment.replies) {
            comment.replies = [];
        }
        const reply = {
            _id: new mongoose_1.default.Types.ObjectId(),
            user: userId,
            text,
            createdAt: new Date(),
            commentType: "vendors",
            comment_poster: (_a = vendor.storeName) !== null && _a !== void 0 ? _a : "",
            comment_poster_Image: (_b = vendor.avatar) !== null && _b !== void 0 ? _b : "",
        };
        comment.replies.push(reply);
        yield post.save();
        // Create notification for comment owner if replier is not the comment owner
        if (comment.user.toString() !== userId.toString()) {
            yield notificationsModel_1.default.create({
                recipient: comment.user,
                sender: userId,
                type: "Other",
                title: "Reply to Comment",
                message: `${vendor.storeName} replied to your comment`,
                isRead: false,
                metadata: { postId: post._id, commentId, replyId: reply._id },
            });
        }
        return res.status(201).json({
            message: "Reply added to comment",
            data: post,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error replying to comment",
            error: error.message,
        });
    }
});
exports.commentOnComment = commentOnComment;
const getFeedPosts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const user = yield vendorModel_1.vendorModel.findById(vendorId).populate("following");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const userCraftCategory = user.craftCategories;
        const followingIds = user.following.map((f) => f._id);
        const communities = yield communityModel_1.VendorCommunityModel.find({ members: vendorId });
        const communityIds = communities.map((c) => c._id);
        const communityMemberIds = communities.flatMap((c) => c.members);
        let feedPosts = yield communityPostModel_1.CommunityPostModel.find({
            $or: [
                { poster: vendorId },
                { poster: { $in: followingIds } },
                { poster: { $in: communityMemberIds } },
                { community: { $in: communityIds } },
                { posterType: "vendors", "poster.craftCategory": userCraftCategory },
                { "tags.tagId": vendorId },
            ],
        })
            .sort({ createdTime: -1 })
            .populate("poster")
            .populate("community")
            .lean();
        for (const post of feedPosts) {
            for (const comment of post.comments || []) {
                comment.user =
                    comment.commentType === "vendors"
                        ? yield vendorModel_1.vendorModel.findById(comment.user).lean()
                        : yield communityModel_1.VendorCommunityModel.findById(comment.user).lean();
                if (Array.isArray(comment.replies)) {
                    for (const reply of comment.replies) {
                        reply.user =
                            reply.commentType === "vendors"
                                ? yield vendorModel_1.vendorModel.findById(reply.user).lean()
                                : yield communityModel_1.VendorCommunityModel.findById(reply.user).lean();
                    }
                }
            }
            if (Array.isArray(post.tags)) {
                post.tags = yield Promise.all(post.tags.map((tag) => __awaiter(void 0, void 0, void 0, function* () {
                    let taggedUser = null;
                    if (tag.tagType === "vendors") {
                        taggedUser = yield vendorModel_1.vendorModel.findById(tag.tagId).lean();
                    }
                    else if (tag.tagType === "community") {
                        taggedUser = yield communityModel_1.VendorCommunityModel.findById(tag.tagId).lean();
                    }
                    return Object.assign(Object.assign({}, tag), { user: taggedUser || null });
                })));
            }
        }
        const uniqueFeedPosts = new Map();
        feedPosts.forEach((post) => uniqueFeedPosts.set(post._id.toString(), post));
        feedPosts = Array.from(uniqueFeedPosts.values());
        return res.status(200).json({
            message: "Posts fetched successfully",
            data: {
                feedPosts,
            },
        });
    }
    catch (error) {
        console.error("Error fetching feed posts:", error);
        return res.status(500).json({
            message: "Error fetching posts",
            error: error.message,
        });
    }
});
exports.getFeedPosts = getFeedPosts;
const followVendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { vendorId } = req.params;
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        let followerId;
        let followerModel;
        let followerName;
        // Determine if follower is a user or vendor
        if (req.user.userId) {
            // User following
            followerId = req.user.userId;
            followerModel = yield userModel_1.userModel.findById(followerId);
            followerName = (followerModel === null || followerModel === void 0 ? void 0 : followerModel.name) || "A user";
        }
        else if (req.user._id) {
            // Vendor following
            followerId = req.user._id;
            followerModel = yield vendorModel_1.vendorModel.findById(followerId);
            followerName = (followerModel === null || followerModel === void 0 ? void 0 : followerModel.storeName) || "A vendor";
        }
        else {
            return res.status(400).json({ message: "Invalid user type" });
        }
        if (!followerModel) {
            return res.status(404).json({ message: "Follower not found" });
        }
        if (followerModel.following.includes(vendorId)) {
            return res.status(400).json({ message: "Already following this vendor" });
        }
        followerModel.following.push(new mongoose_1.default.Types.ObjectId(vendorId));
        yield followerModel.save();
        vendor.followers.push(new mongoose_1.default.Types.ObjectId(followerId));
        yield vendor.save();
        // Create notification for the followed vendor
        yield notificationsModel_1.default.create({
            recipient: vendorId,
            sender: followerId,
            type: "FriendRequest",
            title: "New Follower",
            message: `${followerName} started following you`,
            isRead: false,
            metadata: { followerId },
        });
        return res
            .status(200)
            .json({ message: "Vendor followed successfully", data: followerModel });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error following vendor", error: error.message });
    }
});
exports.followVendor = followVendor;
const joinCommunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id;
        const { communityId } = req.params;
        const community = yield communityModel_1.VendorCommunityModel.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: "Community not found" });
        }
        const user = yield vendorModel_1.vendorModel.findById(userId);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        if (user.communities.includes(communityId)) {
            return res.status(400).json({ message: "Already in this community" });
        }
        user.communities.push(new mongoose_1.default.Types.ObjectId(communityId));
        yield user.save();
        community.members.push(userId);
        yield community.save();
        // Create notification for community admin
        yield notificationsModel_1.default.create({
            recipient: community.admin,
            sender: userId,
            type: "Other",
            title: "New Community Member",
            message: `${user.storeName || "A user"} joined your ${community.name} community`,
            isRead: false,
            metadata: { communityId, memberId: userId },
        });
        return res
            .status(200)
            .json({ message: "Community joined successfully", data: user });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error joining community", error: error.message });
    }
});
exports.joinCommunity = joinCommunity;
const unfollowVendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { vendorId } = req.params;
        const vendor = yield vendorModel_1.vendorModel.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        let followerId;
        let followerModel;
        // Determine if follower is a user or vendor
        if (req.user.userId) {
            // User following
            followerId = req.user.userId;
            followerModel = yield userModel_1.userModel.findById(followerId);
        }
        else if (req.user._id) {
            // Vendor following
            followerId = req.user._id;
            followerModel = yield vendorModel_1.vendorModel.findById(followerId);
        }
        else {
            return res.status(400).json({ message: "Invalid user type" });
        }
        if (!followerModel) {
            return res.status(404).json({ message: "Follower not found" });
        }
        if (!followerModel.following.some((id) => id.equals(vendorId))) {
            return res
                .status(400)
                .json({ message: "You are not following this vendor" });
        }
        followerModel.following = followerModel.following.filter((id) => !id.equals(vendorId));
        yield followerModel.save();
        vendor.followers = vendor.followers.filter((id) => !id.equals(followerId));
        yield vendor.save();
        return res
            .status(200)
            .json({ message: "Vendor unfollowed successfully", data: followerModel });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error unfollowing vendor", error: error.message });
    }
});
exports.unfollowVendor = unfollowVendor;
const leaveCommunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id;
        const { communityId } = req.params;
        const community = yield communityModel_1.VendorCommunityModel.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: "Community not found" });
        }
        const user = yield vendorModel_1.vendorModel.findById(userId);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        if (!user.communities.includes(communityId)) {
            return res
                .status(400)
                .json({ message: "You are not a member of this community" });
        }
        if (community.admin.toString() === userId.toString()) {
            return res
                .status(403)
                .json({ message: "Admins cannot leave their own community" });
        }
        user.communities = user.communities.filter((id) => id.toString() !== communityId.toString());
        yield user.save();
        community.members = community.members.filter((id) => id.toString() !== userId.toString());
        yield community.save();
        return res.status(200).json({
            message: "Successfully left the community",
            data: user,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error leaving community",
            error: error.message,
        });
    }
});
exports.leaveCommunity = leaveCommunity;
const searchVendorOrCommunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ message: "Query parameter is required" });
        }
        const vendors = yield vendorModel_1.vendorModel.find({
            $and: [
                { emailSent: true },
                {
                    $or: [
                        { userName: { $regex: query, $options: "i" } },
                        { storeName: { $regex: query, $options: "i" } },
                    ],
                },
            ],
        });
        const communities = yield communityModel_1.VendorCommunityModel.find({
            name: { $regex: query, $options: "i" },
        });
        return res.status(200).json({
            message: "Search results",
            vendors,
            communities,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error searching", error: error.message });
    }
});
exports.searchVendorOrCommunity = searchVendorOrCommunity;
const getVerifiedVendorsAndCommunities = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const loggedInVendorId = req.user._id;
        const verifiedVendors = yield vendorModel_1.vendorModel.find({
            emailSent: true,
            _id: { $ne: loggedInVendorId },
        });
        const communities = yield communityModel_1.VendorCommunityModel.find();
        return res.status(200).json({
            message: "Verified vendors and communities retrieved successfully",
            vendors: verifiedVendors,
            communities: communities,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error retrieving vendors and communities",
            error: error.message,
        });
    }
});
exports.getVerifiedVendorsAndCommunities = getVerifiedVendorsAndCommunities;
const getAllPostComments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { postId } = req.params;
        const post = yield communityPostModel_1.CommunityPostModel.findById(postId).populate({
            path: "comments",
            populate: {
                path: "user",
                select: "name profilePicture",
            },
        });
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }
        return res.status(200).json({
            message: "Comments fetched successfully",
            data: post.comments,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error fetching comments",
            error: error.message,
        });
    }
});
exports.getAllPostComments = getAllPostComments;
const getUserTotalCommunities = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id;
        const user = yield vendorModel_1.vendorModel
            .findById(userId)
            .select("communities")
            .populate("communities");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({
            message: "Total communities fetched successfully",
            totalCommunities: user,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error fetching total communities",
            error: error.message,
        });
    }
});
exports.getUserTotalCommunities = getUserTotalCommunities;
const getOneCommunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { communityId } = req.params;
        const community = yield communityModel_1.VendorCommunityModel.findById(communityId)
            .populate("members")
            .populate("admin")
            .populate({
            path: "communityPosts",
            populate: {
                path: "poster",
            },
        });
        if (!community) {
            return res.status(404).json({ message: "Community not found" });
        }
        return res.status(200).json({
            message: "Community fetched successfully",
            data: community,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error fetching community",
            error: error.message,
        });
    }
});
exports.getOneCommunity = getOneCommunity;
const getAllCommunities = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const communities = yield communityModel_1.VendorCommunityModel.find().populate("admin");
        return res.status(200).json({
            message: "Communities fetched successfully",
            data: communities,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error fetching communities",
            error: error.message,
        });
    }
});
exports.getAllCommunities = getAllCommunities;
const mutualFriendsCache = {};
const getMutualFriends = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const currentTime = Date.now();
        if (mutualFriendsCache[vendorId] &&
            currentTime - mutualFriendsCache[vendorId].timestamp < 24 * 60 * 60 * 1000) {
            return res.status(200).json({
                message: "Cached mutual friends recommendations",
                data: mutualFriendsCache[vendorId].data,
            });
        }
        const user = yield vendorModel_1.vendorModel.findById(vendorId).populate("following");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const followingIds = user.following.map((f) => f._id);
        const mutualFriends = yield vendorModel_1.vendorModel.aggregate([
            { $match: { _id: { $in: followingIds } } },
            {
                $lookup: {
                    from: "vendors",
                    localField: "following",
                    foreignField: "_id",
                    as: "friendFollowing",
                },
            },
            { $unwind: "$friendFollowing" },
            {
                $match: {
                    "friendFollowing._id": { $nin: [...followingIds, vendorId] },
                },
            },
            {
                $group: {
                    _id: "$friendFollowing._id",
                    userName: { $first: "$friendFollowing.userName" },
                    storeName: { $first: "$friendFollowing.storeName" },
                    profilePicture: { $first: "$friendFollowing.profilePicture" },
                },
            },
            { $sample: { size: 4 } },
        ]);
        mutualFriendsCache[vendorId] = {
            data: mutualFriends,
            timestamp: currentTime,
        };
        return res.status(200).json({
            message: "Mutual friends recommendations fetched successfully",
            data: mutualFriends,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Error fetching mutual friends", error: error.message });
    }
});
exports.getMutualFriends = getMutualFriends;
