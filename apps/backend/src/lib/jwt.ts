import jwt, { SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as SignOptions);
}

/**
 * Generate refresh token (long-lived)
 */
export function generateRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

/**
 * Get refresh token expiry date
 */
export function getRefreshTokenExpiry(): Date {
  const days = parseInt(REFRESH_TOKEN_EXPIRES_IN.replace('d', ''), 10) || 7;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Get JWT expiry time in seconds
 */
export function getAccessTokenExpirySeconds(): number {
  const expiry = JWT_EXPIRES_IN;
  if (expiry.endsWith('m')) {
    return parseInt(expiry, 10) * 60;
  }
  if (expiry.endsWith('h')) {
    return parseInt(expiry, 10) * 60 * 60;
  }
  if (expiry.endsWith('s')) {
    return parseInt(expiry, 10);
  }
  return 900; // Default 15 minutes
}
