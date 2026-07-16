import { query } from '../config/database.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  logoUrl?: string;
  theme?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  isActive?: boolean;
}

export async function createOrganization(input: CreateOrganizationInput) {
  const existing = await query(
    'SELECT id FROM organizations WHERE slug = $1 AND deleted_at IS NULL',
    [input.slug],
  );
  if (existing.rowCount) {
    throw new ConflictError('Organization slug already exists');
  }

  const isActive = input.isActive === true;
  const settings = {
    verificationStatus: isActive ? 'verified' : 'pending',
    ...(input.settings ?? {}),
  };

  const result = await query(
    `INSERT INTO organizations (name, slug, logo_url, theme, settings, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, slug, logo_url, theme, settings, is_active, created_at`,
    [
      input.name,
      input.slug,
      input.logoUrl ?? null,
      JSON.stringify(input.theme ?? {}),
      JSON.stringify(settings),
      isActive,
    ],
  );

  const org = result.rows[0];

  // Default main branch so departments can be added immediately after approve
  await query(
    `INSERT INTO branches (organization_id, name, code, address)
     VALUES ($1, $2, $3, $4)`,
    [org.id, 'Main Campus', 'MAIN', null],
  );

  return org;
}

export async function listOrganizations(page: number, limit: number): Promise<PaginatedResult<unknown>> {
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT o.id, o.name, o.slug, o.logo_url, o.settings, o.is_active, o.created_at,
              (SELECT COUNT(*)::int FROM users u WHERE u.organization_id = o.id AND u.deleted_at IS NULL) AS users_count,
              (SELECT COUNT(*)::int FROM branches b WHERE b.organization_id = o.id AND b.deleted_at IS NULL) AS branches_count
       FROM organizations o
       WHERE o.deleted_at IS NULL
       ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query('SELECT COUNT(*)::int AS total FROM organizations WHERE deleted_at IS NULL'),
  ]);

  const total = countResult.rows[0].total as number;
  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getOrganizationById(id: string) {
  const result = await query(
    `SELECT id, name, slug, logo_url, theme, settings, is_active, created_at, updated_at
     FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('Organization');
  }
  return result.rows[0];
}

export async function updateOrganization(
  id: string,
  input: Partial<CreateOrganizationInput> & { isActive?: boolean },
) {
  await getOrganizationById(id);

  let settingsJson: string | null = null;
  if (input.settings || input.isActive !== undefined) {
    const current = await getOrganizationById(id);
    const merged = {
      ...((current.settings as Record<string, unknown>) ?? {}),
      ...(input.settings ?? {}),
    };
    if (input.isActive === true) merged.verificationStatus = 'verified';
    if (input.isActive === false) merged.verificationStatus = 'pending';
    settingsJson = JSON.stringify(merged);
  }

  const result = await query(
    `UPDATE organizations SET
       name = COALESCE($2, name),
       slug = COALESCE($3, slug),
       logo_url = COALESCE($4, logo_url),
       theme = COALESCE($5, theme),
       settings = COALESCE($6, settings),
       is_active = COALESCE($7, is_active),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, slug, logo_url, theme, settings, is_active, updated_at`,
    [
      id,
      input.name ?? null,
      input.slug ?? null,
      input.logoUrl ?? null,
      input.theme ? JSON.stringify(input.theme) : null,
      settingsJson,
      input.isActive ?? null,
    ],
  );

  return result.rows[0];
}

/** Approve organization access — activate org + pending users */
export async function verifyOrganization(id: string) {
  const org = await getOrganizationById(id);
  const settings = {
    ...((org.settings as Record<string, unknown>) ?? {}),
    verificationStatus: 'verified',
    verifiedAt: new Date().toISOString(),
  };

  const result = await query(
    `UPDATE organizations SET
       is_active = TRUE,
       settings = $2,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, slug, logo_url, theme, settings, is_active, updated_at`,
    [id, JSON.stringify(settings)],
  );

  await query(
    `UPDATE users SET status = 'active', updated_at = NOW()
     WHERE organization_id = $1 AND status = 'pending' AND deleted_at IS NULL`,
    [id],
  );

  return result.rows[0];
}

export async function deleteOrganization(id: string) {
  await getOrganizationById(id);
  await query(
    `UPDATE organizations SET
       deleted_at = NOW(),
       is_active = FALSE,
       slug = slug || '-deleted-' || substr(id::text, 1, 8),
       updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
  return { id, deleted: true };
}

export async function createBranch(
  organizationId: string,
  input: { name: string; code?: string; address?: string; settings?: Record<string, unknown> },
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  if (!isSuperAdmin && requesterOrgId !== organizationId) {
    throw new ForbiddenError('Cannot create branch for another organization');
  }

  await getOrganizationById(organizationId);

  const result = await query(
    `INSERT INTO branches (organization_id, name, code, address, settings)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, organization_id, name, code, address, is_active, created_at`,
    [
      organizationId,
      input.name,
      input.code ?? null,
      input.address ?? null,
      JSON.stringify(input.settings ?? {}),
    ],
  );

  return result.rows[0];
}

export async function listBranches(
  organizationId: string,
  page: number,
  limit: number,
): Promise<PaginatedResult<unknown>> {
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT id, organization_id, name, code, address, is_active, created_at
       FROM branches
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM branches
       WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId],
    ),
  ]);

  const total = countResult.rows[0].total as number;
  return {
    data: dataResult.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getBranchById(id: string) {
  const result = await query(
    `SELECT id, organization_id, name, code, address, settings, is_active, created_at
     FROM branches WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('Branch');
  }
  return result.rows[0];
}

export async function updateBranch(
  id: string,
  input: {
    name?: string;
    code?: string;
    address?: string;
    settings?: Record<string, unknown>;
    isActive?: boolean;
  },
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  const branch = await getBranchById(id);
  if (!isSuperAdmin && requesterOrgId !== branch.organization_id) {
    throw new ForbiddenError('Cannot update branch for another organization');
  }
  const result = await query(
    `UPDATE branches SET
       name = COALESCE($2, name),
       code = COALESCE($3, code),
       address = COALESCE($4, address),
       settings = COALESCE($5, settings),
       is_active = COALESCE($6, is_active),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, organization_id, name, code, address, is_active, updated_at`,
    [
      id,
      input.name ?? null,
      input.code ?? null,
      input.address ?? null,
      input.settings ? JSON.stringify(input.settings) : null,
      input.isActive ?? null,
    ],
  );
  return result.rows[0];
}

export async function deleteBranch(
  id: string,
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  const branch = await getBranchById(id);
  if (!isSuperAdmin && requesterOrgId !== branch.organization_id) {
    throw new ForbiddenError('Cannot delete branch for another organization');
  }
  await query(`UPDATE branches SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
  return { message: 'Branch deleted' };
}
