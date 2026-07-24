import { query } from '../config/database.js';
import { ConflictError } from '../utils/errors.js';

type DbQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

function normalizeEnrollmentNo(value: string): string {
  return value.trim().toUpperCase();
}

/** Next suggested enrollment number for an organization, e.g. ENR-2026-0001 */
export async function suggestEnrollmentNo(organizationId: string, runQuery: DbQuery = query): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ENR-${year}-`;

  const result = await runQuery(
    `SELECT admission_no FROM students
     WHERE organization_id = $1 AND admission_no ILIKE $2
     ORDER BY admission_no DESC LIMIT 1`,
    [organizationId, `${prefix}%`],
  );

  let next = 1;
  const last = result.rows[0]?.admission_no as string | undefined;
  if (last) {
    const match = last.match(/-(\d+)$/);
    if (match) next = Number.parseInt(match[1], 10) + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function assertEnrollmentNoAvailable(
  organizationId: string,
  enrollmentNo: string,
  excludeUserId?: string,
  runQuery: DbQuery = query,
): Promise<string> {
  const normalized = normalizeEnrollmentNo(enrollmentNo);
  if (!normalized) {
    throw new ConflictError('Enrollment number is required for students');
  }

  const params: unknown[] = [organizationId, normalized];
  let excludeSql = '';
  if (excludeUserId) {
    params.push(excludeUserId);
    excludeSql = ` AND s.user_id <> $${params.length}`;
  }

  const existing = await runQuery(
    `SELECT s.id FROM students s
     WHERE s.organization_id = $1 AND LOWER(s.admission_no) = LOWER($2)${excludeSql}
     LIMIT 1`,
    params,
  );

  if (existing.rows[0]) {
    throw new ConflictError('Enrollment number already in use in this organization');
  }

  return normalized;
}

export async function resolveEnrollmentNo(
  organizationId: string,
  provided: string | undefined,
  runQuery: DbQuery = query,
): Promise<string> {
  const raw = provided?.trim();
  if (raw) {
    return assertEnrollmentNoAvailable(organizationId, raw, undefined, runQuery);
  }
  const suggested = await suggestEnrollmentNo(organizationId, runQuery);
  return assertEnrollmentNoAvailable(organizationId, suggested, undefined, runQuery);
}

export function enrollmentNoFromRow(row: Record<string, unknown>): string | null {
  const value = row.enrollment_no ?? row.admission_no;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
