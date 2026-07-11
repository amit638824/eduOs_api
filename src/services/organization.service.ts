import { query } from '../config/database.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  logoUrl?: string;
  theme?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export async function createOrganization(input: CreateOrganizationInput) {
  const existing = await query('SELECT id FROM organizations WHERE slug = $1', [input.slug]);
  if (existing.rowCount) {
    throw new ConflictError('Organization slug already exists');
  }

  const result = await query(
    `INSERT INTO organizations (name, slug, logo_url, theme, settings)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, slug, logo_url, theme, settings, is_active, created_at`,
    [
      input.name,
      input.slug,
      input.logoUrl ?? null,
      JSON.stringify(input.theme ?? {}),
      JSON.stringify(input.settings ?? {}),
    ],
  );

  return result.rows[0];
}

export async function listOrganizations(page: number, limit: number): Promise<PaginatedResult<unknown>> {
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT id, name, slug, logo_url, is_active, created_at
       FROM organizations WHERE deleted_at IS NULL
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
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

  const result = await query(
    `UPDATE organizations SET
       name = COALESCE($2, name),
       slug = COALESCE($3, slug),
       logo_url = COALESCE($4, logo_url),
       theme = COALESCE($5, theme),
       settings = COALESCE($6, settings),
       is_active = COALESCE($7, is_active)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, slug, logo_url, theme, settings, is_active, updated_at`,
    [
      id,
      input.name ?? null,
      input.slug ?? null,
      input.logoUrl ?? null,
      input.theme ? JSON.stringify(input.theme) : null,
      input.settings ? JSON.stringify(input.settings) : null,
      input.isActive ?? null,
    ],
  );

  return result.rows[0];
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
