"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyAccessToken = exports.generateRefreshToken = exports.generateAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const environmentVariables_1 = require("../Environment/environmentVariables");
const generateAccessToken = (payload) => jsonwebtoken_1.default.sign(payload, environmentVariables_1.EnvironmentVariables.JWT_SECRET, {
    expiresIn: environmentVariables_1.EnvironmentVariables.ACCESS_TOKEN_EXPIRES_IN,
});
exports.generateAccessToken = generateAccessToken;
const generateRefreshToken = (payload) => jsonwebtoken_1.default.sign(payload, environmentVariables_1.EnvironmentVariables.JWT_REFRESH_SECRET, {
    expiresIn: environmentVariables_1.EnvironmentVariables.REFRESH_TOKEN_EXPIRES_IN,
});
exports.generateRefreshToken = generateRefreshToken;
const verifyAccessToken = (token) => jsonwebtoken_1.default.verify(token, environmentVariables_1.EnvironmentVariables.JWT_SECRET);
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => jsonwebtoken_1.default.verify(token, environmentVariables_1.EnvironmentVariables.JWT_REFRESH_SECRET);
exports.verifyRefreshToken = verifyRefreshToken;
