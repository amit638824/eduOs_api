import { query, withTransaction } from '../config/database.js';
import { hashPassword } from '../utils/security.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

const ALLOWED_ASSIGN_ROLES = new Set(['student', 'teacher', 'org_admin']);

async function assertBranchInOrg(branchId: string | undefined, organizationId: string) {
  if (!branchId) return;
  const branch = await query<{ organization_id: string }>(
    `SELECT organization_id FROM branches WHERE id = $1 AND deleted_at IS NULL`,
    [branchId],
  );
  if (!branch.rows[0] || branch.rows[0].organization_id !== organizationId) {
    throw new ForbiddenError('Branch does not belong to the selected organization');
  }
}

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
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status, u.branch_id, u.created_at,
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

export async function getUser(userId: string, organizationId: string) {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status, u.branch_id, u.created_at,
            COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1 AND u.organization_id = $2 AND u.deleted_at IS NULL
     GROUP BY u.id`,
    [userId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('User');
  return result.rows[0];
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
) {
  await assertBranchInOrg(input.branchId, organizationId);
  const existing = await query(`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, [
    input.email.toLowerCase(),
  ]);
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
      await client.query(
        `INSERT INTO students (user_id, organization_id, branch_id) VALUES ($1, $2, $3)`,
        [user.rows[0].id, organizationId, input.branchId ?? null],
      );
    }
    if (input.role === 'teacher') {
      await client.query(
        `INSERT INTO teachers (user_id, organization_id, branch_id) VALUES ($1, $2, $3)`,
        [user.rows[0].id, organizationId, input.branchId ?? null],
      );
    }
    return { ...user.rows[0], roles: [input.role] };
  });
}

export async function updateUser(
  userId: string,
  organizationId: string,
  input: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    branchId?: string | null;
    role?: 'student' | 'teacher' | 'org_admin';
  },
) {
  if (input.branchId) await assertBranchInOrg(input.branchId, organizationId);

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [userId, organizationId],
    );
    if (!existing.rows[0]) throw new NotFoundError('User');

    const result = await client.query(
      `UPDATE users SET
         first_name = COALESCE($3, first_name),
         last_name = COALESCE($4, last_name),
         phone = COALESCE($5, phone),
         branch_id = COALESCE($6, branch_id),
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name, phone, status, branch_id`,
      [
        userId,
        organizationId,
        input.firstName ?? null,
        input.lastName ?? null,
        input.phone ?? null,
        input.branchId === undefined ? null : input.branchId,
      ],
    );

    if (input.role) {
      if (!ALLOWED_ASSIGN_ROLES.has(input.role)) {
        throw new ForbiddenError('Cannot assign this role');
      }
      const role = await client.query(`SELECT id FROM roles WHERE name = $1`, [input.role]);
      if (!role.rows[0]) throw new NotFoundError('Role');
      await client.query(
        `DELETE FROM user_roles ur USING roles r
         WHERE ur.role_id = r.id AND ur.user_id = $1
           AND r.name IN ('student', 'teacher', 'org_admin')`,
        [userId],
      );
      await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
        userId,
        role.rows[0].id,
      ]);

      if (input.role === 'student') {
        await client.query(
          `INSERT INTO students (user_id, organization_id, branch_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE SET branch_id = EXCLUDED.branch_id`,
          [userId, organizationId, input.branchId ?? null],
        );
      }
      if (input.role === 'teacher') {
        await client.query(
          `INSERT INTO teachers (user_id, organization_id, branch_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE SET branch_id = EXCLUDED.branch_id`,
          [userId, organizationId, input.branchId ?? null],
        );
      }
    }

    return result.rows[0];
  });
}

export async function softDeleteUser(userId: string, organizationId: string) {
  const result = await query(
    `UPDATE users SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
     RETURNING id, email`,
    [userId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('User');
  return { message: 'User deleted', ...result.rows[0] };
}

export async function assignRole(userId: string, roleName: string, organizationId: string) {
  if (!ALLOWED_ASSIGN_ROLES.has(roleName)) {
    throw new ForbiddenError('Cannot assign this role');
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

export async function revokeRole(userId: string, roleName: string, organizationId: string) {
  if (!ALLOWED_ASSIGN_ROLES.has(roleName)) {
    throw new ForbiddenError('Cannot revoke this role');
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
) {
  const result = await query(
    `UPDATE users SET status = $2, updated_at = NOW()
     WHERE id = $1 AND organization_id = $3 AND deleted_at IS NULL
     RETURNING id, email, status`,
    [userId, status, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('User');
  return result.rows[0];
}
