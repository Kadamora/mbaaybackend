import jwt from "jsonwebtoken";
import { EnvironmentVariables } from "../Environment/environmentVariables";


export type TokenPayload = Record<string, unknown>;

export const generateAccessToken = (payload: TokenPayload): string =>
  jwt.sign(payload, EnvironmentVariables.JWT_SECRET, {
    expiresIn: EnvironmentVariables.ACCESS_TOKEN_EXPIRES_IN as any,
  });

export const generateRefreshToken = (payload: TokenPayload): string =>
  jwt.sign(payload, EnvironmentVariables.JWT_REFRESH_SECRET, {
    expiresIn: EnvironmentVariables.REFRESH_TOKEN_EXPIRES_IN as any,
  });

export const verifyAccessToken = (token: string): any =>
  jwt.verify(token, EnvironmentVariables.JWT_SECRET);

export const verifyRefreshToken = (token: string): any =>
  jwt.verify(token, EnvironmentVariables.JWT_REFRESH_SECRET);
