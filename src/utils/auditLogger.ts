import { query } from '../config/database.js';

export async function logAudit(params: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  await query(
    `INSERT INTO audit_logs (
       organization_id, user_id, action, resource, resource_id,
       old_values, new_values, ip_address, user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      params.organizationId ?? null,
      params.userId ?? null,
      params.action,
      params.resource,
      params.resourceId ?? null,
      params.oldValues ? JSON.stringify(params.oldValues) : null,
      params.newValues ? JSON.stringify(params.newValues) : null,
      params.ipAddress ?? null,
      params.userAgent ?? null,
    ],
  );
}

export async function logActivity(
  userId: string,
  activity: string,
  metadata: Record<string, unknown> = {},
  ipAddress?: string,
) {
  await query(
    `INSERT INTO activity_logs (user_id, activity, metadata, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [userId, activity, JSON.stringify(metadata), ipAddress ?? null],
  );
}
