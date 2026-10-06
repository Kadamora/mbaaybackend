"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = exports.cloudinary = void 0;
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
const streamifier_1 = __importDefault(require("streamifier"));
cloudinary_1.v2.config({
    cloud_name: "yhujp1bl",
    api_key: "835945155399426",
    api_secret: "eTkelYznkG7IncQ7Q9RFHeIQcFQ",
    secure: true,
});
const uploadToCloudinary = (fileBuffer, folder, resource_type) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({
            folder,
            resource_type,
        }, (err, result) => {
            if (err)
                reject(err);
            else
                resolve(result === null || result === void 0 ? void 0 : result.secure_url);
        });
        streamifier_1.default.createReadStream(fileBuffer).pipe(stream);
    });
};
exports.uploadToCloudinary = uploadToCloudinary;
