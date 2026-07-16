import { Request, Response, NextFunction } from 'express';
import { vQuery, vParams } from '../middleware/validate.js';
import { ForbiddenError } from '../utils/errors.js';
import * as orgService from '../services/organization.service.js';
import { notifyOrganizationOfSuperAdminAction } from '../services/email.service.js';

function assertCanAccessOrg(req: Request, targetOrgId: string) {
  const isSuperAdmin = req.user!.roles.includes('super_admin');
  if (isSuperAdmin) return;
  if (req.user!.organizationId !== targetOrgId) {
    throw new ForbiddenError('Cannot access another organization');
  }
}

function actorName(req: Request): string {
  return req.user!.email;
}

function fireOrgMail(
  payload: Parameters<typeof notifyOrganizationOfSuperAdminAction>[0],
): void {
  void notifyOrganizationOfSuperAdminAction(payload).catch((err) => {
    console.error('[email] org notification failed:', err);
  });
}

export async function createOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const org = await orgService.createOrganization(req.body);
    const contactEmail =
      typeof req.body.contactEmail === 'string' ? req.body.contactEmail : undefined;

    if (req.user!.roles.includes('super_admin')) {
      fireOrgMail({
        organizationId: org.id as string,
        orgName: org.name as string,
        action: org.is_active ? 'approved' : 'created',
        message: org.is_active
          ? 'Your organization has been created and approved on the platform. You can log in and start managing departments, faculty and exams.'
          : 'Your organization has been registered and is pending Super Admin approval. You will receive another email once access is approved.',
        actorName: actorName(req),
        extraEmails: contactEmail ? [contactEmail] : undefined,
      });
    }

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
    const before = await orgService.getOrganizationById(id);
    const org = await orgService.updateOrganization(id, req.body);

    if (req.user!.roles.includes('super_admin')) {
      const becameActive = !before.is_active && org.is_active;
      const becameInactive = before.is_active && org.is_active === false;
      const action = becameActive
        ? 'approved'
        : becameInactive
          ? 'deactivated'
          : 'updated';
      const message = becameActive
        ? 'Your organization access has been approved. Pending users are now active — you can log in and manage your academy.'
        : becameInactive
          ? 'Your organization has been deactivated by Super Admin. Contact support if this is unexpected.'
          : 'Your organization details were updated by Super Admin on the platform.';

      fireOrgMail({
        organizationId: id,
        orgName: (org.name as string) || (before.name as string),
        action,
        message,
        actorName: actorName(req),
      });
    }

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

    fireOrgMail({
      organizationId: id,
      orgName: org.name as string,
      action: 'approved',
      message:
        'Congratulations! Your organization has been approved by Super Admin. You and your pending users can now access the platform.',
      actorName: actorName(req),
    });

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
    const before = await orgService.getOrganizationById(id);
    const result = await orgService.deleteOrganization(id);

    fireOrgMail({
      organizationId: id,
      orgName: before.name as string,
      action: 'deleted',
      message:
        'Your organization has been removed from the platform by Super Admin. If you believe this is a mistake, contact support immediately.',
      actorName: actorName(req),
    });

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
