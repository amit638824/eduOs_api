import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { updateProfileSchema } from '../validators/schemas.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();
router.use(authenticate);
router.patch('/me', validate(updateProfileSchema), userController.updateProfile);

export default router;
