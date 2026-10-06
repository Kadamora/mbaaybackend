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
exports.updateProductShippingFee = exports.getVendorPendingShippingOrders = exports.getMyPendingShippingOrders = exports.setOrderItemShippingFee = exports.handleOrderReturnApproval = exports.handleCancellationOrPostponement = exports.submitOrderReturn = exports.submitOrderCancellationOrPostponement = exports.confirmOrderReceived = exports.getOneOrder = exports.getAdminOrders = exports.getVendorOrders = exports.paymentCallback = exports.checkout = exports.paystack = void 0;
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const cartModel_1 = require("../model/cartModel");
const productsModel_1 = require("../model/productsModel");
const orderModel_1 = require("../model/orderModel");
const vendorModel_1 = require("../model/vendorModel");
const adminModel_1 = require("../model/adminModel");
const tempPaymentModel_1 = require("../model/tempPaymentModel");
const path_1 = __importDefault(require("path"));
const email_1 = require("../config/email");
const ejs_1 = __importDefault(require("ejs"));
const invoiceModel_1 = require("../model/invoiceModel");
const userModel_1 = require("../model/userModel");
const mongoose_1 = __importDefault(require("mongoose"));
const notificationsModel_1 = __importDefault(require("../model/notificationsModel"));
const PAYSTACK_SECRET_KEY = "sk_live_8e60afeb1befc22f297e02606b679decd84dbeb4";
exports.paystack = axios_1.default.create({
    baseURL: "https://api.paystack.co",
    headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
    },
});
function addCustomerAndPayment(vendor, customerId, paymentData) {
    return __awaiter(this, void 0, void 0, function* () {
        vendor.orders = vendor.orders || [];
        vendor.customers = vendor.customers || [];
        vendor.payments = vendor.payments || [];
        // 🔍 Detect model type
        let modelType = "users"; // default
        const customerIsVendor = yield vendorModel_1.vendorModel.findById(customerId);
        if (customerIsVendor) {
            modelType = "vendors";
        }
        else {
            const customerIsUser = yield userModel_1.userModel.findById(customerId);
            if (!customerIsUser) {
                throw new Error("Customer not found in users or vendors collection");
            }
        }
        // ✅ Add / Update customer
        const existingCustomerIndex = vendor.customers.findIndex((c) => { var _a; return ((_a = c.customer) === null || _a === void 0 ? void 0 : _a.toString()) === customerId.toString(); });
        if (existingCustomerIndex === -1) {
            vendor.customers.push({
                customer: customerId,
                status: "Active",
                modelType,
            });
        }
        else {
            vendor.customers[existingCustomerIndex].status = "Active";
            vendor.customers[existingCustomerIndex].modelType = modelType;
            vendor.customers[existingCustomerIndex].lastOrderDate = new Date();
        }
        // ✅ Add payment (align with refPath)
        vendor.payments.push(Object.assign(Object.assign({}, paymentData), { customer: customerId, modelType }));
        yield vendor.save();
    });
}
const VAT_RATE = 0.1; // NEW
const checkout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { sessionId, userId } = req.params;
        const buyerInfo = req.body;
        const requiredFields = [
            "first_name",
            "last_name",
            "region",
            "city",
            "email",
            "phone",
            "address",
            "postalCode",
            "country",
            "paymentOption",
        ];
        for (const field of requiredFields) {
            if (!buyerInfo[field]) {
                return res
                    .status(400)
                    .json({ message: `Missing required field: ${field}` });
            }
        }
        const cart = yield cartModel_1.CartModel.findOne({ sessionId }).populate("items.product");
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ message: "Cart is empty or not found." });
        }
        let totalAmount = 0;
        let totalShippingFee = 0; // NEW — only Fixed fees count here, Negotiable is 0 for now
        let hasPendingShipping = false; // NEW
        const ordersByVendor = {};
        const ordersByAdmin = { orders: [], amount: 0 };
        const orderItems = [];
        // First pass: Validate inventory, resolve prices AND shipping status
        for (const item of cart.items) {
            const product = item.product;
            if (!product || product.inventory < item.quantity) {
                throw new Error(`Insufficient stock for ${(product === null || product === void 0 ? void 0 : product.name) || "unknown product"}`);
            }
            let effectivePrice = product.price;
            if (product.productType === "flash sale" &&
                product.flashSaleStatus === "Active") {
                effectivePrice = product.flashSalePrice;
            }
            const itemTotal = item.quantity * effectivePrice;
            totalAmount += itemTotal;
            // NEW: resolve this item's shipping fee + status
            let itemShippingFee = 0;
            let itemShippingStatus = "Not Required";
            if (product.shippingType === "Fixed") {
                itemShippingFee = product.shippingFee || 0;
                itemShippingStatus = "Agreed"; // fee is already fixed by the vendor
            }
            else if (product.shippingType === "Negotiable") {
                itemShippingFee = 0; // nothing charged now
                itemShippingStatus = "Pending Agreement";
                hasPendingShipping = true;
            }
            // "Free" stays 0 / "Not Required"
            totalShippingFee += itemShippingFee;
            orderItems.push({
                product: product._id,
                quantity: item.quantity,
                price: effectivePrice,
                total: itemTotal,
                shippingFee: itemShippingFee, // NEW
                shippingStatus: itemShippingStatus, // NEW
            });
        }
        // Second pass: Get vendor info (unchanged)
        for (const item of orderItems) {
            const product = yield productsModel_1.ProductModel.findById(item.product);
            if (!product)
                continue;
            const posterId = (_a = product.poster) === null || _a === void 0 ? void 0 : _a.toString();
            if (posterId) {
                const vendor = yield vendorModel_1.vendorModel.findById(posterId);
                if (vendor) {
                    ordersByVendor[posterId] = ordersByVendor[posterId] || {
                        orders: [],
                        amount: 0,
                    };
                    ordersByVendor[posterId].amount += item.total;
                }
                else {
                    const admin = yield adminModel_1.adminModel.findById(posterId);
                    if (admin)
                        ordersByAdmin.amount += item.total;
                }
            }
        }
        // NEW: VAT + grand total (Negotiable shipping contributes 0 for now)
        const vatAmount = totalAmount * VAT_RATE;
        const grandTotal = totalAmount + totalShippingFee + vatAmount;
        const reference = `order_${userId}_${(0, uuid_1.v4)()}`;
        const grandTotalKobo = grandTotal * 100; // CHANGED: was totalAmount * 100
        const user_Id = new mongoose_1.default.Types.ObjectId(userId);
        const formattedBuyerInfo = {
            first_name: buyerInfo.first_name,
            last_name: buyerInfo.last_name,
            email: buyerInfo.email,
            phone: buyerInfo.phone,
            address: buyerInfo.address,
            country: buyerInfo.country,
            region: buyerInfo.region,
            city: buyerInfo.city,
            postalCode: buyerInfo.postalCode,
            sessionId,
            userId: user_Id,
            companyName: buyerInfo.companyName || "",
            apartment: buyerInfo.apartment || "",
            saveInfo: buyerInfo.saveInfo || false,
            couponCode: buyerInfo.couponCode || "",
        };
        yield tempPaymentModel_1.TempPaymentModel.create({
            reference,
            userId: user_Id,
            sessionId,
            ordersByVendor,
            ordersByAdmin,
            cartItems: cart.items,
            buyerInfo: formattedBuyerInfo,
            paymentOption: buyerInfo.paymentOption,
            // NEW: persist the breakdown so paymentCallback stays consistent
            subtotal: totalAmount,
            shippingFee: totalShippingFee,
            vat: vatAmount,
            totalAmount: grandTotal,
        });
        // NEW: shared note shown to the buyer when at least one item still
        // needs a shipping fee agreed via chat
        const shippingNote = hasPendingShipping
            ? "One or more items have shipping fees still to be agreed with the vendor via chat. You'll be notified once agreed, and it will be payable on delivery."
            : undefined;
        // Pay Before Delivery
        if (buyerInfo.paymentOption === "Pay Before Delivery") {
            const paymentData = {
                email: buyerInfo.email,
                amount: grandTotalKobo, // CHANGED: now includes Fixed shipping + VAT (Negotiable stays out until agreed)
                reference,
                callback_url: `https://www.mbaay.com/payment_callback`,
                metadata: Object.assign(Object.assign({ userId }, buyerInfo), { subtotal: totalAmount, shippingFee: totalShippingFee, vat: vatAmount, grandTotal }),
            };
            const response = yield exports.paystack.post("/transaction/initialize", paymentData);
            yield notificationsModel_1.default.create({
                recipient: user_Id,
                type: "Transaction",
                title: "Payment Initiated",
                message: `Your payment for order ${reference} has been initiated.`,
                isRead: false,
                metadata: { reference, amount: grandTotal },
            });
            return res.status(200).json({
                message: "Payment initialized (Pay Before Delivery)",
                authorization_url: response.data.data.authorization_url,
                reference,
                // NEW: breakdown + pending-shipping note returned to client
                breakdown: {
                    subtotal: totalAmount,
                    shippingFee: totalShippingFee,
                    vat: vatAmount,
                    total: grandTotal,
                },
                hasPendingShipping,
                shippingNote,
            });
        }
        // Pay After Delivery - Create single order with multiple items
        const newOrder = yield orderModel_1.OrderModel.create({
            items: orderItems,
            buyerSession: sessionId,
            userId: user_Id,
            totalPrice: totalAmount,
            shippingFee: totalShippingFee, // NEW
            vat: vatAmount, // NEW
            grandTotal, // NEW
            hasPendingShipping, // NEW
            status: "Pending",
            paymentOption: "Pay After Delivery",
            payStatus: "Pending",
            buyerInfo: formattedBuyerInfo,
        });
        // Reduce product inventory and create invoices
        for (const item of orderItems) {
            const product = yield productsModel_1.ProductModel.findById(item.product);
            if (!product)
                continue;
            product.inventory -= item.quantity;
            yield product.save();
            const vendor = yield vendorModel_1.vendorModel.findById(product.poster);
            const vendorId = (_b = product.poster) === null || _b === void 0 ? void 0 : _b.toString();
            if (vendorId && ordersByVendor[vendorId]) {
                const existingInvoice = yield invoiceModel_1.InvoiceModel.findOne({
                    order: newOrder._id,
                    vendor: vendor === null || vendor === void 0 ? void 0 : vendor._id,
                });
                if (!existingInvoice) {
                    yield invoiceModel_1.InvoiceModel.create({
                        order: newOrder._id,
                        vendor: vendor === null || vendor === void 0 ? void 0 : vendor._id,
                        amount: ordersByVendor[vendorId].amount,
                        status: "Unpaid",
                        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        paymentOption: "Pay After Delivery",
                    });
                }
            }
            if (vendor) {
                yield addCustomerAndPayment(vendor, user_Id, {
                    paymentId: `COD_${newOrder._id}`,
                    status: "Pending",
                    amount: item.total,
                });
                // NEW: let the vendor know right away if this item needs a
                // shipping fee agreed via chat before delivery
                const vendorMessage = item.shippingStatus === "Pending Agreement"
                    ? `You received a new order for ${product.name} (Order ID: ${newOrder._id}). Remember to agree a shipping fee with the buyer via chat.`
                    : `You received a new order for ${product.name} (Order ID: ${newOrder._id}).`;
                yield notificationsModel_1.default.create({
                    recipient: vendor._id,
                    sender: user_Id,
                    type: "Transaction",
                    title: "New Order Received",
                    message: vendorMessage,
                    isRead: false,
                    metadata: { orderId: newOrder._id, productId: product._id },
                });
            }
        }
        yield userModel_1.userModel.findByIdAndUpdate(userId, {
            $push: { orders: newOrder._id },
        });
        yield cartModel_1.CartModel.findOneAndUpdate({ sessionId }, { items: [] });
        yield tempPaymentModel_1.TempPaymentModel.deleteOne({ reference });
        return res.status(200).json({
            message: "Order placed successfully with Pay on Delivery",
            paymentStatus: "Pending",
            reference,
            orderData: newOrder,
            // NEW: breakdown + pending-shipping note returned to client
            breakdown: {
                subtotal: totalAmount,
                shippingFee: totalShippingFee,
                vat: vatAmount,
                total: grandTotal,
            },
            hasPendingShipping,
            shippingNote,
        });
    }
    catch (err) {
        console.error("Checkout Error:", err);
        return res
            .status(500)
            .json({ message: "Checkout error", error: err.message });
    }
});
exports.checkout = checkout;
const paymentCallback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    var _c, _d, _e;
    try {
        const { reference } = req.query;
        if (!reference) {
            return res.status(400).json({ message: "Reference is required" });
        }
        const verifyResponse = yield exports.paystack.get(`/transaction/verify/${reference}`);
        const { status } = verifyResponse.data.data;
        if (status !== "success") {
            yield notificationsModel_1.default.create({
                recipient: verifyResponse.data.data.metadata.userId,
                type: "Transaction",
                title: "Payment Failed",
                message: `Payment for order ${reference} was not successful.`,
                isRead: false,
                metadata: { reference },
            });
            return res.status(400).json({
                errorCode: "ERR_PAYMENT_FAILED",
                errorMessage: "Payment not successful",
            });
        }
        const tempPayment = yield tempPaymentModel_1.TempPaymentModel.findOne({ reference });
        if (!tempPayment) {
            return res.status(404).json({
                errorCode: "ERR_PAYMENT_NOT_FOUND",
                errorMessage: "Payment record not found",
            });
        }
        const { sessionId, buyerInfo, cartItems } = tempPayment;
        const userId = (_a = tempPayment.userId) === null || _a === void 0 ? void 0 : _a.toString();
        if (!userId) {
            return res.status(400).json({
                errorCode: "ERR_NO_USER_ID",
                errorMessage: "User ID missing from payment session",
            });
        }
        // Prepare orderItems, totalAmount AND shipping status, mirroring checkout
        let totalAmount = 0;
        let totalShippingFee = 0; // NEW
        let hasPendingShipping = false; // NEW
        const orderItems = [];
        for (const item of cartItems) {
            const product = yield productsModel_1.ProductModel.findById(item.product);
            if (!product || product.inventory < item.quantity)
                continue;
            let effectivePrice = product.price;
            if (product.productType === "flash sale" &&
                product.flashSaleStatus === "Active") {
                effectivePrice = product.flashSalePrice;
            }
            totalAmount += item.quantity * effectivePrice;
            // NEW: resolve shipping fee/status the same way checkout did
            let itemShippingFee = 0;
            let itemShippingStatus = "Not Required";
            if (product.shippingType === "Fixed") {
                itemShippingFee = product.shippingFee || 0;
                itemShippingStatus = "Agreed";
            }
            else if (product.shippingType === "Negotiable") {
                itemShippingFee = 0;
                itemShippingStatus = "Pending Agreement";
                hasPendingShipping = true;
            }
            totalShippingFee += itemShippingFee;
            orderItems.push({
                product: product._id,
                quantity: item.quantity,
                price: effectivePrice,
                total: item.quantity * effectivePrice,
                shippingFee: itemShippingFee, // NEW
                shippingStatus: itemShippingStatus, // NEW
            });
        }
        // NEW: prefer the amounts locked in at checkout time (what was actually
        // charged on Paystack); fall back to a fresh calc if for some reason
        // they weren't stored.
        const vatAmount = (_c = tempPayment.vat) !== null && _c !== void 0 ? _c : totalAmount * VAT_RATE;
        totalShippingFee = (_d = tempPayment.shippingFee) !== null && _d !== void 0 ? _d : totalShippingFee;
        const grandTotal = (_e = tempPayment.totalAmount) !== null && _e !== void 0 ? _e : totalAmount + totalShippingFee + vatAmount;
        const user_Id = new mongoose_1.default.Types.ObjectId(userId);
        const buyerInfoFixed = Object.assign(Object.assign({}, buyerInfo), { sessionId, userId: user_Id });
        const newOrder = yield orderModel_1.OrderModel.create({
            items: orderItems,
            buyerSession: sessionId,
            userId: user_Id,
            totalPrice: totalAmount,
            shippingFee: totalShippingFee, // NEW
            vat: vatAmount, // NEW
            grandTotal, // NEW
            hasPendingShipping, // NEW
            status: "Processing",
            payStatus: "Successful",
            buyerInfo: buyerInfoFixed,
            paymentOption: "Pay Before Delivery",
        });
        const vendorIds = new Set();
        for (const item of orderItems) {
            const product = yield productsModel_1.ProductModel.findById(item.product);
            if (!product)
                continue;
            product.inventory -= item.quantity;
            yield product.save();
            const posterId = (_b = product.poster) === null || _b === void 0 ? void 0 : _b.toString();
            const amountKobo = item.total * 100;
            if (posterId) {
                const vendor = yield vendorModel_1.vendorModel.findById(posterId);
                if (vendor) {
                    vendorIds.add(posterId);
                    const existingInvoice = yield invoiceModel_1.InvoiceModel.findOne({
                        orderId: newOrder._id,
                        poster: vendor._id,
                    });
                    if (!existingInvoice) {
                        yield invoiceModel_1.InvoiceModel.create({
                            orderId: newOrder._id,
                            poster: vendor._id,
                            posterRole: "vendor",
                            amount: item.total,
                            status: "Paid",
                            dueDate: new Date(),
                            paymentOption: "Pay Before Delivery",
                        });
                    }
                    yield addCustomerAndPayment(vendor, user_Id, {
                        paymentId: reference,
                        status: "Successful",
                        amount: item.total,
                    });
                    // NEW: nudge vendor to agree shipping if this item needs it
                    const vendorMessage = item.shippingStatus === "Pending Agreement"
                        ? `You received a new order for ${product.name} (Order ID: ${newOrder._id}). Remember to agree a shipping fee with the buyer via chat.`
                        : `You received a new order for ${product.name} (Order ID: ${newOrder._id}).`;
                    yield notificationsModel_1.default.create({
                        recipient: vendor._id,
                        sender: userId,
                        type: "Transaction",
                        title: "New Order Received",
                        message: vendorMessage,
                        isRead: false,
                        metadata: { orderId: newOrder._id, productId: product._id },
                    });
                }
                else {
                    const admin = yield adminModel_1.adminModel.findById(posterId);
                    if (admin) {
                        const existingInvoice = yield invoiceModel_1.InvoiceModel.findOne({
                            orderId: newOrder._id,
                            poster: admin._id,
                        });
                        if (!existingInvoice) {
                            yield invoiceModel_1.InvoiceModel.create({
                                orderId: newOrder._id,
                                poster: admin._id,
                                posterRole: "admin",
                                amount: item.total,
                                status: "Paid",
                                dueDate: new Date(),
                                paymentOption: "Pay Before Delivery",
                            });
                        }
                        yield exports.paystack.post("/transfer", {
                            source: "balance",
                            amount: amountKobo,
                            recipient: "RCP_3bamtvdjhy9vqku",
                            reason: `Admin payment ${newOrder._id}`,
                            reference: `admin_${newOrder._id}_${(0, uuid_1.v4)()}`,
                        });
                        yield notificationsModel_1.default.create({
                            recipient: admin._id,
                            sender: userId,
                            type: "Transaction",
                            title: "New Order Received",
                            message: `You received a new order for ${product.name} (Order ID: ${newOrder._id}).`,
                            isRead: false,
                            metadata: { orderId: newOrder._id, productId: product._id },
                        });
                    }
                }
            }
        }
        for (const vendorId of vendorIds) {
            yield vendorModel_1.vendorModel.findByIdAndUpdate(vendorId, {
                $addToSet: { orders: newOrder._id },
            });
        }
        const user = yield userModel_1.userModel.findById(userId);
        if (user) {
            user.orders || (user.orders = []);
            user.orders.push(newOrder._id);
            yield user.save();
        }
        else {
            const buyerVendor = yield vendorModel_1.vendorModel.findById(userId);
            if (buyerVendor) {
                buyerVendor.my_bought_products_orders || (buyerVendor.my_bought_products_orders = []);
                buyerVendor.my_bought_products_orders.push(newOrder._id);
                yield buyerVendor.save();
            }
        }
        yield cartModel_1.CartModel.findOneAndUpdate({ sessionId }, { $set: { items: [] } });
        yield tempPaymentModel_1.TempPaymentModel.deleteOne({ reference });
        yield newOrder.populate("items.product");
        const emailTemplatePath = path_1.default.join(__dirname, "..", "..", "view", "orderconfirmed.ejs");
        const subtotal = newOrder.totalPrice;
        const htmlContent = yield ejs_1.default.renderFile(emailTemplatePath, {
            customerName: `${buyerInfo.first_name} ${buyerInfo.last_name}`,
            orderNumber: reference,
            orderDate: new Date().toLocaleDateString(),
            paymentMethod: "Paystack",
            transactionId: reference,
            items: newOrder.items.map((item) => { var _a; return ({
                image: ((_a = item.product.images) === null || _a === void 0 ? void 0 : _a[0]) || "",
                name: item.product.name,
                description: item.product.description,
                origin: `${item.product.category}/${item.product.sub_category}/${item.product.sub_category2}`,
                quantity: item.quantity,
                sku: item.product._id,
                price: item.price,
            }); }),
            subtotal,
            shipping: totalShippingFee, // CHANGED: was hardcoded 25; excludes any Negotiable amount not yet agreed
            discount: 0,
            tax: vatAmount, // CHANGED: was subtotal * 0.05
            total: grandTotal, // CHANGED: was subtotal + 25 + subtotal * 0.05
            pendingShippingNote: hasPendingShipping // NEW — surface in template if you want to mention it
                ? "Shipping fee for one or more items is still being agreed with the vendor and will be collected on delivery."
                : null,
            shippingAddress: {
                name: `${buyerInfo.first_name} ${buyerInfo.last_name}`,
                street: buyerInfo.address || "N/A",
                city: buyerInfo.city || "N/A",
                state: buyerInfo.region || "N/A",
                zipCode: buyerInfo.postalCode || "000000",
                country: buyerInfo.country || "N/A",
            },
            estimatedDelivery: "June 20 - June 25, 2025",
            trackingUrl: `https://mbaay.com/track/${reference}`,
            socialLinks: {
                facebook: "https://facebook.com/mbaay",
                instagram: "https://instagram.com/mbaay",
                twitter: "https://twitter.com/mbaay",
            },
            unsubscribeUrl: `https://mbaay.com/unsubscribe?user=${userId}`,
            privacyUrl: "https://mbaay.com/privacy-policy",
        });
        yield (0, email_1.sendMail)(buyerInfo.email, "Your Order Has Been Confirmed", htmlContent);
        yield notificationsModel_1.default.create({
            recipient: userId,
            type: "Transaction",
            title: "Payment Successful",
            message: `Your payment for order ${reference} was successful.`,
            isRead: false,
            metadata: { reference, amount: grandTotal },
        });
        return res.status(200).json({
            message: "Payment confirmed and order placed",
            orderId: reference,
            orderData: newOrder,
            // NEW: breakdown + pending-shipping note returned to client
            breakdown: {
                subtotal: totalAmount,
                shippingFee: totalShippingFee,
                vat: vatAmount,
                total: grandTotal,
            },
            hasPendingShipping,
            shippingNote: hasPendingShipping
                ? "One or more items have shipping fees still to be agreed with the vendor via chat. You'll be notified once agreed, and it will be payable on delivery."
                : undefined,
        });
    }
    catch (err) {
        console.error("❌ paymentCallback error:", err);
        return res.status(500).json({
            errorCode: "ERR_CALLBACK_FAILED",
            errorMessage: err.message || "Unexpected server error",
        });
    }
});
exports.paymentCallback = paymentCallback;
// export const paystackWebhook = async (req: any, res: any) => {
//   try {
//     const event = req.body;
//     const reason = event?.data?.reason || "";
//     const match = reason.match(/(?:order|admin)_(\w{24})/);
//     if (!match || !match[1]) {
//       console.warn("Invalid or missing order ID in reason:", reason);
//       return res
//         .status(400)
//         .json({ message: "Invalid order ID in webhook reason" });
//     }
//     const orderId = match[1];
//     if (event.event === "transfer.success") {
//       const order = await OrderModel.findById(orderId).populate("product");
//       if (order) {
//         await OrderModel.findByIdAndUpdate(orderId, {
//           payStatus: "Successful",
//           status: "Processing",
//         });
//         // Notify buyer about successful transfer
//         await NotificationModel.create({
//           recipient: order.userId,
//           type: "Transaction",
//           title: "Order Processing",
//           message: `Your order (ID: ${orderId}) is now being processed.`,
//           isRead: false,
//           metadata: { orderId },
//         });
//         // Notify vendor or admin
//         const product: any = order.product;
//         const posterId = product?.poster?.toString();
//         if (posterId) {
//           const vendor = await vendorModel.findById(posterId);
//           if (vendor) {
//             await NotificationModel.create({
//               recipient: vendor._id,
//               sender: order.userId,
//               type: "Transaction",
//               title: "Order Processing",
//               message: `Order (ID: ${orderId}) is now being processed.`,
//               isRead: false,
//               metadata: { orderId },
//             });
//           } else {
//             const admin = await adminModel.findById(posterId);
//             if (admin) {
//               await NotificationModel.create({
//                 recipient: admin._id,
//                 sender: order.userId,
//                 type: "Transaction",
//                 title: "Order Processing",
//                 message: `Order (ID: ${orderId}) is now being processed.`,
//                 isRead: false,
//                 metadata: { orderId },
//               });
//             }
//           }
//         }
//       }
//     } else if (event.event === "transfer.failed") {
//       const order = await OrderModel.findById(orderId);
//       if (order) {
//         await OrderModel.findByIdAndUpdate(orderId, {
//           payStatus: "Payment Failed",
//         });
//         // Notify buyer about failed transfer
//         await NotificationModel.create({
//           recipient: order.userId,
//           type: "Transaction",
//           title: "Payment Failed",
//           message: `Payment for order (ID: ${orderId}) failed. Please try again.`,
//           isRead: false,
//           metadata: { orderId },
//         });
//       }
//     }
//     return res.status(200).json({ message: "Webhook received" });
//   } catch (err: any) {
//     console.error("Webhook error:", err);
//     return res
//       .status(500)
//       .json({ message: "Webhook error", error: err.message });
//   }
// };
const getVendorOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const orders = yield orderModel_1.OrderModel.find().populate({
            path: "items.product",
            select: "poster uploadedBy name price",
        });
        // Fixed: was checking order.product (doesn't exist) → now checks inside items
        const vendorOrders = orders.filter((order) => order.items.some((item) => { var _a, _b; return ((_b = (_a = item.product) === null || _a === void 0 ? void 0 : _a.poster) === null || _b === void 0 ? void 0 : _b.toString()) === vendorId.toString(); }));
        return res.status(200).json({
            success: true,
            message: "Vendor orders retrieved successfully",
            orders: vendorOrders,
        });
    }
    catch (err) {
        console.error("Vendor Orders Error:", err);
        return res.status(500).json({
            message: "Error fetching vendor orders",
            error: err.message,
        });
    }
});
exports.getVendorOrders = getVendorOrders;
const getAdminOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield orderModel_1.OrderModel.find().populate({
            path: "items.product", // Fixed: was "product"
            select: "uploadedBy name price",
        });
        // Fixed: was checking order.product → now checks inside items
        const adminOrders = orders.filter((order) => order.items.some((item) => { var _a; return ((_a = item.product) === null || _a === void 0 ? void 0 : _a.uploadedBy) === "admin"; }));
        return res.status(200).json({
            success: true,
            message: "Admin orders retrieved successfully",
            orders: adminOrders,
        });
    }
    catch (err) {
        console.error("Admin Orders Error:", err);
        return res.status(500).json({
            message: "Error fetching admin orders",
            error: err.message,
        });
    }
});
exports.getAdminOrders = getAdminOrders;
const getOneOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { orderId } = req.params;
        const order = yield orderModel_1.OrderModel.findById(orderId).populate({
            path: "items.product", // Fixed: was "product"
            select: "name price poster uploadedBy images",
        });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        return res.status(200).json({
            success: true,
            message: "Order fetched successfully",
            order,
        });
    }
    catch (err) {
        console.error("Get One Order Error:", err);
        return res.status(500).json({
            message: "Error fetching order",
            error: err.message,
        });
    }
});
exports.getOneOrder = getOneOrder;
const confirmOrderReceived = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { orderId } = req.params;
        // FIXED: Populate items correctly to match your schema
        const order = yield orderModel_1.OrderModel.findById(orderId).populate({
            path: "items.product",
            model: "products",
        });
        if (!order) {
            return res.status(404).json({ message: "Order not found." });
        }
        if (order.status === "Delivered") {
            return res
                .status(400)
                .json({ message: "Order has already been delivered." });
        }
        // FIXED: Update status to "Delivered" (matches your enum)
        order.status = "Delivered";
        order.deliveryDate = new Date();
        yield order.save();
        // Notify buyer about order delivery
        yield notificationsModel_1.default.create({
            recipient: order.userId,
            type: "Transaction",
            title: "Order Delivered",
            message: `Your order (ID: ${orderId}) has been marked as delivered. Vendor payouts will be processed within 2-3 business days.`,
            isRead: false,
            metadata: { orderId },
        });
        // Notify vendors that order is delivered and payouts will be processed soon
        const vendorNotifications = [];
        const processedVendors = new Set();
        for (const item of order.items) {
            const product = item.product;
            if (!product || !product.poster) {
                continue; // Skip items without poster
            }
            const posterId = product.poster.toString();
            if (processedVendors.has(posterId)) {
                continue; // Already notified this vendor
            }
            processedVendors.add(posterId);
            const vendor = yield vendorModel_1.vendorModel.findById(posterId);
            if (vendor) {
                vendorNotifications.push(notificationsModel_1.default.create({
                    recipient: vendor._id,
                    type: "Transaction",
                    title: "Order Delivered",
                    message: `Order ${orderId} has been delivered to the customer. Your payout will be processed within 2-3 business days.`,
                    isRead: false,
                    metadata: { orderId },
                }));
            }
        }
        // Execute vendor notifications
        if (vendorNotifications.length > 0) {
            yield Promise.all(vendorNotifications);
        }
        return res.status(200).json({
            message: `Order ${orderId} confirmed as delivered. Vendor payouts will be processed automatically within 2-3 business days.`,
            orderId,
            totalAmount: order.totalPrice,
            vendorsNotified: vendorNotifications.length,
        });
    }
    catch (error) {
        console.error("❌ Confirm Order Error:", error);
        if (((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.status) === "failed") {
            const order = yield orderModel_1.OrderModel.findById(req.params.orderId);
            if (order) {
                // Optionally update order status or create a log
                yield notificationsModel_1.default.create({
                    recipient: new mongoose_1.default.Types.ObjectId("admin_id_here"),
                    type: "System",
                    title: "Payout Failed",
                    message: `Payout for order ${req.params.orderId} failed: ${error.message}`,
                    isRead: false,
                    metadata: { orderId: req.params.orderId, error: error.message },
                });
            }
        }
        return res.status(500).json({
            message: "Failed to confirm order",
            error: error.message || "Unknown error",
        });
    }
});
exports.confirmOrderReceived = confirmOrderReceived;
// ====== ORDER MANAGEMENT LOGIC ======
const submitOrderCancellationOrPostponement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { orderId, selectedItems, email, firstName, lastName, phone, postalCode, address, country, state, city, isCancellation, isPostponement, cancellationReason, postponementFromDate, postponementToDate, } = req.body;
        // ✅ Validate required fields (matches your buyerInfo schema)
        if (!orderId ||
            !email ||
            !firstName ||
            !lastName ||
            !phone ||
            !address ||
            !country ||
            !state ||
            !city) {
            return res
                .status(400)
                .json({ message: "All personal and order details are required" });
        }
        if (isCancellation && isPostponement) {
            return res.status(400).json({
                message: "Please select only one option: cancellation or postponement",
            });
        }
        if (!isCancellation && !isPostponement) {
            return res.status(400).json({
                message: "Please select whether you want to cancel or postpone the order",
            });
        }
        // ✅ VALIDATE SELECTED ITEMS
        if (!selectedItems ||
            !Array.isArray(selectedItems) ||
            selectedItems.length === 0) {
            return res.status(400).json({
                message: "Please select at least one item to cancel or postpone",
            });
        }
        // ✅ Fetch order with populated items (matches your schema)
        const order = yield orderModel_1.OrderModel.findById(orderId).populate({
            path: "items.product",
            model: "products",
        });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        // ✅ Validate buyer email (matches your buyerInfo schema exactly)
        if (((_a = order.buyerInfo) === null || _a === void 0 ? void 0 : _a.email) !== email) {
            return res
                .status(403)
                .json({ message: "Order does not match the provided email" });
        }
        // ✅ VALIDATE SELECTED ITEMS AGAINST ORDER
        const selectedItemsMap = new Map();
        let totalSelectedQuantity = 0;
        let totalSelectedAmount = 0;
        for (const selectedItem of selectedItems) {
            const { productId, quantity } = selectedItem;
            if (!productId || !quantity || quantity <= 0) {
                return res.status(400).json({
                    message: "Invalid selected item: productId and quantity are required",
                });
            }
            const orderItem = order.items.find((item) => item.product._id.toString() === productId.toString());
            if (!orderItem) {
                return res.status(400).json({
                    message: `Selected product ${productId} not found in order`,
                });
            }
            const itemQuantity = parseInt(quantity, 10);
            if (itemQuantity > orderItem.quantity) {
                return res.status(400).json({
                    message: `Cannot select ${itemQuantity} of ${orderItem.product.name}. Available: ${orderItem.quantity}`,
                });
            }
            selectedItemsMap.set(productId.toString(), Object.assign(Object.assign({}, orderItem.toObject()), { requestedQuantity: itemQuantity }));
            totalSelectedQuantity += itemQuantity;
            totalSelectedAmount +=
                orderItem.total * (itemQuantity / orderItem.quantity);
        }
        const isPartial = selectedItems.length < order.items.length ||
            totalSelectedQuantity <
                order.items.reduce((sum, item) => sum + item.quantity, 0);
        const vendorNotifications = [];
        const admin = yield adminModel_1.adminModel.findOne();
        let requestType = "";
        let reasonOrDates = "";
        // ✅ CREATE returnDetails EXACTLY MATCHING YOUR SCHEMA
        const returnDetails = {
            reason: "",
            condition: isCancellation ? "Not Received" : "Pending Postponement",
            method: "Customer Request",
            comments: `Partial: ${isPartial ? "Yes" : "No"} | Selected ${selectedItems.length} items`,
            requestedAt: new Date(),
            returnedProducts: Array.from(selectedItemsMap.values()).map((item) => ({
                productId: item.product._id, // ✅ Matches your schema: ObjectId ref "products"
                quantity: item.requestedQuantity, // ✅ Matches your schema: Number required
            })),
        };
        if (isCancellation) {
            if (!cancellationReason) {
                return res
                    .status(400)
                    .json({ message: "Cancellation reason is required" });
            }
            requestType = "Cancellation";
            reasonOrDates = cancellationReason;
            // ✅ Set status to exact enum value from your schema
            order.status = "Cancellation Requested";
            // ✅ Set reason in returnDetails (matches your schema)
            returnDetails.reason = cancellationReason;
            // ✅ DO NOT REMOVE ITEMS IMMEDIATELY - only for delivered orders
            // Note: Your schema doesn't have deliveryDate, so we'll skip this check
            // Items will be kept until vendor/admin approval
        }
        else if (isPostponement) {
            if (!postponementFromDate || !postponementToDate) {
                return res
                    .status(400)
                    .json({ message: "Postponement dates are required" });
            }
            const fromDate = new Date(postponementFromDate);
            const toDate = new Date(postponementToDate);
            if (fromDate >= toDate) {
                return res.status(400).json({
                    message: "Postponement 'from' date must be before 'to' date",
                });
            }
            requestType = "Postponement";
            reasonOrDates = `From: ${postponementFromDate} To: ${postponementToDate}`;
            // ✅ Set status to exact enum value from your schema
            order.status = "Postponement Requested";
            // ✅ Set postponementDates (matches your schema exactly)
            order.postponementDates = {
                from: fromDate,
                to: toDate,
            };
            // ✅ Set reason in returnDetails (matches your schema)
            returnDetails.reason = "Postponement Request";
            // ✅ Set postponedQuantity (matches your schema)
            order.postponedQuantity = totalSelectedQuantity;
        }
        // ✅ ALWAYS STORE returnDetails (matches your schema exactly)
        order.returnDetails = returnDetails;
        // ✅ CRITICAL: DO NOT REMOVE ITEMS IMMEDIATELY
        // Items stay in order.items until vendor/admin approval
        yield order.save();
        console.log(`✅ ${requestType} request stored for order ${orderId}. Items kept in order until approval.`);
        // ✅ NOTIFY VENDORS FOR THEIR SELECTED ITEMS ONLY
        const vendorMap = {};
        for (const [productId, item] of selectedItemsMap) {
            const product = item.product;
            if (!product || !product.poster)
                continue;
            const posterId = product.poster.toString();
            if (!vendorMap[posterId]) {
                const vendor = yield vendorModel_1.vendorModel.findById(posterId);
                if (vendor) {
                    // ✅ Only notify verified vendors
                    vendorMap[posterId] = {
                        vendor,
                        items: [],
                        totalQuantity: 0,
                        totalAmount: 0,
                    };
                }
            }
            if (vendorMap[posterId]) {
                vendorMap[posterId].items.push(item);
                vendorMap[posterId].totalQuantity += item.requestedQuantity;
                vendorMap[posterId].totalAmount +=
                    item.total * (item.requestedQuantity / item.quantity);
            }
        }
        // ✅ Create notifications for each vendor (using storeName)
        for (const [vendorId, data] of Object.entries(vendorMap)) {
            if (data.vendor) {
                const vendorName = data.vendor.storeName; // ✅ Matches your vendor model
                const notificationMessage = isCancellation
                    ? `Customer has requested to cancel ${data.items.length} items from order ${orderId}. Total Quantity: ${data.totalQuantity}, Reason: ${cancellationReason}. Customer: ${firstName} ${lastName} (${email})`
                    : `Customer has requested to postpone ${data.items.length} items from order ${orderId} from ${postponementFromDate} to ${postponementToDate}. Total Quantity: ${data.totalQuantity}. Customer: ${firstName} ${lastName} (${email})`;
                vendorNotifications.push(notificationsModel_1.default.create({
                    recipient: data.vendor._id,
                    sender: order.userId,
                    type: "Transaction",
                    title: isCancellation
                        ? "Order Cancellation Request"
                        : "Order Postponement Request",
                    message: notificationMessage,
                    isRead: false,
                    metadata: Object.assign(Object.assign({ orderId: orderId.toString(), type: isCancellation ? "cancellation" : "postponement" }, (isCancellation
                        ? { reason: cancellationReason }
                        : {
                            fromDate: postponementFromDate,
                            toDate: postponementToDate,
                        })), { vendorName: vendorName, itemCount: data.items.length, totalQuantity: data.totalQuantity, totalAmount: data.totalAmount, selectedItems: data.items.map((item) => ({
                            productId: item.product._id,
                            name: item.product.name,
                            quantity: item.requestedQuantity,
                            price: item.price,
                        })) }),
                }));
            }
        }
        // ✅ ADMIN NOTIFICATION (using "Mbaay")
        if (admin) {
            yield notificationsModel_1.default.create({
                recipient: admin._id,
                sender: order.userId,
                type: "Transaction",
                title: `${requestType} Request`,
                message: `${requestType} request for order ${orderId}. Customer: ${firstName} ${lastName} (${email}). Selected ${selectedItems.length} items. Details: ${reasonOrDates}`,
                isRead: false,
                metadata: Object.assign(Object.assign({ orderId: orderId.toString(), type: requestType.toLowerCase() }, (isCancellation
                    ? { reason: cancellationReason }
                    : {
                        fromDate: postponementFromDate,
                        toDate: postponementToDate,
                    })), { selectedItemsCount: selectedItems.length, totalSelectedQuantity,
                    totalSelectedAmount, selectedItems: Array.from(selectedItemsMap.values()).map((item) => ({
                        productId: item.product._id,
                        name: item.product.name,
                        quantity: item.requestedQuantity,
                        price: item.price,
                    })) }),
            });
        }
        // ✅ Execute all vendor notifications
        if (vendorNotifications.length > 0) {
            yield Promise.all(vendorNotifications);
        }
        // ✅ EMAIL with selected items details
        const selectedItemsList = Array.from(selectedItemsMap.values())
            .map((item) => `<li><strong>${item.product.name}</strong> - Quantity: ${item.requestedQuantity}</li>`)
            .join("");
        const emailContent = `
      <h2>Order ${requestType} Request Submitted</h2>
      <p>Dear ${firstName} ${lastName},</p>
      <p>Your ${requestType.toLowerCase()} request for order <strong>${orderId}</strong> has been submitted successfully.</p>
      <p><strong>Selected Items:</strong></p>
      <ul>${selectedItemsList}</ul>
      <p><strong>Request Details:</strong></p>
      <ul>
        <li>Order ID: ${orderId}</li>
        <li>Request Type: ${requestType}</li>
        <li>Items Selected: ${selectedItems.length}</li>
        <li>Total Quantity: ${totalSelectedQuantity}</li>
        <li>Details: ${reasonOrDates}</li>
        ${isPartial
            ? `<li>Status: Partial request (some items remain)</li>`
            : `<li>Status: Complete request (all items affected)</li>`}
        <li><strong>Next Steps:</strong> Your items will remain in the order until vendors/Mbaay review and approve this request.</li>
      </ul>
      <p>We will notify you within 24-48 hours once all responses are received.</p>
      <p>Thank you for your patience.</p>
    `;
        yield (0, email_1.sendMail)(email, `Order ${requestType} Request Confirmation`, emailContent);
        return res.status(200).json({
            message: `${requestType} request submitted successfully. Items stored in returnDetails and will remain in order until approval.`,
            requestType: isCancellation ? "cancellation" : "postponement",
            orderId: orderId.toString(),
            selectedItemsCount: selectedItems.length,
            totalSelectedQuantity,
            totalSelectedAmount: Math.round(totalSelectedAmount),
            isPartial,
            itemsKeptInOrder: true, // ✅ Key indicator
            orderStatus: order.status, // ✅ Current status
            selectedItems: Array.from(selectedItemsMap.values()).map((item) => ({
                productId: item.product._id,
                name: item.product.name,
                quantity: item.requestedQuantity,
                price: item.price,
            })),
        });
    }
    catch (error) {
        console.error("❌ Order Cancellation/Postponement Error:", error);
        return res.status(500).json({
            message: "Failed to submit request",
            error: error.message || "Unknown error",
        });
    }
});
exports.submitOrderCancellationOrPostponement = submitOrderCancellationOrPostponement;
const submitOrderReturn = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { orderId, email, firstName, lastName, phone, postalCode, address, country, state, city, returnReason, productCondition, returnMethod, additionalComments, returnedProducts, // ✅ Array: [{ productId, quantity }]
         } = req.body;
        // Validate required fields
        if (!orderId ||
            !email ||
            !firstName ||
            !lastName ||
            !phone ||
            !address ||
            !country ||
            !state ||
            !city ||
            !returnReason ||
            !productCondition ||
            !returnMethod) {
            return res.status(400).json({
                message: "All personal, order, and return details are required",
            });
        }
        // ✅ VALIDATE RETURNED PRODUCTS
        if (!returnedProducts ||
            !Array.isArray(returnedProducts) ||
            returnedProducts.length === 0) {
            return res.status(400).json({
                message: "Please select at least one product to return",
            });
        }
        // FIXED: Populate items correctly to match your schema
        const order = yield orderModel_1.OrderModel.findById(orderId).populate({
            path: "items.product",
            model: "products",
        });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        // ✅ VALIDATE ORDER STATUS
        if (order.status !== "Delivered") {
            return res.status(400).json({
                message: "Only delivered orders can be returned",
            });
        }
        // ✅ VALIDATE RETURN WINDOW (30 days from delivery)
        const deliveryDate = order.deliveryDate || order.createdAt;
        const currentDate = new Date();
        const daysDifference = Math.floor((currentDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDifference > 30) {
            return res.status(400).json({
                message: "Return window has expired (30 days from delivery)",
            });
        }
        // ✅ VALIDATE BUYER OWNERSHIP
        if (order.buyerInfo && order.buyerInfo.email !== email) {
            return res
                .status(403)
                .json({ message: "Order does not match the provided email" });
        }
        // ✅ VALIDATE SELECTED PRODUCTS AGAINST ORDER
        const returnedProductsMap = new Map();
        let totalReturnQuantity = 0;
        let totalReturnAmount = 0;
        for (const returnItem of returnedProducts) {
            const { productId, quantity } = returnItem;
            if (!productId || !quantity || quantity <= 0) {
                return res.status(400).json({
                    message: "Invalid return item: productId and quantity are required",
                });
            }
            const orderItem = order.items.find((item) => item.product._id.toString() === productId.toString());
            if (!orderItem) {
                return res.status(400).json({
                    message: `Product ${productId} not found in order`,
                });
            }
            const returnQuantity = parseInt(quantity, 10);
            if (returnQuantity > orderItem.quantity) {
                return res.status(400).json({
                    message: `Cannot return ${returnQuantity} of ${orderItem.product.name}. Available: ${orderItem.quantity}`,
                });
            }
            returnedProductsMap.set(productId.toString(), Object.assign(Object.assign({}, orderItem.toObject()), { requestedQuantity: returnQuantity }));
            totalReturnQuantity += returnQuantity;
            totalReturnAmount +=
                orderItem.total * (returnQuantity / orderItem.quantity);
        }
        const isPartialReturn = returnedProducts.length < order.items.length ||
            totalReturnQuantity <
                order.items.reduce((sum, item) => sum + item.quantity, 0);
        // ✅ UPDATE ORDER STATUS AND RETURN DETAILS (matches your schema exactly)
        order.status = "Return Requested";
        // ✅ Update returnedQuantity
        order.returnedQuantity =
            (order.returnedQuantity || 0) + totalReturnQuantity;
        order.returnDetails = {
            reason: returnReason,
            condition: productCondition,
            method: returnMethod,
            comments: additionalComments ||
                `Partial return: ${isPartialReturn ? "Yes" : "No"} | ${returnedProducts.length} items selected`,
            requestedAt: new Date(),
            returnedProducts: Array.from(returnedProductsMap.values()).map((item) => ({
                productId: item.product._id,
                quantity: item.requestedQuantity,
            })),
        };
        // ✅ OPTIONAL: Update order.items for partial returns (remove returned quantities)
        if (isPartialReturn) {
            const remainingItems = order.items
                .map((item) => {
                const returnedItem = returnedProductsMap.get(item.product._id.toString());
                if (returnedItem && returnedItem.requestedQuantity < item.quantity) {
                    // Partial return for this item
                    return {
                        product: item.product._id,
                        quantity: item.quantity - returnedItem.requestedQuantity,
                        price: item.price,
                        total: item.total *
                            ((item.quantity - returnedItem.requestedQuantity) /
                                item.quantity),
                    };
                }
                else if (!returnedItem) {
                    // Item not returned
                    return item;
                }
                // Full return for this item - exclude it
                return null;
            })
                .filter(Boolean);
            order.items = remainingItems;
            order.totalPrice = remainingItems.reduce((sum, item) => sum + item.total, 0);
        }
        yield order.save();
        // ✅ NOTIFY VENDORS FOR THEIR RETURNED ITEMS ONLY
        const vendorNotifications = [];
        const vendorMap = {};
        for (const [productId, item] of returnedProductsMap) {
            const product = item.product;
            if (!product || !product.poster)
                continue;
            const posterId = product.poster.toString();
            if (!vendorMap[posterId]) {
                const vendor = yield vendorModel_1.vendorModel.findById(posterId);
                vendorMap[posterId] = {
                    vendor,
                    items: [],
                    totalQuantity: 0,
                    totalAmount: 0,
                };
            }
            vendorMap[posterId].items.push(item);
            vendorMap[posterId].totalQuantity += item.requestedQuantity;
            vendorMap[posterId].totalAmount +=
                item.total * (item.requestedQuantity / item.quantity);
        }
        // Create notifications for each vendor
        for (const [vendorId, data] of Object.entries(vendorMap)) {
            if (data.vendor) {
                vendorNotifications.push(notificationsModel_1.default.create({
                    recipient: data.vendor._id,
                    sender: order.userId,
                    type: "Transaction",
                    title: "Order Return Request",
                    message: `Customer requested to return ${data.items.length} items from order ${orderId}. Total Quantity: ${data.totalQuantity}, Reason: ${returnReason}, Condition: ${productCondition}, Method: ${returnMethod}.`,
                    isRead: false,
                    metadata: {
                        orderId,
                        type: "return",
                        reason: returnReason,
                        condition: productCondition,
                        method: returnMethod,
                        itemCount: data.items.length,
                        totalQuantity: data.totalQuantity,
                        totalAmount: data.totalAmount,
                        returnedItems: data.items.map((item) => ({
                            productId: item.product._id,
                            name: item.product.name,
                            quantity: item.requestedQuantity,
                            price: item.price,
                        })),
                    },
                }));
            }
        }
        // ✅ ADMIN NOTIFICATION
        const admin = yield adminModel_1.adminModel.findOne();
        if (admin) {
            yield notificationsModel_1.default.create({
                recipient: admin._id,
                sender: order.userId,
                type: "Transaction",
                title: "Order Return Request",
                message: `Return request submitted for order ${orderId}. Customer: ${firstName} ${lastName} (${email}). ${returnedProducts.length} items selected for return. Reason: ${returnReason}.`,
                isRead: false,
                metadata: {
                    orderId,
                    type: "return",
                    reason: returnReason,
                    condition: productCondition,
                    method: returnMethod,
                    returnedProductsCount: returnedProducts.length,
                    totalReturnQuantity,
                    totalReturnAmount: Math.round(totalReturnAmount),
                    isPartialReturn,
                    returnedProducts: Array.from(returnedProductsMap.values()).map((item) => ({
                        productId: item.product._id,
                        name: item.product.name,
                        quantity: item.requestedQuantity,
                        price: item.price,
                    })),
                },
            });
        }
        // Execute all vendor notifications
        if (vendorNotifications.length > 0) {
            yield Promise.all(vendorNotifications);
        }
        // ✅ DETAILED EMAIL NOTIFICATION
        const returnedItemsList = Array.from(returnedProductsMap.values())
            .map((item) => `<li><strong>${item.product.name}</strong> - Quantity: ${item.requestedQuantity} - Price: ₦${item.price.toLocaleString()}</li>`)
            .join("");
        const emailContent = `
      <h2>Order Return Request Submitted</h2>
      <p>Dear ${firstName} ${lastName},</p>
      <p>Your return request for order <strong>${orderId}</strong> has been submitted successfully.</p>
      <p><strong>Items selected for return:</strong></p>
      <ul>${returnedItemsList}</ul>
      <p><strong>Return Details:</strong></p>
      <ul>
        <li><strong>Reason:</strong> ${returnReason}</li>
        <li><strong>Product Condition:</strong> ${productCondition}</li>
        <li><strong>Return Method:</strong> ${returnMethod}</li>
        ${additionalComments
            ? `<li><strong>Comments:</strong> ${additionalComments}</li>`
            : ""}
        <li><strong>Total Items:</strong> ${returnedProducts.length}</li>
        <li><strong>Total Quantity:</strong> ${totalReturnQuantity}</li>
        ${isPartialReturn
            ? `<li><strong>Status:</strong> Partial return</li>`
            : `<li><strong>Status:</strong> Complete return</li>`}
      </ul>
      <p>We will review your request and contact you within 24-48 hours with return instructions.</p>
      <p>Thank you for shopping with us!</p>
    `;
        yield (0, email_1.sendMail)(email, "Order Return Request Confirmation", emailContent);
        return res.status(200).json({
            message: "Return request submitted successfully. We will contact you within 24-48 hours.",
            orderId,
            returnedProductsCount: returnedProducts.length,
            totalReturnQuantity,
            totalReturnAmount: Math.round(totalReturnAmount),
            isPartialReturn,
            returnDetails: {
                reason: returnReason,
                condition: productCondition,
                method: returnMethod,
                status: "Return Requested",
            },
            returnedProducts: Array.from(returnedProductsMap.values()).map((item) => ({
                productId: item.product._id,
                name: item.product.name,
                quantity: item.requestedQuantity,
                price: item.price,
                total: item.price * item.requestedQuantity,
            })),
        });
    }
    catch (error) {
        console.error("❌ Order Return Error:", error);
        return res.status(500).json({
            message: "Failed to submit return request",
            error: error.message || "Unknown error",
        });
    }
});
exports.submitOrderReturn = submitOrderReturn;
const handleCancellationOrPostponement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { orderId, actorId, actorType, action, comments } = req.body;
        // actorType: 'vendor' or 'admin'
        // actorId: vendor._id or admin._id (product.poster)
        // action: 'accept' or 'reject'
        if (!orderId ||
            !actorId ||
            !actorType ||
            !["vendor", "admin"].includes(actorType) ||
            !["accept", "reject"].includes(action)) {
            return res.status(400).json({
                message: "orderId, actorId, actorType (vendor/admin), and action (accept/reject) are required",
            });
        }
        const order = yield orderModel_1.OrderModel.findById(orderId).populate({
            path: "items.product",
            model: "products",
        });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        if (!["Cancellation Requested", "Postponement Requested"].includes(order.status)) {
            return res.status(400).json({
                message: "Order is not in a state to process cancellation or postponement",
            });
        }
        if (!order.returnDetails ||
            !order.returnDetails.returnedProducts ||
            order.returnDetails.returnedProducts.length === 0) {
            return res.status(400).json({
                message: "No cancellation or postponement request found for this order",
            });
        }
        const actorItems = order.items.filter((item) => { var _a; return ((_a = item.product.poster) === null || _a === void 0 ? void 0 : _a.toString()) === actorId; });
        if (actorItems.length === 0) {
            return res.status(403).json({
                message: `${actorType} does not have any items in this order`,
            });
        }
        const actorRequestedItems = order.returnDetails.returnedProducts.filter((rp) => actorItems.some((item) => item.product._id.toString() === rp.productId.toString()));
        if (actorRequestedItems.length === 0) {
            return res.status(400).json({
                message: `No ${order.status.toLowerCase()} items found for this ${actorType}`,
            });
        }
        const isCancellation = order.status === "Cancellation Requested";
        const requestType = isCancellation ? "Cancellation" : "Postponement";
        const notifications = [];
        const buyerEmail = ((_a = order.buyerInfo) === null || _a === void 0 ? void 0 : _a.email) || "";
        const buyerName = `${((_b = order.buyerInfo) === null || _b === void 0 ? void 0 : _b.first_name) || ""} ${((_c = order.buyerInfo) === null || _c === void 0 ? void 0 : _c.last_name) || ""}`.trim();
        let actorName = "";
        if (actorType === "vendor") {
            const vendor = yield vendorModel_1.vendorModel.findById(actorId);
            if (!vendor) {
                return res.status(404).json({ message: "Vendor not found" });
            }
            actorName = vendor.storeName;
        }
        else {
            actorName = "Mbaay";
        }
        // ✅ Track responses in returnDetails.comments (your schema doesn't have respondedActors)
        const existingComments = order.returnDetails.comments || "";
        const responseComment = `\n${new Date().toISOString().split("T")[0]} ${new Date().toLocaleTimeString()}: ${actorName} (${actorType}) ${action === "accept" ? "APPROVED" : "REJECTED"}: ${comments || "No comments provided"}`;
        // ✅ Prevent duplicate responses
        if (existingComments.includes(`${actorId} ${action}`)) {
            return res.status(400).json({
                message: `${actorType} (${actorName}) has already responded to this request`,
            });
        }
        if (action === "accept") {
            // ✅ PROCESS ACCEPTANCE FOR ACTOR'S ITEMS ONLY
            if (isCancellation) {
                // ✅ Remove only THIS actor's cancelled items
                const remainingItems = order.items
                    .map((item) => {
                    const cancelledItem = actorRequestedItems.find((rp) => rp.productId.toString() === item.product._id.toString());
                    if (!cancelledItem)
                        return item; // Keep non-cancelled items
                    if (cancelledItem.quantity >= item.quantity) {
                        return null; // Remove fully cancelled item
                    }
                    else {
                        // Partial cancellation - matches your items schema exactly
                        return {
                            product: item.product._id,
                            quantity: item.quantity - cancelledItem.quantity,
                            price: item.price,
                            total: item.total *
                                ((item.quantity - cancelledItem.quantity) / item.quantity),
                        };
                    }
                })
                    .filter(Boolean);
                order.items = remainingItems;
                order.totalPrice = remainingItems.reduce((sum, item) => sum + item.total, 0);
                // ✅ Update cancelledQuantity (matches your schema)
                const cancelledQtyForThisActor = actorRequestedItems.reduce((sum, rp) => sum + rp.quantity, 0);
                order.cancelledQuantity =
                    (order.cancelledQuantity || 0) + cancelledQtyForThisActor;
                // ✅ Check if ALL requested items are cancelled (full cancellation)
                const allRequestedItemsCancelled = order.returnDetails.returnedProducts.every((rp) => !order.items.some((item) => item.product._id.toString() === rp.productId.toString()));
                if (allRequestedItemsCancelled && remainingItems.length === 0) {
                    // ✅ FULL CANCELLATION - matches your enum
                    order.status = "Cancelled";
                }
                else {
                    // ✅ PARTIAL CANCELLATION - continue processing
                    order.status = "Processing";
                }
                // ✅ Update returnDetails (matches your schema exactly)
                order.returnDetails.condition = "Cancelled";
                order.returnDetails.comments = existingComments + responseComment;
            }
            else {
                // ✅ POSTPONEMENT APPROVAL
                order.postponedQuantity =
                    (order.postponedQuantity || 0) +
                        actorRequestedItems.reduce((sum, rp) => sum + rp.quantity, 0);
                order.returnDetails.comments = existingComments + responseComment;
                // Keep status as 'Postponement Requested' until all approve
            }
        }
        else if (action === "reject") {
            // ✅ REJECTION - Items stay, update comments
            order.returnDetails.comments = existingComments + responseComment;
            // If ANY actor rejects, revert to processing for cancellations
            if (isCancellation) {
                order.status = "Processing";
            }
        }
        // ✅ Save order changes
        yield order.save();
        // ✅ NOTIFICATIONS
        const admin = yield adminModel_1.adminModel.findOne();
        // ✅ Notify Buyer
        notifications.push(notificationsModel_1.default.create({
            recipient: order.userId,
            sender: new mongoose_1.default.Types.ObjectId(actorId),
            type: "Transaction",
            title: `${requestType} ${action === "accept" ? "Approved" : "Rejected"} by ${actorName}`,
            message: `${actorName} has ${action === "accept" ? "approved" : "rejected"} your ${requestType.toLowerCase()} request for order ${orderId}. Items affected: ${actorRequestedItems.length}.`,
            isRead: false,
            metadata: {
                orderId: orderId.toString(),
                type: requestType.toLowerCase(),
                action,
                actorType,
                actorName,
                affectedItemsCount: actorRequestedItems.length,
                currentStatus: order.status,
            },
        }));
        // ✅ Notify Admin (if vendor action)
        if (admin && actorType === "vendor") {
            notifications.push(notificationsModel_1.default.create({
                recipient: admin._id,
                type: "Transaction",
                title: `${actorName} ${requestType} Action`,
                message: `Vendor ${actorName} has ${action === "accept" ? "approved" : "rejected"} a ${requestType.toLowerCase()} request for order ${orderId}. Items: ${actorRequestedItems.length}.`,
                isRead: false,
                metadata: {
                    orderId: orderId.toString(),
                    type: requestType.toLowerCase(),
                    action,
                    vendorId: actorId,
                    vendorName: actorName,
                    affectedItemsCount: actorRequestedItems.length,
                },
            }));
        }
        // ✅ Notify other actors with items in this order
        const otherActors = order.items
            .filter((item) => !actorRequestedItems.some((rp) => rp.productId.toString() === item.product._id.toString()))
            .map((item) => { var _a; return ({
            actorId: (_a = item.product.poster) === null || _a === void 0 ? void 0 : _a.toString(),
            actorType: item.product.poster === (admin === null || admin === void 0 ? void 0 : admin._id) ? "admin" : "vendor",
        }); })
            .filter((actor) => actor.actorId && actor.actorId !== actorId);
        const uniqueOtherActors = [
            ...new Set(otherActors.map((actor) => `${actor.actorType}_${actor.actorId}`)),
        ].map((key) => {
            const [type, id] = key.split("_");
            return { actorType: type, actorId: id };
        });
        for (const otherActor of uniqueOtherActors) {
            let otherActorName = "";
            if (otherActor.actorType === "vendor") {
                const vendor = yield vendorModel_1.vendorModel.findById(otherActor.actorId);
                otherActorName = (vendor === null || vendor === void 0 ? void 0 : vendor.storeName) || "Vendor";
            }
            else {
                otherActorName = "Mbaay";
            }
            notifications.push(notificationsModel_1.default.create({
                recipient: new mongoose_1.default.Types.ObjectId(otherActor.actorId),
                sender: new mongoose_1.default.Types.ObjectId(actorId),
                type: "Transaction",
                title: `${requestType} Update`,
                message: `${actorName} has ${action === "accept" ? "approved" : "rejected"} a ${requestType.toLowerCase()} request for order ${orderId}. Please review your items.`,
                isRead: false,
                metadata: {
                    orderId: orderId.toString(),
                    type: requestType.toLowerCase(),
                    action,
                    actorName,
                    otherActorName,
                },
            }));
        }
        // ✅ Execute all notifications
        if (notifications.length > 0) {
            yield Promise.all(notifications);
        }
        // ✅ Email to buyer
        const affectedItemsList = actorRequestedItems
            .map((rp) => {
            const item = order.items.find((i) => i.product._id.toString() === rp.productId.toString());
            return `<li><strong>${(item === null || item === void 0 ? void 0 : item.product.name) || "Item"}</strong> - Quantity: ${rp.quantity}</li>`;
        })
            .join("");
        const emailContent = `
      <h2>${requestType} Request ${action === "accept" ? "Approved" : "Rejected"}</h2>
      <p>Dear ${buyerName},</p>
      <p><strong>${actorName}</strong> (${actorType}) has ${action === "accept" ? "approved" : "rejected"} your ${requestType.toLowerCase()} request for order <strong>${orderId}</strong>.</p>
      <p><strong>Affected Items:</strong></p>
      <ul>${affectedItemsList}</ul>
      <p><strong>Current Order Status:</strong> ${order.status}</p>
      <p><strong>Details:</strong></p>
      <ul>
        <li>Order ID: ${orderId}</li>
        <li>Handled by: ${actorName} (${actorType})</li>
        <li>Action: ${action === "accept" ? "Approved" : "Rejected"}</li>
        <li>Items affected: ${actorRequestedItems.length}</li>
        ${comments ? `<li>Comments: ${comments}</li>` : ""}
      </ul>
      <p>We will notify you when all responses are received or the final decision is made.</p>
      <p>Thank you for shopping with us!</p>
    `;
        if (buyerEmail) {
            yield (0, email_1.sendMail)(buyerEmail, `${requestType} Request Update`, emailContent);
        }
        return res.status(200).json({
            message: `${requestType} request ${action === "accept" ? "approved" : "rejected"} successfully by ${actorName} (${actorType})`,
            orderId: orderId.toString(),
            actorType,
            actorName,
            action,
            affectedItemsCount: actorRequestedItems.length,
            currentOrderStatus: order.status,
            totalPrice: order.totalPrice,
            remainingItemsCount: order.items.length,
            cancelledQuantity: order.cancelledQuantity || 0,
        });
    }
    catch (error) {
        console.error(`❌ Handle Error:`, error);
        return res.status(500).json({
            message: "Failed to process request",
            error: error.message || "Unknown error",
        });
    }
});
exports.handleCancellationOrPostponement = handleCancellationOrPostponement;
const handleOrderReturnApproval = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { orderId, actorId, actorType, action, comments } = req.body;
        // actorType: 'vendor' or 'admin'
        // actorId: vendor._id or admin._id (product.poster)
        // action: 'accept' or 'reject'
        if (!orderId ||
            !actorId ||
            !actorType ||
            !["vendor", "admin"].includes(actorType) ||
            !["accept", "reject"].includes(action)) {
            return res.status(400).json({
                message: "orderId, actorId, actorType (vendor/admin), and action (accept/reject) are required",
            });
        }
        const order = yield orderModel_1.OrderModel.findById(orderId).populate({
            path: "items.product",
            model: "products",
        });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        if (order.status !== "Return Requested") {
            return res.status(400).json({
                message: "Order is not in a state to process return approval",
            });
        }
        if (!order.returnDetails ||
            !order.returnDetails.returnedProducts ||
            order.returnDetails.returnedProducts.length === 0) {
            return res.status(400).json({
                message: "No return request found for this order",
            });
        }
        const actorItems = order.items.filter((item) => { var _a; return ((_a = item.product.poster) === null || _a === void 0 ? void 0 : _a.toString()) === actorId; });
        if (actorItems.length === 0) {
            return res.status(403).json({
                message: `${actorType} does not have any items in this order`,
            });
        }
        const actorRequestedItems = order.returnDetails.returnedProducts.filter((rp) => actorItems.some((item) => item.product._id.toString() === rp.productId.toString()));
        if (actorRequestedItems.length === 0) {
            return res.status(400).json({
                message: `No return items found for this ${actorType}`,
            });
        }
        const requestType = "Return";
        const notifications = [];
        const buyerEmail = ((_a = order.buyerInfo) === null || _a === void 0 ? void 0 : _a.email) || "";
        const buyerName = `${((_b = order.buyerInfo) === null || _b === void 0 ? void 0 : _b.first_name) || ""} ${((_c = order.buyerInfo) === null || _c === void 0 ? void 0 : _c.last_name) || ""}`.trim();
        let actorName = "";
        if (actorType === "vendor") {
            const vendor = yield vendorModel_1.vendorModel.findById(actorId);
            if (!vendor) {
                return res.status(404).json({ message: "Vendor not found" });
            }
            actorName = vendor.storeName;
        }
        else {
            actorName = "Mbaay";
        }
        // ✅ Track responses in returnDetails.comments
        const existingComments = order.returnDetails.comments || "";
        const responseComment = `\n${new Date().toISOString().split("T")[0]} ${new Date().toLocaleTimeString()}: ${actorName} (${actorType}) ${action === "accept" ? "APPROVED" : "REJECTED"}: ${comments || "No comments provided"}`;
        // ✅ Prevent duplicate responses
        if (existingComments.includes(`${actorId} ${action}`)) {
            return res.status(400).json({
                message: `${actorType} (${actorName}) has already responded to this request`,
            });
        }
        if (action === "accept") {
            // ✅ PROCESS ACCEPTANCE FOR ACTOR'S ITEMS ONLY
            // ✅ Update returnedQuantity for accepted items
            const returnedQtyForThisActor = actorRequestedItems.reduce((sum, rp) => sum + rp.quantity, 0);
            order.returnedQuantity =
                (order.returnedQuantity || 0) + returnedQtyForThisActor;
            // ✅ Remove only THIS actor's returned items
            const remainingItems = order.items
                .map((item) => {
                const returnedItem = actorRequestedItems.find((rp) => rp.productId.toString() === item.product._id.toString());
                if (!returnedItem)
                    return item; // Keep non-returned items
                if (returnedItem.quantity >= item.quantity) {
                    return null; // Remove fully returned item
                }
                else {
                    // Partial return - adjust quantity and total
                    return {
                        product: item.product._id,
                        quantity: item.quantity - returnedItem.quantity,
                        price: item.price,
                        total: item.total *
                            ((item.quantity - returnedItem.quantity) / item.quantity),
                    };
                }
            })
                .filter(Boolean);
            order.items = remainingItems;
            order.totalPrice = remainingItems.reduce((sum, item) => sum + item.total, 0);
            // ✅ Check if ALL requested items are returned (full return)
            const allRequestedItemsReturned = order.returnDetails.returnedProducts.every((rp) => !order.items.some((item) => item.product._id.toString() === rp.productId.toString()));
            if (allRequestedItemsReturned && remainingItems.length === 0) {
                // ✅ FULL RETURN - matches your enum
                order.status = "Returned";
            }
            else {
                // ✅ PARTIAL RETURN - continue processing
                order.status = "Delivered";
            }
            // ✅ Update returnDetails
            order.returnDetails.condition = "Returned";
            order.returnDetails.comments = existingComments + responseComment;
        }
        else if (action === "reject") {
            // ✅ REJECTION - Items stay, update comments
            order.returnDetails.comments = existingComments + responseComment;
            // If ANY actor rejects, revert return request
            order.status = "Delivered";
        }
        // ✅ Save order changes
        yield order.save();
        // ✅ NOTIFICATIONS
        const admin = yield adminModel_1.adminModel.findOne();
        // ✅ Notify Buyer
        notifications.push(notificationsModel_1.default.create({
            recipient: order.userId,
            sender: new mongoose_1.default.Types.ObjectId(actorId),
            type: "Transaction",
            title: `Return ${action === "accept" ? "Approved" : "Rejected"} by ${actorName}`,
            message: `${actorName} has ${action === "accept" ? "approved" : "rejected"} your return request for order ${orderId}. Items affected: ${actorRequestedItems.length}.`,
            isRead: false,
            metadata: {
                orderId: orderId.toString(),
                type: "return",
                action,
                actorType,
                actorName,
                affectedItemsCount: actorRequestedItems.length,
                currentStatus: order.status,
            },
        }));
        // ✅ Notify Admin (if vendor action)
        if (admin && actorType === "vendor") {
            notifications.push(notificationsModel_1.default.create({
                recipient: admin._id,
                type: "Transaction",
                title: `${actorName} Return Action`,
                message: `Vendor ${actorName} has ${action === "accept" ? "approved" : "rejected"} a return request for order ${orderId}. Items: ${actorRequestedItems.length}.`,
                isRead: false,
                metadata: {
                    orderId: orderId.toString(),
                    type: "return",
                    action,
                    vendorId: actorId,
                    vendorName: actorName,
                    affectedItemsCount: actorRequestedItems.length,
                },
            }));
        }
        // ✅ Notify other actors with items in this order
        const otherActors = order.items
            .filter((item) => !actorRequestedItems.some((rp) => rp.productId.toString() === item.product._id.toString()))
            .map((item) => { var _a; return ({
            actorId: (_a = item.product.poster) === null || _a === void 0 ? void 0 : _a.toString(),
            actorType: item.product.poster === (admin === null || admin === void 0 ? void 0 : admin._id) ? "admin" : "vendor",
        }); })
            .filter((actor) => actor.actorId && actor.actorId !== actorId);
        const uniqueOtherActors = [
            ...new Set(otherActors.map((actor) => `${actor.actorType}_${actor.actorId}`)),
        ].map((key) => {
            const [type, id] = key.split("_");
            return { actorType: type, actorId: id };
        });
        for (const otherActor of uniqueOtherActors) {
            let otherActorName = "";
            if (otherActor.actorType === "vendor") {
                const vendor = yield vendorModel_1.vendorModel.findById(otherActor.actorId);
                otherActorName = (vendor === null || vendor === void 0 ? void 0 : vendor.storeName) || "Vendor";
            }
            else {
                otherActorName = "Mbaay";
            }
            notifications.push(notificationsModel_1.default.create({
                recipient: new mongoose_1.default.Types.ObjectId(otherActor.actorId),
                sender: new mongoose_1.default.Types.ObjectId(actorId),
                type: "Transaction",
                title: "Return Update",
                message: `${actorName} has 
${action === "accept" ? "approved" : "rejected"} a return request for order ${orderId}. Please review your items.`,
                isRead: false,
                metadata: {
                    orderId: orderId.toString(),
                    type: "return",
                    action,
                    actorName,
                    otherActorName,
                },
            }));
        }
        // ✅ Execute all notifications
        if (notifications.length > 0) {
            yield Promise.all(notifications);
        }
        // ✅ Email to buyer
        const affectedItemsList = actorRequestedItems
            .map((rp) => {
            const item = order.items.find((i) => i.product._id.toString() === rp.productId.toString());
            return `<li><strong>${(item === null || item === void 0 ? void 0 : item.product.name) || "Item"}</strong> - Quantity: ${rp.quantity}</li>`;
        })
            .join("");
        const emailContent = `
      <h2>Return Request ${action === "accept" ? "Approved" : "Rejected"}</h2>
      <p>Dear ${buyerName},</p>
      <p><strong>${actorName}</strong> (${actorType}) has ${action === "accept" ? "approved" : "rejected"} your return request for order <strong>${orderId}</strong>.</p>
      <p><strong>Affected Items:</strong></p>
      <ul>${affectedItemsList}</ul>
      <p><strong>Current Order Status:</strong> ${order.status}</p>
      <p><strong>Details:</strong></p>
      <ul>
        <li>Order ID: ${orderId}</li>
        <li>Handled by: ${actorName} (${actorType})</li>
        <li>Action: ${action === "accept" ? "Approved" : "Rejected"}</li>
        <li>Items affected: ${actorRequestedItems.length}</li>
        ${comments ? `<li>Comments: ${comments}</li>` : ""}
      </ul>
      <p>We will notify you when all responses are received or the final decision is made.</p>
      <p>Thank you for shopping with us!</p>
    `;
        if (buyerEmail) {
            yield (0, email_1.sendMail)(buyerEmail, `Return Request Update`, emailContent);
        }
        return res.status(200).json({
            message: `Return request ${action === "accept" ? "approved" : "rejected"} successfully by ${actorName} (${actorType})`,
            orderId: orderId.toString(),
            actorType,
            actorName,
            action,
            affectedItemsCount: actorRequestedItems.length,
            currentOrderStatus: order.status,
            totalPrice: order.totalPrice,
            remainingItemsCount: order.items.length,
            returnedQuantity: order.returnedQuantity || 0,
        });
    }
    catch (error) {
        console.error(`❌ Handle Return Error:`, error);
        return res.status(500).json({
            message: "Failed to process return request",
            error: error.message || "Unknown error",
        });
    }
});
exports.handleOrderReturnApproval = handleOrderReturnApproval;
const setOrderItemShippingFee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { orderId, productId } = req.params;
        const { shippingFee } = req.body;
        const vendorId = req.user._id;
        if (shippingFee === undefined ||
            shippingFee === null ||
            isNaN(Number(shippingFee)) ||
            Number(shippingFee) < 0) {
            return res
                .status(400)
                .json({ message: "A valid shippingFee is required" });
        }
        const order = yield orderModel_1.OrderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        const orderItem = order.items.find((item) => item.product.toString() === productId);
        if (!orderItem) {
            return res
                .status(404)
                .json({ message: "Product not found on this order" });
        }
        const product = yield productsModel_1.ProductModel.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        if (((_a = product.poster) === null || _a === void 0 ? void 0 : _a.toString()) !== vendorId.toString()) {
            return res
                .status(403)
                .json({ message: "You are not the vendor for this product" });
        }
        if (product.shippingType !== "Negotiable") {
            return res
                .status(400)
                .json({ message: "This product does not use negotiable shipping" });
        }
        if (orderItem.shippingStatus === "Agreed") {
            return res.status(400).json({
                message: "A shipping fee has already been agreed for this item",
            });
        }
        const oldShippingFee = orderItem.shippingFee || 0;
        orderItem.shippingFee = Number(shippingFee);
        orderItem.shippingStatus = "Agreed";
        // Recalculate order-level totals now that this item is resolved
        order.shippingFee =
            (order.shippingFee || 0) - oldShippingFee + Number(shippingFee);
        order.grandTotal =
            (order.grandTotal || 0) - oldShippingFee + Number(shippingFee);
        order.hasPendingShipping = order.items.some((item) => item.shippingStatus === "Pending Agreement");
        yield order.save();
        yield notificationsModel_1.default.create({
            recipient: order.userId,
            type: "Transaction",
            title: "Shipping Fee Agreed",
            message: `The vendor set a shipping fee of ₦${shippingFee} for "${product.name}" on order ${order._id}. This will be collected on delivery.`,
            isRead: false,
            metadata: { orderId: order._id, productId },
        });
        return res.status(200).json({
            message: "Shipping fee agreed and saved on the order",
            productId,
            agreedShippingFee: orderItem.shippingFee,
            orderShippingFee: order.shippingFee,
            orderGrandTotal: order.grandTotal,
            hasPendingShipping: order.hasPendingShipping,
        });
    }
    catch (err) {
        console.error("Set Order Shipping Fee Error:", err);
        return res
            .status(500)
            .json({ message: "Error setting shipping fee", error: err.message });
    }
});
exports.setOrderItemShippingFee = setOrderItemShippingFee;
const getMyPendingShippingOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id;
        const orders = yield orderModel_1.OrderModel.find({
            userId,
            hasPendingShipping: true,
        })
            .populate("items.product", "name images poster")
            .sort({ createdAt: -1 });
        const formatted = orders.map((order) => {
            const pendingItems = order.items.filter((item) => item.shippingStatus === "Pending Agreement");
            return {
                orderId: order._id,
                status: order.status,
                payStatus: order.payStatus,
                paymentOption: order.paymentOption,
                totalPrice: order.totalPrice,
                shippingFee: order.shippingFee,
                vat: order.vat,
                grandTotal: order.grandTotal,
                createdAt: order.createdAt,
                pendingItems: pendingItems.map((item) => { var _a; return ({
                    productId: item.product._id,
                    productName: item.product.name,
                    productImage: ((_a = item.product.images) === null || _a === void 0 ? void 0 : _a[0]) || "",
                    quantity: item.quantity,
                    shippingStatus: item.shippingStatus,
                }); }),
            };
        });
        return res.status(200).json({
            message: "Orders with pending shipping negotiation",
            count: formatted.length,
            orders: formatted,
        });
    }
    catch (err) {
        console.error("Get My Pending Shipping Orders Error:", err);
        return res.status(500).json({
            message: "Error fetching pending shipping orders",
            error: err.message,
        });
    }
});
exports.getMyPendingShippingOrders = getMyPendingShippingOrders;
const getVendorPendingShippingOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vendorId = req.user._id;
        const orders = yield orderModel_1.OrderModel.find({
            hasPendingShipping: true,
        })
            .populate("items.product", "name images poster")
            .populate("userId", "first_name last_name email")
            .sort({ createdAt: -1 });
        // Only keep orders that actually contain a pending item belonging to
        // THIS vendor, and only surface that vendor's items — never someone
        // else's items on the same multi-vendor order.
        const formatted = orders
            .map((order) => {
            const vendorPendingItems = order.items.filter((item) => { var _a, _b; return item.shippingStatus === "Pending Agreement" &&
                ((_b = (_a = item.product) === null || _a === void 0 ? void 0 : _a.poster) === null || _b === void 0 ? void 0 : _b.toString()) === vendorId.toString(); });
            if (vendorPendingItems.length === 0)
                return null;
            return {
                orderId: order._id,
                buyer: order.userId
                    ? {
                        id: order.userId._id,
                        name: `${order.userId.first_name} ${order.userId.last_name}`,
                        email: order.userId.email,
                    }
                    : null,
                status: order.status,
                paymentOption: order.paymentOption,
                createdAt: order.createdAt,
                pendingItems: vendorPendingItems.map((item) => { var _a; return ({
                    productId: item.product._id,
                    productName: item.product.name,
                    productImage: ((_a = item.product.images) === null || _a === void 0 ? void 0 : _a[0]) || "",
                    quantity: item.quantity,
                }); }),
            };
        })
            .filter(Boolean);
        return res.status(200).json({
            message: "Orders awaiting your shipping fee agreement",
            count: formatted.length,
            orders: formatted,
        });
    }
    catch (err) {
        console.error("Get Vendor Pending Shipping Orders Error:", err);
        return res.status(500).json({
            message: "Error fetching pending shipping orders",
            error: err.message,
        });
    }
});
exports.getVendorPendingShippingOrders = getVendorPendingShippingOrders;
const updateProductShippingFee = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { productId } = req.params;
        const { shippingType, shippingFee } = req.body;
        const requesterId = req.user._id;
        const validShippingTypes = ["Free", "Fixed", "Negotiable"];
        if (!shippingType || !validShippingTypes.includes(shippingType)) {
            return res.status(400).json({
                message: "shippingType is required and must be one of: Free, Fixed, Negotiable",
            });
        }
        if (shippingType === "Fixed") {
            if (shippingFee === undefined ||
                shippingFee === null ||
                isNaN(Number(shippingFee)) ||
                Number(shippingFee) <= 0) {
                return res.status(400).json({
                    message: "A valid shippingFee is required when shippingType is Fixed",
                });
            }
        }
        const product = yield productsModel_1.ProductModel.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        // NEW: ownership check branches on who actually uploaded the product
        if (product.uploadedBy === "admin") {
            // Admin-uploaded product — only an admin can touch its shipping
            const admin = yield adminModel_1.adminModel.findById(requesterId);
            if (!admin) {
                return res.status(403).json({
                    message: "Only an admin can update shipping for this product",
                });
            }
        }
        else {
            // Vendor-uploaded product — only the owning vendor can touch it
            if (!product.poster ||
                product.poster.toString() !== requesterId.toString()) {
                return res
                    .status(403)
                    .json({ message: "You are not the vendor for this product" });
            }
        }
        product.shippingType = shippingType;
        product.shippingFee = shippingType === "Fixed" ? Number(shippingFee) : 0;
        yield product.save();
        return res.status(200).json({
            message: "Shipping details updated successfully",
            product,
        });
    }
    catch (error) {
        console.error("Update Shipping Fee Error:", error);
        return res
            .status(500)
            .json({
            message: "Error updating shipping details",
            error: error.message,
        });
    }
});
exports.updateProductShippingFee = updateProductShippingFee;
