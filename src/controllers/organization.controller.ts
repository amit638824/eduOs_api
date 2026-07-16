import { Request, Response, NextFunction } from 'express';
import { vQuery, vParams } from '../middleware/validate.js';
import { ForbiddenError } from '../utils/errors.js';
import * as orgService from '../services/organization.service.js';

function assertCanAccessOrg(req: Request, targetOrgId: string) {
  const isSuperAdmin = req.user!.roles.includes('super_admin');
  if (isSuperAdmin) return;
  if (req.user!.organizationId !== targetOrgId) {
    throw new ForbiddenError('Cannot access another organization');
  }
}

export async function createOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const org = await orgService.createOrganization(req.body);
    res.status(201).json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
}

export async function listOrganizations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const isSuperAdmin = req.user!.roles.includes('super_admin');
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };

    if (!isSuperAdmin) {
      const orgId = req.user!.organizationId;
      if (!orgId) throw new ForbiddenError('Organization context required');
      const org = await orgService.getOrganizationById(orgId);
      res.json({
        success: true,
        data: [org],
        pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
      });
      return;
    }

    const result = await orgService.listOrganizations(page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = vParams(req) as { id: string };
    assertCanAccessOrg(req, id);
    const org = await orgService.getOrganizationById(id);
    res.json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
}

export async function updateOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = vParams(req) as { id: string };
    assertCanAccessOrg(req, id);
    const org = await orgService.updateOrganization(id, req.body);
    res.json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
}

export async function verifyOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = vParams(req) as { id: string };
    const org = await orgService.verifyOrganization(id);
    res.json({ success: true, data: org, message: 'Organization approved' });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = vParams(req) as { id: string };
    const result = await orgService.deleteOrganization(id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createBranch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = vParams(req) as { orgId: string };
    const isSuperAdmin = req.user!.roles.includes('super_admin');
    const branch = await orgService.createBranch(
      orgId,
      req.body,
      req.user!.organizationId,
      isSuperAdmin,
    );
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
}

export async function listBranches(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = vParams(req) as { orgId: string };
    assertCanAccessOrg(req, orgId);
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const result = await orgService.listBranches(orgId, page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getBranch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = vParams(req) as { id: string };
    const branch = await orgService.getBranchById(id);
    const isSuperAdmin = req.user!.roles.includes('super_admin');
    if (!isSuperAdmin && branch.organization_id !== req.user!.organizationId) {
      throw new ForbiddenError('Cannot access another organization');
    }
    res.json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
}
