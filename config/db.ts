// const dns = require("node:dns")
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"])

import mongoose from "mongoose";
import {
  fixMissingBidderModels,
  verifyUnverifiedProducts,
} from "../controller/productsController";
import { migrateMessagesReadStatus } from "../controller/chatController";
import { clearCustomerCareDataForTesting } from "../controller/adminController";

const uri =
  "mongodb+srv://mbaaycom_db_user:mbaaystore@cluster0.av0sw4p.mongodb.net/mbaayDb?retryWrites=true&w=majority&appName=Cluster0";

export const DbConnect = async () => {
  try {
    const connect = mongoose.connect(uri);
    // await verifyUnverifiedProducts();
    // await fixMissingBidderModels();
    // await migrateMessagesReadStatus();
    // await clearAllOrdersCompletely(); // Removed order clearing on DB connect
    // (await clearCustomerCareDataForTesting(),
    console.log(`You have been connected successfully`);
  } catch (error) {
    throw error;
  }
};
