"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = exports.adminProfileUpload = exports.postsImagesUpload = exports.communityImagesUpload = exports.returnPolicyupload = exports.kycUpload = exports.workToolsUpload = exports.businessVideoUpload = exports.businessLogoUpload = exports.avatarUpload = exports.adminUploadProductFiles = exports.uploadProductFiles = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
// Use memory storage for all uploads to work with Cloudinary
const memoryStorage = multer_1.default.memoryStorage();
// File filter functions
const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    }
    else {
        cb(new Error("Only image files are allowed"));
    }
};
const videoFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
        cb(null, true);
    }
    else {
        cb(new Error("Only video files are allowed"));
    }
};
const documentFilter = (req, file, cb) => {
    const allowedMimes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("Only PDF and image files are allowed"));
    }
};
const ReturnPolicystorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path_1.default.join(__dirname, "../uploads/users");
        fs_extra_1.default.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
// Product uploads (images and video)
exports.uploadProductFiles = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB total
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "product_video") {
            videoFilter(req, file, cb);
        }
        else if (file.fieldname === "images") {
            imageFilter(req, file, cb);
        }
        else {
            cb(new Error("Unexpected field"));
        }
    },
}).fields([
    { name: "images", maxCount: 10 },
    { name: "product_video", maxCount: 1 },
]);
// Admin product uploads (same as vendor but for admin)
exports.adminUploadProductFiles = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB total
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "product_video") {
            videoFilter(req, file, cb);
        }
        else if (file.fieldname === "images") {
            imageFilter(req, file, cb);
        }
        else {
            cb(new Error("Unexpected field"));
        }
    },
}).fields([
    { name: "images", maxCount: 10 },
    { name: "product_video", maxCount: 1 },
]);
// Avatar upload
exports.avatarUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: imageFilter,
}).single("avatar");
// Business logo upload
exports.businessLogoUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: imageFilter,
}).single("businessLogo");
// Business video upload
exports.businessVideoUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: videoFilter,
}).single("businessVideo");
// Work tools upload (multiple images, max 8)
exports.workToolsUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
    fileFilter: imageFilter,
}).array("workTools", 8);
// KYC document upload
exports.kycUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
    fileFilter: documentFilter,
}).fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
]);
// Return policy upload
exports.returnPolicyupload = (0, multer_1.default)({
    storage: ReturnPolicystorage,
    limits: { fieldSize: 1024 * 1024 },
}).single("returnPolicy");
// Community images upload
exports.communityImagesUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: imageFilter,
}).single("community_Images");
// Community posts images upload (multiple)
exports.postsImagesUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
    fileFilter: imageFilter,
}).array("posts_Images", 20);
// Admin profile image upload
exports.adminProfileUpload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: imageFilter,
}).single("profileImage");
// Generic upload for various purposes
exports.upload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});
