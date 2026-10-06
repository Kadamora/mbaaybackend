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
exports.DbConnect = void 0;
// const dns = require("node:dns")
const node_dns_1 = __importDefault(require("node:dns"));
node_dns_1.default.setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose_1 = __importDefault(require("mongoose"));
const uri = "mongodb+srv://mbaaycom_db_user:mbaaystore@cluster0.av0sw4p.mongodb.net/mbaayDb?retryWrites=true&w=majority&appName=Cluster0";
const DbConnect = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const connect = mongoose_1.default.connect(uri);
        // await verifyUnverifiedProducts();
        // await fixMissingBidderModels();
        // await migrateMessagesReadStatus();
        // await clearAllOrdersCompletely(); // Removed order clearing on DB connect
        // (await clearCustomerCareDataForTesting(),
        console.log(`You have been connected successfully`);
    }
    catch (error) {
        throw error;
    }
});
exports.DbConnect = DbConnect;
