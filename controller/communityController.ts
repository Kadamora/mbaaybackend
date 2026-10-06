import mongoose from "mongoose";
import { VendorCommunityModel } from "../model/communityModel";
import { CommentModel, CommunityPostModel } from "../model/communityPostModel";
import { vendorModel } from "../model/vendorModel";
import { userModel } from "../model/userModel";
import { cloudinary } from "../config/cloudinary";
import moment from "moment";
import NotificationModel, { INotification } from "../model/notificationsModel";

export const createCommunity = async (req: any, res: any) => {
  try {
    const { name, description } = req.body;
    const creatorId = req.user?._id;

    const existingCommunity = await VendorCommunityModel.findOne({ name });
    if (existingCommunity) {
      return res.status(400).json({ message: "Community name already taken." });
    }

    const admin = await vendorModel.findById(creatorId);
    if (!admin) {
      return res.status(400).json({ message: "admin not found" });
    }

    let cloudImgUrl = "";
    if (req.file) {
      const cloudImg = await cloudinary.uploader.upload(req.file.path);
      cloudImgUrl = cloudImg.secure_url;
    }

    // Create new community
    const community: any = await VendorCommunityModel.create({
      name,
      description,
      admin: creatorId,
      community_Images: cloudImgUrl || null,
      members: [creatorId],
    });

    admin.communities.push(new mongoose.Types.ObjectId(community._id));
    await admin.save();

    await community.save();

    // Create notification for admin
    await NotificationModel.create({
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
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error creating community", error: error.message });
  }
};

export const createPost = async (req: any, res: any) => {
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
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Invalid tags format (must be JSON array)" });
      }
    }

    let imageUrls: string[] = [];

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(
        (file: Express.Multer.File): Promise<string> => {
          return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: "posts", resource_type: "image" },
              (error, result) => {
                if (error || !result) {
                  console.error("Cloudinary Upload Error:", error);
                  reject(new Error("Image upload failed"));
                } else {
                  resolve(result.secure_url);
                }
              }
            );
            uploadStream.end(file.buffer);
          });
        }
      );

      imageUrls = await Promise.all(uploadPromises);
    }

    const postData: any = {
      content,
      tags,
      posts_Images: imageUrls,
      poster: userId,
      posterType: userType,
    };

    if (userType === "community" && communityId) {
      postData.community = communityId;
    }

    const post = await CommunityPostModel.create(postData);

    let vendor: any = null;

    if (userType === "vendors") {
      vendor = await vendorModel.findById(userId);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      await vendorModel.findByIdAndUpdate(userId, {
        $push: { communityPosts: post._id },
      });
    } else if (userType === "community" && communityId) {
      await VendorCommunityModel.findByIdAndUpdate(communityId, {
        $push: { communityPosts: post._id },
      });
    }

    if (tags && Array.isArray(tags)) {
      const notificationPromises = tags.map((tag: any) => {
        if (tag.tagId) {
          return NotificationModel.create({
            recipient: tag.tagId,
            sender: userId,
            type: "Other",
            title: "Tagged in Post",
            message: `You were tagged in a new post by ${
              userType === "vendors"
                ? vendor?.storeName || "a vendor"
                : "a community"
            }`,
            isRead: false,
            metadata: { postId: post._id, communityId: communityId || null },
          });
        }
      });
      await Promise.all(notificationPromises);
    }

    // 🔔 Notify community members if community post
    if (userType === "community" && communityId) {
      const community = await VendorCommunityModel.findById(communityId);
      if (community && community.members) {
        const notificationPromises = community.members
          .filter((memberId: any) => memberId.toString() !== userId.toString())
          .map((memberId: any) =>
            NotificationModel.create({
              recipient: memberId,
              sender: userId,
              type: "Other",
              title: "New Community Post",
              message: `A new post was added to ${community.name}`,
              isRead: false,
              metadata: { postId: post._id, communityId },
            })
          );
        await Promise.all(notificationPromises);
      }
    }

    return res.status(201).json({
      message: "Post created successfully",
      data: post,
    });
  } catch (error: any) {
    console.error("❌ Create Post Error:", error);
    return res.status(500).json({
      message: "Error creating post",
      error: error.message,
    });
  }
};
export const likePost = async (req: any, res: any) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id.toString();

    const post = await CommunityPostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const alreadyLiked = post.likes.some((like) => like.toString() === userId);
    if (alreadyLiked) {
      return res.status(400).json({ message: "You already liked this post" });
    }

    post.likes.push(userId);
    await post.save();

    if (post.poster.toString() !== userId) {
      const sender = await vendorModel.findById(userId);
      await NotificationModel.create({
        recipient: post.poster,
        sender: userId,
        type: "Other",
        title: "Post Liked",
        message: `${sender?.storeName || "A user"} liked your post`,
        isRead: false,
        metadata: { postId: post._id },
      });
    }

    return res
      .status(200)
      .json({ message: "Post liked successfully", data: post });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error liking post", error: error.message });
  }
};

