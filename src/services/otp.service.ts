import { query } from '../config/database.js';
import { env, isSmtpConfigured } from '../config/env.js';
import { hashToken } from '../utils/security.js';
import { UnauthorizedError } from '../utils/errors.js';
import { sendOtpEmail } from './email.service.js';

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOtp(userId: string, purpose: string) {
  const user = await query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );

  const code = generateOtpCode();
  const codeHash = hashToken(code);
  await query(
    `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
    [userId, codeHash, purpose],
  );

  let emailSent = false;
  if (isSmtpConfigured && user.rows[0]?.email) {
    emailSent = await sendOtpEmail(user.rows[0].email, code, purpose);
  }

  const response: Record<string, unknown> = { message: 'OTP sent', expiresInMinutes: 10, emailSent };
  if (!isSmtpConfigured && env.NODE_ENV !== 'production') {
    response.devOtp = code;
  }
  return response;
}

export async function verifyOtp(userId: string, purpose: string, code: string) {
  const codeHash = hashToken(code);
  const row = await query(
    `UPDATE otp_codes SET used_at = NOW()
     WHERE user_id = $1 AND purpose = $2 AND code_hash = $3
       AND used_at IS NULL AND expires_at > NOW()
     RETURNING id`,
    [userId, purpose, codeHash],
  );
  if (!row.rows[0]) throw new UnauthorizedError('Invalid or expired OTP');
  return { verified: true };
}

export async function sendOtpByEmail(email: string, purpose: string) {
  const user = await query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()],
  );
  if (!user.rows[0]) {
    return { message: 'If the email exists, OTP has been sent.' };
  }
  return sendOtp(user.rows[0].id, purpose);
}
