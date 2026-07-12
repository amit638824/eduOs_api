import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';

export async function listSessions(userId: string) {
  const result = await query(
    `SELECT id, device_info, ip_address, created_at, expires_at,
            (revoked_at IS NULL AND expires_at > NOW()) AS is_active
     FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function revokeSession(userId: string, sessionId: string) {
  const result = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [sessionId, userId],
  );
  if (!result.rows[0]) throw new NotFoundError('Session');
  return { message: 'Session revoked' };
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)`,
    [userId, exceptSessionId ?? null],
  );
  return { message: 'All other sessions revoked' };
}
