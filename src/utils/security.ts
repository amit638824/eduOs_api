import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  sub: string;
  email: string;
  organizationId: string | null;
  roles: string[];
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: env.APP_NAME,
    audience: 'edutech-api',
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign({ sub: userId, tid: tokenId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: env.APP_NAME,
    audience: 'edutech-refresh',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.APP_NAME,
    audience: 'edutech-api',
  }) as TokenPayload;
  return decoded;
}

export function verifyRefreshToken(token: string): { sub: string; tid: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: env.APP_NAME,
    audience: 'edutech-refresh',
  }) as { sub: string; tid: string };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Temp password that satisfies app password policy */
export function generateTempPassword(): string {
  const chunk = crypto.randomBytes(4).toString('hex');
  return `Edu@${chunk}A1`;
}

export function sanitizeUser<T extends Record<string, unknown>>(user: T): Omit<T, 'password_hash'> {
  const { password_hash: _, ...safe } = user as T & { password_hash?: string };
  return safe;
}
