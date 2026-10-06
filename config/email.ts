import { google } from "googleapis";
import * as nodemailer from "nodemailer";
import { EnvironmentVariables } from "../Environment/environmentVariables";

const { GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REFRESHTOKEN } = EnvironmentVariables;
const GOOGLE_REDIRECT = "https://developers.google.com/oauthplayground";

const oAuth = new google.auth.OAuth2(GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT);
// It's a refresh token, not an access token
oAuth.setCredentials({ refresh_token: GOOGLE_REFRESHTOKEN });

const gmail = google.gmail({ version: "v1", auth: oAuth });

// Only used to build the raw MIME message. Nothing is sent through it.
const mimeBuilder = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: "unix",
});

export const sendMail = async (to: string, subject: string, html: string) => {
  try {
    console.log(`📧 Sending email to ${to}: ${subject}`);

    const info: any = await mimeBuilder.sendMail({
      from: '"mbaay" <mbaay.com@gmail.com>',
      to,
      subject,
      html,
    });

    const raw = info.message.toString("base64url");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    console.log(`✅ Email sent to ${to}, id: ${res.data.id}`);
    return res.data;
  } catch (err: any) {
    console.error(
      `❌ Error sending email to ${to}:`,
      err?.response?.data || err.message,
    );
    throw err;
  }
};
