import dotenv from "dotenv";

dotenv.config()

export const EnvironmentVariables = {
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret",
  // Refresh tokens are signed with their own secret when provided; otherwise we
  // fall back to JWT_SECRET so existing deployments keep working unchanged.
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_SECRET ||
    "default_jwt_secret",
  // Session durations — the single source of truth. Override via environment.
  // Access token: short-lived, renewed automatically through the refresh endpoint.
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d",
  // Refresh token: long-lived, so users stay logged in for weeks/months.
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "90d",
  GOOGLE_ID: process.env.GOOGLE_ID || "",
  GOOGLE_SECRET: process.env.GOOGLE_SECRET || "",
  GOOGLE_REFRESHTOKEN: process.env.GOOGLE_REFRESHTOKEN || "",
};
