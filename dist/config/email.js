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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const dns = __importStar(require("dns"));
const environmentVariables_1 = require("../Environment/environmentVariables");
const GOOGLE_ID = environmentVariables_1.EnvironmentVariables.GOOGLE_ID;
const GOOGLE_SECRET = environmentVariables_1.EnvironmentVariables.GOOGLE_SECRET;
const GOOGLE_REFRESHTOKEN = environmentVariables_1.EnvironmentVariables.GOOGLE_REFRESHTOKEN;
const GOOGLE_REDIRECT = "https://developers.google.com/oauthplayground";
const SENDER = "mbaay.com@gmail.com";
const SMTP_HOST = "smtp.gmail.com";
// Why we resolve the SMTP host ourselves:
// On some networks the default DNS resolver times out for direct c-ares queries
// ("EDNS queryA ETIMEOUT smtp.gmail.com"). Nodemailer resolves the host with its
// own `new dns.Resolver()` instance (which ignores the global dns.setServers),
// and treats ETIMEOUT as fatal — it never falls back to dns.lookup. But if we
// hand nodemailer an IP address as `host`, it skips DNS entirely. So we resolve
// the IP here using the OS resolver (dns.lookup/getaddrinfo, which keeps working
// when c-ares times out), falling back to public DNS servers, and cache it.
// TLS still validates against SMTP_HOST via `tls.servername`.
let cachedSmtpIp = null;
const resolveSmtpHost = () => __awaiter(void 0, void 0, void 0, function* () {
    if (cachedSmtpIp && cachedSmtpIp.expires > Date.now())
        return cachedSmtpIp.ip;
    const cacheFor = 5 * 60 * 1000; // 5 minutes
    // 1) OS resolver (getaddrinfo) — reliable even when c-ares/default DNS fails.
    try {
        const { address } = yield dns.promises.lookup(SMTP_HOST, { family: 4 });
        if (address) {
            cachedSmtpIp = { ip: address, expires: Date.now() + cacheFor };
            return address;
        }
    }
    catch (_a) {
        /* fall through to public DNS */
    }
    // 2) Dedicated resolver pointed at reliable public DNS servers.
    try {
        const resolver = new dns.promises.Resolver();
        resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4", "1.0.0.1"]);
        const addresses = yield resolver.resolve4(SMTP_HOST);
        if (addresses && addresses.length) {
            cachedSmtpIp = { ip: addresses[0], expires: Date.now() + cacheFor };
            return addresses[0];
        }
    }
    catch (_b) {
        /* fall through to hostname */
    }
    // 3) Last resort: let nodemailer try to resolve the hostname itself.
    return SMTP_HOST;
});
const oAuth = new googleapis_1.google.auth.OAuth2(GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT);
// A refresh token must be provided as `refresh_token` (not `access_token`),
// otherwise getAccessToken() can never exchange it for a fresh access token.
oAuth.setCredentials({ refresh_token: GOOGLE_REFRESHTOKEN });
// Build an SMTP transport for a given port / TLS mode.
// secure=true  -> implicit TLS on 465
// secure=false -> STARTTLS on 587
const buildTransport = (accessToken, port, secure, host) => nodemailer.createTransport({
    // `host` is normally a pre-resolved IP so nodemailer skips its own DNS.
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: {
        type: "OAuth2",
        user: SENDER,
        clientId: GOOGLE_ID,
        clientSecret: GOOGLE_SECRET,
        refreshToken: GOOGLE_REFRESHTOKEN,
        accessToken,
    },
    // Don't hang forever on a blocked/intercepted connection.
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: {
        minVersion: "TLSv1.2",
        // Validate the cert against the real hostname even when host is an IP.
        servername: SMTP_HOST,
    },
});
// Derive a readable plain-text version from the HTML body. Sending both parts
// (multipart/alternative) is expected by spam filters; HTML-only mail is one of
// the strongest signals that pushes a message into the spam folder.
const htmlToText = (html) => html
    .replace(/<!--[\s\S]*?-->/g, "") // comments
    .replace(/<style[\s\S]*?<\/style>/gi, "") // style blocks
    .replace(/<head[\s\S]*?<\/head>/gi, "") // head
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\s*\/?>/gi, "\n") // line breaks
    .replace(/<[^>]+>/g, "") // remaining tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n") // collapse blank runs
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
const sendMail = (to, subject, messages) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`📧 Attempting to send email to ${to} with subject: ${subject}`);
    let accessToken;
    try {
        const tokenResponse = yield oAuth.getAccessToken();
        accessToken =
            typeof tokenResponse === "string"
                ? tokenResponse
                : tokenResponse === null || tokenResponse === void 0 ? void 0 : tokenResponse.token;
    }
    catch (err) {
        console.error("❌ Failed to get Gmail access token (refresh token may be expired or revoked):", err === null || err === void 0 ? void 0 : err.message);
        return;
    }
    if (!accessToken) {
        console.error("❌ Failed to get Gmail access token (refresh token may be expired or revoked)");
        return;
    }
    const html = typeof messages === "string" ? messages : String(messages !== null && messages !== void 0 ? messages : "");
    // The logo and GIFs are referenced in the templates as normal hosted <img>
    // URLs, so they display inside the email body and are NOT sent as attachments.
    const message = {
        from: `Mbaay <${SENDER}>`,
        to,
        replyTo: "Mbaay Support <support@mbaay.com>",
        subject,
        html,
        // Plain-text fallback so the message is multipart/alternative, not HTML-only.
        text: htmlToText(html),
        headers: {
            // Signals a legitimate, well-behaved sender to Gmail/Yahoo filters.
            "List-Unsubscribe": "<mailto:support@mbaay.com?subject=unsubscribe>",
        },
    };
    // Pre-resolve the SMTP host to an IP so nodemailer never runs its own
    // (unreliable) DNS resolution. Falls back to the hostname if resolution fails.
    const smtpHost = yield resolveSmtpHost();
    // Port 465 (implicit TLS) is frequently dropped mid-handshake by antivirus /
    // firewall SSL scanning, surfacing as ECONNECTION "Connection closed
    // unexpectedly". Fall back to 587 (STARTTLS), which is usually allowed.
    const attempts = [
        { port: 465, secure: true },
        { port: 587, secure: false },
    ];
    let lastErr;
    for (const { port, secure } of attempts) {
        try {
            const transport = buildTransport(accessToken, port, secure, smtpHost);
            const result = yield transport.sendMail(message);
            console.log(`✅ Email sent successfully to ${to} via port ${port}: ${result.messageId}`);
            return result;
        }
        catch (err) {
            lastErr = err;
            const isConnErr = (err === null || err === void 0 ? void 0 : err.code) === "ECONNECTION" ||
                (err === null || err === void 0 ? void 0 : err.code) === "ETIMEDOUT" ||
                (err === null || err === void 0 ? void 0 : err.code) === "ESOCKET" ||
                (err === null || err === void 0 ? void 0 : err.code) === "ECONNRESET" ||
                (err === null || err === void 0 ? void 0 : err.code) === "EDNS" ||
                (err === null || err === void 0 ? void 0 : err.code) === "EAI_AGAIN";
            console.error(`⚠️ Email send failed on port ${port} (${(err === null || err === void 0 ? void 0 : err.code) || "unknown"}): ${err === null || err === void 0 ? void 0 : err.message}`);
            // Auth / message errors won't be fixed by switching ports — stop early.
            if (!isConnErr)
                break;
        }
    }
    console.error(`❌ Error sending email to ${to}:`, lastErr === null || lastErr === void 0 ? void 0 : lastErr.message);
    console.error("Full error:", lastErr);
});
exports.sendMail = sendMail;
