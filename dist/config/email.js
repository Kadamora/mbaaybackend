"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = void 0;
const googleapis_1 = require("googleapis");
const nodemailer = __importStar(require("nodemailer"));
const environmentVariables_1 = require("../Environment/environmentVariables");
const { GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REFRESHTOKEN } = environmentVariables_1.EnvironmentVariables;
const GOOGLE_REDIRECT = "https://developers.google.com/oauthplayground";
const oAuth = new googleapis_1.google.auth.OAuth2(GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT);
// It's a refresh token, not an access token
oAuth.setCredentials({ refresh_token: GOOGLE_REFRESHTOKEN });
const gmail = googleapis_1.google.gmail({ version: "v1", auth: oAuth });
// Only used to build the raw MIME message. Nothing is sent through it.
const mimeBuilder = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
});
const sendMail = (to, subject, html) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log(`📧 Sending email to ${to}: ${subject}`);
        const info = yield mimeBuilder.sendMail({
            from: '"mbaay" <mbaay.com@gmail.com>',
            to,
            subject,
            html,
        });
        const raw = info.message.toString("base64url");
        const res = yield gmail.users.messages.send({
            userId: "me",
            requestBody: { raw },
        });
        console.log(`✅ Email sent to ${to}, id: ${res.data.id}`);
        return res.data;
    }
    catch (err) {
        console.error(`❌ Error sending email to ${to}:`, ((_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message);
        throw err;
    }
});
exports.sendMail = sendMail;
