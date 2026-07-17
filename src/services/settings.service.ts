import { query } from '../config/database.js';
import { ForbiddenError } from '../utils/errors.js';

export async function getSettings(organizationId: string, keys?: string[]) {
  const params: unknown[] = [organizationId];
  let where = 'organization_id = $1';
  if (keys?.length) {
    params.push(keys);
    where += ` AND key = ANY($${params.length}::text[])`;
  }
  const result = await query(
    `SELECT id, organization_id, key, value, updated_at FROM settings WHERE ${where} ORDER BY key`,
    params,
  );
  return result.rows;
}

export async function upsertSetting(organizationId: string, key: string, value: unknown) {
  if (!organizationId) {
    throw new ForbiddenError('Organization context required for settings');
  }
  const result = await query(
    `INSERT INTO settings (organization_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING id, organization_id, key, value, updated_at`,
    [organizationId, key, JSON.stringify(value)],
  );
  return result.rows[0];
}

export async function deleteSetting(organizationId: string, key: string) {
  if (!organizationId) {
    throw new ForbiddenError('Organization context required for settings');
  }
  const result = await query(
    `DELETE FROM settings WHERE organization_id = $1 AND key = $2 RETURNING id`,
    [organizationId, key],
  );
  return { message: 'Setting deleted', deleted: Boolean(result.rows[0]) };
}
