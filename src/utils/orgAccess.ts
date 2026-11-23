import { ForbiddenError } from './errors.js';
import { query } from '../config/database.js';
import type { Request } from 'express';

export function requireOrgId(organizationId: string | null | undefined): string {
  return organizationId || '';
}

function headerOrgId(req: Request): string | null {
  const raw = req.headers['x-organization-id'];
  if (typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw)) return raw;
  return null;
}

/**
 * Resolve organization context:
 * - org users → their organization_id
 * - super_admin:
 *   - if X-Organization-Id header is present → target that organization
 *   - if body/query has organizationId → target that organization
 *   - if GET request (listing across all orgs) → returns '' (global platform scope)
 *   - if mutation request (POST/PUT/DELETE) without org → fallback to default active org
 */
export async function resolveOrganizationId(
  organizationId: string | null | undefined,
  isSuperAdmin: boolean,
  req?: Request,
): Promise<string> {
  if (!isSuperAdmin && organizationId) return organizationId;

  if (isSuperAdmin && req) {
    const fromHeader = headerOrgId(req);
    if (fromHeader) {
      const exists = await query<{ id: string }>(
        `SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
        [fromHeader],
      );
      if (exists.rows[0]?.id) return exists.rows[0].id;
      throw new ForbiddenError('Selected organization not found');
    }

    const bodyOrgId =
      req.body?.organizationId ||
      req.body?.organization_id ||
      req.query?.organizationId ||
      req.query?.organization_id;

    if (typeof bodyOrgId === 'string' && /^[0-9a-f-]{36}$/i.test(bodyOrgId)) {
      const exists = await query<{ id: string }>(
        `SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
        [bodyOrgId],
      );
      if (exists.rows[0]?.id) return exists.rows[0].id;
    }

    // For GET (read / list / analytics) in All Organizations mode, return '' to query across all orgs
    if (req.method === 'GET') {
      return '';
    }

    // For create/mutate actions when no org is explicitly selected, fallback to the first active organization
    const fallback = await query<{ id: string }>(
      `SELECT id FROM organizations WHERE is_active = 1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    );
    if (fallback.rows[0]?.id) return fallback.rows[0].id;

    return '';
  }

  if (organizationId) return organizationId;

  if (req && req.method === 'GET') return '';

  throw new ForbiddenError('Organization context required');
}

/** Resource must belong to the resolved (selected) organization */
export function assertSameOrg(
  resourceOrgId: string | null | undefined,
  selectedOrgId: string,
  message = 'Resource does not belong to the selected organization',
): void {
  // If selectedOrgId is empty, Super Admin is operating in global platform scope
  if (!selectedOrgId) return;
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
