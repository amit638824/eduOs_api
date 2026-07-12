import { Request, Response, NextFunction } from 'express';
import { vQuery, vParams } from '../middleware/validate.js';
import * as deptService from '../services/department.service.js';
import * as sessionService from '../services/academicSession.service.js';
import * as adminUserService from '../services/adminUser.service.js';
import * as notificationService from '../services/notification.service.js';
import * as paymentService from '../services/payment.service.js';
import * as settingsService from '../services/settings.service.js';
import * as auditService from '../services/audit.service.js';
import * as reportService from '../services/report.service.js';
import * as orgService from '../services/organization.service.js';
import { requireOrgId, resolveOrganizationId } from '../utils/orgAccess.js';

async function orgContext(req: Request) {
  const isSuperAdmin = req.user!.roles.includes('super_admin');
  const orgId = await resolveOrganizationId(req.user!.organizationId, isSuperAdmin);
  return {
    orgId,
    isSuperAdmin,
    requesterOrgId: req.user!.organizationId,
    userId: req.user!.id,
  };
}

export async function listDepartments(req: Request, res: Response, next: NextFunction) {
  try {
    const { branchId } = vParams(req) as { branchId: string };
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    await orgService.getBranchById(branchId);
    if (!isSuperAdmin) {
      const branch = await orgService.getBranchById(branchId);
      requireOrgId(branch.organization_id === requesterOrgId ? requesterOrgId : null);
    }
    const result = await deptService.listDepartments(branchId, page, limit);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function createDepartment(req: Request, res: Response, next: NextFunction) {
  try {
    const { branchId } = vParams(req) as { branchId: string };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    const dept = await deptService.createDepartment(branchId, req.body, requesterOrgId, isSuperAdmin);
    res.status(201).json({ success: true, data: dept });
  } catch (e) {
    next(e);
  }
}

export async function updateDepartment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    const dept = await deptService.updateDepartment(id, req.body, requesterOrgId, isSuperAdmin);
    res.json({ success: true, data: dept });
  } catch (e) {
    next(e);
  }
}

export async function deleteDepartment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    const result = await deptService.deleteDepartment(id, requesterOrgId, isSuperAdmin);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function listAcademicSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const result = await sessionService.listAcademicSessions(orgId, page, limit);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function createAcademicSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const session = await sessionService.createAcademicSession(
      orgId,
      req.body,
      requesterOrgId,
      isSuperAdmin,
    );
    res.status(201).json({ success: true, data: session });
  } catch (e) {
    next(e);
  }
}

export async function updateAcademicSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    const session = await sessionService.updateAcademicSession(
      id,
      req.body,
      requesterOrgId,
      isSuperAdmin,
    );
    res.json({ success: true, data: session });
  } catch (e) {
    next(e);
  }
}

export async function deleteAcademicSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    const result = await sessionService.deleteAcademicSession(id, requesterOrgId, isSuperAdmin);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { page, limit, role, search } = vQuery(req) as unknown as {
      page: number;
      limit: number;
      role?: string;
      search?: string;
    };
    const result = await adminUserService.listUsers(orgId, page, limit, { role, search });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const user = await adminUserService.createUser(orgId, req.body, requesterOrgId, isSuperAdmin);
    res.status(201).json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
}

export async function assignRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = vParams(req) as { userId: string };
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const result = await adminUserService.assignRole(
      userId,
      req.body.role,
      orgId,
      requesterOrgId,
      isSuperAdmin,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function revokeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = vParams(req) as { userId: string };
    const { role } = vQuery(req) as { role: string };
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const result = await adminUserService.revokeRole(
      userId,
      role,
      orgId,
      requesterOrgId,
      isSuperAdmin,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function updateUserStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = vParams(req) as { userId: string };
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const user = await adminUserService.updateUserStatus(
      userId,
      req.body.status,
      orgId,
      requesterOrgId,
      isSuperAdmin,
    );
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
}

export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = await orgContext(req);
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const result = await notificationService.listNotifications(userId, page, limit);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function createNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const notification = await notificationService.createNotification(req.body);
    res.status(201).json({ success: true, data: notification });
  } catch (e) {
    next(e);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { userId } = await orgContext(req);
    const result = await notificationService.markNotificationRead(userId, id);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = await orgContext(req);
    const result = await notificationService.markAllNotificationsRead(userId);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = await orgContext(req);
    const result = await notificationService.getUnreadCount(userId);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const isAdmin = req.user!.roles.some((r) =>
      ['org_admin', 'super_admin'].includes(r),
    );
    const result = await paymentService.listPayments(
      orgId,
      page,
      limit,
      isAdmin ? undefined : userId,
    );
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function createPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const payment = await paymentService.createPayment(
      orgId,
      req.body,
      requesterOrgId,
      isSuperAdmin,
    );
    res.status(201).json({ success: true, data: payment });
  } catch (e) {
    next(e);
  }
}

