import { ForbiddenError } from './errors.js';

export function requireOrgId(organizationId: string | null | undefined): string {
  if (!organizationId) {
    throw new ForbiddenError('Organization context required');
  }
  return organizationId;
}

export function canAccessOrg(
  userOrgId: string | null | undefined,
  targetOrgId: string,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || userOrgId === targetOrgId;
}
