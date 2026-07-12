import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import {
  paginationSchema,
  uuidParamSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  createAcademicSessionSchema,
  updateAcademicSessionSchema,
  createAdminUserSchema,
  assignRoleSchema,
  updateUserStatusSchema,
  createNotificationSchema,
  createPaymentSchema,
  updatePaymentStatusSchema,
  upsertSettingSchema,
  listUsersQuerySchema,
  updateBranchSchema,
} from '../validators/schemas.js';
import * as platformController from '../controllers/platform.controller.js';

const branchIdParamSchema = z.object({ branchId: z.string().uuid() });
const userIdParamSchema = z.object({ userId: z.string().uuid() });
const keyParamSchema = z.object({ key: z.string().min(1) });
const testIdParamSchema = z.object({ testId: z.string().uuid() });

const router = Router();

router.use(authenticate);

// Departments
router.get(
  '/branches/:branchId/departments',
  validate(branchIdParamSchema, 'params'),
  validate(paginationSchema, 'query'),
  requireRoles('org_admin', 'super_admin'),
  platformController.listDepartments,
);
router.post(
  '/branches/:branchId/departments',
  validate(branchIdParamSchema, 'params'),
  validate(createDepartmentSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.createDepartment,
);
router.patch(
  '/departments/:id',
  validate(uuidParamSchema, 'params'),
  validate(updateDepartmentSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.updateDepartment,
);
router.delete(
  '/departments/:id',
  validate(uuidParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin'),
  platformController.deleteDepartment,
);

// Branches update/delete
router.patch(
  '/branches/:id',
  validate(uuidParamSchema, 'params'),
  validate(updateBranchSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.updateBranch,
);
router.delete(
  '/branches/:id',
  validate(uuidParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin'),
  platformController.deleteBranch,
);

// Academic sessions
router.get(
  '/academic-sessions',
  validate(paginationSchema, 'query'),
  requireRoles('org_admin', 'super_admin', 'teacher'),
  platformController.listAcademicSessions,
);
router.post(
  '/academic-sessions',
  validate(createAcademicSessionSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.createAcademicSession,
);
router.patch(
  '/academic-sessions/:id',
  validate(uuidParamSchema, 'params'),
  validate(updateAcademicSessionSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.updateAcademicSession,
);
router.delete(
  '/academic-sessions/:id',
  validate(uuidParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin'),
  platformController.deleteAcademicSession,
);

// User admin
router.get(
  '/users',
  validate(listUsersQuerySchema, 'query'),
  requireRoles('org_admin', 'super_admin'),
  platformController.listUsers,
);
router.post(
  '/users',
  validate(createAdminUserSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.createUser,
);
router.post(
  '/users/:userId/roles',
  validate(userIdParamSchema, 'params'),
  validate(assignRoleSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.assignRole,
);
router.delete(
  '/users/:userId/roles',
  validate(userIdParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin'),
  platformController.revokeRole,
);
router.patch(
  '/users/:userId/status',
  validate(userIdParamSchema, 'params'),
  validate(updateUserStatusSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.updateUserStatus,
);

// Notifications
router.get('/notifications', validate(paginationSchema, 'query'), platformController.listNotifications);
router.get('/notifications/unread-count', platformController.getUnreadCount);
router.post(
  '/notifications',
  validate(createNotificationSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.createNotification,
);
router.patch('/notifications/:id/read', validate(uuidParamSchema, 'params'), platformController.markNotificationRead);
router.post('/notifications/read-all', platformController.markAllNotificationsRead);

// Payments
router.get('/payments', validate(paginationSchema, 'query'), platformController.listPayments);
router.get('/payments/wallet', platformController.getWallet);
router.post(
  '/payments',
  validate(createPaymentSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.createPayment,
);
router.patch(
  '/payments/:id/status',
  validate(uuidParamSchema, 'params'),
  validate(updatePaymentStatusSchema),
  requireRoles('org_admin', 'super_admin'),
  platformController.updatePaymentStatus,
);

// Settings
router.get('/settings', platformController.getSettings);
router.put('/settings', validate(upsertSettingSchema), requireRoles('org_admin', 'super_admin'), platformController.upsertSetting);
router.delete(
  '/settings/:key',
  validate(keyParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin'),
  platformController.deleteSetting,
);

// Audit & activity
router.get(
  '/audit-logs',
  validate(paginationSchema, 'query'),
  requireRoles('org_admin', 'super_admin'),
  platformController.listAuditLogs,
);
router.get('/activity-logs', validate(paginationSchema, 'query'), platformController.listActivityLogs);

// Reports
router.get('/reports/overview', requireRoles('org_admin', 'super_admin', 'teacher'), platformController.getOrgOverviewReport);
router.get(
  '/reports/tests/:testId',
  validate(testIdParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin', 'teacher'),
  platformController.getTestReport,
);
router.get(
  '/reports/tests/:testId/export',
  validate(testIdParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin', 'teacher'),
  platformController.exportTestReport,
);
router.post(
  '/reports/tests/:testId/compute-ranks',
  validate(testIdParamSchema, 'params'),
  requireRoles('org_admin', 'super_admin', 'teacher'),
  platformController.computeRanks,
);

export default router;
