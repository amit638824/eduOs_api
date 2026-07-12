import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';

export async function updateProfile(
  userId: string,
  input: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string },
) {
  const result = await query(
    `UPDATE users SET
       first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name),
       phone = COALESCE($4, phone),
       avatar_url = COALESCE($5, avatar_url),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, email, first_name, last_name, phone, avatar_url, organization_id, branch_id, status, created_at`,
    [userId, input.firstName ?? null, input.lastName ?? null, input.phone ?? null, input.avatarUrl ?? null],
  );
  if (!result.rows[0]) throw new NotFoundError('User');
  return result.rows[0];
}
