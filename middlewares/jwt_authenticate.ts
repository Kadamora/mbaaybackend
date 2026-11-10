import { NextFunction } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { verifyAccessToken } from "../utils/token";

export const authenticate = async (req: any, res: any, next: NextFunction) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return res
        .status(401)
        .json({ message: "Access token expired", expired: true });
    }
    return res.status(401).json({ message: "Invalid token." });
  }
};
