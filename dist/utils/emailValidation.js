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
exports.validateEmailDeliverable = void 0;
const dns = __importStar(require("dns"));
/**
 * Email validation used to keep bots / fake / disposable sign-ups out.
 *
 * A registration is rejected (and no mail is sent) when the address:
 *   1. is missing or malformed,
 *   2. uses a known disposable / temporary-email provider (what bots use to
 *      mass-register), or
 *   3. belongs to a domain that cannot receive email (no MX / does not exist).
 *
 * DNS lookups use a dedicated resolver pointed at reliable public servers, and
 * we *fail open* on transient DNS errors (timeouts, etc.) so a flaky network
 * never blocks a legitimate user.
 */
// Dedicated resolver on public DNS — the machine's default resolver can time
// out for direct queries, so we don't rely on it here.
const resolver = new dns.promises.Resolver();
try {
    resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4", "1.0.0.1"]);
}
catch (_a) {
    /* keep system defaults if this ever fails */
}
// Reasonable email shape check (not RFC-exhaustive, but rejects obvious junk).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Common disposable / temporary email domains used by bots and throwaway
// sign-ups. Extend this set as you spot new ones in your sign-up logs.
const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.info",
    "guerrillamail.biz",
    "guerrillamail.de",
    "grr.la",
    "sharklasers.com",
    "10minutemail.com",
    "10minutemail.net",
    "20minutemail.com",
    "tempmail.com",
    "temp-mail.org",
    "tempmail.net",
    "tempr.email",
    "tempmailo.com",
    "throwawaymail.com",
    "trashmail.com",
    "trashmail.de",
    "getnada.com",
    "nada.email",
    "dispostable.com",
    "yopmail.com",
    "yopmail.net",
    "yopmail.fr",
    "maildrop.cc",
    "mailnesia.com",
    "mintemail.com",
    "mohmal.com",
    "fakeinbox.com",
    "fakemailgenerator.com",
    "spamgourmet.com",
    "mailcatch.com",
    "mailtemp.net",
    "moakt.com",
    "emailondeck.com",
    "burnermail.io",
    "tempinbox.com",
    "temporary-mail.net",
    "discard.email",
    "inboxbear.com",
    "33mail.com",
    "spam4.me",
    "mytemp.email",
    "cs.email",
    "luxusmail.org",
    "wegwerfmail.de",
    "einrot.com",
    "tafmail.com",
]);
/**
 * Validate that an email is well-formed, not disposable, and belongs to a
 * domain that can actually receive mail. Safe to call before creating a user
 * and before sending any email.
 */
const validateEmailDeliverable = (email) => __awaiter(void 0, void 0, void 0, function* () {
    if (typeof email !== "string" || !email.trim()) {
        return { valid: false, reason: "Email is required." };
    }
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
        return { valid: false, reason: "Please enter a valid email address." };
    }
    const domain = normalized.split("@")[1];
    if (DISPOSABLE_DOMAINS.has(domain)) {
        return {
            valid: false,
            reason: "Disposable or temporary email addresses are not allowed.",
        };
    }
    // Confirm the domain can receive mail. Bots frequently use domains with no
    // mail server at all, which this catches.
    try {
        const mx = yield resolver.resolveMx(domain);
        const hasMx = Array.isArray(mx) && mx.some((r) => r.exchange);
        if (!hasMx) {
            return {
                valid: false,
                reason: "This email domain cannot receive mail.",
            };
        }
    }
    catch (err) {
        const code = err === null || err === void 0 ? void 0 : err.code;
        // Domain definitively does not exist / has no records -> reject.
        if (code === "ENOTFOUND" || code === "NXDOMAIN" || code === "ENODATA") {
            return {
                valid: false,
                reason: "This email domain does not exist or cannot receive mail.",
            };
        }
        // Transient DNS issue (timeout, server failure): fail open so we never
        // block a legitimate user because of a temporary network hiccup.
    }
    return { valid: true };
});
exports.validateEmailDeliverable = validateEmailDeliverable;
