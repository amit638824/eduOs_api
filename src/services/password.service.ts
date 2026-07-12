import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { hashPassword, hashToken, verifyPassword, generateSecureToken } from '../utils/security.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { logAudit } from '../utils/auditLogger.js';

export async function requestPasswordReset(email: string) {
  const user = await query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()],
  );
  if (!user.rows[0]) {
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [user.rows[0].id, tokenHash],
  );

  const response: Record<string, unknown> = {
    message: 'If the email exists, a reset link has been sent.',
  };
  if (env.NODE_ENV !== 'production') {
    response.devResetToken = rawToken;
  }
  return response;
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const row = await query<{ user_id: string }>(
    `SELECT user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [tokenHash],
  );
  if (!row.rows[0]) throw new UnauthorizedError('Invalid or expired reset token');

  const passwordHash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [
    row.rows[0].user_id,
    passwordHash,
  ]);
  await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1`, [tokenHash]);
  await logAudit({
    userId: row.rows[0].user_id,
    action: 'reset',
    resource: 'password',
  });
  return { message: 'Password reset successful' };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (!user.rows[0]) throw new NotFoundError('User');

  const valid = await verifyPassword(currentPassword, user.rows[0].password_hash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [
    userId,
    passwordHash,
  ]);
  await logAudit({ userId, action: 'change', resource: 'password' });
  return { message: 'Password updated successfully' };
}
