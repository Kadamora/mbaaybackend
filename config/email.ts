import { google } from "googleapis";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import * as dns from "dns";
import { EnvironmentVariables } from "../Environment/environmentVariables";

const GOOGLE_ID = EnvironmentVariables.GOOGLE_ID;
const GOOGLE_SECRET = EnvironmentVariables.GOOGLE_SECRET;
const GOOGLE_REFRESHTOKEN = EnvironmentVariables.GOOGLE_REFRESHTOKEN;
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
let cachedSmtpIp: { ip: string; expires: number } | null = null;

const resolveSmtpHost = async (): Promise<string> => {
  if (cachedSmtpIp && cachedSmtpIp.expires > Date.now()) return cachedSmtpIp.ip;

  const cacheFor = 5 * 60 * 1000; // 5 minutes

  // 1) OS resolver (getaddrinfo) — reliable even when c-ares/default DNS fails.
  try {
    const { address } = await dns.promises.lookup(SMTP_HOST, { family: 4 });
    if (address) {
      cachedSmtpIp = { ip: address, expires: Date.now() + cacheFor };
      return address;
    }
  } catch {
    /* fall through to public DNS */
  }

  // 2) Dedicated resolver pointed at reliable public DNS servers.
  try {
    const resolver = new dns.promises.Resolver();
    resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4", "1.0.0.1"]);
    const addresses = await resolver.resolve4(SMTP_HOST);
    if (addresses && addresses.length) {
      cachedSmtpIp = { ip: addresses[0], expires: Date.now() + cacheFor };
      return addresses[0];
    }
  } catch {
    /* fall through to hostname */
  }

  // 3) Last resort: let nodemailer try to resolve the hostname itself.
  return SMTP_HOST;
};

const oAuth = new google.auth.OAuth2(GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT);

// A refresh token must be provided as `refresh_token` (not `access_token`),
// otherwise getAccessToken() can never exchange it for a fresh access token.
oAuth.setCredentials({ refresh_token: GOOGLE_REFRESHTOKEN });

// Build an SMTP transport for a given port / TLS mode.
// secure=true  -> implicit TLS on 465
// secure=false -> STARTTLS on 587
const buildTransport = (
  accessToken: string,
  port: number,
  secure: boolean,
  host: string,
): Transporter =>
  nodemailer.createTransport({
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
const htmlToText = (html: string): string =>
  html
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

export const sendMail = async (to: any, subject: any, messages: any) => {
  console.log(`📧 Attempting to send email to ${to} with subject: ${subject}`);

  let accessToken: string | undefined;
  try {
    const tokenResponse: any = await oAuth.getAccessToken();
    accessToken =
      typeof tokenResponse === "string"
        ? tokenResponse
        : tokenResponse?.token;
  } catch (err: any) {
    console.error(
      "❌ Failed to get Gmail access token (refresh token may be expired or revoked):",
      err?.message,
    );
    return;
  }

  if (!accessToken) {
    console.error(
      "❌ Failed to get Gmail access token (refresh token may be expired or revoked)",
    );
    return;
  }

  const html = typeof messages === "string" ? messages : String(messages ?? "");

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
      "List-Unsubscribe":
        "<mailto:support@mbaay.com?subject=unsubscribe>",
    },
  };

  // Pre-resolve the SMTP host to an IP so nodemailer never runs its own
  // (unreliable) DNS resolution. Falls back to the hostname if resolution fails.
  const smtpHost = await resolveSmtpHost();

  // Port 465 (implicit TLS) is frequently dropped mid-handshake by antivirus /
  // firewall SSL scanning, surfacing as ECONNECTION "Connection closed
  // unexpectedly". Fall back to 587 (STARTTLS), which is usually allowed.
  const attempts: Array<{ port: number; secure: boolean }> = [
    { port: 465, secure: true },
    { port: 587, secure: false },
  ];

  let lastErr: any;
  for (const { port, secure } of attempts) {
    try {
      const transport = buildTransport(accessToken, port, secure, smtpHost);
      const result = await transport.sendMail(message);
      console.log(
        `✅ Email sent successfully to ${to} via port ${port}: ${result.messageId}`,
      );
      return result;
    } catch (err: any) {
      lastErr = err;
      const isConnErr =
        err?.code === "ECONNECTION" ||
        err?.code === "ETIMEDOUT" ||
        err?.code === "ESOCKET" ||
        err?.code === "ECONNRESET" ||
        err?.code === "EDNS" ||
        err?.code === "EAI_AGAIN";
      console.error(
        `⚠️ Email send failed on port ${port} (${err?.code || "unknown"}): ${err?.message}`,
      );
      // Auth / message errors won't be fixed by switching ports — stop early.
      if (!isConnErr) break;
    }
  }

  console.error(`❌ Error sending email to ${to}:`, lastErr?.message);
  console.error("Full error:", lastErr);
};
