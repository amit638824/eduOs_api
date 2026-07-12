import { Router } from 'express';
import authRoutes from './auth.routes.js';
import organizationRoutes from './organization.routes.js';
import examinationRoutes from './examination.routes.js';
import userRoutes from './user.routes.js';
import platformRoutes from './platform.routes.js';
import { healthCheck } from '../controllers/health.controller.js';

const router = Router();

router.get('/health', healthCheck);
router.use('/auth', authRoutes);
router.use('/organizations', organizationRoutes);
router.use('/examination', examinationRoutes);
router.use('/users', userRoutes);
router.use('/platform', platformRoutes);

export default router;
