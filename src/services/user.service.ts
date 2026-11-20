import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';

export async function updateProfile(
  userId: string,
  input: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string | null },
) {
  const result = await query(
    `UPDATE users SET
       first_name = COALESCE($2, first_name),
       last_name = CASE WHEN $3 IS NOT NULL THEN $3 WHEN last_name = '.' THEN '' ELSE last_name END,
       phone = COALESCE($4, phone),
       avatar_url = CASE WHEN $5 = '' OR $5 = '__REMOVE__' THEN NULL WHEN $5 IS NOT NULL THEN $5 ELSE avatar_url END,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, email, first_name, last_name, phone, avatar_url, organization_id, branch_id, status, created_at`,
    [
      userId,
      input.firstName ?? null,
      input.lastName ?? null,
      input.phone ?? null,
      input.avatarUrl !== undefined ? input.avatarUrl : null,
    ],
  );
  if (!result.rows[0]) throw new NotFoundError('User');
  return result.rows[0];
}
