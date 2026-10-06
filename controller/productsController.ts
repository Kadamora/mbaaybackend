import { Request } from "express";
import fs from "fs-extra";
import path from "path";
import { cloudinary, uploadToCloudinary } from "../config/cloudinary";
import { ProductModel } from "../model/productsModel";
import { vendorModel } from "../model/vendorModel";
import mongoose from "mongoose";
import { adminModel } from "../model/adminModel";
import { CartModel } from "../model/cartModel";
import NotificationModel from "../model/notificationsModel";
import { userModel } from "../model/userModel";

export const uploadProduct = async (req: any, res: any) => {
  try {
    const {
      name,
      description,
      price,
      inventory,
      category,
      sub_category,
      sub_category2,
      upload_type,
      productType,
      startingPrice,
      reservePrice,
      auctionDuration,
      auctionStartDate,
      // Flash sale fields
      flashSalePrice,
      flashSaleStartDate,
      flashSaleEndDate,
      flashSaleDiscount,
      originalPrice,
      // NEW: shipping fields
      shippingType,
      shippingFee,
    } = req.body;

    const vendorId = req.user._id;
    const vendor: any = await vendorModel
      .findById(vendorId)
      .populate("products");
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // ✅ Plan limits
    const planLimits: any = {
      Starter: { categories: 1, maxProducts: 5 },
      "Starter plus": { categories: 1, maxProducts: Infinity },
      Shelf: { categories: 2, maxProducts: Infinity },
      Counter: { categories: 3, maxProducts: Infinity },
      Shop: { categories: 5, maxProducts: Infinity },
    };
    const vendorPlan = vendor.storeType;
    const { categories, maxProducts } = planLimits[vendorPlan];

    if (vendor.products.length >= maxProducts) {
      return res.status(400).json({
        message: `You have reached the maximum product limit for ${vendorPlan}.`,
      });
    }

    const uploadedCategories = new Set(
      vendor.products.map((p: any) => p.category.toString()),
    );
    if (
      !uploadedCategories.has(category) &&
      uploadedCategories.size >= categories
    ) {
      return res.status(400).json({
        message: `You can only upload to ${categories} categories in the ${vendorPlan} plan.`,
      });
    }

    // NEW: ✅ Validate shipping fields
    const validShippingTypes = ["Free", "Fixed", "Negotiable"];
    if (!shippingType || !validShippingTypes.includes(shippingType)) {
      return res.status(400).json({
        message:
          "shippingType is required and must be one of: Free, Fixed, Negotiable",
      });
    }

    // Only Fixed needs an upfront fee — Negotiable is agreed later via chat
    if (shippingType === "Fixed") {
      if (
        shippingFee === undefined ||
        shippingFee === null ||
        isNaN(Number(shippingFee)) ||
        Number(shippingFee) <= 0
      ) {
        return res.status(400).json({
          message: "A valid shippingFee is required when shippingType is Fixed",
        });
      }
    }

    // ✅ Validate auction-specific fields
    let auctionEndDate: any, auctionStatus: any;
    if (productType === "auction") {
      if (!startingPrice || !auctionDuration) {
        return res.status(400).json({
          message:
            "Auction products must include startingPrice and auctionDuration",
        });
      }
      if (![1, 3, 5, 7, 10].includes(Number(auctionDuration))) {
        return res.status(400).json({
          message: "Auction duration must be 1, 3, 5, 7, or 10 days",
        });
      }

      const startDate = auctionStartDate
        ? new Date(auctionStartDate)
        : new Date();
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ message: "Invalid auction start date" });
      }
      auctionEndDate = new Date(
        startDate.getTime() + Number(auctionDuration) * 24 * 60 * 60 * 1000,
      );
      auctionStatus = startDate > new Date() ? "Pending" : "Active";
    }

    // ✅ Validate flash sale-specific fields
    let flashSaleStartDateObj: Date | null = null;
    let flashSaleEndDateObj: Date | null = null;
    let flashSaleStatus = "Inactive";

    if (productType === "flash sale") {
      if (!flashSalePrice || !flashSaleStartDate || !flashSaleEndDate) {
        return res.status(400).json({
          message:
            "Flash sale products must include flashSalePrice, flashSaleStartDate, and flashSaleEndDate",
        });
      }

      flashSaleStartDateObj = new Date(flashSaleStartDate);
      flashSaleEndDateObj = new Date(flashSaleEndDate);

      if (
        isNaN(flashSaleStartDateObj.getTime()) ||
        isNaN(flashSaleEndDateObj.getTime())
      ) {
        return res.status(400).json({ message: "Invalid flash sale dates" });
      }

      if (flashSaleStartDateObj >= flashSaleEndDateObj) {
        return res.status(400).json({
          message: "Flash sale start date must be before end date",
        });
      }

      const now = new Date();
      if (flashSaleEndDateObj <= now) {
        return res.status(400).json({
          message: "Flash sale end date must be in the future",
        });
      }

      if (flashSaleStartDateObj > now) {
        flashSaleStatus = "Pending";
      } else if (flashSaleStartDateObj <= now && flashSaleEndDateObj > now) {
        flashSaleStatus = "Active";
      } else {
        flashSaleStatus = "Ended";
      }
    }

    // ✅ Upload images
    if (
      !req.files ||
      !req.files["images"] ||
      req.files["images"].length === 0
    ) {
      return res.status(400).json({ message: "No product images uploaded." });
    }

    const uploadedImages = await Promise.all(
      req.files["images"].map(async (file: Express.Multer.File) => {
        return await uploadToCloudinary(
          file.buffer,
          "products/images",
          "image",
        );
      }),
    );

    let finalVideoUrl: any = "";
    if (upload_type === "upload" && req.files["product_video"]) {
      const videoFile = req.files["product_video"][0];
      finalVideoUrl = await uploadToCloudinary(
        videoFile.buffer,
        "products/videos",
        "video",
      );
    } else if (upload_type === "link" && req.body.product_video) {
      finalVideoUrl = req.body.product_video;
    }

    const newProduct: any = await ProductModel.create({
      name,
      description,
      price:
        productType === "auction"
          ? startingPrice
          : productType === "flash sale"
            ? flashSalePrice
            : price,
      inventory,
      category,
      sub_category,
      sub_category2,
      upload_type,
      product_video: finalVideoUrl,
      images: uploadedImages,
      poster: vendorId,
      verified: true,
      productType,
      // NEW: shipping fields
      shippingType,
      shippingFee: shippingType === "Fixed" ? Number(shippingFee) : 0,
      ...(productType === "auction" && {
        startingPrice,
        reservePrice,
        auctionDuration,
        auctionEndDate,
        auctionStatus,
      }),
      ...(productType === "flash sale" && {
        originalPrice,
        flashSalePrice,
        flashSaleStartDate: flashSaleStartDateObj,
        flashSaleEndDate: flashSaleEndDateObj,
        flashSaleDiscount:
          flashSaleDiscount ||
          Math.round(((originalPrice - flashSalePrice) / originalPrice) * 100),
        flashSaleStatus,
      }),
    });

    vendor.products.push(new mongoose.Types.ObjectId(newProduct._id));
    await vendor.save();

    await NotificationModel.create({
      recipient: vendorId,
      type: "System",
      title: "Product Upload Pending",
      message: `Your product "${name}" has been uploaded`,
      isRead: false,
      metadata: { productId: newProduct._id },
    });

    if (vendor.followers?.length > 0) {
      let title: string;
      let message: string;

      if (productType === "auction") {
        title = "New Auction Alert 🎉";
        message = `Vendor ${
          vendor.storeName
        } has created an auction for "${name}". It will start ${
          auctionStatus === "Pending"
            ? `on ${new Date(auctionStartDate).toLocaleString()}`
            : "soon!"
        }`;
      } else if (productType === "flash sale") {
        title = "New Flash Sale Alert ⚡";
        message = `Vendor ${vendor.storeName} has started a flash sale for "${name}". Limited time offer!`;
      } else {
        title = "New Product Alert 🛍️";
        message = `Vendor ${vendor.storeName} has uploaded a new product "${name}" for normal sale.`;
      }

      await Promise.all(
        vendor.followers.map((followerId: any) =>
          NotificationModel.create({
            recipient: followerId,
            type: "System",
            title,
            message,
            isRead: false,
            metadata: { productId: newProduct._id, vendorId },
          }),
        ),
      );
    }

    return res.status(201).json({
      message: "Product uploaded successfully",
      product: newProduct,
    });
  } catch (error: any) {
    console.error("Upload Error:", error);
    return res
      .status(500)
      .json({ message: "Error uploading product", error: error.message });
  }
};

