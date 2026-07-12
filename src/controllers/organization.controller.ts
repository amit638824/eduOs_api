import { Request, Response, NextFunction } from 'express';
import { vQuery, vParams } from '../middleware/validate.js';
import * as orgService from '../services/organization.service.js';

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
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
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
    const org = await orgService.updateOrganization(id, req.body);
    res.json({ success: true, data: org });
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
    res.json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
}
