import { Router } from "express";
import { authenticate } from "../middlewares/jwt_authenticate";
import {
  commentOnComment,
  commentOnPost,
  createCommunity,
  createPost,
  followVendor,
  getAllCommunities,
  getAllPostComments,
  getFeedPosts,
  getMutualFriends,
  getOneCommunity,
  getUserTotalCommunities,
  getVerifiedVendorsAndCommunities,
  joinCommunity,
  leaveCommunity,
  likePost,
  searchVendorOrCommunity,
  unfollowVendor,
  unlikePost,
} from "../controller/communityController";
import { communityImagesUpload, postsImagesUpload } from "../config/multer";

const communityRouter = Router();

communityRouter.post(
  "/create_community",
  authenticate,
  communityImagesUpload,
  createCommunity,
);
communityRouter.post(
  "/create_post",
  authenticate,
  postsImagesUpload,
  createPost,
);
communityRouter.patch("/like_post/:postId", authenticate, likePost);
communityRouter.patch("/comment_on_post/:postId", authenticate, commentOnPost);
communityRouter.patch("/unlike_post/:postId", authenticate, unlikePost);
communityRouter.patch(
  "/comment_on_comment/:postId/:commentId",
  authenticate,
  commentOnComment,
);
communityRouter.get("/get_posts", authenticate, getFeedPosts);
communityRouter.patch("/follow_vendor/:vendorId", authenticate, followVendor);
communityRouter.patch(
  "/join_community/:communityId",
  authenticate,
  joinCommunity,
);
communityRouter.patch(
  "/unfollow_vendor/:vendorId",
  authenticate,
  unfollowVendor,
);
communityRouter.patch(
  "/leave_community/:communityId",
  authenticate,
  leaveCommunity,
);
communityRouter.get(
  "/search_vendor_community",
  authenticate,
  searchVendorOrCommunity,
);
communityRouter.get(
  "/get_vendors_community",
  authenticate,
  getVerifiedVendorsAndCommunities,
);

communityRouter.get("/post/:postId/comments", getAllPostComments);
communityRouter.get(
  "/total-communities",
  authenticate,
  getUserTotalCommunities,
);
communityRouter.get("/one_community/:communityId", getOneCommunity);
communityRouter.get("/all_communities", getAllCommunities);
communityRouter.get(
  "/get_mutual_recommendation",
  authenticate,
  getMutualFriends,
);

export default communityRouter;