export const approveProduct = async (req: any, res: any) => {
  try {
    const { productId } = req.params;

    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.verified) {
      return res.status(400).json({ message: "Product is already verified." });
    }

    product.verified = true;
    await product.save();

    // Notify vendor about product approval
    const vendor = await vendorModel.findById(product.poster);
    if (vendor) {
      await NotificationModel.create({
        recipient: vendor._id,
        type: "System",
        title: "Product Approved",
        message: `Your product "${product.name}" has been approved and is now live!`,
        isRead: false,
        metadata: { productId: product._id },
      });
    }

    return res
      .status(200)
      .json({ message: "Product approved successfully", product });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error approving product", error: error.message });
  }
};
export const adminUploadProduct = async (req: any, res: any) => {
  try {
    const {
      name,
      description,
      price,
      inventory,
      category,
      sub_category,
      sub_category2,
      upload_type,
      product_video,
      productType, // "sales" or "auction"
      startingPrice,
      reservePrice,
      auctionDuration, // 1, 3, 5, 7, 10 (days)
      auctionStartDate,
      flashSalePrice,
      flashSaleStartDate,
      flashSaleEndDate,
      flashSaleDiscount,
      originalPrice,
      // NEW: shipping fields
      shippingType,
      shippingFee,
    } = req.body;

    const adminId = req.user._id;

    const admin = await adminModel.findById(adminId);
    if (!admin) {
      return res
        .status(403)
        .json({ message: "Unauthorized. Only admins can upload products." });
    }

    let finalDescription = description || "";
    if (req.file) {
      const txtFilePath = req.file.path;
      const txtContent = fs.readFileSync(txtFilePath, "utf-8");
      finalDescription = finalDescription
        ? `${finalDescription}\n${txtContent}`
        : txtContent;
      fs.unlinkSync(txtFilePath);
    }

    // NEW: ✅ Validate shipping fields (same rules as vendor uploadProduct)
    const validShippingTypes = ["Free", "Fixed", "Negotiable"];
    if (!shippingType || !validShippingTypes.includes(shippingType)) {
      return res.status(400).json({
        message:
          "shippingType is required and must be one of: Free, Fixed, Negotiable",
      });
    }

    if (shippingType === "Fixed") {
      if (
        shippingFee === undefined ||
        shippingFee === null ||
        isNaN(Number(shippingFee)) ||
        Number(shippingFee) <= 0
      ) {
        return res.status(400).json({
          message: "A valid shippingFee is required when shippingType is Fixed",
        });
      }
    }

    // Validate auction-specific fields
    let auctionEndDate: any, auctionStatus: any;
    if (productType === "auction") {
      if (!startingPrice || !auctionDuration) {
        return res.status(400).json({
          message:
            "Auction products must include startingPrice and auctionDuration",
        });
      }
      if (![1, 3, 5, 7, 10].includes(Number(auctionDuration))) {
        return res.status(400).json({
          message: "Auction duration must be 1, 3, 5, 7, or 10 days",
        });
      }

      const startDate = auctionStartDate
        ? new Date(auctionStartDate)
        : new Date();
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ message: "Invalid auction start date" });
      }
      auctionEndDate = new Date(
        startDate.getTime() + Number(auctionDuration) * 24 * 60 * 60 * 1000,
      );
      auctionStatus = startDate > new Date() ? "Pending" : "Active";
    }

    // Validate flash sale-specific fields
    let flashSaleStartDateObj: Date | null = null;
    let flashSaleEndDateObj: Date | null = null;
    let flashSaleStatus = "Inactive";

    if (productType === "flash sale") {
      if (!flashSalePrice || !flashSaleStartDate || !flashSaleEndDate) {
        return res.status(400).json({
          message:
            "Flash sale products must include flashSalePrice, flashSaleStartDate, and flashSaleEndDate",
        });
      }

      flashSaleStartDateObj = new Date(flashSaleStartDate);
      flashSaleEndDateObj = new Date(flashSaleEndDate);

      if (
        isNaN(flashSaleStartDateObj.getTime()) ||
        isNaN(flashSaleEndDateObj.getTime())
      ) {
        return res.status(400).json({ message: "Invalid flash sale dates" });
      }

      if (flashSaleStartDateObj >= flashSaleEndDateObj) {
        return res.status(400).json({
          message: "Flash sale start date must be before end date",
        });
      }

      const now = new Date();
      if (flashSaleEndDateObj <= now) {
        return res.status(400).json({
          message: "Flash sale end date must be in the future",
        });
      }

      // Determine current status
      if (flashSaleStartDateObj > now) {
        flashSaleStatus = "Pending";
      } else if (flashSaleStartDateObj <= now && flashSaleEndDateObj > now) {
        flashSaleStatus = "Active";
      } else {
        flashSaleStatus = "Ended";
      }
    }

    if (
      !req.files ||
      !req.files["images"] ||
      req.files["images"].length === 0
    ) {
      return res.status(400).json({ message: "No product images uploaded." });
    }

    const uploadedImages = await Promise.all(
      req.files["images"].map(async (file: Express.Multer.File) => {
        return await uploadToCloudinary(
          file.buffer,
          "products/images",
          "image",
        );
      }),
    );

    let finalVideoUrl = product_video || "";
    if (
      upload_type === "upload" &&
      req.files["product_video"] &&
      req.files["product_video"].length > 0
    ) {
      const videoFile = req.files["product_video"][0];
      finalVideoUrl = await uploadToCloudinary(
        videoFile.buffer,
        "products/videos",
        "video",
      );
    }

    const productData: any = {
      name,
      description: finalDescription,
      price,
      inventory,
      category,
      sub_category,
      sub_category2,
      upload_type,
      product_video: finalVideoUrl,
      images: uploadedImages,
      verified: true,
      uploadedBy: "admin",
      productType: productType || "sales",
      // NEW: shipping fields
      shippingType,
      shippingFee: shippingType === "Fixed" ? Number(shippingFee) : 0,
    };

    // Auction logic
    if (productType === "auction") {
      if (!startingPrice || !auctionDuration) {
        return res.status(400).json({
          message:
            "Auction products require startingPrice and auctionDuration.",
        });
      }

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + Number(auctionDuration));

      productData.startingPrice = startingPrice;
      productData.reservePrice = reservePrice || null;
      productData.auctionDuration = auctionDuration;
      productData.auctionEndDate = endDate;
      productData.highestBid = { amount: startingPrice };
      productData.auctionStatus = "Active";
    }

    const newProduct = new ProductModel(productData);
    await newProduct.save();

    // Notify all users about the new product uploaded by Mbaay
    const allUsers = await userModel.find({}, "_id");

    let title: string;
    let message: string;

    if (productType === "auction") {
      title = "New Auction Product by Mbaay 🎉";
      message = `A new auction "${name}" has been listed by Mbaay. Place your bid now!`;
    } else if (productType === "flash sale") {
      title = "New Flash Sale by Mbaay ⚡";
      message = `Mbaay has started a flash sale for "${name}". Limited time offer!`;
    } else {
      title = "New Product by Mbaay 🛍️";
      message = `Mbaay has uploaded a new product "${name}" for sale.`;
    }

    const userNotifications = allUsers.map((u: any) => ({
      recipient: u._id,
      type: "System",
      title,
      message,
      isRead: false,
      metadata: { productId: newProduct._id },
    }));

    if (userNotifications.length > 0) {
      await NotificationModel.insertMany(userNotifications);
    }

    return res
      .status(201)
      .json({ message: "Product uploaded successfully", product: newProduct });
  } catch (error: any) {
    console.error("Admin Upload Error:", error);
    return res
      .status(500)
      .json({ message: "Error uploading product", error: error.message });
  }
};

