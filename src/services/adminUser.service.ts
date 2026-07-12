import { query, withTransaction } from '../config/database.js';
import { hashPassword } from '../utils/security.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export async function listUsers(
  organizationId: string,
  page: number,
  limit: number,
  filters?: { role?: string; search?: string },
) {
  const offset = (page - 1) * limit;
  const params: unknown[] = [organizationId];
  let where = 'u.organization_id = $1 AND u.deleted_at IS NULL';
  if (filters?.search) {
    params.push(`%${filters.search}%`);
    where += ` AND (u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`;
  }
  if (filters?.role) {
    params.push(filters.role);
    where += ` AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.name = $${params.length}
    )`;
  }
  params.push(limit, offset);

  const [data, count] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status, u.created_at,
              COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`, params.slice(0, -2)),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function createUser(
  organizationId: string,
  input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: 'student' | 'teacher' | 'org_admin';
    branchId?: string;
  },
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  if (!isSuperAdmin && requesterOrgId !== organizationId) {
    throw new ForbiddenError('Cannot create users for another organization');
  }
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [input.email.toLowerCase()]);
  if (existing.rowCount) throw new ConflictError('Email already registered');

  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (client) => {
    const user = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, organization_id, branch_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id, email, first_name, last_name, organization_id, status, created_at`,
      [
        input.email.toLowerCase(),
        passwordHash,
        input.firstName,
        input.lastName,
        input.phone ?? null,
        organizationId,
        input.branchId ?? null,
      ],
    );
    const role = await client.query(`SELECT id FROM roles WHERE name = $1`, [input.role]);
    if (!role.rows[0]) throw new NotFoundError('Role');
    await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
      user.rows[0].id,
      role.rows[0].id,
    ]);
    if (input.role === 'student') {
      await client.query(`INSERT INTO students (user_id, organization_id) VALUES ($1, $2)`, [
        user.rows[0].id,
        organizationId,
      ]);
    }
    if (input.role === 'teacher') {
      await client.query(`INSERT INTO teachers (user_id, organization_id) VALUES ($1, $2)`, [
        user.rows[0].id,
        organizationId,
      ]);
    }
    return { ...user.rows[0], roles: [input.role] };
  });
}

export async function assignRole(
  userId: string,
  roleName: string,
  organizationId: string,
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  if (!isSuperAdmin && requesterOrgId !== organizationId) {
    throw new ForbiddenError('Cannot assign roles for another organization');
  }
  const user = await query(
    `SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [userId, organizationId],
  );
  if (!user.rows[0]) throw new NotFoundError('User');
  const role = await query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
  if (!role.rows[0]) throw new NotFoundError('Role');
  await query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, role.rows[0].id],
  );
  return { message: 'Role assigned' };
}

export async function revokeRole(
  userId: string,
  roleName: string,
  organizationId: string,
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  if (!isSuperAdmin && requesterOrgId !== organizationId) {
    throw new ForbiddenError('Cannot revoke roles for another organization');
  }
  await query(
    `DELETE FROM user_roles ur
     USING roles r, users u
     WHERE ur.role_id = r.id AND ur.user_id = u.id
       AND ur.user_id = $1 AND r.name = $2 AND u.organization_id = $3`,
    [userId, roleName, organizationId],
  );
  return { message: 'Role revoked' };
}

export async function updateUserStatus(
  userId: string,
  status: 'active' | 'inactive' | 'suspended',
  organizationId: string,
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  if (!isSuperAdmin && requesterOrgId !== organizationId) {
    throw new ForbiddenError('Cannot update users for another organization');
  }
  const result = await query(
    `UPDATE users SET status = $2, updated_at = NOW()
     WHERE id = $1 AND organization_id = $3 AND deleted_at IS NULL
     RETURNING id, email, status`,
    [userId, status, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('User');
  return result.rows[0];
}
