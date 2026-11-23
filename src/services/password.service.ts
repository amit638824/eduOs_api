import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { hashPassword, hashToken, verifyPassword, generateSecureToken } from '../utils/security.js';
import { AppError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { logAudit } from '../utils/auditLogger.js';
import { sendPasswordResetEmail } from './email.service.js';
import { isSmtpConfigured } from '../config/env.js';
import * as notificationService from './notification.service.js';

export async function requestPasswordReset(email: string) {
  const user = await query<{ id: string; email: string; first_name?: string }>(
    `SELECT id, email, first_name FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()],
  );
  if (!user.rows[0]) {
    throw new AppError(404, 'This email address is not registered. Please enter a registered email address.', 'NOT_REGISTERED');
  }

  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.rows[0].id],
  );
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [user.rows[0].id, tokenHash],
  );

  let emailSent = false;
  if (isSmtpConfigured) {
    emailSent = await sendPasswordResetEmail(user.rows[0].email, rawToken, user.rows[0].first_name);
  }

  const response: Record<string, unknown> = {
    message: 'Email sent successfully',
    emailSent,
  };
  if (!isSmtpConfigured && env.NODE_ENV !== 'production') {
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
  if (!row.rows[0]) {
    throw new UnauthorizedError('Your password reset link is invalid or has expired. Please request a new one.');
  }

  const current = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [row.rows[0].user_id],
  );
  if (current.rows[0] && await verifyPassword(newPassword, current.rows[0].password_hash)) {
    throw new UnauthorizedError('This password has already been used. Please use another password.');
  }

  const passwordHash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [
    row.rows[0].user_id,
    passwordHash,
  ]);
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [row.rows[0].user_id],
  );
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [row.rows[0].user_id],
  );
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
  void notificationService.notifyUserInApp(
    userId,
    'Password updated',
    'Your password was changed successfully. If you did not do this, contact your institute immediately.',
    { type: 'password_changed' },
  );
  return { message: 'Password updated successfully' };
}