export const rejectProduct = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;
    if (!adminId) {
      return res
        .status(403)
        .json({ message: "Unauthorized. Only admins can reject products." });
    }

    const product = await ProductModel.findById(productId).populate("vendor");
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.verified) {
      return res.status(400).json({
        message: "Product is already approved and cannot be rejected.",
      });
    }

    await ProductModel.findByIdAndDelete(productId);

    const vendor = await vendorModel.findById(product.poster);
    if (vendor) {
      await NotificationModel.create({
        recipient: vendor._id,
        type: "System",
        title: "Product Rejected",
        message: `Your product "${product.name}" was rejected. Reason: ${reason}`,
        isRead: false,
        metadata: { productId: product._id },
      });
    }

    return res
      .status(200)
      .json({ message: "Product rejected and removed successfully" });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error rejecting product", error: error.message });
  }
};

export const getPendingProducts = async (req: Request, res: any) => {
  try {
    const pendingProducts = await ProductModel.find({
      verified: false,
    }).populate("vendor");

    return res.status(200).json({
      message: "Pending products fetched successfully",
      products: pendingProducts,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error fetching pending products",
      error: error.message,
    });
  }
};

export const getUploadedProducts = async (req: any, res: any) => {
  try {
    let products;

    const isAdmin = await adminModel.findById(req.user._id);
    if (isAdmin) {
      products = await ProductModel.find({ uploadedBy: "admin" });
    } else {
      // Vendors can see ALL their products (including suspended ones) on dashboard
      products = await ProductModel.find({
        uploadedBy: { $ne: "admin" },
        poster: req.user._id,
      }).sort({ createdAt: -1 }); // Show newest first
    }

    return res
      .status(200)
      .json({ message: "Products fetched successfully", products });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error fetching products", error: error.message });
  }
};