export const commentOnPost = async (req: any, res: any) => {
  try {
    const { postId } = req.params;
    const { text, userType } = req.body;
    const userId = req.user._id;

    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const post = await CommunityPostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const checkPoster =
      userType === "vendors"
        ? (vendorModel as any)
        : (VendorCommunityModel as any);

    const user = await checkPoster.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newComment = await CommentModel.create({
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
    await post.save();

    // Create notification for post owner if commenter is not the post owner
    if (post.poster.toString() !== userId.toString()) {
      await NotificationModel.create({
        recipient: post.poster,
        sender: userId,
        type: "Other",
        title: "New Comment",
        message: `${
          userType === "vendors" ? user.storeName : user.name
        } commented on your post`,
        isRead: false,
        metadata: { postId: post._id, commentId: newComment._id },
      });
    }

    return res.status(201).json({
      message: "Comment added successfully",
      data: newComment,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error commenting on post",
      error: error.message,
    });
  }
};

export const unlikePost = async (req: any, res: any) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await CommunityPostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const likeIndex = post.likes.findIndex(
      (like) => like.toString() === userId
    );
    if (likeIndex === -1) {
      return res.status(400).json({ message: "You have not liked this post" });
    }

    post.likes.splice(likeIndex, 1);
    await post.save();

    return res.status(200).json({ message: "Post unliked", data: post });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error unliking post", error: error.message });
  }
};

