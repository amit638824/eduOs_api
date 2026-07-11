import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database.js';
import {
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  hashToken,
  generateSecureToken,
  sanitizeUser,
  verifyRefreshToken,
} from '../utils/security.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors.js';

interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  organization_id: string | null;
  status: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  organizationId?: string;
  role: 'student' | 'teacher' | 'org_admin';
}

async function getUserRoles(userId: string, client?: PoolClient): Promise<string[]> {
  const q = client ? client.query.bind(client) : query;
  const result = await q<{ name: string }>(
    `SELECT r.name FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId],
  );
  return result.rows.map((r) => r.name);
}

async function createRefreshTokenRecord(
  userId: string,
  deviceInfo: Record<string, unknown>,
  ipAddress: string | undefined,
  client?: PoolClient,
): Promise<{ token: string; tokenId: string }> {
  const tokenId = generateSecureToken(16);
  const refreshToken = signRefreshToken(userId, tokenId);
  const tokenHash = hashToken(refreshToken);

  const q = client ? client.query.bind(client) : query;
  await q(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
    [tokenId, userId, tokenHash, JSON.stringify(deviceInfo), ipAddress ?? null],
  );

  return { token: refreshToken, tokenId };
}

async function buildAuthResponse(
  user: DbUser,
  deviceInfo: Record<string, unknown>,
  ipAddress?: string,
  client?: PoolClient,
): Promise<{ user: Record<string, unknown>; tokens: AuthTokens }> {
  const roles = await getUserRoles(user.id, client);
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    organizationId: user.organization_id,
    roles,
  });

  const { token: refreshToken } = await createRefreshTokenRecord(
    user.id,
    deviceInfo,
    ipAddress,
    client,
  );

  return {
    user: sanitizeUser({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      organizationId: user.organization_id,
      status: user.status,
      roles,
    }),
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: '15m',
    },
  };
}

export async function registerUser(
  input: RegisterInput,
  deviceInfo: Record<string, unknown>,
  ipAddress?: string,
) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.rowCount) {
    throw new ConflictError('Email already registered');
  }

  if (input.organizationId) {
    const org = await query('SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL', [
      input.organizationId,
    ]);
    if (!org.rowCount) {
      throw new NotFoundError('Organization');
    }
  }

  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (client) => {
    const userResult = await client.query<DbUser>(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, organization_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', FALSE)
       RETURNING id, email, password_hash, first_name, last_name, organization_id, status`,
      [
        input.email,
        passwordHash,
        input.firstName,
        input.lastName,
        input.phone ?? null,
        input.organizationId ?? null,
      ],
    );

    const user = userResult.rows[0];

    const roleResult = await client.query<{ id: string }>(
      'SELECT id FROM roles WHERE name = $1',
      [input.role],
    );
    if (!roleResult.rows[0]) {
      throw new NotFoundError('Role');
    }

    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [user.id, roleResult.rows[0].id],
    );

    if (input.role === 'student' && input.organizationId) {
      await client.query(
        `INSERT INTO students (user_id, organization_id) VALUES ($1, $2)`,
        [user.id, input.organizationId],
      );
    }

    if (input.role === 'teacher' && input.organizationId) {
      await client.query(
        `INSERT INTO teachers (user_id, organization_id) VALUES ($1, $2)`,
        [user.id, input.organizationId],
      );
    }

    return buildAuthResponse(user, deviceInfo, ipAddress, client);
  });
}

export async function loginUser(
  email: string,
  password: string,
  deviceInfo: Record<string, unknown>,
  ipAddress?: string,
) {
  const result = await query<DbUser>(
    `SELECT id, email, password_hash, first_name, last_name, organization_id, status
     FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );

  const user = result.rows[0];
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.status !== 'active') {
    throw new UnauthorizedError('Account is not active');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  return buildAuthResponse(user, deviceInfo, ipAddress);
}

export async function refreshAccessToken(
  refreshToken: string,
  deviceInfo: Record<string, unknown>,
  ipAddress?: string,
) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const tokenResult = await query<{
    id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT id, user_id, expires_at, revoked_at
     FROM refresh_tokens WHERE id = $1 AND token_hash = $2`,
    [payload.tid, tokenHash],
  );

  const stored = tokenResult.rows[0];
  if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.id]);

  const userResult = await query<DbUser>(
    `SELECT id, email, password_hash, first_name, last_name, organization_id, status
     FROM users WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`,
    [stored.user_id],
  );

  const user = userResult.rows[0];
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return buildAuthResponse(user, deviceInfo, ipAddress);
}

export async function logoutUser(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);
    await query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND token_hash = $2',
      [payload.tid, tokenHash],
    );
  } catch {
    // Silently ignore invalid tokens on logout
  }
}

export async function getUserProfile(userId: string) {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.organization_id,
            u.branch_id, u.status, u.email_verified, u.mfa_enabled, u.last_login_at, u.created_at
     FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('User');
  }

  const roles = await getUserRoles(userId);
  return { ...result.rows[0], roles };
}