export const getAllProducts = async (req: Request, res: any) => {
  try {
    // Only return verified products for users (hide suspended products)
    const products = await ProductModel.find({ verified: true });

    return res.status(200).json({
      message: "All products fetched successfully",
      products,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error fetching products",
      error: error.message,
    });
  }
};

export const searchProducts = async (req: Request, res: any) => {
  try {
    const { query, category, subcategory, sub_category2 } = req.query;

    if (!query && !category && !subcategory && !sub_category2) {
      return res.status(400).json({
        message: "At least one search parameter is required",
      });
    }

    const orConditions: any[] = [];
    if (query) {
      orConditions.push({ name: { $regex: query, $options: "i" } });
    }
    if (category) {
      orConditions.push({ category });
    }
    if (subcategory) {
      orConditions.push({ sub_category: subcategory });
    }
    if (sub_category2) {
      orConditions.push({ sub_category2 });
    }

    // Only return verified products for users (hide suspended products)
    const products = await ProductModel.find({
      $and: [{ $or: orConditions }, { verified: true }],
    });

    return res.status(200).json({
      message: "Search results",
      products,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Error searching products",
      error: error.message,
    });
  }
};

export const getOneProduct = async (req: Request, res: any) => {
  try {
    const { productId } = req.params;

    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.uploadedBy === "admin") {
      const admin = await adminModel.findOne();
      // @ts-ignore
      product.poster = admin;
    } else {
      await product.populate("poster");
    }

    return res
      .status(200)
      .json({ message: "Product fetched successfully", product });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching product", error });
  }
};

