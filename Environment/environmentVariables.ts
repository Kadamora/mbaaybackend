import dotenv from "dotenv";

dotenv.config()

export const EnvironmentVariables = {
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret",
  GOOGLE_ID: process.env.GOOGLE_ID || "",
  GOOGLE_SECRET: process.env.GOOGLE_SECRET || "",
  GOOGLE_REFRESHTOKEN: process.env.GOOGLE_REFRESHTOKEN || "",
};