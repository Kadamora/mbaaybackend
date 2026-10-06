import { Router } from "express";
import { authenticate } from "../middlewares/jwt_authenticate";
import { uploadProductFiles, adminUploadProductFiles } from "../config/multer";
import {
  addToCart,
  adminUploadProduct,
  approveProduct,
  deleteProduct,
  editProduct,
  getAllProducts,
  getCart,
  getOneProduct,
  getPendingProducts,
  getUploadedProducts,
  placeBid,
  rejectProduct,
  removeFromCart,
  searchProducts,
  updateCartQuantity,
  upgradeBid,
  uploadProduct,
  viewAllAuctions,
  viewAllBids,
  viewAuction,
} from "../controller/productsController";

const productRouter = Router();

productRouter.post(
  "/upload_products",
  authenticate,
  uploadProductFiles,
  uploadProduct
);
productRouter.post(
  "/admin_upload_products",
  authenticate,
  adminUploadProductFiles,
  adminUploadProduct
);

productRouter.get("/all", getAllProducts);

productRouter.get("/search", searchProducts);

productRouter.get("/uploaded-products", authenticate, getUploadedProducts);

productRouter.get("/review-requests", authenticate, getPendingProducts);

productRouter.patch("/approve/:productId", authenticate, approveProduct);

productRouter.patch("/reject/:productId", authenticate, rejectProduct);

productRouter.patch("/edit/:id", uploadProductFiles, editProduct);

productRouter.delete("/delete/:id", deleteProduct);

productRouter.post("/addtocart", addToCart);

productRouter.get("/get/:sessionId", getCart);

productRouter.patch("/removefromcart", removeFromCart);

productRouter.patch("/update-quantity", updateCartQuantity);

productRouter.post(
  "/upload_auction_products",
  authenticate,
  uploadProductFiles,
  uploadProduct
);

productRouter.patch("/place_bid/:productId", authenticate, placeBid);

productRouter.patch("/upgrade_bid/:productId", authenticate, upgradeBid);

productRouter.get("/view_an_auction_product/:productId", viewAuction);

productRouter.get("/view_all_auction_products", viewAllAuctions);

productRouter.get("/view_all_bids/:productId", viewAllBids);

productRouter.get("/:productId", getOneProduct);

export default productRouter;
