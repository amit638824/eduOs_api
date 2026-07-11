import { Router } from 'express';
import authRoutes from './auth.routes.js';
import organizationRoutes from './organization.routes.js';
import { healthCheck } from '../controllers/health.controller.js';

const router = Router();

router.get('/health', healthCheck);
router.use('/auth', authRoutes);
router.use('/organizations', organizationRoutes);

export default router;
