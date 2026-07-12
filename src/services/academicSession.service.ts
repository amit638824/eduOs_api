import { query } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';
import { getOrganizationById } from './organization.service.js';

export async function listAcademicSessions(organizationId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    query(
      `SELECT id, organization_id, name, start_date, end_date, is_current, created_at
       FROM academic_sessions WHERE organization_id = $1
       ORDER BY start_date DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM academic_sessions WHERE organization_id = $1`, [
      organizationId,
    ]),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function createAcademicSession(
  organizationId: string,
  input: { name: string; startDate: string; endDate: string; isCurrent?: boolean },
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  if (!isSuperAdmin && requesterOrgId !== organizationId) {
    throw new ForbiddenError('Cannot manage sessions for another organization');
  }
  await getOrganizationById(organizationId);
  if (input.isCurrent) {
    await query(`UPDATE academic_sessions SET is_current = FALSE WHERE organization_id = $1`, [
      organizationId,
    ]);
  }
  const result = await query(
    `INSERT INTO academic_sessions (organization_id, name, start_date, end_date, is_current)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, organization_id, name, start_date, end_date, is_current, created_at`,
    [organizationId, input.name, input.startDate, input.endDate, input.isCurrent ?? false],
  );
  return result.rows[0];
}

export async function updateAcademicSession(
  id: string,
  input: { name?: string; startDate?: string; endDate?: string; isCurrent?: boolean },
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  const session = await query<{ organization_id: string }>(
    `SELECT organization_id FROM academic_sessions WHERE id = $1`,
    [id],
  );
  if (!session.rows[0]) throw new NotFoundError('Academic session');
  if (!isSuperAdmin && requesterOrgId !== session.rows[0].organization_id) {
    throw new ForbiddenError('Cannot manage sessions for another organization');
  }
  if (input.isCurrent) {
    await query(`UPDATE academic_sessions SET is_current = FALSE WHERE organization_id = $1`, [
      session.rows[0].organization_id,
    ]);
  }
  const result = await query(
    `UPDATE academic_sessions SET
       name = COALESCE($2, name),
       start_date = COALESCE($3, start_date),
       end_date = COALESCE($4, end_date),
       is_current = COALESCE($5, is_current),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, organization_id, name, start_date, end_date, is_current, updated_at`,
    [
      id,
      input.name ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      input.isCurrent ?? null,
    ],
  );
  return result.rows[0];
}

export async function deleteAcademicSession(
  id: string,
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  const session = await query<{ organization_id: string }>(
    `SELECT organization_id FROM academic_sessions WHERE id = $1`,
    [id],
  );
  if (!session.rows[0]) throw new NotFoundError('Academic session');
  if (!isSuperAdmin && requesterOrgId !== session.rows[0].organization_id) {
    throw new ForbiddenError('Cannot manage sessions for another organization');
  }
  await query(`DELETE FROM academic_sessions WHERE id = $1`, [id]);
  return { message: 'Academic session deleted' };
}
