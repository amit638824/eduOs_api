import { query } from '../config/database.js';
import { generateSecureToken, hashToken } from '../utils/security.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { env } from '../config/env.js';

export async function enableMfa(userId: string) {
  const backupCode = generateSecureToken(4).slice(0, 8).toUpperCase();
  await query(
    `UPDATE users SET mfa_enabled = TRUE, mfa_secret = $2, updated_at = NOW() WHERE id = $1`,
    [userId, hashToken(backupCode)],
  );
  const response: Record<string, unknown> = { mfaEnabled: true };
  if (env.NODE_ENV !== 'production') {
    response.devBackupCode = backupCode;
  }
  return response;
}

export async function disableMfa(userId: string) {
  await query(
    `UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, updated_at = NOW() WHERE id = $1`,
    [userId],
  );
  return { mfaEnabled: false };
}

export async function verifyMfaCode(userId: string, code: string) {
  const user = await query<{ mfa_enabled: boolean; mfa_secret: string | null }>(
    `SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1`,
    [userId],
  );
  if (!user.rows[0]?.mfa_enabled || !user.rows[0].mfa_secret) {
    throw new NotFoundError('MFA not enabled');
  }
  if (hashToken(code.toUpperCase()) !== user.rows[0].mfa_secret) {
    throw new UnauthorizedError('Invalid MFA code');
  }
  return { verified: true };
}