export const editProduct = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, description, price, inventory, upload_type, product_video } =
      req.body;

    const product: any = await ProductModel.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (req.files && req.files["images"] && req.files["images"].length > 0) {
      const uploadedImages = await Promise.all(
        req.files["images"].map(async (file: Express.Multer.File) => {
          return await uploadToCloudinary(
            file.buffer,
            "products/images",
            "image",
          );
        }),
      );
      product.images = uploadedImages;
    }

    if (upload_type === "upload" && req.files && req.files["product_video"]) {
      const videoFile = req.files["product_video"][0];
      product.product_video = await uploadToCloudinary(
        videoFile.buffer,
        "products/videos",
        "video",
      );
    } else if (upload_type === "link" && product_video) {
      product.product_video = product_video;
    }

    product.name = name ?? product.name;
    product.description = description ?? product.description;
    product.price = price ?? product.price;
    product.inventory = inventory ?? product.inventory;
    product.upload_type = upload_type ?? product.upload_type;

    await product.save();

    // Notify vendor about product update
    const vendor = await vendorModel.findById(product.poster);
    if (vendor) {
      await NotificationModel.create({
        recipient: vendor._id,
        type: "System",
        title: "Product Updated",
        message: `Your product "${product.name}" has been successfully updated.`,
        isRead: false,
        metadata: { productId: product._id },
      });
    }

    return res.status(200).json({
      message: "Product updated successfully",
      product,
    });
  } catch (error: any) {
    console.error("Edit Product Error:", error);
    return res
      .status(500)
      .json({ message: "Error editing product", error: error.message });
  }
};

export const deleteProduct = async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const product = await ProductModel.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await ProductModel.findByIdAndDelete(id);
    const vendor = await vendorModel.findById(product.poster);
    if (vendor) {
      await NotificationModel.create({
        recipient: vendor._id,
        type: "System",
        title: "Product Deleted",
        message: `Your product "${product.name}" has been deleted.`,
        isRead: false,
        metadata: { productId: id },
      });
    }

    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: "Error deleting product", error: error.message });
  }
};

