import { Request, Response, NextFunction } from 'express';
import { vQuery, vParams } from '../middleware/validate.js';
import { ForbiddenError } from '../utils/errors.js';
import { asJsonObject } from '../utils/json.js';
import * as orgService from '../services/organization.service.js';
import { notifyOrganizationOfSuperAdminAction, sendOrganizationCredentialsEmail } from '../services/email.service.js';
import { OrganizationActionType } from '../templates/emailTemplates.js';

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
    const admin = org.admin;

    if (admin) {
      void sendOrganizationCredentialsEmail({
        to: admin.email,
        orgName: org.name,
        adminName: `${admin.firstName} ${admin.lastName}`.trim(),
        loginEmail: admin.email,
        temporaryPassword: admin.temporaryPassword,
        resetToken: admin.resetToken,
        isApproved: Boolean(org.is_active),
      }).catch((err) => console.error('[email] org credentials failed:', err));
    } else if (req.user!.roles.includes('super_admin')) {
      fireOrgMail({
        organizationId: org.id,
        orgName: org.name,
        action: org.is_active ? 'approved' : 'created',
        message: org.is_active
          ? 'Your organization has been created and approved on the platform.'
          : 'Your organization has been registered and is pending Super Admin approval.',
        actorName: actorName(req),
      });
    }

    // Never return raw password in API response for security — only emailed
    const { admin: _admin, ...safeOrg } = org;
    res.status(201).json({
      success: true,
      data: {
        ...safeOrg,
        adminCreated: Boolean(admin),
        adminEmail: admin?.email ?? null,
        credentialsEmailed: Boolean(admin),
      },
      message: admin
        ? `Organization created. Login details emailed to ${admin.email}.`
        : 'Organization created.',
    });
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
    const { page, limit, search, isActive } = vQuery(req) as unknown as {
      page: number;
      limit: number;
      search?: string;
      isActive?: string | boolean;
    };

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

    const activeFilter =
      isActive === true || isActive === 'true'
        ? true
        : isActive === false || isActive === 'false'
          ? false
          : undefined;
    const result = await orgService.listOrganizations(page, limit, search, activeFilter);
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
      const wasActive = Boolean(before.is_active);
      const isNowActive = Boolean(org.is_active);
      const becameActive = !wasActive && isNowActive;
      const becameInactive = wasActive && !isNowActive;

      const beforeSettings = asJsonObject(before.settings) ?? {};
      const afterSettings = asJsonObject(org.settings) ?? {};
      const extraEmails = [
        beforeSettings.contactEmail,
        afterSettings.contactEmail,
        req.body.contactEmail,
      ].filter((e): e is string => typeof e === 'string' && e.includes('@'));

      if (becameActive || becameInactive) {
        const action: OrganizationActionType = becameActive ? 'reactivated' : 'suspended';
        const orgDisplayName = (org.name as string) || (before.name as string);
        const message = becameActive
          ? `${orgDisplayName} account has been reactivated. All associated administrators, faculty, and student accounts are active again, and you can now log in.`
          : `${orgDisplayName} account has been suspended. Sign-in and access for all associated administrators, faculty and students are temporarily paused. If you believe this is unexpected, please contact support.`;

        fireOrgMail({
          organizationId: id,
          orgName: orgDisplayName,
          action,
          message,
          actorName: actorName(req),
          extraEmails,
        });
      } else if (
        req.body.name !== undefined ||
        req.body.slug !== undefined ||
        req.body.contactEmail !== undefined ||
        req.body.theme !== undefined ||
        req.body.settings !== undefined
      ) {
        fireOrgMail({
          organizationId: id,
          orgName: (org.name as string) || (before.name as string),
          action: 'updated',
          message: 'Your organization details were updated by Super Admin on the platform.',
          actorName: actorName(req),
          extraEmails,
        });
      }
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
    const before = await orgService.getOrganizationById(id);
    const org = await orgService.verifyOrganization(id);

    // Only fire mail if the organization was not already active (avoids duplicate if updateOrganization was called right before)
    if (!before.is_active) {
      const beforeSettings = asJsonObject(before.settings) ?? {};
      const afterSettings = asJsonObject(org.settings) ?? {};
      const extraEmails = [beforeSettings.contactEmail, afterSettings.contactEmail].filter(
        (e): e is string => typeof e === 'string' && e.includes('@'),
      );

      fireOrgMail({
        organizationId: id,
        orgName: org.name as string,
        action: 'reactivated',
        message:
          `${org.name} account has been reactivated. All associated administrators, faculty, and student accounts are active again, and you can now log in.`,
        actorName: actorName(req),
        extraEmails,
      });
    }

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
    const notifyEmails = await orgService.getOrganizationNotifyEmails(id);
    const result = await orgService.deleteOrganization(id);

    fireOrgMail({
      organizationId: id,
      orgName: before.name as string,
      action: 'deleted',
      message:
        'Your organization has been removed from the platform by Super Admin. If you believe this is a mistake, contact support immediately.',
      actorName: actorName(req),
      extraEmails: notifyEmails,
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