export async function updatePaymentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { orgId } = await orgContext(req);
    const payment = await paymentService.updatePaymentStatus(
      id,
      req.body.status,
      orgId,
      req.body.gatewayRef,
    );
    res.json({ success: true, data: payment });
  } catch (e) {
    next(e);
  }
}

export async function getWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const wallet = await paymentService.getWalletSummary(userId, orgId);
    res.json({ success: true, data: wallet });
  } catch (e) {
    next(e);
  }
}

export async function getPaymentConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    const config = await paymentService.getPaymentConfig();
    res.json({ success: true, data: config });
  } catch (e) {
    next(e);
  }
}

export async function createRazorpayOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const order = await paymentService.createRazorpayOrder(
      orgId,
      userId,
      req.body.amount,
      req.user!.email,
    );
    res.status(201).json({ success: true, data: order });
  } catch (e) {
    next(e);
  }
}

export async function verifyRazorpayPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const payment = await paymentService.verifyRazorpayPayment(orgId, userId, req.body);
    res.json({ success: true, data: payment });
  } catch (e) {
    next(e);
  }
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const keys = typeof vQuery<Record<string, string>>(req).keys === 'string'
      ? vQuery<Record<string, string>>(req).keys.split(',')
      : undefined;
    const settings = await settingsService.getSettings(orgId, keys);
    res.json({ success: true, data: settings });
  } catch (e) {
    next(e);
  }
}

export async function upsertSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const setting = await settingsService.upsertSetting(
      orgId,
      req.body.key,
      req.body.value,
      requesterOrgId,
      isSuperAdmin,
    );
    res.json({ success: true, data: setting });
  } catch (e) {
    next(e);
  }
}

export async function deleteSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const { key } = vParams(req) as { key: string };
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const result = await settingsService.deleteSetting(orgId, key, requesterOrgId, isSuperAdmin);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, isSuperAdmin, requesterOrgId } = await orgContext(req);
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const result = await auditService.listAuditLogs(
      orgId,
      page,
      limit,
      isSuperAdmin,
      requesterOrgId,
    );
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function listActivityLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = await orgContext(req);
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const result = await auditService.listActivityLogs(userId, page, limit);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function getTestReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { testId } = vParams(req) as { testId: string };
    const { orgId } = await orgContext(req);
    const report = await reportService.getTestReport(testId, orgId);
    res.json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
}

export async function exportTestReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { testId } = vParams(req) as { testId: string };
    const { orgId } = await orgContext(req);
    const csv = await reportService.exportTestReportCsv(testId, orgId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="test-report-${testId}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
}

export async function computeRanks(req: Request, res: Response, next: NextFunction) {
  try {
    const { testId } = vParams(req) as { testId: string };
    const { orgId } = await orgContext(req);
    const result = await reportService.computeRanksForTest(testId, orgId);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function getOrgOverviewReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const report = await reportService.getOrgOverviewReport(orgId);
    res.json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
}

export async function updateBranch(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    const branch = await orgService.updateBranch(id, req.body, requesterOrgId, isSuperAdmin);
    res.json({ success: true, data: branch });
  } catch (e) {
    next(e);
  }
}

export async function deleteBranch(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = vParams(req) as { id: string };
    const { isSuperAdmin, requesterOrgId } = await orgContext(req);
    const result = await orgService.deleteBranch(id, requesterOrgId, isSuperAdmin);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}
