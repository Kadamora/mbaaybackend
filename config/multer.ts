import multer from "multer";
import path from "path";
import fs from "fs-extra";

// Use memory storage for all uploads to work with Cloudinary
const memoryStorage = multer.memoryStorage();

// File filter functions
const imageFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const videoFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Only video files are allowed"));
  }
};

const documentFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and image files are allowed"));
  }
};

const ReturnPolicystorage = multer.diskStorage({
  destination: (req: any, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads/users");
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Product uploads (images and video)
export const uploadProductFiles = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB total
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "product_video") {
      videoFilter(req, file, cb);
    } else if (file.fieldname === "images") {
      imageFilter(req, file, cb);
    } else {
      cb(new Error("Unexpected field"));
    }
  },
}).fields([
  { name: "images", maxCount: 10 },
  { name: "product_video", maxCount: 1 },
]);

// Admin product uploads (same as vendor but for admin)
export const adminUploadProductFiles = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB total
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "product_video") {
      videoFilter(req, file, cb);
    } else if (file.fieldname === "images") {
      imageFilter(req, file, cb);
    } else {
      cb(new Error("Unexpected field"));
    }
  },
}).fields([
  { name: "images", maxCount: 10 },
  { name: "product_video", maxCount: 1 },
]);

// Avatar upload
export const avatarUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
}).single("avatar");

// Business logo upload
export const businessLogoUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
}).single("businessLogo");

// Business video upload
export const businessVideoUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: videoFilter,
}).single("businessVideo");

// Work tools upload (multiple images, max 8)
export const workToolsUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: imageFilter,
}).array("workTools", 8);

// KYC document upload
export const kycUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: documentFilter,
}).fields([
  { name: "front", maxCount: 1 },
  { name: "back", maxCount: 1 },
]);

// Return policy upload
export const returnPolicyupload = multer({
  storage: ReturnPolicystorage,
  limits: { fieldSize: 1024 * 1024 },
}).single("returnPolicy");

// Community images upload
export const communityImagesUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
}).single("community_Images");

// Community posts images upload (multiple)
export const postsImagesUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: imageFilter,
}).array("posts_Images", 20);

// Admin profile image upload
export const adminProfileUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
}).single("profileImage");

// Generic upload for various purposes
export const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});
