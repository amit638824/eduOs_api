import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { assertSameOrg } from '../utils/orgAccess.js';
import { PaginatedResult } from '../types/express.js';
import { getBranchById } from './organization.service.js';

export async function listDepartments(
  branchId: string,
  page: number,
  limit: number,
  selectedOrgId: string,
) {
  const branch = await getBranchById(branchId);
  assertSameOrg(branch.organization_id as string, selectedOrgId);

  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    query(
      `SELECT id, branch_id, name, code, is_active, created_at
       FROM departments WHERE branch_id = $1 AND deleted_at IS NULL
       ORDER BY name LIMIT $2 OFFSET $3`,
      [branchId, limit, offset],
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM departments WHERE branch_id = $1 AND deleted_at IS NULL`,
      [branchId],
    ),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function createDepartment(
  branchId: string,
  input: { name: string; code?: string },
  selectedOrgId: string,
) {
  const branch = await getBranchById(branchId);
  assertSameOrg(branch.organization_id as string, selectedOrgId, 'Cannot manage departments for another organization');
  const result = await query(
    `INSERT INTO departments (branch_id, name, code) VALUES ($1, $2, $3)
     RETURNING id, branch_id, name, code, is_active, created_at`,
    [branchId, input.name, input.code ?? null],
  );
  return result.rows[0];
}

export async function updateDepartment(
  id: string,
  input: { name?: string; code?: string; isActive?: boolean },
  selectedOrgId: string,
) {
  const dept = await query<{ branch_id: string }>(
    `SELECT branch_id FROM departments WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!dept.rows[0]) throw new NotFoundError('Department');
  const branch = await getBranchById(dept.rows[0].branch_id);
  assertSameOrg(branch.organization_id as string, selectedOrgId, 'Cannot manage departments for another organization');
  const result = await query(
    `UPDATE departments SET
       name = COALESCE($2, name),
       code = COALESCE($3, code),
       is_active = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, branch_id, name, code, is_active, updated_at`,
    [id, input.name ?? null, input.code ?? null, input.isActive ?? null],
  );
  return result.rows[0];
}

export async function deleteDepartment(id: string, selectedOrgId: string) {
  const dept = await query<{ branch_id: string }>(
    `SELECT branch_id FROM departments WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!dept.rows[0]) throw new NotFoundError('Department');
  const branch = await getBranchById(dept.rows[0].branch_id);
  assertSameOrg(branch.organization_id as string, selectedOrgId, 'Cannot manage departments for another organization');
  await query(`UPDATE departments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
  return { message: 'Department deleted' };
}