export const commentOnComment = async (req: any, res: any) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const vendor = await vendorModel.findById(userId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const post = await CommunityPostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment: any = post.comments.find(
      (c: any) => c._id.toString() === commentId
    );

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (!comment.replies) {
      comment.replies = [];
    }

    const reply = {
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      text,
      createdAt: new Date(),
      commentType: "vendors",
      comment_poster: vendor.storeName ?? "",
      comment_poster_Image: vendor.avatar ?? "",
    };

    comment.replies.push(reply);
    await post.save();

    // Create notification for comment owner if replier is not the comment owner
    if (comment.user.toString() !== userId.toString()) {
      await NotificationModel.create({
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
  } catch (error: any) {
    return res.status(500).json({
      message: "Error replying to comment",
      error: error.message,
    });
  }
};

export const getFeedPosts = async (req: any, res: any) => {
  try {
    const vendorId = req.user._id;

    const user = await vendorModel.findById(vendorId).populate("following");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userCraftCategory = user.craftCategories;
    const followingIds = user.following.map((f: any) => f._id);

    const communities = await VendorCommunityModel.find({ members: vendorId });
    const communityIds = communities.map((c: any) => c._id);
    const communityMemberIds = communities.flatMap((c: any) => c.members);

    let feedPosts: any = await CommunityPostModel.find({
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
            ? await vendorModel.findById(comment.user).lean()
            : await VendorCommunityModel.findById(comment.user).lean();

        if (Array.isArray(comment.replies)) {
          for (const reply of comment.replies) {
            reply.user =
              reply.commentType === "vendors"
                ? await vendorModel.findById(reply.user).lean()
                : await VendorCommunityModel.findById(reply.user).lean();
          }
        }
      }

      if (Array.isArray(post.tags)) {
        post.tags = await Promise.all(
          post.tags.map(async (tag: any) => {
            let taggedUser = null;

            if (tag.tagType === "vendors") {
              taggedUser = await vendorModel.findById(tag.tagId).lean();
            } else if (tag.tagType === "community") {
              taggedUser = await VendorCommunityModel.findById(
                tag.tagId
              ).lean();
            }

            return {
              ...tag,
              user: taggedUser || null,
            };
          })
        );
      }
    }

    const uniqueFeedPosts = new Map();
    feedPosts.forEach((post: any) =>
      uniqueFeedPosts.set(post._id.toString(), post)
    );
    feedPosts = Array.from(uniqueFeedPosts.values());

    return res.status(200).json({
      message: "Posts fetched successfully",
      data: {
        feedPosts,
      },
    });
  } catch (error: any) {
    console.error("Error fetching feed posts:", error);
    return res.status(500).json({
      message: "Error fetching posts",
      error: error.message,
    });
  }
};

export const followVendor = async (req: any, res: any) => {
  try {
    const { vendorId } = req.params;

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    let followerId: string;
    let followerModel: any;
    let followerName: string;

    // Determine if follower is a user or vendor
    if (req.user.userId) {
      // User following
      followerId = req.user.userId;
      followerModel = await userModel.findById(followerId);
      followerName = followerModel?.name || "A user";
    } else if (req.user._id) {
      // Vendor following
      followerId = req.user._id;
      followerModel = await vendorModel.findById(followerId);
      followerName = followerModel?.storeName || "A vendor";
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    if (!followerModel) {
      return res.status(404).json({ message: "Follower not found" });
    }

    if (followerModel.following.includes(vendorId)) {
      return res.status(400).json({ message: "Already following this vendor" });
    }

    followerModel.following.push(new mongoose.Types.ObjectId(vendorId));
    await followerModel.save();

    vendor.followers.push(new mongoose.Types.ObjectId(followerId));
    await vendor.save();

    // Create notification for the followed vendor
    await NotificationModel.create({
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
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error following vendor", error: error.message });
  }
};

export const joinCommunity = async (req: any, res: any) => {
  try {
    const userId = req.user._id;
    const { communityId } = req.params;

    const community = await VendorCommunityModel.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    const user = await vendorModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.communities.includes(communityId)) {
      return res.status(400).json({ message: "Already in this community" });
    }

    user.communities.push(new mongoose.Types.ObjectId(communityId));
    await user.save();

    community.members.push(userId);
    await community.save();

    // Create notification for community admin
    await NotificationModel.create({
      recipient: community.admin,
      sender: userId,
      type: "Other",
      title: "New Community Member",
      message: `${user.storeName || "A user"} joined your ${
        community.name
      } community`,
      isRead: false,
      metadata: { communityId, memberId: userId },
    });

    return res
      .status(200)
      .json({ message: "Community joined successfully", data: user });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error joining community", error: error.message });
  }
};

export const unfollowVendor = async (req: any, res: any) => {
  try {
    const { vendorId } = req.params;

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    let followerId: string;
    let followerModel: any;

    // Determine if follower is a user or vendor
    if (req.user.userId) {
      // User following
      followerId = req.user.userId;
      followerModel = await userModel.findById(followerId);
    } else if (req.user._id) {
      // Vendor following
      followerId = req.user._id;
      followerModel = await vendorModel.findById(followerId);
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    if (!followerModel) {
      return res.status(404).json({ message: "Follower not found" });
    }

    if (!followerModel.following.some((id: any) => id.equals(vendorId))) {
      return res
        .status(400)
        .json({ message: "You are not following this vendor" });
    }

    followerModel.following = followerModel.following.filter(
      (id: any) => !id.equals(vendorId)
    );
    await followerModel.save();

    vendor.followers = vendor.followers.filter(
      (id: any) => !id.equals(followerId)
    );
    await vendor.save();

    return res
      .status(200)
      .json({ message: "Vendor unfollowed successfully", data: followerModel });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error unfollowing vendor", error: error.message });
  }
};

export const leaveCommunity = async (req: any, res: any) => {
  try {
    const userId = req.user._id;
    const { communityId } = req.params;

    const community = await VendorCommunityModel.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    const user = await vendorModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

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

    user.communities = user.communities.filter(
      (id: any) => id.toString() !== communityId.toString()
    );
    await user.save();

    community.members = community.members.filter(
      (id: any) => id.toString() !== userId.toString()
    );
    await community.save();

    return res.status(200).json({
      message: "Successfully left the community",
      data: user,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error leaving community",
      error: error.message,
    });
  }
};

export const searchVendorOrCommunity = async (req: any, res: any) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    const vendors = await vendorModel.find({
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

    const communities = await VendorCommunityModel.find({
      name: { $regex: query, $options: "i" },
    });

    return res.status(200).json({
      message: "Search results",
      vendors,
      communities,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error searching", error: error.message });
  }
};

export const getVerifiedVendorsAndCommunities = async (req: any, res: any) => {
  try {
    const loggedInVendorId = req.user._id;
    const verifiedVendors = await vendorModel.find({
      emailSent: true,
      _id: { $ne: loggedInVendorId },
    });

    const communities = await VendorCommunityModel.find();

    return res.status(200).json({
      message: "Verified vendors and communities retrieved successfully",
      vendors: verifiedVendors,
      communities: communities,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error retrieving vendors and communities",
      error: error.message,
    });
  }
};

export const getAllPostComments = async (req: any, res: any) => {
  try {
    const { postId } = req.params;

    const post = await CommunityPostModel.findById(postId).populate({
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
  } catch (error: any) {
    return res.status(500).json({
      message: "Error fetching comments",
      error: error.message,
    });
  }
};

export const getUserTotalCommunities = async (req: any, res: any) => {
  try {
    const userId = req.user._id;

    const user = await vendorModel
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
  } catch (error: any) {
    return res.status(500).json({
      message: "Error fetching total communities",
      error: error.message,
    });
  }
};

export const getOneCommunity = async (req: any, res: any) => {
  try {
    const { communityId } = req.params;

    const community = await VendorCommunityModel.findById(communityId)
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
  } catch (error: any) {
    return res.status(500).json({
      message: "Error fetching community",
      error: error.message,
    });
  }
};

export const getAllCommunities = async (req: any, res: any) => {
  try {
    const communities = await VendorCommunityModel.find().populate("admin");

    return res.status(200).json({
      message: "Communities fetched successfully",
      data: communities,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error fetching communities",
      error: error.message,
    });
  }
};

const mutualFriendsCache: {
  [key: string]: { data: any[]; timestamp: number };
} = {};

export const getMutualFriends = async (req: any, res: any) => {
  try {
    const vendorId = req.user._id;
    const currentTime = Date.now();

    if (
      mutualFriendsCache[vendorId] &&
      currentTime - mutualFriendsCache[vendorId].timestamp < 24 * 60 * 60 * 1000
    ) {
      return res.status(200).json({
        message: "Cached mutual friends recommendations",
        data: mutualFriendsCache[vendorId].data,
      });
    }

    const user = await vendorModel.findById(vendorId).populate("following");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const followingIds = user.following.map((f: any) => f._id);
    const mutualFriends = await vendorModel.aggregate([
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
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error fetching mutual friends", error: error.message });
  }
};
