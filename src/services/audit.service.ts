import { query } from '../config/database.js';
import { ForbiddenError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export async function listAuditLogs(
  organizationId: string | null,
  page: number,
  limit: number,
  isSuperAdmin: boolean,
  requesterOrgId: string | null,
) {
  if (!isSuperAdmin && organizationId !== requesterOrgId) {
    throw new ForbiddenError('Cannot view audit logs for another organization');
  }
  const offset = (page - 1) * limit;
  const params: unknown[] = [];
  let where = '1=1';
  if (organizationId) {
    params.push(organizationId);
    where = `al.organization_id = $${params.length}`;
  } else if (!isSuperAdmin) {
    params.push(requesterOrgId);
    where = `al.organization_id = $${params.length}`;
  }
  params.push(limit, offset);

  const [data, count] = await Promise.all([
    query(
      `SELECT al.id, al.organization_id, al.user_id, al.action, al.resource, al.resource_id,
              al.old_values, al.new_values, al.ip_address, al.created_at,
              u.email AS user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       ORDER BY al.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM audit_logs al WHERE ${where}`, params.slice(0, -2)),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function listActivityLogs(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    query(
      `SELECT id, activity, metadata, ip_address, created_at
       FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM activity_logs WHERE user_id = $1`, [userId]),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}
