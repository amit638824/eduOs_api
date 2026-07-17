import { ForbiddenError } from './errors.js';
import { query } from '../config/database.js';
import type { Request } from 'express';

export function requireOrgId(organizationId: string | null | undefined): string {
  if (!organizationId) {
    throw new ForbiddenError('Organization context required');
  }
  return organizationId;
}

function headerOrgId(req: Request): string | null {
  const raw = req.headers['x-organization-id'];
  if (typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw)) return raw;
  return null;
}

/**
 * Resolve organization context:
 * - org users → their organization_id
 * - super_admin → requires valid X-Organization-Id (no silent fallback)
 */
export async function resolveOrganizationId(
  organizationId: string | null | undefined,
  isSuperAdmin: boolean,
  req?: Request,
): Promise<string> {
  if (!isSuperAdmin && organizationId) return organizationId;

  if (isSuperAdmin && req) {
    const fromHeader = headerOrgId(req);
    if (!fromHeader) {
      throw new ForbiddenError('X-Organization-Id header required for Super Admin');
    }
    const exists = await query<{ id: string }>(
      `SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
      [fromHeader],
    );
    if (exists.rows[0]?.id) return exists.rows[0].id;
    throw new ForbiddenError('Selected organization not found');
  }

  if (organizationId) return organizationId;

  throw new ForbiddenError('Organization context required');
}

/** Resource must belong to the resolved (selected) organization */
export function assertSameOrg(
  resourceOrgId: string | null | undefined,
  selectedOrgId: string,
  message = 'Resource does not belong to the selected organization',
): void {
  if (!resourceOrgId || resourceOrgId !== selectedOrgId) {
    throw new ForbiddenError(message);
  }
}

export function canAccessOrg(
  userOrgId: string | null | undefined,
  targetOrgId: string,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || userOrgId === targetOrgId;
}
