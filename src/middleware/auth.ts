import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/security.js';
import { query } from '../config/database.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

async function loadUserPermissions(userId: string): Promise<{
  roles: string[];
  permissions: string[];
  branchId: string | null;
}> {
  const rolesResult = await query<{ name: string }>(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId],
  );

  const roles = rolesResult.rows.map((r) => r.name);

  if (roles.length === 0) {
    return { roles, permissions: [], branchId: null };
  }

  const permsResult = await query<{ resource: string; action: string }>(
    `SELECT DISTINCT p.resource, p.action
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1`,
    [userId],
  );

  const branchResult = await query<{ branch_id: string | null }>(
    `SELECT branch_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );

  return {
    roles,
    permissions: permsResult.rows.map((p) => `${p.resource}:${p.action}`),
    branchId: branchResult.rows[0]?.branch_id ?? null,
  };
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    const userResult = await query<{
      id: string;
      email: string;
      organization_id: string | null;
      status: string;
    }>(
      `SELECT id, email, organization_id, status
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub],
    );

    const user = userResult.rows[0];
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Account is inactive or not found');
    }

    const { roles, permissions, branchId } = await loadUserPermissions(user.id);

    req.user = {
      id: user.id,
      email: user.email,
      organizationId: user.organization_id,
      branchId,
      roles,
      permissions,
    };

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
      return;
    }
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  authenticate(req, _res, next).catch(next);
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    const hasRole = allowedRoles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) {
      next(new ForbiddenError('Insufficient role privileges'));
      return;
    }
    next();
  };
}

export function requirePermission(resource: string, action: string) {
  const permission = `${resource}:${action}`;
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (
      req.user.roles.includes('super_admin') ||
      req.user.permissions.includes(permission) ||
      req.user.permissions.includes(`${resource}:manage`)
    ) {
      next();
      return;
    }
    next(new ForbiddenError(`Missing permission: ${permission}`));
  };
}
