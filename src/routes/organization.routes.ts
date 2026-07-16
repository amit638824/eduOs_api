import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authenticate, requirePermission, requireRoles } from '../middleware/auth.js';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  createBranchSchema,
  paginationSchema,
  uuidParamSchema,
} from '../validators/schemas.js';
import * as orgController from '../controllers/organization.controller.js';

const orgIdParamSchema = z.object({ orgId: z.string().uuid() });

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireRoles('super_admin'),
  validate(createOrganizationSchema),
  orgController.createOrganization,
);

router.get(
  '/',
  requirePermission('organization', 'read'),
  validate(paginationSchema, 'query'),
  orgController.listOrganizations,
);

router.get(
  '/branches/:id',
  validate(uuidParamSchema, 'params'),
  requirePermission('branch', 'read'),
  orgController.getBranch,
);

router.post(
  '/:orgId/branches',
  validate(orgIdParamSchema, 'params'),
  validate(createBranchSchema),
  requirePermission('branch', 'create'),
  orgController.createBranch,
);

router.get(
  '/:orgId/branches',
  validate(orgIdParamSchema, 'params'),
  validate(paginationSchema, 'query'),
  requirePermission('branch', 'read'),
  orgController.listBranches,
);

router.get(
  '/:id',
  validate(uuidParamSchema, 'params'),
  requirePermission('organization', 'read'),
  orgController.getOrganization,
);

router.patch(
  '/:id',
  validate(uuidParamSchema, 'params'),
  validate(updateOrganizationSchema),
  requirePermission('organization', 'update'),
  orgController.updateOrganization,
);

router.post(
  '/:id/verify',
  validate(uuidParamSchema, 'params'),
  requireRoles('super_admin'),
  requirePermission('organization', 'verify'),
  orgController.verifyOrganization,
);

router.delete(
  '/:id',
  validate(uuidParamSchema, 'params'),
  requireRoles('super_admin'),
  requirePermission('organization', 'delete'),
  orgController.deleteOrganization,
);

export default router;