export const addToCart = async (req: any, res: any) => {
  try {
    const { sessionId, productId, quantity } = req.body;
    const userId = req.user?._id;

    if (!sessionId || !productId || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let cart: any = await CartModel.findOne({ sessionId });
    if (!cart) {
      cart = new CartModel({
        sessionId,
        items: [{ product: product._id, quantity }],
      });
    } else {
      const existingItem = cart.items.find(
        (item: any) => item.product.toString() === productId,
      );
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.items.push({ product: product._id, quantity });
      }
    }

    await cart.save();
    await cart.populate("items.product");

    // Notify user about adding product to cart
    if (userId) {
      await NotificationModel.create({
        recipient: userId,
        type: "System",
        title: "Added to Cart",
        message: `You added "${product.name}" to your cart.`,
        isRead: false,
        metadata: { productId, sessionId },
      });
    }

    return res.status(200).json({
      message: "Product added to cart successfully",
      cart,
    });
  } catch (error: any) {
    console.error("Add to cart error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const getCart = async (req: any, res: any) => {
  try {
    const { sessionId } = req.params;

    const cart = await CartModel.findOne({ sessionId }).populate(
      "items.product",
    );

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    res.status(200).json({
      message: "Cart retrieved successfully",
      cart,
    });
  } catch (error: any) {
    console.error("Get Cart Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const removeFromCart = async (req: any, res: any) => {
  try {
    const { sessionId, productId } = req.body;
    const userId = req.user?._id;

    const cart = await CartModel.findOne({ sessionId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId,
    );

    await cart.save();
    await cart.populate("items.product");

    if (userId) {
      await NotificationModel.create({
        recipient: userId,
        type: "System",
        title: "Removed from Cart",
        message: `You removed "${product.name}" from your cart.`,
        isRead: false,
        metadata: { productId, sessionId },
      });
    }

    res.status(200).json({
      message: "Product removed from cart",
      cart,
    });
  } catch (error: any) {
    console.error("Remove From Cart Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateCartQuantity = async (req: any, res: any) => {
  try {
    const { sessionId, productId, quantity } = req.body;
    const userId = req.user?._id;

    if (!quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "Quantity must be greater than 0" });
    }

    const cart = await CartModel.findOne({ sessionId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find(
      (item) => item.product.toString() === productId,
    );
    if (!item) return res.status(404).json({ message: "Item not in cart" });

    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    item.quantity = quantity;
    await cart.save();
    await cart.populate("items.product");

    if (userId) {
      await NotificationModel.create({
        recipient: userId,
        type: "System",
        title: "Cart Quantity Updated",
        message: `You updated the quantity of "${product.name}" to ${quantity} in your cart.`,
        isRead: false,
        metadata: { productId, sessionId, quantity },
      });
    }

    res.status(200).json({
      message: "Cart updated successfully",
      cart,
    });
  } catch (error: any) {
    console.error("Update Cart Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const createAuctionProduct = async (req: any, res: any) => {
  try {
    const {
      name,
      description,
      startingPrice,
      inventory,
      category,
      sub_category,
      sub_category2,
      upload_type,
      product_video,
      productType,
      reservePrice,
      auctionDuration,
      auctionStartDate,
    } = req.body;

    // Ensure user exists
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: No user found" });
    }

    // Check if user is vendor or admin
    const vendor: any = await vendorModel.findById(userId).populate("products");
    const admin = await adminModel.findById(userId);
    if (!vendor && !admin) {
      return res.status(403).json({
        message: "Only vendors or admins can create products",
      });
    }

    // Validate required fields
    if (
      !name ||
      !description ||
      !startingPrice ||
      !inventory ||
      !category ||
      !sub_category ||
      !sub_category2 ||
      !upload_type
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Auction-specific validation
    if (productType === "auction") {
      if (!auctionDuration) {
        return res.status(400).json({
          message: "Auction duration is required for auction products",
        });
      }
      if (![1, 3, 5, 7, 10].includes(auctionDuration)) {
        return res.status(400).json({
          message: "Auction duration must be 1, 3, 5, 7, or 10 days",
        });
      }
    }

    // Vendor-specific limits
    if (vendor) {
      const planLimits: any = {
        Starter: { categories: 1, maxProducts: 30 },
        Shelf: { categories: 2, maxProducts: 50 },
        Counter: { categories: 3, maxProducts: 150 },
        Shop: { categories: 5, maxProducts: 250 },
      };

      const vendorPlan = vendor.storeType;
      const { categories, maxProducts } = planLimits[vendorPlan];

      if (vendor.products.length >= maxProducts) {
        return res.status(400).json({
          message: `You have reached the maximum product limit for ${vendorPlan}.`,
        });
      }

      const uploadedCategories = new Set(
        vendor.products.map((p: any) => p.category.toString()),
      );
      if (
        !uploadedCategories.has(category) &&
        uploadedCategories.size >= categories
      ) {
        return res.status(400).json({
          message: `You can only upload to ${categories} categories in the ${vendorPlan} plan.`,
        });
      }

      // Optional: Enforce return policy
      // if (!vendor.returnPolicy) {
      //   return res
      //     .status(400)
      //     .json({ message: "Please upload your return policy first." });
      // }
    }

    // Upload images
    if (!req.files || !req.files.images || req.files.images.length === 0) {
      return res.status(400).json({ message: "No product images uploaded." });
    }

    const uploadedImages = await Promise.all(
      req.files.images.map(async (file: any) => {
        return await uploadToCloudinary(
          file.buffer,
          "products/images",
          "image",
        );
      }),
    );

    // Handle video upload
    let finalVideoUrl: any = "";
    if (
      upload_type === "upload" &&
      req.files?.product_video &&
      req.files.product_video.length > 0
    ) {
      const videoFile = req.files.product_video[0];
      finalVideoUrl = await uploadToCloudinary(
        videoFile.buffer,
        "products/videos",
        "video",
      );
    } else if (upload_type === "link" && product_video) {
      finalVideoUrl = product_video;
    }

    // Auction start/end dates
    let auctionEndDate;
    if (productType === "auction" && auctionDuration) {
      const startDate = auctionStartDate
        ? new Date(auctionStartDate)
        : new Date();

      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ message: "Invalid auction start date" });
      }

      auctionEndDate = new Date(
        startDate.getTime() + auctionDuration * 24 * 60 * 60 * 1000,
      );
    }

    // Build product data
    const productData: any = {
      name,
      description,
      price: startingPrice,
      startingPrice,
      inventory,
      images: uploadedImages,
      category,
      sub_category,
      sub_category2,
      upload_type,
      product_video: finalVideoUrl,
      productType,
      uploadedBy: admin ? "admin" : null,
      poster: vendor ? userId : undefined,
      verified: !!admin,
    };

    if (productType === "auction") {
      productData.reservePrice = reservePrice;
      productData.auctionDuration = auctionDuration;
      productData.auctionEndDate = auctionEndDate;
      productData.auctionStatus =
        auctionStartDate && new Date(auctionStartDate) > new Date()
          ? "Pending"
          : "Active";
    }

    // Save product
    const newProduct = await ProductModel.create(productData);

    // Post-save actions
    if (vendor) {
      vendor.products.push(newProduct._id);
      await vendor.save();

      // Notify vendor
      await NotificationModel.create({
        recipient: userId,
        type: "System",
        title: "Product Upload Pending",
        message: `Your product "${name}" has been uploaded and is pending admin approval.`,
        isRead: false,
        metadata: { productId: newProduct._id },
      });

      // Notify admin
      const adminUser = await adminModel.findOne();
      if (adminUser) {
        await NotificationModel.create({
          recipient: adminUser._id,
          sender: userId,
          type: "System",
          title: "New Product Pending Approval",
          message: `A new product "${name}" by ${vendor.storeName} is awaiting your approval.`,
          isRead: false,
          metadata: { productId: newProduct._id, vendorId: userId },
        });
      }
    } else if (admin) {
      await NotificationModel.create({
        recipient: userId,
        type: "System",
        title: "Product Uploaded",
        message: `Your product "${name}" has been successfully uploaded.`,
        isRead: false,
        metadata: { productId: newProduct._id },
      });
    }

    // Response
    return res.status(201).json({
      message: "Product uploaded successfully",
      product: newProduct,
    });
  } catch (error: any) {
    console.error("Auction Upload Error:", error);
    return res.status(500).json({
      message: "Error creating auction product",
      error: error.message,
    });
  }
};

export const placeBid = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const { bidAmount } = req.body;

    let bidderId: string;
    let bidderModel: "users" | "vendors";

    if (req.user.userId) {
      bidderId = req.user.userId;
      bidderModel = "users";
    } else if (req.user.id) {
      bidderId = req.user.id;
      bidderModel = "vendors";
    } else {
      return res.status(400).json({ message: "Invalid bidder details" });
    }

    const product: any = await ProductModel.findById(productId);

    if (!product || product.productType !== "auction") {
      return res.status(404).json({ message: "Auction product not found" });
    }

    if (product.auctionStatus !== "Active") {
      return res.status(400).json({ message: "Auction is not active" });
    }

    if (product.auctionEndDate && new Date() > product.auctionEndDate) {
      product.auctionStatus = "Ended";
      await product.save();
      return res.status(400).json({ message: "Auction has already ended" });
    }

    if (bidAmount <= product.highestBid.amount) {
      return res.status(400).json({
        message: "Bid must be higher than current highest bid.",
      });
    }

    const newBid = {
      bidder: bidderId,
      bidderModel,
      amount: bidAmount,
      createdAt: new Date(),
    };

    product.bids.push(newBid);
    product.highestBid = newBid;

    await product.save();

    res.status(200).json({
      success: true,
      message: "Bid placed successfully",
      data: product,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: "Error placing bid", error: error.message });
  }
};

export const viewAuction = async (req: any, res: any) => {
  try {
    const { productId } = req.params;

    const product: any = await ProductModel.findById(productId)
      .populate("poster", "storeName email")
      .populate("bids.bidder", "name storeName email")
      .populate("highestBid.bidder", "name storeName email");

    if (!product || product.productType !== "auction") {
      return res.status(404).json({ message: "Auction not found" });
    }

    // check if auction has ended
    if (
      product.auctionStatus === "Active" &&
      product.auctionEndDate &&
      new Date() > product.auctionEndDate
    ) {
      product.auctionStatus = "Ended";
      await product.save();
    }

    // format bids based on bidder type
    const formattedBids = product.bids
      .map((bid: any) => {
        if (!bid.bidder) return null;
        return {
          amount: bid.amount,
          createdAt: bid.createdAt,
          bidder:
            bid.bidderModel === "vendors"
              ? { storeName: bid.bidder.storeName, email: bid.bidder.email }
              : { name: bid.bidder.name, email: bid.bidder.email },
        };
      })
      .filter(Boolean);

    const formattedHighestBid = product.highestBid?.bidder
      ? product.highestBid.bidderModel === "vendors"
        ? {
            amount: product.highestBid.amount,
            bidder: {
              storeName: product.highestBid.bidder.storeName,
              email: product.highestBid.bidder.email,
            },
          }
        : {
            amount: product.highestBid.amount,
            bidder: {
              name: product.highestBid.bidder.name,
              email: product.highestBid.bidder.email,
            },
          }
      : null;

    res.status(200).json({
      success: true,
      data: {
        ...product.toObject(),
        bids: formattedBids,
        highestBid: formattedHighestBid,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching auction",
      error: error.message,
    });
  }
};

export const viewAllAuctions = async (req: any, res: any) => {
  try {
    const auctions = await ProductModel.find({ productType: "auction" })
      .populate("poster", "storeName email")
      .sort({ createdAt: -1 });

    if (!auctions || auctions.length === 0) {
      return res.status(404).json({ message: "No auctions found" });
    }

    const updatedAuctions = await Promise.all(
      auctions.map(async (auction) => {
        if (
          auction.auctionStatus === "Active" &&
          auction.auctionEndDate &&
          new Date() > auction.auctionEndDate
        ) {
          auction.auctionStatus = "Ended";
          await auction.save();
        }
        return auction;
      }),
    );

    res.status(200).json({
      success: true,
      count: updatedAuctions.length,
      data: updatedAuctions,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching all auctions",
      error: error.message,
    });
  }
};

export const viewAllBids = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const product = await ProductModel.findById(productId)
      .populate("bids.bidder", "name email")
      .select(
        "name bids highestBid auctionStatus startingPrice auctionEndDate reservePrice",
      );

    if (!product || product.productType !== "auction") {
      return res.status(404).json({ message: "Auction product not found" });
    }

    // Update auction status if ended
    if (
      product.auctionStatus === "Active" &&
      product.auctionEndDate &&
      new Date() > product.auctionEndDate
    ) {
      product.auctionStatus = "Ended";
      await product.save();
    }

    res.status(200).json({
      success: true,
      product: product.name,
      auctionStatus: product.auctionStatus,
      startingPrice: product.startingPrice,
      reservePrice: product.reservePrice,
      auctionEndDate: product.auctionEndDate,
      highestBid: product.highestBid,
      totalBids: product.bids?.length || 0,
      bids: product.bids,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching bids",
      error: error.message,
    });
  }
};

export const upgradeBid = async (req: any, res: any) => {
  try {
    const { productId } = req.params;
    const { newBidAmount } = req.body;

    let bidderId: string;
    let bidderModel: "users" | "vendors";

    if (req.user.userId) {
      bidderId = req.user.userId;
      bidderModel = "users";
    } else if (req.user.id) {
      bidderId = req.user.id;
      bidderModel = "vendors";
    } else {
      return res.status(400).json({ message: "Invalid bidder details" });
    }

    const product: any = await ProductModel.findById(productId);
    if (!product || product.productType !== "auction") {
      return res.status(404).json({ message: "Auction product not found" });
    }

    if (product.auctionStatus !== "Active") {
      return res.status(400).json({ message: "Auction is not active" });
    }

    if (product.auctionEndDate && new Date() > product.auctionEndDate) {
      product.auctionStatus = "Ended";
      await product.save();
      return res.status(400).json({ message: "Auction has already ended" });
    }

    const existingBidIndex = product.bids.findIndex(
      (b: any) =>
        b.bidder.toString() === bidderId.toString() &&
        b.bidderModel === bidderModel,
    );

    if (existingBidIndex === -1) {
      return res
        .status(400)
        .json({ message: "No existing bid found to upgrade" });
    }

    const existingBid = product.bids[existingBidIndex];

    if (newBidAmount <= product.highestBid.amount) {
      return res.status(400).json({
        message: "New bid must be higher than the current highest bid.",
      });
    }

    existingBid.amount = newBidAmount;
    existingBid.createdAt = new Date();

    product.highestBid = {
      bidder: bidderId,
      bidderModel,
      amount: newBidAmount,
      createdAt: existingBid.createdAt,
    };

    await product.save();

    res.status(200).json({
      success: true,
      message: "Bid upgraded successfully",
      data: product,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: "Error upgrading bid", error: error.message });
  }
};

export const verifyUnverifiedProducts = async () => {
  try {
    const result = await ProductModel.updateMany(
      { verified: false },
      { $set: { verified: true } },
    );

    console.log(
      `✅ Startup Task: ${result.modifiedCount} products updated to verified.`,
    );
  } catch (error: any) {
    console.error("❌ Error verifying products on startup:", error.message);
  }
};

export const fixMissingBidderModels = async () => {
  try {
    const products: any = await ProductModel.find({
      $or: [
        { "bids.bidderModel": { $exists: false } },
        { "highestBid.bidderModel": { $exists: false } },
      ],
    });

    console.log(`🔍 Found ${products.length} products needing bidderModel fix`);

    for (const product of products) {
      let updated = false;

      for (const bid of product.bids) {
        if (!bid.bidderModel && bid.bidder) {
          const isUser = await userModel.exists({ _id: bid.bidder });
          const isVendor =
            !isUser && (await vendorModel.exists({ _id: bid.bidder }));

          if (isUser) {
            bid.bidderModel = "users";
          } else if (isVendor) {
            bid.bidderModel = "vendors";
          }
          updated = true;
        }
      }

      if (
        product.highestBid &&
        product.highestBid.bidder &&
        !product.highestBid.bidderModel
      ) {
        const isUser = await userModel.exists({
          _id: product.highestBid.bidder,
        });
        const isVendor =
          !isUser &&
          (await vendorModel.exists({ _id: product.highestBid.bidder }));

        if (isUser) {
          product.highestBid.bidderModel = "users";
        } else if (isVendor) {
          product.highestBid.bidderModel = "vendors";
        }
        updated = true;
      }

      if (updated) {
        await product.save();
        console.log(`✅ Fixed product ${product._id}`);
      }
    }

    console.log("🎉 Bidder model migration complete.");
  } catch (err) {
    console.error("❌ Error fixing bidder models:", err);
  }
};
