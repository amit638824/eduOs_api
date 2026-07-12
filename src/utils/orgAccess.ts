import { ForbiddenError } from './errors.js';
import { query } from '../config/database.js';

export function requireOrgId(organizationId: string | null | undefined): string {
  if (!organizationId) {
    throw new ForbiddenError('Organization context required');
  }
  return organizationId;
}

/** Super admins without org_id use the first active organization (demo / platform ops). */
export async function resolveOrganizationId(
  organizationId: string | null | undefined,
  isSuperAdmin: boolean,
): Promise<string> {
  if (organizationId) return organizationId;
  if (isSuperAdmin) {
    const result = await query<{ id: string }>(
      `SELECT id FROM organizations WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    );
    if (result.rows[0]?.id) return result.rows[0].id;
  }
  throw new ForbiddenError('Organization context required');
}

export function canAccessOrg(
  userOrgId: string | null | undefined,
  targetOrgId: string,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || userOrgId === targetOrgId;
}
