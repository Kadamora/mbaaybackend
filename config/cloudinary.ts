import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

cloudinary.config({
  cloud_name: "yhujp1bl",
  api_key: "835945155399426",
  api_secret: "eTkelYznkG7IncQ7Q9RFHeIQcFQ",
  secure: true,
});

const uploadToCloudinary = (
  fileBuffer: Buffer,
  folder: string,
  resource_type: any,
) => {
  return new Promise((resolve: any, reject: any) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type,
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result?.secure_url);
      },
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

export { cloudinary, uploadToCloudinary };
